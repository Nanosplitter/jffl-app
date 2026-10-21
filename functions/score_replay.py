"""Rebuild a fantasy score line from NFL play-by-play.

Live projections are not in the play feed, so this fills the score series only.
The last point of each starter is the official fantasy total when that total is
known, and the earlier points follow the plays.
"""
from datetime import datetime, timezone

CAP = 240

SKILL = (
    "pass_yds", "pass_td", "interceptions", "pass_2pt",
    "rush_yds", "rush_td", "rush_2pt",
    "rec_yds", "rec_td", "rec_2pt",
    "fum_lost", "fg_short", "fg_mid", "fg_long", "xp", "fg_miss", "return_td",
)
DEFENSE = (
    "points_allowed", "yards_allowed", "sacks", "interceptions",
    "fumble_recoveries", "blocked_kicks", "safeties", "def_td",
)
PA_TIERS = ((0, 0, 5), (1, 6, 4), (7, 13, 3), (14, 17, 1), (18, 27, 0), (28, 34, -1), (35, 45, -2), (46, 200, -3))
YA_TIERS = ((0, 99, 5), (100, 199, 3), (200, 299, 2), (300, 399, 0), (400, 449, -1), (450, 499, -2), (500, 549, -3), (550, 9999, -4))


def _blank(names):
    return {name: 0 for name in names}


def _ref_id(value, marker):
    if isinstance(value, dict):
        if "id" in value and not isinstance(value["id"], bool):
            return str(value["id"])
        return _ref_id(value.get("$ref"), marker)
    if not isinstance(value, str) or marker not in value:
        return None
    token = value.split(marker, 1)[1].split("?", 1)[0].strip("/")
    return token or None


def _athlete(part):
    athlete = part.get("athlete") if isinstance(part, dict) else None
    return _ref_id(athlete, "/athletes/")


def _team(value):
    if isinstance(value, dict) and "team" in value:
        return _team(value.get("team"))
    return _ref_id(value, "/teams/")


def _unix(stamp):
    if not isinstance(stamp, str):
        return None
    try:
        parsed = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp())


def _whole(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return int(value)


def _bundles(yards, size):
    if not yards:
        return 0
    return int(yards // size) if yards > 0 else -int((-int(yards)) // size)


def _tier(value, bands):
    amount = value if value > 0 else 0
    for low, high, points in bands:
        if low <= amount <= high:
            return points
    return 0


def skill_points(stats):
    """Non-PPR scoring for this league. Yardage pays when the running total crosses a bundle."""
    return (
        _bundles(stats["pass_yds"], 25)
        + stats["pass_td"] * 4
        + stats["interceptions"] * -2
        + stats["pass_2pt"] * 2
        + _bundles(stats["rush_yds"], 10)
        + stats["rush_td"] * 6
        + stats["rush_2pt"] * 2
        + _bundles(stats["rec_yds"], 10)
        + stats["rec_td"] * 6
        + stats["rec_2pt"] * 2
        + stats["fum_lost"] * -2
        + stats["fg_short"] * 3
        + stats["fg_mid"] * 4
        + stats["fg_long"] * 5
        + stats["xp"]
        + stats["fg_miss"] * -1
        + stats["return_td"] * 6
    )


def defense_points(stats):
    """Points-allowed and yards-allowed tiers replace each other. Sacks and turnovers add."""
    return (
        _tier(stats["points_allowed"], PA_TIERS)
        + _tier(stats["yards_allowed"], YA_TIERS)
        + stats["sacks"]
        + stats["interceptions"] * 2
        + stats["fumble_recoveries"] * 2
        + stats["blocked_kicks"] * 2
        + stats["safeties"] * 2
        + stats["def_td"] * 6
    )


def counted_yards(play):
    """Yards that survived the play. A penalty that wipes the play contributes none."""
    yards = _whole(play.get("statYardage"))
    if yards is None:
        return None
    text = play.get("text") if isinstance(play.get("text"), str) else ""
    if play.get("isPenalty") and "No Play" in text:
        return None
    if "PENALTY" in text and yards < 0:
        return None
    return yards


def _roles(play):
    found = {}
    for part in play.get("participants") or []:
        if not isinstance(part, dict):
            continue
        kind = part.get("type")
        athlete = _athlete(part)
        if not isinstance(kind, str) or not athlete:
            continue
        found.setdefault(kind, [])
        if athlete not in found[kind]:
            found[kind].append(athlete)
    return found


def _add(stats, athlete, **deltas):
    row = stats.setdefault(athlete, _blank(SKILL))
    for name, amount in deltas.items():
        row[name] += amount


def _fg_bucket(distance):
    if distance < 40:
        return "fg_short"
    if distance < 50:
        return "fg_mid"
    return "fg_long"


def _defense_for(kind, tagged, defenses):
    """ESPN tags the offense on a down and the defense on a takeaway."""
    if not tagged or tagged not in defenses:
        return None
    takeaway = "Interception" in kind or "Opponent" in kind or "Sack Opp" in kind
    credited = tagged if takeaway else _opponent(defenses, tagged)
    return credited if credited in defenses else None


def _apply_skill(play, players, roles, yards, tagged, defenses):
    kind = (play.get("type") or {}).get("text") if isinstance(play.get("type"), dict) else ""
    kind = kind or ""
    text = play.get("text") if isinstance(play.get("text"), str) else ""
    defense = _defense_for(kind, tagged, defenses)
    sack = kind == "Sack" or "sackedBy" in roles
    if sack and defense:
        defenses[defense]["sacks"] += 1
        if yards is not None:
            defenses[defense]["yards_allowed"] += yards
    if kind in ("Pass Reception", "Passing Touchdown") and yards is not None and not sack:
        for athlete in roles.get("passer", []):
            _add(players, athlete, pass_yds=yards)
        for athlete in roles.get("receiver", []):
            _add(players, athlete, rec_yds=yards)
        other = _opponent(defenses, tagged) if tagged else None
        if other:
            defenses[other]["yards_allowed"] += yards
        if kind == "Passing Touchdown":
            for athlete in roles.get("passer", []):
                _add(players, athlete, pass_td=1)
            for athlete in roles.get("receiver", []):
                _add(players, athlete, rec_td=1)
    elif kind in ("Rush", "Rushing Touchdown") and yards is not None:
        for athlete in roles.get("rusher", []):
            _add(players, athlete, rush_yds=yards, **({"rush_td": 1} if kind == "Rushing Touchdown" else {}))
        other = _opponent(defenses, tagged) if tagged else None
        if other:
            defenses[other]["yards_allowed"] += yards
    elif "Interception" in kind:
        for athlete in roles.get("passer", []):
            _add(players, athlete, interceptions=1)
        if defense:
            defenses[defense]["interceptions"] += 1
            if "Touchdown" in kind:
                defenses[defense]["def_td"] += 1
    elif kind in ("Fumble Recovery (Opponent)", "Sack Opp Fumble Recovery", "Muffed Punt Recovery (Opponent)"):
        for athlete in roles.get("fumbler", []):
            _add(players, athlete, fum_lost=1)
        if defense:
            defenses[defense]["fumble_recoveries"] += 1
            if play.get("scoringPlay") and "TOUCHDOWN" in text.upper():
                defenses[defense]["def_td"] += 1
    elif kind == "Field Goal Good" and yards is not None:
        for athlete in roles.get("kicker", []):
            _add(players, athlete, **{_fg_bucket(yards): 1})
    elif kind in ("Field Goal Missed", "Blocked Field Goal", "Blocked Field Goal Touchdown"):
        for athlete in roles.get("kicker", []):
            _add(players, athlete, fg_miss=1)
        if defense and "Blocked" in kind:
            defenses[defense]["blocked_kicks"] += 1
            if "Touchdown" in kind:
                defenses[defense]["def_td"] += 1
    elif "Safety" in kind and defense:
        defenses[defense]["safeties"] += 1
    elif "Touchdown" in kind and ("Kickoff" in kind or "Punt" in kind or "Return" in kind):
        for athlete in roles.get("returner", []) or roles.get("scorer", []):
            _add(players, athlete, return_td=1)
    _apply_try(play, players, roles)


def _opponent(defenses, offense_abbr):
    for abbr in defenses:
        if abbr != offense_abbr:
            return abbr
    return None


def _apply_try(play, players, roles):
    pat = play.get("pointAfterAttempt") if isinstance(play.get("pointAfterAttempt"), dict) else {}
    play_text = play.get("text") if isinstance(play.get("text"), str) else ""
    pat_text = pat.get("text") if isinstance(pat.get("text"), str) else ""
    blob = f"{pat_text} {play_text}".lower()
    if "extra point" in blob and "no good" not in blob and "good" in blob:
        kickers = roles.get("kicker") or roles.get("patScorer") or []
        for athlete in kickers[:1]:
            _add(players, athlete, xp=1)
    attempt = blob.split("two-point", 1)[-1] if "two-point" in blob else blob
    if "two-point" not in blob and "two point" not in blob:
        return
    failed = any(token in attempt for token in ("incomplete", "no good", "failed", "fails"))
    made = any(token in attempt for token in ("is complete", "is good", "succeeds", "successful", "converts"))
    if failed or not made:
        return
    if "pass" in attempt:
        for athlete in roles.get("patPasser", []):
            _add(players, athlete, pass_2pt=1)
        for athlete in roles.get("patScorer", []):
            _add(players, athlete, rec_2pt=1)
    elif "rush" in attempt or "run" in attempt:
        for athlete in roles.get("patScorer", []) or roles.get("rusher", []):
            _add(players, athlete, rush_2pt=1)


def _emit(events, last, key, points, when):
    if last.get(key) == points:
        return
    last[key] = points
    if points == 0 and key not in events:
        return
    row = events.setdefault(key, [])
    if row and row[-1][0] == when:
        row[-1] = (when, points)
    else:
        row.append((when, points))


def score_plays(plays, teams, kickoff=None, home_id=None, away_id=None):
    """Cumulative fantasy points for athletes and the two defenses in one game.

    `teams` maps an ESPN team id to the abbreviation used on fantasy rosters.
    `home_id` is the team whose score is `homeScore` on each play.
    """
    if not isinstance(teams, dict) or len(teams) != 2:
        return {"players": {}, "defenses": {}}
    ordered = [play for play in plays if isinstance(play, dict)]
    ordered.sort(key=lambda play: (_whole(play.get("sequenceNumber")) or 0, play.get("wallclock") or ""))
    defenses = {abbr: _blank(DEFENSE) for abbr in teams.values()}
    players = {}
    player_events = {}
    defense_events = {}
    last = {}
    start = _unix(kickoff) if kickoff else None
    if start is None:
        for play in ordered:
            start = _unix(play.get("wallclock"))
            if start is not None:
                start -= 1
                break
    if start is not None:
        for abbr, stats in defenses.items():
            _emit(defense_events, last, abbr, defense_points(stats), start)
    id_to_abbr = {str(team_id): abbr for team_id, abbr in teams.items()}
    home = id_to_abbr.get(str(home_id)) if home_id is not None else None
    away = id_to_abbr.get(str(away_id)) if away_id is not None else None
    for play in ordered:
        when = _unix(play.get("wallclock"))
        if when is None:
            continue
        roles = _roles(play)
        offense_id = _team(play.get("team"))
        offense = id_to_abbr.get(offense_id) if offense_id else None
        yards = counted_yards(play)
        _apply_skill(play, players, roles, yards, offense, defenses)
        home_score = _whole(play.get("homeScore"))
        away_score = _whole(play.get("awayScore"))
        if home in defenses and away in defenses and home_score is not None and away_score is not None:
            defenses[home]["points_allowed"] = away_score
            defenses[away]["points_allowed"] = home_score
        for athlete, stats in players.items():
            _emit(player_events, last, athlete, skill_points(stats), when)
        for abbr, stats in defenses.items():
            _emit(defense_events, last, abbr, defense_points(stats), when)
    return {"players": player_events, "defenses": defense_events}


def _snap(events, official, kickoff, ended):
    if official is None:
        return list(events)
    official = round(float(official), 2)
    if not events:
        if official == 0 or kickoff is None:
            return []
        if ended and ended > kickoff:
            return [(kickoff, 0), (ended, official)]
        return [(kickoff, official)]
    events = list(events)
    if events[-1][1] == official:
        return events
    if ended and ended > events[-1][0]:
        events.append((ended, official))
    else:
        events[-1] = (events[-1][0], official)
    return events


def _held(events, when):
    found = None
    for stamp, points in events:
        if stamp <= when:
            found = points
        else:
            break
    return found


def team_series(starters, scored, games):
    """One score series for a fantasy team. Projections stay null."""
    if not isinstance(starters, list) or not starters:
        return None
    players = (scored or {}).get("players") or {}
    defenses = (scored or {}).get("defenses") or {}
    per = []
    kickoffs = []
    endings = []
    for starter in starters:
        if not isinstance(starter, dict):
            continue
        game = games.get(starter.get("proTeam")) if isinstance(games, dict) else None
        game = game if isinstance(game, dict) else {}
        kickoff = _unix(game.get("kickoff"))
        ended = _unix(game.get("endedAt"))
        if kickoff is not None:
            kickoffs.append(kickoff)
        if ended is not None:
            endings.append(ended)
        if starter.get("position") == "D/ST" or starter.get("slot") == "D/ST":
            events = defenses.get(starter.get("proTeam")) or []
        else:
            events = players.get(str(starter.get("id"))) or []
        per.append(_snap(events, starter.get("points"), kickoff, ended))
    times = {stamp for events in per for stamp, _ in events}
    if kickoffs:
        times.add(min(kickoffs))
    if not times:
        return None
    ordered = sorted(times)
    stamps, scores = [], []
    previous = None
    for when in ordered:
        total = 0.0
        for events in per:
            held = _held(events, when)
            if held is not None:
                total += held
        total = round(total, 2)
        if stamps and stamps[-1] == when:
            scores[-1] = total
            previous = total
            continue
        if previous == total and stamps:
            continue
        stamps.append(when)
        scores.append(total)
        previous = total
    if len(stamps) == 1 and endings and max(endings) > stamps[0]:
        stamps.append(max(endings))
        scores.append(scores[0])
    if len(stamps) < 2:
        return None
    return {"t": stamps, "s": scores, "p": [None] * len(stamps)}


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


def live_document(slug, season, week, updated_at, games, lineups, scored):
    """A publicLiveWeeks document. The score series is replayed and the projection series is empty."""
    series = {}
    for lineup in lineups or []:
        if not isinstance(lineup, dict):
            continue
        team_id = lineup.get("teamId")
        if not isinstance(team_id, str):
            continue
        row = team_series(lineup.get("players"), scored, games)
        if row:
            _thin(row, CAP)
            series[team_id] = row
    published_games = {}
    for abbr, game in (games or {}).items():
        if not isinstance(abbr, str) or not isinstance(game, dict):
            continue
        published_games[abbr] = {
            "kickoff": game.get("kickoff"),
            "state": "post",
            "detail": game.get("detail") or "Final",
            "progress": 1,
            "opponent": game.get("opponent"),
            "endedAt": game.get("endedAt"),
        }
    return {
        "schemaVersion": 1,
        "slug": slug,
        "season": season,
        "week": week,
        "updatedAt": updated_at,
        "gamesUpdatedAt": updated_at,
        "games": published_games,
        "series": series,
        "replayed": True,
    }
