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
  kickoff?: string | null;
  weeklyStats?: { week: number; points?: number | null; stats: Record<string, number> }[];
}
export interface LineupLock { reason: 'out' | 'ir'; at: string }
export interface WeekLineupPlayer {
  id: string; name: string; position: string; proTeam: string; slot: string; points: number | null;
  /** Present only until kickoff. Distinguishes a pre-kickoff absence from an injury during the game. */
  kickoff?: string;
  preKickoff?: { status: string; at: string };
  /** Permanent once recorded. A later injury change does not remove it. */
  locked?: LineupLock;
}
export interface WeekLineup { week: number; teamId: string; players: WeekLineupPlayer[] }
export interface LeagueRosterSnapshot extends Freshness { players: RosteredPlayer[]; weeklyLineups?: WeekLineup[] }
export interface LiveGame {
  kickoff: string | null; state: 'pre' | 'in' | 'post'; detail: string; progress: number;
  opponent?: string | null; endedAt?: string;
}
export interface ScoreSeries { t: number[]; s: (number | null)[]; p: (number | null)[] }
export interface LeagueLiveSnapshot {
  schemaVersion: 1; slug: LeagueSlug; season: number; week: number; updatedAt: string;
  gamesUpdatedAt: string | null;
  games: Record<string, LiveGame>;
  series: Record<string, ScoreSeries>;
}
