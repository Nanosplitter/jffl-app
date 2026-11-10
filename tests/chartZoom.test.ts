import assert from 'node:assert/strict';
import test from 'node:test';
import { hasZoomWindow, keepDataZoom, zoomedYRange } from '../src/history/chartKit.ts';

const option = { dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16 }] };

test('a zoomed chart keeps its window when the option is replaced', () => {
  const plain = { series: [] as number[] };
  assert.equal(keepDataZoom(option, undefined), option);
  assert.equal(keepDataZoom(plain, [{ start: 20, end: 40 }]), plain);
  assert.deepEqual(keepDataZoom(option, [{ start: 0, end: 100 }]), option);
  assert.deepEqual(keepDataZoom(option, [{ start: 30, end: 70, startValue: 1000, endValue: 2000 }]), {
    dataZoom: [
      { type: 'inside', start: 30, end: 70 },
      { type: 'slider', height: 16, start: 30, end: 70 },
    ],
  });
  assert.equal(hasZoomWindow([{ start: 0, end: 100 }]), false);
  assert.equal(hasZoomWindow([{ start: 20, end: 80 }]), true);
  assert.equal(hasZoomWindow(undefined), false);
  const week = Array.from({ length: 11 }, (_, index) => [index * 10, index < 7 ? 70 : 92 + index] as const);
  const tight = zoomedYRange(week, 70, 100, { min: 0, max: 100 });
  assert.ok(tight && tight.min >= 85 && tight.max === 100 && tight.min < 99);
  assert.equal(zoomedYRange([[0, 22], [10, 22]], 0, 10)?.min, 21);
  assert.equal(zoomedYRange([], 0, 10), null);
  assert.deepEqual(keepDataZoom(option, [{ start: 10, end: 40 }]), {
    dataZoom: [
      { type: 'inside', start: 10, end: 40 },
      { type: 'slider', height: 16, start: 10, end: 40 },
    ],
  });
});
