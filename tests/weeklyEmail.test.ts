import assert from 'node:assert/strict';
import { test } from 'node:test';
import { idleCupPlain, renderWeeklyEmail, type WeeklyEmail } from '../src/weeklyEmail.ts';

const email = (patch: Partial<WeeklyEmail> = {}): WeeklyEmail => ({
  week: 4,
  live: false,
  pageUrl: 'https://jffl-live-colin.web.app/weekly?week=4',
  extremes: [
    { label: 'High scorer', text: 'Reggie, 145 (League One)' },
    { label: 'Lowest-scoring winner', text: '—' },
  ],
  hundred: [{ person: { name: 'Ryan', slug: 'premier' }, score: '115' }],
  leagues: [{
    title: 'Premier League', ink: 'premier', span: null, empty: 'No matchups this week.',
    games: [{
      upset: true,
      sides: [
        { name: 'Ryan', slug: 'premier', mark: 3, score: '115', leading: true, miss: false, projected: null },
        { name: 'Donna <b>', slug: 'premier', mark: 1, score: '107', leading: false, miss: true, projected: '122' },
      ],
    }],
  }],
  cups: [{
    title: 'JFFL Cup', ink: 'jffl', span: 'Weeks 3 + 4', empty: 'No matches this week.',
    games: [{
      upset: false,
      sides: [
        { name: 'Chris', slug: 'premier', mark: 17, score: '149', leading: true, miss: false, projected: null },
        { name: 'Richie', slug: 'league-one', mark: 16, score: '122', leading: false, miss: false, projected: null },
      ],
    }],
  }],
  idleCups: [
    { title: 'Premier League Cup', ink: 'premier' },
    { title: 'Championship Cup', ink: 'championship' },
    { title: 'League One Cup', ink: 'league-one' },
  ],
  cupCount: 4,
  couldHave: [{
    manager: { name: 'Jason', slug: 'premier' }, opponent: { name: 'Donna <b>', slug: 'premier' },
    before: '98–107', after: '120–107',
    swaps: [{ outName: 'Sat Star', outPoints: '4', inName: 'Bench & Co', inPoints: '26' }],
  }],
  couldHaveEmpty: null,
  leaderboard: [{ rank: 1, person: { name: 'Reggie', slug: 'league-one' }, score: '145', result: 'Won' }],
  starters: [{ player: 'Test Runner', score: '32.5', managers: [{ name: 'Jason', slug: 'premier' }] }],
  starterEmpty: null,
  bench: [],
  benchEmpty: 'No scores yet.',
  ...patch,
});

test('the weekly email keeps league colors, an upset, and escapes names', () => {
  const { html, plain } = renderWeeklyEmail(email());
  assert.match(html, /<span class="ink-premier" style="color:#4f7a22;-webkit-text-fill-color:#4f7a22;">Ryan<\/span>/);
  assert.match(html, /<span class="ink-jffl"/);
  assert.match(html, /Donna &lt;b&gt;/);
  assert.match(html, /Upset · Donna &lt;b&gt; proj 122/);
  assert.match(html, /Weeks 3 \+ 4/);
  assert.match(html, /No matches this week: .*<span class="ink-championship"/);
  assert.match(html, /Sit Sat Star \(4\) for Bench &amp; Co \(26\)/);
  assert.match(html, /href="https:\/\/jffl-live-colin\.web\.app\/weekly\?week=4"/);
  assert.match(plain, /^JFFL Week 4/);
  assert.match(plain, /Final ESPN scores\./);
  assert.match(plain, /Lowest-scoring winner: —/);
  assert.match(plain, /3 Ryan 115 {4}1 Donna <b> 107 {4}Upset · Donna <b> proj 122/);
  assert.match(plain, /Jason would have scored 120–107 instead of 98–107 against Donna <b>\./);
  assert.match(plain, /Full roundup: https:\/\/jffl-live-colin\.web\.app\/weekly\?week=4/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(plain, /<span/);
});

test('a live week says so, and a quiet week does not invent an upset or a hundred', () => {
  const { html, plain } = renderWeeklyEmail(email({
    live: true,
    pageUrl: 'https://jffl-live-colin.web.app/weekly',
    extremes: [{ label: 'Lowest leading score', text: '—' }],
    hundred: [],
    leagues: [{ title: 'Premier League', ink: 'premier', span: null, empty: 'No matchups this week.', games: [] }],
    cups: [],
    idleCups: [
      { title: 'JFFL Cup', ink: 'jffl' },
      { title: 'Premier League Cup', ink: 'premier' },
      { title: 'Championship Cup', ink: 'championship' },
      { title: 'League One Cup', ink: 'league-one' },
    ],
    couldHave: null,
    couldHaveEmpty: 'Loading lineups…',
    leaderboard: [],
    starters: [],
    starterEmpty: 'Loading lineups…',
  }));
  assert.match(plain, /Live scores\. Leads and scoring extremes remain provisional\./);
  assert.match(plain, /Lowest leading score: —/);
  assert.match(plain, /100\+ club: none/);
  assert.match(plain, /No cup matches this week\./);
  assert.match(plain, /Loading lineups…/);
  assert.doesNotMatch(plain, /An upset is/);
  assert.doesNotMatch(html, /An upset is/);
  assert.match(html, /href="https:\/\/jffl-live-colin\.web\.app\/weekly"/);
  assert.doesNotMatch(plain, /\b0\b/);
});

test('the idle-cup sentence names the cups that sat out', () => {
  assert.equal(idleCupPlain([], 4), '');
  assert.equal(idleCupPlain(['JFFL Cup', 'Premier League Cup', 'Championship Cup', 'League One Cup'], 4), 'No cup matches this week.');
  assert.equal(idleCupPlain(['Premier League Cup', 'Championship Cup', 'League One Cup'], 4), 'No matches this week: Premier League Cup, Championship Cup, League One Cup.');
});
