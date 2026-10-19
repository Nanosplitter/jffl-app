import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameProgress, liveWinChance, sideVariance, winChanceSeries, withNow, type OddsStarter } from '../src/liveOdds.ts';
import type { LiveGame } from '../src/types.ts';

const kickoff = '2026-10-18T17:00:00Z';
const start = Date.parse(kickoff);
const gameMs = 3.25 * 60 * 60 * 1000;

const starter = (partial: Partial<OddsStarter>): OddsStarter => ({
  name: 'Pat', position: 'QB', proTeam: 'KC', weekPoints: null, projectedPoints: 18, previousPoints: [], kickoff, ...partial,
});

test('game progress uses the live slate now and kickoff otherwise', () => {
  const now = start + 60 * 60 * 1000;
  const live: LiveGame = { kickoff, state: 'in', detail: 'Q2 5:00', progress: 0.4 };
  assert.equal(gameProgress(live, kickoff, now, now), 0.4);
  assert.equal(gameProgress({ ...live, state: 'pre', progress: 0 }, kickoff, now, now), 0);
  assert.equal(gameProgress({ ...live, state: 'post', progress: 1 }, kickoff, now, now), 1);
  assert.equal(gameProgress(null, kickoff, start - 1, now), 0);
  assert.equal(gameProgress(null, kickoff, start + gameMs / 2, now), 0.5);
  assert.equal(gameProgress(null, kickoff, start + gameMs, now), 1);
  assert.equal(gameProgress(null, null, now, now), 0);
  const ended = start + 2 * 60 * 60 * 1000;
  const final: LiveGame = { kickoff, state: 'post', detail: 'Final', progress: 1, endedAt: new Date(ended).toISOString() };
  assert.equal(gameProgress(final, kickoff, start + 60 * 60 * 1000, ended + 60 * 60 * 1000), 0.5);
  assert.equal(gameProgress(final, kickoff, ended, ended + 1000), 1);
});

test('variance shrinks with progress and ignores a scored or bye starter', () => {
  const now = start;
  const games = { KC: { kickoff, state: 'pre' as const, detail: '', progress: 0 } };
  const full = sideVariance([starter({})], games, now, now, 4);
  assert.equal(full, 7.5 * 7.5);
  assert.equal(sideVariance([starter({ weekPoints: 10 })], games, now, now, 4), 0);
  assert.equal(sideVariance([starter({ proTeam: 'MIN' })], games, now, now, 6), 0);
  const halfway: LiveGame = { kickoff, state: 'in', detail: 'Q3', progress: 0.5 };
  assert.equal(sideVariance([starter({})], { KC: halfway }, now, now, 4), full * 0.5);
  assert.equal(sideVariance([starter({})], { KC: { ...halfway, state: 'post', progress: 1 } }, now, now, 4), 0);
});

test('a live chance stays absent without a projection and is level or settled when nothing is left', () => {
  assert.equal(liveWinChance(null, 10, 1, 1), null);
  assert.equal(liveWinChance(10, null, 1, 1), null);
  assert.equal(liveWinChance(10, 10, 0, 0), 'level');
  assert.deepEqual(liveWinChance(11, 10, 0, 0), { left: 100, right: 0 });
  assert.deepEqual(liveWinChance(10, 11, 0, 0, 5, 0), { left: 100, right: 0 });
  const even = liveWinChance(100, 100, 25, 25);
  assert.deepEqual(even, { left: 50, right: 50 });
});

test('a win-chance series holds the other side and keeps a null score', () => {
  const points = winChanceSeries(
    { t: [1, 3], s: [1, 2], p: [10, 12] },
    { t: [2, 3], s: [null, 4], p: [10, 10] },
    () => ({ left: 0, right: 0 }),
    5,
    1,
  );
  assert.deepEqual(points.map(point => point.t), [2, 3]);
  assert.equal(points[0].chance, 100);
  assert.equal(points[0].projectedLeft, 15);
  assert.equal(points[0].projectedRight, 11);
  assert.equal(points[0].scoreLeft, 6);
  assert.equal(points[0].scoreRight, null);
  assert.equal(points[1].scoreRight, 5);
  assert.deepEqual(winChanceSeries({ t: [1], s: [null], p: [null] }, { t: [1], s: [0], p: [10] }, () => ({ left: 0, right: 0 })), []);
});

test('the current sample is added only when the score or projection changed', () => {
  const series = { t: [10], s: [null as number | null], p: [80 as number | null] };
  assert.equal(withNow(series, 20, null, 80), series);
  const next = withNow(series, 20, 4, 80);
  assert.deepEqual(next, { t: [10, 20], s: [null, 4], p: [80, 80] });
  assert.deepEqual(withNow(null, 20, null, null), null);
  assert.deepEqual(withNow(null, 20, null, 90), { t: [20], s: [null], p: [90] });
});
