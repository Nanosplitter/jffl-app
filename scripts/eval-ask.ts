/**
 * Local-only quality check for the "Ask the archive" assistant. It sends the golden questions to the Gemini API
 * with YOUR key, runs the same tool loop the site uses, and checks answers against numbers computed from the archive.
 *
 *   $env:GEMINI_API_KEY = '<key>'          # PowerShell; never commit or paste a key into a file
 *   node --experimental-strip-types scripts/eval-ask.ts [--model gemini-3.8-flash] [--only id1,id2] [--thinking low]
 *
 * It makes real, billable requests (roughly 3 to 5 per question). Output goes to ask-eval-output/, which is not
 * committed. Nothing here touches Firebase, Firestore, or ESPN.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runAgent, splitFollowUps, type AgentEvent, type ModelContent, type ModelLike, type ModelResponse } from '../src/history/askAgent.ts';
import { buildSystemPrompt, TOOL_DECLARATIONS } from '../src/history/askDeclarations.ts';
import { GOLDEN, unsupportedNumbers, type Golden } from '../src/history/askEval.ts';
import { createSession } from '../src/history/askRuntime.ts';
import { parseArchive, type ArchiveFile } from '../src/history/stats.ts';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => { const index = args.indexOf(`--${name}`); return index >= 0 && args[index + 1] ? args[index + 1] : fallback; };
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Set GEMINI_API_KEY in your shell first. This script never reads keys from files.');
  process.exit(2);
}
const modelName = flag('model', 'gemini-3.8-flash');
const thinking = flag('thinking', 'low');
const only = new Set(flag('only', '').split(',').filter(Boolean));

const archive = parseArchive(JSON.parse(readFileSync(new URL('../src/history/archive.json', import.meta.url), 'utf8')) as ArchiveFile);
const usage = { prompt: 0, output: 0, thoughts: 0, requests: 0 };

function restModel(system: string): ModelLike {
  return {
    async generateContentStream(request, options) {
      usage.requests += 1;
      const url = `${process.env.GEMINI_API_BASE ?? 'https://generativelanguage.googleapis.com'}/v1beta/models/${encodeURIComponent(modelName)}:streamGenerateContent?alt=sse`;
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        contents: request.contents,
        generationConfig: { maxOutputTokens: 2048, ...(thinking === 'default' ? {} : { thinkingConfig: { thinkingLevel: thinking } }) },
      };
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey as string }, body: JSON.stringify(body), signal: options?.signal });
      if (!res.ok || !res.body) throw new Error(`Gemini API returned ${res.status}`);
      const all: unknown[] = [];
      let finish: (value: ModelResponse) => void = () => {};
      const response = new Promise<ModelResponse>(resolve => { finish = resolve; });
      const view = (parts: unknown[]): ModelResponse => ({
        text: () => parts.map(part => ((part as { text?: string; thought?: boolean }).thought ? '' : (part as { text?: string }).text ?? '')).join(''),
        functionCalls: () => {
          const calls = parts.flatMap(part => { const call = (part as { functionCall?: { name: string; args?: unknown } }).functionCall; return call ? [call] : []; });
          return calls.length ? calls : undefined;
        },
        candidates: [{ content: { role: 'model', parts } }],
      });
      async function* stream() {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (value) buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = done ? '' : lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const chunk = JSON.parse(line.slice(5)) as { candidates?: Array<{ content?: { parts?: unknown[] } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } };
            if (chunk.usageMetadata) { usage.prompt += chunk.usageMetadata.promptTokenCount ?? 0; usage.output += chunk.usageMetadata.candidatesTokenCount ?? 0; usage.thoughts += chunk.usageMetadata.thoughtsTokenCount ?? 0; }
            const parts = chunk.candidates?.[0]?.content?.parts ?? [];
            all.push(...parts);
            if (parts.length) yield view(parts);
          }
          if (done) break;
        }
        finish(view(all));
      }
      return { stream: stream(), response };
    },
  };
}

interface Outcome { id: string; pass: boolean; problems: string[]; review: number[]; answer: string; tools: string[]; charts: string[]; seconds: number }

async function runOne(item: Golden): Promise<Outcome> {
  const session = createSession(archive);
  const model = restModel(buildSystemPrompt(session.managers));
  const contents: ModelContent[] = [];
  const tools: string[] = [];
  const started = Date.now();
  let last = { text: '', charts: [] as string[] };
  for (const turn of item.turns) {
    const result = await runAgent({ model, session, contents, message: turn, onEvent: (event: AgentEvent) => { if (event.type === 'tool') tools.push(event.name); } });
    last = { text: result.text, charts: result.charts.map(chart => chart.spec.type) };
  }
  const answer = splitFollowUps(last.text).answer;
  const lowered = answer.toLowerCase().replace(/,/g, '');
  const problems: string[] = [];
  for (const group of item.contains?.(session) ?? []) {
    if (!group.some(entry => lowered.includes(entry.toLowerCase()))) problems.push(`answer is missing one of: ${group.join(' | ')}`);
  }
  for (const pattern of item.matches ?? []) if (!pattern.test(answer)) problems.push(`answer does not match ${pattern}`);
  if (item.charts && !last.charts.some(type => item.charts!.includes(type))) problems.push(`expected a chart of type ${item.charts.join(' or ')}, got ${last.charts.join(', ') || 'none'}`);
  if (item.noCharts && last.charts.length) problems.push(`drew ${last.charts.join(', ')} but should not have`);
  for (const tool of item.tools ?? []) if (!tools.includes(tool)) problems.push(`did not call ${tool}`);
  const review = unsupportedNumbers(answer, contents, item.turns.join(' '));
  return { id: item.id, pass: problems.length === 0, problems, review, answer, tools, charts: last.charts, seconds: (Date.now() - started) / 1000 };
}

const selected = GOLDEN.filter(item => !only.size || only.has(item.id));
console.log(`Running ${selected.length} golden questions on ${modelName} (thinking: ${thinking})\n`);
const outcomes: Outcome[] = [];
for (const item of selected) {
  try {
    const outcome = await runOne(item);
    outcomes.push(outcome);
    console.log(`${outcome.pass ? 'PASS' : 'FAIL'}  ${item.id}  (${outcome.seconds.toFixed(1)}s, tools: ${outcome.tools.join(', ') || 'none'}, charts: ${outcome.charts.join(', ') || 'none'})`);
    for (const problem of outcome.problems) console.log(`      - ${problem}`);
    if (outcome.review.length) console.log(`      review numbers not found in tool results: ${outcome.review.join(', ')}`);
  } catch (error) {
    outcomes.push({ id: item.id, pass: false, problems: [error instanceof Error ? error.message : 'failed'], review: [], answer: '', tools: [], charts: [], seconds: 0 });
    console.log(`FAIL  ${item.id}  (${error instanceof Error ? error.message : 'error'})`);
  }
}

const passed = outcomes.filter(outcome => outcome.pass).length;
const cost = (usage.prompt * 0.75 + (usage.output + usage.thoughts) * 3.75) / 1_000_000;
console.log(`\n${passed}/${outcomes.length} passed. ${usage.requests} requests, ${usage.prompt} input and ${usage.output + usage.thoughts} output tokens, about $${cost.toFixed(3)} at the introductory Gemini 3.8 Flash price.`);
mkdirSync(new URL('../ask-eval-output/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../ask-eval-output/${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url), JSON.stringify({ model: modelName, thinking, usage, outcomes }, null, 2));
process.exitCode = passed === outcomes.length ? 0 : 1;
