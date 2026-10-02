import type { ModelContent } from './askAgent.ts';
import type { Session } from './askRuntime.ts';
import { runDataTool, type Row } from './askTools.ts';

/**
 * Golden questions for the assistant. Ground truth is computed from the archive at run time, never typed in,
 * so the list stays right if the archive is corrected. `contains` is a list of groups; each group needs at least one match.
 */
export interface Golden {
  id: string;
  turns: string[];
  contains?: (session: Session) => string[][];
  matches?: RegExp[];
  charts?: string[];
  tools?: string[];
  noCharts?: boolean;
}

const rows = (session: Session, tool: Parameters<typeof runDataTool>[1], args: Record<string, unknown>): Row[] => {
  const outcome = runDataTool(session.ctx, tool, args);
  if (!outcome.ok || 'entity' in outcome) throw new Error(`golden setup failed for ${tool}`);
  return outcome.rows;
};
const summary = (session: Session, tool: Parameters<typeof runDataTool>[1], args: Record<string, unknown>) => {
  const outcome = runDataTool(session.ctx, tool, args);
  if (!outcome.ok || 'entity' in outcome) throw new Error(`golden setup failed for ${tool}`);
  return outcome.summary ?? {};
};
const tied = (list: Row[], key: string) => list.filter(row => row[key] === list[0][key]);
const one = (value: unknown) => (typeof value === 'number' ? value.toFixed(1) : String(value));

const mostBy = (session: Session, flag: string) => {
  const list = rows(session, 'query_seasons', { filters: [{ field: flag, op: 'eq', value: '1' }], groupBy: ['team'], aggregates: [{ fn: 'count', as: 'n' }], sort: [{ field: 'n', dir: 'desc' }], limit: 5 });
  return [list.slice(0, tied(list, 'n').length).map(row => String(row.team)), [String(list[0].n)]];
};

export const GOLDEN: Golden[] = [
  { id: 'most-super-bowls', turns: ['Who has won the most Superbowls?'], contains: session => mostBy(session, 'superBowlChamp'), tools: ['query_seasons'] },
  { id: 'most-regular-season-titles', turns: ['Who has finished first in the regular season most often?'], contains: session => mostBy(session, 'seasonChamp') },
  {
    id: 'highest-weekly-score', turns: ['What is the highest score ever in a single regular-season week?'],
    contains: session => { const top = rows(session, 'records', { book: 'weekly', kind: 'highest', limit: 1 })[0]; return [[String(top.team)], [String(top.score)]]; },
  },
  {
    id: 'cup-score-caveat', turns: ['What is the highest score in a JFFL Cup game?'],
    contains: session => { const top = rows(session, 'records', { book: 'jffl_cup', kind: 'highest', limit: 1 })[0]; return [[String(top.score)]]; },
    matches: [/two[- ]week/i],
  },
  {
    id: 'head-to-head', turns: ['What is Becky\u2019s record against Jeff?'],
    contains: session => { const record = summary(session, 'head_to_head', { a: 'Becky', b: 'Jeff' }); return [[String(record.BeckyWins)], [String(record.JeffWins)]]; },
  },
  {
    id: 'best-record-super-bowl', turns: ['How often does the team with the best regular-season record win the Superbowl?'],
    contains: session => { const record = summary(session, 'title_years', {}); return [[String(record.bestRecordWonSuperBowl)], [String(record.leaguesWithSuperBowl)]]; },
  },
  {
    id: 'draft-position', turns: ['Does draft position matter for winning the regular season?'],
    contains: session => { const first = rows(session, 'draft_slot_stats', { by: 'bucket' })[0]; return [[one(first.titleRate)]]; },
  },
  {
    id: 'week-one-high', turns: ['What is the highest score ever in week 1?'],
    contains: session => { const high = (summary(session, 'week_slice', { week: 1 }).highest ?? {}) as { score?: number; team?: string }; return [[String(high.team)], [String(high.score)]]; },
  },
  {
    id: 'ties', turns: ['How many regular-season games have ended in a tie?'],
    contains: session => [[String(summary(session, 'records', { book: 'weekly', kind: 'ties' }).ties)]],
  },
  {
    id: 'scoring-eras', turns: ['How much did average scoring change between 2003 to 2012 and 2013 to 2025?'],
    contains: session => {
      const mean = (from: number, to: number) => (rows(session, 'query_games', { filters: [{ field: 'type', op: 'eq', value: 'Season' }, { field: 'season', op: 'between', value: `${from},${to}` }, { field: 'score', op: 'not_null' }], aggregates: [{ fn: 'mean', field: 'score', as: 'm' }] })[0].m as number);
      return [[mean(2003, 2012).toFixed(1)], [mean(2013, 2025).toFixed(1)]];
    },
  },
  { id: 'chart-trend', turns: ['Chart the average score per season for each league'], charts: ['line', 'area', 'bar'], tools: ['query_games'] },
  { id: 'chart-rivalry', turns: ['Show a rivalry matrix for the Premier league since 2013'], charts: ['rivalry_matrix', 'heatmap'] },
  { id: 'chart-career', turns: ['Show Jeff\u2019s career as a timeline'], charts: ['career_timeline'] },
  { id: 'chart-draft', turns: ['Show how draft slot relates to titles'], charts: ['draft_slot_curve', 'bar', 'line', 'scatter'] },
  {
    id: 'follow-up-filter', turns: ['Who has won the most Superbowls?', 'Now only count the Premier league since 2013'],
    tools: ['query_seasons'],
  },
  {
    id: 'current-week-high', turns: ['Who has the highest score so far this week?'], tools: ['query_games'],
    contains: session => {
      const live = session.ctx.archive.live;
      if (!live?.week) throw new Error('golden setup needs the live season');
      const top = rows(session, 'query_games', {
        filters: [{ field: 'season', op: 'eq', value: live.season }, { field: 'type', op: 'eq', value: 'Season' }, { field: 'week', op: 'eq', value: live.week }, { field: 'score', op: 'not_null' }],
        sort: [{ field: 'score', dir: 'desc' }], limit: 1,
      })[0];
      return [[String(top.team)], [String(top.score)]];
    },
    matches: [/live|so far|in progress|still|change/i],
  },
  { id: 'future-season', turns: ['Who will win the 2026 championship?'], matches: [/can(?:no|')t|cannot|do(?:es)?n['\u2019]t|no data|not (?:in|available)|unable|predict/i], noCharts: true },
  { id: 'off-topic', turns: ['What is the weather in Boston?'], matches: [/league|archive|history|fantasy/i], noCharts: true },
  { id: 'unknown-manager', turns: ['What is Zorblax\u2019s record against Jeff?'], matches: [/not|no |couldn['\u2019]t|could not|cannot|can['\u2019]t|isn['\u2019]t/i], noCharts: true },
];

// ---------- Number support check ----------

const NUMBER = /-?\d[\d,]*(?:\.\d+)?/g;

function numbersIn(text: string): number[] {
  return (text.match(NUMBER) ?? []).map(item => Number(item.replace(/,/g, ''))).filter(Number.isFinite);
}

function collect(value: unknown, into: Set<number>) {
  if (typeof value === 'number' && Number.isFinite(value)) into.add(value);
  else if (typeof value === 'string') numbersIn(value).forEach(number => into.add(number));
  else if (Array.isArray(value)) value.forEach(item => collect(item, into));
  else if (typeof value === 'object' && value !== null) Object.values(value).forEach(item => collect(item, into));
}

/**
 * Numbers in the answer that no tool result contains (after rounding). These are not always wrong, since a model may
 * add two figures, so treat the list as items to review, not as failures.
 */
export function unsupportedNumbers(answer: string, contents: ModelContent[], question = ''): number[] {
  const known = new Set<number>();
  for (const content of contents) {
    for (const part of content.parts) {
      const reply = (part as { functionResponse?: { response?: unknown } }).functionResponse;
      if (reply) collect(reply.response, known);
    }
  }
  numbersIn(question).forEach(number => known.add(number));
  const supported = (number: number) => {
    const places = (String(number).split('.')[1] ?? '').length;
    const scale = 10 ** places;
    for (const item of known) {
      if (Math.abs(item - number) < 1e-9) return true;
      if (Math.round(item * scale) / scale === number) return true;
    }
    return false;
  };
  return [...new Set(numbersIn(answer.replace(/Follow-ups:.*$/is, '')))].filter(number => !supported(number));
}
