import { MAX_CARDS, type CardItem } from './askCards.ts';
import { executeTool, type Session } from './askRuntime.ts';
import type { Dataset } from './askTools.ts';
import type { ChartSpec } from './chartSpec.ts';

/** The slice of the Firebase AI Logic model that the loop needs, so tests can supply a fake. */
export interface ModelContent { role: string; parts: unknown[] }
export interface ModelFunctionCall { name: string; args?: unknown }
export interface ModelResponse {
  text(): string;
  functionCalls(): ModelFunctionCall[] | undefined;
  candidates?: Array<{ content?: { role?: string; parts?: unknown[] } }>;
}
export interface ModelLike {
  generateContentStream(request: { contents: ModelContent[] }, options?: { signal?: AbortSignal }): Promise<{ stream: AsyncIterable<ModelResponse>; response: Promise<ModelResponse> }>;
}

export type AgentEvent =
  | { type: 'step'; step: number }
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; note: string }
  | { type: 'chart'; id: string; spec: ChartSpec; warnings: string[] }
  | { type: 'card'; card: CardItem };

export interface AgentOptions {
  model: ModelLike;
  session: Session;
  /** Model-facing history. It is extended in place and rolled back if the turn fails. */
  contents: ModelContent[];
  message: string;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
  maxSteps?: number;
  maxCharts?: number;
}

export interface AgentResult {
  text: string;
  charts: Array<{ id: string; spec: ChartSpec; warnings: string[] }>;
  cards: CardItem[];
  datasets: Dataset[];
  steps: number;
  hitLimit: boolean;
}

export const MAX_STEPS = 16;
export const MAX_CHARTS = 3;

export class AgentAborted extends Error {
  constructor() { super('The request was cancelled.'); this.name = 'AgentAborted'; }
}

const safe = <T>(read: () => T): T | undefined => { try { return read(); } catch { return undefined; } };
const asObject = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {});

export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  const { model, session, contents, message, onEvent, signal } = options;
  const maxSteps = options.maxSteps ?? MAX_STEPS;
  const maxCharts = options.maxCharts ?? MAX_CHARTS;
  const checkpoint = contents.length;
  const charts: AgentResult['charts'] = [];
  const cards: CardItem[] = [];
  const datasets: Dataset[] = [];
  let lastText = '';
  let chartCount = 0;
  contents.push({ role: 'user', parts: [{ text: message }] });
  try {
    for (let step = 1; step <= maxSteps; step += 1) {
      if (signal?.aborted) throw new AgentAborted();
      onEvent?.({ type: 'step', step });
      const { stream, response } = await model.generateContentStream({ contents }, { signal });
      let stepText = '';
      for await (const chunk of stream) {
        if (signal?.aborted) throw new AgentAborted();
        const delta = safe(() => chunk.text()) ?? '';
        if (delta) { stepText += delta; onEvent?.({ type: 'text', delta }); }
      }
      const final = await response;
      const calls = safe(() => final.functionCalls()) ?? [];
      const raw = final.candidates?.[0]?.content;
      // Keep the model's own parts: Gemini 3 thought signatures live there and must be sent back unchanged.
      const parts = raw?.parts?.length
        ? raw.parts
        : [...(stepText ? [{ text: stepText }] : []), ...calls.map(call => ({ functionCall: { name: call.name, args: call.args ?? {} } }))];
      if (parts.length) contents.push({ role: 'model', parts });
      if (stepText.trim()) lastText = stepText;
      if (!calls.length) {
        if (!parts.length) contents.push({ role: 'model', parts: [{ text: lastText || 'I could not produce an answer.' }] });
        return { text: lastText, charts, cards, datasets, steps: step, hitLimit: false };
      }
      const replies: unknown[] = [];
      for (const call of calls) {
        let run;
        if (call.name === 'render_chart' && chartCount >= maxCharts) {
          run = { note: 'Drawing a chart', response: { ok: false, error: `Only ${maxCharts} charts are allowed per answer. Answer in text.` } } as ReturnType<typeof executeTool>;
        } else if (call.name === 'show_card' && cards.length >= MAX_CARDS) {
          run = { note: 'Adding a card', response: { ok: false, error: `Only ${MAX_CARDS} cards are allowed per answer. Answer in text.` } } as ReturnType<typeof executeTool>;
        } else {
          try { run = executeTool(session, call.name, call.args); } catch { run = { note: 'Working', response: { ok: false, error: 'That step failed. Try a simpler request.' } } as ReturnType<typeof executeTool>; }
        }
        onEvent?.({ type: 'tool', name: call.name, note: run.note });
        if (run.dataset) datasets.push(run.dataset);
        if (run.chart) {
          chartCount += 1;
          const id = `c${session.next}-${charts.length + 1}-${Date.now().toString(36)}`;
          charts.push({ id, spec: run.chart.spec, warnings: run.chart.warnings });
          onEvent?.({ type: 'chart', id, spec: run.chart.spec, warnings: run.chart.warnings });
        }
        if (run.card) {
          const card = { id: `k${session.next}-${cards.length + 1}-${Date.now().toString(36)}`, spec: run.card };
          cards.push(card);
          onEvent?.({ type: 'card', card });
        }
        replies.push({ functionResponse: { name: call.name, response: run.response } });
      }
      contents.push({ role: 'user', parts: replies });
    }
    // Ran out of steps: close the turn so the history stays valid for the next question.
    const text = lastText || 'That question needed more steps than I allow. Try narrowing it, for example to one league or a few seasons.';
    contents.push({ role: 'model', parts: [{ text }] });
    return { text, charts, cards, datasets, steps: maxSteps, hitLimit: true };
  } catch (error) {
    contents.length = checkpoint;
    throw error;
  }
}

// ---------- History hygiene ----------

const isTextTurn = (content: ModelContent) => content.role === 'user' && content.parts.some(part => typeof asObject(part).text === 'string');

function compactResponse(response: unknown) {
  const body = asObject(response);
  if (typeof body.datasetId === 'string') {
    return {
      datasetId: body.datasetId, title: body.title, rowCount: body.matched ?? body.rowCount,
      columns: Array.isArray(body.columns) ? body.columns.map(column => asObject(column).name ?? column) : undefined,
      summary: body.summary, note: 'Older result, rows removed. Run the query again if you need them.',
    };
  }
  return body.ok === false ? { ok: false, error: body.error ?? 'failed' } : { ok: true, note: 'Older result removed.' };
}

/** Replace bulky tool results from earlier turns with short summaries. Returns a new array; parts are not mutated. */
export function trimHistory(contents: ModelContent[], keepTurns = 2): ModelContent[] {
  const turnStarts = contents.flatMap((content, index) => (isTextTurn(content) ? [index] : []));
  if (turnStarts.length <= keepTurns) return contents;
  const cutoff = turnStarts[turnStarts.length - keepTurns];
  return contents.map((content, index) => {
    if (index >= cutoff || content.role === 'model') return content;
    if (!content.parts.some(part => 'functionResponse' in asObject(part))) return content;
    return {
      ...content,
      parts: content.parts.map(part => {
        const reply = asObject(asObject(part).functionResponse);
        return Object.keys(reply).length ? { ...asObject(part), functionResponse: { ...reply, response: compactResponse(reply.response) } } : part;
      }),
    };
  });
}

/** Drop whole oldest turns until the history fits. Never leaves a dangling tool call. */
export function fitHistory(contents: ModelContent[], maxChars = 90_000): ModelContent[] {
  let current = contents;
  while (JSON.stringify(current).length > maxChars) {
    const starts = current.flatMap((content, index) => (isTextTurn(content) ? [index] : []));
    if (starts.length < 2) break;
    current = current.slice(starts[1]);
  }
  return current;
}

export const turnCount = (contents: ModelContent[]) => contents.filter(isTextTurn).length;

// ---------- Follow-ups ----------

const MARKER = /(?:^|\n)[\s*_#>-]*follow[- ]?ups?\s*:?[\s*_]*/i;

export function splitFollowUps(text: string): { answer: string; followUps: string[] } {
  const match = MARKER.exec(text);
  if (!match) return { answer: hidePartialMarker(text).trim(), followUps: [] };
  const answer = text.slice(0, match.index).trim();
  const tail = text.slice(match.index + match[0].length);
  const items = tail.split(/\s*\|\s*|\n+/)
    .map(item => item.replace(/^[\s*_\-\u2022\d.)]+/, '').replace(/[*_]+$/g, '').trim())
    .filter(item => item.length >= 6 && item.length <= 140);
  return { answer, followUps: [...new Set(items)].slice(0, 3) };
}

/** While streaming, do not flash a half-typed "Follow-ups:" marker. */
function hidePartialMarker(text: string) {
  const newline = text.lastIndexOf('\n');
  const tail = text.slice(newline + 1).replace(/^[\s*_#>-]+/, '').toLowerCase();
  if (tail.length >= 3 && 'follow-ups:'.startsWith(tail)) return newline >= 0 ? text.slice(0, newline) : '';
  return text;
}
