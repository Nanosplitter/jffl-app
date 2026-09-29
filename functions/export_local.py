"""Create an ignored development snapshot from live ESPN reads."""
import json
from pathlib import Path
from espn_adapter import fetch_league
from league_config import LEAGUES

data = {"summaries": {}, "rosters": {}}
for slug in LEAGUES:
    summary, roster = fetch_league(slug)
    data["summaries"][slug] = summary
    data["rosters"][slug] = roster
    print(f"{slug}: {len(summary['teams'])} teams, {len(roster['players'])} players")
path = Path(__file__).parent / "local-data.json"
path.write_text(json.dumps(data, allow_nan=False), encoding="utf-8")
print(f"Saved live development snapshot ({path.stat().st_size:,} bytes)")
