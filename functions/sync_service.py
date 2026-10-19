"""Refresh each league independently; never replace a valid snapshot with an error."""
import logging
from datetime import datetime, timezone

from espn_adapter import fetch_league, fetch_nfl_games, now_iso
from history_archive import retain_finished_scores
from league_config import LEAGUES
from live_timeline import fold_live


def _saved_projection(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


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


def _record_live(store, summary, games_for, cache):
    latest = getattr(store, "latest_live", None)
    publish = getattr(store, "publish_live", None)
    if latest is None or publish is None:
        return
    week = summary.get("week")
    slug = summary.get("slug")
    if isinstance(week, bool) or not isinstance(week, int) or not isinstance(slug, str):
        return
    if week not in cache:
        try:
            cache[week] = games_for(week)
        except Exception as error:
            logging.error("JFFL scoreboard unavailable (%s)", type(error).__name__)
            cache[week] = None
    folded = fold_live(latest(slug), summary, cache[week], datetime.now(timezone.utc))
    if folded:
        publish(slug, folded)


def sync_leagues(store, fetch=fetch_league, games_for=None):
    provider = games_for or fetch_nfl_games
    cache = {}
    outcomes = {}
    for slug in LEAGUES:
        try:
            summary, roster = fetch(slug)
            previous = store.latest(slug)
            retain_projections(previous, summary)
            retain_finished_scores(previous, summary)
            store.publish(slug, summary, roster)
            try:
                store.fold_history(summary)
            except Exception as history_error:
                logging.error("JFFL history archive unavailable for %s (%s)", slug, type(history_error).__name__)
            try:
                _record_live(store, summary, provider, cache)
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
    return outcomes
