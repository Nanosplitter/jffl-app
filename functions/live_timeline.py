"""Fold per-team score history for the matchday page. A missing score stays null."""
import copy
import json
from datetime import timezone

CAP = 240
LIMIT = 700_000


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value != value or value in (float("inf"), float("-inf")):
        return None
    return round(float(value), 2)


def _stamp(now):
    return now.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _team_samples(summary):
    rows = []
    seen = set()
    for matchup in summary.get("matchups") or []:
        if not isinstance(matchup, dict):
            continue
        for side in ("home", "away"):
            team_id = matchup.get(f"{side}TeamId")
            if not isinstance(team_id, str) or team_id in seen:
                continue
            seen.add(team_id)
            rows.append((team_id, _number(matchup.get(f"{side}Score")), _number(matchup.get(f"{side}Projected"))))
    return rows


def _thin(row, cap):
    count = len(row["t"])
    if count <= cap or cap < 2:
        return
    indexes = []
    for step in range(cap):
        index = round(step * (count - 1) / (cap - 1))
        if not indexes or indexes[-1] != index:
            indexes.append(index)
    if indexes[-1] != count - 1:
        indexes.append(count - 1)
    for key in ("t", "s", "p"):
        row[key] = [row[key][index] for index in indexes]


def _fit(doc, cap):
    while len(json.dumps(doc, allow_nan=False).encode()) > LIMIT and cap > 2:
        cap = max(2, cap // 2)
        for row in doc["series"].values():
            _thin(row, cap)
    if len(json.dumps(doc, allow_nan=False).encode()) > LIMIT:
        raise ValueError("Live snapshot exceeds conservative Firestore document limit")


def _usable_series(previous, slug, season, week):
    if not isinstance(previous, dict):
        return None
    if previous.get("schemaVersion") != 1 or previous.get("slug") != slug:
        return None
    if previous.get("season") != season or previous.get("week") != week:
        return None
    series = previous.get("series")
    return series if isinstance(series, dict) else None


def _merge_games(previous, games, stamp):
    merged = {}
    prior = previous if isinstance(previous, dict) else {}
    for abbr, game in games.items():
        if not isinstance(abbr, str) or not isinstance(game, dict):
            continue
        state = game.get("state")
        if state not in ("pre", "in", "post"):
            continue
        progress = game.get("progress")
        if isinstance(progress, bool) or not isinstance(progress, (int, float)):
            progress = 0
        row = {
            "kickoff": game.get("kickoff") if isinstance(game.get("kickoff"), str) else None,
            "state": state,
            "detail": game.get("detail") if isinstance(game.get("detail"), str) else "",
            "progress": round(min(1, max(0, float(progress))), 4),
        }
        opponent = game.get("opponent")
        if isinstance(opponent, str):
            row["opponent"] = opponent
        ended = prior.get(abbr, {}).get("endedAt") if isinstance(prior.get(abbr), dict) else None
        if state == "post":
            row["endedAt"] = ended if isinstance(ended, str) else stamp
        merged[abbr] = row
    return merged


def _same_games(left, right):
    return json.dumps(left, sort_keys=True, allow_nan=False) == json.dumps(right, sort_keys=True, allow_nan=False)


def fold_live(previous, summary, games, now, cap=CAP):
    """Append changed scores. Reset on a new week. Return None when nothing changed.

    `games` is None when the scoreboard read failed, which keeps the last good slate.
    """
    if not isinstance(summary, dict) or cap < 2:
        return None
    slug, season, week = summary.get("slug"), summary.get("season"), summary.get("week")
    if not isinstance(slug, str) or isinstance(season, bool) or not isinstance(season, int):
        return None
    if isinstance(week, bool) or not isinstance(week, int):
        return None
    stamp = _stamp(now)
    epoch = int(now.timestamp())
    kept = _usable_series(previous, slug, season, week)
    series = copy.deepcopy(kept) if kept else {}
    prior_games = previous.get("games") if kept and isinstance(previous.get("games"), dict) else {}
    if games is None:
        stored_games = copy.deepcopy(prior_games)
        games_at = previous.get("gamesUpdatedAt") if kept else None
        if games_at is not None and not isinstance(games_at, str):
            games_at = None
    else:
        stored_games = _merge_games(prior_games, games, stamp)
        games_at = stamp
    changed = kept is None or not _same_games(prior_games, stored_games)
    for team_id, score, projected in _team_samples(summary):
        row = series.get(team_id)
        if not isinstance(row, dict) or not all(isinstance(row.get(key), list) for key in ("t", "s", "p")):
            series[team_id] = {"t": [epoch], "s": [score], "p": [projected]}
            changed = True
            continue
        if not (len(row["t"]) == len(row["s"]) == len(row["p"])):
            series[team_id] = {"t": [epoch], "s": [score], "p": [projected]}
            changed = True
            continue
        if row["t"] and row["s"][-1] == score and row["p"][-1] == projected:
            continue
        row["t"].append(epoch)
        row["s"].append(score)
        row["p"].append(projected)
        _thin(row, cap)
        changed = True
    if not changed:
        return None
    doc = {
        "schemaVersion": 1,
        "slug": slug,
        "season": season,
        "week": week,
        "updatedAt": stamp,
        "gamesUpdatedAt": games_at,
        "games": stored_games,
        "series": series,
    }
    _fit(doc, cap)
    return doc
