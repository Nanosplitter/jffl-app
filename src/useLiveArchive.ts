import { useMemo } from 'react';
import { usePublicHistory, useRosters, useSummaries } from './data';
import { history } from './history/archive.ts';
import type { Archive } from './history/askTools.ts';
import { buildLiveSeason, type RosterMap } from './history/liveSeason.ts';
import { savedSeason } from './history/savedSeason.ts';
import type { SummaryMap } from './competitions.ts';
import { LEAGUES } from './types';

const SLUGS = LEAGUES.map(meta => meta.slug);
const NONE: typeof SLUGS = [];
const ARCHIVE_LAST = Math.max(...history.seasons.map(row => row.season));

/**
 * The bundled archive plus the season in progress, built from the shared league snapshots. Roster documents are
 * only read when `withRosters` is true, since only player questions need them.
 * `ready` turns true once every requested snapshot has loaded or failed.
 */
export function useLiveArchive(withRosters: boolean): { archive: Archive; ready: boolean } {
  const summaries = useSummaries();
  const rosters = useRosters(withRosters ? SLUGS : NONE);
  const latest = Math.max(ARCHIVE_LAST + 1, ...SLUGS.map(slug => summaries[slug].data?.season ?? 0));
  const years = Array.from({ length: latest - ARCHIVE_LAST }, (_, index) => ARCHIVE_LAST + 1 + index);
  const savedDocs = usePublicHistory(years);
  const key = SLUGS.map(slug => `${summaries[slug].data?.updatedAt ?? ''}|${rosters[slug]?.data?.updatedAt ?? ''}`).join(',');
  const savedKey = savedDocs.map(doc => `${doc.season}:${Object.values(doc.leagues).map(league => league?.updatedAt ?? '').join(',')}`).join('|');
  const ready = SLUGS.every(slug => !summaries[slug].loading && (!withRosters || (rosters[slug] !== undefined && !rosters[slug]!.loading)));
  const archive = useMemo<Archive>(() => {
    const summaryMap: SummaryMap = {};
    const rosterMap: RosterMap = {};
    for (const slug of SLUGS) {
      const summary = summaries[slug].data;
      const roster = rosters[slug]?.data;
      if (summary) summaryMap[slug] = summary;
      if (roster) rosterMap[slug] = roster;
    }
    const live = buildLiveSeason(summaryMap, rosterMap);
    const saved = savedDocs.map(savedSeason).filter((item): item is NonNullable<ReturnType<typeof savedSeason>> => !!item).map(item => item.live);
    return { ...history, live: live && live.season > ARCHIVE_LAST ? live : null, saved };
    // The snapshot times change whenever the data does, so they stand in for the snapshot objects.
  }, [key, savedKey]);
  return { archive, ready };
}
