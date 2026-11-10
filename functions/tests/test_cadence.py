import copy
from datetime import datetime, timedelta, timezone

from cadence import decide
from espn_adapter import fetch_live_scores, matchup_period_map
from sync_service import handle_nudge, merge_live_snapshot, run_scheduled, sync_live

T0 = datetime(2026, 11, 8, 18, 0, tzinfo=timezone.utc)
KICK = "2026-11-08T18:00:00Z"


def at(delta):
    return (T0 + delta).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slate(**overrides):
    document = {
        "lastStatus": "ok",
        "lastFullAt": at(timedelta(minutes=-20)),
        "lastLiveAt": at(timedelta(minutes=-20)),
        "lastAttemptAt": at(timedelta(minutes=-20)),
        "games": {"KC": {"state": "post", "kickoff": KICK}},
    }
    document.update(overrides)
    return document


def live_games():
    return {"KC": {"state": "in", "kickoff": KICK}}


def test_live_and_watching_is_due_at_30_seconds():
    watching = T0
    ready = slate(games=live_games(), lastLiveAt=at(timedelta(seconds=-30)), lastFullAt=at(timedelta(minutes=-5)))
    early = slate(games=live_games(), lastLiveAt=at(timedelta(seconds=-29)), lastFullAt=at(timedelta(minutes=-5)))
    assert decide(T0, ready, watching, "nudge") == "live"
    assert decide(T0, early, watching, "nudge") == "skip"
    assert decide(T0, ready, watching, "scheduler") == "live"


def test_an_unwatched_live_game_waits_five_minutes_and_a_full_sync_is_fifteen():
    idle = None
    scores = slate(games=live_games(), lastLiveAt=at(timedelta(minutes=-5)), lastFullAt=at(timedelta(minutes=-14)))
    assert decide(T0, scores, idle, "scheduler") == "live"
    assert decide(T0, slate(games=live_games(), lastLiveAt=at(timedelta(minutes=-4)), lastFullAt=at(timedelta(minutes=-4))), idle, "scheduler") == "skip"
    both = slate(games=live_games(), lastLiveAt=at(timedelta(minutes=-5)), lastFullAt=at(timedelta(minutes=-15)))
    assert decide(T0, both, idle, "scheduler") == "full"
    assert decide(T0, both, T0, "nudge") == "live"


def test_quiet_intervals_follow_whether_someone_is_looking():
    quiet = slate()
    assert decide(T0, slate(lastFullAt=at(timedelta(minutes=-10))), T0, "scheduler") == "full"
    assert decide(T0, slate(lastFullAt=at(timedelta(minutes=-9))), T0, "scheduler") == "skip"
    assert decide(T0, slate(lastFullAt=at(timedelta(minutes=-60))), None, "scheduler") == "full"
    assert decide(T0, slate(lastFullAt=at(timedelta(minutes=-59))), None, "scheduler") == "skip"
    assert decide(T0, quiet, T0, "nudge") == "skip"


def test_a_kickoff_that_already_passed_is_treated_as_soon():
    passed = slate(games={"KC": {"state": "pre", "kickoff": at(timedelta(minutes=-1))}}, lastLiveAt=at(timedelta(minutes=-5)), lastFullAt=at(timedelta(minutes=-5)))
    upcoming = slate(games={"KC": {"state": "pre", "kickoff": at(timedelta(minutes=15))}}, lastLiveAt=at(timedelta(minutes=-5)), lastFullAt=at(timedelta(minutes=-5)))
    later = slate(games={"KC": {"state": "pre", "kickoff": at(timedelta(minutes=16))}}, lastFullAt=at(timedelta(minutes=-30)))
    assert decide(T0, passed, None, "scheduler") == "live"
    assert decide(T0, upcoming, None, "scheduler") == "live"
    assert decide(T0, later, None, "scheduler") == "skip"


def test_a_missing_slate_runs_a_full_sync_and_a_nudge_does_not():
    assert decide(T0, None, None, "scheduler") == "full"
    assert decide(T0, None, T0, "nudge") == "skip"


def test_a_failed_attempt_retries_within_ten_minutes():
    failed = slate(lastStatus="error", lastFullAt=at(timedelta(hours=-2)), lastAttemptAt=at(timedelta(minutes=-5)))
    due = slate(lastStatus="error", lastFullAt=at(timedelta(hours=-2)), lastAttemptAt=at(timedelta(minutes=-10)))
    assert decide(T0, failed, None, "scheduler") == "skip"
    assert decide(T0, due, None, "scheduler") == "full"
    unknown = {"lastStatus": "error", "lastAttemptAt": at(timedelta(minutes=-9))}
    assert decide(T0, unknown, None, "scheduler") == "skip"
    assert decide(T0, {"lastStatus": "error", "lastAttemptAt": at(timedelta(minutes=-10))}, None, "scheduler") == "full"


def _summary():
    return {
        "schemaVersion": 1, "leagueId": "1", "slug": "premier", "leagueName": "Premier League",
        "season": 2026, "week": 6, "updatedAt": "old", "lastAttemptAt": "old", "refreshStatus": "ok",
        "teams": [{"id": "1", "name": "A"}, {"id": "2", "name": "B"}],
        "matchups": [{"id": "6-0", "homeTeamId": "1", "awayTeamId": "2", "homeScore": 1, "awayScore": None, "homeProjected": 90, "awayProjected": 80}],
        "scoring": [],
        "weeklyMatchups": [
            {"id": "2-1", "week": 2, "status": "final", "homeTeamId": "1", "awayTeamId": "2", "homeScore": 10, "awayScore": 8, "homeProjected": None, "awayProjected": None},
            {"id": "6-0", "week": 6, "status": "live", "homeTeamId": "1", "awayTeamId": "2", "homeScore": 1, "awayScore": None, "homeProjected": 90, "awayProjected": 80},
        ],
    }


def _roster():
    return {
        "schemaVersion": 1, "leagueId": "1", "slug": "premier", "leagueName": "Premier League",
        "season": 2026, "week": 6, "updatedAt": "old", "lastAttemptAt": "old", "refreshStatus": "ok",
        "players": [
            {"id": "9", "teamId": "1", "name": "Pat", "weekPoints": 1, "weekStats": {}, "weeklyStats": [
                {"week": 2, "points": 10, "stats": {"Pass yards": 200}},
                {"week": 6, "points": 1, "stats": {}},
            ]},
            {"id": "8", "teamId": "2", "name": "Sam", "weekPoints": None},
        ],
        "weeklyLineups": [
            {"week": 2, "teamId": "1", "players": [{"id": "9", "name": "Pat", "position": "QB", "proTeam": "KC", "slot": "QB", "points": 10, "locked": {"reason": "out", "at": "2026-09-18T00:00:00Z"}}]},
            {"week": 6, "teamId": "1", "players": [{"id": "9", "name": "Pat", "position": "QB", "proTeam": "KC", "slot": "QB", "points": 1}]},
        ],
    }


class Store:
    def __init__(self):
        self.snapshots = {}
        self.live = {}
        self.weeks = {}
        self._slate = None
        self.seen = None

    def latest(self, slug):
        row = self.snapshots.get(slug)
        return copy.deepcopy(row[0]) if row else None

    def latest_roster(self, slug):
        row = self.snapshots.get(slug)
        return copy.deepcopy(row[1]) if row else None

    def publish(self, slug, summary, roster):
        self.snapshots[slug] = (copy.deepcopy(summary), copy.deepcopy(roster))

    def latest_live(self, slug):
        return copy.deepcopy(self.live.get(slug))

    def publish_live(self, slug, document):
        self.live[slug] = copy.deepcopy(document)

    def publish_live_week(self, season, slug, week, document):
        self.weeks[f"{season}-{slug}-{week}"] = copy.deepcopy(document)

    def slate(self):
        return copy.deepcopy(self._slate) if self._slate else None

    def save_slate(self, document):
        self._slate = copy.deepcopy(document)

    def audience_seen(self):
        return self.seen

    def mark_audience(self, seen):
        self.seen = seen

    def mark_failed(self, slug, seen):
        if slug in self.snapshots:
            for snapshot in self.snapshots[slug]:
                snapshot.update(refreshStatus="error", lastAttemptAt=seen)


def test_live_tick_keeps_past_weeks_and_appends_a_changed_score():
    summary, roster = _summary(), _roster()
    incoming = {
        "week": 6,
        "matchups": [{"homeTeamId": "1", "awayTeamId": "2", "homeScore": 4, "awayScore": None, "homeProjected": 88, "awayProjected": None}],
        "players": [{"teamId": "1", "id": "9", "weekPoints": 3.5, "weekStats": {"Pass yards": 40}}],
    }
    merged, next_roster, changed = merge_live_snapshot(summary, roster, incoming, T0)
    assert changed
    assert merged["weeklyMatchups"][0]["homeScore"] == 10
    assert merged["weeklyMatchups"][0]["status"] == "final"
    assert merged["matchups"][0]["homeScore"] == 4
    assert merged["matchups"][0]["awayScore"] is None
    assert merged["matchups"][0]["awayProjected"] == 80
    assert next_roster["weeklyLineups"][0]["players"][0]["points"] == 10
    assert next_roster["weeklyLineups"][0]["players"][0]["locked"]["reason"] == "out"
    assert next_roster["weeklyLineups"][1]["players"][0]["points"] == 3.5
    assert next_roster["players"][0]["weeklyStats"][0]["points"] == 10
    assert next_roster["players"][0]["weekPoints"] == 3.5
    untouched = merge_live_snapshot(merged, next_roster, {"week": 6, "matchups": [{"homeTeamId": "1", "awayTeamId": "2", "homeScore": None, "awayScore": None}], "players": []}, T0)
    assert untouched[2] is False
    assert untouched[0]["matchups"][0]["homeScore"] == 4

    store = Store()
    store.publish("premier", summary, roster)
    calls = []

    def live_fetch(slug, week, period):
        calls.append((slug, week, period))
        return incoming

    def games_for(week):
        assert week == 6
        return {"KC": {"state": "in", "kickoff": KICK, "detail": "Q1", "progress": 0.1, "opponent": "BAL"}}

    assert sync_live(store, live_fetch, games_for, T0, {})["premier"] == "ok"
    assert calls == [("premier", 6, 6)]
    assert store.snapshots["premier"][1]["weeklyLineups"][0]["players"][0]["points"] == 10
    assert store.live["premier"]["series"]["1"]["s"] == [4]
    assert store.weeks["2026-premier-6"]["series"]["1"]["s"] == [4]
    assert "2" not in store.weeks


def test_nudge_on_a_quiet_slate_does_not_fetch_and_a_live_game_fetches_once():
    store = Store()
    store.publish("premier", _summary(), _roster())
    store.save_slate(slate())
    calls = []
    assert handle_nudge(store, T0, lambda *args: calls.append(args)) == "skip"
    assert calls == []
    assert store.seen == at(timedelta(0))

    store.save_slate(slate(games=live_games(), lastLiveAt=at(timedelta(minutes=-5)), lastFullAt=at(timedelta(minutes=-5))))
    assert handle_nudge(store, T0, lambda *args: calls.append(args) or {"week": 6, "matchups": [], "players": []}) == "live"
    assert handle_nudge(store, T0 + timedelta(seconds=10), lambda *args: calls.append(args)) == "skip"
    assert calls == [("premier", 6, 6)]


def test_a_scheduled_quiet_hour_does_not_fetch():
    store = Store()
    store.publish("premier", _summary(), _roster())
    store.save_slate(slate(lastFullAt=at(timedelta(minutes=-30))))
    calls = []
    assert run_scheduled(store, T0, fetch=lambda slug: calls.append(slug)) == "skip"
    assert calls == []


def test_matchup_periods_and_the_live_fetch_stay_on_one_week(monkeypatch):
    class Boundary:
        raw_settings = {"scheduleSettings": {"matchupPeriods": {"15": [15, 16], "6": [6]}}}

    assert matchup_period_map(Boundary()) == {"15": 15, "16": 15, "6": 6}
    calls = []

    class Fake:
        def __init__(self, league_id, year):
            self.session = self
            assert league_id and year

        def close(self):
            pass

        def scoring_period_schedule(self, week, period):
            calls.append((week, period))
            return [{"home": {"teamId": 1, "totalPointsLive": 2, "totalProjectedPointsLive": 3}, "away": {"teamId": 2}}]

    monkeypatch.setattr("espn_adapter.BoundedRequests", Fake)
    view = fetch_live_scores("premier", 6, 6)
    assert calls == [(6, 6)]
    assert view["matchups"][0]["homeScore"] == 2
    assert view["matchups"][0]["awayScore"] is None
