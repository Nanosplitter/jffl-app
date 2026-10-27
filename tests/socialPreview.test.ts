import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildCup } from '../src/competitions.ts';
import { handlePage } from '../functions-social/src/http.ts';
import {
  DEFAULT_DESCRIPTION, DEFAULT_TITLE, GALLERY_LABELS, ASK_SAMPLE_PATH, escapeHtml, galleryEntries, injectSocialMeta,
  previewReads, requestOrigin, resolvePreview, staticShellPaths,
} from '../src/socialPreview.ts';
import type { LeagueSummary } from '../src/types.ts';

const summaries = JSON.parse(readFileSync(new URL('./fixtures/week3-summaries.json', import.meta.url), 'utf8')) as { premier: LeagueSummary };
const rosters = JSON.parse(readFileSync(new URL('./fixtures/week3-rosters.json', import.meta.url), 'utf8'));
const shell = '<!doctype html><html><head><title>Old</title><meta name="description" content="old"><meta property="og:title" content="old"></head><body><div id="root"></div></body></html>';

test('the checked-in page shell uses the default preview copy', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /Follow all three JFFL leagues/);
  assert.match(html, /property="og:site_name"/);
  assert.match(html, /name="twitter:image:alt"/);
});

test('describes the home page and keeps one complete metadata set', () => {
  const preview = resolvePreview('/');
  assert.equal(preview.title, DEFAULT_TITLE);
  assert.equal(preview.description, DEFAULT_DESCRIPTION);
  assert.equal(preview.dynamic, false);
  assert.equal(preview.facts.some(fact => /top tier/i.test(fact.value)), false);
  const html = injectSocialMeta(shell, preview, 'https://jffl.org');
  assert.equal(html.match(/property="og:title"/g)?.length, 1);
  assert.equal(html.match(/name="twitter:image"/g)?.length, 1);
  assert.match(html, /property="og:image:type" content="image\/png"/);
  assert.match(html, /rel="canonical" href="https:\/\/jffl.org\/"/);
  assert.doesNotMatch(html, /<title>Old<\/title>/);
});

test('builds a league match preview without turning a missing score into zero', () => {
  const live = resolvePreview('/league/premier/match/3-12', '', { leagues: summaries });
  assert.equal(live.title, 'Jason 79–112 Donna · Week 3 | JFFL');
  assert.equal(live.sides[0].score, '79');
  assert.equal(live.sides[1].score, '112');
  assert.equal(live.status, 'Live');

  const pending = summary();
  pending.weeklyMatchups = [{ id: '9-1', week: 9, status: 'pending', homeTeamId: '34', awayTeamId: '16', homeScore: null, awayScore: null, homeProjected: 101.5, awayProjected: 98.2 }];
  const preview = resolvePreview('/league/premier/match/9-1', '', { leagues: { premier: pending } });
  assert.match(preview.title, /^Jason vs Donna · Week 9/);
  assert.equal(preview.sides[0].score, null);
  assert.equal(preview.sides[1].score, null);
  assert.match(preview.subline, /Projected/);
  assert.match(preview.sides[0].odds ?? '', /% to win/);
  assert.match(preview.sides[1].odds ?? '', /% to win/);
  assert.doesNotMatch(`${preview.title} ${preview.description} ${preview.subline}`, /\b0\b/);
});

test('a cup bye stays off the matchday preview', () => {
  const preview = resolvePreview('/matchday/premier/16?week=3', '', { leagues: summaries });
  assert.match(preview.title, /Jason · Matchday · Week 3/);
  assert.doesNotMatch(preview.description, /TBD/);
});

test('uses rank and record only when the snapshot has them', () => {
  const preview = resolvePreview('/league/premier/team/16', '', { leagues: summaries });
  assert.equal(preview.title, 'Jason · Hot Machete | JFFL');
  assert.deepEqual(preview.facts.map(fact => fact.value), ['1st', '2-0', '231']);
  const unknown = resolvePreview('/league/premier/team/missing', '', { leagues: { premier: summary() } });
  assert.equal(unknown.headline, 'Team');
  assert.deepEqual(unknown.facts, []);
});

test('names a rostered player and a week leader', () => {
  const player = resolvePreview('/players/9001', '', { leagues: summaries, rosters });
  assert.equal(player.headline, 'Test Quarterback');
  assert.match(player.description, /rostered by Jason/);
  assert.equal(player.facts.find(fact => fact.label === 'Week 3')?.value, '12');
  assert.equal(player.facts.find(fact => fact.label === 'Team')?.value, 'KC');
  assert.match(player.facts.find(fact => fact.label === 'Team')?.logoUrl ?? '', /\/teamlogos\/nfl\/500\/kc\.png$/);
  const home = resolvePreview('/', '', { leagues: summaries });
  assert.equal(home.facts.find(fact => fact.label === 'Premier')?.value, 'Jason');
  assert.doesNotMatch(home.facts.map(fact => fact.value).join(' '), /Top tier/);
  const table = resolvePreview('/summary', '', { leagues: summaries });
  assert.equal(table.layout, 'board');
  assert.equal(table.lines.find(line => line.group === 'Premier' && line.mark === '1')?.name, 'Jason');
  const cups = resolvePreview('/cups', '', { leagues: summaries });
  assert.deepEqual(cups.lines.map(line => line.name), ['JFFL Cup', 'Premier League Cup', 'Championship Cup', 'League One Cup']);
  assert.doesNotMatch(`${cups.headline} ${cups.description}`, /bracket room/i);
  const history = resolvePreview('/history', '', { leagues: summaries });
  assert.equal(history.headline, 'Trophy history');
  assert.doesNotMatch(`${history.headline} ${history.subline}`, /Thirteen trophies/);
  assert.equal(history.lines[0]?.mark, '1');
  const week = resolvePreview('/weekly/3', '', { leagues: summaries });
  assert.equal(week.headline, 'Week 3 roundup');
  assert.ok(week.lines.length >= 3);
  assert.equal(week.lines[0]?.logoUrl, null);
  assert.ok(week.lines.some(line => line.group === 'Extremes' && line.name === 'Closest'));
  assert.equal(resolvePreview(ASK_SAMPLE_PATH).status, 'Shared answer');
  const day = resolvePreview('/matchday/premier/34?week=3', '', { leagues: summaries });
  assert.equal(day.layout, 'slate');
  assert.equal(day.bouts.length, 2);
  assert.match(day.bouts.map(bout => bout.label).join(' '), /JFFL Cup/);
  assert.doesNotMatch(day.description, /TBD/);
  const withStats = structuredClone(rosters);
  withStats.premier.players[0].weekStats = { 'Pass yards': 275, 'Pass TD': 2, 'Pass attempts': 30 };
  const playing = resolvePreview('/players/9001', '', { leagues: summaries, rosters: withStats, games: { KC: { opponent: 'BAL', kickoff: '2026-09-28T00:20:00Z' } } });
  assert.equal(playing.facts.find(fact => fact.label === 'Pass yards')?.value, '275');
  assert.match(playing.subline, /vs BAL/);
  const ask = resolvePreview(ASK_SAMPLE_PATH);
  assert.match(ask.subline, /JFFL Cup titles/);
  assert.equal(week.dynamic, true);
});

test('a matchday picture keeps the saved score and win-chance lines', () => {
  const match = summaries.premier.weeklyMatchups?.find(item => item.week === 3 && [item.homeTeamId, item.awayTeamId].includes('34'));
  assert.ok(match?.awayTeamId && match.homeTeamId);
  const opponent = match.homeTeamId === '34' ? match.awayTeamId : match.homeTeamId;
  const mine = match.homeTeamId === '34' ? match.homeScore : match.awayScore;
  const theirs = match.homeTeamId === '34' ? match.awayScore : match.homeScore;
  const start = Date.parse('2026-09-27T17:00:00Z');
  const t = [0, 1, 2, 3].map(hour => Math.floor(start / 1000) + hour * 3600);
  const samples = (score: number | null, other: boolean, projected: number) => ({
    t,
    s: other ? [0, 10, score == null ? null : score / 2, score] : [0, null, score == null ? null : score / 2, score],
    p: [projected, projected, projected, projected],
  });
  const lineup = (teamId: string, proTeam: string) => ({ week: 3, teamId, players: [{ id: `${teamId}-rb`, name: 'Back', position: 'RB', proTeam, slot: 'RB', points: 10 }] });
  const game = (opponentName: string) => ({ kickoff: '2026-09-27T17:00:00Z', state: 'post' as const, detail: 'Final', progress: 1, opponent: opponentName, endedAt: '2026-09-27T20:15:00Z' });
  const preview = resolvePreview('/matchday/premier/34?week=3', '', {
    leagues: summaries,
    rosters: { premier: { ...rosters.premier, weeklyLineups: [lineup('34', 'IND'), lineup(opponent, 'HOU')] } },
    timeline: {
      premier: {
        series: { 34: samples(mine, false, 110), [opponent]: samples(theirs, true, 90) },
        games: { IND: game('HOU'), HOU: game('IND') },
      },
    },
  });
  const chart = preview.bouts[0]?.chart;
  assert.ok(chart);
  assert.equal(chart.scoreLeft.at(-1), mine);
  assert.equal(chart.scoreRight.at(-1), theirs);
  assert.equal(chart.scoreLeft[1], null);
  assert.ok(chart.scoreLeft[1] !== 0);
  assert.ok(chart.chance.length >= 2);
  assert.ok(chart.chance.every(value => value != null && value >= 1 && value <= 100));
  assert.equal(resolvePreview('/matchday/premier/34?week=3', '', { leagues: summaries }).bouts[0]?.chart ?? null, null);
});

test('league and cup match pictures use the saved lines for that week', () => {
  const match = summaries.premier.weeklyMatchups?.find(item => item.week === 3 && item.homeTeamId && item.awayTeamId && item.homeScore != null && item.awayScore != null);
  assert.ok(match?.homeTeamId && match.awayTeamId);
  const start = Date.parse('2026-09-27T17:00:00Z');
  const t = [0, 1, 2, 3].map(hour => Math.floor(start / 1000) + hour * 3600);
  const line = (score: number | null, projected: number) => ({ t, s: [0, score == null ? null : score / 2, score == null ? null : score / 2, score], p: [projected, projected, projected, projected] });
  const lineup = (teamId: string) => ({ week: 3, teamId, players: [{ id: `${teamId}-rb`, name: 'Back', position: 'RB', proTeam: 'IND', slot: 'RB', points: 8 }] });
  const game = { kickoff: '2026-09-27T17:00:00Z', state: 'post' as const, detail: 'Final', progress: 1, opponent: 'HOU', endedAt: '2026-09-27T20:15:00Z' };
  const data = {
    leagues: summaries,
    rosters: { premier: { ...rosters.premier, weeklyLineups: [lineup(match.awayTeamId), lineup(match.homeTeamId)] } },
    timelineWeek: 3,
    timeline: { premier: { series: { [match.awayTeamId]: line(match.awayScore, 100), [match.homeTeamId]: line(match.homeScore, 110) }, games: { IND: game, HOU: game } } },
  };
  const preview = resolvePreview(`/league/premier/match/${match.id}`, '', data);
  assert.equal(preview.chart?.scoreLeft.at(-1), match.awayScore);
  assert.equal(preview.chart?.scoreRight.at(-1), match.homeScore);
  assert.ok((preview.chart?.chance.length ?? 0) >= 2);
  assert.equal(resolvePreview(`/league/premier/match/${match.id}`, '', { ...data, timelineWeek: 7 }).chart ?? null, null);
  const cup = buildCup('jffl', summaries);
  const tie = cup.rounds.flatMap(round => round.matches).find(item => item.a.participant && item.b.participant && item.status !== 'bye');
  assert.ok(tie?.a.participant && tie.b.participant);
  const left = tie.a.participant;
  const right = tie.b.participant;
  const games = { IND: game, HOU: game };
  const cupData = {
    ...data,
    rosters: {
      [left.slug]: { ...(rosters[left.slug] ?? rosters.premier), slug: left.slug, weeklyLineups: [lineup(left.teamId), lineup(right.teamId)] },
      [right.slug]: { ...(rosters[right.slug] ?? rosters.premier), slug: right.slug, weeklyLineups: [lineup(left.teamId), lineup(right.teamId)] },
    },
    timeline: {
      [left.slug]: { series: { [left.teamId]: line(40, 90), [right.teamId]: line(55, 100) }, games },
      [right.slug]: { series: { [left.teamId]: line(40, 90), [right.teamId]: line(55, 100) }, games },
    },
  };
  const cupPreview = resolvePreview(`/cups/jffl/match/${tie.id}`, '', cupData);
  assert.ok((cupPreview.chart?.scoreLeft.length ?? 0) >= 2);
  assert.ok((cupPreview.chart?.chance.length ?? 0) >= 2);
});

test('matches the cup page for the same snapshot', () => {
  const cup = buildCup('jffl', summaries);
  const located = cup.rounds.flatMap(round => round.matches.map(match => ({ round, match }))).find(item => item.match.a.participant && item.match.b.participant);
  assert.ok(located);
  const preview = resolvePreview(`/cups/jffl/match/${located.match.id}`, '', { leagues: summaries });
  assert.equal(preview.sides[0].name, located.match.a.participant?.manager);
  assert.equal(preview.sides[1].name, located.match.b.participant?.manager);
  assert.match(preview.kicker, new RegExp(located.round.name));
});

test('keeps shared answers short and private chats generic', () => {
  const attack = '<script>alert("x")</script> & friends';
  const share = resolvePreview('/archive/ask/s/abcdefghij123456', '', { share: { title: attack, createdAt: '2026-10-26T00:00:00.000Z' } });
  assert.equal(share.description, 'A shared answer from Ask the archive.');
  assert.doesNotMatch(share.description, /alert/);
  const html = injectSocialMeta(shell, share);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  const long = resolvePreview('/archive/ask/s/abcdefghij123456', '', { share: { title: 'Q'.repeat(300) } });
  assert.ok(long.title.length < 120);

  const secret = 'secret-thread-id';
  const chat = resolvePreview(`/archive/ask/t/${secret}`);
  assert.equal(chat.robots, 'noindex');
  assert.equal(chat.path, '/archive/ask');
  assert.doesNotMatch(`${chat.title} ${chat.description} ${chat.imagePath}`, new RegExp(secret));
  assert.equal(resolvePreview('/archive/ask/share').kind, 'ask');
});

test('asks only for the public documents a link needs', () => {
  assert.deepEqual(previewReads('/league/premier/team/16'), { leagues: ['premier'], rosters: [], shareId: null });
  assert.deepEqual(previewReads('/').leagues, ['premier', 'championship', 'league-one']);
  assert.deepEqual(previewReads('/summary').leagues, ['premier', 'championship', 'league-one']);
  assert.deepEqual(previewReads('/archive/ask/s/abcdefghij123456').shareId, 'abcdefghij123456');
  assert.equal(previewReads('/archive/ask/s/<script>').shareId, null);
  assert.deepEqual(previewReads('/archive/ask/t/abcdefghij123456'), { leagues: [], rosters: [], shareId: null });
  assert.ok(staticShellPaths().includes('/league/premier'));
  assert.ok(staticShellPaths().includes('/cups/jffl/round/round-1'));
  assert.equal(staticShellPaths().some(path => path.includes('/team/')), false);
});

test('lists every preview a reviewer needs and escapes text', () => {
  assert.deepEqual(galleryEntries({ leagues: summaries, rosters }).map(entry => entry.label), [...GALLERY_LABELS]);
  assert.equal(galleryEntries()[9].path, ASK_SAMPLE_PATH);
  assert.equal(escapeHtml(`<>"'&`), '&lt;&gt;&quot;&#39;&amp;');
  assert.equal(requestOrigin('jffl.org', 'https'), 'https://jffl.org');
  assert.equal(requestOrigin('127.0.0.1:4177', 'http'), 'http://127.0.0.1:4177');
});

test('injects metadata for a dynamic page without reading past the supplied snapshot', async () => {
  const result = await handlePage('/league/premier/team/16', '', 'jffl.org', 'https', {
    async league() { return summaries.premier; },
    async roster() { throw new Error('roster was not needed'); },
    async share() { throw new Error('share was not needed'); },
  }, async () => shell);
  assert.equal(result.status, 200);
  assert.match(String(result.body), /Jason · Hot Machete/);
  assert.match(String(result.body), /og:image" content="https:\/\/jffl.org\/__social\/card\.png\?path=/);
});

function summary(): LeagueSummary {
  return {
    schemaVersion: 1, leagueId: '831337', slug: 'premier', leagueName: 'Premier League', season: 2026, week: 3,
    updatedAt: '2026-09-29T00:00:00.000Z', lastAttemptAt: '2026-09-29T00:00:00.000Z', refreshStatus: 'ok',
    teams: [
      { id: '16', name: 'Hot Machete', abbreviation: 'JAY', rank: null, wins: null, losses: null, ties: null, pointsFor: null, pointsAgainst: null, rosterCount: 16 },
      { id: '34', name: 'Hockeytown', abbreviation: 'DON', rank: null, wins: null, losses: null, ties: null, pointsFor: null, pointsAgainst: null, rosterCount: 16 },
    ],
    matchups: [], scoring: [],
  };
}
