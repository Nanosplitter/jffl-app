"""Refresh each league independently; never replace a valid snapshot with an error."""
import logging
from espn_adapter import fetch_league, now_iso
from league_config import LEAGUES


def sync_leagues(store, fetch=fetch_league):
    outcomes = {}
    for slug in LEAGUES:
        try:
            summary, roster = fetch(slug)
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
