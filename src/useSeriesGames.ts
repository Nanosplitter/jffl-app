import { useSummaries } from './data';
import { finishedSeriesGames, summaryMap } from './finalsRematch';

/** Finished games from the season on screen, shared by every matchup line. */
export function useFinishedSeriesGames() {
  return finishedSeriesGames(summaryMap(useSummaries()));
}
