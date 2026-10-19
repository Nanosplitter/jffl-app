from datetime import datetime, timezone

from espn_adapter import game_progress, parse_nfl_scoreboard
from live_timeline import fold_live


def event(state, period, clock, display, name, home, away, date="2026-10-18T17:00:00Z", short=None):
    return {
        "date": date,
        "competitions": [{
            "date": date,
            "status": {
                "period": period,
                "clock": clock,
                "displayClock": display,
                "type": {"state": state, "name": name, "completed": state == "post", "shortDetail": short or display},
            },
            "competitors": [
                {"homeAway": "home", "team": {"abbreviation": home}},
                {"homeAway": "away", "team": {"abbreviation": away}},
            ],
        }],
    }


def test_scoreboard_parses_live_final_halftime_overtime_and_aliases():
    payload = {"events": [
        event("post", 4, 0, "0:00", "STATUS_FINAL", "JAX", "HOU"),
        event("in", 3, 252, "4:12", "STATUS_IN_PROGRESS", "DET", "DAL"),
        event("in", 2, 0, "0:00", "STATUS_HALFTIME", "KC", "BUF", short="Halftime"),
        event("in", 5, 480, "8:00", "STATUS_OVERTIME", "PHI", "NYG"),
        event("pre", 0, 0, "0:00", "STATUS_SCHEDULED", "WAS", "GB", date="2026-10-19T17:00:00Z", short="Sun 1:00"),
        {"competitions": [{"status": {"type": {"state": "in"}}, "competitors": [{"team": {"abbreviation": "NOPE"}}]}]},
    ]}
    games = parse_nfl_scoreboard(payload)
    assert games["JAX"]["state"] == "post"
    assert games["JAX"]["progress"] == 1
    assert games["JAX"]["detail"] == "Final"
    assert games["JAX"]["opponent"] == "HOU"
    assert games["HOU"]["opponent"] == "JAX"
    assert games["JAX"]["kickoff"] == "2026-10-18T17:00:00Z"
    assert games["DET"]["detail"] == "Q3 4:12"
    assert games["DET"]["progress"] == 0.68
    assert games["KC"]["progress"] == 0.5
    assert games["KC"]["detail"] == "Halftime"
    assert games["PHI"]["progress"] == 0.99
    assert games["PHI"]["detail"] == "OT 8:00"
    assert games["WSH"]["state"] == "pre"
    assert games["WSH"]["progress"] == 0
    assert games["WSH"]["opponent"] == "GB"
    assert "WAS" not in games
    assert "NOPE" not in games
    assert parse_nfl_scoreboard([]) == {}
    assert parse_nfl_scoreboard({"events": "nope"}) == {}


def test_game_progress_caps_the_end_of_regulation_until_the_final():
    assert game_progress({"period": 4, "clock": 0, "type": {"state": "in", "name": "STATUS_END_PERIOD"}}) == 0.99
    assert game_progress({"period": 4, "clock": 0, "type": {"state": "post", "completed": True}}) == 1
    assert game_progress({"type": {"state": "pre"}}) == 0


def summary(week, score, projected, away_score=4, away_projected=90):
    return {
        "slug": "premier", "season": 2026, "week": week,
        "matchups": [{
            "homeTeamId": "16", "awayTeamId": "34",
            "homeScore": score, "awayScore": away_score,
            "homeProjected": projected, "awayProjected": away_projected,
        }],
    }


def at(minute):
    return datetime(2026, 10, 18, 18, minute, tzinfo=timezone.utc)


def test_fold_live_appends_only_changes_and_keeps_nulls():
    first = fold_live(None, summary(6, None, None, None, None), {}, at(0))
    assert first["series"]["16"]["s"] == [None]
    assert first["series"]["16"]["p"] == [None]
    assert first["series"]["34"]["s"] == [None]
    assert fold_live(first, summary(6, None, None, None, None), {}, at(1)) is None
    second = fold_live(first, summary(6, 0, 100.5, None, None), {}, at(2))
    assert second["series"]["16"]["s"] == [None, 0]
    assert second["series"]["16"]["p"] == [None, 100.5]
    assert second["series"]["34"]["s"] == [None]
    assert second["series"]["34"]["p"] == [None]
    assert 0 in second["series"]["16"]["s"]


def test_fold_live_resets_on_a_new_week_and_thins_to_the_cap():
    previous = fold_live(None, summary(5, 10, 80), {}, at(0))
    reset = fold_live(previous, summary(6, 1, 70), {}, at(1))
    assert reset["week"] == 6
    assert reset["series"]["16"]["s"] == [1]
    current = reset
    for minute, score in enumerate(range(2, 8), start=2):
        current = fold_live(current, summary(6, score, 70), {}, at(minute), cap=3)
    assert current["series"]["16"]["s"][0] == 1
    assert current["series"]["16"]["s"][-1] == 7
    assert len(current["series"]["16"]["t"]) == 3


def test_fold_live_keeps_the_first_final_and_the_last_good_games():
    live = {"DET": {"kickoff": "2026-10-18T17:00:00Z", "state": "in", "detail": "Q1 10:00", "progress": 0.1, "opponent": "DAL"}}
    started = fold_live(None, summary(6, 1, 80), live, at(0))
    final = {"DET": {**live["DET"], "state": "post", "detail": "Final", "progress": 1}}
    ended = fold_live(started, summary(6, 2, 80), final, at(5))
    assert ended["games"]["DET"]["endedAt"] == "2026-10-18T18:05:00Z"
    again = fold_live(ended, summary(6, 3, 81), final, at(9))
    assert again["games"]["DET"]["endedAt"] == "2026-10-18T18:05:00Z"
    kept = fold_live(again, summary(6, 4, 82), None, at(12))
    assert kept["games"]["DET"]["state"] == "post"
    assert kept["gamesUpdatedAt"] == again["gamesUpdatedAt"]
