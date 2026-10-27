import assert from 'node:assert/strict';
import test from 'node:test';
import { ASK_EVENTS, countsAsPage, pageContext, screenName } from '../src/analytics.ts';

test('a deeper archive retry is its own event', () => {
  assert.equal(ASK_EVENTS.thinkHarder, 'ask_think_harder');
  assert.notEqual(ASK_EVENTS.thinkHarder, ASK_EVENTS.question);
});

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
  const blank = { manager: '', week: '' };
  assert.deepEqual(pageContext('/league/premier'), { screen: 'Premier League', screenClass: 'League', contentGroup: 'Leagues', league: 'premier', ...blank });
  assert.deepEqual(pageContext('/league/premier/team/3'), { screen: 'Team · Premier League · 3', screenClass: 'Team', contentGroup: 'Leagues', league: 'premier', ...blank });
  assert.deepEqual(pageContext('/league/premier/team/16'), { screen: 'Jason · Team', screenClass: 'Team', contentGroup: 'Leagues', league: 'premier', manager: 'Jason', week: '' });
  assert.deepEqual(pageContext('/league/championship/match/9'), { screen: 'Match · Championship · 9', screenClass: 'League match', contentGroup: 'Leagues', league: 'championship', ...blank });
  assert.deepEqual(pageContext('/matchday/championship/73'), { screen: 'Josh · Matchday', screenClass: 'Matchday', contentGroup: 'Matchday', league: 'championship', manager: 'Josh', week: '' });
  assert.deepEqual(pageContext('/matchday/championship/73', '?week=3'), { screen: 'Josh · Matchday · Week 3', screenClass: 'Matchday', contentGroup: 'Matchday', league: 'championship', manager: 'Josh', week: '3' });
  assert.deepEqual(pageContext('/players/4249084'), { screen: 'Player · 4249084', screenClass: 'Player', contentGroup: 'Players', league: '', ...blank });
  assert.deepEqual(pageContext('/cups/jffl/round/round-2/highlight/Ada'), { screen: 'Cup · JFFL Cup · round-2 · Ada', screenClass: 'Cups', contentGroup: 'Cups', league: '', ...blank });
  assert.deepEqual(pageContext('/cups/premier/match/12'), { screen: 'Cup match · Premier Cup · 12', screenClass: 'Cup match', contentGroup: 'Cups', league: 'premier', ...blank });
  assert.deepEqual(pageContext('/archive/ask/t/abc'), { screen: 'Saved chat', screenClass: 'Ask the archive', contentGroup: 'Archive', league: '', ...blank });
  assert.deepEqual(pageContext('/archive/managers/Ada%20Lovelace'), { screen: 'Manager · Ada Lovelace', screenClass: 'Manager', contentGroup: 'Archive', league: '', ...blank });
  assert.deepEqual(pageContext('/weekly/4'), { screen: 'Week 4', screenClass: 'Weekly roundup', contentGroup: 'Weekly', league: '', manager: '', week: '4' });
  assert.deepEqual(pageContext('/archive/weeks/3'), { screen: 'Week 3 in history', screenClass: 'Week in history', contentGroup: 'Archive', league: '', manager: '', week: '3' });
  assert.equal(pageContext('/archive/records/weekly').screen, 'Record book · Weekly');
  assert.equal(pageContext('/archive/records/jffl').screen, 'Record book · JFFL Cup');
  assert.equal(pageContext('/archive/records/bowl').screen, 'Record book · Superbowl');
  assert.equal(pageContext('/missing').contentGroup, 'Other');
  assert.equal(pageContext('/league/premier', '?week=3').week, '');
});

test('does not count routes that immediately redirect', () => {
  assert.equal(countsAsPage('/history/ask'), false);
  assert.equal(countsAsPage('/history/ask/share'), false);
  assert.equal(countsAsPage('/history/archive/records'), false);
  assert.equal(countsAsPage('/archive/ask'), true);
  assert.equal(countsAsPage('/'), true);
  assert.equal(countsAsPage('/weekly'), false);
  assert.equal(countsAsPage('/weekly/7'), true);
  assert.equal(countsAsPage('/weekly/0'), false);
  assert.equal(countsAsPage('/weekly/7', '?week=7'), false);
  assert.equal(countsAsPage('/archive/weeks'), false);
  assert.equal(countsAsPage('/archive/weeks/5'), true);
  assert.equal(countsAsPage('/archive/weeks/99'), false);
  assert.equal(countsAsPage('/archive/records'), false);
  assert.equal(countsAsPage('/archive/records/weekly'), true);
  assert.equal(countsAsPage('/archive/records/nope'), false);
  assert.equal(countsAsPage('/archive/rivals'), false);
  assert.equal(countsAsPage('/archive/rivals/SeanT/Wayne'), true);
  assert.equal(countsAsPage('/players', '?league=premier'), false);
  assert.equal(countsAsPage('/players/premier'), true);
  assert.equal(countsAsPage('/summary/nope'), false);
  assert.equal(countsAsPage('/summary/premier'), true);
  assert.equal(countsAsPage('/cups/jffl', '?manager=premier:16'), false);
  assert.equal(countsAsPage('/cups/jffl'), true);
});
