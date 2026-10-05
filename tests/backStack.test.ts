import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrive, emptyTrail, fallbackBackLabel, fallbackBackTarget, type BackTrailState } from '../src/backStack.ts';

const home = { path: '/', label: 'Home' };
const match = { path: '/league/premier/match/4-0', label: 'Jason vs Jeff' };
const team = { path: '/league/premier/team/16', label: 'Jason' };

test('a pushed page remembers the page that opened it', () => {
  const atMatch = arrive(emptyTrail(), match.path, 'push', home);
  const atTeam = arrive(atMatch, team.path, 'push', match);
  assert.deepEqual(atTeam.stack, [home, match]);
  assert.equal(atTeam.here, team.path);
});

test('returning leaves the earlier page in place', () => {
  const atMatch = arrive(emptyTrail(), match.path, 'push', home);
  const atTeam = arrive(atMatch, team.path, 'push', match);
  const back = arrive(atTeam, match.path, 'pop', team);
  assert.deepEqual(back.stack, [home]);
  assert.equal(back.here, match.path);
});

test('a replaced route keeps the origin of the route it replaced', () => {
  const atMatch = arrive(emptyTrail(), match.path, 'push', home);
  const replaced = arrive(atMatch, '/archive/ask', 'replace', null);
  assert.deepEqual(replaced.stack, [home]);
  assert.equal(replaced.here, '/archive/ask');
});

test('a full page load from another page keeps that page', () => {
  const opened = arrive(emptyTrail(), match.path, 'load', home);
  assert.deepEqual(opened, { stack: [home], here: match.path });
});

test('a direct visit starts a new trail', () => {
  const prior: BackTrailState = { stack: [home], here: match.path };
  const typed = arrive(prior, '/weekly', 'load', null);
  assert.deepEqual(typed, { stack: [], here: '/weekly' });
});

test('reloading keeps the page that opened this one', () => {
  const prior: BackTrailState = { stack: [home], here: match.path };
  assert.deepEqual(arrive(prior, match.path, 'reload', null), prior);
});

test('going forward records the page that was left', () => {
  const atHome: BackTrailState = { stack: [], here: home.path };
  const forward = arrive(atHome, match.path, 'pop', home);
  assert.deepEqual(forward.stack, [home]);
  assert.equal(forward.here, match.path);
});

test('seeing the same page again does not grow the trail', () => {
  const atMatch = arrive(emptyTrail(), match.path, 'push', home);
  assert.equal(arrive(atMatch, match.path, 'push', home), atMatch);
});

test('fallback names follow the route', () => {
  assert.equal(fallbackBackLabel('/'), 'Home');
  assert.equal(fallbackBackLabel('/weekly'), 'Weekly roundup');
  assert.equal(fallbackBackLabel('/league/premier'), 'Premier League');
  assert.equal(fallbackBackLabel('/league/premier/match/4-0'), 'Premier League match');
  assert.equal(fallbackBackLabel('/cups/jffl'), 'JFFL Cup');
  assert.equal(fallbackBackLabel('/archive/records'), 'Record book');
});

test('a direct visit still has a sensible place to go', () => {
  assert.equal(fallbackBackTarget('/'), null);
  assert.equal(fallbackBackTarget('/weekly'), null);
  assert.deepEqual(fallbackBackTarget('/league/premier'), { to: '/', label: 'All leagues' });
  assert.deepEqual(fallbackBackTarget('/league/premier/match/4-0'), { to: '/league/premier', label: 'Premier League' });
  assert.deepEqual(fallbackBackTarget('/archive/managers/Jeff'), { to: '/archive/managers', label: 'All managers' });
  assert.deepEqual(fallbackBackTarget('/archive/records'), { to: '/archive', label: 'Archive' });
});
