"""Refresh each league independently; never replace a valid snapshot with an error."""
import logging
from espn_adapter import fetch_league, now_iso
from league_config import LEAGUES


def _saved_projection(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def retain_projections(previous, summary):
    """Keep a matchup projection already published once ESPN stops sending it."""
    if not previous or not summary:
        return
    saved = {}
    for row in previous.get("weeklyMatchups") or []:
        saved[(row.get("week"), row.get("homeTeamId"), row.get("awayTeamId"))] = row
    for row in summary.get("weeklyMatchups") or []:
        prior = saved.get((row.get("week"), row.get("homeTeamId"), row.get("awayTeamId")))
        if not prior:
            continue
        for side in ("homeProjected", "awayProjected"):
            if row.get(side) is None and _saved_projection(prior.get(side)) is not None:
                row[side] = prior[side]


def sync_leagues(store, fetch=fetch_league):
    outcomes = {}
    for slug in LEAGUES:
        try:
            summary, roster = fetch(slug)
            retain_projections(store.latest(slug), summary)
            store.publish(slug, summary, roster)
            outcomes[slug] = "ok"
            logging.info("JFFL refreshed %s: %s teams, %s players", slug, len(summary["teams"]), len(roster["players"]))
        except Exception as error:
            # Publish no exception text, identity fields, or raw provider responses.
            try:
                store.mark_failed(slug, now_iso())
            except Exception as metadata_error:
                logging.error("JFFL failure status unavailable for %s (%s)", slug, type(metadata_error).__name__)
            outcomes[slug] = "error"
            logging.error("JFFL refresh failed for %s (%s)", slug, type(error).__name__)
    return outcomes
