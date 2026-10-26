import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collapseGaps, gameProgress, liveWinChance, recordedProjection, scoreChartScale, scoreLine, sideVariance, winChanceSeries, withNow, type OddsStarter } from '../src/liveOdds.ts';
import type { LiveGame } from '../src/types.ts';

const kickoff = '2026-10-18T17:00:00Z';
const start = Date.parse(kickoff);
const gameMs = 3.25 * 60 * 60 * 1000;

const starter = (partial: Partial<OddsStarter>): OddsStarter => ({
  name: 'Pat', position: 'QB', proTeam: 'KC', weekPoints: null, projectedPoints: 18, previousPoints: [], kickoff, ...partial,
});

test('a long quiet stretch collapses and still maps back to real time', () => {
  const start = Date.parse('2026-10-16T00:15:00Z');
  const later = start + 30 * 60 * 1000;
  const sunday = later + 40 * 60 * 60 * 1000;
  const warp = collapseGaps([sunday, start, later]);
  assert.equal(warp.toX(later) - warp.toX(start), 30 * 60 * 1000);
  assert.equal(warp.toX(sunday) - warp.toX(later), 10 * 60 * 1000);
  assert.equal(warp.fromX(warp.toX(sunday)), sunday);
  assert.equal(warp.fromX(warp.toX(start)), start);
});

test('a finish a day away does not outgrow the recorded score', () => {
  const startMs = Date.parse('2026-10-18T22:00:00Z');
  const nowMs = startMs + 2 * 60 * 60 * 1000;
  const endMs = nowMs + 24 * 60 * 60 * 1000;
  const scale = scoreChartScale(startMs, nowMs, endMs);
  assert.equal(scale.compressed, true);
  assert.equal(scale.max - scale.toX(nowMs), scale.toX(nowMs) - scale.min);
  assert.equal(scale.fromX(scale.toX(endMs)), endMs);
  assert.equal(scale.toX(startMs), startMs);
  const soon = scoreChartScale(startMs, nowMs, nowMs + 60 * 60 * 1000);
  assert.equal(soon.compressed, false);
  assert.equal(soon.toX(nowMs + 60 * 60 * 1000), nowMs + 60 * 60 * 1000);
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

test('variance follows the game clock, not whether a score has been posted', () => {
  const now = start;
  const games = { KC: { kickoff, state: 'pre' as const, detail: '', progress: 0 } };
  const full = sideVariance([starter({})], games, now, now, 4);
  assert.equal(full, 7.5 * 7.5);
  assert.equal(sideVariance([starter({ weekPoints: 10 })], games, now, now, 4), full);
  assert.equal(sideVariance([starter({ proTeam: 'MIN' })], games, now, now, 6), 0);
  const halfway: LiveGame = { kickoff, state: 'in', detail: 'Q3', progress: 0.5 };
  assert.equal(sideVariance([starter({ weekPoints: 8 })], { KC: halfway }, now, now, 4), full * 0.5);
  assert.equal(sideVariance([starter({ weekPoints: 18 })], { KC: { ...halfway, state: 'post', progress: 1 } }, now, now, 4), 0);
  const ended = start + gameMs;
  const final: LiveGame = { kickoff, state: 'post', detail: 'Final', progress: 1, endedAt: new Date(ended).toISOString() };
  const later = ended + 60 * 60 * 1000;
  const before = start - 2 * 24 * 60 * 60 * 1000;
  assert.equal(sideVariance([starter({ weekPoints: 18 })], { KC: final }, before, later, 4), full);
  assert.equal(sideVariance([starter({ weekPoints: 18 })], { KC: final }, later, later, 4), 0);
});

test('a live chance stays absent without a projection and is level or settled when nothing is left', () => {
  assert.equal(liveWinChance(null, 10, 1, 1), null);
  assert.equal(liveWinChance(10, null, 1, 1), null);
  assert.equal(liveWinChance(10, 10, 0, 0), 'level');
  assert.deepEqual(liveWinChance(11, 10, 0, 0), { left: 100, right: 0 });
  assert.deepEqual(liveWinChance(10, 11, 0, 0, 5, 0), { left: 100, right: 0 });
  const even = liveWinChance(100, 100, 25, 25);
  assert.deepEqual(even, { left: 50, right: 50 });
  const big = liveWinChance(130, 100, 25, 0);
  assert.deepEqual(big, { left: 99, right: 1 });
});

test('a fraction of a projected point does not flip the week between 100 and 0', () => {
  const before = start - 2 * 24 * 60 * 60 * 1000;
  const now = start + gameMs + 60 * 60 * 1000;
  const final: LiveGame = { kickoff, state: 'post', detail: 'Final', progress: 1, endedAt: new Date(start + gameMs).toISOString() };
  const games = { KC: final };
  const played = starter({ weekPoints: 20 });
  const first = Math.floor(before / 1000);
  const second = first + 360;
  const points = winChanceSeries(
    { t: [first, second], s: [0, 1], p: [91.56, 91.32] },
    { t: [first, second], s: [0, 0], p: [91.57, 91.57] },
    at => ({
      left: sideVariance([played], games, at, now, 4),
      right: sideVariance([starter({ name: 'Sam', weekPoints: 14 })], games, at, now, 4),
    }),
  );
  assert.equal(points.length, 2);
  for (const point of points) assert.ok(point.chance > 40 && point.chance < 60, String(point.chance));
  assert.ok(Math.abs(points[0].chance - points[1].chance) <= 2);
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

test('a replayed score line draws without a live projection', () => {
  const left = { t: [10, 20], s: [0, 12], p: [null, null] };
  const right = { t: [15, 20], s: [0, 9], p: [null, null] };
  assert.equal(recordedProjection(left), false);
  assert.equal(recordedProjection({ t: [10], s: [4], p: [18] }), true);
  assert.equal(winChanceSeries(left, right, () => ({ left: 0, right: 0 })).length, 0);
  const line = scoreLine(left, right, 3, 0);
  assert.deepEqual(line.map(point => [point.t, point.scoreLeft, point.scoreRight]), [[10, 3, null], [15, 3, 0], [20, 15, 9]]);
});

test('the current sample is added only when the score or projection changed', () => {
  const series = { t: [10], s: [null as number | null], p: [80 as number | null] };
  assert.equal(withNow(series, 20, null, 80), series);
  const next = withNow(series, 20, 4, 80);
  assert.deepEqual(next, { t: [10, 20], s: [null, 4], p: [80, 80] });
  assert.deepEqual(withNow(null, 20, null, null), null);
  assert.deepEqual(withNow(null, 20, null, 90), { t: [20], s: [null], p: [90] });
});
