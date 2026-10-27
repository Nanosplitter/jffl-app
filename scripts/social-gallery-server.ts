import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { handleGallery, handleImage, handlePage, type SocialStore } from '../functions-social/src/http.ts';
import type { LeagueRosterSnapshot, LeagueSlug, LeagueSummary } from '../src/types.ts';

const port = Number(process.env.SOCIAL_PORT || 4177);
const snapshot = await loadSnapshot();
const store: SocialStore = {
  async league(slug) { return snapshot.summaries[slug as LeagueSlug] ?? null; },
  async roster(slug) { return snapshot.rosters[slug as LeagueSlug] ?? null; },
  async share() { return null; },
  liveWeek: (season, week) => publicLiveWeek(season, week),
  timeline: (season, slug, week, past) => publicTimeline(season, slug, week, past),
  weeks: slug => publicWeeks(slug),
  lineups: slug => publicLineups(slug),
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const result = url.pathname === '/__social/gallery'
      ? await handleGallery(store, snapshot.note)
      : url.pathname === '/__social/card.png'
        ? await handleImage(url.searchParams.get('path') ?? '/', store)
        : await handlePage(url.pathname, url.search, req.headers.host, 'http', store, async () => snapshot.shell);
    res.writeHead(result.status, result.headers);
    res.end(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preview unavailable';
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(message);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Link preview gallery: http://127.0.0.1:${port}/__social/gallery`);
});

async function loadSnapshot() {
  const shell = await readFile('dist/index.html', 'utf8').catch(() => '<!doctype html><html><head></head><body><div id="root"></div></body></html>');
  try {
    const local = JSON.parse(await readFile('functions/local-data.json', 'utf8')) as { summaries?: Record<string, LeagueSummary>; rosters?: Record<string, LeagueRosterSnapshot> };
    if (local.summaries?.premier && local.rosters) {
      await attachPublicLogos(local.summaries);
      const stamp = local.summaries.premier.updatedAt ? ` from ${local.summaries.premier.updatedAt}` : '';
      return { summaries: local.summaries, rosters: local.rosters, shell, note: `Examples use the local league snapshot${stamp}.` };
    }
  } catch { /* The committed fixture is the review fallback. */ }
  return {
    summaries: JSON.parse(await readFile('tests/fixtures/week3-summaries.json', 'utf8')) as Record<string, LeagueSummary>,
    rosters: JSON.parse(await readFile('tests/fixtures/week3-rosters.json', 'utf8')) as Record<string, LeagueRosterSnapshot>,
    shell,
    note: 'Examples use the committed week 3 fixture because no local snapshot was available.',
  };
}

const fetched = new Map<string, Promise<unknown>>();

function once(key: string, load: () => Promise<unknown>) {
  const hit = fetched.get(key);
  if (hit) return hit;
  const pending = load().catch(() => null);
  fetched.set(key, pending);
  return pending;
}

function firestoreValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if ('nullValue' in row) return null;
  if (typeof row.stringValue === 'string') return row.stringValue;
  if (typeof row.booleanValue === 'boolean') return row.booleanValue;
  if (typeof row.integerValue === 'string' || typeof row.integerValue === 'number') return Number(row.integerValue);
  if (typeof row.doubleValue === 'number') return row.doubleValue;
  if (row.arrayValue && typeof row.arrayValue === 'object') {
    const values = (row.arrayValue as { values?: unknown[] }).values ?? [];
    return values.map(item => firestoreValue(item));
  }
  if (row.mapValue && typeof row.mapValue === 'object') {
    const fields = (row.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, firestoreValue(item)]));
  }
  return null;
}

async function publicDocument(path: string) {
  return once(path, async () => {
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/jffl-live-colin/databases/(default)/documents/${path}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const doc = await response.json() as { fields?: Record<string, unknown> };
    return Object.fromEntries(Object.entries(doc.fields ?? {}).map(([key, value]) => [key, firestoreValue(value)]));
  });
}

async function publicTimeline(season: number, slug: string, week: number, past: boolean) {
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18) return null;
  if (!['premier', 'championship', 'league-one'].includes(slug)) return null;
  const doc = await publicDocument(past ? `publicLiveWeeks/${season}-${slug}-${week}` : `publicLive/${slug}`) as { season?: unknown; week?: unknown; series?: unknown; games?: unknown } | null;
  if (!doc || doc.season !== season || doc.week !== week) return null;
  return { series: doc.series ?? {}, games: doc.games ?? {} };
}

async function publicWeeks(slug: string) {
  if (!['premier', 'championship', 'league-one'].includes(slug)) return null;
  const doc = await publicDocument(`publicLeagues/${slug}`) as { weeklyMatchups?: unknown } | null;
  return Array.isArray(doc?.weeklyMatchups) ? doc.weeklyMatchups : null;
}

async function publicLineups(slug: string) {
  if (!['premier', 'championship', 'league-one'].includes(slug)) return null;
  const doc = await publicDocument(`publicRosters/${slug}`) as { weeklyLineups?: unknown } | null;
  return Array.isArray(doc?.weeklyLineups) ? doc.weeklyLineups : null;
}

async function publicLiveWeek(season: number, week: number) {
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18) return null;
  try {
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/jffl-live-colin/databases/(default)/documents/publicLiveWeeks/${season}-premier-${week}`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const doc = await response.json() as { fields?: { games?: { mapValue?: { fields?: Record<string, { mapValue?: { fields?: Record<string, { stringValue?: string }> } }> } } } };
    const games: Record<string, { opponent: string | null; kickoff: string | null }> = {};
    for (const [team, value] of Object.entries(doc.fields?.games?.mapValue?.fields ?? {})) {
      const fields = value.mapValue?.fields;
      games[team] = { opponent: fields?.opponent?.stringValue ?? null, kickoff: fields?.kickoff?.stringValue ?? null };
    }
    return { games };
  } catch {
    return null;
  }
}

/** The saved snapshot can predate team logos. Fill any missing mark from the public league documents. */
async function attachPublicLogos(summaries: Record<string, LeagueSummary>) {
  await Promise.all(['premier', 'championship', 'league-one'].map(async slug => {
    const summary = summaries[slug];
    if (!summary?.teams?.length || summary.teams.every(team => team.logoUrl)) return;
    try {
      const response = await fetch(`https://firestore.googleapis.com/v1/projects/jffl-live-colin/databases/(default)/documents/publicLeagues/${slug}`, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) return;
      const doc = await response.json() as { fields?: { teams?: { arrayValue?: { values?: { mapValue?: { fields?: Record<string, { stringValue?: string }> } }[] } } } };
      const logos = new Map<string, string>();
      for (const value of doc.fields?.teams?.arrayValue?.values ?? []) {
        const fields = value.mapValue?.fields;
        const id = fields?.id?.stringValue;
        const logo = fields?.logoUrl?.stringValue;
        if (id && logo) logos.set(id, logo);
      }
      for (const team of summary.teams) {
        if (!team.logoUrl && logos.has(team.id)) team.logoUrl = logos.get(team.id) ?? null;
      }
    } catch { /* Initials remain when the public snapshot cannot be read. */ }
  }));
}
