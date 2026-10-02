import {
  applyControls, createContext, datasetForModel, isDataTool, parseQuery, runDataTool, runQuery,
  type Archive, type Controls, type Dataset, type Source, type TableName, type ToolContext,
} from './askTools.ts';
import { normalizeModelSpec, validateSpec, type ChartSpec, type ValidationEnv } from './chartSpec.ts';
import { careers } from './stats.ts';

export interface Session {
  ctx: ToolContext;
  sources: Map<string, Source>;
  cache: Map<string, Dataset>;
  next: number;
  managers: string[];
}

export function createSession(archive: Archive): Session {
  return {
    ctx: createContext(archive), sources: new Map(), cache: new Map(), next: 1,
    managers: careers(archive.seasons).map(row => row.team).sort((a, b) => a.localeCompare(b)),
  };
}

/** Rebuilds a dataset from the tool call that created it, so sessions and links need no stored rows. */
export function datasetOf(session: Session, id: string): Dataset | undefined {
  const cached = session.cache.get(id);
  if (cached) return cached;
  const source = session.sources.get(id);
  if (!source || !isDataTool(source.tool)) return undefined;
  const outcome = runDataTool(session.ctx, source.tool, source.args);
  if (!outcome.ok || 'entity' in outcome) return undefined;
  const dataset: Dataset = { id, title: outcome.title, columns: outcome.columns, rows: outcome.rows, source, caveats: outcome.caveats, truncated: outcome.truncated, matched: outcome.matched, summary: outcome.summary };
  session.cache.set(id, dataset);
  return dataset;
}

export function controlTable(session: Session, id: string): TableName | null {
  const tool = session.sources.get(id)?.tool;
  return tool === 'query_games' ? 'team_games' : tool === 'query_seasons' ? 'seasons' : null;
}

/** Re-runs a stored query with extra filters from the chart controls. No model call is involved. */
export function rerunDataset(session: Session, id: string, controls: Controls): Dataset | undefined {
  const base = datasetOf(session, id);
  const table = controlTable(session, id);
  if (!base || !table) return base;
  const parsed = parseQuery(table, base.source.args);
  if (!parsed.ok) return base;
  const result = runQuery(session.ctx.tables, table, applyControls(table, parsed.value, controls));
  if (!result.ok) return base;
  return { ...base, columns: result.value.columns, rows: result.value.rows, caveats: result.value.caveats, truncated: result.value.truncated, matched: result.value.matched };
}

export function validationEnv(session: Session): ValidationEnv {
  return { dataset: id => datasetOf(session, id), managers: () => session.managers };
}

export function restoreSources(session: Session, entries: Array<{ id: string; source: Source }>) {
  for (const entry of entries) {
    if (!/^ds\d{1,4}$/.test(entry.id) || !isDataTool(entry.source.tool)) continue;
    session.sources.set(entry.id, { tool: entry.source.tool, args: entry.source.args });
    session.next = Math.max(session.next, Number(entry.id.slice(2)) + 1);
  }
}

export interface ToolRun {
  /** What is sent back to the model. */
  response: Record<string, unknown>;
  dataset?: Dataset;
  chart?: { spec: ChartSpec; warnings: string[] };
  /** Short note for the progress line in the UI. */
  note: string;
}

const NOTES: Record<string, string> = {
  query_games: 'Searching games', query_seasons: 'Searching seasons', resolve_entity: 'Matching names', head_to_head: 'Comparing managers',
  manager_career: 'Reading a career', records: 'Checking the record book', title_years: 'Checking title winners', draft_slot_stats: 'Checking draft slots',
  week_slice: 'Reading a week in history', render_chart: 'Drawing a chart',
};

export function executeTool(session: Session, name: string, rawArgs: unknown): ToolRun {
  const args = (typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs) ? rawArgs : {}) as Record<string, unknown>;
  const note = NOTES[name] ?? 'Working';
  if (name === 'render_chart') {
    const result = validateSpec(normalizeModelSpec(args), validationEnv(session));
    if (!result.ok) return { note, response: { ok: false, errors: result.errors, hint: 'Fix the listed problems and call render_chart again, or answer in text.' } };
    return {
      note, chart: { spec: result.spec, warnings: result.warnings },
      response: { ok: true, shown: true, message: 'The chart is now displayed to the user. Do not describe its layout; summarize what it shows.', warnings: result.warnings },
    };
  }
  if (!isDataTool(name)) return { note, response: { ok: false, error: `Unknown tool "${name}".` } };
  const outcome = runDataTool(session.ctx, name, args);
  if (!outcome.ok) return { note, response: { ok: false, error: outcome.error } };
  if ('entity' in outcome) return { note, response: { ok: true, ...outcome.entity } };
  const id = `ds${session.next}`;
  session.next += 1;
  const source: Source = { tool: name, args };
  const dataset: Dataset = { id, title: outcome.title, columns: outcome.columns, rows: outcome.rows, source, caveats: outcome.caveats, truncated: outcome.truncated, matched: outcome.matched, summary: outcome.summary };
  session.sources.set(id, source);
  session.cache.set(id, dataset);
  return { note, dataset, response: datasetForModel(dataset) };
}
