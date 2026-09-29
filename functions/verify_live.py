"""Audit normalized output against the exact upstream responses used to produce it.

Reads public ESPN data, never account identifiers or cookies. Optionally writes the
ignored development snapshot only after every league passes the audit.
"""
import argparse
import json
from pathlib import Path
from unittest.mock import patch

from espn_adapter import BoundedRequests, fetch_league
from league_config import LEAGUES, SEASON


def expected(value):
    return round(value, 2) if isinstance(value, (int, float)) else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--export", action="store_true")
    args = parser.parse_args()
    snapshots = {"summaries": {}, "rosters": {}}
    original = BoundedRequests._capture
    for slug in LEAGUES:
        raw_teams = {}
        boundaries = []

        def capture(boundary, data):
            original(boundary, data)
            boundaries.append(boundary)
            for team in data.get("teams", []):
                if "record" in team and "roster" in team:
                    raw_teams[str(team["id"])] = team

        with patch.object(BoundedRequests, "_capture", capture):
            summary, roster = fetch_league(slug)
        boundary = boundaries[-1]
        assert set(raw_teams) == {team["id"] for team in summary["teams"]}, "Team list mismatch"
        ranked = sorted(raw_teams.values(), key=lambda team: team["rankCalculatedFinal"] or team["playoffSeed"])
        assert [str(team["id"]) for team in ranked] == [team["id"] for team in summary["teams"]], "Standings mismatch"
        for team in summary["teams"]:
            raw = raw_teams[team["id"]]
            assert team["name"] == raw.get("name", f"{raw.get('location')} {raw.get('nickname')}")
            for field in ["wins", "losses", "ties", "pointsFor", "pointsAgainst"]:
                assert team[field] == expected(raw["record"]["overall"].get(field)), field
            raw_ids = {str(entry["playerPoolEntry"]["player"]["id"]) for entry in raw["roster"]["entries"]}
            normalized_ids = {player["id"] for player in roster["players"] if player["teamId"] == team["id"]}
            assert raw_ids == normalized_ids, "Roster mismatch"
        for matchup in summary["matchups"]:
            raw = next(item for item in boundary.raw_matchups
                       if str(item.get("home", {}).get("teamId")) == str(matchup["homeTeamId"])
                       and str(item.get("away", {}).get("teamId")) == str(matchup["awayTeamId"]))
            for side in ["home", "away"]:
                source = raw.get(side, {})
                assert matchup[f"{side}Score"] == expected(source.get("totalPointsLive", source.get("totalPoints")))
        for player in roster["players"]:
            raw = boundary.raw_players[player["id"]]
            for output, period, source in [("weekPoints", summary["week"], 0), ("projectedPoints", summary["week"], 1), ("seasonPoints", 0, 0)]:
                stat = next((item for item in raw.get("stats", []) if item.get("seasonId") == SEASON and item.get("scoringPeriodId") == period and item.get("statSourceId") == source and item.get("statSplitTypeId") != 2), {})
                assert player[output] == expected(stat.get("appliedTotal")), f"{player['name']} {output}"
        snapshots["summaries"][slug], snapshots["rosters"][slug] = summary, roster
        print(f"{slug}: verified {len(summary['teams'])} teams, standings, records, {len(summary['matchups'])} matchups, {len(roster['players'])} rosters and league-scored player points")
    if args.export:
        Path(__file__).with_name("local-data.json").write_text(json.dumps(snapshots, allow_nan=False), encoding="utf-8")
        print("Saved verified development snapshot")


if __name__ == "__main__":
    main()
