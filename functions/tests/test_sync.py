import copy
from types import SimpleNamespace

import pytest
from espn_adapter import BoundedRequests, normalize_player, validate_snapshot, weekly_matchups
from sync_service import sync_leagues


class MemoryStore:
    def __init__(self):
        self.snapshots = {}

    def publish(self, slug, summary, roster):
        self.snapshots[slug] = (copy.deepcopy(summary), copy.deepcopy(roster))

    def mark_failed(self, slug, stamp):
        if slug in self.snapshots:
            for snapshot in self.snapshots[slug]:
                snapshot.update(refreshStatus="error", lastAttemptAt=stamp)


def test_provider_failure_preserves_snapshot_and_continues_other_leagues():
    store = MemoryStore()
    old = {"updatedAt": "old-success", "refreshStatus": "ok", "teams": [{"id": "1"}]}
    store.publish("championship", old, {"updatedAt": "old-success", "players": [{"id": "42"}]})

    def fetch(slug):
        if slug == "championship":
            raise TimeoutError("provider failure")
        return {"updatedAt": "new-success", "teams": [{"id": "2"}]}, {"players": [{"id": "1"}]}

    assert sync_leagues(store, fetch) == {"premier": "ok", "championship": "error", "league-one": "ok"}
    assert store.snapshots["championship"][0]["updatedAt"] == "old-success"
    assert store.snapshots["championship"][1]["players"] == [{"id": "42"}]
    assert store.snapshots["championship"][0]["refreshStatus"] == "error"
    assert store.snapshots["league-one"][0]["updatedAt"] == "new-success"


def test_failure_to_record_error_does_not_stop_other_leagues():
    class FailingMetadataStore(MemoryStore):
        def mark_failed(self, slug, stamp):
            raise ConnectionError("temporary database failure")

    store = FailingMetadataStore()

    def fetch(slug):
        if slug == "premier":
            raise TimeoutError()
        return {"teams": [{"id": "1"}]}, {"players": [{"id": "2"}]}

    assert sync_leagues(store, fetch) == {"premier": "error", "championship": "ok", "league-one": "ok"}
    assert "league-one" in store.snapshots


@pytest.mark.parametrize("slot,group", [("BE", "bench"), ("IR", "ir"), ("D/ST", "starter"), ("RB/WR/TE", "starter")])
def test_lineup_and_missing_values(slot, group):
    player = SimpleNamespace(playerId=-16016, name="Vikings D/ST", position="D/ST", proTeam="MIN",
                             eligibleSlots=["D/ST", "BE", "IR"], lineupSlot=slot)
    result = normalize_player(player, 29, 3, {})
    assert result["id"] == "-16016"
    assert result["group"] == group
    assert result["projectedPoints"] is None
    assert result["seasonPoints"] is None
    assert result["weekPoints"] is None


def test_stat_ids_do_not_confuse_yards_and_yards_per_game():
    player = SimpleNamespace(playerId=1, name="Player", position="RB", proTeam="BAL",
                             eligibleSlots=["RB"], lineupSlot="RB")
    raw = {"stats": [{"seasonId": 2026, "scoringPeriodId": 0, "statSourceId": 0,
                      "statSplitTypeId": 0, "appliedTotal": 90, "stats": {"24": 301, "40": 100.33}}]}
    result = normalize_player(player, 1, 3, raw)
    assert result["seasonStats"]["Rush yards"] == 301
    assert result["seasonPoints"] == 90


def test_capture_preserves_season_stats_when_box_scores_only_supply_week():
    boundary = BoundedRequests(1, 2026)
    boundary._capture({"teams": [{"roster": {"entries": [{"playerPoolEntry": {"player": {
        "id": 1, "stats": [{"scoringPeriodId": 0, "statSourceId": 0, "appliedTotal": 30}]}}}]}}]})
    boundary._capture({"schedule": [{"home": {"rosterForCurrentScoringPeriod": {"entries": [{"playerPoolEntry": {"player": {
        "id": 1, "stats": [{"scoringPeriodId": 3, "statSourceId": 0, "appliedTotal": 10}]}}}]}}}]})
    assert len(boundary.raw_players["1"]["stats"]) == 2
    boundary.session.close()


def test_invalid_snapshot_cannot_be_published():
    summary = {"teams": [{"id": "1"}], "matchups": []}
    with pytest.raises(ValueError):
        validate_snapshot(summary, {"players": [{"teamId": "2", "id": "1", "name": "Wrong owner"}]})
    with pytest.raises(ValueError):
        validate_snapshot(summary, {"players": [{"teamId": "1", "id": "1", "name": "x" * 710_000}]})


def test_requests_have_timeouts_and_do_not_retry_auth_failures(monkeypatch):
    import requests
    calls = []
    boundary = BoundedRequests(1, 2026)

    def denied(*args, **kwargs):
        calls.append(kwargs)
        response = requests.Response()
        response.status_code = 403
        response.url = "https://espn.example/league"
        return response

    monkeypatch.setattr(boundary.session, "get", denied)
    with pytest.raises(requests.HTTPError):
        boundary.league_get()
    assert len(calls) == 1
    assert calls[0]["timeout"] == (3, 10)
    boundary.session.close()


def test_week_history_uses_scoring_period_points_and_keeps_future_scores_absent():
    boundary = BoundedRequests(1, 2026)
    boundary.raw_settings = {'scheduleSettings': {'matchupPeriods': {'1': [1], '2': [2], '3': [3]}}}
    boundary.raw_schedule = {
        '1': {'id':1,'matchupPeriodId':1,'winner':'HOME','home':{'teamId':1,'totalPoints':100,'pointsByScoringPeriod':{'1':100}},'away':{'teamId':2,'totalPoints':80,'pointsByScoringPeriod':{'1':80}}},
        '2': {'id':2,'matchupPeriodId':2,'winner':'UNDECIDED','home':{'teamId':1,'totalPoints':0,'totalPointsLive':17,'pointsByScoringPeriod':{'2':17}},'away':{'teamId':2,'totalPoints':0,'totalPointsLive':0,'pointsByScoringPeriod':{'2':0}}},
        '3': {'id':3,'matchupPeriodId':3,'winner':'UNDECIDED','home':{'teamId':1,'totalPoints':0},'away':{'teamId':2,'totalPoints':0}},
    }
    rows=weekly_matchups(boundary,2)
    assert len(rows)==2
    assert rows[0]['status']=='final'
    assert rows[1]['status']=='live'
    assert rows[1]['homeScore']==17
    assert rows[1]['awayScore']==0
    boundary.session.close()
