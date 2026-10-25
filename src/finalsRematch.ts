import { buildLiveSeason, finishedGames } from './history/liveSeason.ts';
import type { HistoryGame } from './history/stats.ts';
import { MANAGERS } from './reference.ts';
import { rivalPath } from './sharePaths.ts';
import { LEAGUES, type LeagueSummary } from './types.ts';
import type { SummaryMap } from './competitions.ts';

const dash = '\u2013';

export interface FinalMeeting {
  season: number;
  label: string;
  winner: string;
  winnerScore: number;
  loserScore: number;
}

export interface PairSeries {
  a: string;
  b: string;
  winsA: number;
  winsB: number;
  ties: number;
  finals?: FinalMeeting[];
}

const managers = new Set(MANAGERS.map(item => item.manager));

/** All-competitions records. Finals are listed only when they have met in one. Rebuilt by tests/finalsRematch.test.ts. */
export const pairSeries: PairSeries[] = [
  { a: 'Al', b: 'Allison', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Al', b: 'Andrew', winsA: 5, winsB: 1, ties: 0 },
  { a: 'Al', b: 'Becky', winsA: 13, winsB: 9, ties: 1 },
  { a: 'Al', b: 'Brad', winsA: 5, winsB: 10, ties: 0 },
  { a: 'Al', b: 'Brandi', winsA: 1, winsB: 4, ties: 0 },
  { a: 'Al', b: 'Brendan', winsA: 6, winsB: 14, ties: 0 },
  { a: 'Al', b: 'Chris', winsA: 9, winsB: 13, ties: 0, finals: [
    { season: 2015, label: 'Championship Superbowl', winner: 'Chris', winnerScore: 95, loserScore: 43 },
  ] },
  { a: 'Al', b: 'Donna', winsA: 6, winsB: 10, ties: 0 },
  { a: 'Al', b: 'Gabriel', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Al', b: 'Gustavo', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Al', b: 'J-Seitz', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Al', b: 'Jasmin', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Al', b: 'Jason', winsA: 5, winsB: 13, ties: 0 },
  { a: 'Al', b: 'Jeff', winsA: 5, winsB: 11, ties: 0 },
  { a: 'Al', b: 'JimZ', winsA: 2, winsB: 5, ties: 0 },
  { a: 'Al', b: 'Joe', winsA: 7, winsB: 12, ties: 0 },
  { a: 'Al', b: 'John', winsA: 2, winsB: 3, ties: 0 },
  { a: 'Al', b: 'Jose', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Al', b: 'Josh', winsA: 4, winsB: 4, ties: 0 },
  { a: 'Al', b: 'JoshuaS', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Al', b: 'Kristin', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Al', b: 'MattZ', winsA: 1, winsB: 3, ties: 0 },
  { a: 'Al', b: 'Michael', winsA: 8, winsB: 19, ties: 0, finals: [
    { season: 2020, label: 'Premier Superbowl', winner: 'Michael', winnerScore: 90, loserScore: 85 },
  ] },
  { a: 'Al', b: 'Patrick', winsA: 0, winsB: 3, ties: 0 },
  { a: 'Al', b: 'Paula', winsA: 5, winsB: 10, ties: 0 },
  { a: 'Al', b: 'Randall', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Al', b: 'Reggie', winsA: 9, winsB: 14, ties: 0 },
  { a: 'Al', b: 'Richie', winsA: 2, winsB: 2, ties: 0 },
  { a: 'Al', b: 'Ryan', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Al', b: 'SeanH', winsA: 5, winsB: 10, ties: 0 },
  { a: 'Al', b: 'SeanT', winsA: 10, winsB: 9, ties: 0 },
  { a: 'Al', b: 'Sophia', winsA: 2, winsB: 2, ties: 1 },
  { a: 'Al', b: 'Tom', winsA: 4, winsB: 11, ties: 0 },
  { a: 'Al', b: 'Wayne', winsA: 11, winsB: 11, ties: 1 },
  { a: 'Al', b: 'Wolfe', winsA: 4, winsB: 7, ties: 0 },
  { a: 'Allison', b: 'Becky', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Allison', b: 'Brandi', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Allison', b: 'J-Seitz', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Allison', b: 'Jasmin', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Allison', b: 'Jeff', winsA: 2, winsB: 3, ties: 0 },
  { a: 'Allison', b: 'Joe', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Allison', b: 'JoshuaS', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Allison', b: 'Michael', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Allison', b: 'Reggie', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Allison', b: 'Richie', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Allison', b: 'Ryan', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Allison', b: 'SeanT', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Allison', b: 'Sophia', winsA: 4, winsB: 1, ties: 0, finals: [
    { season: 2024, label: 'League One Superbowl', winner: 'Allison', winnerScore: 97, loserScore: 78 },
  ] },
  { a: 'Allison', b: 'Wolfe', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Andrew', b: 'Becky', winsA: 11, winsB: 5, ties: 0 },
  { a: 'Andrew', b: 'Brad', winsA: 7, winsB: 6, ties: 0 },
  { a: 'Andrew', b: 'Brandi', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Andrew', b: 'Brendan', winsA: 2, winsB: 2, ties: 0 },
  { a: 'Andrew', b: 'Chris', winsA: 5, winsB: 3, ties: 0 },
  { a: 'Andrew', b: 'Donna', winsA: 1, winsB: 6, ties: 0 },
  { a: 'Andrew', b: 'Gabriel', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Andrew', b: 'Gustavo', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Andrew', b: 'Holly', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Andrew', b: 'J-Seitz', winsA: 2, winsB: 2, ties: 0 },
  { a: 'Andrew', b: 'Jason', winsA: 2, winsB: 2, ties: 0 },
  { a: 'Andrew', b: 'Jeff', winsA: 1, winsB: 9, ties: 0 },
  { a: 'Andrew', b: 'JimZ', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Andrew', b: 'Joe', winsA: 5, winsB: 6, ties: 0, finals: [
    { season: 2022, label: 'League One Superbowl', winner: 'Andrew', winnerScore: 113, loserScore: 92 },
  ] },
  { a: 'Andrew', b: 'John', winsA: 0, winsB: 5, ties: 0 },
  { a: 'Andrew', b: 'Jose', winsA: 1, winsB: 3, ties: 0 },
  { a: 'Andrew', b: 'Josh', winsA: 1, winsB: 8, ties: 0 },
  { a: 'Andrew', b: 'Michael', winsA: 2, winsB: 6, ties: 0 },
  { a: 'Andrew', b: 'Michelle', winsA: 2, winsB: 3, ties: 0 },
  { a: 'Andrew', b: 'Paula', winsA: 7, winsB: 6, ties: 0 },
  { a: 'Andrew', b: 'Randall', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Andrew', b: 'Reggie', winsA: 4, winsB: 1, ties: 0 },
  { a: 'Andrew', b: 'Ryan', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Andrew', b: 'SeanH', winsA: 1, winsB: 8, ties: 0 },
  { a: 'Andrew', b: 'SeanT', winsA: 3, winsB: 5, ties: 0 },
  { a: 'Andrew', b: 'Tom', winsA: 4, winsB: 5, ties: 0 },
  { a: 'Andrew', b: 'Wayne', winsA: 7, winsB: 6, ties: 0, finals: [
    { season: 2017, label: 'Championship Superbowl', winner: 'Andrew', winnerScore: 92, loserScore: 87 },
  ] },
  { a: 'Andrew', b: 'Wolfe', winsA: 5, winsB: 6, ties: 1 },
  { a: 'Arnol', b: 'Brandi', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Arnol', b: 'Gabriel', winsA: 1, winsB: 0, ties: 1 },
  { a: 'Arnol', b: 'Holly', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Arnol', b: 'J-Seitz', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Arnol', b: 'Patrick', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Arnol', b: 'Paula', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Arnol', b: 'Randall', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Arnol', b: 'Richie', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Arnol', b: 'Ryan', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Arnol', b: 'SeanH', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Becky', b: 'Brad', winsA: 11, winsB: 8, ties: 0, finals: [
    { season: 2025, label: 'League One cup final', winner: 'Becky', winnerScore: 85, loserScore: 71 },
  ] },
  { a: 'Becky', b: 'Brandi', winsA: 2, winsB: 2, ties: 0, finals: [
    { season: 2023, label: 'Championship Superbowl', winner: 'Brandi', winnerScore: 80, loserScore: 71 },
  ] },
  { a: 'Becky', b: 'Brendan', winsA: 6, winsB: 15, ties: 0, finals: [
    { season: 2022, label: 'Premier cup final', winner: 'Brendan', winnerScore: 91, loserScore: 74 },
  ] },
  { a: 'Becky', b: 'Chris', winsA: 8, winsB: 8, ties: 0 },
  { a: 'Becky', b: 'Donna', winsA: 12, winsB: 15, ties: 0, finals: [
    { season: 2014, label: 'Premier cup final', winner: 'Donna', winnerScore: 116, loserScore: 94 },
  ] },
  { a: 'Becky', b: 'Gabriel', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Becky', b: 'J-Seitz', winsA: 5, winsB: 1, ties: 0, finals: [
    { season: 2025, label: 'League One Superbowl', winner: 'Becky', winnerScore: 110, loserScore: 90 },
  ] },
  { a: 'Becky', b: 'Jasmin', winsA: 2, winsB: 3, ties: 0 },
  { a: 'Becky', b: 'Jason', winsA: 7, winsB: 9, ties: 0, finals: [
    { season: 2024, label: 'JFFL Cup final', winner: 'Jason', winnerScore: 197, loserScore: 176 },
  ] },
  { a: 'Becky', b: 'Jeff', winsA: 2, winsB: 16, ties: 0 },
  { a: 'Becky', b: 'JimZ', winsA: 2, winsB: 3, ties: 0 },
  { a: 'Becky', b: 'Joe', winsA: 9, winsB: 15, ties: 0, finals: [
    { season: 2016, label: 'Championship cup final', winner: 'Becky', winnerScore: 86, loserScore: 41 },
    { season: 2016, label: 'Championship Superbowl', winner: 'Joe', winnerScore: 115, loserScore: 94 },
  ] },
  { a: 'Becky', b: 'John', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Becky', b: 'Jose', winsA: 1, winsB: 5, ties: 0, finals: [
    { season: 2020, label: 'Championship Superbowl', winner: 'Becky', winnerScore: 100, loserScore: 68 },
  ] },
  { a: 'Becky', b: 'Josh', winsA: 7, winsB: 10, ties: 0 },
  { a: 'Becky', b: 'JoshuaS', winsA: 3, winsB: 0, ties: 0 },
  { a: 'Becky', b: 'Kristin', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Becky', b: 'MattZ', winsA: 4, winsB: 6, ties: 0 },
  { a: 'Becky', b: 'Michael', winsA: 7, winsB: 6, ties: 0 },
  { a: 'Becky', b: 'Michelle', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Becky', b: 'Paula', winsA: 12, winsB: 10, ties: 1, finals: [
    { season: 2013, label: 'Championship Superbowl', winner: 'Paula', winnerScore: 94, loserScore: 77 },
  ] },
  { a: 'Becky', b: 'Randall', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Becky', b: 'Reggie', winsA: 5, winsB: 6, ties: 1 },
  { a: 'Becky', b: 'Richie', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Becky', b: 'SeanH', winsA: 9, winsB: 14, ties: 0, finals: [
    { season: 2015, label: 'Premier cup final', winner: 'Becky', winnerScore: 59, loserScore: 55 },
  ] },
  { a: 'Becky', b: 'SeanT', winsA: 8, winsB: 4, ties: 0 },
  { a: 'Becky', b: 'Sophia', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Becky', b: 'Tom', winsA: 10, winsB: 14, ties: 1 },
  { a: 'Becky', b: 'Wayne', winsA: 8, winsB: 8, ties: 0 },
  { a: 'Becky', b: 'Wolfe', winsA: 12, winsB: 3, ties: 0 },
  { a: 'Brad', b: 'Brandi', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Brad', b: 'Brendan', winsA: 8, winsB: 9, ties: 0 },
  { a: 'Brad', b: 'Chris', winsA: 15, winsB: 15, ties: 2, finals: [
    { season: 2015, label: 'Championship cup final', winner: 'Brad', winnerScore: 80, loserScore: 42 },
  ] },
  { a: 'Brad', b: 'Donna', winsA: 4, winsB: 8, ties: 0 },
  { a: 'Brad', b: 'Gabriel', winsA: 4, winsB: 3, ties: 0 },
  { a: 'Brad', b: 'Gustavo', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Brad', b: 'Holly', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Brad', b: 'J-Seitz', winsA: 1, winsB: 3, ties: 0 },
  { a: 'Brad', b: 'Jasmin', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Brad', b: 'Jason', winsA: 6, winsB: 13, ties: 1 },
  { a: 'Brad', b: 'Jeff', winsA: 6, winsB: 13, ties: 0, finals: [
    { season: 2017, label: 'Premier cup final', winner: 'Jeff', winnerScore: 95, loserScore: 87 },
  ] },
  { a: 'Brad', b: 'JimZ', winsA: 3, winsB: 7, ties: 0 },
  { a: 'Brad', b: 'Joe', winsA: 9, winsB: 14, ties: 1 },
  { a: 'Brad', b: 'John', winsA: 2, winsB: 4, ties: 1, finals: [
    { season: 2023, label: 'League One Superbowl', winner: 'Brad', winnerScore: 92, loserScore: 81 },
  ] },
  { a: 'Brad', b: 'Jose', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Brad', b: 'Josh', winsA: 7, winsB: 13, ties: 1 },
  { a: 'Brad', b: 'JoshuaS', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Brad', b: 'Kristin', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Brad', b: 'MattZ', winsA: 5, winsB: 3, ties: 0 },
  { a: 'Brad', b: 'Michael', winsA: 11, winsB: 11, ties: 1, finals: [
    { season: 2003, label: 'Combined Superbowl', winner: '', winnerScore: 65, loserScore: 65 },
  ] },
  { a: 'Brad', b: 'Michelle', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Brad', b: 'Patrick', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Brad', b: 'Paula', winsA: 5, winsB: 6, ties: 0 },
  { a: 'Brad', b: 'Randall', winsA: 4, winsB: 4, ties: 0 },
  { a: 'Brad', b: 'Reggie', winsA: 2, winsB: 3, ties: 0 },
  { a: 'Brad', b: 'Richie', winsA: 4, winsB: 1, ties: 0 },
  { a: 'Brad', b: 'Ryan', winsA: 1, winsB: 3, ties: 0 },
  { a: 'Brad', b: 'SeanH', winsA: 4, winsB: 11, ties: 0 },
  { a: 'Brad', b: 'SeanT', winsA: 3, winsB: 7, ties: 0 },
  { a: 'Brad', b: 'Sophia', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Brad', b: 'Tom', winsA: 7, winsB: 8, ties: 0 },
  { a: 'Brad', b: 'Wayne', winsA: 7, winsB: 4, ties: 1 },
  { a: 'Brad', b: 'Wolfe', winsA: 15, winsB: 4, ties: 0 },
  { a: 'Brandi', b: 'Brendan', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Brandi', b: 'Chris', winsA: 2, winsB: 1, ties: 0, finals: [
    { season: 2022, label: 'Championship Superbowl', winner: 'Chris', winnerScore: 68, loserScore: 54 },
  ] },
  { a: 'Brandi', b: 'Donna', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Brandi', b: 'Gabriel', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Brandi', b: 'Holly', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Brandi', b: 'J-Seitz', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Brandi', b: 'Jason', winsA: 0, winsB: 3, ties: 0, finals: [
    { season: 2023, label: 'JFFL Cup final', winner: 'Jason', winnerScore: 227, loserScore: 160 },
  ] },
  { a: 'Brandi', b: 'Jeff', winsA: 2, winsB: 3, ties: 0, finals: [
    { season: 2025, label: 'Championship cup final', winner: 'Jeff', winnerScore: 94, loserScore: 92 },
  ] },
  { a: 'Brandi', b: 'John', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Brandi', b: 'Josh', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Brandi', b: 'Michael', winsA: 4, winsB: 2, ties: 0 },
  { a: 'Brandi', b: 'Michelle', winsA: 0, winsB: 4, ties: 0 },
  { a: 'Brandi', b: 'Patrick', winsA: 4, winsB: 1, ties: 0, finals: [
    { season: 2021, label: 'League One Superbowl', winner: 'Brandi', winnerScore: 104, loserScore: 74 },
  ] },
  { a: 'Brandi', b: 'Paula', winsA: 6, winsB: 1, ties: 0 },
  { a: 'Brandi', b: 'Randall', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Brandi', b: 'Reggie', winsA: 5, winsB: 6, ties: 0 },
  { a: 'Brandi', b: 'Richie', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Brandi', b: 'Ryan', winsA: 3, winsB: 1, ties: 0 },
  { a: 'Brandi', b: 'SeanH', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Brandi', b: 'SeanT', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Brandi', b: 'Sophia', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Brandi', b: 'Wayne', winsA: 0, winsB: 4, ties: 0 },
  { a: 'Brandi', b: 'Wolfe', winsA: 5, winsB: 1, ties: 0 },
  { a: 'Brendan', b: 'Chris', winsA: 10, winsB: 10, ties: 0, finals: [
    { season: 2019, label: 'Championship cup final', winner: 'Chris', winnerScore: 104, loserScore: 64 },
  ] },
  { a: 'Brendan', b: 'Donna', winsA: 17, winsB: 10, ties: 0, finals: [
    { season: 2014, label: 'JFFL Cup final', winner: 'Donna', winnerScore: 208, loserScore: 178 },
  ] },
  { a: 'Brendan', b: 'Holly', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Brendan', b: 'Jason', winsA: 12, winsB: 14, ties: 1, finals: [
    { season: 2012, label: 'Combined Superbowl', winner: 'Jason', winnerScore: 85, loserScore: 80 },
    { season: 2025, label: 'Premier cup final', winner: 'Jason', winnerScore: 90, loserScore: 75 },
  ] },
  { a: 'Brendan', b: 'Jeff', winsA: 16, winsB: 8, ties: 0, finals: [
    { season: 2015, label: 'Premier Superbowl', winner: 'Jeff', winnerScore: 135, loserScore: 72 },
  ] },
  { a: 'Brendan', b: 'JimZ', winsA: 13, winsB: 2, ties: 0 },
  { a: 'Brendan', b: 'Joe', winsA: 9, winsB: 8, ties: 1, finals: [
    { season: 2018, label: 'Championship cup final', winner: 'Brendan', winnerScore: 109, loserScore: 101 },
  ] },
  { a: 'Brendan', b: 'John', winsA: 4, winsB: 0, ties: 0 },
  { a: 'Brendan', b: 'Jose', winsA: 1, winsB: 3, ties: 0, finals: [
    { season: 2018, label: 'Championship Superbowl', winner: 'Jose', winnerScore: 130, loserScore: 93 },
  ] },
  { a: 'Brendan', b: 'Josh', winsA: 7, winsB: 19, ties: 0, finals: [
    { season: 2014, label: 'Premier Superbowl', winner: 'Josh', winnerScore: 116, loserScore: 73 },
  ] },
  { a: 'Brendan', b: 'JoshuaS', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Brendan', b: 'Kristin', winsA: 0, winsB: 0, ties: 1 },
  { a: 'Brendan', b: 'MattZ', winsA: 8, winsB: 2, ties: 0 },
  { a: 'Brendan', b: 'Michael', winsA: 11, winsB: 9, ties: 2, finals: [
    { season: 2019, label: 'Championship Superbowl', winner: 'Brendan', winnerScore: 114, loserScore: 73 },
    { season: 2020, label: 'Premier cup final', winner: 'Michael', winnerScore: 117, loserScore: 105 },
  ] },
  { a: 'Brendan', b: 'Michelle', winsA: 7, winsB: 1, ties: 0 },
  { a: 'Brendan', b: 'Patrick', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Brendan', b: 'Paula', winsA: 6, winsB: 4, ties: 0, finals: [
    { season: 2025, label: 'Premier Superbowl', winner: 'Paula', winnerScore: 130, loserScore: 95 },
  ] },
  { a: 'Brendan', b: 'Randall', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Brendan', b: 'Reggie', winsA: 8, winsB: 10, ties: 1 },
  { a: 'Brendan', b: 'Richie', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Brendan', b: 'Ryan', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Brendan', b: 'SeanH', winsA: 10, winsB: 10, ties: 1, finals: [
    { season: 2015, label: 'JFFL Cup final', winner: 'SeanH', winnerScore: 225, loserScore: 180 },
  ] },
  { a: 'Brendan', b: 'SeanT', winsA: 11, winsB: 8, ties: 1, finals: [
    { season: 2013, label: 'Premier cup final', winner: 'Brendan', winnerScore: 95, loserScore: 72 },
  ] },
  { a: 'Brendan', b: 'Tom', winsA: 16, winsB: 12, ties: 0, finals: [
    { season: 2007, label: 'Combined Superbowl', winner: 'Tom', winnerScore: 79, loserScore: 43 },
  ] },
  { a: 'Brendan', b: 'Wayne', winsA: 13, winsB: 4, ties: 0, finals: [
    { season: 2008, label: 'Combined Superbowl', winner: 'Wayne', winnerScore: 83, loserScore: 67 },
  ] },
  { a: 'Brendan', b: 'Wolfe', winsA: 5, winsB: 9, ties: 0 },
  { a: 'Chris', b: 'Donna', winsA: 8, winsB: 6, ties: 0 },
  { a: 'Chris', b: 'Gabriel', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Chris', b: 'Jason', winsA: 11, winsB: 13, ties: 0, finals: [
    { season: 2016, label: 'Premier Superbowl', winner: 'Chris', winnerScore: 128, loserScore: 104 },
  ] },
  { a: 'Chris', b: 'Jeff', winsA: 9, winsB: 9, ties: 0, finals: [
    { season: 2017, label: 'Premier Superbowl', winner: 'Chris', winnerScore: 106, loserScore: 94 },
  ] },
  { a: 'Chris', b: 'JimZ', winsA: 1, winsB: 4, ties: 0 },
  { a: 'Chris', b: 'Joe', winsA: 11, winsB: 7, ties: 1 },
  { a: 'Chris', b: 'John', winsA: 3, winsB: 3, ties: 0 },
  { a: 'Chris', b: 'Josh', winsA: 6, winsB: 12, ties: 0, finals: [
    { season: 2017, label: 'JFFL Cup final', winner: 'Chris', winnerScore: 240, loserScore: 152 },
  ] },
  { a: 'Chris', b: 'Kristin', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Chris', b: 'MattZ', winsA: 5, winsB: 4, ties: 0 },
  { a: 'Chris', b: 'Michael', winsA: 10, winsB: 16, ties: 0 },
  { a: 'Chris', b: 'Michelle', winsA: 3, winsB: 1, ties: 0 },
  { a: 'Chris', b: 'Patrick', winsA: 5, winsB: 4, ties: 0, finals: [
    { season: 2024, label: 'Championship Superbowl', winner: 'Patrick', winnerScore: 137, loserScore: 62 },
  ] },
  { a: 'Chris', b: 'Paula', winsA: 8, winsB: 8, ties: 1 },
  { a: 'Chris', b: 'Randall', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Chris', b: 'Reggie', winsA: 7, winsB: 5, ties: 0 },
  { a: 'Chris', b: 'Richie', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Chris', b: 'Ryan', winsA: 3, winsB: 1, ties: 0 },
  { a: 'Chris', b: 'SeanH', winsA: 8, winsB: 12, ties: 2, finals: [
    { season: 2018, label: 'Premier Superbowl', winner: 'SeanH', winnerScore: 92, loserScore: 73 },
  ] },
  { a: 'Chris', b: 'SeanT', winsA: 6, winsB: 8, ties: 0 },
  { a: 'Chris', b: 'Tom', winsA: 7, winsB: 4, ties: 0 },
  { a: 'Chris', b: 'Wayne', winsA: 9, winsB: 17, ties: 2, finals: [
    { season: 2022, label: 'Championship cup final', winner: 'Chris', winnerScore: 102, loserScore: 84 },
  ] },
  { a: 'Chris', b: 'Wolfe', winsA: 10, winsB: 9, ties: 0 },
  { a: 'Donna', b: 'Jason', winsA: 15, winsB: 8, ties: 0, finals: [
    { season: 2010, label: 'Combined Superbowl', winner: 'Jason', winnerScore: 96, loserScore: 33 },
  ] },
  { a: 'Donna', b: 'Jeff', winsA: 9, winsB: 11, ties: 1, finals: [
    { season: 2013, label: 'JFFL Cup final', winner: 'Jeff', winnerScore: 189, loserScore: 176 },
  ] },
  { a: 'Donna', b: 'JimZ', winsA: 6, winsB: 3, ties: 0 },
  { a: 'Donna', b: 'Joe', winsA: 9, winsB: 9, ties: 1 },
  { a: 'Donna', b: 'John', winsA: 4, winsB: 3, ties: 1 },
  { a: 'Donna', b: 'Jose', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Donna', b: 'Josh', winsA: 15, winsB: 13, ties: 0, finals: [
    { season: 2011, label: 'Combined Superbowl', winner: 'Donna', winnerScore: 84, loserScore: 72 },
  ] },
  { a: 'Donna', b: 'Kristin', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Donna', b: 'MattZ', winsA: 5, winsB: 5, ties: 0 },
  { a: 'Donna', b: 'Michael', winsA: 6, winsB: 9, ties: 0 },
  { a: 'Donna', b: 'Michelle', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Donna', b: 'Patrick', winsA: 0, winsB: 3, ties: 0 },
  { a: 'Donna', b: 'Paula', winsA: 14, winsB: 7, ties: 0 },
  { a: 'Donna', b: 'Randall', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Donna', b: 'Reggie', winsA: 6, winsB: 8, ties: 0 },
  { a: 'Donna', b: 'Ryan', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Donna', b: 'SeanH', winsA: 15, winsB: 7, ties: 0, finals: [
    { season: 2020, label: 'JFFL Cup final', winner: 'Donna', winnerScore: 204, loserScore: 176 },
    { season: 2021, label: 'Premier Superbowl', winner: 'SeanH', winnerScore: 82, loserScore: 69 },
  ] },
  { a: 'Donna', b: 'SeanT', winsA: 12, winsB: 8, ties: 1 },
  { a: 'Donna', b: 'Tom', winsA: 16, winsB: 15, ties: 0, finals: [
    { season: 2023, label: 'Premier cup final', winner: 'Donna', winnerScore: 109, loserScore: 61 },
  ] },
  { a: 'Donna', b: 'Wayne', winsA: 4, winsB: 8, ties: 0, finals: [
    { season: 2017, label: 'Championship cup final', winner: 'Wayne', winnerScore: 104, loserScore: 100 },
  ] },
  { a: 'Donna', b: 'Wolfe', winsA: 16, winsB: 7, ties: 0, finals: [
    { season: 2021, label: 'JFFL Cup final', winner: 'Donna', winnerScore: 211, loserScore: 180 },
  ] },
  { a: 'Gabriel', b: 'Gustavo', winsA: 5, winsB: 1, ties: 0 },
  { a: 'Gabriel', b: 'Holly', winsA: 2, winsB: 3, ties: 0 },
  { a: 'Gabriel', b: 'J-Seitz', winsA: 0, winsB: 3, ties: 1 },
  { a: 'Gabriel', b: 'Jasmin', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Gabriel', b: 'Jason', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Gabriel', b: 'Joe', winsA: 2, winsB: 3, ties: 0 },
  { a: 'Gabriel', b: 'John', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Gabriel', b: 'JoshuaS', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Gabriel', b: 'Michael', winsA: 1, winsB: 4, ties: 0 },
  { a: 'Gabriel', b: 'Michelle', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Gabriel', b: 'Patrick', winsA: 2, winsB: 2, ties: 0 },
  { a: 'Gabriel', b: 'Paula', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Gabriel', b: 'Randall', winsA: 2, winsB: 5, ties: 0 },
  { a: 'Gabriel', b: 'Richie', winsA: 1, winsB: 6, ties: 0, finals: [
    { season: 2021, label: 'League One cup final', winner: 'Richie', winnerScore: 127, loserScore: 24 },
  ] },
  { a: 'Gabriel', b: 'Ryan', winsA: 0, winsB: 5, ties: 0 },
  { a: 'Gabriel', b: 'SeanH', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Gabriel', b: 'Sophia', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Gabriel', b: 'SophiaSophia', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Gabriel', b: 'Tom', winsA: 2, winsB: 2, ties: 0 },
  { a: 'Gabriel', b: 'Wolfe', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Gustavo', b: 'Holly', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Gustavo', b: 'J-Seitz', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Gustavo', b: 'Joe', winsA: 0, winsB: 4, ties: 0 },
  { a: 'Gustavo', b: 'John', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Gustavo', b: 'Michael', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Gustavo', b: 'Michelle', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Gustavo', b: 'Randall', winsA: 1, winsB: 3, ties: 0 },
  { a: 'Gustavo', b: 'Richie', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Gustavo', b: 'Ryan', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Gustavo', b: 'SeanT', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Gustavo', b: 'Sophia', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Holly', b: 'J-Seitz', winsA: 2, winsB: 3, ties: 0 },
  { a: 'Holly', b: 'Joe', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Holly', b: 'Michelle', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Holly', b: 'Patrick', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Holly', b: 'Paula', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Holly', b: 'Randall', winsA: 2, winsB: 2, ties: 0 },
  { a: 'Holly', b: 'Richie', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Holly', b: 'Ryan', winsA: 0, winsB: 4, ties: 0 },
  { a: 'Holly', b: 'Wolfe', winsA: 0, winsB: 1, ties: 0 },
  { a: 'J-Seitz', b: 'Jasmin', winsA: 1, winsB: 2, ties: 0 },
  { a: 'J-Seitz', b: 'Jason', winsA: 1, winsB: 1, ties: 0 },
  { a: 'J-Seitz', b: 'Jeff', winsA: 5, winsB: 2, ties: 0 },
  { a: 'J-Seitz', b: 'Joe', winsA: 3, winsB: 1, ties: 0 },
  { a: 'J-Seitz', b: 'JoshuaS', winsA: 2, winsB: 3, ties: 0 },
  { a: 'J-Seitz', b: 'Michael', winsA: 1, winsB: 0, ties: 0 },
  { a: 'J-Seitz', b: 'Michelle', winsA: 0, winsB: 3, ties: 0 },
  { a: 'J-Seitz', b: 'Patrick', winsA: 0, winsB: 3, ties: 0 },
  { a: 'J-Seitz', b: 'Paula', winsA: 1, winsB: 4, ties: 0 },
  { a: 'J-Seitz', b: 'Randall', winsA: 7, winsB: 0, ties: 0 },
  { a: 'J-Seitz', b: 'Reggie', winsA: 0, winsB: 0, ties: 1 },
  { a: 'J-Seitz', b: 'Richie', winsA: 2, winsB: 3, ties: 0 },
  { a: 'J-Seitz', b: 'Ryan', winsA: 2, winsB: 4, ties: 0, finals: [
    { season: 2022, label: 'League One cup final', winner: 'Ryan', winnerScore: 118, loserScore: 88 },
  ] },
  { a: 'J-Seitz', b: 'SeanH', winsA: 0, winsB: 2, ties: 0 },
  { a: 'J-Seitz', b: 'Sophia', winsA: 0, winsB: 3, ties: 0 },
  { a: 'J-Seitz', b: 'Tom', winsA: 1, winsB: 1, ties: 0 },
  { a: 'J-Seitz', b: 'Wolfe', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Jasmin', b: 'Jeff', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Jasmin', b: 'Joe', winsA: 1, winsB: 3, ties: 0 },
  { a: 'Jasmin', b: 'JoshuaS', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Jasmin', b: 'Randall', winsA: 0, winsB: 3, ties: 0 },
  { a: 'Jasmin', b: 'Richie', winsA: 4, winsB: 1, ties: 0 },
  { a: 'Jasmin', b: 'SeanH', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Jasmin', b: 'Sophia', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Jasmin', b: 'Tom', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Jasmin', b: 'Wayne', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Jason', b: 'Jeff', winsA: 13, winsB: 12, ties: 0, finals: [
    { season: 2016, label: 'Premier cup final', winner: 'Jeff', winnerScore: 79, loserScore: 76 },
  ] },
  { a: 'Jason', b: 'JimZ', winsA: 3, winsB: 7, ties: 1 },
  { a: 'Jason', b: 'Joe', winsA: 7, winsB: 9, ties: 0 },
  { a: 'Jason', b: 'Jose', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Jason', b: 'Josh', winsA: 14, winsB: 13, ties: 0, finals: [
    { season: 2018, label: 'Premier cup final', winner: 'Jason', winnerScore: 87, loserScore: 86 },
    { season: 2022, label: 'Premier Superbowl', winner: 'Josh', winnerScore: 88, loserScore: 87 },
  ] },
  { a: 'Jason', b: 'Kristin', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Jason', b: 'MattZ', winsA: 3, winsB: 3, ties: 0 },
  { a: 'Jason', b: 'Michael', winsA: 16, winsB: 7, ties: 0 },
  { a: 'Jason', b: 'Michelle', winsA: 1, winsB: 3, ties: 0 },
  { a: 'Jason', b: 'Patrick', winsA: 3, winsB: 1, ties: 0 },
  { a: 'Jason', b: 'Paula', winsA: 10, winsB: 5, ties: 0 },
  { a: 'Jason', b: 'Reggie', winsA: 9, winsB: 8, ties: 1, finals: [
    { season: 2019, label: 'Premier Superbowl', winner: 'Reggie', winnerScore: 135, loserScore: 96 },
  ] },
  { a: 'Jason', b: 'Richie', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Jason', b: 'Ryan', winsA: 3, winsB: 0, ties: 0 },
  { a: 'Jason', b: 'SeanH', winsA: 12, winsB: 10, ties: 0 },
  { a: 'Jason', b: 'SeanT', winsA: 15, winsB: 12, ties: 1, finals: [
    { season: 2005, label: 'Combined Superbowl', winner: 'SeanT', winnerScore: 88, loserScore: 67 },
    { season: 2021, label: 'Premier cup final', winner: 'SeanT', winnerScore: 135, loserScore: 83 },
  ] },
  { a: 'Jason', b: 'Tom', winsA: 7, winsB: 6, ties: 0 },
  { a: 'Jason', b: 'Wayne', winsA: 13, winsB: 8, ties: 1, finals: [
    { season: 2013, label: 'Championship cup final', winner: 'Jason', winnerScore: 111, loserScore: 88 },
  ] },
  { a: 'Jason', b: 'Wolfe', winsA: 14, winsB: 5, ties: 1 },
  { a: 'Jeff', b: 'JimZ', winsA: 8, winsB: 4, ties: 0, finals: [
    { season: 2013, label: 'Premier Superbowl', winner: 'Jeff', winnerScore: 86, loserScore: 85 },
  ] },
  { a: 'Jeff', b: 'Joe', winsA: 14, winsB: 3, ties: 1 },
  { a: 'Jeff', b: 'John', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Jeff', b: 'Jose', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Jeff', b: 'Josh', winsA: 16, winsB: 8, ties: 1, finals: [
    { season: 2016, label: 'JFFL Cup final', winner: 'Josh', winnerScore: 204, loserScore: 151 },
  ] },
  { a: 'Jeff', b: 'JoshuaS', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Jeff', b: 'MattZ', winsA: 6, winsB: 3, ties: 0 },
  { a: 'Jeff', b: 'Michael', winsA: 9, winsB: 5, ties: 0 },
  { a: 'Jeff', b: 'Michelle', winsA: 3, winsB: 2, ties: 0 },
  { a: 'Jeff', b: 'Paula', winsA: 6, winsB: 6, ties: 0 },
  { a: 'Jeff', b: 'Reggie', winsA: 12, winsB: 8, ties: 0 },
  { a: 'Jeff', b: 'Richie', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Jeff', b: 'Ryan', winsA: 4, winsB: 0, ties: 0, finals: [
    { season: 2025, label: 'Championship Superbowl', winner: 'Jeff', winnerScore: 112, loserScore: 78 },
  ] },
  { a: 'Jeff', b: 'SeanH', winsA: 13, winsB: 9, ties: 0 },
  { a: 'Jeff', b: 'SeanT', winsA: 13, winsB: 10, ties: 0, finals: [
    { season: 2004, label: 'Combined Superbowl', winner: 'Jeff', winnerScore: 79, loserScore: 62 },
  ] },
  { a: 'Jeff', b: 'Sophia', winsA: 0, winsB: 3, ties: 0, finals: [
    { season: 2024, label: 'League One cup final', winner: 'Sophia', winnerScore: 108, loserScore: 83 },
  ] },
  { a: 'Jeff', b: 'Tom', winsA: 9, winsB: 5, ties: 0 },
  { a: 'Jeff', b: 'Wayne', winsA: 10, winsB: 10, ties: 0, finals: [
    { season: 2021, label: 'Championship cup final', winner: 'Jeff', winnerScore: 72, loserScore: 53 },
    { season: 2021, label: 'Championship Superbowl', winner: 'Jeff', winnerScore: 90, loserScore: 83 },
  ] },
  { a: 'Jeff', b: 'Wolfe', winsA: 10, winsB: 7, ties: 1, finals: [
    { season: 2019, label: 'Premier cup final', winner: 'Wolfe', winnerScore: 112, loserScore: 70 },
  ] },
  { a: 'JimZ', b: 'Joe', winsA: 3, winsB: 5, ties: 0 },
  { a: 'JimZ', b: 'Josh', winsA: 6, winsB: 5, ties: 0 },
  { a: 'JimZ', b: 'MattZ', winsA: 3, winsB: 3, ties: 0 },
  { a: 'JimZ', b: 'Michael', winsA: 5, winsB: 4, ties: 0 },
  { a: 'JimZ', b: 'Paula', winsA: 3, winsB: 5, ties: 0 },
  { a: 'JimZ', b: 'Reggie', winsA: 7, winsB: 3, ties: 0 },
  { a: 'JimZ', b: 'SeanH', winsA: 7, winsB: 7, ties: 0, finals: [
    { season: 2014, label: 'Championship cup final', winner: 'JimZ', winnerScore: 107, loserScore: 94 },
    { season: 2014, label: 'Championship Superbowl', winner: 'SeanH', winnerScore: 100, loserScore: 88 },
  ] },
  { a: 'JimZ', b: 'SeanT', winsA: 6, winsB: 5, ties: 0 },
  { a: 'JimZ', b: 'Tom', winsA: 5, winsB: 7, ties: 1 },
  { a: 'JimZ', b: 'Wayne', winsA: 6, winsB: 3, ties: 1 },
  { a: 'JimZ', b: 'Wolfe', winsA: 3, winsB: 1, ties: 0 },
  { a: 'Joe', b: 'John', winsA: 7, winsB: 3, ties: 0 },
  { a: 'Joe', b: 'Jose', winsA: 3, winsB: 0, ties: 0 },
  { a: 'Joe', b: 'Josh', winsA: 6, winsB: 14, ties: 0 },
  { a: 'Joe', b: 'JoshuaS', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Joe', b: 'Kristin', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Joe', b: 'MattZ', winsA: 6, winsB: 5, ties: 0 },
  { a: 'Joe', b: 'Michael', winsA: 3, winsB: 14, ties: 1 },
  { a: 'Joe', b: 'Michelle', winsA: 4, winsB: 1, ties: 0 },
  { a: 'Joe', b: 'Paula', winsA: 12, winsB: 4, ties: 0 },
  { a: 'Joe', b: 'Randall', winsA: 1, winsB: 4, ties: 0 },
  { a: 'Joe', b: 'Reggie', winsA: 8, winsB: 7, ties: 0 },
  { a: 'Joe', b: 'Richie', winsA: 3, winsB: 2, ties: 0 },
  { a: 'Joe', b: 'Ryan', winsA: 2, winsB: 2, ties: 0 },
  { a: 'Joe', b: 'SeanH', winsA: 9, winsB: 4, ties: 0, finals: [
    { season: 2002, label: 'Combined Superbowl', winner: 'Joe', winnerScore: 83, loserScore: 67 },
  ] },
  { a: 'Joe', b: 'SeanT', winsA: 11, winsB: 9, ties: 0, finals: [
    { season: 2018, label: 'JFFL Cup final', winner: 'SeanT', winnerScore: 152, loserScore: 148 },
  ] },
  { a: 'Joe', b: 'Sophia', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Joe', b: 'Tom', winsA: 5, winsB: 5, ties: 0 },
  { a: 'Joe', b: 'Wayne', winsA: 9, winsB: 7, ties: 0 },
  { a: 'Joe', b: 'Wolfe', winsA: 6, winsB: 11, ties: 0 },
  { a: 'John', b: 'Jose', winsA: 0, winsB: 4, ties: 0 },
  { a: 'John', b: 'Josh', winsA: 2, winsB: 2, ties: 0 },
  { a: 'John', b: 'Michael', winsA: 2, winsB: 4, ties: 0 },
  { a: 'John', b: 'Michelle', winsA: 2, winsB: 0, ties: 0 },
  { a: 'John', b: 'Patrick', winsA: 0, winsB: 2, ties: 0 },
  { a: 'John', b: 'Paula', winsA: 0, winsB: 1, ties: 0 },
  { a: 'John', b: 'Randall', winsA: 1, winsB: 1, ties: 0 },
  { a: 'John', b: 'Reggie', winsA: 0, winsB: 3, ties: 0 },
  { a: 'John', b: 'Richie', winsA: 4, winsB: 0, ties: 0 },
  { a: 'John', b: 'SeanH', winsA: 0, winsB: 2, ties: 0 },
  { a: 'John', b: 'Sophia', winsA: 0, winsB: 2, ties: 0 },
  { a: 'John', b: 'Tom', winsA: 2, winsB: 2, ties: 0 },
  { a: 'John', b: 'Wayne', winsA: 1, winsB: 5, ties: 0 },
  { a: 'John', b: 'Wolfe', winsA: 1, winsB: 3, ties: 0 },
  { a: 'Jose', b: 'Josh', winsA: 3, winsB: 2, ties: 0 },
  { a: 'Jose', b: 'Reggie', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Jose', b: 'SeanH', winsA: 3, winsB: 0, ties: 0 },
  { a: 'Jose', b: 'SeanT', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Jose', b: 'Tom', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Jose', b: 'Wayne', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Jose', b: 'Wolfe', winsA: 3, winsB: 4, ties: 0, finals: [
    { season: 2020, label: 'Championship cup final', winner: 'Jose', winnerScore: 135, loserScore: 105 },
  ] },
  { a: 'Josh', b: 'Kristin', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Josh', b: 'MattZ', winsA: 4, winsB: 2, ties: 1 },
  { a: 'Josh', b: 'Michael', winsA: 10, winsB: 5, ties: 1 },
  { a: 'Josh', b: 'Michelle', winsA: 4, winsB: 3, ties: 0, finals: [
    { season: 2024, label: 'Premier Superbowl', winner: 'Josh', winnerScore: 118, loserScore: 115 },
  ] },
  { a: 'Josh', b: 'Patrick', winsA: 2, winsB: 3, ties: 0 },
  { a: 'Josh', b: 'Paula', winsA: 7, winsB: 3, ties: 0 },
  { a: 'Josh', b: 'Randall', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Josh', b: 'Reggie', winsA: 5, winsB: 7, ties: 0 },
  { a: 'Josh', b: 'Ryan', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Josh', b: 'SeanH', winsA: 11, winsB: 10, ties: 0 },
  { a: 'Josh', b: 'SeanT', winsA: 10, winsB: 14, ties: 1 },
  { a: 'Josh', b: 'Tom', winsA: 12, winsB: 8, ties: 0 },
  { a: 'Josh', b: 'Wayne', winsA: 14, winsB: 6, ties: 1 },
  { a: 'Josh', b: 'Wolfe', winsA: 14, winsB: 6, ties: 0 },
  { a: 'JoshuaS', b: 'Randall', winsA: 0, winsB: 1, ties: 0 },
  { a: 'JoshuaS', b: 'Richie', winsA: 1, winsB: 3, ties: 0 },
  { a: 'JoshuaS', b: 'Sophia', winsA: 1, winsB: 1, ties: 0 },
  { a: 'JoshuaS', b: 'Tom', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Kristin', b: 'MattZ', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Kristin', b: 'Michael', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Kristin', b: 'Paula', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Kristin', b: 'SeanH', winsA: 0, winsB: 1, ties: 0 },
  { a: 'MattZ', b: 'Michael', winsA: 3, winsB: 2, ties: 1 },
  { a: 'MattZ', b: 'Paula', winsA: 6, winsB: 3, ties: 0 },
  { a: 'MattZ', b: 'Reggie', winsA: 1, winsB: 2, ties: 0 },
  { a: 'MattZ', b: 'SeanH', winsA: 3, winsB: 4, ties: 0 },
  { a: 'MattZ', b: 'SeanT', winsA: 5, winsB: 4, ties: 0 },
  { a: 'MattZ', b: 'Tom', winsA: 4, winsB: 1, ties: 1 },
  { a: 'MattZ', b: 'Wayne', winsA: 2, winsB: 3, ties: 0 },
  { a: 'MattZ', b: 'Wolfe', winsA: 4, winsB: 4, ties: 0 },
  { a: 'Michael', b: 'Michelle', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Michael', b: 'Patrick', winsA: 2, winsB: 4, ties: 0 },
  { a: 'Michael', b: 'Paula', winsA: 9, winsB: 5, ties: 0 },
  { a: 'Michael', b: 'Randall', winsA: 2, winsB: 2, ties: 0 },
  { a: 'Michael', b: 'Reggie', winsA: 9, winsB: 9, ties: 0, finals: [
    { season: 2019, label: 'JFFL Cup final', winner: 'Reggie', winnerScore: 269, loserScore: 204 },
  ] },
  { a: 'Michael', b: 'Richie', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Michael', b: 'Ryan', winsA: 1, winsB: 3, ties: 0 },
  { a: 'Michael', b: 'SeanH', winsA: 8, winsB: 8, ties: 0 },
  { a: 'Michael', b: 'SeanT', winsA: 5, winsB: 17, ties: 0 },
  { a: 'Michael', b: 'Sophia', winsA: 3, winsB: 2, ties: 0, finals: [
    { season: 2023, label: 'League One cup final', winner: 'Sophia', winnerScore: 104, loserScore: 83 },
  ] },
  { a: 'Michael', b: 'Tom', winsA: 6, winsB: 7, ties: 0, finals: [
    { season: 2006, label: 'Combined Superbowl', winner: 'Michael', winnerScore: 113, loserScore: 86 },
    { season: 2024, label: 'Championship cup final', winner: 'Michael', winnerScore: 77, loserScore: 71 },
  ] },
  { a: 'Michael', b: 'Wayne', winsA: 13, winsB: 6, ties: 0, finals: [
    { season: 2025, label: 'JFFL Cup final', winner: 'Wayne', winnerScore: 230, loserScore: 158 },
  ] },
  { a: 'Michael', b: 'Wolfe', winsA: 8, winsB: 8, ties: 0 },
  { a: 'Michelle', b: 'Patrick', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Michelle', b: 'Paula', winsA: 2, winsB: 3, ties: 0 },
  { a: 'Michelle', b: 'Randall', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Michelle', b: 'Reggie', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Michelle', b: 'Ryan', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Michelle', b: 'SeanH', winsA: 3, winsB: 0, ties: 0 },
  { a: 'Michelle', b: 'SeanT', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Michelle', b: 'Sophia', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Michelle', b: 'Wayne', winsA: 6, winsB: 1, ties: 0 },
  { a: 'Michelle', b: 'Wolfe', winsA: 4, winsB: 4, ties: 0 },
  { a: 'Patrick', b: 'Paula', winsA: 3, winsB: 4, ties: 0 },
  { a: 'Patrick', b: 'Randall', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Patrick', b: 'Reggie', winsA: 2, winsB: 2, ties: 0 },
  { a: 'Patrick', b: 'Richie', winsA: 3, winsB: 1, ties: 0 },
  { a: 'Patrick', b: 'Ryan', winsA: 2, winsB: 4, ties: 0 },
  { a: 'Patrick', b: 'SeanH', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Patrick', b: 'SeanT', winsA: 2, winsB: 1, ties: 0 },
  { a: 'Patrick', b: 'Tom', winsA: 1, winsB: 3, ties: 0 },
  { a: 'Patrick', b: 'Wayne', winsA: 2, winsB: 2, ties: 0 },
  { a: 'Patrick', b: 'Wolfe', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Paula', b: 'Randall', winsA: 3, winsB: 0, ties: 0 },
  { a: 'Paula', b: 'Reggie', winsA: 6, winsB: 7, ties: 0 },
  { a: 'Paula', b: 'Richie', winsA: 4, winsB: 1, ties: 0 },
  { a: 'Paula', b: 'Ryan', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Paula', b: 'SeanH', winsA: 7, winsB: 7, ties: 0 },
  { a: 'Paula', b: 'SeanT', winsA: 2, winsB: 8, ties: 1 },
  { a: 'Paula', b: 'Tom', winsA: 4, winsB: 5, ties: 1 },
  { a: 'Paula', b: 'Wayne', winsA: 6, winsB: 12, ties: 0 },
  { a: 'Paula', b: 'Wolfe', winsA: 2, winsB: 13, ties: 0, finals: [
    { season: 2023, label: 'Championship cup final', winner: 'Paula', winnerScore: 74, loserScore: 69 },
  ] },
  { a: 'Randall', b: 'Richie', winsA: 3, winsB: 3, ties: 0 },
  { a: 'Randall', b: 'Ryan', winsA: 0, winsB: 6, ties: 0 },
  { a: 'Randall', b: 'SeanH', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Randall', b: 'Sophia', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Randall', b: 'Tom', winsA: 0, winsB: 4, ties: 0 },
  { a: 'Reggie', b: 'Richie', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Reggie', b: 'Ryan', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Reggie', b: 'SeanH', winsA: 5, winsB: 11, ties: 0 },
  { a: 'Reggie', b: 'SeanT', winsA: 6, winsB: 17, ties: 0 },
  { a: 'Reggie', b: 'Sophia', winsA: 2, winsB: 0, ties: 0 },
  { a: 'Reggie', b: 'Tom', winsA: 9, winsB: 5, ties: 3 },
  { a: 'Reggie', b: 'Wayne', winsA: 7, winsB: 11, ties: 1 },
  { a: 'Reggie', b: 'Wolfe', winsA: 8, winsB: 8, ties: 0, finals: [
    { season: 2024, label: 'Premier cup final', winner: 'Wolfe', winnerScore: 93, loserScore: 63 },
  ] },
  { a: 'Richie', b: 'Ryan', winsA: 5, winsB: 1, ties: 0 },
  { a: 'Richie', b: 'Sophia', winsA: 1, winsB: 0, ties: 1 },
  { a: 'Richie', b: 'Tom', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Richie', b: 'Wayne', winsA: 0, winsB: 2, ties: 0 },
  { a: 'Ryan', b: 'SeanH', winsA: 1, winsB: 1, ties: 0 },
  { a: 'Ryan', b: 'SeanT', winsA: 4, winsB: 0, ties: 0 },
  { a: 'Ryan', b: 'Sophia', winsA: 1, winsB: 0, ties: 0 },
  { a: 'Ryan', b: 'Tom', winsA: 3, winsB: 2, ties: 0, finals: [
    { season: 2022, label: 'JFFL Cup final', winner: 'Ryan', winnerScore: 201, loserScore: 136 },
  ] },
  { a: 'Ryan', b: 'Wayne', winsA: 1, winsB: 2, ties: 0 },
  { a: 'Ryan', b: 'Wolfe', winsA: 1, winsB: 1, ties: 0 },
  { a: 'SeanH', b: 'SeanT', winsA: 10, winsB: 10, ties: 2 },
  { a: 'SeanH', b: 'Tom', winsA: 12, winsB: 9, ties: 0, finals: [
    { season: 2009, label: 'Combined Superbowl', winner: 'Tom', winnerScore: 95, loserScore: 38 },
  ] },
  { a: 'SeanH', b: 'Wayne', winsA: 10, winsB: 12, ties: 0 },
  { a: 'SeanH', b: 'Wolfe', winsA: 11, winsB: 15, ties: 0 },
  { a: 'SeanT', b: 'Sophia', winsA: 1, winsB: 1, ties: 0 },
  { a: 'SeanT', b: 'Tom', winsA: 12, winsB: 4, ties: 1 },
  { a: 'SeanT', b: 'Wayne', winsA: 11, winsB: 17, ties: 0, finals: [
    { season: 2023, label: 'Premier Superbowl', winner: 'Wayne', winnerScore: 87, loserScore: 78 },
  ] },
  { a: 'SeanT', b: 'Wolfe', winsA: 7, winsB: 7, ties: 0 },
  { a: 'Sophia', b: 'Wayne', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Sophia', b: 'Wolfe', winsA: 0, winsB: 1, ties: 0 },
  { a: 'Tom', b: 'Wayne', winsA: 8, winsB: 6, ties: 0 },
  { a: 'Tom', b: 'Wolfe', winsA: 9, winsB: 8, ties: 1 },
  { a: 'Wayne', b: 'Wolfe', winsA: 11, winsB: 4, ties: 0 },
];

const byName = new Map(pairSeries.map(row => [`${row.a}\0${row.b}`, row]));

export interface FinalsNote {
  text: string;
  href: string;
}

function record(wins: number, losses: number, ties: number) {
  const base = `${wins}${dash}${losses}`;
  return ties ? `${base}${dash}${ties}` : base;
}

function scoreText(meeting: FinalMeeting) {
  return `${meeting.winnerScore}${dash}${meeting.loserScore}`;
}

function joinList(parts: string[]) {
  if (parts.length <= 1) return parts[0] ?? '';
  const pair = parts.some(part => part.includes(',')) ? ', and ' : ' and ';
  if (parts.length === 2) return `${parts[0]}${pair}${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

function bareEvent(meeting: FinalMeeting) {
  return `the ${meeting.season} ${meeting.label}, ${scoreText(meeting)}`;
}

function wonClause(meeting: FinalMeeting) {
  if (!meeting.winner) return `the ${meeting.season} ${meeting.label} finished level, ${scoreText(meeting)}`;
  return `${meeting.winner} won the ${meeting.season} ${meeting.label}, ${scoreText(meeting)}`;
}

function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function finalsPhrase(latestFirst: FinalMeeting[], leader: string | null) {
  const first = latestFirst[0];
  if (!first) return '';
  const sameWinner = latestFirst.every(item => item.winner && item.winner === first.winner);
  if (sameWinner && leader && first.winner === leader) return `including ${joinList(latestFirst.map(bareEvent))}`;
  if (sameWinner && !leader) {
    const [head, ...rest] = latestFirst;
    return `and ${joinList([wonClause(head!), ...rest.map(bareEvent)])}`;
  }
  const head = !first.winner
    ? `and the ${first.season} ${first.label} finished level, ${scoreText(first)}`
    : leader && first.winner === leader
      ? `including ${bareEvent(first)}`
      : leader
        ? `but ${wonClause(first)}`
        : `and ${wonClause(first)}`;
  const rest = latestFirst.slice(1).map(item => sentenceCase(wonClause(item)));
  return rest.length ? `${head}. ${rest.join('. ')}` : head;
}

function meetingRank(label: string) {
  if (label.endsWith('Superbowl')) return 2;
  if (label.startsWith('JFFL')) return 1;
  return 0;
}

function finalLabel(game: HistoryGame) {
  if (game.type === 'Superbowl') return `${game.league} Superbowl`;
  return game.league === 'JFFL' ? 'JFFL Cup final' : `${game.league} cup final`;
}

function addMeeting(row: PairSeries, game: HistoryGame) {
  const scoreA = game.teamA === row.a ? game.scoreA : game.scoreB;
  const scoreB = game.teamA === row.a ? game.scoreB : game.scoreA;
  if (scoreA === scoreB) row.ties += 1;
  else if (scoreA > scoreB) row.winsA += 1;
  else row.winsB += 1;
  if ((game.type !== 'Superbowl' && game.type !== 'Cup') || !game.round.endsWith('Final')) return;
  const tied = scoreA === scoreB;
  row.finals = [...(row.finals ?? []), {
    season: game.season,
    label: finalLabel(game),
    winner: tied ? '' : scoreA > scoreB ? row.a : row.b,
    winnerScore: tied ? scoreA : Math.max(scoreA, scoreB),
    loserScore: tied ? scoreB : Math.min(scoreA, scoreB),
  }];
}

function combined(a: string, b: string, extra: HistoryGame[]) {
  const base = byName.get(`${a}\0${b}`);
  const mine = extra.filter(game => {
    const [left, right] = game.teamA < game.teamB ? [game.teamA, game.teamB] : [game.teamB, game.teamA];
    return left === a && right === b;
  });
  if (!base && !mine.length) return null;
  const row: PairSeries = { a, b, winsA: base?.winsA ?? 0, winsB: base?.winsB ?? 0, ties: base?.ties ?? 0, finals: [...(base?.finals ?? [])] };
  for (const game of mine) addMeeting(row, game);
  if (mine.length) row.finals?.sort((left, right) => left.season - right.season || meetingRank(left.label) - meetingRank(right.label) || (left.label < right.label ? -1 : 1));
  return row.winsA + row.winsB + row.ties > 0 ? row : null;
}

function seriesSentence(row: PairSeries, scope: 'latest' | 'all') {
  const finals = row.finals ?? [];
  const leader = row.winsA === row.winsB ? null : row.winsA > row.winsB ? row.a : row.b;
  const series = leader
    ? `${leader} leads ${record(leader === row.a ? row.winsA : row.winsB, leader === row.a ? row.winsB : row.winsA, row.ties)} in all competitions`
    : `${row.a} and ${row.b} are level at ${record(row.winsA, row.winsB, row.ties)}`;
  if (!finals.length) return `${series}.`;
  const chosen = scope === 'all' ? [...finals].reverse() : finals.slice(-1);
  return `${series}, ${finalsPhrase(chosen, leader)}.`;
}

/** The all-competitions series, and who won a past final when they have met in one. */
export function finalsNote(left: string, right: string, scope: 'latest' | 'all' = 'latest', extra: HistoryGame[] = []): FinalsNote | null {
  if (!left || !right || left === right || !managers.has(left) || !managers.has(right)) return null;
  const [a, b] = left < right ? [left, right] : [right, left];
  const row = combined(a, b, extra);
  const href = rivalPath(a, b);
  if (!row) return { text: `${a} and ${b} have not played.`, href };
  return { text: seriesSentence(row, scope), href };
}

let seriesCache: { stamp: string; games: HistoryGame[] } | null = null;

/** Finished games from the season in progress, so the line matches the head-to-head page. */
export function finishedSeriesGames(summaries: SummaryMap): HistoryGame[] {
  const stamp = LEAGUES.map(league => summaries[league.slug]?.updatedAt ?? '').join('|');
  if (seriesCache?.stamp === stamp) return seriesCache.games;
  const games = finishedGames(buildLiveSeason(summaries));
  seriesCache = { stamp, games };
  return games;
}

export function summaryMap(summaries: Record<string, { data: LeagueSummary | null }>): SummaryMap {
  const map: SummaryMap = {};
  for (const league of LEAGUES) {
    const data = summaries[league.slug]?.data;
    if (data) map[league.slug] = data;
  }
  return map;
}
