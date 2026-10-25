import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { finalsNote, pairSeries, type PairSeries } from '../src/finalsRematch.ts';
import { parseArchive, type ArchiveFile, type HistoryGame } from '../src/history/stats.ts';

const archive = parseArchive(JSON.parse(readFileSync(new URL('../src/history/archive.json', import.meta.url), 'utf8')) as ArchiveFile);

function isFinal(game: HistoryGame) {
  return (game.type === 'Superbowl' || game.type === 'Cup') && game.round.endsWith('Final');
}

function finalLabel(game: HistoryGame) {
  if (game.type === 'Superbowl') return `${game.league} Superbowl`;
  return game.league === 'JFFL' ? 'JFFL Cup final' : `${game.league} cup final`;
}

function finalRank(game: HistoryGame) {
  if (game.type === 'Cup' && game.league !== 'JFFL') return 0;
  if (game.type === 'Cup') return 1;
  return 2;
}

function seriesFrom(games: HistoryGame[]): PairSeries[] {
  const pairs = new Map<string, PairSeries & { order: number[] }>();
  for (const game of games) {
    const [a, b] = [game.teamA, game.teamB].sort((left, right) => left < right ? -1 : 1);
    const key = `${a}\0${b}`;
    let row = pairs.get(key);
    if (!row) {
      row = { a, b, winsA: 0, winsB: 0, ties: 0, finals: [], order: [] };
      pairs.set(key, row);
    }
    const scoreA = game.teamA === a ? game.scoreA : game.scoreB;
    const scoreB = game.teamA === a ? game.scoreB : game.scoreA;
    if (scoreA === scoreB) row.ties += 1;
    else if (scoreA > scoreB) row.winsA += 1;
    else row.winsB += 1;
    if (!isFinal(game)) continue;
    const tied = scoreA === scoreB;
    row.finals.push({
      season: game.season,
      label: finalLabel(game),
      winner: tied ? '' : scoreA > scoreB ? a : b,
      winnerScore: tied ? scoreA : Math.max(scoreA, scoreB),
      loserScore: tied ? scoreB : Math.min(scoreA, scoreB),
    });
    row.order.push(finalRank(game));
  }
  return [...pairs.values()].map(row => {
    const finals = row.finals.map((meeting, index) => ({ meeting, order: row.order[index] ?? 0 }))
      .sort((left, right) => left.meeting.season - right.meeting.season || left.order - right.order || (left.meeting.label < right.meeting.label ? -1 : 1))
      .map(item => item.meeting);
    const stored: PairSeries = { a: row.a, b: row.b, winsA: row.winsA, winsB: row.winsB, ties: row.ties };
    if (finals.length) stored.finals = finals;
    return stored;
  }).sort((left, right) => left.a < right.a ? -1 : left.a > right.a ? 1 : left.b < right.b ? -1 : 1);
}

test('stored series match every archive meeting, and only real finals', () => {
  assert.deepEqual(pairSeries, seriesFrom(archive.games));
});

test('week 7 pairs name the final score and leave earlier playoff rounds in the record', () => {
  const playoff = archive.games.find(game => game.season === 2018 && game.type === 'Superbowl' && game.round === '1'
    && (game.teamA === 'Chris' && game.teamB === 'Jeff' || game.teamA === 'Jeff' && game.teamB === 'Chris'));
  assert.ok(playoff);
  assert.equal(playoff.round.endsWith('Final'), false);
  const chrisJeff = finalsNote('Jeff', 'Chris');
  assert.equal(chrisJeff?.text, 'Chris and Jeff are level at 9–9, and Chris won the 2017 Premier Superbowl, 106–94.');
  assert.equal(chrisJeff?.text.includes('2018'), false);
  assert.equal(chrisJeff?.href, '/archive/rivals/Chris/Jeff');
  assert.equal(finalsNote('Chris', 'Jeff', 'all')?.text, chrisJeff?.text);
  assert.equal(finalsNote('Brad', 'Becky')?.text, 'Becky leads 11–8 in all competitions, including the 2025 League One cup final, 85–71.');
  assert.equal(finalsNote('Wayne', 'Jason')?.text, 'Jason leads 13–8–1 in all competitions, including the 2013 Championship cup final, 111–88.');
});

test('but is the series leader losing the final, and the match page names every final', () => {
  assert.equal(finalsNote('Jason', 'Chris')?.text, 'Jason leads 13–11 in all competitions, but Chris won the 2016 Premier Superbowl, 128–104.');
  assert.equal(
    finalsNote('Jason', 'Josh', 'all')?.text,
    'Jason leads 14–13 in all competitions, but Josh won the 2022 Premier Superbowl, 88–87. Jason won the 2018 Premier cup final, 87–86.',
  );
  assert.equal(
    finalsNote('Jeff', 'Wayne', 'all')?.text,
    'Jeff and Wayne are level at 10–10, and Jeff won the 2021 Championship Superbowl, 90–83, and the 2021 Championship cup final, 72–53.',
  );
  assert.equal(finalsNote('Brad', 'Michael')?.text, 'Brad and Michael are level at 11–11–1, and the 2003 Combined Superbowl finished level, 65–65.');
});

test('every current pairing gets a series, and a final is named only when they have met in one', () => {
  assert.equal(finalsNote('Becky', 'Jeff')?.text, 'Jeff leads 16–2 in all competitions.');
  assert.equal(finalsNote('Allison', 'Jason')?.text, 'Allison and Jason have not played.');
  assert.equal(finalsNote('Allison', 'Jason')?.href, '/archive/rivals/Allison/Jason');
  assert.equal(finalsNote('Chris', 'Chris'), null);
  assert.equal(finalsNote('Chris', 'Bye'), null);
  assert.equal(finalsNote('JimZ', 'Chris'), null);
  const extra: HistoryGame = { season: 2026, league: 'Premier', type: 'Season', round: '', week: 1, teamA: 'Becky', teamB: 'Jeff', scoreA: 100, scoreB: 90 };
  assert.equal(finalsNote('Becky', 'Jeff', 'latest', [extra])?.text, 'Jeff leads 16–3 in all competitions.');
  assert.equal(finalsNote('Becky', 'Jeff', 'latest', [extra, extra])?.text, 'Jeff leads 16–4 in all competitions.');
});
