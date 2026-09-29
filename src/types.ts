export type LeagueSlug = 'premier' | 'championship' | 'league-one';
export const LEAGUES: { slug: LeagueSlug; name: string; tier: number; espnId: number }[] = [
  { slug: 'premier', name: 'Premier League', tier: 1, espnId: 831337 },
  { slug: 'championship', name: 'Championship', tier: 2, espnId: 50597 },
  { slug: 'league-one', name: 'League One', tier: 3, espnId: 2035286513 },
];
export interface Freshness {
  schemaVersion: 1; leagueId: string; slug: LeagueSlug; leagueName: string;
  season: number; week: number; updatedAt: string;
  lastAttemptAt: string; refreshStatus: 'ok' | 'error';
}
export interface Team {
  id: string; name: string; abbreviation: string; logoUrl?: string | null; rank: number | null;
  wins: number | null; losses: number | null; ties: number | null;
  pointsFor: number | null; pointsAgainst: number | null; rosterCount: number;
  previousRank?: number | null; draftRank?: number | null; finalStanding?: number | null;
  regularSeasonRank?: number | null;
}
export interface Matchup {
  id: string; homeTeamId: string | null; awayTeamId: string | null;
  homeScore: number | null; awayScore: number | null;
  homeProjected: number | null; awayProjected: number | null;
}
export interface LeagueSummary extends Freshness {
  teams: Team[]; matchups: Matchup[];
  completedWeeks?: number;
  weeklyMatchups?: (Matchup & { week: number; status: 'live' | 'final' | 'pending' })[];
  scoring: { name: string; points: number }[];
}
export interface RosteredPlayer {
  id: string; teamId: string; name: string; position: string; proTeam: string;
  slot: string; group: 'starter' | 'bench' | 'ir'; eligibleSlots: string[];
  injuryStatus: string | null; weekPoints: number | null;
  projectedPoints: number | null; seasonPoints: number | null; averagePoints: number | null;
  weekStats: Record<string, number>; seasonStats: Record<string, number>;
}
export interface WeekLineupPlayer {
  id: string; name: string; position: string; proTeam: string; slot: string; points: number | null;
}
export interface WeekLineup { week: number; teamId: string; players: WeekLineupPlayer[] }
export interface LeagueRosterSnapshot extends Freshness { players: RosteredPlayer[]; weeklyLineups?: WeekLineup[] }
