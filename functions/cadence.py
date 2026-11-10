"""Decide when a full sync or a live tick is due. No network and no Firestore."""
from datetime import datetime, timedelta, timezone

LIVE_WATCHING = timedelta(seconds=30)
LIVE_IDLE = timedelta(minutes=5)
FULL_SLATE = timedelta(minutes=15)
FULL_QUIET_WATCHING = timedelta(minutes=10)
FULL_QUIET_IDLE = timedelta(minutes=60)
SOON = timedelta(minutes=15)
WATCHING = timedelta(seconds=90)
RETRY = timedelta(minutes=10)


def stamp(moment):
    return moment.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_time(value):
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


def phase(games, now):
    """`live` while a game is on, `soon` within 15 minutes of kickoff, else `quiet`.

    `unknown` means this slate has never been recorded.
    """
    if not isinstance(games, dict):
        return "unknown"
    live = soon = False
    for game in games.values():
        if not isinstance(game, dict):
            continue
        state = game.get("state")
        kickoff = parse_time(game.get("kickoff"))
        if state == "in":
            live = True
        elif state == "pre" and (kickoff is None or kickoff <= now + SOON):
            soon = True
    if live:
        return "live"
    if soon:
        return "soon"
    return "quiet"


def is_watching(last_seen, now):
    seen = parse_time(last_seen)
    if seen is None:
        return False
    age = now - seen
    return timedelta(0) <= age <= WATCHING


def slate_games(games):
    """Keep only the fields the next decision needs."""
    if not isinstance(games, dict):
        return {}
    kept = {}
    for abbr, game in games.items():
        if not isinstance(abbr, str) or not isinstance(game, dict):
            continue
        state = game.get("state")
        if state not in ("pre", "in", "post"):
            continue
        kickoff = game.get("kickoff")
        kept[abbr] = {"state": state, "kickoff": kickoff if isinstance(kickoff, str) else None}
    return kept


def next_slate(previous, now, *, advance_full, advance_live, status, games=None, matchup_periods=None):
    base = dict(previous or {})
    base["lastAttemptAt"] = stamp(now)
    base["lastStatus"] = status
    if advance_full:
        base["lastFullAt"] = base["lastAttemptAt"]
        base["lastLiveAt"] = base["lastAttemptAt"]
    elif advance_live:
        base["lastLiveAt"] = base["lastAttemptAt"]
    if games is not None:
        base["games"] = slate_games(games)
    if matchup_periods:
        base["matchupPeriods"] = matchup_periods
    return base


def _due(last, interval, now):
    return last is None or now - last >= interval


def decide(now, slate, last_seen, source):
    """Return `full`, `live`, or `skip`. A nudge never requests a full sync."""
    if source not in ("scheduler", "nudge"):
        raise ValueError("Unknown refresh source")
    document = slate if isinstance(slate, dict) else {}
    games = document.get("games") if isinstance(slate, dict) and "games" in document else None
    kind = phase(games, now)
    failed = isinstance(slate, dict) and slate.get("lastStatus") == "error"
    watching = is_watching(last_seen, now)
    last_full = parse_time(document.get("lastFullAt"))
    last_live = parse_time(document.get("lastLiveAt"))
    last_attempt = parse_time(document.get("lastAttemptAt"))
    last_scores = max((item for item in (last_full, last_live) if item is not None), default=None)

    if kind in ("live", "soon"):
        full_interval = FULL_SLATE
    elif kind == "quiet" and watching:
        full_interval = FULL_QUIET_WATCHING
    elif kind == "quiet":
        full_interval = FULL_QUIET_IDLE
    else:
        full_interval = timedelta(0)
    if failed:
        full_interval = RETRY if kind == "unknown" else min(full_interval, RETRY)
        full_anchor = last_attempt or last_full
    else:
        full_anchor = last_full
    full_due = _due(full_anchor, full_interval, now)

    if kind in ("live", "soon"):
        live_due = _due(last_scores, LIVE_WATCHING if watching else LIVE_IDLE, now)
    else:
        live_due = False

    if source == "nudge":
        return "live" if live_due else "skip"
    if full_due:
        return "full"
    if live_due:
        return "live"
    return "skip"
