import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildCup, type SummaryMap } from '../src/competitions.ts';
import { runAgent, type ModelLike, type ModelResponse } from '../src/history/askAgent.ts';
import { describeCard, isCardSpec, managerLinks, MAX_CARDS, nameMatcher, resolveCard, splitNames, type CardSpec } from '../src/history/askCards.ts';
import { createSession } from '../src/history/askRuntime.ts';
import { createContext, runDataTool } from '../src/history/askTools.ts';
import { withFutureWeeks } from './futureWeeks.ts';
import { deserialize, serialize } from '../src/history/askStore.ts';
import { buildLiveSeason } from '../src/history/liveSeason.ts';
import { decodeShare, encodeShare } from '../src/history/share.ts';
import { parseArchive, type ArchiveFile } from '../src/history/stats.ts';

const read = <T>(path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
const summaries = read<SummaryMap>('./fixtures/week3-summaries.json');
const history = parseArchive(read<ArchiveFile>('../src/history/archive.json'));

const resolved = (args: Record<string, unknown>) => {
  const result = resolveCard(summaries, args);
  assert.ok(result.ok, JSON.stringify(result));
  return result;
};

test('a matchup card defaults to the current week and links to the scoreboard match', () => {
  const card = resolved({ kind: 'matchup', manager: 'jason' });
  assert.deepEqual(card.spec, { kind: 'matchup', league: 'premier', week: 3, teamId: '16' });
  assert.equal(card.text.url, '/league/premier/match/3-1');
  assert.match(card.text.facts, /Jason 79, Donna 112 \(in progress/);
});

test('an earlier week uses the weekly result and the opponent is checked', () => {
  const card = resolved({ kind: 'matchup', manager: 'Jason', week: 1, opponent: 'Chris' });
  assert.equal(card.text.url, '/league/premier/match/1-4');
  assert.match(card.text.facts, /\(final\)/);
  const wrong = resolveCard(summaries, { kind: 'matchup', manager: 'Jason', week: 1, opponent: 'Donna' });
  assert.equal(wrong.ok, false);
  assert.match((wrong as { error: string }).error, /plays Chris/);
  assert.equal(resolveCard(summaries, { kind: 'matchup', manager: 'Jason', week: 9 }).ok, false);
});

test('a cup card picks the live match, then the next one, and rejects the wrong league cup', () => {
  const cup = buildCup('jffl', summaries);
  const live = cup.rounds[0].matches.find(match => match.status === 'live' && match.a.participant)!;
  const card = resolved({ kind: 'cup_match', manager: live.a.participant!.manager });
  assert.deepEqual(card.spec, { kind: 'cup_match', cup: 'jffl', matchId: live.id });
  // Jason has a JFFL bye, so his next match is the Premier Cup quarterfinal in week 5, before JFFL round 2 in weeks 6 and 7.
  assert.deepEqual(resolved({ kind: 'cup_match', manager: 'Jason' }).spec, { kind: 'cup_match', cup: 'premier', matchId: 'premier-1-0' });
  assert.deepEqual(resolved({ kind: 'cup_match', manager: 'Jason', cup: 'JFFL Cup' }).spec, { kind: 'cup_match', cup: 'jffl', matchId: 'jffl-1-4' });
  assert.equal(resolveCard(summaries, { kind: 'cup_match', manager: 'Jason', cup: 'League One' }).ok, false);
});

test('team and standings cards resolve from names, and unknown values stay unknown', () => {
  assert.deepEqual(resolved({ kind: 'team', manager: 'Jason' }).spec, { kind: 'team', league: 'premier', teamId: '16' });
  assert.deepEqual(resolved({ kind: 'standings', league: 'league one' }).spec, { kind: 'standings', league: 'league-one' });
  assert.deepEqual(resolved({ kind: 'standings', manager: 'J-Seitz' }).spec, { kind: 'standings', league: 'league-one' });
  const future = describeCard(summaries, { kind: 'cup_match', cup: 'premier', matchId: 'premier-1-0' })!;
  assert.match(future.facts, /no score yet/);
  assert.doesNotMatch(future.facts, /\b0\b/);
});

test('bad requests explain themselves and nothing is shown without live data', () => {
  assert.match((resolveCard(summaries, { kind: 'poster' }) as { error: string }).error, /kind must be/);
  assert.match((resolveCard(summaries, { kind: 'team', manager: 'Nobody' }) as { error: string }).error, /not a manager/);
  assert.match((resolveCard({}, { kind: 'team', manager: 'Jason' }) as { error: string }).error, /not loaded/);
  assert.equal(describeCard(summaries, { kind: 'team', league: 'premier', teamId: '999' }), null);
});

test('a matchup card can show a scheduled future week, with no scores or projections', () => {
  const future = withFutureWeeks(summaries, [4, 5]);
  const result = resolveCard(future, { kind: 'matchup', manager: 'Jason', week: 5 });
  assert.ok(result.ok);
  assert.match(result.text.url, /^\/league\/premier\/match\/5-\d+$/);
  assert.match(result.text.facts, /no score yet.*no score yet \(not started\)$/);
  assert.equal(resolveCard(future, { kind: 'matchup', manager: 'Jason', week: 6 }).ok, false);
});

test('the schedule tool lists upcoming league games and cup ties for a manager', () => {
  const ctx = createContext({ ...history, live: buildLiveSeason(withFutureWeeks(summaries, [4, 5])) });
  const outcome = runDataTool(ctx, 'schedule', { manager: 'jason' });
  assert.ok(outcome.ok && 'rows' in outcome);
  assert.equal(outcome.title, '2026 schedule, weeks 3-5');
  const league = outcome.rows.filter(row => row.type === 'Season').map(row => [row.week, row.status, row.score]);
  assert.deepEqual(league, [['3', 'live', 79], ['4', 'scheduled', null], ['5', 'scheduled', null]]);
  assert.ok(outcome.rows.some(row => row.type === 'Cup' && row.round === 'Premier League Cup Quarterfinals' && row.opponent === 'Ryan'));
  assert.ok(outcome.caveats.some(text => /Scores are null/.test(text)));
  const cupsOnly = runDataTool(ctx, 'schedule', { league: 'JFFL', fromWeek: 6, toWeek: 7 });
  assert.ok(cupsOnly.ok && 'rows' in cupsOnly && cupsOnly.rows.length > 0 && cupsOnly.rows.every(row => row.league === 'JFFL' && row.week === '6-7'));
  assert.equal(runDataTool(ctx, 'schedule', { manager: 'Nobody' }).ok, false);
  assert.equal(runDataTool(createContext(history), 'schedule', {}).ok, false);
});

test('stored card recipes are shape-checked', () => {
  const good: CardSpec[] = [
    { kind: 'matchup', league: 'premier', week: 3, teamId: '16' },
    { kind: 'cup_match', cup: 'jffl', matchId: 'jffl-0-1' },
    { kind: 'team', league: 'championship', teamId: '4' },
    { kind: 'standings', league: 'league-one' },
  ];
  for (const spec of good) assert.ok(isCardSpec(spec));
  for (const spec of [null, { kind: 'team', league: 'nfl', teamId: '1' }, { kind: 'matchup', league: 'premier', week: 1.5, teamId: '1' }, { kind: 'cup_match', cup: 'jffl', matchId: '<script>' }, { kind: 'standings' }]) {
    assert.equal(isCardSpec(spec), false);
  }
  const text = serialize({ messages: [{ id: 'a', role: 'assistant', text: 'x', charts: [], followUps: [], cards: [{ id: 'k1', spec: good[0] }, { id: 'k2', spec: { kind: 'evil' } as unknown as CardSpec }] }], contents: [], sources: [] })!;
  assert.deepEqual(deserialize(text)!.messages[0].cards, [{ id: 'k1', spec: good[0] }]);
});

test('share links carry valid card recipes only', async () => {
  const encoded = await encodeShare({ v: 1, a: 'x', c: [{ spec: { type: 'h2h_scoreboard', title: 't', params: { a: 'Jeff', b: 'Jason' } } as never, sources: [] }], k: [{ kind: 'standings', league: 'premier' }, { kind: 'bad' } as unknown as CardSpec] });
  const decoded = await decodeShare(encoded);
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.payload.k, [{ kind: 'standings', league: 'premier' }]);
});

test('names link once, whole words only, longest name first', () => {
  const links = managerLinks(['Jeff', 'Seitz', 'Jason']);
  assert.equal(links.get('Jason'), '/league/premier/team/16');
  assert.equal(links.get('Seitz'), '/archive/managers/Seitz');
  const matcher = nameMatcher(links.keys());
  const seen = new Set<string>();
  const first = splitNames('Jeff beat J-Seitz, and Jeffrey watched. Jeff\u2019s week was big.', matcher, seen);
  assert.deepEqual(first.filter(part => part.name).map(part => part.name), ['Jeff', 'J-Seitz']);
  assert.deepEqual(splitNames('Jeff again', matcher, seen), [{ text: 'Jeff again' }]);
  assert.equal(first.map(part => part.text).join(''), 'Jeff beat J-Seitz, and Jeffrey watched. Jeff\u2019s week was big.');
});

test('the agent shows cards from the live snapshot and caps them per answer', async () => {
  const session = createSession({ ...history, live: buildLiveSeason(summaries) });
  const call = { name: 'show_card', args: { kind: 'team', manager: 'Jason' } };
  let step = 0;
  const model: ModelLike = {
    async generateContentStream() {
      step += 1;
      const calls = step === 1 ? Array.from({ length: MAX_CARDS + 1 }, () => call) : [];
      const text = step === 1 ? '' : 'Done.';
      const final: ModelResponse = { text: () => text, functionCalls: () => (calls.length ? calls : undefined), candidates: [{ content: { role: 'model', parts: [...(text ? [{ text }] : []), ...calls.map(item => ({ functionCall: item }))] } }] };
      async function* none() { if (text) yield final; }
      return { stream: none(), response: Promise.resolve(final) };
    },
  };
  const contents: { role: string; parts: unknown[] }[] = [];
  const result = await runAgent({ model, session, contents, message: 'Show Jason' });
  assert.equal(result.cards.length, MAX_CARDS);
  const replies = contents[2].parts as Array<{ functionResponse: { response: { ok: boolean; facts?: string } } }>;
  assert.match(replies[0].functionResponse.response.facts!, /Hot Machete/);
  assert.equal(replies[MAX_CARDS].functionResponse.response.ok, false);
});
