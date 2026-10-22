import { rivalPath } from './sharePaths.ts';

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
  finals: FinalMeeting[];
}

/** All-competitions records for managers who have met in a final. Rebuilt from the archive by tests/finalsRematch.test.ts. */
export const pairSeries: PairSeries[] = [
  { a: 'Al', b: 'Chris', winsA: 9, winsB: 13, ties: 0, finals: [
    { season: 2015, label: 'Championship Superbowl', winner: 'Chris', winnerScore: 95, loserScore: 43 },
  ] },
  { a: 'Al', b: 'Michael', winsA: 8, winsB: 19, ties: 0, finals: [
    { season: 2020, label: 'Premier Superbowl', winner: 'Michael', winnerScore: 90, loserScore: 85 },
  ] },
  { a: 'Allison', b: 'Sophia', winsA: 4, winsB: 1, ties: 0, finals: [
    { season: 2024, label: 'League One Superbowl', winner: 'Allison', winnerScore: 97, loserScore: 78 },
  ] },
  { a: 'Andrew', b: 'Joe', winsA: 5, winsB: 6, ties: 0, finals: [
    { season: 2022, label: 'League One Superbowl', winner: 'Andrew', winnerScore: 113, loserScore: 92 },
  ] },
  { a: 'Andrew', b: 'Wayne', winsA: 7, winsB: 6, ties: 0, finals: [
    { season: 2017, label: 'Championship Superbowl', winner: 'Andrew', winnerScore: 92, loserScore: 87 },
  ] },
  { a: 'Becky', b: 'Brad', winsA: 11, winsB: 8, ties: 0, finals: [
    { season: 2025, label: 'League One cup final', winner: 'Becky', winnerScore: 85, loserScore: 71 },
  ] },
  { a: 'Becky', b: 'Brandi', winsA: 2, winsB: 2, ties: 0, finals: [
    { season: 2023, label: 'Championship Superbowl', winner: 'Brandi', winnerScore: 80, loserScore: 71 },
  ] },
  { a: 'Becky', b: 'Brendan', winsA: 6, winsB: 15, ties: 0, finals: [
    { season: 2022, label: 'Premier cup final', winner: 'Brendan', winnerScore: 91, loserScore: 74 },
  ] },
  { a: 'Becky', b: 'Donna', winsA: 12, winsB: 15, ties: 0, finals: [
    { season: 2014, label: 'Premier cup final', winner: 'Donna', winnerScore: 116, loserScore: 94 },
  ] },
  { a: 'Becky', b: 'J-Seitz', winsA: 5, winsB: 1, ties: 0, finals: [
    { season: 2025, label: 'League One Superbowl', winner: 'Becky', winnerScore: 110, loserScore: 90 },
  ] },
  { a: 'Becky', b: 'Jason', winsA: 7, winsB: 9, ties: 0, finals: [
    { season: 2024, label: 'JFFL Cup final', winner: 'Jason', winnerScore: 197, loserScore: 176 },
  ] },
  { a: 'Becky', b: 'Joe', winsA: 9, winsB: 15, ties: 0, finals: [
    { season: 2016, label: 'Championship cup final', winner: 'Becky', winnerScore: 86, loserScore: 41 },
    { season: 2016, label: 'Championship Superbowl', winner: 'Joe', winnerScore: 115, loserScore: 94 },
  ] },
  { a: 'Becky', b: 'Jose', winsA: 1, winsB: 5, ties: 0, finals: [
    { season: 2020, label: 'Championship Superbowl', winner: 'Becky', winnerScore: 100, loserScore: 68 },
  ] },
  { a: 'Becky', b: 'Paula', winsA: 12, winsB: 10, ties: 1, finals: [
    { season: 2013, label: 'Championship Superbowl', winner: 'Paula', winnerScore: 94, loserScore: 77 },
  ] },
  { a: 'Becky', b: 'SeanH', winsA: 9, winsB: 14, ties: 0, finals: [
    { season: 2015, label: 'Premier cup final', winner: 'Becky', winnerScore: 59, loserScore: 55 },
  ] },
  { a: 'Brad', b: 'Chris', winsA: 15, winsB: 15, ties: 2, finals: [
    { season: 2015, label: 'Championship cup final', winner: 'Brad', winnerScore: 80, loserScore: 42 },
  ] },
  { a: 'Brad', b: 'Jeff', winsA: 6, winsB: 13, ties: 0, finals: [
    { season: 2017, label: 'Premier cup final', winner: 'Jeff', winnerScore: 95, loserScore: 87 },
  ] },
  { a: 'Brad', b: 'John', winsA: 2, winsB: 4, ties: 1, finals: [
    { season: 2023, label: 'League One Superbowl', winner: 'Brad', winnerScore: 92, loserScore: 81 },
  ] },
  { a: 'Brad', b: 'Michael', winsA: 11, winsB: 11, ties: 1, finals: [
    { season: 2003, label: 'Combined Superbowl', winner: '', winnerScore: 65, loserScore: 65 },
  ] },
  { a: 'Brandi', b: 'Chris', winsA: 2, winsB: 1, ties: 0, finals: [
    { season: 2022, label: 'Championship Superbowl', winner: 'Chris', winnerScore: 68, loserScore: 54 },
  ] },
  { a: 'Brandi', b: 'Jason', winsA: 0, winsB: 3, ties: 0, finals: [
    { season: 2023, label: 'JFFL Cup final', winner: 'Jason', winnerScore: 227, loserScore: 160 },
  ] },
  { a: 'Brandi', b: 'Jeff', winsA: 2, winsB: 3, ties: 0, finals: [
    { season: 2025, label: 'Championship cup final', winner: 'Jeff', winnerScore: 94, loserScore: 92 },
  ] },
  { a: 'Brandi', b: 'Patrick', winsA: 4, winsB: 1, ties: 0, finals: [
    { season: 2021, label: 'League One Superbowl', winner: 'Brandi', winnerScore: 104, loserScore: 74 },
  ] },
  { a: 'Brendan', b: 'Chris', winsA: 10, winsB: 10, ties: 0, finals: [
    { season: 2019, label: 'Championship cup final', winner: 'Chris', winnerScore: 104, loserScore: 64 },
  ] },
  { a: 'Brendan', b: 'Donna', winsA: 17, winsB: 10, ties: 0, finals: [
    { season: 2014, label: 'JFFL Cup final', winner: 'Donna', winnerScore: 208, loserScore: 178 },
  ] },
  { a: 'Brendan', b: 'Jason', winsA: 12, winsB: 14, ties: 1, finals: [
    { season: 2012, label: 'Combined Superbowl', winner: 'Jason', winnerScore: 85, loserScore: 80 },
    { season: 2025, label: 'Premier cup final', winner: 'Jason', winnerScore: 90, loserScore: 75 },
  ] },
  { a: 'Brendan', b: 'Jeff', winsA: 16, winsB: 8, ties: 0, finals: [
    { season: 2015, label: 'Premier Superbowl', winner: 'Jeff', winnerScore: 135, loserScore: 72 },
  ] },
  { a: 'Brendan', b: 'Joe', winsA: 9, winsB: 8, ties: 1, finals: [
    { season: 2018, label: 'Championship cup final', winner: 'Brendan', winnerScore: 109, loserScore: 101 },
  ] },
  { a: 'Brendan', b: 'Jose', winsA: 1, winsB: 3, ties: 0, finals: [
    { season: 2018, label: 'Championship Superbowl', winner: 'Jose', winnerScore: 130, loserScore: 93 },
  ] },
  { a: 'Brendan', b: 'Josh', winsA: 7, winsB: 19, ties: 0, finals: [
    { season: 2014, label: 'Premier Superbowl', winner: 'Josh', winnerScore: 116, loserScore: 73 },
  ] },
  { a: 'Brendan', b: 'Michael', winsA: 11, winsB: 9, ties: 2, finals: [
    { season: 2019, label: 'Championship Superbowl', winner: 'Brendan', winnerScore: 114, loserScore: 73 },
    { season: 2020, label: 'Premier cup final', winner: 'Michael', winnerScore: 117, loserScore: 105 },
  ] },
  { a: 'Brendan', b: 'Paula', winsA: 6, winsB: 4, ties: 0, finals: [
    { season: 2025, label: 'Premier Superbowl', winner: 'Paula', winnerScore: 130, loserScore: 95 },
  ] },
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
  { a: 'Chris', b: 'Jason', winsA: 11, winsB: 13, ties: 0, finals: [
    { season: 2016, label: 'Premier Superbowl', winner: 'Chris', winnerScore: 128, loserScore: 104 },
  ] },
  { a: 'Chris', b: 'Jeff', winsA: 9, winsB: 9, ties: 0, finals: [
    { season: 2017, label: 'Premier Superbowl', winner: 'Chris', winnerScore: 106, loserScore: 94 },
  ] },
  { a: 'Chris', b: 'Josh', winsA: 6, winsB: 12, ties: 0, finals: [
    { season: 2017, label: 'JFFL Cup final', winner: 'Chris', winnerScore: 240, loserScore: 152 },
  ] },
  { a: 'Chris', b: 'Patrick', winsA: 5, winsB: 4, ties: 0, finals: [
    { season: 2024, label: 'Championship Superbowl', winner: 'Patrick', winnerScore: 137, loserScore: 62 },
  ] },
  { a: 'Chris', b: 'SeanH', winsA: 8, winsB: 12, ties: 2, finals: [
    { season: 2018, label: 'Premier Superbowl', winner: 'SeanH', winnerScore: 92, loserScore: 73 },
  ] },
  { a: 'Chris', b: 'Wayne', winsA: 9, winsB: 17, ties: 2, finals: [
    { season: 2022, label: 'Championship cup final', winner: 'Chris', winnerScore: 102, loserScore: 84 },
  ] },
  { a: 'Donna', b: 'Jason', winsA: 15, winsB: 8, ties: 0, finals: [
    { season: 2010, label: 'Combined Superbowl', winner: 'Jason', winnerScore: 96, loserScore: 33 },
  ] },
  { a: 'Donna', b: 'Jeff', winsA: 9, winsB: 11, ties: 1, finals: [
    { season: 2013, label: 'JFFL Cup final', winner: 'Jeff', winnerScore: 189, loserScore: 176 },
  ] },
  { a: 'Donna', b: 'Josh', winsA: 15, winsB: 13, ties: 0, finals: [
    { season: 2011, label: 'Combined Superbowl', winner: 'Donna', winnerScore: 84, loserScore: 72 },
  ] },
  { a: 'Donna', b: 'SeanH', winsA: 15, winsB: 7, ties: 0, finals: [
    { season: 2020, label: 'JFFL Cup final', winner: 'Donna', winnerScore: 204, loserScore: 176 },
    { season: 2021, label: 'Premier Superbowl', winner: 'SeanH', winnerScore: 82, loserScore: 69 },
  ] },
  { a: 'Donna', b: 'Tom', winsA: 16, winsB: 15, ties: 0, finals: [
    { season: 2023, label: 'Premier cup final', winner: 'Donna', winnerScore: 109, loserScore: 61 },
  ] },
  { a: 'Donna', b: 'Wayne', winsA: 4, winsB: 8, ties: 0, finals: [
    { season: 2017, label: 'Championship cup final', winner: 'Wayne', winnerScore: 104, loserScore: 100 },
  ] },
  { a: 'Donna', b: 'Wolfe', winsA: 16, winsB: 7, ties: 0, finals: [
    { season: 2021, label: 'JFFL Cup final', winner: 'Donna', winnerScore: 211, loserScore: 180 },
  ] },
  { a: 'Gabriel', b: 'Richie', winsA: 1, winsB: 6, ties: 0, finals: [
    { season: 2021, label: 'League One cup final', winner: 'Richie', winnerScore: 127, loserScore: 24 },
  ] },
  { a: 'J-Seitz', b: 'Ryan', winsA: 2, winsB: 4, ties: 0, finals: [
    { season: 2022, label: 'League One cup final', winner: 'Ryan', winnerScore: 118, loserScore: 88 },
  ] },
  { a: 'Jason', b: 'Jeff', winsA: 13, winsB: 12, ties: 0, finals: [
    { season: 2016, label: 'Premier cup final', winner: 'Jeff', winnerScore: 79, loserScore: 76 },
  ] },
  { a: 'Jason', b: 'Josh', winsA: 14, winsB: 13, ties: 0, finals: [
    { season: 2018, label: 'Premier cup final', winner: 'Jason', winnerScore: 87, loserScore: 86 },
    { season: 2022, label: 'Premier Superbowl', winner: 'Josh', winnerScore: 88, loserScore: 87 },
  ] },
  { a: 'Jason', b: 'Reggie', winsA: 9, winsB: 8, ties: 1, finals: [
    { season: 2019, label: 'Premier Superbowl', winner: 'Reggie', winnerScore: 135, loserScore: 96 },
  ] },
  { a: 'Jason', b: 'SeanT', winsA: 15, winsB: 12, ties: 1, finals: [
    { season: 2005, label: 'Combined Superbowl', winner: 'SeanT', winnerScore: 88, loserScore: 67 },
    { season: 2021, label: 'Premier cup final', winner: 'SeanT', winnerScore: 135, loserScore: 83 },
  ] },
  { a: 'Jason', b: 'Wayne', winsA: 13, winsB: 8, ties: 1, finals: [
    { season: 2013, label: 'Championship cup final', winner: 'Jason', winnerScore: 111, loserScore: 88 },
  ] },
  { a: 'Jeff', b: 'JimZ', winsA: 8, winsB: 4, ties: 0, finals: [
    { season: 2013, label: 'Premier Superbowl', winner: 'Jeff', winnerScore: 86, loserScore: 85 },
  ] },
  { a: 'Jeff', b: 'Josh', winsA: 16, winsB: 8, ties: 1, finals: [
    { season: 2016, label: 'JFFL Cup final', winner: 'Josh', winnerScore: 204, loserScore: 151 },
  ] },
  { a: 'Jeff', b: 'Ryan', winsA: 4, winsB: 0, ties: 0, finals: [
    { season: 2025, label: 'Championship Superbowl', winner: 'Jeff', winnerScore: 112, loserScore: 78 },
  ] },
  { a: 'Jeff', b: 'SeanT', winsA: 13, winsB: 10, ties: 0, finals: [
    { season: 2004, label: 'Combined Superbowl', winner: 'Jeff', winnerScore: 79, loserScore: 62 },
  ] },
  { a: 'Jeff', b: 'Sophia', winsA: 0, winsB: 3, ties: 0, finals: [
    { season: 2024, label: 'League One cup final', winner: 'Sophia', winnerScore: 108, loserScore: 83 },
  ] },
  { a: 'Jeff', b: 'Wayne', winsA: 10, winsB: 10, ties: 0, finals: [
    { season: 2021, label: 'Championship cup final', winner: 'Jeff', winnerScore: 72, loserScore: 53 },
    { season: 2021, label: 'Championship Superbowl', winner: 'Jeff', winnerScore: 90, loserScore: 83 },
  ] },
  { a: 'Jeff', b: 'Wolfe', winsA: 10, winsB: 7, ties: 1, finals: [
    { season: 2019, label: 'Premier cup final', winner: 'Wolfe', winnerScore: 112, loserScore: 70 },
  ] },
  { a: 'JimZ', b: 'SeanH', winsA: 7, winsB: 7, ties: 0, finals: [
    { season: 2014, label: 'Championship cup final', winner: 'JimZ', winnerScore: 107, loserScore: 94 },
    { season: 2014, label: 'Championship Superbowl', winner: 'SeanH', winnerScore: 100, loserScore: 88 },
  ] },
  { a: 'Joe', b: 'SeanH', winsA: 9, winsB: 4, ties: 0, finals: [
    { season: 2002, label: 'Combined Superbowl', winner: 'Joe', winnerScore: 83, loserScore: 67 },
  ] },
  { a: 'Joe', b: 'SeanT', winsA: 11, winsB: 9, ties: 0, finals: [
    { season: 2018, label: 'JFFL Cup final', winner: 'SeanT', winnerScore: 152, loserScore: 148 },
  ] },
  { a: 'Jose', b: 'Wolfe', winsA: 3, winsB: 4, ties: 0, finals: [
    { season: 2020, label: 'Championship cup final', winner: 'Jose', winnerScore: 135, loserScore: 105 },
  ] },
  { a: 'Josh', b: 'Michelle', winsA: 4, winsB: 3, ties: 0, finals: [
    { season: 2024, label: 'Premier Superbowl', winner: 'Josh', winnerScore: 118, loserScore: 115 },
  ] },
  { a: 'Michael', b: 'Reggie', winsA: 9, winsB: 9, ties: 0, finals: [
    { season: 2019, label: 'JFFL Cup final', winner: 'Reggie', winnerScore: 269, loserScore: 204 },
  ] },
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
  { a: 'Paula', b: 'Wolfe', winsA: 2, winsB: 13, ties: 0, finals: [
    { season: 2023, label: 'Championship cup final', winner: 'Paula', winnerScore: 74, loserScore: 69 },
  ] },
  { a: 'Reggie', b: 'Wolfe', winsA: 8, winsB: 8, ties: 0, finals: [
    { season: 2024, label: 'Premier cup final', winner: 'Wolfe', winnerScore: 93, loserScore: 63 },
  ] },
  { a: 'Ryan', b: 'Tom', winsA: 3, winsB: 2, ties: 0, finals: [
    { season: 2022, label: 'JFFL Cup final', winner: 'Ryan', winnerScore: 201, loserScore: 136 },
  ] },
  { a: 'SeanH', b: 'Tom', winsA: 12, winsB: 9, ties: 0, finals: [
    { season: 2009, label: 'Combined Superbowl', winner: 'Tom', winnerScore: 95, loserScore: 38 },
  ] },
  { a: 'SeanT', b: 'Wayne', winsA: 11, winsB: 17, ties: 0, finals: [
    { season: 2023, label: 'Premier Superbowl', winner: 'Wayne', winnerScore: 87, loserScore: 78 },
  ] },
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

/** The series across every competition, then who won the final. Nothing when they have not met in one. */
export function finalsNote(left: string, right: string, scope: 'latest' | 'all' = 'latest'): FinalsNote | null {
  if (!left || !right || left === right) return null;
  const [a, b] = left < right ? [left, right] : [right, left];
  const row = byName.get(`${a}\0${b}`);
  if (!row?.finals.length) return null;
  const chosen = scope === 'all' ? [...row.finals].reverse() : row.finals.slice(-1);
  const leader = row.winsA === row.winsB ? null : row.winsA > row.winsB ? row.a : row.b;
  const series = leader
    ? `${leader} leads ${record(leader === row.a ? row.winsA : row.winsB, leader === row.a ? row.winsB : row.winsA, row.ties)} in all competitions`
    : `${row.a} and ${row.b} are level at ${record(row.winsA, row.winsB, row.ties)}`;
  return { text: `${series}, ${finalsPhrase(chosen, leader)}.`, href: rivalPath(a, b) };
}
