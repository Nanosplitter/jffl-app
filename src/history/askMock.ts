import type { ModelContent, ModelFunctionCall, ModelLike, ModelResponse } from './askAgent.ts';

/**
 * Development-only stand-in for Gemini. It follows the same tool-calling path with canned plans so the chat, charts,
 * and share links can be tried without a Firebase project. It is never bundled in production builds.
 */

const obj = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? value as Record<string, unknown> : {});

function response(text: string, calls: ModelFunctionCall[]): ModelResponse {
  const parts = [...(text ? [{ text }] : []), ...calls.map(call => ({ functionCall: { name: call.name, args: call.args ?? {} } }))];
  return { text: () => text, functionCalls: () => (calls.length ? calls : undefined), candidates: [{ content: { role: 'model', parts } }] };
}

function answer(final: ModelResponse) {
  const text = final.text();
  async function* stream() {
    for (let index = 0; index < text.length; index += 24) {
      await new Promise(resolve => setTimeout(resolve, 12));
      yield response(text.slice(index, index + 24), []);
    }
    if (!text) yield final;
  }
  return Promise.resolve({ stream: stream(), response: Promise.resolve(final) });
}

const lastUserText = (contents: ModelContent[]) => {
  for (let index = contents.length - 1; index >= 0; index -= 1) {
    const text = contents[index].parts.map(part => obj(part).text).find(item => typeof item === 'string');
    if (contents[index].role === 'user' && typeof text === 'string') return { text, index };
  }
  return { text: '', index: 0 };
};

const datasetIdFrom = (contents: ModelContent[], fromIndex: number) => {
  for (let index = contents.length - 1; index > fromIndex; index -= 1) {
    for (const part of contents[index].parts) {
      const id = obj(obj(obj(part).functionResponse).response).datasetId;
      if (typeof id === 'string') return id;
    }
  }
  return undefined;
};

const FOLLOW = '\nFollow-ups: Which league has the most titles? | Show the highest scores ever | How does draft slot affect titles?';

export function createMockModel(): ModelLike {
  return {
    async generateContentStream(request) {
      const { contents } = request;
      const last = contents[contents.length - 1];
      const { text, index } = lastUserText(contents);
      const lower = text.toLowerCase();
      const calledSince = contents.slice(index + 1).filter(item => item.role === 'user').length; // tool rounds already answered

      if (last.parts.some(part => 'functionResponse' in obj(part))) {
        const ids = datasetIdFrom(contents, index);
        if (calledSince === 1 && ids && /champion|title|won|winner/.test(lower)) {
          return answer(response('', [{ name: 'render_chart', args: { type: 'bar', title: 'Super Bowl titles by manager', datasetId: ids, x: 'team', y: ['titles'], sort: 'y_desc', horizontal: true } }]));
        }
        if (calledSince === 1 && ids && /score|highest|record/.test(lower)) {
          return answer(response('', [{ name: 'render_chart', args: { type: 'table', title: 'Highest single-week scores', datasetId: ids } }]));
        }
        if (calledSince === 1 && ids && /trend|average|over time|per season|scor/.test(lower)) {
          return answer(response('', [{ name: 'render_chart', args: { type: 'line', title: 'Average score per season', datasetId: ids, x: 'season', y: ['avgScore'] } }]));
        }
        return answer(response(`Here is what the archive shows. This is a local test assistant, so the wording is canned but the numbers and charts come from the real archive tools.${FOLLOW}`, []));
      }

      if (/champion|title|won|winner/.test(lower)) {
        return answer(response('', [{ name: 'query_seasons', args: { filters: [{ field: 'superBowlChamp', op: 'eq', value: '1' }], groupBy: ['team'], aggregates: [{ fn: 'count', as: 'titles' }], sort: [{ field: 'titles', dir: 'desc' }], limit: 12 } }]));
      }
      if (/rival|head.?to.?head|beats/.test(lower)) {
        return answer(response('', [{ name: 'render_chart', args: { type: 'rivalry_matrix', title: 'Who beats whom', params: { league: 'Premier', from: 2013 } } }]));
      }
      if (/draft/.test(lower)) {
        return answer(response('', [{ name: 'render_chart', args: { type: 'draft_slot_curve', title: 'Draft slot and results' } }]));
      }
      if (/highest|record|best score/.test(lower)) {
        return answer(response('', [{ name: 'records', args: { book: 'weekly', kind: 'highest', limit: 10 } }]));
      }
      if (/trend|average|over time|per season|scor/.test(lower)) {
        return answer(response('', [{ name: 'query_games', args: { filters: [{ field: 'type', op: 'eq', value: 'Season' }, { field: 'score', op: 'not_null' }], groupBy: ['season'], aggregates: [{ fn: 'mean', field: 'score', as: 'avgScore' }], sort: [{ field: 'season', dir: 'asc' }] } }]));
      }
      return answer(response(`I can answer questions about league history from 2002 to 2025, such as titles, scoring records, rivalries, and draft slots. This is the local test assistant, so try asking about champions, scoring trends, rivalries, or the draft.${FOLLOW}`, []));
    },
  };
}
