import { buildCup, matchupProjection, type Cup, type CupId, type CupMatch, type SummaryMap } from '../competitions.ts';
import { MANAGERS, managerFor, type ManagerReference } from '../reference.ts';
import { LEAGUES, type LeagueSlug, type LeagueSummary, type Matchup } from '../types.ts';

export const CARD_KINDS = ['matchup', 'cup_match', 'team', 'standings'] as const;
export type CardKind = (typeof CARD_KINDS)[number];

/** A card is a recipe, not a copy: it is drawn from the latest snapshot every time it is shown. */
export type CardSpec =
  | { kind: 'matchup'; league: LeagueSlug; week: number; teamId: string }
  | { kind: 'cup_match'; cup: CupId; matchId: string }
  | { kind: 'team'; league: LeagueSlug; teamId: string }
  | { kind: 'standings'; league: LeagueSlug };

export interface CardItem { id: string; spec: CardSpec }

export interface CardText {
  title: string;
  /** One plain line of the numbers on the card, for the model and for copied email. */
  facts: string;
  url: string;
}

export const MAX_CARDS = 4;

const SLUGS = LEAGUES.map(meta => meta.slug);
const CUP_IDS: CupId[] = ['jffl', ...SLUGS];
const isSlug = (value: unknown): value is LeagueSlug => typeof value === 'string' && (SLUGS as string[]).includes(value);
const isCupId = (value: unknown): value is CupId => typeof value === 'string' && (CUP_IDS as string[]).includes(value);
const leagueName = (slug: LeagueSlug) => LEAGUES.find(meta => meta.slug === slug)!.name;
const cupName = (id: CupId) => (id === 'jffl' ? 'JFFL Cup' : `${leagueName(id)} Cup`);
const fold = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export const teamUrl = (slug: LeagueSlug, teamId: string) => `/league/${slug}/team/${teamId}`;
export const archiveManagerUrl = (name: string) => `/archive/managers/${encodeURIComponent(name)}`;

/** Where a manager name in an answer links: this season's team page, or the archive profile for past managers. */
export function managerLinks(archiveNames: string[]): Map<string, string> {
  const links = new Map<string, string>();
  for (const name of archiveNames) links.set(name, archiveManagerUrl(name));
  for (const item of MANAGERS) links.set(item.manager, teamUrl(item.slug, item.teamId));
  return links;
}

/** Matches whole manager names, longest first, so "J-Seitz" is never read as a shorter name. */
export function nameMatcher(names: Iterable<string>): RegExp | null {
  const list = [...new Set(names)].filter(name => name.trim()).sort((a, b) => b.length - a.length)
    .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return list.length ? new RegExp(`(?<![\\w-])(${list.join('|')})(?![\\w-])`, 'g') : null;
}

/** Splits answer text so the first mention of each manager can become a link. Later mentions stay plain. */
export function splitNames(text: string, matcher: RegExp | null, seen: Set<string>): Array<{ text: string; name?: string }> {
  if (!matcher) return [{ text }];
  const parts: Array<{ text: string; name?: string }> = [];
  let last = 0;
  for (const match of text.matchAll(matcher)) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: name, name });
    last = match.index + name.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

const score = (value: number | null | undefined) => (value == null ? 'no score yet' : String(Math.round(value * 100) / 100));
const projectionFact = (away: number | null, home: number | null) => {
  if (away == null && home == null) return '';
  const text = (value: number | null) => (value == null ? 'unknown' : score(value));
  return `, projected ${text(away)} to ${text(home)}`;
};
const managerOf = (slug: LeagueSlug, teamId: string | null, summary: LeagueSummary) =>
  (teamId ? managerFor(slug, teamId)?.manager ?? summary.teams.find(team => team.id === teamId)?.name : null) ?? 'Bye';
const recordOf = (team: { wins: number | null; losses: number | null; ties: number | null }) =>
  team.wins === null || team.losses === null ? 'record unknown' : `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ''}`;

function findManager(name: unknown): ManagerReference | string {
  if (typeof name !== 'string' || !name.trim()) return 'Give the manager name.';
  const wanted = fold(name);
  const found = MANAGERS.find(item => fold(item.manager) === wanted);
  return found ?? `"${name}" is not a manager in the current season. Use resolve_entity to check the spelling.`;
}

function parseLeague(value: unknown): LeagueSlug | null {
  if (typeof value !== 'string') return null;
  const wanted = fold(value).replace(/league$/, '');
  return LEAGUES.find(meta => fold(meta.slug) === wanted || fold(meta.name).replace(/league$/, '') === wanted)?.slug ?? null;
}

function parseCup(value: unknown): CupId | null {
  if (typeof value !== 'string') return null;
  const wanted = fold(value).replace(/cup$/, '');
  return wanted === 'jffl' ? 'jffl' : parseLeague(wanted);
}

// ---------- Lookups shared by validation and rendering ----------

export interface MatchupView {
  summary: LeagueSummary;
  matchup: Matchup;
  week: number;
  status: 'live' | 'final' | 'pending';
  url: string;
}

/** The current week uses the scoreboard entry (it has projections); earlier weeks use the weekly results. */
export function matchupView(summaries: SummaryMap, spec: Extract<CardSpec, { kind: 'matchup' }>): MatchupView | null {
  const summary = summaries[spec.league];
  if (!summary) return null;
  const has = (item: Matchup) => item.homeTeamId === spec.teamId || item.awayTeamId === spec.teamId;
  const weekly = summary.weeklyMatchups?.find(item => item.week === spec.week && has(item));
  const scoreboard = spec.week === summary.week ? summary.matchups.find(has) : undefined;
  const matchup = scoreboard ?? weekly;
  if (!matchup) return null;
  const status = weekly?.status ?? (spec.week < summary.week ? 'final' : 'live');
  return { summary, matchup, week: spec.week, status, url: `/league/${spec.league}/match/${matchup.id}` };
}

export interface CupMatchView { cup: Cup; roundName: string; match: CupMatch; url: string }

export function cupMatchView(summaries: SummaryMap, spec: Extract<CardSpec, { kind: 'cup_match' }>): CupMatchView | null {
  if (spec.cup === 'jffl' ? SLUGS.some(slug => !summaries[slug]) : !summaries[spec.cup]) return null;
  const cup = buildCup(spec.cup, summaries);
  for (const round of cup.rounds) {
    const match = round.matches.find(item => item.id === spec.matchId);
    if (match) return { cup, roundName: round.name, match, url: `/cups/${spec.cup}/match/${match.id}` };
  }
  return null;
}

/** Text form of a card. Returns null when the snapshot no longer has what the card points to. */
export function describeCard(summaries: SummaryMap, spec: CardSpec): CardText | null {
  if (spec.kind === 'matchup') {
    const view = matchupView(summaries, spec);
    if (!view) return null;
    const { summary, matchup } = view;
    const away = managerOf(spec.league, matchup.awayTeamId, summary);
    const home = managerOf(spec.league, matchup.homeTeamId, summary);
    const state = view.status === 'final' ? 'final' : view.status === 'live' ? 'in progress' : 'not started';
    const projected = projectionFact(matchup.awayProjected, matchup.homeProjected);
    return {
      title: `${away} vs ${home}, week ${spec.week}`,
      facts: `${leagueName(spec.league)} week ${spec.week}: ${away} ${score(matchup.awayScore)}, ${home} ${score(matchup.homeScore)} (${state}${projected})`,
      url: view.url,
    };
  }
  if (spec.kind === 'cup_match') {
    const view = cupMatchView(summaries, spec);
    if (!view) return null;
    const { match } = view;
    const a = match.a.participant?.manager ?? (match.a.label || 'TBD');
    const b = match.b.participant?.manager ?? (match.b.label || 'TBD');
    const weeks = match.weeks.length > 1 ? `weeks ${match.weeks[0]}-${match.weeks.at(-1)}` : `week ${match.weeks[0]}`;
    const state = match.status === 'bye' ? `${a} has a bye` : match.status === 'waiting' ? 'not started'
      : match.status === 'tied' ? 'tied, decided by an old fashioned duel' : match.status === 'unavailable' ? 'scores pending'
      : match.status === 'final' ? `final${match.winner ? `, ${match.winner.manager} advances` : ''}` : 'in progress';
    const projected = projectionFact(
      match.a.participant ? matchupProjection(summaries, match.a.participant, match.weeks) : null,
      match.b.participant ? matchupProjection(summaries, match.b.participant, match.weeks) : null,
    );
    return {
      title: `${a} vs ${b}, ${view.cup.name} ${view.roundName}`,
      facts: `${view.cup.name} ${view.roundName} (${weeks}): ${a} ${score(match.a.total)}, ${b} ${score(match.b.total)} (${state}${projected})`,
      url: view.url,
    };
  }
  const summary = summaries[spec.league];
  if (!summary) return null;
  if (spec.kind === 'team') {
    const team = summary.teams.find(item => item.id === spec.teamId);
    if (!team) return null;
    const manager = managerOf(spec.league, team.id, summary);
    return {
      title: `${manager} (${team.name})`,
      facts: `${manager}, ${team.name}, ${leagueName(spec.league)}: ${recordOf(team)}, rank ${team.rank ?? 'unknown'}, ${score(team.pointsFor)} points for`,
      url: teamUrl(spec.league, team.id),
    };
  }
  const order = [...summary.teams].sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99));
  return {
    title: `${leagueName(spec.league)} standings`,
    facts: `${leagueName(spec.league)} after week ${summary.completedWeeks ?? summary.week - 1}: ${order.map(team => `${team.rank ?? '?'}. ${managerOf(spec.league, team.id, summary)} ${recordOf(team)}`).join(', ')}`,
    url: `/league/${spec.league}`,
  };
}

// ---------- Validation of a model request ----------

export type CardOutcome = { ok: true; spec: CardSpec; text: CardText } | { ok: false; error: string };

/** The cup match that matters now: one being played, else the next one, else the most recent. */
function currentCupMatch(summaries: SummaryMap, cups: CupId[], manager: ManagerReference) {
  const found: Array<{ cup: CupId; match: CupMatch }> = [];
  for (const id of cups) {
    if (id === 'jffl' ? SLUGS.some(slug => !summaries[slug]) : !summaries[id]) continue;
    for (const round of buildCup(id, summaries).rounds) {
      const match = round.matches.find(item => [item.a.participant, item.b.participant].some(person => person?.key === manager.key));
      if (match) found.push({ cup: id, match });
    }
  }
  const first = (item: { match: CupMatch }) => Math.min(...item.match.weeks);
  const live = found.find(item => item.match.status === 'live');
  const upcoming = found.filter(item => item.match.status === 'waiting' || item.match.status === 'unavailable').sort((a, b) => first(a) - first(b))[0];
  const recent = found.filter(item => !['live', 'waiting', 'unavailable'].includes(item.match.status)).sort((a, b) => first(b) - first(a))[0];
  return live ?? upcoming ?? recent ?? null;
}

/** Checks a show_card request against the snapshot. The model supplies names only; ids and links come from here. */
export function resolveCard(summaries: SummaryMap, rawArgs: unknown): CardOutcome {
  const args = (typeof rawArgs === 'object' && rawArgs !== null ? rawArgs : {}) as Record<string, unknown>;
  const kind = args.kind;
  if (!(CARD_KINDS as readonly unknown[]).includes(kind)) return { ok: false, error: `kind must be one of ${CARD_KINDS.join(', ')}.` };
  if (!SLUGS.some(slug => summaries[slug])) return { ok: false, error: 'Current-season data is not loaded, so no card can be shown.' };
  const done = (spec: CardSpec): CardOutcome => {
    const text = describeCard(summaries, spec);
    return text ? { ok: true, spec, text } : { ok: false, error: 'That card has no data in the current snapshot.' };
  };

  if (kind === 'standings') {
    let league = parseLeague(args.league);
    if (!league && args.manager !== undefined) {
      const found = findManager(args.manager);
      if (typeof found === 'string') return { ok: false, error: found };
      league = found.slug;
    }
    if (!league) return { ok: false, error: 'Give league as Premier, Championship, or League One.' };
    return done({ kind, league });
  }

  const manager = findManager(args.manager);
  if (typeof manager === 'string') return { ok: false, error: manager };
  if (kind === 'team') return done({ kind, league: manager.slug, teamId: manager.teamId });

  if (kind === 'matchup') {
    const summary = summaries[manager.slug];
    if (!summary) return { ok: false, error: `${leagueName(manager.slug)} data is not loaded.` };
    const week = args.week === undefined || args.week === null ? summary.week : Number(args.week);
    const lastWeek = Math.max(summary.week, ...(summary.weeklyMatchups ?? []).map(item => item.week));
    if (!Number.isInteger(week) || week < 1 || week > lastWeek) return { ok: false, error: `week must be a whole number from 1 to ${lastWeek}.` };
    const spec: CardSpec = { kind, league: manager.slug, week, teamId: manager.teamId };
    const view = matchupView(summaries, spec);
    if (!view) return { ok: false, error: `${manager.manager} has no league matchup in week ${week}.` };
    if (args.opponent !== undefined && args.opponent !== null && args.opponent !== '') {
      const other = view.matchup.homeTeamId === manager.teamId ? view.matchup.awayTeamId : view.matchup.homeTeamId;
      const opponent = managerOf(manager.slug, other, view.summary);
      if (fold(String(args.opponent)) !== fold(opponent)) return { ok: false, error: `${manager.manager} plays ${opponent} in week ${week}, not ${String(args.opponent)}.` };
    }
    return done(spec);
  }

  const asked = args.cup === undefined || args.cup === null || args.cup === '' ? null : parseCup(args.cup);
  if (args.cup !== undefined && args.cup !== null && args.cup !== '' && !asked) return { ok: false, error: 'cup must be JFFL or a league name.' };
  if (asked && asked !== 'jffl' && asked !== manager.slug) return { ok: false, error: `${manager.manager} plays in the ${cupName(manager.slug)}, not the ${cupName(asked)}.` };
  const found = currentCupMatch(summaries, asked ? [asked] : ['jffl', manager.slug], manager);
  if (!found) return { ok: false, error: `No cup match found for ${manager.manager}.` };
  return done({ kind: 'cup_match', cup: found.cup, matchId: found.match.id });
}

/** Shape check for cards read back from browser storage. */
export function isCardSpec(value: unknown): value is CardSpec {
  const spec = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const id = (text: unknown) => typeof text === 'string' && /^[\w-]{1,40}$/.test(text);
  switch (spec.kind) {
    case 'matchup': return isSlug(spec.league) && Number.isInteger(spec.week) && (spec.week as number) > 0 && (spec.week as number) < 30 && id(spec.teamId);
    case 'cup_match': return isCupId(spec.cup) && id(spec.matchId);
    case 'team': return isSlug(spec.league) && id(spec.teamId);
    case 'standings': return isSlug(spec.league);
    default: return false;
  }
}

export const isCardItem = (value: unknown): value is CardItem =>
  typeof value === 'object' && value !== null && typeof (value as CardItem).id === 'string' && isCardSpec((value as CardItem).spec);
