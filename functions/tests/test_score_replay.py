from score_replay import counted_yards, live_document, score_plays, skill_points, team_series


def play(kind, yards, text="", **extra):
    row = {
        "sequenceNumber": extra.pop("sequence", 1),
        "wallclock": extra.pop("at", "2026-10-18T17:10:00Z"),
        "type": {"text": kind},
        "statYardage": yards,
        "text": text,
        "homeScore": extra.pop("home_score", 0),
        "awayScore": extra.pop("away_score", 0),
        "team": {"id": extra.pop("team", "3")},
        "participants": extra.pop("participants", []),
    }
    row.update(extra)
    return row


def athlete(kind, player_id):
    return {"type": kind, "athlete": {"id": player_id}}


TEAMS = {"1": "ATL", "3": "CHI"}


def test_penalty_that_wipes_a_catch_does_not_change_passing_yards():
    assert counted_yards(play("Pass Reception", -15, "for 21 yards. PENALTY on CHI, Offensive Holding")) is None
    assert counted_yards(play("Penalty", -10, "PENALTY on CHI, Offensive Holding, enforced - No Play.", isPenalty=True)) is None
    plays = [
        play("Pass Reception", 25, participants=[athlete("passer", "11"), athlete("receiver", "22")], sequence=1),
        play("Pass Reception", -15, "for 21 yards. PENALTY on CHI, Offensive Holding",
             participants=[athlete("passer", "11"), athlete("receiver", "22")], sequence=2, at="2026-10-18T17:12:00Z"),
        play("Passing Touchdown", 10, "TOUCHDOWN. extra point is GOOD",
             participants=[athlete("passer", "11"), athlete("receiver", "22"), athlete("kicker", "33"), athlete("patScorer", "33")],
             sequence=3, at="2026-10-18T17:20:00Z", away_score=7,
             pointAfterAttempt={"text": "Extra Point Good"}),
    ]
    scored = score_plays(plays, TEAMS, kickoff="2026-10-18T17:00:00Z", home_id="1", away_id="3")
    assert scored["players"]["11"][-1][1] == skill_points({
        "pass_yds": 35, "pass_td": 1, "interceptions": 0, "pass_2pt": 0,
        "rush_yds": 0, "rush_td": 0, "rush_2pt": 0, "rec_yds": 0, "rec_td": 0, "rec_2pt": 0,
        "fum_lost": 0, "fg_short": 0, "fg_mid": 0, "fg_long": 0, "xp": 0, "fg_miss": 0, "return_td": 0,
    })
    assert scored["players"]["33"][-1][1] == 1


def test_sack_yards_stay_off_the_quarterback_and_on_the_defense():
    plays = [
        play("Rush", 10, participants=[athlete("rusher", "11")], sequence=1),
        play("Sack", -9, "sacked", participants=[athlete("passer", "11"), athlete("sackedBy", "99")],
             sequence=2, at="2026-10-18T17:12:00Z"),
    ]
    scored = score_plays(plays, TEAMS, kickoff="2026-10-18T17:00:00Z", home_id="1", away_id="3")
    assert scored["players"]["11"][-1][1] == 1
    assert scored["defenses"]["ATL"][0][1] == 10
    assert scored["defenses"]["ATL"][-1][1] == 11


def test_a_takeaway_belongs_to_the_team_on_the_play():
    plays = [play(
        "Pass Interception Return", 0, "INTERCEPTED",
        participants=[athlete("passer", "11")], team="1",
    )]
    scored = score_plays(plays, TEAMS, kickoff="2026-10-18T17:00:00Z", home_id="1", away_id="3")
    assert scored["defenses"]["ATL"][-1][1] == 12
    assert scored["defenses"]["CHI"][-1][1] == 10
    assert scored["players"]["11"][-1][1] == -2


def test_defense_points_fall_when_the_opponent_scores():
    plays = [play(
        "Passing Touchdown", 14, "TOUCHDOWN. extra point is GOOD",
        participants=[athlete("passer", "11"), athlete("receiver", "22"), athlete("kicker", "33")],
        away_score=7, pointAfterAttempt={"text": "Extra Point Good"},
    )]
    scored = score_plays(plays, TEAMS, kickoff="2026-10-18T17:00:00Z", home_id="1", away_id="3")
    assert [points for _, points in scored["defenses"]["ATL"]] == [10, 8]


def test_two_point_pass_scores_for_the_passer_and_the_catcher():
    plays = [play(
        "Passing Touchdown", 5, "TOUCHDOWN. TWO-POINT CONVERSION ATTEMPT. pass is complete.",
        participants=[athlete("passer", "11"), athlete("receiver", "22"), athlete("patPasser", "11"), athlete("patScorer", "44")],
        away_score=8, pointAfterAttempt={"text": "Two Point Pass"},
    )]
    scored = score_plays(plays, TEAMS, kickoff="2026-10-18T17:00:00Z", home_id="1", away_id="3")
    assert scored["players"]["11"][-1][1] == 6
    assert scored["players"]["44"][-1][1] == 2


def test_team_line_ends_on_the_official_total():
    plays = [play("Pass Reception", 80, participants=[athlete("passer", "11"), athlete("receiver", "22")])]
    scored = score_plays(plays, TEAMS, kickoff="2026-10-18T17:00:00Z", home_id="1", away_id="3")
    games = {"CHI": {"kickoff": "2026-10-18T17:00:00Z", "endedAt": "2026-10-18T20:00:00Z", "opponent": "ATL", "detail": "Final"}}
    series = team_series(
        [{"id": "11", "proTeam": "CHI", "position": "QB", "points": 16}],
        scored, games,
    )
    assert series["s"][0] == 0
    assert series["s"][-1] == 16
    assert series["p"][-1] is None
    document = live_document("premier", 2026, 6, "2026-10-21T00:00:00Z", games, [{
        "teamId": "16", "players": [{"id": "11", "proTeam": "CHI", "position": "QB", "points": 16}],
    }], scored)
    assert document["replayed"] is True
    assert document["series"]["16"]["s"][-1] == 16
    assert document["games"]["CHI"]["state"] == "post"


def test_a_long_line_keeps_its_final_score():
    plays = []
    for index in range(300):
        minute, second = divmod(index, 60)
        plays.append(play(
            "Rush", 10, participants=[athlete("rusher", "11")], sequence=index,
            at=f"2026-10-18T18:{minute:02d}:{second:02d}Z",
        ))
    scored = score_plays(plays, TEAMS, kickoff="2026-10-18T17:00:00Z", home_id="1", away_id="3")
    games = {"CHI": {"kickoff": "2026-10-18T17:00:00Z", "endedAt": "2026-10-18T20:00:00Z"}}
    document = live_document("premier", 2026, 6, "2026-10-21T00:00:00Z", games, [{
        "teamId": "16", "players": [{"id": "11", "proTeam": "CHI", "position": "RB", "points": 300}],
    }], scored)
    assert document["series"]["16"]["s"][0] == 0
    assert document["series"]["16"]["s"][-1] == 300
    assert 2 <= len(document["series"]["16"]["t"]) <= 240
