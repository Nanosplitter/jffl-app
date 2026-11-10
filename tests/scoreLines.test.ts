import assert from 'node:assert/strict';
import test from 'node:test';
import { scorePopupText } from '../src/scoreLines.ts';

test('a score popup lists the points ESPN paid and falls back to counting stats', () => {
  assert.deepEqual(scorePopupText({
    scoreLines: [
      { label: 'Rush yards', points: 8, count: 80 },
      { label: 'Rush TD', points: 6, count: 1 },
      { label: 'Receptions', points: 0, count: 5 },
    ],
    weekStats: { Targets: 9 },
  }), ['80 Rush yards 8', '1 Rush TD 6']);
  assert.deepEqual(scorePopupText({ scoreLines: [], weekStats: { 'Rush yards': 80 } }), ['No scoring stats yet.']);
  assert.deepEqual(scorePopupText({ weekStats: { 'Rush TD': 1, 'Rush yards': 80, Targets: 0 } }), ['80 Rush yards', '1 Rush TD']);
  assert.deepEqual(scorePopupText({ weekStats: {} }), ['No scoring stats yet.']);
});

test('counting stats use the league scoring rules until ESPN point lines arrive', () => {
  const rules = [
    { name: 'espnstat48', points: 1 },
    { name: 'Every 10 Rush Yards', points: 1 },
    { name: 'Every 25 Pass Yards', points: 1 },
    { name: 'Rec TD', points: 6 },
    { name: 'Pass TD', points: 4 },
    { name: 'Interceptions', points: -2 },
    { name: 'Extra Points', points: 1 },
    { name: 'Field Goals Under 40', points: 3 },
    { name: 'Field Goals 40-49', points: 4 },
  ];
  assert.deepEqual(scorePopupText({
    weekStats: { Receptions: 10, 'Rec yards': 164, 'Rec TD': 1, Targets: 10 },
  }, rules), ['164 Rec yards 16', '1 Rec TD 6']);
  assert.deepEqual(scorePopupText({
    weekStats: { Receptions: 4, Targets: 6 },
  }, rules), ['No scoring stats yet.']);
  assert.deepEqual(scorePopupText({
    weekStats: { 'Pass yards': 274, 'Pass TD': 1, Interceptions: 1, 'Rush yards': 6 },
  }, rules), ['274 Pass yards 10', '1 Pass TD 4', '1 Interceptions -2']);
  assert.deepEqual(scorePopupText({
    weekStats: { 'Extra points': 3, 'Field goals': 2 },
  }, rules), ['2 Field goals —', '3 Extra points 3']);
  assert.deepEqual(scorePopupText({
    scoreLines: [{ label: 'Rec yards', points: 16.4, count: 164 }],
    weekStats: { 'Rec yards': 164, Targets: 10 },
  }, rules), ['164 Rec yards 16.4']);
});
