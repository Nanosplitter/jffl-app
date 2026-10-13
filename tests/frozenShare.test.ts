import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { executeTool, createSession } from '../src/history/askRuntime.ts';
import { chatFromFrozen, freezeMessage, freezeMessages, shareTitle } from '../src/history/frozenShare.ts';
import type { ChatMessage } from '../src/history/askStore.ts';
import { parseArchive, type ArchiveFile } from '../src/history/stats.ts';

const archive = parseArchive(JSON.parse(readFileSync(new URL('../src/history/archive.json', import.meta.url), 'utf8')) as ArchiveFile);

test('a frozen answer keeps the full text and chart recipe', () => {
  const session = createSession(archive);
  const query = executeTool(session, 'query_games', {
    filters: [{ field: 'type', op: 'eq', value: 'Season' }], groupBy: ['season'], aggregates: [{ fn: 'mean', field: 'score', as: 'avg' }], sort: [{ field: 'season', dir: 'asc' }],
  });
  const chart = executeTool(session, 'render_chart', { type: 'line', title: 'Average score', datasetId: query.dataset!.id, x: 'season', y: ['avg'] });
  assert.ok(chart.chart);
  const text = 'A'.repeat(2000);
  const message: ChatMessage = { id: 'a1', role: 'assistant', text, followUps: ['Who else?'], charts: [{ id: 'c1', spec: chart.chart.spec, warnings: [] }] };
  const frozen = freezeMessage('Q'.repeat(400), message, session);
  assert.equal(frozen.kind, 'message');
  assert.equal(frozen.messages[0].role, 'user');
  assert.equal(frozen.messages[0].text.length, 400);
  assert.equal(frozen.messages[1].text.length, 2000);
  assert.equal(frozen.title.length <= 120, true);
  assert.equal(frozen.messages[1].charts.length, 1);
  assert.equal(JSON.stringify(frozen).includes('"rows"'), false);
  const copied = chatFromFrozen(frozen);
  assert.equal(copied.messages.length, 2);
  assert.equal(copied.contents[1].role, 'model');
  assert.equal(copied.sources.length > 0, true);
});

test('a frozen thread uses the first question as its title', () => {
  const session = createSession(archive);
  const messages: ChatMessage[] = [
    { id: 'u1', role: 'user', text: 'Who has the most titles?', charts: [], followUps: [] },
    { id: 'a1', role: 'assistant', text: 'Jason.', charts: [], followUps: [] },
  ];
  const frozen = freezeMessages(messages, session, 'thread');
  assert.equal(frozen.kind, 'thread');
  assert.equal(frozen.title, 'Who has the most titles?');
  assert.equal(shareTitle(`  ${'x'.repeat(200)}  `).length, 120);
  assert.equal(shareTitle('   '), 'Chat');
});
