"""Refresh each league independently; never replace a valid snapshot with an error."""
import copy
import logging
from datetime import datetime, timezone

from cadence import decide, next_slate, stamp
from espn_adapter import fetch_league, fetch_live_scores, fetch_nfl_games, matchup_period_for_week, now_iso, validate_snapshot
from history_archive import retain_finished_scores
from league_config import LEAGUES
from live_timeline import fold_live


def _saved_projection(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


_LOCK_REASONS = {"OUT": "out", "INJURY_RESERVE": "ir"}


def _moment(value):
    if isinstance(value, datetime) and value.tzinfo is not None:
        return value.astimezone(timezone.utc)
    if not isinstance(value, str) or not value:
        return None
    text = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _valid_lock(player):
    locked = player.get("locked") if isinstance(player, dict) else None
    if not isinstance(locked, dict):
        return None
    reason, at = locked.get("reason"), locked.get("at")
    if reason not in ("out", "ir") or _moment(at) is None:
        return None
    return {"reason": reason, "at": at}


def _valid_pre(player):
    raw = player.get("preKickoff") if isinstance(player, dict) else None
    if not isinstance(raw, dict):
        return None
    status, at = raw.get("status"), raw.get("at")
    if not isinstance(status, str) or not status or _moment(at) is None:
        return None
    return {"status": status, "at": at}


def _tracked(player):
    return isinstance(player, dict) and player.get("id") not in (None, "") and player.get("slot") not in (None, "", "BE", "IR")


def _prior_index(previous):
    lineups, players = {}, {}
    rows = previous.get("weeklyLineups") if isinstance(previous, dict) else None
    for lineup in rows or []:
        if not isinstance(lineup, dict):
            continue
        key = (lineup.get("week"), str(lineup.get("teamId")))
        lineups[key] = lineup
        for player in lineup.get("players") or []:
            if isinstance(player, dict) and player.get("id") not in (None, ""):
                players[(lineup.get("week"), str(lineup.get("teamId")), str(player.get("id")))] = player
    return lineups, players


def _observed_starters(roster):
    found = {}
    for player in roster.get("players") or []:
        if not isinstance(player, dict) or player.get("teamId") is None or player.get("id") is None:
            continue
        if player.get("group") != "starter":
            continue
        found[(str(player.get("teamId")), str(player.get("id")))] = {
            "status": player.get("injuryStatus") if isinstance(player.get("injuryStatus"), str) else None,
            "kickoff": player.get("kickoff") if isinstance(player.get("kickoff"), str) else None,
        }
    return found


def _stamp(roster, moment):
    stamp = roster.get("updatedAt")
    if _moment(stamp) is not None:
        return stamp
    if moment is None:
        return None
    return moment.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _decide(player, prior, observed, week, roster_week, moment, stamp):
    """Lock only an OUT or IR status observed while the kickoff was still ahead."""
    lock = _valid_lock(prior)
    if lock:
        player["locked"] = lock
        player.pop("preKickoff", None)
        player.pop("kickoff", None)
        return
    player.pop("locked", None)
    current_week = week == roster_week
    kickoff = observed.get("kickoff") if current_week and isinstance(observed, dict) and isinstance(observed.get("kickoff"), str) else None
    if kickoff is None and isinstance(prior, dict) and isinstance(prior.get("kickoff"), str):
        kickoff = prior.get("kickoff")
    passed = moment is not None and _moment(kickoff) is not None and moment >= _moment(kickoff)
    if passed:
        pre = _valid_pre(prior)
        reason = _LOCK_REASONS.get(pre["status"]) if pre else None
        if reason:
            player["locked"] = {"reason": reason, "at": kickoff}
        player.pop("preKickoff", None)
        player.pop("kickoff", None)
        return
    if current_week and isinstance(observed, dict) and stamp:
        status = observed.get("status")
        player["preKickoff"] = {"status": status if isinstance(status, str) and status else "ACTIVE", "at": stamp}
        if kickoff:
            player["kickoff"] = kickoff
        else:
            player.pop("kickoff", None)
        return
    pre = _valid_pre(prior)
    if pre and isinstance(kickoff, str) and _moment(kickoff) is not None:
        player["preKickoff"] = pre
        player["kickoff"] = kickoff
        return
    player.pop("preKickoff", None)
    player.pop("kickoff", None)


def _with_players(lineup, players):
    kept = {key: value for key, value in lineup.items() if key != "players"}
    kept["players"] = players
    return kept


def retain_lineup_locks(previous, roster, now):
    """Remember whether a starter was OUT or on IR before kickoff, then keep that fact."""
    if not isinstance(roster, dict) or not isinstance(roster.get("weeklyLineups"), list):
        return
    moment = _moment(now)
    observed = _observed_starters(roster)
    prior_lineups, prior_players = _prior_index(previous)
    roster_week = roster.get("week")
    stamp = _stamp(roster, moment)
    seen = set()
    merged = []
    for lineup in roster["weeklyLineups"]:
        if not isinstance(lineup, dict):
            continue
        week, team_id = lineup.get("week"), str(lineup.get("teamId"))
        key = (week, team_id)
        seen.add(key)
        prior = prior_lineups.get(key)
        incoming = [player for player in (lineup.get("players") or []) if _tracked(player)]
        restored = False
        if not incoming and prior:
            incoming = [player for player in (prior.get("players") or []) if _tracked(player)]
            restored = True
        players, seen_players = [], set()
        for raw in incoming:
            kept = dict(raw)
            identity = (week, team_id, str(raw.get("id")))
            _decide(kept, prior_players.get(identity), observed.get((team_id, str(raw.get("id")))), week, roster_week, moment, stamp)
            players.append(kept)
            seen_players.add(str(raw.get("id")))
        if prior and not restored:
            for raw in prior.get("players") or []:
                if not _tracked(raw) or str(raw.get("id")) in seen_players or not _valid_lock(raw):
                    continue
                kept = dict(raw)
                _decide(kept, raw, None, week, roster_week, moment, stamp)
                players.append(kept)
        merged.append(_with_players(lineup, players))
    for key, prior in prior_lineups.items():
        if key in seen:
            continue
        week, team_id = key
        players = []
        for raw in prior.get("players") or []:
            if not _tracked(raw):
                continue
            kept = dict(raw)
            _decide(kept, raw, None, week, roster_week, moment, stamp)
            players.append(kept)
        if players:
            merged.append(_with_players(prior, players))
    merged.sort(key=lambda row: (row.get("week") if isinstance(row.get("week"), int) else 0, str(row.get("teamId"))))
    roster["weeklyLineups"] = merged


def retain_projections(previous, summary):
    """Keep a matchup projection already published once ESPN stops sending it."""
    if not previous or not summary:
        return
    saved = {}
    for row in previous.get("weeklyMatchups") or []:
        saved[(row.get("week"), row.get("homeTeamId"), row.get("awayTeamId"))] = row
    for row in summary.get("weeklyMatchups") or []:
        prior = saved.get((row.get("week"), row.get("homeTeamId"), row.get("awayTeamId")))
        if not prior:
            continue
        for side in ("homeProjected", "awayProjected"):
            if row.get(side) is None and _saved_projection(prior.get(side)) is not None:
                row[side] = prior[side]


def _archive_live(store, document):
    """Keep one document per season, league, and week. A later week never replaces it."""
    archive = getattr(store, "publish_live_week", None)
    if archive is None or not isinstance(document, dict):
        return
    slug, season, week = document.get("slug"), document.get("season"), document.get("week")
    if not isinstance(slug, str) or isinstance(season, bool) or not isinstance(season, int):
        return
    if isinstance(week, bool) or not isinstance(week, int) or not 1 <= week <= 18:
        return
    archive(season, slug, week, document)


def _record_live(store, summary, games_for, cache, now=None):
    latest = getattr(store, "latest_live", None)
    publish = getattr(store, "publish_live", None)
    if latest is None or publish is None:
        return
    week = summary.get("week")
    slug = summary.get("slug")
    season = summary.get("season")
    if isinstance(week, bool) or not isinstance(week, int) or not isinstance(slug, str):
        return
    if week not in cache:
        try:
            cache[week] = games_for(week)
        except Exception as error:
            logging.error("JFFL scoreboard unavailable (%s)", type(error).__name__)
            cache[week] = None
    previous = latest(slug)
    same_league = isinstance(previous, dict) and previous.get("slug") == slug and previous.get("season") == season
    finished = previous.get("week") if same_league else None
    if isinstance(finished, int) and not isinstance(finished, bool) and 1 <= finished < week:
        _archive_live(store, previous)
    folded = fold_live(previous, summary, cache[week], now or datetime.now(timezone.utc))
    if folded:
        publish(slug, folded)
        _archive_live(store, folded)
    elif same_league and finished == week:
        _archive_live(store, previous)


def _picked_games(cache):
    for games in cache.values():
        if isinstance(games, dict):
            return games
    return None


def _clean_periods(found):
    if not isinstance(found, dict):
        return {}
    cleaned = {}
    for key, value in found.items():
        if isinstance(value, int) and not isinstance(value, bool):
            cleaned[str(key)] = value
    return cleaned


def sync_leagues(store, fetch=fetch_league, games_for=None, now=None, meta=None):
    provider = games_for or fetch_nfl_games
    cache = {}
    outcomes = {}
    periods = {}
    moment = now or datetime.now(timezone.utc)
    for slug in LEAGUES:
        try:
            summary, roster = fetch(slug)
            if isinstance(summary, dict):
                found = _clean_periods(summary.pop("_matchupPeriods", None))
                if found:
                    periods[slug] = found
            previous = store.latest(slug)
            previous_roster = store.latest_roster(slug)
            retain_projections(previous, summary)
            retain_finished_scores(previous, summary)
            retain_lineup_locks(previous_roster, roster, moment)
            store.publish(slug, summary, roster)
            try:
                store.fold_history(summary)
            except Exception as history_error:
                logging.error("JFFL history archive unavailable for %s (%s)", slug, type(history_error).__name__)
            try:
                _record_live(store, summary, provider, cache, moment)
            except Exception as live_error:
                logging.error("JFFL live timeline unavailable for %s (%s)", slug, type(live_error).__name__)
            outcomes[slug] = "ok"
            logging.info("JFFL refreshed %s: %s teams, %s players", slug, len(summary["teams"]), len(roster["players"]))
        except Exception as error:
            # Publish no exception text, identity fields, or raw provider responses.
            try:
                store.mark_failed(slug, now_iso())
            except Exception as metadata_error:
                logging.error("JFFL failure status unavailable for %s (%s)", slug, type(metadata_error).__name__)
            outcomes[slug] = "error"
            logging.error("JFFL refresh failed for %s (%s)", slug, type(error).__name__)
    if isinstance(meta, dict):
        picked = _picked_games(cache)
        if picked is not None:
            meta["games"] = picked
        if periods:
            meta["matchupPeriods"] = periods
    return outcomes


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _paint(row, incoming):
    changed = False
    for key in ("homeScore", "awayScore", "homeProjected", "awayProjected"):
        value = _number(incoming.get(key))
        if value is None or row.get(key) == value:
            continue
        row[key] = value
        changed = True
    return changed


def _paint_player(player, incoming, week):
    changed = False
    points = _number(incoming.get("weekPoints"))
    stats = incoming.get("weekStats") if isinstance(incoming.get("weekStats"), dict) and incoming.get("weekStats") else None
    if points is not None and player.get("weekPoints") != points:
        player["weekPoints"] = points
        changed = True
    if stats is not None and player.get("weekStats") != stats:
        player["weekStats"] = stats
        changed = True
    if points is None:
        return changed
    for row in player.get("weeklyStats") or []:
        if not isinstance(row, dict) or row.get("week") != week or row.get("points") == points:
            continue
        row["points"] = points
        if stats is not None:
            row["stats"] = stats
        changed = True
    return changed


def merge_live_snapshot(summary, roster, live, moment):
    """Patch current-week scores onto the last good snapshot. Past weeks stay put.

    A missing incoming score stays null and does not replace a saved number.
    Returns None when this snapshot cannot take the tick.
    """
    if not isinstance(summary, dict) or not isinstance(roster, dict) or not isinstance(live, dict):
        return None
    week = summary.get("week")
    if isinstance(week, bool) or not isinstance(week, int) or live.get("week") != week or roster.get("week") != week:
        return None
    if summary.get("slug") != roster.get("slug"):
        return None
    summary = copy.deepcopy(summary)
    roster = copy.deepcopy(roster)
    incoming = {}
    for row in live.get("matchups") or []:
        if not isinstance(row, dict):
            continue
        home, away = row.get("homeTeamId"), row.get("awayTeamId")
        incoming[(None if home is None else str(home), None if away is None else str(away))] = row
    changed = False
    for row in summary.get("matchups") or []:
        if isinstance(row, dict) and _paint(row, incoming.get((row.get("homeTeamId"), row.get("awayTeamId")), {})):
            changed = True
    for row in summary.get("weeklyMatchups") or []:
        if isinstance(row, dict) and row.get("week") == week and _paint(row, incoming.get((row.get("homeTeamId"), row.get("awayTeamId")), {})):
            changed = True
    players = {}
    for row in live.get("players") or []:
        if isinstance(row, dict) and row.get("teamId") is not None and row.get("id") is not None:
            players[(str(row["teamId"]), str(row["id"]))] = row
    for player in roster.get("players") or []:
        if not isinstance(player, dict):
            continue
        found = players.get((str(player.get("teamId")), str(player.get("id"))))
        if found and _paint_player(player, found, week):
            changed = True
    for lineup in roster.get("weeklyLineups") or []:
        if not isinstance(lineup, dict) or lineup.get("week") != week:
            continue
        team_id = str(lineup.get("teamId"))
        for player in lineup.get("players") or []:
            if not isinstance(player, dict):
                continue
            found = players.get((team_id, str(player.get("id"))))
            points = _number(found.get("weekPoints")) if found else None
            if points is not None and player.get("points") != points:
                player["points"] = points
                changed = True
    if not changed:
        return summary, roster, False
    written = stamp(moment) if isinstance(moment, datetime) else moment
    for document in (summary, roster):
        document["updatedAt"] = written
        document["lastAttemptAt"] = written
        document["refreshStatus"] = "ok"
    validate_snapshot(summary, roster)
    return summary, roster, True


def sync_live(store, fetch=None, games_for=None, now=None, meta=None):
    """Current week and the scoreboard only. A failure leaves the last good snapshot."""
    provider = games_for or fetch_nfl_games
    live_fetch = fetch or fetch_live_scores
    moment = now or datetime.now(timezone.utc)
    slate = store.slate() if callable(getattr(store, "slate", None)) else None
    period_maps = slate.get("matchupPeriods") if isinstance(slate, dict) else {}
    if not isinstance(period_maps, dict):
        period_maps = {}
    cache = {}
    outcomes = {}
    for slug in LEAGUES:
        try:
            previous = store.latest(slug)
            previous_roster = store.latest_roster(slug)
            week = previous.get("week") if isinstance(previous, dict) else None
            if isinstance(week, bool) or not isinstance(week, int) or not isinstance(previous_roster, dict):
                outcomes[slug] = "skip"
                continue
            if previous_roster.get("week") != week:
                outcomes[slug] = "skip"
                continue
            period = matchup_period_for_week(period_maps.get(slug), week)
            merged = merge_live_snapshot(previous, previous_roster, live_fetch(slug, week, period), moment)
            if merged is None:
                outcomes[slug] = "skip"
                continue
            summary, roster, changed = merged
            if changed:
                store.publish(slug, summary, roster)
            try:
                _record_live(store, summary, provider, cache, moment)
            except Exception as live_error:
                logging.error("JFFL live timeline unavailable for %s (%s)", slug, type(live_error).__name__)
            outcomes[slug] = "ok"
        except Exception as error:
            outcomes[slug] = "error"
            logging.error("JFFL live tick failed for %s (%s)", slug, type(error).__name__)
    if isinstance(meta, dict):
        picked = _picked_games(cache)
        if picked is not None:
            meta["games"] = picked
    return outcomes


def _commit_slate(store, moment, kind, outcomes, meta):
    save = getattr(store, "save_slate", None)
    if not callable(save) or not outcomes or all(value == "skip" for value in outcomes.values()):
        return
    ok = any(value == "ok" for value in outcomes.values())
    failed = any(value == "error" for value in outcomes.values()) or not ok
    previous = store.slate() if callable(getattr(store, "slate", None)) else None
    save(next_slate(
        previous, moment,
        advance_full=ok and kind == "full",
        advance_live=ok and kind == "live",
        status="error" if failed else "ok",
        games=meta.get("games") if isinstance(meta, dict) and "games" in meta else None,
        matchup_periods=meta.get("matchupPeriods") if isinstance(meta, dict) else None,
    ))


def perform(store, action, now=None, fetch=None, live_fetch=None, games_for=None):
    moment = now or datetime.now(timezone.utc)
    meta = {}
    if action == "full":
        outcomes = sync_leagues(store, fetch or fetch_league, games_for, moment, meta)
    elif action == "live":
        outcomes = sync_live(store, live_fetch, games_for, moment, meta)
    else:
        return "skip"
    _commit_slate(store, moment, action, outcomes, meta)
    if any(value == "ok" for value in outcomes.values()):
        return action
    if any(value == "error" for value in outcomes.values()):
        return "error"
    return "skip"


def run_scheduled(store, now=None, fetch=None, live_fetch=None, games_for=None):
    moment = now or datetime.now(timezone.utc)
    seen = store.audience_seen() if callable(getattr(store, "audience_seen", None)) else None
    slate = store.slate() if callable(getattr(store, "slate", None)) else None
    action = decide(moment, slate, seen, "scheduler")
    if action == "skip":
        return "skip"
    logging.info("JFFL scheduled %s", action)
    return perform(store, action, moment, fetch, live_fetch, games_for)


def begin_nudge(store, now=None):
    """Record that a tab is open. Returns `live` only when a game tick is due."""
    moment = now or datetime.now(timezone.utc)
    mark = getattr(store, "mark_audience", None)
    if callable(mark):
        try:
            mark(stamp(moment))
        except Exception as error:
            logging.error("JFFL audience unavailable (%s)", type(error).__name__)
    slate = store.slate() if callable(getattr(store, "slate", None)) else None
    return decide(moment, slate, moment, "nudge")


def finish_nudge(store, now=None, live_fetch=None, games_for=None):
    moment = now or datetime.now(timezone.utc)
    slate = store.slate() if callable(getattr(store, "slate", None)) else None
    if decide(moment, slate, moment, "nudge") != "live":
        return "skip"
    logging.info("JFFL nudge live")
    result = perform(store, "live", moment, live_fetch=live_fetch, games_for=games_for)
    return "live" if result == "live" else result


def handle_nudge(store, now=None, live_fetch=None, games_for=None):
    moment = now or datetime.now(timezone.utc)
    if begin_nudge(store, moment) != "live":
        return "skip"
    return finish_nudge(store, moment, live_fetch, games_for)
