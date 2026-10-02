export const LEAGUE_NAMES = ['Combined', 'Premier', 'Championship', 'League One', 'JFFL'] as const;
export const GAME_TYPES = ['Season', 'Cup', 'Superbowl'] as const;
export type LeagueName = (typeof LEAGUE_NAMES)[number];
export type GameType = (typeof GAME_TYPES)[number];

export interface HistoryGame {
  season: number;
  league: LeagueName;
  type: GameType;
  round: string;
  week: number | null;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
}

export interface HistorySeason {
  season: number;
  team: string;
  league: LeagueName;
  rankSeason: number | null;
  rankFinal: number | null;
  jfflRank: number | null;
  cupRank: number | null;
  points: number | null;
  pointsPerWeek: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  draft: number | null;
  pointsRank: number | null;
}

export interface ArchiveFile {
  leagues: string[];
  types: string[];
  games: Array<[number, number, number, number | string, string, string, number, number]>;
  seasons: Array<[number, string, number, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null]>;
}

export interface YearScore { season: number; games: number; mean: number; }
export interface ScoreLine { season: number; league: LeagueName; type: GameType; round: string; week: number | null; team: string; opponent: string; score: number; opponentScore: number; margin: number; }
export interface TitleLeague { league: LeagueName; seasonChamps: string[]; superBowl: string | null; cup: string | null; same: boolean; }
export interface TitleYear { season: number; jffl: string | null; leagues: TitleLeague[]; }
export interface SeriesRow { teamA: string; teamB: string; meetings: number; winsA: number; winsB: number; ties: number; }
export interface CareerRow { team: string; seasons: number; first: number; last: number; seasonTitles: number; superBowls: number; jfflCups: number; leagueCups: number; wins: number; losses: number; ties: number; }
export interface DraftBucket { label: string; seasons: number; titles: number; topThree: number; }
export interface DraftSlot { slot: number; seasons: number; titles: number; topThree: number; }

const named = <T extends string>(values: readonly T[], index: number, label: string): T => {
  const value = values[index];
  if (!value) throw new Error(`Unknown ${label} index ${index}`);
  return value;
};

export function parseArchive(file: ArchiveFile) {
  const games: HistoryGame[] = file.games.map(row => {
    const type = named(GAME_TYPES, row[2], 'game type');
    const week = type === 'Season' ? Number(row[3]) : null;
    return {
      season: row[0],
      league: named(LEAGUE_NAMES, row[1], 'league'),
      type,
      round: String(row[3]),
      week,
      teamA: row[4],
      teamB: row[5],
      scoreA: row[6],
      scoreB: row[7],
    };
  });
  const seasons: HistorySeason[] = file.seasons.map(row => ({
    season: row[0],
    team: row[1],
    league: named(LEAGUE_NAMES, row[2], 'league'),
    rankSeason: row[3],
    rankFinal: row[4],
    jfflRank: row[5],
    cupRank: row[6],
    points: row[7],
    pointsPerWeek: row[8],
    wins: row[9],
    losses: row[10],
    ties: row[11],
    draft: row[12],
    pointsRank: row[13],
  }));
  return { games, seasons };
}

export function roundLabel(game: Pick<HistoryGame, 'week' | 'round'>) {
  if (game.week) return `week ${game.week}`;
  if (game.round.endsWith('Final')) return 'final';
  return `round ${game.round}`;
}

export function scoringByYear(games: HistoryGame[]): YearScore[] {
  const buckets = new Map<number, number[]>();
  for (const game of games) {
    if (game.type !== 'Season') continue;
    const scores = buckets.get(game.season) ?? [];
    scores.push(game.scoreA, game.scoreB);
    buckets.set(game.season, scores);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([season, scores]) => ({
    season,
    games: scores.length / 2,
    mean: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 10) / 10,
  }));
}

export function eraMean(games: HistoryGame[], from: number, to: number) {
  const scores: number[] = [];
  for (const game of games) {
    if (game.type !== 'Season' || game.season < from || game.season > to) continue;
    scores.push(game.scoreA, game.scoreB);
  }
  return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 10) / 10 : null;
}

function sides(game: HistoryGame): ScoreLine[] {
  const base = { season: game.season, league: game.league, type: game.type, round: game.round, week: game.week };
  return [
    { ...base, team: game.teamA, opponent: game.teamB, score: game.scoreA, opponentScore: game.scoreB, margin: Math.abs(game.scoreA - game.scoreB) },
    { ...base, team: game.teamB, opponent: game.teamA, score: game.scoreB, opponentScore: game.scoreA, margin: Math.abs(game.scoreA - game.scoreB) },
  ];
}

export function recordBook(games: HistoryGame[], predicate: (game: HistoryGame) => boolean) {
  const matching = games.filter(predicate);
  const lines = matching.flatMap(sides);
  const decided = matching.filter(game => game.scoreA !== game.scoreB);
  const byMargin = [...decided].sort((a, b) => Math.abs(b.scoreA - b.scoreB) - Math.abs(a.scoreA - a.scoreB) || b.season - a.season);
  return {
    games: matching.length,
    highest: [...lines].sort((a, b) => b.score - a.score || b.season - a.season),
    lowest: [...lines].sort((a, b) => a.score - b.score || a.season - b.season),
    blowouts: byMargin,
    closest: decided.filter(game => Math.abs(game.scoreA - game.scoreB) === 1).sort((a, b) => b.season - a.season),
    ties: matching.filter(game => game.scoreA === game.scoreB).sort((a, b) => b.season - a.season),
  };
}

export const WEEKLY = (game: HistoryGame) => game.type === 'Season';
export const JFFL_CUP = (game: HistoryGame) => game.type === 'Cup' && game.league === 'JFFL';
export const LEAGUE_CUP = (game: HistoryGame) => game.type === 'Cup' && game.league !== 'JFFL';
export const SUPER_BOWL = (game: HistoryGame) => game.type === 'Superbowl';

function ranked(rows: HistorySeason[], rank: keyof Pick<HistorySeason, 'rankSeason' | 'rankFinal' | 'cupRank' | 'jfflRank'>, value: number) {
  return rows.filter(row => row[rank] === value).map(row => row.team).sort((a, b) => a.localeCompare(b));
}

export function titleYears(seasons: HistorySeason[]): TitleYear[] {
  const years = [...new Set(seasons.map(row => row.season))].sort((a, b) => a - b);
  return years.map(season => {
    const rows = seasons.filter(row => row.season === season);
    const leagues = [...new Set(rows.map(row => row.league))];
    return {
      season,
      jffl: ranked(rows, 'jfflRank', 1)[0] ?? null,
      leagues: leagues.map(league => {
        const group = rows.filter(row => row.league === league);
        const seasonChamps = ranked(group, 'rankSeason', 1);
        const bowl = ranked(group, 'rankFinal', 1);
        return {
          league,
          seasonChamps,
          superBowl: bowl[0] ?? null,
          cup: ranked(group, 'cupRank', 1)[0] ?? null,
          same: seasonChamps.length === 1 && bowl.length === 1 && seasonChamps[0] === bowl[0],
        };
      }),
    };
  });
}

export function superBowlOverlap(years: TitleYear[]) {
  const leagues = years.flatMap(year => year.leagues).filter(league => league.superBowl);
  return { same: leagues.filter(league => league.same).length, leagues: leagues.length };
}

export function seriesTable(games: HistoryGame[]): SeriesRow[] {
  const rows = new Map<string, SeriesRow>();
  for (const game of games) {
    if (game.type !== 'Season') continue;
    const [teamA, teamB] = [game.teamA, game.teamB].sort((a, b) => a.localeCompare(b));
    const key = `${teamA}\0${teamB}`;
    const row = rows.get(key) ?? { teamA, teamB, meetings: 0, winsA: 0, winsB: 0, ties: 0 };
    row.meetings += 1;
    if (game.scoreA === game.scoreB) row.ties += 1;
    else {
      const winner = game.scoreA > game.scoreB ? game.teamA : game.teamB;
      if (winner === teamA) row.winsA += 1;
      else row.winsB += 1;
    }
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.meetings - a.meetings || a.teamA.localeCompare(b.teamA));
}

export function pairGames(games: HistoryGame[], left: string, right: string) {
  return games.filter(game => game.type === 'Season' && [game.teamA, game.teamB].includes(left) && [game.teamA, game.teamB].includes(right) && left !== right)
    .sort((a, b) => a.season - b.season || (a.week ?? 0) - (b.week ?? 0));
}

export function careers(seasons: HistorySeason[]): CareerRow[] {
  const rows = new Map<string, CareerRow>();
  for (const season of seasons) {
    const row = rows.get(season.team) ?? { team: season.team, seasons: 0, first: season.season, last: season.season, seasonTitles: 0, superBowls: 0, jfflCups: 0, leagueCups: 0, wins: 0, losses: 0, ties: 0 };
    row.seasons += 1;
    row.first = Math.min(row.first, season.season);
    row.last = Math.max(row.last, season.season);
    if (season.rankSeason === 1) row.seasonTitles += 1;
    if (season.rankFinal === 1) row.superBowls += 1;
    if (season.jfflRank === 1) row.jfflCups += 1;
    if (season.cupRank === 1) row.leagueCups += 1;
    row.wins += season.wins ?? 0;
    row.losses += season.losses ?? 0;
    row.ties += season.ties ?? 0;
    rows.set(season.team, row);
  }
  return [...rows.values()].sort((a, b) => b.seasonTitles - a.seasonTitles || b.superBowls - a.superBowls || b.seasons - a.seasons || a.team.localeCompare(b.team));
}

export function draftBuckets(seasons: HistorySeason[]): DraftBucket[] {
  const buckets: DraftBucket[] = [
    { label: 'Pick 1', seasons: 0, titles: 0, topThree: 0 },
    { label: 'Picks 2–4', seasons: 0, titles: 0, topThree: 0 },
    { label: 'Picks 5–8', seasons: 0, titles: 0, topThree: 0 },
    { label: 'Pick 9 or later', seasons: 0, titles: 0, topThree: 0 },
  ];
  for (const season of seasons) {
    if (season.draft == null || season.rankSeason == null) continue;
    const bucket = season.draft === 1 ? buckets[0] : season.draft <= 4 ? buckets[1] : season.draft <= 8 ? buckets[2] : buckets[3];
    bucket.seasons += 1;
    if (season.rankSeason === 1) bucket.titles += 1;
    if (season.rankSeason <= 3) bucket.topThree += 1;
  }
  return buckets;
}

export function draftSlots(seasons: HistorySeason[]): DraftSlot[] {
  const bySlot = new Map<number, DraftSlot>();
  for (const season of seasons) {
    if (season.draft == null || season.rankSeason == null) continue;
    const row = bySlot.get(season.draft) ?? { slot: season.draft, seasons: 0, titles: 0, topThree: 0 };
    row.seasons += 1;
    if (season.rankSeason === 1) row.titles += 1;
    if (season.rankSeason <= 3) row.topThree += 1;
    bySlot.set(season.draft, row);
  }
  const present = [...bySlot.values()].sort((a, b) => a.slot - b.slot);
  if (!present.length) return [];
  const slots: DraftSlot[] = [];
  for (let slot = present[0].slot; slot <= present[present.length - 1].slot; slot += 1) {
    slots.push(bySlot.get(slot) ?? { slot, seasons: 0, titles: 0, topThree: 0 });
  }
  return slots;
}

export function weekSlice(games: HistoryGame[], week: number) {
  return recordBook(games, game => game.type === 'Season' && game.week === week);
}

export function rate(count: number, total: number) {
  return total ? Math.round(count / total * 1000) / 10 : 0;
}
