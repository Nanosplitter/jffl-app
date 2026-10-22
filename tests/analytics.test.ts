import assert from 'node:assert/strict';
import test from 'node:test';
import { countsAsPage, pageContext, screenName } from '../src/analytics.ts';

test('names the main pages people open', () => {
  assert.equal(screenName('/'), 'Leagues');
  assert.equal(screenName('/league/premier'), 'League');
  assert.equal(screenName('/league/premier/team/3'), 'Team');
  assert.equal(screenName('/league/championship/match/9'), 'League match');
  assert.equal(screenName('/matchday'), 'Matchday');
  assert.equal(screenName('/matchday/league-one/4'), 'Matchday');
  assert.equal(screenName('/players'), 'Players');
  assert.equal(screenName('/players/premier'), 'Players');
  assert.equal(screenName('/players/4249084'), 'Player');
  assert.equal(screenName('/summary/championship'), 'Standings');
  assert.equal(screenName('/weekly/4'), 'Weekly roundup');
  assert.equal(screenName('/cups/jffl'), 'Cups');
  assert.equal(screenName('/cups/jffl/match/12'), 'Cup match');
  assert.equal(screenName('/history/cup/premier'), 'Cup history');
  assert.equal(screenName('/history/premier'), 'History');
  assert.equal(screenName('/archive'), 'Archive');
  assert.equal(screenName('/archive/ask/t/abc'), 'Ask the archive');
  assert.equal(screenName('/archive/records/scoring'), 'Record book');
  assert.equal(screenName('/archive/titles'), 'Titles');
  assert.equal(screenName('/archive/rivals/a/b'), 'Rivals');
  assert.equal(screenName('/archive/managers'), 'Managers');
  assert.equal(screenName('/archive/managers/Ada'), 'Manager');
  assert.equal(screenName('/archive/draft'), 'Draft');
  assert.equal(screenName('/archive/weeks/3'), 'Week in history');
  assert.equal(screenName('/missing'), 'Not found');
});

test('names the exact screen and the league it belongs to', () => {
  assert.deepEqual(pageContext('/league/premier'), { screen: 'Premier League', screenClass: 'League', contentGroup: 'Leagues', league: 'premier' });
  assert.deepEqual(pageContext('/league/premier/team/3'), { screen: 'Team · Premier League · 3', screenClass: 'Team', contentGroup: 'Leagues', league: 'premier' });
  assert.deepEqual(pageContext('/league/championship/match/9'), { screen: 'Match · Championship · 9', screenClass: 'League match', contentGroup: 'Leagues', league: 'championship' });
  assert.deepEqual(pageContext('/players/4249084'), { screen: 'Player · 4249084', screenClass: 'Player', contentGroup: 'Players', league: '' });
  assert.deepEqual(pageContext('/cups/jffl/round/round-2/highlight/Ada'), { screen: 'Cup · JFFL Cup · round-2 · Ada', screenClass: 'Cups', contentGroup: 'Cups', league: '' });
  assert.deepEqual(pageContext('/cups/premier/match/12'), { screen: 'Cup match · Premier Cup · 12', screenClass: 'Cup match', contentGroup: 'Cups', league: 'premier' });
  assert.deepEqual(pageContext('/archive/ask/t/abc'), { screen: 'Saved chat', screenClass: 'Ask the archive', contentGroup: 'Archive', league: '' });
  assert.deepEqual(pageContext('/archive/managers/Ada%20Lovelace'), { screen: 'Manager · Ada Lovelace', screenClass: 'Manager', contentGroup: 'Archive', league: '' });
  assert.deepEqual(pageContext('/weekly/4'), { screen: 'Week 4', screenClass: 'Weekly roundup', contentGroup: 'Weekly', league: '' });
  assert.equal(pageContext('/missing').contentGroup, 'Other');
});

test('does not count routes that immediately redirect', () => {
  assert.equal(countsAsPage('/history/ask'), false);
  assert.equal(countsAsPage('/history/ask/share'), false);
  assert.equal(countsAsPage('/history/archive/records'), false);
  assert.equal(countsAsPage('/archive/ask'), true);
  assert.equal(countsAsPage('/'), true);
});
