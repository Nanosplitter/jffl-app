import { finishedGames, type LiveSeason, type LiveSeasonRow } from './liveSeason.ts';
import type { HistoryGame, HistorySeason } from './stats.ts';

export interface PlayedSource {
  games: HistoryGame[];
  seasons: HistorySeason[];
  live?: LiveSeason | null;
  /** Seasons already copied off the live snapshots, so they remain after that year ends. */
  saved?: LiveSeason[];
}

const LAST_WORKBOOK_SEASON = 2025;

function gameKey(game: Pick<HistoryGame, 'season' | 'league' | 'type' | 'week' | 'round' | 'teamA' | 'teamB'>) {
  return `${game.season}|${game.league}|${game.type}|${game.week ?? ''}|${game.round}|${[game.teamA, game.teamB].sort().join('|')}`;
}

function seasonKey(row: Pick<HistorySeason, 'season' | 'team'>) {
  return `${row.season}\0${row.team}`;
}

export function historySeason(row: LiveSeasonRow): HistorySeason {
  const { standing: _standing, jfflSeed: _jfflSeed, leagueCupSeed: _leagueCupSeed, club: _club, previousRank: _previousRank, week2Rank: _week2Rank, zone: _zone, snapshotPointsAgainst: _against, ...season } = row;
  return season;
}

/**
 * Workbook games, plus every finished game from a saved season and from the season in progress.
 * A live snapshot replaces the saved copy of the same game. Games still being played stay out.
 */
export function playedArchive(source: PlayedSource): { games: HistoryGame[]; seasons: HistorySeason[] } {
  const games = [...source.games];
  const gameAt = new Map(games.map((game, index) => [gameKey(game), index]));
  const addGame = (game: HistoryGame, replace: boolean) => {
    const key = gameKey(game);
    const index = gameAt.get(key);
    if (index === undefined) {
      gameAt.set(key, games.length);
      games.push(game);
    } else if (replace) games[index] = game;
  };
  for (const saved of source.saved ?? []) {
    if (saved.season <= LAST_WORKBOOK_SEASON) continue;
    for (const game of finishedGames(saved)) addGame(game, false);
  }
  for (const game of finishedGames(source.live)) addGame(game, true);

  const seasons = [...source.seasons];
  const seasonAt = new Map(seasons.map((row, index) => [seasonKey(row), index]));
  const addSeason = (row: HistorySeason, replace: boolean) => {
    if (row.season <= LAST_WORKBOOK_SEASON) return;
    const key = seasonKey(row);
    const index = seasonAt.get(key);
    if (index === undefined) {
      seasonAt.set(key, seasons.length);
      seasons.push(row);
    } else if (replace) seasons[index] = row;
  };
  for (const saved of source.saved ?? []) for (const row of saved.seasons) addSeason(historySeason(row), false);
  for (const row of source.live?.seasons ?? []) addSeason(historySeason(row), true);
  return { games, seasons };
}
