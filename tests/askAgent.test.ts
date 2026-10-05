import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runAgent, splitFollowUps, trimHistory, fitHistory, turnCount, type AgentEvent, type ModelContent, type ModelFunctionCall, type ModelLike, type ModelResponse } from '../src/history/askAgent.ts';
import { buildSystemPrompt, TOOL_DECLARATIONS } from '../src/history/askDeclarations.ts';
import { checkLimits, COOLDOWN_MS, DAILY_SOFT_LIMIT, friendlyError, MAX_INPUT_CHARS, MAX_TURNS, readDaily } from '../src/history/askGuards.ts';
import { createMockModel } from '../src/history/askMock.ts';
import { createSession } from '../src/history/askRuntime.ts';
import { deserialize, serialize } from '../src/history/askStore.ts';
import { parseArchive, type ArchiveFile } from '../src/history/stats.ts';

const archive = parseArchive(JSON.parse(readFileSync(new URL('../src/history/archive.json', import.meta.url), 'utf8')) as ArchiveFile);

interface Step { text?: string; calls?: ModelFunctionCall[]; signature?: string; fail?: Error }

function fakeModel(steps: Step[]): ModelLike & { requests: number } {
  const model = {
    requests: 0,
    async generateContentStream() {
      const step = steps[model.requests];
      model.requests += 1;
      if (!step) throw new Error('script exhausted');
      if (step.fail) throw step.fail;
      const text = step.text ?? '';
      const calls = step.calls ?? [];
      const parts = [
        ...(text ? [{ text }] : []),
        ...calls.map((call, index) => ({ functionCall: { name: call.name, args: call.args ?? {} }, ...(index === 0 && step.signature ? { thoughtSignature: step.signature } : {}) })),
      ];
      const final: ModelResponse = { text: () => text, functionCalls: () => (calls.length ? calls : undefined), candidates: [{ content: { role: 'model', parts } }] };
      async function* chunks() { for (const piece of text.match(/.{1,10}/gs) ?? []) yield { ...final, text: () => piece }; }
      return { stream: chunks(), response: Promise.resolve(final) };
    },
  };
  return model;
}

const asks = (text: string) => text;
const titleQuery: ModelFunctionCall = { name: 'query_seasons', args: { filters: [{ field: 'superBowlChamp', op: 'eq', value: '1' }], groupBy: ['team'], aggregates: [{ fn: 'count', as: 'titles' }], sort: [{ field: 'titles', dir: 'desc' }], limit: 5 } };
const barChart: ModelFunctionCall = { name: 'render_chart', args: { type: 'bar', title: 'Titles', datasetId: 'ds1', x: 'team', y: ['titles'] } };

test('the loop runs tools, draws a chart, and keeps the model parts intact', async () => {
  const session = createSession(archive);
  const model = fakeModel([
    { calls: [titleQuery], signature: 'sig-1' },
    { calls: [barChart] },
    { text: 'Jeff has the most.\nFollow-ups: Who is second? | Show by league' },
  ]);
  const contents: ModelContent[] = [];
  const events: AgentEvent[] = [];
  const result = await runAgent({ model, session, contents, message: asks('Who won the most Superbowls?'), onEvent: event => events.push(event) });
  assert.equal(result.steps, 3);
  assert.equal(result.charts.length, 1);
  assert.equal(result.datasets.length, 1);
  assert.match(result.text, /Jeff has the most/);
  assert.deepEqual(contents.map(item => item.role), ['user', 'model', 'user', 'model', 'user', 'model']);
  assert.equal((contents[1].parts[0] as { thoughtSignature?: string }).thoughtSignature, 'sig-1', 'thought signatures must be sent back unchanged');
  const reply = (contents[2].parts[0] as { functionResponse: { name: string; response: { datasetId: string } } }).functionResponse;
  assert.equal(reply.name, 'query_seasons');
  assert.equal(reply.response.datasetId, 'ds1');
  assert.deepEqual(events.filter(event => event.type === 'step').length, 3);
  assert.ok(events.some(event => event.type === 'chart'));
  assert.ok(events.filter(event => event.type === 'text').map(event => (event as { delta: string }).delta).join('').includes('Jeff has the most'));
});

test('a bad chart request goes back to the model and is not shown', async () => {
  const session = createSession(archive);
  const model = fakeModel([
    { calls: [{ name: 'render_chart', args: { type: 'bar', title: 'Oops', datasetId: 'ds9', x: 'team', y: ['titles'] } }] },
    { text: 'I could not draw that chart.' },
  ]);
  const contents: ModelContent[] = [];
  const result = await runAgent({ model, session, contents, message: 'Chart it' });
  assert.equal(result.charts.length, 0);
  const reply = (contents[2].parts[0] as { functionResponse: { response: { ok: boolean; errors: string[] } } }).functionResponse.response;
  assert.equal(reply.ok, false);
  assert.ok(reply.errors.length > 0);
});

test('charts per answer are capped', async () => {
  const session = createSession(archive);
  const model = fakeModel([
    { calls: [titleQuery] },
    { calls: [barChart, { ...barChart, args: { ...barChart.args as object, title: 'Two' } }, { ...barChart, args: { ...barChart.args as object, title: 'Three' } }] },
    { text: 'Done.' },
  ]);
  const result = await runAgent({ model, session, contents: [], message: 'Many charts', maxCharts: 2 });
  assert.equal(result.charts.length, 2);
});

test('a failed turn rolls the history back so the next question still works', async () => {
  const session = createSession(archive);
  const contents: ModelContent[] = [];
  await runAgent({ model: fakeModel([{ text: 'First answer.' }]), session, contents, message: 'One' });
  const before = JSON.stringify(contents);
  await assert.rejects(runAgent({ model: fakeModel([{ calls: [titleQuery] }, { fail: new Error('429 quota') }]), session, contents, message: 'Two' }), /quota/);
  assert.equal(JSON.stringify(contents), before);
  assert.equal(contents.at(-1)?.role, 'model');
});

test('the step limit ends with a valid history', async () => {
  const session = createSession(archive);
  const forever = Array.from({ length: 10 }, () => ({ calls: [titleQuery] }));
  const contents: ModelContent[] = [];
  const result = await runAgent({ model: fakeModel(forever), session, contents, message: 'Loop', maxSteps: 3 });
  assert.equal(result.hitLimit, true);
  assert.equal(contents.at(-1)?.role, 'model');
});

test('cancelling stops the loop and restores the history', async () => {
  const controller = new AbortController();
  controller.abort();
  const contents: ModelContent[] = [];
  await assert.rejects(runAgent({ model: fakeModel([{ text: 'x' }]), session: createSession(archive), contents, message: 'Hi', signal: controller.signal }), /cancelled/);
  assert.equal(contents.length, 0);
});

test('older tool results are compacted but recent ones stay whole', async () => {
  const session = createSession(archive);
  const contents: ModelContent[] = [];
  await runAgent({ model: fakeModel([{ calls: [titleQuery] }, { text: 'a' }]), session, contents, message: 'Q1' });
  await runAgent({ model: fakeModel([{ text: 'b' }]), session, contents, message: 'Q2' });
  await runAgent({ model: fakeModel([{ text: 'c' }]), session, contents, message: 'Q3' });
  const original = JSON.stringify(contents);
  const trimmed = trimHistory(contents, 2);
  assert.equal(JSON.stringify(contents), original, 'input is not mutated');
  const reply = (trimmed[2].parts[0] as { functionResponse: { response: Record<string, unknown> } }).functionResponse.response;
  assert.equal(reply.datasetId, 'ds1');
  assert.equal('rows' in reply, false);
  assert.ok(JSON.stringify(trimmed).length < original.length);
  assert.equal(trimHistory(contents, 3), contents);
});

test('fitHistory drops whole turns and never leaves a dangling tool call', async () => {
  const session = createSession(archive);
  const contents: ModelContent[] = [];
  for (let index = 0; index < 4; index += 1) await runAgent({ model: fakeModel([{ calls: [titleQuery] }, { text: 'a'.repeat(300) }]), session, contents, message: `Q${index}` });
  const fitted = fitHistory(contents, 4000);
  assert.ok(fitted.length < contents.length);
  assert.equal(fitted[0].role, 'user');
  assert.ok('text' in (fitted[0].parts[0] as object));
  assert.equal(turnCount(fitted) >= 1, true);
});

test('follow-ups are separated from the answer', () => {
  assert.deepEqual(splitFollowUps('Jeff won 4.\n\nFollow-ups: Who is next? | Show by league | And in Premier?'), {
    answer: 'Jeff won 4.', followUps: ['Who is next?', 'Show by league', 'And in Premier?'],
  });
  assert.deepEqual(splitFollowUps('Answer.\n**Follow-ups:** One long question? | Another question?').followUps, ['One long question?', 'Another question?']);
  assert.deepEqual(splitFollowUps('Answer only.'), { answer: 'Answer only.', followUps: [] });
  assert.equal(splitFollowUps('Answer.\nFollo').answer, 'Answer.');
  assert.equal(splitFollowUps('Follow').answer, '');
  assert.equal(splitFollowUps('We follow the rules').answer, 'We follow the rules');
});

test('every tool declaration is valid for Gemini and the prompt carries the schema', () => {
  const names = new Set<string>();
  const forbidden = (value: unknown, path: string): void => {
    if (Array.isArray(value)) { value.forEach((item, index) => forbidden(item, `${path}[${index}]`)); return; }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!['oneOf', 'anyOf', 'allOf', '$ref', 'additionalProperties'].includes(key), `${path}.${key} is not supported`);
      forbidden(child, `${path}.${key}`);
    }
  };
  for (const tool of TOOL_DECLARATIONS) {
    assert.ok(!names.has(tool.name));
    names.add(tool.name);
    assert.equal((tool.parameters as { type: string }).type, 'object');
    forbidden(tool.parameters, tool.name);
    const properties = (tool.parameters as { properties: Record<string, unknown> }).properties;
    for (const required of (tool.parameters as { required?: string[] }).required ?? []) assert.ok(required in properties, `${tool.name} requires unknown ${required}`);
  }
  assert.ok(names.has('render_chart') && names.has('query_games'));
  const prompt = buildSystemPrompt(['Jeff', 'Becky']);
  assert.match(prompt, /Jeff, Becky/);
  assert.match(prompt, /Table team_games/);
  assert.match(prompt, /Follow-ups:/);
  assert.match(prompt, /Always write Superbowl and Superbowls/);
  assert.match(prompt, /\{premier\}Premier\{\/premier\}/);
  assert.match(prompt, /\{championship\}/);
  assert.match(prompt, /\{league-one\}/);
  assert.match(prompt, /Premier: Jason/);
  assert.match(prompt, /League One: RonniColin/);
  assert.match(prompt, /teamLeague/);
  assert.match(prompt, /crossLeague/);
  assert.match(prompt, /gameId/);
  assert.match(prompt, /betterFinish/);
  assert.match(prompt, /pointsAgainst/);
  assert.match(prompt, /winStreak/);
});

test('the local test assistant exercises the whole path on the real archive', async () => {
  const session = createSession(archive);
  const contents: ModelContent[] = [];
  const result = await runAgent({ model: createMockModel(), session, contents, message: 'Who has won the most championships?' });
  assert.equal(result.charts.length, 1);
  assert.equal(result.charts[0].spec.type, 'bar');
  assert.ok(splitFollowUps(result.text).followUps.length === 3);
  const second = await runAgent({ model: createMockModel(), session, contents, message: 'Which draft slot is best?' });
  assert.equal(second.charts[0].spec.type, 'draft_slot_curve');
});

test('limits stop empty, long, rapid, and excessive questions', () => {
  const base = { input: 'Who won?', now: 100_000, lastSentAt: 0, turns: 0, todayCount: 0, busy: false };
  assert.equal(checkLimits(base).ok, true);
  assert.equal(checkLimits({ ...base, input: '   ' }).ok, false);
  assert.equal(checkLimits({ ...base, input: 'x'.repeat(MAX_INPUT_CHARS + 1) }).ok, false);
  assert.equal(checkLimits({ ...base, busy: true }).ok, false);
  assert.equal(checkLimits({ ...base, turns: MAX_TURNS }).ok, false);
  assert.equal(checkLimits({ ...base, lastSentAt: base.now - COOLDOWN_MS + 1 }).ok, false);
  assert.equal(checkLimits({ ...base, todayCount: DAILY_SOFT_LIMIT }).ok, false);
});

test('daily counts reset on a new day and ignore garbage', () => {
  const now = Date.UTC(2026, 9, 1, 12);
  assert.deepEqual(readDaily(JSON.stringify({ day: '2026-10-01', count: 7 }), now), { day: '2026-10-01', count: 7 });
  assert.deepEqual(readDaily(JSON.stringify({ day: '2026-09-30', count: 7 }), now), { day: '2026-10-01', count: 0 });
  assert.deepEqual(readDaily('{nope', now), { day: '2026-10-01', count: 0 });
  assert.deepEqual(readDaily(null, now), { day: '2026-10-01', count: 0 });
});

test('error messages are friendly and never echo raw details', () => {
  const quota = friendlyError(new Error('[429] Quota exceeded for key AIzaSySECRET'));
  assert.match(quota, /busy|limit/);
  assert.ok(!quota.includes('AIza'));
  assert.match(friendlyError(Object.assign(new Error('x'), { code: 'permission-denied' })), /not available/);
  assert.match(friendlyError(new Error('Response was blocked due to SAFETY')), /cannot answer/);
  assert.match(friendlyError(new TypeError('Failed to fetch')), /connection/);
  assert.match(friendlyError('weird'), /went wrong/);
});

test('saved chats round-trip and reject damaged or oversized data', () => {
  const state = {
    messages: [{ id: 'm1', role: 'user' as const, text: 'Hi', charts: [], followUps: [] }],
    contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
    sources: [{ id: 'ds1', source: { tool: 'query_games', args: { limit: 5 } } }],
  };
  const text = serialize(state);
  assert.ok(text);
  assert.deepEqual(deserialize(text), { v: 1, ...state });
  assert.equal(deserialize('{"v":2}'), null);
  assert.equal(deserialize('not json'), null);
  assert.equal(deserialize(null), null);
  assert.equal(serialize({ ...state, contents: [{ role: 'user', parts: [{ text: 'x'.repeat(1_600_000) }] }] }), null);
  const mixed = deserialize(JSON.stringify({ v: 1, messages: [{ role: 'system' }, ...state.messages], contents: [], sources: [] }));
  assert.equal(mixed?.messages.length, 1);
});
