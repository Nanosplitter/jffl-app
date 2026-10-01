"""The only ESPN boundary. No cookies, identity fields, or provider writes."""
import json
import math
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit

import requests
from espn_api.football import League
from espn_api.football.constant import PLAYER_STATS_MAP, POSITION_MAP, PRO_TEAM_MAP
from espn_api.requests.espn_requests import EspnFantasyRequests

from league_config import LEAGUES, SEASON

# Raw stat IDs avoid collisions in the library's labels (e.g. yards vs yards/game).
STAT_NAMES = {
    "0": "Pass attempts", "1": "Completions", "3": "Pass yards", "4": "Pass TD",
    "20": "Interceptions", "23": "Rush attempts", "24": "Rush yards", "25": "Rush TD",
    "41": "Receptions", "42": "Rec yards", "43": "Rec TD", "58": "Targets",
    "68": "Fumbles", "72": "Fumbles lost", "83": "Field goals", "86": "Extra points",
    "94": "Defensive TD", "95": "Defensive INT", "96": "Fumble recoveries",
    "98": "Safeties", "99": "Sacks", "120": "Points allowed", "127": "Yards allowed",
}

# Scoring-rule ids that are not player counting stats. Kept separate so a
# 25-yard passing bundle does not show up as a player stat.
SCORING_STAT_NAMES = {
    "8": "Every 25 pass yards", "19": "Pass 2-pt conversion",
    "26": "Rush 2-pt conversion", "28": "Every 10 rush yards",
    "44": "Rec 2-pt conversion", "48": "Every 10 rec yards",
    "77": "Field goals 40-49", "80": "Field goals under 40",
    "198": "Field goals 50-59", "201": "Field goals 60+",
    "205": "Defensive 2-pt return", "206": "2-pt return", "209": "1-pt safety",
}


def number(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
        return round(value, 2)
    return None


def now_iso():
    return datetime.now(timezone.utc).isoformat()


IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".avif")


def espn_image_url(value):
    """A public https image. ESPN hosts, or a custom logo ESPN already displays."""
    if not isinstance(value, str) or len(value) > 2048:
        return None
    try:
        parsed = urlsplit(value)
        host = (parsed.hostname or "").lower()
    except ValueError:
        return None
    if parsed.scheme != "https" or not host or parsed.username or parsed.password:
        return None
    trusted_host = any(host == suffix[1:] or host.endswith(suffix)
                       for suffix in (".espn.com", ".espncdn.com", ".espn.net"))
    image = parsed.path.lower().endswith(IMAGE_EXTENSIONS)
    return value if trusted_host or image else None


class BoundedRequests(EspnFantasyRequests):
    def __init__(self, league_id, year):
        super().__init__(sport="nfl", year=year, league_id=league_id)
        self.session = requests.Session()
        self.deadline = time.monotonic() + 42
        self.raw_players = {}
        self.raw_settings = {}
        self.raw_matchups = []
        self.raw_schedule = {}
        self.raw_teams = {}

    def _request(self, endpoint, params=None, headers=None, league_response=False):
        for attempt in range(2):
            remaining = self.deadline - time.monotonic()
            if remaining < 1:
                raise TimeoutError("ESPN refresh deadline exceeded")
            response = self.session.get(endpoint, params=params, headers=headers,
                                        timeout=(min(3, remaining), min(10, remaining)))
            if response.status_code in (429, 500, 502, 503, 504) and attempt == 0:
                retry_after = response.headers.get("Retry-After", "0")
                try:
                    delay = float(retry_after)
                except ValueError:
                    delay = 2  # Do not immediately replay an unknown retry window.
                if delay > 1:
                    response.raise_for_status()
                time.sleep(max(0, delay))
                continue
            response.raise_for_status()
            data = response.json()
            if isinstance(data, list) and league_response:
                if len(data) != 1:
                    raise ValueError("Unexpected ESPN league response")
                data = data[0]
            if not isinstance(data, (dict, list)):
                raise ValueError("Unexpected ESPN response shape")
            if isinstance(data, dict):
                self._capture(data)
            return data
        raise RuntimeError("ESPN request failed")

    def _capture(self, data):
        if "schedule" in data:
            self.raw_matchups = data["schedule"]
            for matchup in data['schedule']:
                if 'id' in matchup:
                    self.raw_schedule[str(matchup['id'])] = matchup
        if "settings" in data:
            self.raw_settings = {**self.raw_settings, **data["settings"]}
        entries = []
        for team in data.get("teams", []):
            if 'id' in team:
                self.raw_teams[str(team['id'])] = {**self.raw_teams.get(str(team['id']), {}), **team}
            entries.extend(team.get("roster", {}).get("entries", []))
        for matchup in data.get("schedule", []):
            for side in ("home", "away"):
                entries.extend(matchup.get(side, {}).get("rosterForCurrentScoringPeriod", {}).get("entries", []))
        for entry in entries:
            player = entry.get("playerPoolEntry", {}).get("player", {})
            if "id" in player:
                key = str(player["id"])
                prior = self.raw_players.get(key, {})
                merged = {**prior, **player}
                # Box-score entries may omit cumulative stats; merge rather than discard.
                stats = {(s.get("scoringPeriodId"), s.get("statSourceId"), s.get("statSplitTypeId")): s
                         for s in prior.get("stats", [])}
                stats.update({(s.get("scoringPeriodId"), s.get("statSourceId"), s.get("statSplitTypeId")): s
                              for s in player.get("stats", [])})
                merged["stats"] = list(stats.values())
                self.raw_players[key] = merged

    def league_get(self, params=None, headers=None, extend=""):
        return self._request(self.LEAGUE_ENDPOINT + extend, params, headers, league_response=True)

    def scoring_period_schedule(self, week, matchup_period):
        """One matchup request for a past week. The season schedule used for team scores stays intact."""
        params = {"view": ["mMatchupScore", "mScoreboard"], "scoringPeriodId": week}
        filters = {"schedule": {"filterMatchupPeriodIds": {"value": [matchup_period]}}}
        saved_matchups, saved_schedule = self.raw_matchups, dict(self.raw_schedule)
        try:
            data = self.league_get(params=params, headers={"x-fantasy-filter": json.dumps(filters)})
        finally:
            self.raw_matchups = saved_matchups
            self.raw_schedule = saved_schedule
        schedule = data.get("schedule") if isinstance(data, dict) else None
        return schedule if isinstance(schedule, list) else []

    def get(self, params=None, headers=None, extend=""):
        return self._request(self.ENDPOINT + extend, params, headers)


def source_stat(raw, period, source):
    return next((s for s in raw.get("stats", [])
                 if s.get("seasonId") == SEASON and s.get("scoringPeriodId") == period
                 and s.get("statSourceId") == source and s.get("statSplitTypeId") != 2), {})


def breakdown(stat):
    return {label: number(stat["stats"][key]) for key, label in STAT_NAMES.items()
            if key in stat.get("stats", {}) and number(stat["stats"][key]) is not None}


def weekly_stats(raw, through_week):
    """Counting stats already captured for each played week. A missing week stays absent."""
    rows = []
    for period in range(1, through_week + 1):
        actual = source_stat(raw, period, 0)
        stats = breakdown(actual)
        points = number(actual.get("appliedTotal"))
        if points is None and not stats:
            continue
        row = {"week": period, "stats": stats}
        if points is not None:
            row["points"] = points
        rows.append(row)
    return rows


def normalize_player(player, team_id, week, raw, box_player=None):
    actual = source_stat(raw, week, 0)
    projected = source_stat(raw, week, 1)
    season = source_stat(raw, 0, 0)
    slot = getattr(box_player, "slot_position", None) or player.lineupSlot or "BE"
    return {
        "id": str(player.playerId), "teamId": str(team_id), "name": player.name,
        "position": player.position, "proTeam": player.proTeam, "slot": slot,
        "group": "ir" if slot == "IR" else "bench" if slot == "BE" else "starter",
        "eligibleSlots": list(player.eligibleSlots), "injuryStatus": raw.get("injuryStatus"),
        "weekPoints": number(actual.get("appliedTotal")),
        "projectedPoints": number(projected.get("appliedTotal")),
        "seasonPoints": number(season.get("appliedTotal")),
        "averagePoints": number(season.get("appliedAverage")),
        "weekStats": breakdown(actual), "seasonStats": breakdown(season),
        "weeklyStats": weekly_stats(raw, week),
    }


def validate_snapshot(summary, roster):
    if not summary["teams"] or len({t["id"] for t in summary["teams"]}) != len(summary["teams"]):
        raise ValueError("Missing or duplicate teams")
    ids = {t["id"] for t in summary["teams"]}
    if any(p["teamId"] not in ids or not p["name"] for p in roster["players"]):
        raise ValueError("Invalid roster ownership")
    keys = [(p["teamId"], p["id"]) for p in roster["players"]]
    if len(set(keys)) != len(keys) or not keys:
        raise ValueError("Empty or duplicate roster")
    if any(side is not None and side not in ids for m in summary["matchups"]
           for side in (m["homeTeamId"], m["awayTeamId"])):
        raise ValueError("Unknown matchup team")
    for snapshot in (summary, roster):
        encoded = json.dumps(snapshot, allow_nan=False).encode()
        if len(encoded) > 700_000:
            raise ValueError("Snapshot exceeds conservative Firestore document limit")


def weekly_matchups(boundary, current_week):
    result = []
    periods = boundary.raw_settings.get('scheduleSettings', {}).get('matchupPeriods', {})
    for matchup in boundary.raw_schedule.values():
        period = matchup.get('matchupPeriodId')
        weeks = periods.get(str(period), [period])
        for week in weeks:
            if not isinstance(week, int) or week > current_week:
                continue
            row = {'id': f"{week}-{matchup['id']}", 'week': week,
                   'status': 'final' if matchup.get('winner') in ('HOME', 'AWAY', 'TIE') else 'live' if week == current_week else 'pending'}
            for side in ('home', 'away'):
                raw = matchup.get(side, {})
                row[f'{side}TeamId'] = str(raw['teamId']) if 'teamId' in raw else None
                row[f'{side}Score'] = number(raw.get('pointsByScoringPeriod', {}).get(str(week)))
                if row[f'{side}Score'] is None and len(weeks) == 1:
                    row[f'{side}Score'] = number(raw.get('totalPointsLive', raw.get('totalPoints'))) if week == current_week or row['status'] == 'final' else None
                row[f'{side}Projected'] = number(raw.get('totalProjectedPointsLive')) if week == current_week else None
            result.append(row)
    return sorted(result, key=lambda row: (row['week'], row['id']))


BENCH_SLOTS = {"BE", "IR", ""}
LINEUP_ORDER = ["QB", "RB", "WR", "TE", "RB/WR/TE", "FLEX", "D/ST", "K"]


def matchup_period_for(league, week):
    periods = getattr(league.settings, "matchup_periods", {}) or {}
    for matchup_id, weeks in periods.items():
        if week in weeks:
            return matchup_id
    return None


def week_lineups(schedule, week):
    """Starters for one scoring period. Missing points stay absent, including a player who did not play."""
    rows = []
    for matchup in schedule:
        for side in ("home", "away"):
            team = matchup.get(side) or {}
            if "teamId" not in team:
                continue
            players = []
            for entry in team.get("rosterForCurrentScoringPeriod", {}).get("entries", []):
                raw = entry.get("playerPoolEntry", {}).get("player") or entry.get("player") or {}
                if "id" not in raw or not raw.get("fullName"):
                    continue
                slot = POSITION_MAP.get(entry.get("lineupSlotId"), "BE")
                if slot in BENCH_SLOTS:
                    continue
                actual = source_stat(raw, week, 0)
                players.append({
                    "id": str(raw["id"]),
                    "name": raw["fullName"],
                    "position": POSITION_MAP.get(raw.get("defaultPositionId"), slot),
                    "proTeam": PRO_TEAM_MAP.get(raw.get("proTeamId"), "None"),
                    "slot": slot,
                    "points": number(actual.get("appliedTotal")),
                })
            players.sort(key=lambda player: (LINEUP_ORDER.index(player["slot"]) if player["slot"] in LINEUP_ORDER else len(LINEUP_ORDER), player["name"]))
            if players:
                rows.append({"week": week, "teamId": str(team["teamId"]), "players": players})
    return rows


def fetch_league(slug):
    config = LEAGUES[slug]
    league = League(league_id=config["id"], year=SEASON, fetch_league=False)
    boundary = BoundedRequests(config["id"], SEASON)
    league.espn_request = boundary
    try:
        league.fetch_league()
        week = league.current_week
        lineups = []
        for past in range(1, week):
            period = matchup_period_for(league, past)
            if period is None:
                continue
            try:
                schedule = boundary.scoring_period_schedule(past, period)
            except TimeoutError:
                break
            lineups.extend(week_lineups(schedule, past))
        boxes = league.box_scores(week)
        lineups.extend(week_lineups(boundary.raw_matchups, week))
        ranks = {team.team_id: index + 1 for index, team in enumerate(league.standings())}
        completed = min((team.wins + team.losses + team.ties for team in league.teams), default=0)
        # This operates on already-fetched schedules and adds no ESPN requests.
        previous_ranks = {team.team_id: index + 1 for index, team in enumerate(league.standings_weekly(completed - 1))} if completed > 1 else {}
        season_ranks = {team.team_id: index + 1 for index, team in enumerate(league.standings_weekly(14))} if completed >= 14 else ranks
        box_players = {}
        matchups = []
        for index, box in enumerate(boxes):
            home_id = str(box.home_team.team_id) if box.home_team else None
            away_id = str(box.away_team.team_id) if box.away_team else None
            raw_box = next((item for item in boundary.raw_matchups
                            if item.get('matchupPeriodId') == league.currentMatchupPeriod
                            and str(item.get("home", {}).get("teamId")) == str(home_id)
                            and str(item.get("away", {}).get("teamId")) == str(away_id)), {})
            home_raw, away_raw = raw_box.get("home", {}), raw_box.get("away", {})
            for team_id, lineup in ((home_id, box.home_lineup), (away_id, box.away_lineup)):
                for player in lineup:
                    box_players[(team_id, str(player.playerId))] = player
            matchups.append({"id": f"{week}-{index}", "homeTeamId": home_id, "awayTeamId": away_id,
                             "homeScore": number(home_raw.get("totalPointsLive", home_raw.get("totalPoints"))),
                             "awayScore": number(away_raw.get("totalPointsLive", away_raw.get("totalPoints"))),
                             "homeProjected": number(home_raw.get("totalProjectedPointsLive")),
                             "awayProjected": number(away_raw.get("totalProjectedPointsLive"))})
        teams, players = [], []
        for team in league.teams:
            teams.append({"id": str(team.team_id), "name": team.team_name,
                          "logoUrl": espn_image_url(getattr(team, "logo_url", None)),
                          "abbreviation": team.team_abbrev, "rank": ranks.get(team.team_id),
                          "wins": number(team.wins), "losses": number(team.losses), "ties": number(team.ties),
                          "pointsFor": number(team.points_for), "pointsAgainst": number(team.points_against),
                          "rosterCount": len(team.roster), 'previousRank': previous_ranks.get(team.team_id),
                          'draftRank': number(boundary.raw_teams.get(str(team.team_id), {}).get('draftDayProjectedRank')),
                          'regularSeasonRank': season_ranks.get(team.team_id),
                          'finalStanding': number(team.final_standing) if team.final_standing else None})
            for player in team.roster:
                players.append(normalize_player(player, team.team_id, week,
                               boundary.raw_players.get(str(player.playerId), {}),
                               box_players.get((str(team.team_id), str(player.playerId)))))
        stamp = now_iso()
        common = {"schemaVersion": 1, "leagueId": str(config["id"]), "slug": slug,
                  "leagueName": config["name"], "season": SEASON, "week": week,
                  "updatedAt": stamp, "lastAttemptAt": stamp, "refreshStatus": "ok"}
        scoring = []
        for item in boundary.raw_settings.get("scoringSettings", {}).get("scoringItems", []):
            value = number(item.get("points"))
            if value is not None and value != 0:
                stat_id = str(item["statId"])
                label = SCORING_STAT_NAMES.get(stat_id) or STAT_NAMES.get(stat_id) or PLAYER_STATS_MAP.get(int(stat_id), f"ESPN stat {stat_id}")
                scoring.append({"name": label, "points": value})
        summary = {**common, "teams": sorted(teams, key=lambda t: t["rank"]), "matchups": matchups, "scoring": scoring,
                   'weeklyMatchups': weekly_matchups(boundary, week), 'completedWeeks': completed}
        roster = {**common, "players": players, "weeklyLineups": lineups}
        validate_snapshot(summary, roster)
        return summary, roster
    finally:
        boundary.session.close()
