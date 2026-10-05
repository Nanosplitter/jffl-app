import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fallbackBackLabel, rememberBack, type BackMap } from '../src/backStack.ts';

test('a pushed page remembers the page that opened it', () => {
  const home: BackMap = {};
  const match = rememberBack(home, 'PUSH', 'home', 'match', { path: '/', label: 'Home' });
  const team = rememberBack(match, 'PUSH', 'match', 'team', { path: '/league/premier/match/4-0', label: 'Jason vs Jeff' });
  assert.deepEqual(team.team, { path: '/league/premier/match/4-0', label: 'Jason vs Jeff' });
  assert.deepEqual(team.match, { path: '/', label: 'Home' });
});

test('returning does not erase the page you came from earlier', () => {
  const match = rememberBack({}, 'PUSH', 'home', 'match', { path: '/', label: 'Home' });
  const team = rememberBack(match, 'PUSH', 'match', 'team', { path: '/league/premier/match/4-0', label: 'Jason vs Jeff' });
  assert.deepEqual(team.match, { path: '/', label: 'Home' });
});

test('a replaced route keeps the origin of the route it replaced', () => {
  const match = rememberBack({}, 'PUSH', 'home', 'old', { path: '/', label: 'Home' });
  const replaced = rememberBack(match, 'REPLACE', 'old', 'new', { path: '/history/ask', label: 'Ask' });
  assert.deepEqual(replaced.new, { path: '/', label: 'Home' });
  assert.equal(replaced.old, undefined);
});

test('fallback names follow the route', () => {
  assert.equal(fallbackBackLabel('/'), 'Home');
  assert.equal(fallbackBackLabel('/weekly'), 'Weekly roundup');
  assert.equal(fallbackBackLabel('/league/premier'), 'Premier League');
  assert.equal(fallbackBackLabel('/league/premier/match/4-0'), 'Premier League match');
  assert.equal(fallbackBackLabel('/cups/jffl'), 'JFFL Cup');
});
