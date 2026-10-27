import { buildCup, currentCupMatchesForTeam, matchupProjection, type CupId, type CupMatch, type SummaryMap } from './competitions.ts';
import { cupMatchChance } from './cupOdds.ts';
import { kickoffLabel } from './kickoff.ts';
import { historicalStarters } from './lineups.ts';
import { collapseGaps, recordedProjection, scoreLine as scoreSamples, sideVariance, toOddsStarter, winChanceSeries, type ChancePoint } from './liveOdds.ts';
import { matchdayMatches, priorLegOffset, type MatchdaySide } from './matchday.ts';
import { byeWeek } from './byeWeeks.ts';
import { projectedWinChance } from './projections.ts';
import { MANAGERS, managerFor, type ManagerReference } from './reference.ts';
import { roundSlug, RECORD_BOOKS } from './sharePaths.ts';
import { LEAGUES, type LeagueRosterSnapshot, type LeagueSlug, type LeagueSummary, type LiveGame, type Matchup, type RosteredPlayer, type ScoreSeries, type Team } from './types.ts';

export const SITE_NAME = 'JFFL';
export const PUBLIC_ORIGIN = 'https://jffl.org';
export const DEFAULT_TITLE = 'JFFL League Central — Scores, standings, cups & history';
export const DEFAULT_DESCRIPTION = 'Follow all three JFFL leagues: live matchups, standings, players, cups, weekly recaps, and the archive from 2002 onward.';
export const ASK_SAMPLE_PATH = '/__social/sample/ask';
export const ASK_SAMPLE_TITLE = 'Who has the most JFFL Cup titles?';

const LEAGUE_SLUGS = new Set<string>(LEAGUES.map(league => league.slug));
const CUP_IDS = new Set<string>(['jffl', 'premier', 'championship', 'league-one']);
const ACCENT: Record<string, string> = {
  premier: '#8fbf55',
  championship: '#8eb4d6',
  'league-one': '#f0c48a',
  jffl: '#3ec0f0',
};

export interface PreviewSide {
  name: string;
  detail: string;
  score: string | null;
  logoUrl: string | null;
  mark: string;
  shape: 'square' | 'round';
  odds: string | null;
}

export interface PreviewFact {
  label: string;
  value: string;
  note?: string;
  logoUrl?: string | null;
  accent?: string;
}

export interface PreviewLine {
  group: string;
  name: string;
  detail: string;
  logoUrl: string | null;
  mark: string;
  accent: string;
}

/** Downsampled score and win-chance lines for one matchup. A null sample stays null. */
export interface BoutChart {
  chance: (number | null)[];
  scoreLeft: (number | null)[];
  scoreRight: (number | null)[];
}

export interface PreviewBout {
  label: string;
  accent: string;
  away: PreviewSide;
  home: PreviewSide;
  chart?: BoutChart | null;
}

export type PreviewLayout = 'brand' | 'match' | 'profile' | 'story' | 'board' | 'slate';

export interface SocialPreview {
  kind: string;
  path: string;
  title: string;
  description: string;
  imageAlt: string;
  imagePath: string;
  robots: 'index' | 'noindex';
  dynamic: boolean;
  version: string;
  layout: PreviewLayout;
  kicker: string;
  headline: string;
  subline: string;
  status: string;
  accent: string;
  sides: PreviewSide[];
  facts: PreviewFact[];
  lines: PreviewLine[];
  bouts: PreviewBout[];
  chart?: BoutChart | null;
}

export interface PreviewData {
  leagues?: Partial<Record<LeagueSlug, LeagueSummary>>;
  rosters?: Partial<Record<LeagueSlug, LeagueRosterSnapshot>>;
  share?: { title?: string; createdAt?: string; excerpt?: string } | null;
  games?: Record<string, { opponent?: string | null; kickoff?: string | null }>;
  /** Weekly matchups from a later published snapshot. Used when the loaded summary stops before the requested week. */
  weeks?: Partial<Record<LeagueSlug, (Matchup & { week: number; status: 'live' | 'final' | 'pending' })[]>>;
  /** Saved score and projection samples for one week, keyed by league and team. */
  timeline?: Partial<Record<LeagueSlug, { series: Record<string, ScoreSeries>; games: Record<string, LiveGame> }>>;
  /** Week the timeline samples belong to. Charts for a different week stay off. */
  timelineWeek?: number;
  /** Gallery matchday week, when the loaded snapshot is earlier than the finished week that has these lines. */
  chartWeek?: number;
}

export interface PreviewRead {
  leagues: LeagueSlug[];
  rosters: LeagueSlug[];
  shareId: string | null;
}

export interface GalleryEntry {
  label: string;
  path: string;
  note: string;
}

export const GALLERY_LABELS = [
  'Home',
  'Universal fallback',
  'League',
  'Team',
  'League matchup',
  'Matchday',
  'Player',
  'Weekly roundup',
  'Cup match',
  'Ask share',
  'Private chat',
  'Standings',
  'Cups',
  'History',
  'Archive',
] as const;

const BOOKS: Record<string, string> = {
  weekly: 'Weekly records',
  jffl: 'JFFL Cup records',
  league: 'League cup records',
  bowl: 'Superbowl records',
};

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export function requestOrigin(host: string | undefined, proto: string | undefined) {
  const hostname = (host || 'jffl.org').split(',')[0].trim() || 'jffl.org';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(hostname);
  const secure = !local && proto !== 'http';
  return `${secure ? 'https' : 'http'}://${hostname}`;
}

/** Finite pages whose preview can be baked into Hosting. Live names and scores stay on the function. */
export function staticShellPaths() {
  const paths = [
    '/', '/matchday', '/players', '/summary', '/weekly', '/cups', '/history', '/history/cup',
    '/archive', '/archive/ask', '/archive/ask/share', '/archive/records', '/archive/titles',
    '/archive/rivals', '/archive/managers', '/archive/draft', '/archive/weeks',
  ];
  for (const league of LEAGUES) {
    paths.push(`/league/${league.slug}`, `/players/${league.slug}`, `/summary/${league.slug}`, `/history/${league.slug}`, `/history/cup/${league.slug}`, `/cups/${league.slug}`);
  }
  paths.push('/cups/jffl');
  for (const book of RECORD_BOOKS) paths.push(`/archive/records/${book}`);
  for (let week = 1; week <= 14; week += 1) paths.push(`/archive/weeks/${week}`);
  for (const cupId of ['jffl', 'premier', 'championship', 'league-one'] as const) {
    for (const round of buildCup(cupId, {}).rounds) paths.push(`/cups/${cupId}/round/${roundSlug(round.name)}`);
  }
  return paths;
}

export function staticImageFile(pathname: string) {
  const slug = pathname === '/' ? 'home' : pathname.replace(/^\//, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'home'}.png`;
}

export function previewReads(pathname: string): PreviewRead {
  const parts = decodeParts(pathname);
  const [root, a, b] = parts;
  const none = { leagues: [], rosters: [], shareId: null };
  const all = { leagues: leagueList(), rosters: [], shareId: null };
  if (!parts.length) return all;
  if (root === 'summary' && !a) return all;
  if (root === 'summary' && isLeague(a) && !b) return { leagues: [a], rosters: [], shareId: null };
  if (root === 'cups' && !a) return all;
  if (root === 'history' && !a) return all;
  if (root === 'league' && isLeague(a) && b === 'team') return { leagues: [a], rosters: [], shareId: null };
  if (root === 'league' && isLeague(a) && b === 'match') return { leagues: [a], rosters: [a], shareId: null };
  if (root === 'matchday' && isLeague(a) && b) return { leagues: leagueList(), rosters: leagueList(), shareId: null };
  if (root === 'players' && a && !isLeague(a)) return { leagues: leagueList(), rosters: leagueList(), shareId: null };
  if (root === 'weekly' && numbered(a)) return { leagues: leagueList(), rosters: [], shareId: null };
  if (root === 'cups' && isCup(a) && b === 'match') return { leagues: leagueList(), rosters: leagueList(), shareId: null };
  if (root === 'archive' && a === 'ask' && b === 's' && shareKey(parts[3])) return { leagues: [], rosters: [], shareId: parts[3] };
  return none;
}

export function resolvePreview(pathname: string, search = '', data: PreviewData = {}): SocialPreview {
  const [pathPart, queryPart = ''] = pathname.split('?');
  const path = canonicalPath(pathPart);
  const parts = decodeParts(path);
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search || queryPart);
  const leagues = summaries(data);
  const rosters = data.rosters ?? {};
  if (path === ASK_SAMPLE_PATH) return finish(sampleAskCard(path));
  if (!parts.length) return finish(homeCard(leagues));
  const [root, a, b, c, d, e] = parts;
  if (root === 'league' && isLeague(a) && !b) return finish(leagueCard(a));
  if (root === 'league' && isLeague(a) && b === 'team' && c) return finish(teamCard(a, c, leagues[a]));
  if (root === 'league' && isLeague(a) && b === 'match' && c) return finish(leagueMatchCard(a, c, leagues[a], rosters, data));
  if (root === 'matchday' && !a) return finish(sectionCard('matchday', '/matchday', 'Matchday', 'Every manager, this week', 'League matchups and cup ties that score in the same week.', 'Matchday'));
  if (root === 'matchday' && isLeague(a) && b) return finish(matchdayCard(a, b, query.get('week'), leagues, rosters, data));
  if (root === 'players' && !a) return finish(sectionCard('players', '/players', 'Players', 'Rostered players', 'Every player rostered in the Premier League, Championship, and League One.', 'Players'));
  if (root === 'players' && isLeague(a)) return finish(sectionCard('players', `/players/${a}`, leagueName(a), `${leagueName(a)} players`, `Players rostered in the ${leagueName(a)}, with fantasy points in that league's scoring.`, 'Players', a));
  if (root === 'players' && a) return finish(playerCard(a, leagues, rosters, data.games ?? {}));
  if (root === 'summary' && !a) return finish(standingsCard(leagues));
  if (root === 'summary' && isLeague(a)) return finish(standingsCard(leagues, a));
  if (root === 'weekly' && !a) return finish(sectionCard('weekly', '/weekly', 'Weekly roundup', 'This week across the JFFL', 'Scoring leaders, margins, standout starters, and the wall of shame.', 'Weekly'));
  if (root === 'weekly' && numbered(a)) return finish(weeklyCard(a, leagues));
  if (root === 'cups' && !a) return finish(cupsCard(leagues));
  if (root === 'cups' && isCup(a) && b === 'match' && c) return finish(cupMatchCard(a, c, leagues, rosters, data));
  if (root === 'cups' && isCup(a) && b === 'round' && c && d === 'highlight' && e) return finish(cupHighlightCard(a, c, e));
  if (root === 'cups' && isCup(a) && b === 'highlight' && c) return finish(cupHighlightCard(a, '', c));
  if (root === 'cups' && isCup(a) && b === 'round' && c) return finish(cupRoundCard(a, c));
  if (root === 'cups' && isCup(a)) return finish(cupLandingCard(a));
  if (root === 'history' && a === 'cup' && !b) return finish(sectionCard('history', '/history/cup', 'Cup history', 'JFFL Cup history', 'Cup titles, finals, and the historical cup table.', 'History', 'jffl'));
  if (root === 'history' && a === 'cup' && isLeague(b)) return finish(sectionCard('history', `/history/cup/${b}`, leagueName(b), `${leagueName(b)} cup history`, `Historical cup results filtered to the ${leagueName(b)}.`, 'History', b));
  if (root === 'history' && !a) return finish(historyCard(leagues));
  if (root === 'history' && isLeague(a)) return finish(sectionCard('history', `/history/${a}`, leagueName(a), `${leagueName(a)} trophy history`, `Trophy races and historical titles for the ${leagueName(a)}.`, 'History', a));
  if (root === 'archive' && !a) return finish(sectionCard('archive', '/archive', 'League archive', 'JFFL history from 2002', 'Seasons, records, titles, rivalries, drafts, and weeks from the commissioner archive.', 'Archive'));
  if (root === 'archive' && a === 'ask' && b === 't') return finish(privateChatCard());
  if (root === 'archive' && a === 'ask' && b === 's') return finish(shareCard(path, data.share));
  if (root === 'archive' && a === 'ask') return finish(sectionCard('ask', '/archive/ask', 'Ask the archive', 'Ask the archive', 'Questions about JFFL history from 2002 through the current season, answered from the league record.', 'Archive'));
  if (root === 'archive' && a === 'records' && b && BOOKS[b]) return finish(sectionCard('archive', `/archive/records/${b}`, 'Record book', BOOKS[b], 'The record book kept from the commissioner archive and finished games.', 'Archive'));
  if (root === 'archive' && a === 'records') return finish(sectionCard('archive', '/archive/records', 'Record book', 'JFFL record book', 'Weekly scores, cup totals, and Superbowl records.', 'Archive'));
  if (root === 'archive' && a === 'titles') return finish(sectionCard('archive', '/archive/titles', 'Titles', 'Titles since 2002', 'Season rank, Superbowl, and cup titles by year.', 'Archive'));
  if (root === 'archive' && a === 'rivals' && b && c) return finish(rivalCard(b, c));
  if (root === 'archive' && a === 'rivals') return finish(sectionCard('archive', '/archive/rivals', 'Rivals', 'Head-to-head rivalries', 'A series between two managers across the archive.', 'Archive'));
  if (root === 'archive' && a === 'managers' && b) return finish(managerArchiveCard(b));
  if (root === 'archive' && a === 'managers') return finish(sectionCard('archive', '/archive/managers', 'Managers', 'Manager careers', 'Seasons, titles, and records for every manager in the archive.', 'Archive'));
  if (root === 'archive' && a === 'draft') return finish(sectionCard('archive', '/archive/draft', 'Draft', 'Draft slot and results', 'Where a draft slot has landed in the standings.', 'Archive'));
  if (root === 'archive' && a === 'weeks' && numbered(b) && Number(b) >= 1 && Number(b) <= 14) return finish(sectionCard('archive', `/archive/weeks/${Number(b)}`, 'Week in history', `Week ${Number(b)} in history`, `Scores from week ${Number(b)} across the archived seasons.`, 'Archive'));
  if (root === 'archive' && a === 'weeks') return finish(sectionCard('archive', '/archive/weeks', 'Week in history', 'A week in JFFL history', 'The same NFL week compared across archived seasons.', 'Archive'));
  return finish(fallbackCard(path, leagues));
}

export function galleryEntries(data: PreviewData = {}): GalleryEntry[] {
  const leagues = summaries(data);
  const premier = leagues.premier;
  const team = rankedTeam(premier) ?? teamById(premier, '16');
  const manager = team ? person(premier, team) : managerFor('premier', '16');
  const teamPath = `/league/premier/team/${team?.id ?? manager?.teamId ?? '16'}`;
  const match = featuredMatch(premier);
  const week = premier?.week && premier.week > 0 ? String(premier.week) : '';
  const dayWeek = data.chartWeek && data.chartWeek > 0 ? String(data.chartWeek) : week;
  const dayLeagues = data.chartWeek ? leaguesForMatchday(leagues, data, data.chartWeek) : leagues;
  const dayTeam = team;
  const chartMatch = data.chartWeek ? featuredChartMatch(dayLeagues, data.chartWeek) : null;
  const chartCup = data.chartWeek ? featuredChartCup(dayLeagues, data.chartWeek) : null;
  const player = featuredPlayer(data.rosters ?? {});
  const cup = featuredCup(leagues);
  return [
    { label: 'Home', path: '/', note: 'Front page. The same wording is the fallback when a link has no specific card.' },
    { label: 'Universal fallback', path: '/not-a-real-page', note: 'Unknown addresses keep the general JFFL card.' },
    { label: 'League', path: '/league/premier', note: 'Each league, standings filter, and player directory has its own section card. This one is the Premier League.' },
    { label: 'Team', path: teamPath, note: 'Manager, team, league, rank, record, and points. A missing number stays off the card.' },
    { label: 'League matchup', path: chartMatch ? `/league/${chartMatch.slug}/match/${chartMatch.id}` : match ? `/league/premier/match/${match.id}` : '/league/premier/match/preview', note: data.chartWeek ? `Week ${data.chartWeek} league match, with the saved score and win-chance lines under the score.` : 'Away and home managers, week, and score. Projections are labeled and never shown as the score.' },
    { label: 'Matchday', path: matchdayPath(dayLeagues, dayTeam, dayWeek), note: data.chartWeek ? `Week ${data.chartWeek} has finished. The card shows the league game and a cup tie scoring that week, with the saved score and win-chance lines.` : 'The league game, plus a cup tie when that manager has one scoring the same week. A cup bye stays off the card.' },
    { label: 'Player', path: player ? `/players/${player.id}` : '/players/player-preview', note: 'Position, NFL team, that week’s opponent and kickoff, a couple of stats, and the fantasy manager who rosters them.' },
    { label: 'Weekly roundup', path: week ? `/weekly/${week}` : '/weekly/1', note: 'That week’s scoring leaders and the extremes called out on the roundup.' },
    { label: 'Cup match', path: chartCup ? `/cups/${chartCup.cupId}/match/${chartCup.matchId}` : cup ? `/cups/${cup.cupId}/match/${cup.matchId}` : '/cups/jffl/match/preview', note: data.chartWeek ? `Week ${data.chartWeek} cup tie, with the saved score and win-chance lines. Earlier legs of the tie are already in the line.` : 'Cup, round, both managers, and the tie total.' },
    { label: 'Ask share', path: ASK_SAMPLE_PATH, note: 'Sample question for review. The chip says Shared answer, the same label a real public share uses. A private chat stays generic.' },
    { label: 'Private chat', path: '/archive/ask/t/private-example', note: 'Saved chats stay generic and are marked noindex. The chat id is not part of the preview.' },
    { label: 'Standings', path: '/summary', note: 'The top of each league table, with record and points.' },
    { label: 'Cups', path: '/cups', note: 'Each cup by name, with the tie that is on the board now.' },
    { label: 'History', path: '/history', note: 'The all-time trophy table, through the 2025 season.' },
    { label: 'Archive', path: '/archive', note: 'Section card for the commissioner archive. Manager and rivalry links add the names from the address.' },
  ];
}

export function metaTags(preview: SocialPreview, origin = PUBLIC_ORIGIN) {
  const url = `${origin}${preview.path === ASK_SAMPLE_PATH ? '/archive/ask' : preview.path}`;
  const image = absolute(origin, preview.imagePath);
  const robots = preview.robots === 'noindex' ? '    <meta name="robots" content="noindex">\n' : '';
  return [
    `    <title>${escapeHtml(preview.title)}</title>`,
    `    <meta name="description" content="${escapeHtml(preview.description)}">`,
    `    <link rel="canonical" href="${escapeHtml(url)}">`,
    robots.trimEnd(),
    `    <meta property="og:site_name" content="${SITE_NAME}">`,
    `    <meta property="og:locale" content="en_US">`,
    `    <meta property="og:type" content="website">`,
    `    <meta property="og:url" content="${escapeHtml(url)}">`,
    `    <meta property="og:title" content="${escapeHtml(preview.title)}">`,
    `    <meta property="og:description" content="${escapeHtml(preview.description)}">`,
    `    <meta property="og:image" content="${escapeHtml(image)}">`,
    `    <meta property="og:image:type" content="image/png">`,
    `    <meta property="og:image:width" content="1200">`,
    `    <meta property="og:image:height" content="630">`,
    `    <meta property="og:image:alt" content="${escapeHtml(preview.imageAlt)}">`,
    `    <meta name="twitter:card" content="summary_large_image">`,
    `    <meta name="twitter:title" content="${escapeHtml(preview.title)}">`,
    `    <meta name="twitter:description" content="${escapeHtml(preview.description)}">`,
    `    <meta name="twitter:image" content="${escapeHtml(image)}">`,
    `    <meta name="twitter:image:alt" content="${escapeHtml(preview.imageAlt)}">`,
  ].filter(Boolean).join('\n');
}

export function injectSocialMeta(html: string, preview: SocialPreview, origin = PUBLIC_ORIGIN) {
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<meta\s+[^>]*(?:name="(?:description|robots|twitter:[^"]+)"|property="og:[^"]+")[^>]*>\s*/gi, '')
    .replace(/<link\s+[^>]*rel="canonical"[^>]*>\s*/gi, '');
  const block = `${metaTags(preview, origin)}\n`;
  return stripped.includes('</head>') ? stripped.replace('</head>', `${block}  </head>`) : `${block}${stripped}`;
}

function homeCard(leagues: SummaryMap): Omit<SocialPreview, 'imagePath' | 'version'> {
  const facts = leaderFacts(leagues);
  return {
    ...sectionCard('home', '/', '2026 season', 'Three leagues. One JFFL.', DEFAULT_DESCRIPTION, 'League Central'),
    title: DEFAULT_TITLE,
    headline: 'Three leagues. One JFFL.',
    dynamic: facts.length > 0,
    facts,
    versionSource: facts.map(fact => `${fact.label}|${fact.value}|${fact.note ?? ''}`).join('|'),
  };
}

function fallbackCard(path: string, leagues: SummaryMap): Omit<SocialPreview, 'imagePath' | 'version'> {
  return { ...homeCard(leagues), kind: 'fallback', path, robots: 'noindex' };
}

function leaderFacts(leagues: SummaryMap): PreviewFact[] {
  return leagueList().flatMap(slug => {
    const summary = leagues[slug];
    const team = rankedTeam(summary);
    if (!summary || !team) return [];
    const manager = person(summary, team)?.manager ?? team.name.trim();
    const record = recordOf(team);
    const points = pointsLabel(team.pointsFor);
    return [{
      label: shortLeague(slug),
      value: manager,
      note: [record, points].filter(Boolean).join(' · '),
      logoUrl: team.logoUrl || null,
      accent: ACCENT[slug],
    }];
  });
}

function standingsCard(leagues: SummaryMap, slug?: LeagueSlug): Omit<SocialPreview, 'imagePath' | 'version'> & { versionSource: string } {
  const slugs = slug ? [slug] : leagueList();
  const lines = slugs.flatMap(id => rankedTeams(leagues[id]).slice(0, slug ? 8 : 4).map(team => {
    const summary = leagues[id];
    const record = recordOf(team);
    const points = pointsLabel(team.pointsFor);
    return {
      group: shortLeague(id),
      name: clip(person(summary, team)?.manager ?? team.name.trim(), 18),
      detail: [record, points].filter(Boolean).join(' · '),
      logoUrl: team.logoUrl || null,
      mark: team.rank ? String(team.rank) : '',
      accent: ACCENT[id],
    };
  }));
  const headline = slug ? `${leagueName(slug)} standings` : 'Standings';
  const description = slug
    ? `The ${leagueName(slug)} table: record, points, and place.`
    : 'The top of each league table: record, points, and place.';
  return {
    kind: 'standings', path: slug ? `/summary/${slug}` : '/summary', title: pageTitle(headline), description: clip(description),
    imageAlt: clip(headline, 120), robots: 'index', dynamic: true, layout: 'board', kicker: 'Standings', headline,
    subline: lines.length ? '' : description, status: 'Standings', accent: slug ? ACCENT[slug] : ACCENT.jffl,
    sides: [], facts: [], lines, bouts: [], versionSource: lines.map(line => `${line.group}|${line.mark}|${line.name}|${line.detail}`).join(';'),
  };
}

function cupsCard(leagues: SummaryMap): Omit<SocialPreview, 'imagePath' | 'version'> & { versionSource: string } {
  const ids = ['jffl', 'premier', 'championship', 'league-one'] as const;
  const lines = ids.map(id => {
    const cup = buildCup(id, leagues);
    return { group: '', name: cup.name, detail: cupSnapshot(cup), logoUrl: null, mark: '', accent: ACCENT[id] };
  });
  return {
    kind: 'cups', path: '/cups', title: pageTitle('Cups'), description: 'The JFFL Cup, Premier League Cup, Championship Cup, and League One Cup.',
    imageAlt: 'JFFL Cup, Premier League Cup, Championship Cup, and League One Cup', robots: 'index', dynamic: true, layout: 'board',
    kicker: 'Cups', headline: '', subline: '', status: 'Cups', accent: ACCENT.jffl, sides: [], facts: [], lines, bouts: [],
    versionSource: lines.map(line => `${line.name}|${line.detail}`).join(';'),
  };
}

function historyCard(leagues: SummaryMap): Omit<SocialPreview, 'imagePath' | 'version'> & { versionSource: string } {
  const leaders = [...MANAGERS].sort((a, b) => b.trophies - a.trophies || b.finals - a.finals || a.manager.localeCompare(b.manager)).slice(0, 5);
  const lines = leaders.map((manager, index) => ({
    group: '',
    name: manager.manager,
    detail: `${manager.trophies} trophies · ${manager.finals} finals`,
    logoUrl: teamById(leagues[manager.slug], manager.teamId)?.logoUrl || null,
    mark: String(index + 1),
    accent: ACCENT[manager.slug],
  }));
  const headline = 'Trophy history';
  return {
    kind: 'history', path: '/history', title: pageTitle(headline), description: 'All-time trophies and finals through 2025.',
    imageAlt: clip(headline, 120), robots: 'index', dynamic: true, layout: 'board', kicker: 'Through 2025', headline,
    subline: '', status: 'History', accent: ACCENT.jffl, sides: [], facts: [], lines, bouts: [],
    versionSource: lines.map(line => `${line.mark}|${line.name}|${line.detail}`).join(';'),
  };
}

function privateChatCard(): Omit<SocialPreview, 'imagePath' | 'version'> {
  return storyCard('private', '/archive/ask', 'Ask the archive', 'Saved chat', 'A private Ask the archive chat. The conversation stays with the signed-in account.', 'Private', '#3ec0f0', true, 'noindex');
}

function sampleAskCard(path: string): Omit<SocialPreview, 'imagePath' | 'version'> {
  const excerpt = cupTitleExcerpt();
  return { ...storyCard('sample', path, 'Ask the archive', ASK_SAMPLE_TITLE, excerpt, 'Shared answer', '#3ec0f0', true, 'noindex'), description: excerpt };
}

function shareCard(path: string, share: PreviewData['share']): Omit<SocialPreview, 'imagePath' | 'version'> {
  const title = oneLine(share?.title ?? '');
  const excerpt = answerExcerpt(share?.excerpt ?? '');
  const card = storyCard('ask-share', path, 'Ask the archive', title || 'Shared answer', 'A shared answer from Ask the archive.', 'Shared answer', '#3ec0f0', true, 'index', share?.createdAt ?? title);
  return excerpt ? { ...card, subline: excerpt, versionSource: `${card.versionSource}|${excerpt}` } : card;
}

function leagueCard(slug: LeagueSlug): Omit<SocialPreview, 'imagePath' | 'version'> {
  return sectionCard('league', `/league/${slug}`, leagueName(slug), leagueName(slug), `Standings, matchups, and teams in the ${leagueName(slug)}.`, leagueName(slug), slug);
}

function teamCard(slug: LeagueSlug, teamId: string, summary: LeagueSummary | undefined): Omit<SocialPreview, 'imagePath' | 'version'> {
  const team = teamById(summary, teamId);
  const manager = person(summary, team) ?? managerFor(slug, teamId);
  const name = manager?.manager ?? team?.name ?? 'Team';
  const titleName = team?.name?.trim() && name !== team.name.trim() ? `${name} · ${team.name.trim()}` : name;
  const record = recordOf(team);
  const rank = rankLabel(team?.rank);
  const points = pointsLabel(team?.pointsFor);
  const facts = [
    rank ? { label: 'Rank', value: rank } : null,
    record ? { label: 'Record', value: record } : null,
    points ? { label: 'Points', value: points } : null,
  ].filter((fact): fact is PreviewFact => fact !== null);
  const detail = [team?.name?.trim(), rank, record].filter(Boolean).join(' · ');
  return profileCard({
    kind: 'team', path: `/league/${slug}/team/${encodeURIComponent(teamId)}`, kicker: leagueName(slug), headline: name, title: titleName,
    subline: detail || leagueName(slug), description: sentence([name, team?.name?.trim(), leagueName(slug), rank, record, points ? `${points} points` : '']),
    status: summary?.week ? `Week ${summary.week}` : 'Team', accent: ACCENT[slug], dynamic: true,
    side: sideOf(name, team?.name?.trim() || leagueName(slug), null, team?.logoUrl, 'square'), facts,
    versionSource: summary?.updatedAt ?? '',
  });
}

function leagueMatchCard(slug: LeagueSlug, matchId: string, summary: LeagueSummary | undefined, rosters: Partial<Record<LeagueSlug, LeagueRosterSnapshot>> = {}, data: PreviewData = {}): Omit<SocialPreview, 'imagePath' | 'version'> {
  const match = findMatch(summary, matchId, data.weeks?.[slug]);
  const path = `/league/${slug}/match/${encodeURIComponent(matchId)}`;
  if (!match || !summary) {
    return profileCard({
      kind: 'league-match', path, kicker: leagueName(slug), headline: 'League matchup', subline: leagueName(slug),
      description: `A ${leagueName(slug)} matchup.`, status: 'Matchup', accent: ACCENT[slug], dynamic: true,
      side: sideOf(leagueName(slug), 'Matchup', null, null, 'square'), facts: [], versionSource: '',
    });
  }
  const week = 'week' in match ? match.week : summary.week;
  const status = matchStatus(match, summary.week);
  const chance = status === 'Final' ? null : projectedWinChance(match.homeProjected, match.awayProjected);
  const away = withOdds(contestant(summary, match.awayTeamId, match.awayScore), chance ? `${chance.away}% to win` : null);
  const home = withOdds(contestant(summary, match.homeTeamId, match.homeScore), chance ? `${chance.home}% to win` : null);
  const projected = scoreLine(formatPoints(match.awayProjected), formatPoints(match.homeProjected));
  const actual = scoreLine(away.score, home.score);
  const headline = actual ? `${away.name} ${actual} ${home.name}` : `${away.name} vs ${home.name}`;
  const subline = [status, week ? `Week ${week}` : '', projected && !actual ? `Projected ${projected}` : ''].filter(Boolean).join(' · ');
  const chart = scoreChart(slug, match.awayTeamId, slug, match.homeTeamId, week, 0, 0, status === 'Final', rosters, data);
  return {
    ...matchCard({
      kind: 'league-match', path, kicker: `${leagueName(slug)} · ${status}`, headline, title: week ? `${headline} · Week ${week}` : headline, subline,
      description: sentence([headline, leagueName(slug), subline, chance ? `${away.name} ${chance.away}%, ${home.name} ${chance.home}%` : '']), status, accent: ACCENT[slug], dynamic: true,
      away, home, facts: [], versionSource: `${summary.updatedAt}|${actual}|${status}|${chartKey(chart)}`,
    }),
    chart,
  };
}

function matchdayCard(slug: LeagueSlug, teamId: string, requestedWeek: string | null, leagues: SummaryMap, rosters: Partial<Record<LeagueSlug, LeagueRosterSnapshot>> = {}, data: PreviewData = {}): Omit<SocialPreview, 'imagePath' | 'version'> {
  const base = leagues[slug];
  const current = base?.week ?? 0;
  const week = requestedWeek && numbered(requestedWeek) ? Number(requestedWeek) : current;
  const shownWeek = week > 0 ? week : current;
  const view = shownWeek > 0 ? leaguesForMatchday(leagues, data, shownWeek) : leagues;
  const summary = view[slug];
  const team = teamById(summary, teamId);
  const manager = person(summary, team) ?? managerFor(slug, teamId);
  const name = manager?.manager ?? team?.name ?? 'Matchday';
  const match = shownWeek > 0 ? summary?.weeklyMatchups?.find(item => item.week === shownWeek && [item.homeTeamId, item.awayTeamId].includes(teamId)) : undefined;
  const path = `/matchday/${slug}/${encodeURIComponent(teamId)}${requestedWeek && numbered(requestedWeek) ? `?week=${Number(requestedWeek)}` : ''}`;
  const cups = manager ? currentCupMatchesForTeam(view, slug, teamId, shownWeek > 0 ? shownWeek : undefined).filter(item => item.match.status !== 'bye') : [];
  const cupNote = cups.map(item => `${item.cupName}: ${boutText(cupSide(item.match.a, view), cupSide(item.match.b, view))}`).join('; ');
  if (!match || !summary) {
    return profileCard({
      kind: 'matchday', path, kicker: 'Matchday', headline: name, subline: [leagueName(slug), shownWeek ? `Week ${shownWeek}` : '', cupNote].filter(Boolean).join(' · '),
      description: sentence([`${name} matchday`, leagueName(slug), shownWeek ? `week ${shownWeek}` : '', cupNote]),
      status: shownWeek ? `Week ${shownWeek}` : 'Matchday', accent: ACCENT[slug], dynamic: true,
      side: sideOf(name, team?.name?.trim() || leagueName(slug), null, team?.logoUrl, 'square'), facts: [], versionSource: summary?.updatedAt ?? '',
    });
  }
  const mine = match.homeTeamId === teamId;
  const opponentId = mine ? match.awayTeamId : match.homeTeamId;
  const myScore = mine ? match.homeScore : match.awayScore;
  const opponentScore = mine ? match.awayScore : match.homeScore;
  const open = match.status !== 'final';
  const chance = open ? projectedWinChance(match.homeProjected, match.awayProjected) : null;
  const self = withOdds(contestant(summary, teamId, myScore), chance ? `${mine ? chance.home : chance.away}% to win` : null);
  const opponent = withOdds(contestant(summary, opponentId, opponentScore), chance ? `${mine ? chance.away : chance.home}% to win` : null);
  const actual = scoreLine(self.score, opponent.score);
  const status = matchStatus(match, summary.week);
  const headline = actual ? `${self.name} ${actual} ${opponent.name}` : `${self.name} vs ${opponent.name}`;
  const played = matchdayMatches(view, slug, teamId, shownWeek);
  const leaguePlayed = played.find(item => item.kind === 'league');
  const leagueChart = leaguePlayed ? chartForSides(leaguePlayed, slug, teamId, leaguePlayed.right?.slug ?? slug, opponentId, shownWeek, !open, rosters, data) : null;
  const bouts: PreviewBout[] = [
    { label: leagueName(slug), accent: ACCENT[slug], away: self, home: opponent, chart: leagueChart },
    ...cups.map(item => {
      const advance = cupAdvanceOdds(item.match, view, rosters);
      const found = played.find(entry => entry.id === item.match.id);
      const left = item.match.a.participant;
      const right = item.match.b.participant;
      return {
        label: item.cupName, accent: ACCENT[item.cupId],
        away: withOdds(cupSide(item.match.a, view), advance?.left ?? null), home: withOdds(cupSide(item.match.b, view), advance?.right ?? null),
        chart: found && left && right ? chartForSides(found, left.slug, left.teamId, right.slug, right.teamId, shownWeek, found.status === 'final', rosters, data) : null,
      };
    }),
  ];
  const charts = bouts.map(bout => chartKey(bout.chart)).join(',');
  if (bouts.length > 1) {
    return {
      kind: 'matchday', path, title: `${name} · Matchday${shownWeek ? ` · Week ${shownWeek}` : ''} | JFFL`, description: clip(sentence([`${name} matchday`, headline, shownWeek ? `week ${shownWeek}` : '', cupNote])),
      imageAlt: clip(headline, 120), robots: 'index', dynamic: true, layout: 'slate', kicker: `Matchday · Week ${shownWeek || ''}`.replace(/ · Week $/, ''),
      headline, subline: cupNote, status, accent: ACCENT[slug], sides: [self, opponent], facts: [], lines: [], bouts,
      versionSource: `${summary.updatedAt}|${bouts.map(bout => boutText(bout.away, bout.home)).join(';')}|${charts}`,
    };
  }
  return {
    ...matchCard({
      kind: 'matchday', path, kicker: `Matchday · ${status}`, headline, title: `${name} · Matchday${shownWeek ? ` · Week ${shownWeek}` : ''}`, subline: [leagueName(slug), shownWeek ? `Week ${shownWeek}` : '', cupNote].filter(Boolean).join(' · '),
      description: sentence([`${name} matchday`, headline, shownWeek ? `week ${shownWeek}` : '', cupNote]), status, accent: ACCENT[slug], dynamic: true,
      away: self, home: opponent, facts: [], versionSource: `${summary.updatedAt}|${actual}|${cupNote}|${chartKey(leagueChart)}`,
    }),
    chart: leagueChart,
  };
}

function playerCard(playerId: string, leagues: SummaryMap, rosters: Partial<Record<LeagueSlug, LeagueRosterSnapshot>>, games: NonNullable<PreviewData['games']>): Omit<SocialPreview, 'imagePath' | 'version'> {
  const found = findPlayer(playerId, rosters);
  const path = `/players/${encodeURIComponent(playerId)}`;
  if (!found) {
    return profileCard({
      kind: 'player', path, kicker: 'Player', headline: 'Rostered player', subline: 'Premier League, Championship, and League One',
      description: 'A player rostered in the JFFL.', status: 'Player', accent: ACCENT.jffl, dynamic: true,
      side: sideOf('Player', 'JFFL', null, null, 'round'), facts: [], versionSource: '',
    });
  }
  const { slug, roster, player } = found;
  const team = teamById(leagues[slug], player.teamId);
  const manager = person(leagues[slug], team) ?? managerFor(slug, player.teamId);
  const proTeam = player.proTeam && player.proTeam !== 'None' ? player.proTeam : '';
  const points = formatPoints(player.weekPoints);
  const opponent = nflOpponent(proTeam, roster.week, games);
  const facts = [
    proTeam ? { label: 'Team', value: proTeam, logoUrl: nflLogo(proTeam) } : null,
    ...weekStatFacts(player.weekStats),
    points ? { label: `Week ${roster.week}`, value: points } : null,
  ].filter((fact): fact is PreviewFact => fact !== null).slice(0, 4);
  const subline = [player.position, opponent, manager ? `rostered by ${manager.manager}` : team?.name?.trim(), leagueName(slug)].filter(Boolean).join(' · ');
  return profileCard({
    kind: 'player', path, kicker: leagueName(slug), headline: player.name, subline,
    description: sentence([player.name, player.position, proTeam, opponent, manager ? `rostered by ${manager.manager}` : '', leagueName(slug), points ? `${points} points in week ${roster.week}` : '', weekStatFacts(player.weekStats).map(fact => `${fact.value} ${fact.label.toLowerCase()}`).join(', ')]),
    status: roster.week ? `Week ${roster.week}` : 'Player', accent: ACCENT[slug], dynamic: true,
    side: sideOf(player.name, subline, points, headshot(player), 'round'), facts, versionSource: `${roster.updatedAt}|${points ?? ''}|${opponent ?? ''}|${facts.map(fact => fact.value).join(',')}`,
  });
}

function weeklyCard(weekText: string, leagues: SummaryMap): Omit<SocialPreview, 'imagePath' | 'version'> & { versionSource: string } {
  const requested = Number(weekText);
  const current = Math.max(...leagueList().map(slug => leagues[slug]?.week ?? 0));
  const week = current >= 1 && requested > current ? current : requested;
  const leaders = weekLeaders(leagues, week);
  const extremes = weekExtremes(leagues, week);
  const headline = `Week ${week} roundup`;
  const subline = leaders.slice(0, 3).map(item => `${item.name} ${item.score}`).join(' · ');
  const stamps = leagueList().map(slug => leagues[slug]?.updatedAt ?? '');
  const lines = [
    ...leaders.slice(0, extremes.length ? 4 : 5).map((item, index) => ({
      group: extremes.length ? 'Leaders' : '', name: item.name, detail: `${item.score} · ${item.league}`, logoUrl: item.logoUrl, mark: String(index + 1), accent: item.accent,
    })),
    ...extremes,
  ];
  return {
    kind: 'weekly', path: `/weekly/${week}`, title: pageTitle(headline), description: clip(sentence([`Week ${week} scoring`, subline, ...extremes.map(line => `${line.name} ${line.detail}`)])),
    imageAlt: clip(headline, 120), robots: 'index', dynamic: true, layout: 'board', kicker: 'Weekly roundup', headline,
    subline: '', status: `Week ${week}`, accent: ACCENT.jffl,
    sides: [], facts: [], lines, bouts: [],
    versionSource: `${stamps.join('|')}|${subline}`,
  };
}

function cupMatchCard(cupId: CupId, matchId: string, leagues: SummaryMap, rosters: Partial<Record<LeagueSlug, LeagueRosterSnapshot>> = {}, data: PreviewData = {}): Omit<SocialPreview, 'imagePath' | 'version'> {
  const view = data.weeks ? leaguesForMatchday(leagues, data, recordedWeek(data) || Math.max(...leagueList().map(slug => leagues[slug]?.week ?? 0), 0)) : leagues;
  const cup = buildCup(cupId, view);
  const located = cup.rounds.flatMap(round => round.matches.map(match => ({ round, match }))).find(item => item.match.id === matchId);
  const path = `/cups/${cupId}/match/${encodeURIComponent(matchId)}`;
  if (!located) {
    return profileCard({
      kind: 'cup-match', path, kicker: cup.name, headline: 'Cup match', subline: cup.name, description: `A match in the ${cup.name}.`,
      status: 'Cup', accent: ACCENT[cupId], dynamic: true, side: sideOf(cup.name, 'Cup match', null, null, 'square'), facts: [], versionSource: '',
    });
  }
  const { round, match } = located;
  const advance = cupAdvanceOdds(match, view, rosters);
  const left = withOdds(cupSide(match.a, view), advance?.left ?? null);
  const right = withOdds(cupSide(match.b, view), advance?.right ?? null);
  const actual = scoreLine(left.score, right.score);
  const headline = actual ? `${left.name} ${actual} ${right.name}` : `${left.name} vs ${right.name}`;
  const status = cupStatus(match.status);
  const when = round.weeks.length > 1 ? `Weeks ${round.weeks.join('+')}` : `Week ${round.weeks[0]}`;
  const stamps = leagueList().map(slug => view[slug]?.updatedAt ?? '').join('|');
  const chartWeek = cupChartWeek(match, view);
  const leftPlayer = match.a.participant;
  const rightPlayer = match.b.participant;
  const chart = chartWeek && leftPlayer && rightPlayer
    ? scoreChart(leftPlayer.slug, leftPlayer.teamId, rightPlayer.slug, rightPlayer.teamId, chartWeek, priorLegOffset(match.weeks, match.a.legs, chartWeek), priorLegOffset(match.weeks, match.b.legs, chartWeek), match.status === 'final' || match.status === 'tied', rosters, data)
    : null;
  return {
    ...matchCard({
      kind: 'cup-match', path, kicker: `${cup.name} · ${round.name}`, headline, title: `${headline} · ${round.name}`, subline: [status, when].join(' · '),
      description: sentence([headline, cup.name, round.name, status, left.odds && right.odds ? `${left.name} ${left.odds}, ${right.name} ${right.odds}` : '']), status, accent: ACCENT[cupId], dynamic: true, away: left, home: right, facts: [],
      versionSource: `${stamps}|${actual}|${match.status}|${left.odds ?? ''}|${right.odds ?? ''}|${chartKey(chart)}`,
    }),
    chart,
  };
}

function cupLandingCard(cupId: CupId): Omit<SocialPreview, 'imagePath' | 'version'> {
  const cup = buildCup(cupId, {});
  return sectionCard('cup', `/cups/${cupId}`, cup.name, cup.name, `Bracket, seeds, and scores for the ${cup.name}.`, 'Cups', cupId);
}

function cupRoundCard(cupId: CupId, roundKey: string): Omit<SocialPreview, 'imagePath' | 'version'> {
  const cup = buildCup(cupId, {});
  const round = cup.rounds.find(item => roundSlug(item.name) === roundKey);
  const name = round?.name ?? 'Cup round';
  return sectionCard('cup', `/cups/${cupId}/round/${roundSlug(name)}`, cup.name, `${cup.name} ${name}`, `The ${name} of the ${cup.name}.`, 'Cups', cupId);
}

function cupHighlightCard(cupId: CupId, roundKey: string, managerKey: string): Omit<SocialPreview, 'imagePath' | 'version'> {
  const cup = buildCup(cupId, {});
  const round = cup.rounds.find(item => roundSlug(item.name) === roundKey);
  const manager = decodeName(managerKey);
  const path = round ? `/cups/${cupId}/round/${roundSlug(round.name)}/highlight/${encodeURIComponent(manager)}` : `/cups/${cupId}/highlight/${encodeURIComponent(manager)}`;
  const headline = `${manager} · ${cup.name}`;
  return profileCard({
    kind: 'cup-highlight', path, kicker: round ? `${cup.name} · ${round.name}` : cup.name, headline: manager, subline: round ? `${round.name} of the ${cup.name}` : cup.name,
    description: sentence([manager, 'highlighted in', cup.name, round?.name ?? '']), status: 'Cup', accent: ACCENT[cupId], dynamic: true,
    side: sideOf(manager, cup.name, null, null, 'square'), facts: [], versionSource: manager,
  });
}

function rivalCard(left: string, right: string): Omit<SocialPreview, 'imagePath' | 'version'> {
  const a = decodeName(left);
  const b = decodeName(right);
  const path = `/archive/rivals/${encodeURIComponent(a)}/${encodeURIComponent(b)}`;
  return matchCard({
    kind: 'rivals', path, kicker: 'Archive rivalry', headline: `${a} vs ${b}`, subline: 'Head-to-head across the JFFL archive',
    description: `The head-to-head series between ${a} and ${b}.`, status: 'Rivals', accent: ACCENT.jffl, dynamic: true,
    away: sideOf(a, 'Archive', null, null, 'square'), home: sideOf(b, 'Archive', null, null, 'square'), facts: [], versionSource: `${a}|${b}`,
  });
}

function managerArchiveCard(name: string): Omit<SocialPreview, 'imagePath' | 'version'> {
  const manager = decodeName(name);
  return profileCard({
    kind: 'manager', path: `/archive/managers/${encodeURIComponent(manager)}`, kicker: 'Manager archive', headline: manager,
    subline: 'Career seasons, titles, and records', description: `Career seasons, titles, and records for ${manager}.`,
    status: 'Archive', accent: ACCENT.jffl, dynamic: true, side: sideOf(manager, 'Archive', null, null, 'square'), facts: [], versionSource: manager,
  });
}

function sectionCard(kind: string, path: string, kicker: string, headline: string, description: string, status: string, accent: string = 'jffl'): Omit<SocialPreview, 'imagePath' | 'version'> & { versionSource?: string } {
  return {
    kind, path, title: path === '/' ? DEFAULT_TITLE : pageTitle(headline), description: clip(description), imageAlt: clip(headline, 120),
    robots: 'index', dynamic: false, layout: 'brand', kicker, headline: clip(headline, 52), subline: clip(description, 150),
    status, accent: ACCENT[accent] ?? ACCENT.jffl, sides: [], facts: [], lines: [], bouts: [], versionSource: `${kind}|${headline}`,
  };
}

function storyCard(kind: string, path: string, kicker: string, headline: string, description: string, status: string, accent: string, dynamic: boolean, robots: 'index' | 'noindex', versionSource = ''): Omit<SocialPreview, 'imagePath' | 'version'> & { versionSource?: string } {
  const clean = clip(headline, 90) || 'Shared answer';
  return {
    kind, path, title: pageTitle(clean), description: clip(description), imageAlt: clip(clean, 120), robots, dynamic, layout: 'story',
    kicker, headline: clean, subline: clip(description, 180), status, accent, sides: [], facts: [], lines: [], bouts: [], versionSource: versionSource || clean,
  };
}

function profileCard(input: {
  kind: string; path: string; kicker: string; headline: string; title?: string; subline: string; description: string; status: string;
  accent: string; dynamic: boolean; side: PreviewSide; facts: PreviewFact[]; versionSource: string;
}): Omit<SocialPreview, 'imagePath' | 'version'> & { versionSource: string } {
  return {
    kind: input.kind, path: input.path, title: pageTitle(input.title ?? input.headline), description: clip(input.description), imageAlt: clip(input.headline, 120),
    robots: 'index', dynamic: input.dynamic, layout: 'profile', kicker: input.kicker, headline: clip(input.headline, 42), subline: clip(input.subline, 140),
    status: input.status, accent: input.accent, sides: [input.side], facts: input.facts, lines: [], bouts: [], versionSource: input.versionSource,
  };
}

function matchCard(input: {
  kind: string; path: string; kicker: string; headline: string; title?: string; subline: string; description: string; status: string;
  accent: string; dynamic: boolean; away: PreviewSide; home: PreviewSide; facts: PreviewFact[]; versionSource: string;
}): Omit<SocialPreview, 'imagePath' | 'version'> & { versionSource: string } {
  return {
    kind: input.kind, path: input.path, title: pageTitle(input.title ?? input.headline), description: clip(input.description),
    imageAlt: clip(input.headline, 120), robots: 'index', dynamic: input.dynamic, layout: 'match', kicker: input.kicker,
    headline: clip(input.headline, 64), subline: clip(input.subline, 140), status: input.status, accent: input.accent,
    sides: [input.away, input.home], facts: input.facts, lines: [], bouts: [], versionSource: input.versionSource,
  };
}

function finish(card: Omit<SocialPreview, 'imagePath' | 'version'> & { versionSource?: string }): SocialPreview {
  // The first token is the drawing revision. Change it when the card layout changes so cached pictures refresh.
  const version = hash(['names-wrap', card.kind, card.path, card.title, card.description, card.headline, card.subline, card.status, card.versionSource ?? '', JSON.stringify(card.sides.map(side => [side.name, side.score, side.detail, side.logoUrl, side.odds])), JSON.stringify(card.facts), JSON.stringify(card.lines), JSON.stringify(card.bouts.map(bout => [bout.label, bout.away.name, bout.away.score, bout.away.odds, bout.home.name, bout.home.score, bout.home.odds, chartKey(bout.chart)])), chartKey(card.chart)].join('|'));
  const imagePath = card.kind === 'fallback'
    ? `/og/${staticImageFile('/')}?v=${version}`
    : card.dynamic
      ? `/__social/card.png?path=${encodeURIComponent(card.path)}&v=${version}`
      : `/og/${staticImageFile(card.path)}?v=${version}`;
  return { ...card, version, imagePath };
}

function summaries(data: PreviewData): SummaryMap {
  const ready: SummaryMap = {};
  for (const league of LEAGUES) {
    const summary = data.leagues?.[league.slug];
    if (summary && summary.slug === league.slug && Array.isArray(summary.teams) && Array.isArray(summary.matchups)) ready[league.slug] = summary;
  }
  return ready;
}

function findMatch(summary: LeagueSummary | undefined, matchId: string, extra?: (Matchup & { week: number; status: 'live' | 'final' | 'pending' })[]): (Matchup & { week?: number; status?: 'live' | 'final' | 'pending' }) | null {
  return summary?.weeklyMatchups?.find(item => item.id === matchId) ?? extra?.find(item => item.id === matchId) ?? summary?.matchups.find(item => item.id === matchId) ?? null;
}

function contestant(summary: LeagueSummary, teamId: string | null, score: number | null): PreviewSide {
  const team = teamById(summary, teamId ?? '');
  const manager = person(summary, team) ?? (teamId ? managerFor(summary.slug, teamId) : undefined);
  const name = manager?.manager ?? team?.name?.trim() ?? (teamId ? 'Team' : 'TBD');
  return sideOf(name, team?.name?.trim() || summary.leagueName, formatPoints(score), team?.logoUrl, 'square');
}

function cupSide(side: { participant: ManagerReference | null; total: number | null; label: string }, leagues: SummaryMap): PreviewSide {
  const participant = side.participant;
  const summary = participant ? leagues[participant.slug] : undefined;
  const team = participant ? teamById(summary, participant.teamId) : undefined;
  const name = participant?.manager ?? (side.label || 'TBD');
  return sideOf(name, participant ? leagueName(participant.slug) : 'Waiting', formatPoints(side.total), team?.logoUrl, 'square');
}

function sideOf(name: string, detail: string, score: string | null, logoUrl: string | null | undefined, shape: 'square' | 'round'): PreviewSide {
  return { name: clip(name, 28), detail: clip(detail, 48), score, logoUrl: logoUrl || null, mark: initials(name), shape, odds: null };
}

function withOdds(side: PreviewSide, odds: string | null): PreviewSide {
  return odds ? { ...side, odds } : side;
}

function cupAdvanceOdds(match: CupMatch, leagues: SummaryMap, rosters: Partial<Record<LeagueSlug, LeagueRosterSnapshot>>) {
  if (match.status !== 'live' && match.status !== 'waiting') return null;
  const leftSlug = match.a.participant?.slug;
  const rightSlug = match.b.participant?.slug;
  if (!leftSlug || !rightSlug || !rosters[leftSlug]?.players || !rosters[rightSlug]?.players) return null;
  const players = { [leftSlug]: rosters[leftSlug].players, [rightSlug]: rosters[rightSlug].players };
  const chance = cupMatchChance(match, leagues, players);
  if (chance === 'level') return { left: '50% to advance', right: '50% to advance' };
  if (chance) return { left: `${chance.left}% to advance`, right: `${chance.right}% to advance` };
  const week = Math.max(leagues[leftSlug]?.week ?? 0, leagues[rightSlug]?.week ?? 0);
  if (!match.weeks.includes(week)) return null;
  const leftProjected = matchupProjection(leagues, match.a.participant, [week]);
  const rightProjected = matchupProjection(leagues, match.b.participant, [week]);
  const current = projectedWinChance(rightProjected, leftProjected);
  if (!current) return null;
  const phrase = match.weeks.some(item => item > week) ? 'this week' : 'to advance';
  return { left: `${current.away}% ${phrase}`, right: `${current.home}% ${phrase}` };
}

function person(summary: LeagueSummary | undefined, team: Team | undefined) {
  if (!summary || !team) return undefined;
  return managerFor(summary.slug, team.id);
}

function teamById(summary: LeagueSummary | undefined, teamId: string) {
  return summary?.teams.find(team => team.id === teamId);
}

function rankedTeams(summary: LeagueSummary | undefined) {
  return summary?.teams.filter(team => team.rank != null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) ?? [];
}

function rankedTeam(summary: LeagueSummary | undefined) {
  return rankedTeams(summary)[0];
}

function cupSnapshot(cup: ReturnType<typeof buildCup>) {
  const rows = cup.rounds.flatMap(round => round.matches
    .filter(match => match.status !== 'bye' && match.a.participant && match.b.participant)
    .map(match => ({ round, match })));
  const pick = rows.find(row => row.match.status === 'live')
    ?? [...rows].reverse().find(row => row.match.status === 'final' || row.match.status === 'tied')
    ?? rows.find(row => row.match.a.participant && row.match.b.participant);
  if (!pick) return 'Bracket in progress';
  const left = pick.match.a.participant?.manager ?? 'TBD';
  const right = pick.match.b.participant?.manager ?? 'TBD';
  const scores = scoreLine(formatPoints(pick.match.a.total), formatPoints(pick.match.b.total));
  return `${scores ? `${left} ${scores} ${right}` : `${left} vs ${right}`} · ${pick.round.name}`;
}

function scoreChart(leftSlug: LeagueSlug, leftId: string | null, rightSlug: LeagueSlug, rightId: string | null, week: number, offsetLeft: number, offsetRight: number, final: boolean, rosters: Partial<Record<LeagueSlug, LeagueRosterSnapshot>>, data: PreviewData): BoutChart | null {
  if (!leftId || !rightId || !week) return null;
  const left = { slug: leftSlug, teamId: leftId, manager: '', offset: offsetLeft, score: null, projected: null };
  const right = { slug: rightSlug, teamId: rightId, manager: '', offset: offsetRight, score: null, projected: null };
  return chartForSides({ left, right }, leftSlug, leftId, rightSlug, rightId, week, final, rosters, data);
}

function cupChartWeek(match: CupMatch, leagues: SummaryMap) {
  const current = Math.max(0, ...leagueList().map(slug => leagues[slug]?.week ?? 0));
  const played = match.weeks.filter(week => week <= current);
  return played[played.length - 1] ?? match.weeks[0] ?? 0;
}

function recordedWeek(data: PreviewData) {
  const weeks = Object.values(data.weeks ?? {}).flatMap(rows => rows?.map(row => row.week) ?? []);
  return weeks.length ? Math.max(...weeks) : data.chartWeek ?? data.timelineWeek ?? 0;
}

function featuredChartMatch(leagues: SummaryMap, week: number) {
  let best: { slug: LeagueSlug; id: string; margin: number } | null = null;
  for (const slug of leagueList()) {
    for (const match of leagues[slug]?.weeklyMatchups ?? []) {
      if (match.week !== week || !match.homeTeamId || !match.awayTeamId || match.homeScore == null || match.awayScore == null) continue;
      const margin = Math.abs(match.homeScore - match.awayScore);
      if (!best || margin < best.margin) best = { slug, id: match.id, margin };
    }
  }
  return best;
}

function featuredChartCup(leagues: SummaryMap, week: number) {
  for (const cupId of ['jffl', 'premier', 'championship', 'league-one'] as const) {
    const cup = buildCup(cupId, leagues);
    for (const round of cup.rounds) {
      if (!round.weeks.includes(week)) continue;
      const match = round.matches.find(item => item.status !== 'bye' && item.a.participant && item.b.participant);
      if (match) return { cupId, matchId: match.id };
    }
  }
  return null;
}

export function matchupChartRequest(pathname: string, data: PreviewData = {}): { week: number; past: boolean } | null {
  const [pathPart, queryPart = ''] = pathname.split('?');
  const parts = decodeParts(pathPart);
  const [root, a, b, c] = parts;
  const base = summaries(data);
  const current = Math.max(0, ...leagueList().map(slug => base[slug]?.week ?? 0));
  const view = data.weeks ? leaguesForMatchday(base, data, recordedWeek(data) || current) : base;
  if (root === 'matchday' && isLeague(a) && b) {
    const asked = Number(new URLSearchParams(queryPart).get('week'));
    const week = Number.isInteger(asked) && asked >= 1 && asked <= 18 ? asked : (base[a]?.week ?? current);
    return week ? { week, past: week !== (base[a]?.week ?? week) } : null;
  }
  if (root === 'league' && isLeague(a) && b === 'match' && c) {
    const match = findMatch(view[a] ?? base[a], c, data.weeks?.[a]);
    const week = match && 'week' in match && match.week ? match.week : (base[a]?.week ?? 0);
    return week ? { week, past: week !== (base[a]?.week ?? week) } : null;
  }
  if (root === 'cups' && isCup(a) && b === 'match' && c) {
    const located = buildCup(a, view).rounds.flatMap(round => round.matches).find(match => match.id === c);
    const week = located ? cupChartWeek(located, view) : 0;
    return week ? { week, past: week !== (base.premier?.week ?? current) } : null;
  }
  return null;
}

function featuredMatch(summary: LeagueSummary | undefined) {
  if (!summary) return null;
  const current = summary.weeklyMatchups?.find(item => item.week === summary.week && item.homeTeamId && item.awayTeamId);
  return current ?? summary.matchups.find(item => item.homeTeamId && item.awayTeamId) ?? null;
}

function featuredPlayer(rosters: Partial<Record<LeagueSlug, LeagueRosterSnapshot>>) {
  for (const slug of leagueList()) {
    const player = rosters[slug]?.players.find(item => item.group === 'starter' && item.name && item.weekPoints != null)
      ?? rosters[slug]?.players.find(item => item.name);
    if (player) return player;
  }
  return null;
}

function featuredCup(leagues: SummaryMap) {
  for (const cupId of ['jffl', 'premier', 'championship', 'league-one'] as const) {
    const cup = buildCup(cupId, leagues);
    for (const round of cup.rounds) {
      const match = round.matches.find(item => item.a.participant && item.b.participant && item.status !== 'bye');
      if (match) return { cupId, matchId: match.id };
    }
  }
  return null;
}

function findPlayer(playerId: string, rosters: Partial<Record<LeagueSlug, LeagueRosterSnapshot>>) {
  for (const slug of leagueList()) {
    const roster = rosters[slug];
    const player = roster?.players.find(item => item.id === playerId);
    if (roster && player) return { slug, roster, player };
  }
  return null;
}

function weekLeaders(leagues: SummaryMap, week: number) {
  const rows: { name: string; score: string; value: number; league: string; logoUrl: string | null; accent: string }[] = [];
  for (const slug of leagueList()) {
    const summary = leagues[slug];
    for (const match of summary?.weeklyMatchups ?? []) {
      if (match.week !== week) continue;
      for (const [teamId, score] of [[match.awayTeamId, match.awayScore], [match.homeTeamId, match.homeScore]] as const) {
        const shown = formatPoints(score);
        if (!teamId || shown == null || score == null) continue;
        const team = teamById(summary, teamId);
        const manager = person(summary, team);
        rows.push({ name: manager?.manager ?? team?.name?.trim() ?? 'Team', score: shown, value: score, league: shortLeague(slug), logoUrl: team?.logoUrl || null, accent: ACCENT[slug] });
      }
    }
  }
  return rows.sort((a, b) => b.value - a.value);
}

function weekExtremes(leagues: SummaryMap, week: number): PreviewLine[] {
  const games: { margin: number; winner: PreviewSide; loser: PreviewSide; final: boolean }[] = [];
  for (const slug of leagueList()) {
    const summary = leagues[slug];
    for (const match of summary?.weeklyMatchups ?? []) {
      if (match.week !== week || match.homeScore == null || match.awayScore == null || match.homeScore === match.awayScore) continue;
      const home = contestant(summary, match.homeTeamId, match.homeScore);
      const away = contestant(summary, match.awayTeamId, match.awayScore);
      const homeWon = match.homeScore > match.awayScore;
      games.push({ margin: Math.abs(match.homeScore - match.awayScore), winner: homeWon ? home : away, loser: homeWon ? away : home, final: match.status === 'final' });
    }
  }
  if (!games.length) return [];
  const settled = games.every(game => game.final);
  const byMargin = [...games].sort((a, b) => a.margin - b.margin || a.winner.name.localeCompare(b.winner.name));
  const closest = byMargin[0];
  const blowout = byMargin[byMargin.length - 1];
  const lowWinner = [...games].sort((a, b) => Number(a.winner.score) - Number(b.winner.score) || a.winner.name.localeCompare(b.winner.name))[0];
  const highLoser = [...games].sort((a, b) => Number(b.loser.score) - Number(a.loser.score) || a.loser.name.localeCompare(b.loser.name))[0];
  const line = (name: string, detail: string, logoUrl: string | null): PreviewLine => ({ group: 'Extremes', name, detail, logoUrl, mark: '', accent: ACCENT.jffl });
  const pair = (game: { winner: PreviewSide; loser: PreviewSide; margin: number }) => `${formatPoints(game.margin)} pts · ${game.winner.name} ${game.winner.score}–${game.loser.score} ${game.loser.name}`;
  return [
    line(settled ? 'Closest' : 'Closest', pair(closest), closest.winner.logoUrl),
    line(settled ? 'Blowout' : 'Biggest lead', pair(blowout), blowout.winner.logoUrl),
    line(settled ? 'Low winner' : 'Low lead', `${lowWinner.winner.score} · ${lowWinner.winner.name}`, lowWinner.winner.logoUrl),
    line(settled ? 'High loser' : 'High trailer', `${highLoser.loser.score} · ${highLoser.loser.name}`, highLoser.loser.logoUrl),
  ];
}

function leaguesForMatchday(leagues: SummaryMap, data: PreviewData, week: number): SummaryMap {
  const out: SummaryMap = {};
  for (const slug of leagueList()) {
    const summary = leagues[slug];
    if (!summary) continue;
    const key = (item: { week: number; homeTeamId: string | null; awayTeamId: string | null }) => `${item.week}:${item.homeTeamId ?? ''}:${item.awayTeamId ?? ''}`;
    const chosen = new Map<string, (typeof summary.weeklyMatchups)[number]>();
    for (const item of summary.weeklyMatchups ?? []) chosen.set(key(item), item);
    for (const item of (data.weeks?.[slug] ?? []).filter(row => row.week <= week)) {
      const have = chosen.get(key(item));
      if (!have || (have.status !== 'final' && item.status === 'final')) chosen.set(key(item), item);
    }
    const weeklyMatchups = [...chosen.values()];
    const lifted = week > summary.week && weeklyMatchups?.some(item => item.week === week) ? week + 1 : summary.week;
    out[slug] = lifted === summary.week && weeklyMatchups === summary.weeklyMatchups ? summary : { ...summary, week: lifted, weeklyMatchups };
  }
  return out;
}

function playedSide(match: { left: MatchdaySide; right: MatchdaySide | null }, slug: LeagueSlug, teamId: string | null): MatchdaySide | null {
  if (!teamId) return null;
  if (match.left.slug === slug && match.left.teamId === teamId) return match.left;
  if (match.right?.slug === slug && match.right.teamId === teamId) return match.right;
  return null;
}

function chartForSides(match: { left: MatchdaySide; right: MatchdaySide | null }, leftSlug: LeagueSlug, leftId: string | null, rightSlug: LeagueSlug, rightId: string | null, week: number, final: boolean, rosters: Partial<Record<LeagueSlug, LeagueRosterSnapshot>>, data: PreviewData): BoutChart | null {
  if (data.timelineWeek != null && data.timelineWeek !== week) return null;
  const left = playedSide(match, leftSlug, leftId);
  const right = playedSide(match, rightSlug, rightId);
  if (!left || !right || !data.timeline) return null;
  const leftSeries = data.timeline[left.slug]?.series?.[left.teamId];
  const rightSeries = data.timeline[right.slug]?.series?.[right.teamId];
  if (!leftSeries?.t.length || !rightSeries?.t.length) return null;
  const games = { ...data.timeline[left.slug]?.games, ...data.timeline[right.slug]?.games };
  const starters = (side: MatchdaySide) => {
    const rows = historicalStarters(rosters[side.slug]?.weeklyLineups, side.teamId, week);
    if (!rows?.length) return [];
    return rows.map(row => toOddsStarter({ ...row, weekPoints: null }, week));
  };
  const leftStarters = starters(left);
  const rightStarters = starters(right);
  const replay = final && !recordedProjection(leftSeries) && !recordedProjection(rightSeries);
  const history = !replay && leftStarters.length && rightStarters.length
    ? winChanceSeries(leftSeries, rightSeries, at => ({
      left: sideVariance(leftStarters, games, at, Date.now(), week),
      right: sideVariance(rightStarters, games, at, Date.now(), week),
    }), left.offset, right.offset)
    : [];
  const scores = history.length >= 2 ? history : scoreSamples(leftSeries, rightSeries, left.offset, right.offset);
  const chancePoints = history.length >= 2 ? trimPlateau(history) : [];
  const scorePoints = trimPlateau(scores);
  if (chancePoints.length < 2 && scorePoints.length < 2) return null;
  const drawn = chancePoints.length >= 2 ? takeEven(chancePoints) : takeEven(scorePoints);
  return {
    chance: chancePoints.length >= 2 ? drawn.map(point => point.chance) : [],
    scoreLeft: drawn.map(point => point.scoreLeft),
    scoreRight: drawn.map(point => point.scoreRight),
  };
}

/** Drop the long flat tail after the scores and win chance have stopped changing, keeping its first point. */
function trimPlateau(points: ChancePoint[]) {
  if (points.length < 3) return points;
  let end = points.length - 1;
  const same = (left: ChancePoint, right: ChancePoint) => left.chance === right.chance && left.scoreLeft === right.scoreLeft && left.scoreRight === right.scoreRight;
  while (end > 1 && same(points[end], points[end - 1])) end -= 1;
  return points.slice(0, end + 1);
}

/** Evenly sample in the same gap-collapsed time the matchday chart uses, so a quiet overnight stretch does not flatten the line. */
function takeEven(points: ChancePoint[], count = 42): ChancePoint[] {
  if (points.length <= count) return points;
  const warp = collapseGaps(points.map(point => point.t * 1000));
  const xs = points.map(point => warp.toX(point.t * 1000));
  const start = xs[0];
  const span = xs[xs.length - 1] - start || 1;
  const out: ChancePoint[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const target = start + (span * index) / (count - 1);
    while (cursor < xs.length - 1 && xs[cursor + 1] < target) cursor += 1;
    out.push(points[cursor]);
  }
  out[out.length - 1] = points[points.length - 1];
  return out;
}

function chartKey(chart: BoutChart | null | undefined) {
  if (!chart?.scoreLeft.length && !chart?.chance.length) return '';
  return `${lastSample(chart.chance)}:${lastSample(chart.scoreLeft)}:${lastSample(chart.scoreRight)}:${chart.chance.length}`;
}

function lastSample(values: (number | null)[] | undefined) {
  if (!values) return '';
  for (let index = values.length - 1; index >= 0; index -= 1) if (values[index] != null) return values[index];
  return '';
}

function matchdayPath(leagues: SummaryMap, team: { id: string } | undefined, week: string) {
  const shown = week ? Number(week) : 0;
  const qualifies = (slug: LeagueSlug, id: string) => {
    const summary = leagues[slug];
    if (!summary || !shown) return false;
    const playing = summary.weeklyMatchups?.some(match => match.week === shown && [match.homeTeamId, match.awayTeamId].includes(id));
    return !!playing && currentCupMatchesForTeam(leagues, slug, id, shown).some(entry => entry.match.status !== 'bye');
  };
  if (team && qualifies('premier', team.id)) return `/matchday/premier/${team.id}${week ? `?week=${week}` : ''}`;
  for (const slug of leagueList()) {
    const summary = leagues[slug];
    const found = summary?.teams.find(item => {
      if (!shown) return false;
      const playing = summary.weeklyMatchups?.some(match => match.week === shown && [match.homeTeamId, match.awayTeamId].includes(item.id));
      const cup = currentCupMatchesForTeam(leagues, slug, item.id, shown).some(entry => entry.match.status !== 'bye');
      return playing && cup;
    });
    if (found) return `/matchday/${slug}/${found.id}${week ? `?week=${week}` : ''}`;
  }
  const fallback = team?.id ?? '16';
  return `/matchday/premier/${fallback}${week ? `?week=${week}` : ''}`;
}

function boutText(away: PreviewSide, home: PreviewSide) {
  const scores = scoreLine(away.score, home.score);
  return scores ? `${away.name} ${scores} ${home.name}` : `${away.name} vs ${home.name}`;
}

const WEEK_STAT_ORDER = ['Rush yards', 'Rush TD', 'Rec yards', 'Rec TD', 'Receptions', 'Pass yards', 'Pass TD', 'Targets', 'Sacks', 'Defensive INT', 'Field goals', 'Extra points'];

function weekStatFacts(stats: Record<string, number> | undefined): PreviewFact[] {
  if (!stats) return [];
  return WEEK_STAT_ORDER.flatMap(label => {
    const value = stats[label];
    const shown = formatPoints(value);
    return value != null && value !== 0 && shown ? [{ label, value: shown }] : [];
  }).slice(0, 2);
}

function nflOpponent(proTeam: string, week: number, games: NonNullable<PreviewData['games']>) {
  if (!proTeam) return null;
  if (byeWeek(proTeam) === week) return 'Bye';
  const game = games[proTeam.trim().toUpperCase()];
  if (!game?.opponent) return null;
  const when = kickoffLabel(game.kickoff);
  return when ? `vs ${game.opponent} · ${when}` : `vs ${game.opponent}`;
}

function cupTitleExcerpt() {
  const ranked = [...MANAGERS].sort((a, b) => b.cupTitles - a.cupTitles || a.manager.localeCompare(b.manager));
  const top = ranked[0];
  if (!top?.cupTitles) return 'A shared answer from Ask the archive.';
  const tied = ranked.filter(item => item.cupTitles === top.cupTitles);
  if (tied.length > 1) return `${tied.map(item => item.manager).join(' and ')} lead the JFFL Cup with ${top.cupTitles} titles.`;
  return `${top.manager} has the most JFFL Cup titles, with ${top.cupTitles}.`;
}

export function answerExcerpt(value: string) {
  const withoutFollowUps = oneLine(value).replace(/\s*Follow-ups:.*$/i, '');
  return clip(withoutFollowUps, 170);
}

function matchStatus(match: Matchup & { week?: number; status?: 'live' | 'final' | 'pending' }, currentWeek: number) {
  if (match.status === 'final') return 'Final';
  if (match.status === 'pending') return 'Upcoming';
  if (match.status === 'live') return 'Live';
  if (match.week != null && match.week > currentWeek) return 'Upcoming';
  if (match.awayScore != null && match.homeScore != null && match.week != null && match.week < currentWeek) return 'Final';
  return 'Live';
}

function cupStatus(status: string) {
  if (status === 'final') return 'Final';
  if (status === 'live') return 'Live';
  if (status === 'tied') return 'Level';
  if (status === 'bye') return 'Bye';
  if (status === 'unavailable') return 'Score unavailable';
  return 'Waiting';
}

function recordOf(team: Team | undefined) {
  if (!team || team.wins == null || team.losses == null) return null;
  return team.ties ? `${team.wins}-${team.losses}-${team.ties}` : `${team.wins}-${team.losses}`;
}

function rankLabel(rank: number | null | undefined) {
  if (rank == null || !Number.isInteger(rank) || rank < 1) return null;
  const end = rank % 100;
  const suffix = end >= 11 && end <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[rank % 10] ?? 'th';
  return `${rank}${suffix}`;
}

function pointsLabel(value: number | null | undefined) {
  return formatPoints(value);
}

function formatPoints(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function scoreLine(left: string | null, right: string | null) {
  return left != null && right != null ? `${left}–${right}` : null;
}

function headshot(player: Pick<RosteredPlayer, 'id' | 'position'>) {
  if (player.position === 'D/ST' || player.id.startsWith('-') || !/^\d+$/.test(player.id)) return null;
  return `https://a.espncdn.com/i/headshots/nfl/players/full/${player.id}.png`;
}

function nflLogo(proTeam: string) {
  const abbr = proTeam.trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(abbr) ? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png` : null;
}

function leagueName(slug: string) {
  return LEAGUES.find(league => league.slug === slug)?.name ?? 'JFFL';
}

function shortLeague(slug: LeagueSlug) {
  if (slug === 'premier') return 'Premier';
  if (slug === 'championship') return 'Championship';
  return 'League One';
}

function leagueList(): LeagueSlug[] {
  return LEAGUES.map(league => league.slug);
}

function isLeague(value: string | undefined): value is LeagueSlug {
  return !!value && LEAGUE_SLUGS.has(value);
}

function isCup(value: string | undefined): value is CupId {
  return !!value && CUP_IDS.has(value);
}

function numbered(value: string | undefined) {
  return !!value && /^\d{1,2}$/.test(value) && Number(value) >= 1;
}

function shareKey(value: string | undefined) {
  return !!value && /^[A-Za-z0-9]{10,128}$/.test(value);
}

function decodeParts(pathname: string) {
  return canonicalPath(pathname).split('/').filter(Boolean).map(part => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
}

function canonicalPath(pathname: string) {
  const raw = pathname.split('?')[0].split('#')[0] || '/';
  if (!raw.startsWith('/') || raw.includes('\\') || raw.includes('//')) return '/';
  const pieces = raw.split('/').filter(Boolean).slice(0, 8);
  const encoded = pieces.map(piece => {
    try { return encodeURIComponent(decodeURIComponent(piece)); } catch { return encodeURIComponent(piece); }
  });
  return `/${encoded.join('/')}`;
}

function decodeName(value: string) {
  const clean = oneLine(value).replace(/[<>]/g, '');
  return clip(clean || 'Manager', 40);
}

function pageTitle(headline: string) {
  const clean = clip(oneLine(headline), 90);
  if (!clean) return DEFAULT_TITLE;
  return clean.includes('| JFFL') ? clean : `${clean} | JFFL`;
}

function sentence(parts: Array<string | null | undefined | false>) {
  return parts.flatMap(part => {
    const clean = part ? oneLine(part) : '';
    return clean ? [clean] : [];
  }).join(' · ');
}

function oneLine(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function initials(name: string) {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0]?.slice(0, 2) ?? 'J').toUpperCase();
  return letters;
}

function clip(value: string, limit = 180) {
  const clean = oneLine(value);
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
}

function hash(value: string) {
  let hashValue = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hashValue ^= value.charCodeAt(index);
    hashValue = Math.imul(hashValue, 16777619);
  }
  return (hashValue >>> 0).toString(36);
}

function absolute(origin: string, path: string) {
  return new URL(path, origin.endsWith('/') ? origin : `${origin}/`).toString();
}
