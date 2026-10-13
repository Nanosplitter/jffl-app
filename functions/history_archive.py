"""Copy each season's finished matchups into publicHistory so they outlive that year's snapshots."""
import json
from pathlib import Path

LEAGUE_SLUGS = ("premier", "championship", "league-one")


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def load_names():
    raw = json.loads(Path(__file__).with_name("manager_names.json").read_text())
    return {
        (slug, str(team_id)): info
        for slug, teams in raw.items()
        for team_id, info in teams.items()
    }


NAMES = load_names()


def _key(row):
    return (row.get("week"), row.get("homeTeamId"), row.get("awayTeamId"))


def merge_matchups(previous, incoming):
    """Keep a finished score when a later fetch drops it, including a final row that disappears."""
    saved = {_key(row): row for row in previous or []}
    seen = set()
    merged = []
    for row in incoming or []:
        key = _key(row)
        seen.add(key)
        prior = saved.get(key)
        if prior is None:
            merged.append(row)
            continue
        kept = dict(row)
        for side in ("homeScore", "awayScore"):
            if _number(kept.get(side)) is None and _number(prior.get(side)) is not None:
                kept[side] = prior[side]
        if prior.get("status") == "final" and _number(kept.get("homeScore")) is not None and _number(kept.get("awayScore")) is not None:
            kept["status"] = "final"
        merged.append(kept)
    for key, prior in saved.items():
        if key in seen:
            continue
        if prior.get("status") == "final" and _number(prior.get("homeScore")) is not None and _number(prior.get("awayScore")) is not None:
            merged.append(dict(prior))
    merged.sort(key=lambda row: (row.get("week") or 0, str(row.get("id") or "")))
    return merged


def retain_finished_scores(previous, summary):
    """On the live snapshot, keep a score ESPN stops sending."""
    if not previous or not summary or not isinstance(summary.get("weeklyMatchups"), list):
        return
    summary["weeklyMatchups"] = merge_matchups(previous.get("weeklyMatchups"), summary["weeklyMatchups"])


def _stored_matchup(slug, row):
    home = NAMES.get((slug, str(row.get("homeTeamId") or "")))
    away = NAMES.get((slug, str(row.get("awayTeamId") or "")))
    stored = {
        "id": row.get("id"),
        "week": row.get("week"),
        "status": row.get("status"),
        "homeTeamId": row.get("homeTeamId"),
        "awayTeamId": row.get("awayTeamId"),
        "homeScore": _number(row.get("homeScore")),
        "awayScore": _number(row.get("awayScore")),
    }
    if home:
        stored["homeManager"] = home["manager"]
    elif row.get("homeManager"):
        stored["homeManager"] = row["homeManager"]
    if away:
        stored["awayManager"] = away["manager"]
    elif row.get("awayManager"):
        stored["awayManager"] = row["awayManager"]
    return stored


def _stored_team(slug, team):
    info = NAMES.get((slug, str(team.get("id")))) or {}
    return {
        "id": str(team.get("id")),
        "name": team.get("name"),
        "manager": info.get("manager") or team.get("manager") or team.get("name"),
        "jfflSeed": info.get("jfflSeed"),
        "leagueSeed": info.get("leagueSeed"),
        "wins": team.get("wins"),
        "losses": team.get("losses"),
        "ties": team.get("ties"),
        "pointsFor": team.get("pointsFor"),
        "pointsAgainst": team.get("pointsAgainst"),
        "rank": team.get("rank"),
        "regularSeasonRank": team.get("regularSeasonRank"),
        "finalStanding": team.get("finalStanding"),
        "draftRank": team.get("draftRank"),
        "previousRank": team.get("previousRank"),
    }


def fold_public_history(previous, summary):
    """Merge one league refresh into the season document. Returns None when the summary is not a season snapshot."""
    season = summary.get("season")
    slug = summary.get("slug")
    if not isinstance(season, int) or slug not in LEAGUE_SLUGS:
        return None
    if previous and previous.get("season") not in (None, season):
        return None
    leagues = dict((previous or {}).get("leagues") or {})
    prior = leagues.get(slug) or {}
    matchups = [_stored_matchup(slug, row) for row in merge_matchups(prior.get("weeklyMatchups"), summary.get("weeklyMatchups"))]
    leagues[slug] = {
        "updatedAt": summary.get("updatedAt"),
        "week": summary.get("week"),
        "completedWeeks": summary.get("completedWeeks"),
        "teams": [_stored_team(slug, team) for team in summary.get("teams") or [] if team.get("id")],
        "weeklyMatchups": matchups,
    }
    return {"schemaVersion": 1, "season": season, "leagues": leagues}
