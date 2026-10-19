"""Create an ignored development snapshot from live ESPN reads."""
import json
from datetime import datetime, timezone
from pathlib import Path
from espn_adapter import fetch_league, fetch_nfl_games
from league_config import LEAGUES
from live_timeline import fold_live

data = {"summaries": {}, "rosters": {}, "live": {}}
games = None
now = datetime.now(timezone.utc)
for slug in LEAGUES:
    summary, roster = fetch_league(slug)
    data["summaries"][slug] = summary
    data["rosters"][slug] = roster
    if games is None:
        try:
            games = fetch_nfl_games(summary["week"])
        except Exception as error:
            print(f"scoreboard unavailable ({type(error).__name__})")
            games = {}
    folded = fold_live(None, summary, games, now)
    if folded:
        data["live"][slug] = folded
    print(f"{slug}: {len(summary['teams'])} teams, {len(roster['players'])} players")
path = Path(__file__).parent / "local-data.json"
path.write_text(json.dumps(data, allow_nan=False), encoding="utf-8")
print(f"Saved live development snapshot ({path.stat().st_size:,} bytes)")
