import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoringLabel } from '../src/scoring.ts';

test('unnamed ESPN scoring ids use the rule they actually award', () => {
  assert.equal(scoringLabel('ESPN stat 8'), 'Every 25 pass yards');
  assert.equal(scoringLabel('ESPN stat 28'), 'Every 10 rush yards');
  assert.equal(scoringLabel('ESPN stat 48'), 'Every 10 rec yards');
  assert.equal(scoringLabel('ESPN stat 198'), 'Field goals 50-59');
  assert.equal(scoringLabel('ESPN stat 209'), '1-pt safety');
});

test('camelCase scoring names and the spaced form already on the site share one label', () => {
  assert.equal(scoringLabel('defensive2PtReturns'), 'Defensive 2-pt return');
  assert.equal(scoringLabel('defensive2Pt Returns'), 'Defensive 2-pt return');
  assert.equal(scoringLabel('passing2Pt Conversions'), 'Pass 2-pt conversion');
  assert.equal(scoringLabel('made Field Goals From Under40'), 'Field goals under 40');
  assert.equal(scoringLabel('made Field Goals From40To49'), 'Field goals 40-49');
  assert.equal(scoringLabel('madeFieldGoalsFrom60Plus'), 'Field goals 60+');
});

test('a scoring name that already reads clearly is left alone aside from camelCase gaps', () => {
  assert.equal(scoringLabel('Pass TD'), 'Pass TD');
  assert.equal(scoringLabel('fumbleReturnTouchdowns'), 'fumble Return Touchdowns');
});
