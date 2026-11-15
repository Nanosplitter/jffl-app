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
  assert.deepEqual(scorePopupText({
    scoreLines: [
      { label: 'Rush TD', points: 12, count: 2 },
      { label: 'Every 10 rush yards', points: 15, count: 15 },
      { label: 'Every 10 rec yards', points: 9, count: 9 },
    ],
    weekStats: { 'Rush yards': 153, 'Rec yards': 99, Receptions: 7 },
  }), ['2 Rush TD 12', '153 Rush yards, 1 per 10 15', '99 Rec yards, 1 per 10 9']);
  assert.deepEqual(scorePopupText({
    scoreLines: [{ label: 'Every 25 pass yards', points: 10, count: 10 }],
  }), ['250 Pass yards, 1 per 25 10']);
  assert.deepEqual(scorePopupText({
    scoreLines: [
      { label: 'Fumble recoveries', points: 2, count: 1 },
      { label: 'Sacks', points: 1, count: 1 },
      { label: 'defensive0PointsAllowed', points: 5, count: 1 },
      { label: 'defensiveLessThan100YardsAllowed', points: 5, count: 1 },
    ],
  }), ['1 Fumble recoveries 2', '1 Sacks 1', '0 points allowed 5', 'Under 100 yards allowed 5']);
});
