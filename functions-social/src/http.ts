import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { galleryEntries, injectSocialMeta, matchupChartRequest, previewReads, requestOrigin, resolvePreview, type PreviewData, type SocialPreview } from '../../src/socialPreview.ts';
import type { LeagueSlug, LiveGame, Matchup, ScoreSeries, WeekLineup } from '../../src/types.ts';
import { logoDataUrl, renderPreviewPng } from './card.ts';
import { galleryPage, type GalleryView } from './galleryPage.ts';
import { fetchLogo } from './logos.ts';

export interface SocialStore {
  league(slug: string): Promise<unknown>;
  roster(slug: string): Promise<unknown>;
  share(id: string): Promise<unknown>;
  liveWeek?(season: number, week: number): Promise<unknown>;
  timeline?(season: number, slug: string, week: number, past: boolean): Promise<unknown>;
  weeks?(slug: string): Promise<unknown>;
  lineups?(slug: string): Promise<unknown>;
}

export interface SocialResult {
  status: number;
  headers: Record<string, string>;
  body: string | Buffer;
}

const HTML = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=60, s-maxage=120',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
const PNG = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=120, s-maxage=300',
  'X-Content-Type-Options': 'nosniff',
};

let shellCache: { at: number; html: string } | null = null;

export async function handlePage(urlPath: string, search: string, host: string | undefined, proto: string | undefined, store: SocialStore, readShell: (origin: string) => Promise<string> = loadShell): Promise<SocialResult> {
  const origin = requestOrigin(host, proto);
  try {
    const data = await loadPreviewData(store, urlPath.includes('?') || !search ? urlPath : `${urlPath}${search.startsWith('?') ? search : `?${search}`}`);
    const preview = resolvePreview(urlPath, search, data);
    const html = injectSocialMeta(await readShell(origin), preview, origin);
    const headers = preview.robots === 'noindex' ? { ...HTML, 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' } : HTML;
    return { status: 200, headers, body: html };
  } catch {
    const preview = resolvePreview('/', '', {});
    const html = injectSocialMeta(fallbackShell(), preview, origin);
    return { status: 200, headers: HTML, body: html };
  }
}

export async function handleImage(target: string, store: SocialStore, readLogo: (url: string | null) => Promise<Uint8Array | null> = fetchLogo): Promise<SocialResult> {
  try {
    const preview = await previewFor(target, store);
    const png = await renderCard(preview, readLogo);
    return { status: 200, headers: PNG, body: png };
  } catch {
    return { status: 302, headers: { Location: '/og.png', 'Cache-Control': 'no-store' }, body: '' };
  }
}

export async function handleGallery(store: SocialStore, sourceNote: string, readLogo: (url: string | null) => Promise<Uint8Array | null> = fetchLogo): Promise<SocialResult> {
  const data = await loadGalleryData(store);
  const source = data.chartWeek ? `${sourceNote} The matchday example is week ${data.chartWeek}, which has finished.` : sourceNote;
  const views: GalleryView[] = [];
  for (const entry of galleryEntries(data)) {
    const preview = resolvePreview(entry.path, '', data);
    const logos = await loadLogos(preview, readLogo);
    const [png, square] = await Promise.all([
      renderPreviewPng(preview, logos, 'wide'),
      renderPreviewPng(preview, logos, 'square'),
    ]);
    views.push({
      label: entry.label,
      note: entry.note,
      path: entry.path,
      imageUrl: `/__social/card.png?path=${encodeURIComponent(entry.path)}&v=${preview.version}`,
      image: `data:image/png;base64,${png.toString('base64')}`,
      squareImage: `data:image/png;base64,${square.toString('base64')}`,
      preview,
    });
  }
  return {
    status: 200,
    headers: { ...HTML, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    body: galleryPage(views, source),
  };
}

export async function loadPreviewData(store: SocialStore, pathname: string): Promise<PreviewData> {
  const read = previewReads(pathname.split('?')[0]);
  const leagues: NonNullable<PreviewData['leagues']> = {};
  const rosters: NonNullable<PreviewData['rosters']> = {};
  await Promise.all([
    ...read.leagues.map(async slug => {
      const value = await store.league(slug).catch(() => null);
      if (isSummary(value, slug)) leagues[slug] = value;
    }),
    ...read.rosters.map(async slug => {
      const value = await store.roster(slug).catch(() => null);
      if (isRoster(value, slug)) rosters[slug] = value;
    }),
  ]);
  let share: PreviewData['share'] = null;
  if (read.shareId) {
    const value = await store.share(read.shareId).catch(() => null);
    if (isShare(value)) share = { title: value.title, createdAt: typeof value.createdAt === 'string' ? value.createdAt : '', excerpt: typeof value.excerpt === 'string' ? value.excerpt.slice(0, 500) : '' };
  }
  const games = await loadLiveGames(store, pathname, rosters);
  const matchday = await loadMatchdayContext(store, pathname, leagues, rosters);
  return { leagues, rosters, share, games, ...matchday };
}

export async function loadGalleryData(store: SocialStore): Promise<PreviewData> {
  const slugs = ['premier', 'championship', 'league-one'] as const;
  const data = await loadPreviewData({
    league: slug => store.league(slug),
    roster: slug => store.roster(slug),
    share: async () => null,
  }, '/players/gallery-preview');
  const leagues: NonNullable<PreviewData['leagues']> = { ...data.leagues };
  const rosters: NonNullable<PreviewData['rosters']> = { ...data.rosters };
  await Promise.all(slugs.map(async slug => {
    if (!leagues[slug]) {
      const value = await store.league(slug).catch(() => null);
      if (isSummary(value, slug)) leagues[slug] = value;
    }
  }));
  const roster = rosters.premier ?? Object.values(rosters).find(Boolean);
  const games = roster && store.liveWeek ? gamesFrom(await store.liveWeek(roster.season, roster.week).catch(() => null)) : {};
  const current = leagues.premier?.week ?? roster?.week ?? 0;
  const cardWeek = current > 0 && current < 7 ? 7 : current;
  const matchday = cardWeek ? await loadMatchdayContext(store, `/matchday/premier/34?week=${cardWeek}`, leagues, rosters) : {};
  return { leagues, rosters, share: null, games, ...matchday, ...(cardWeek && cardWeek !== current ? { chartWeek: cardWeek } : {}) };
}

async function previewFor(target: string, store: SocialStore) {
  const value = target.startsWith('/') && target.length <= 400 && !target.includes('\\') ? target : '/';
  const data = await loadPreviewData(store, value);
  return resolvePreview(value, '', data);
}

async function renderCard(preview: SocialPreview, readLogo: (url: string | null) => Promise<Uint8Array | null>) {
  return renderPreviewPng(preview, await loadLogos(preview, readLogo), 'wide');
}

async function loadLogos(preview: SocialPreview, readLogo: (url: string | null) => Promise<Uint8Array | null>) {
  const urls = [...new Set([
    ...preview.sides.map(side => side.logoUrl),
    ...preview.facts.map(fact => fact.logoUrl ?? null),
    ...preview.lines.map(line => line.logoUrl),
    ...preview.bouts.flatMap(bout => [bout.away.logoUrl, bout.home.logoUrl]),
  ].filter((url): url is string => !!url))];
  const logos: Record<string, string | null> = {};
  await Promise.all(urls.map(async url => {
    const bytes = await readLogo(url);
    logos[url] = bytes ? await logoDataUrl(bytes) : null;
  }));
  return logos;
}

export async function loadShell(origin: string) {
  const now = Date.now();
  if (shellCache && now - shellCache.at < 300_000) return shellCache.html;
  for (const url of [`${origin}/index.html`, 'https://jffl.org/index.html']) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
      const html = await response.text();
      if (response.ok && html.includes('id="root"')) {
        shellCache = { at: now, html };
        return html;
      }
    } catch { /* The bundled shell is the next copy. */ }
  }
  try {
    const bundled = await readFile(join(process.cwd(), 'shell', 'index.html'), 'utf8');
    if (bundled.includes('id="root"')) return bundled;
  } catch { /* A minimal shell still carries the preview text. */ }
  return fallbackShell();
}

function fallbackShell() {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>';
}

function isSummary(value: unknown, slug: LeagueSlug): value is NonNullable<PreviewData['leagues']>[LeagueSlug] {
  if (!value || typeof value !== 'object') return false;
  const doc = value as { schemaVersion?: unknown; slug?: unknown; teams?: unknown; matchups?: unknown; updatedAt?: unknown };
  return doc.schemaVersion === 1 && doc.slug === slug && Array.isArray(doc.teams) && Array.isArray(doc.matchups) && typeof doc.updatedAt === 'string';
}

function isRoster(value: unknown, slug: LeagueSlug): value is NonNullable<PreviewData['rosters']>[LeagueSlug] {
  if (!value || typeof value !== 'object') return false;
  const doc = value as { schemaVersion?: unknown; slug?: unknown; players?: unknown; updatedAt?: unknown };
  return doc.schemaVersion === 1 && doc.slug === slug && Array.isArray(doc.players) && typeof doc.updatedAt === 'string';
}

async function loadMatchdayContext(store: SocialStore, pathname: string, leagues: NonNullable<PreviewData['leagues']>, rosters: NonNullable<PreviewData['rosters']>): Promise<Pick<PreviewData, 'weeks' | 'timeline' | 'timelineWeek'>> {
  const parts = pathname.split('?')[0].split('/').filter(Boolean);
  const chartable = (parts[0] === 'matchday' && !!parts[2]) || (parts[0] === 'league' && parts[2] === 'match' && !!parts[3]) || (parts[0] === 'cups' && parts[2] === 'match' && !!parts[3]);
  if (!chartable || !store.timeline) return {};
  const summary = leagues.premier ?? leagues.championship ?? leagues['league-one'];
  const season = summary?.season;
  if (!season) return {};
  const slugs = ['premier', 'championship', 'league-one'] as const;
  const weeks: NonNullable<PreviewData['weeks']> = {};
  if (store.weeks) {
    await Promise.all(slugs.map(async slug => {
      const parsed = normalizeWeeks(await store.weeks!(slug).catch(() => null));
      if (parsed?.length) weeks[slug] = parsed;
    }));
  }
  const request = matchupChartRequest(pathname, { leagues, rosters, ...(Object.keys(weeks).length ? { weeks } : {}) });
  if (!request) return Object.keys(weeks).length ? { weeks } : {};
  const timeline: NonNullable<PreviewData['timeline']> = {};
  await Promise.all(slugs.map(async slug => {
    const value = await store.timeline!(season, slug, request.week, request.past).catch(() => null);
    const parsed = normalizeTimeline(value);
    if (parsed) timeline[slug] = parsed;
  }));
  if (store.lineups) {
    await Promise.all(slugs.map(async slug => {
      const roster = rosters[slug];
      if (!roster || roster.weeklyLineups?.some(item => item.week === request.week)) return;
      const parsed = normalizeLineups(await store.lineups!(slug).catch(() => null));
      if (parsed?.length) rosters[slug] = { ...roster, weeklyLineups: parsed };
    }));
  }
  return {
    ...(Object.keys(weeks).length ? { weeks } : {}),
    ...(Object.keys(timeline).length ? { timeline, timelineWeek: request.week } : {}),
  };
}

function normalizeTimeline(value: unknown): { series: Record<string, ScoreSeries>; games: Record<string, LiveGame> } | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as { series?: unknown; games?: unknown };
  const series: Record<string, ScoreSeries> = {};
  if (doc.series && typeof doc.series === 'object') {
    for (const [id, row] of Object.entries(doc.series)) {
      const parsed = seriesFrom(row);
      if (parsed) series[id] = parsed;
    }
  }
  if (!Object.keys(series).length) return null;
  const games: Record<string, LiveGame> = {};
  if (doc.games && typeof doc.games === 'object') {
    for (const [team, row] of Object.entries(doc.games)) {
      if (!/^[A-Za-z]{2,3}$/.test(team) || !row || typeof row !== 'object') continue;
      const game = row as { kickoff?: unknown; state?: unknown; detail?: unknown; progress?: unknown; opponent?: unknown; endedAt?: unknown };
      const state = game.state === 'pre' || game.state === 'in' || game.state === 'post' ? game.state : 'pre';
      games[team.toUpperCase()] = {
        kickoff: typeof game.kickoff === 'string' ? game.kickoff : null,
        state,
        detail: typeof game.detail === 'string' ? game.detail : '',
        progress: finite(game.progress) ?? 0,
        opponent: typeof game.opponent === 'string' ? game.opponent : null,
        ...(typeof game.endedAt === 'string' ? { endedAt: game.endedAt } : {}),
      };
    }
  }
  return { series, games };
}

function seriesFrom(value: unknown): ScoreSeries | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { t?: unknown; s?: unknown; p?: unknown };
  if (!Array.isArray(row.t) || !Array.isArray(row.s)) return null;
  const t = row.t.map(item => finite(item)).filter((item): item is number => item != null);
  if (t.length < 2 || t.length !== row.t.length) return null;
  const samples = (items: unknown) => t.map((_, index) => Array.isArray(items) ? finite(items[index]) : null);
  return { t, s: samples(row.s), p: samples(row.p) };
}

function normalizeWeeks(value: unknown): (Matchup & { week: number; status: 'live' | 'final' | 'pending' })[] | null {
  if (!Array.isArray(value)) return null;
  const rows: (Matchup & { week: number; status: 'live' | 'final' | 'pending' })[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const week = finite(row.week);
    if (week == null) continue;
    const status = row.status === 'live' || row.status === 'pending' || row.status === 'final' ? row.status : 'final';
    rows.push({
      id: typeof row.id === 'string' ? row.id : String(week),
      week,
      status,
      homeTeamId: typeof row.homeTeamId === 'string' ? row.homeTeamId : null,
      awayTeamId: typeof row.awayTeamId === 'string' ? row.awayTeamId : null,
      homeScore: finite(row.homeScore),
      awayScore: finite(row.awayScore),
      homeProjected: finite(row.homeProjected),
      awayProjected: finite(row.awayProjected),
    });
  }
  return rows;
}

function normalizeLineups(value: unknown): WeekLineup[] | null {
  if (!Array.isArray(value)) return null;
  const rows: WeekLineup[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as { week?: unknown; teamId?: unknown; players?: unknown };
    const week = finite(row.week);
    if (week == null || typeof row.teamId !== 'string' || !Array.isArray(row.players)) continue;
    rows.push({
      week,
      teamId: row.teamId,
      players: row.players.flatMap(player => {
        if (!player || typeof player !== 'object') return [];
        const person = player as { id?: unknown; name?: unknown; position?: unknown; proTeam?: unknown; slot?: unknown; points?: unknown };
        if (typeof person.id !== 'string' || typeof person.name !== 'string') return [];
        return [{
          id: person.id,
          name: person.name,
          position: typeof person.position === 'string' ? person.position : '',
          proTeam: typeof person.proTeam === 'string' ? person.proTeam : '',
          slot: typeof person.slot === 'string' ? person.slot : '',
          points: finite(person.points),
        }];
      }),
    });
  }
  return rows;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function loadLiveGames(store: SocialStore, pathname: string, rosters: NonNullable<PreviewData['rosters']>) {
  const piece = pathname.split('?')[0].split('/').filter(Boolean)[1];
  if (!store.liveWeek || !pathname.startsWith('/players/') || !piece || ['premier', 'championship', 'league-one'].includes(piece)) return {};
  const roster = Object.values(rosters).find(item => item?.players.some(player => player.id === piece));
  if (!roster?.season || !roster.week) return {};
  const value = await store.liveWeek(roster.season, roster.week).catch(() => null);
  return gamesFrom(value);
}

function gamesFrom(value: unknown) {
  const games: NonNullable<PreviewData['games']> = {};
  if (!value || typeof value !== 'object') return games;
  const rows = (value as { games?: unknown }).games;
  if (!rows || typeof rows !== 'object') return games;
  for (const [team, game] of Object.entries(rows)) {
    if (!/^[A-Za-z]{2,3}$/.test(team) || !game || typeof game !== 'object') continue;
    const row = game as { opponent?: unknown; kickoff?: unknown };
    games[team.toUpperCase()] = {
      opponent: typeof row.opponent === 'string' ? row.opponent : null,
      kickoff: typeof row.kickoff === 'string' ? row.kickoff : null,
    };
  }
  return games;
}

function isShare(value: unknown): value is { title: string; createdAt?: unknown; excerpt?: unknown } {
  if (!value || typeof value !== 'object') return false;
  const doc = value as { title?: unknown; owner?: unknown; messages?: unknown };
  return typeof doc.title === 'string' && doc.title.length <= 200 && !Array.isArray(doc.messages);
}
