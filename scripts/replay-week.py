#!/usr/bin/env python3
"""Rebuild a past week's score lines from NFL play-by-play.

The projection series stays empty. Dry run unless --write is set. A week that
already has a live projection is left alone.

    PYTHONPATH=functions functions/venv/bin/python scripts/replay-week.py --week 6
    PYTHONPATH=functions functions/venv/bin/python scripts/replay-week.py --week 6 --write
"""
import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "functions"))

from espn_adapter import team_abbr, week_lineups  # noqa: E402
from league_config import LEAGUES, SEASON  # noqa: E402
from score_replay import live_document, score_plays  # noqa: E402

CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{id}/competitions/{id}/plays"
SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
FANTASY = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{league}"
CACHE = Path("/tmp/jffl-replay")
PROJECT = "jffl-live-colin"


def get_json(session, url):
    last = None
    for attempt in range(4):
        try:
            response = session.get(url, timeout=40)
            if response.status_code == 429 or response.status_code >= 500:
                time.sleep(1 + attempt)
                last = f"{response.status_code} {url}"
                continue
            response.raise_for_status()
            return response.json()
        except requests.RequestException as error:
            last = str(error)
            time.sleep(1 + attempt)
    raise RuntimeError(last or url)


def scoreboard(session, week):
    return get_json(session, f"{SCOREBOARD}?seasontype=2&week={week}&dates={SEASON}")


def event_teams(event):
    competition = (event.get("competitions") or [{}])[0]
    teams, home, away = {}, None, None
    for side in competition.get("competitors") or []:
        team = side.get("team") or {}
        abbr = team_abbr(team.get("abbreviation"))
        team_id = str(team.get("id")) if team.get("id") is not None else None
        if not abbr or not team_id:
            continue
        teams[team_id] = abbr
        if side.get("homeAway") == "home":
            home = team_id
        elif side.get("homeAway") == "away":
            away = team_id
    kickoff = competition.get("date") or event.get("date")
    state = ((competition.get("status") or {}).get("type") or {}).get("state")
    return teams, home, away, kickoff, state


def fetch_plays(session, event_id):
    CACHE.mkdir(parents=True, exist_ok=True)
    cache = CACHE / f"{event_id}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    refs = []
    page = 1
    while page <= 5:
        payload = get_json(session, f"{CORE.format(id=event_id)}?limit=300&page={page}")
        items = payload.get("items") or []
        for item in items:
            if isinstance(item, dict) and item.get("$ref") and "participants" not in item:
                refs.append(item["$ref"])
            elif isinstance(item, dict) and item.get("type"):
                refs.append(item)
        if page >= (payload.get("pageCount") or 1):
            break
        page += 1
    full = []
    pending = [ref for ref in refs if isinstance(ref, str)]
    full.extend(ref for ref in refs if isinstance(ref, dict))

    def load(ref):
        return get_json(session, ref)

    if pending:
        with ThreadPoolExecutor(16) as pool:
            full.extend(pool.map(load, pending))
    cache.write_text(json.dumps(full))
    return full


def last_clock(plays):
    stamps = [play.get("wallclock") for play in plays if isinstance(play.get("wallclock"), str)]
    return max(stamps) if stamps else None


def score_week(session, week):
    payload = scoreboard(session, week)
    games = {}
    pieces = []
    for event in payload.get("events") or []:
        teams, home, away, kickoff, state = event_teams(event)
        if len(teams) != 2 or not home or not away:
            continue
        event_id = event.get("id")
        plays = fetch_plays(session, event_id) if state == "post" and event_id else []
        ended = last_clock(plays)
        if ended is None and isinstance(kickoff, str):
            try:
                ended_at = datetime.fromisoformat(kickoff.replace("Z", "+00:00")) + timedelta(hours=3)
                ended = ended_at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            except ValueError:
                ended = None
        for team_id, abbr in teams.items():
            opponent = teams[away] if team_id == home else teams[home]
            games[abbr] = {"kickoff": kickoff, "endedAt": ended, "opponent": opponent, "detail": "Final" if state == "post" else "Scheduled"}
        if plays:
            pieces.append(score_plays(plays, teams, kickoff=kickoff, home_id=home, away_id=away))
            print(f"week {week}: {teams[away]} at {teams[home]} ({len(plays)} plays)", flush=True)
    scored = {"players": {}, "defenses": {}}
    for piece in pieces:
        for key, events in piece["players"].items():
            scored["players"].setdefault(key, []).extend(events)
        for key, events in piece["defenses"].items():
            scored["defenses"].setdefault(key, []).extend(events)
    return games, scored


def fantasy_week(session, league_id, week):
    payload = get_json(session, f"{FANTASY.format(season=SEASON, league=league_id)}?view=mMatchup&view=mMatchupScore&scoringPeriodId={week}")
    schedule = payload.get("schedule") or []
    week_games = [matchup for matchup in schedule if matchup.get("matchupPeriodId") == week]
    if not week_games:
        week_games = schedule
    official = {}
    for matchup in week_games:
        for side in ("home", "away"):
            raw = matchup.get(side) or {}
            if "teamId" not in raw:
                continue
            points = (raw.get("pointsByScoringPeriod") or {}).get(str(week))
            if isinstance(points, (int, float)) and not isinstance(points, bool):
                official[str(raw["teamId"])] = points
    return week_lineups(week_games, week), official


def closing(starter, scored):
    if starter.get("position") == "D/ST" or starter.get("slot") == "D/ST":
        events = (scored.get("defenses") or {}).get(starter.get("proTeam")) or []
    else:
        events = (scored.get("players") or {}).get(str(starter.get("id"))) or []
    return events[-1][1] if events else 0


def report(slug, lineups, official, scored):
    gaps = []
    print(f"\n{slug}")
    for lineup in lineups:
        team_id = lineup["teamId"]
        rebuilt = round(sum(closing(player, scored) for player in lineup["players"]), 2)
        saved = round(sum(player["points"] or 0 for player in lineup["players"]), 2)
        board = official.get(team_id)
        print(f"  team {team_id}: replay {rebuilt}  starters {saved}  matchup {board}")
        for player in lineup["players"]:
            if player.get("points") is None:
                continue
            gap = round(closing(player, scored) - player["points"], 2)
            gaps.append((abs(gap), gap, player.get("name"), player.get("position"), player.get("proTeam"), player["points"]))
    gaps.sort(reverse=True)
    shown = [row for row in gaps if row[0] >= 1][:12]
    if shown:
        print("  largest gaps before the line is pinned to the official total:")
        for _, gap, name, position, pro, points in shown:
            print(f"    {name} ({position}, {pro}): {gap:+} vs {points}")
    exact = sum(1 for row in gaps if row[0] < 0.05)
    mean = round(sum(row[0] for row in gaps) / len(gaps), 2) if gaps else 0
    worst = gaps[0][0] if gaps else 0
    print(f"  players {len(gaps)}, exact {exact}, mean abs {mean}, worst {worst}")
    return mean, worst


def replayed_only(document):
    for row in (document.get("fields", {}).get("series", {}).get("mapValue", {}).get("fields", {}) or {}).values():
        values = (((row.get("mapValue") or {}).get("fields") or {}).get("p") or {}).get("arrayValue", {}).get("values") or []
        if any("integerValue" in value or "doubleValue" in value for value in values):
            return False
    return True


def write_document(session, token, document):
    slug, season, week = document["slug"], document["season"], document["week"]
    doc_id = f"{season}-{slug}-{week}"
    base = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/publicLiveWeeks/{doc_id}"
    headers = {"Authorization": f"Bearer {token}"}
    existing = session.get(base, headers=headers, timeout=40)
    if existing.status_code == 200 and not replayed_only(existing.json()):
        print(f"{doc_id}: kept, it already has a live projection")
        return
    body = {"fields": firestore_fields(document)}
    response = session.patch(base, headers={**headers, "Content-Type": "application/json"}, json=body, timeout=40)
    if response.status_code >= 300:
        raise RuntimeError(f"{doc_id}: {response.status_code} {response.text[:300]}")
    print(f"{doc_id}: wrote {len(document['series'])} teams")


def firestore_value(value):
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int) and not isinstance(value, bool):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, list):
        return {"arrayValue": {"values": [firestore_value(item) for item in value]}}
    if isinstance(value, dict):
        return {"mapValue": {"fields": firestore_fields(value)}}
    raise TypeError(type(value))


def firestore_fields(document):
    return {key: firestore_value(value) for key, value in document.items()}


def main():
    parser = argparse.ArgumentParser(description="Rebuild past matchday score lines from NFL plays.")
    parser.add_argument("--week", type=int, action="append", required=True)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    if any(week < 1 or week > 6 for week in args.week):
        raise SystemExit("This replay is for a finished week from 1 through 6. The live week stays as recorded.")
    session = requests.Session()
    session.headers["User-Agent"] = "jffl-replay"
    token = None
    if args.write:
        token = __import__("os").environ.get("FIRESTORE_ACCESS_TOKEN")
        if not token:
            raise SystemExit("Set FIRESTORE_ACCESS_TOKEN to publish. A week that already has a live projection is not replaced.")
    for week in args.week:
        games, scored = score_week(session, week)
        stamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        for slug, config in LEAGUES.items():
            lineups, official = fantasy_week(session, config["id"], week)
            mean, worst = report(slug, lineups, official, scored)
            document = live_document(slug, SEASON, week, stamp, games, lineups, scored)
            if not args.write:
                continue
            if mean > 3 or worst > 12:
                print(f"{slug} week {week}: not written, the replay is too far from the official totals")
                continue
            write_document(session, token, document)
    if not args.write:
        print("\nDry run. Pass --write to publish weeks whose replay is close to the official totals.")


if __name__ == "__main__":
    main()
