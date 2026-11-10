import assert from 'node:assert/strict';
import test from 'node:test';
import { animateOnChange, chartMotionKey, flashOnChange } from '../src/changePulse.ts';

const point = { chance: 61, scoreLeft: 88.4, scoreRight: 71, projectedLeft: 112, projectedRight: 104 };

test('a chart animates on its first paint and when the latest values move', () => {
  const key = chartMotionKey('chance', point);
  assert.equal(key, '61');
  assert.equal(animateOnChange(null, key), true);
  assert.equal(animateOnChange(key, key), false);
  assert.equal(chartMotionKey('chance', { ...point, scoreLeft: 99 }), key);
  assert.equal(animateOnChange(key, chartMotionKey('chance', { ...point, chance: 64 })), true);
  assert.equal(chartMotionKey('score', point), chartMotionKey('score', { ...point, chance: 10 }));
  assert.notEqual(chartMotionKey('score', point), chartMotionKey('score', { ...point, scoreLeft: 90 }));
});

test('a highlight waits for a change after the first value', () => {
  assert.equal(flashOnChange(null, '12'), false);
  assert.equal(flashOnChange('12', '12'), false);
  assert.equal(flashOnChange('12', '14.5'), true);
  assert.equal(flashOnChange('', '8'), true);
});
