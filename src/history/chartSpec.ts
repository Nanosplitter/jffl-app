import type { Dataset } from './askTools.ts';

export const CHART_TYPES = ['line', 'area', 'bar', 'stacked_bar', 'scatter', 'heatmap', 'radar', 'boxplot', 'table', 'stat_cards', 'rank_over_time'] as const;
export const RECIPES = ['rivalry_matrix', 'season_race', 'career_timeline', 'trophy_wall', 'scoring_distribution', 'draft_slot_curve', 'h2h_scoreboard'] as const;
export type ChartType = (typeof CHART_TYPES)[number];
export type RecipeName = (typeof RECIPES)[number];
export type ChartKind = ChartType | RecipeName | 'echarts';
export const ALL_KINDS: readonly string[] = [...CHART_TYPES, ...RECIPES, 'echarts'];
export const LEAGUES = ['Combined', 'Premier', 'Championship', 'League One', 'JFFL'] as const;
export const FIRST_SEASON = 2002;
export const LAST_SEASON = 2025;

export interface RecipeParams {
  managers?: string[];
  manager?: string;
  a?: string;
  b?: string;
  season?: number;
  league?: string;
  from?: number;
  to?: number;
  metric?: string;
  bin?: number;
}

export interface ChartSpec {
  type: ChartKind;
  title: string;
  subtitle?: string;
  datasetId?: string;
  x?: string;
  y?: string[];
  series?: string;
  value?: string;
  label?: string;
  sort?: 'none' | 'x' | 'y_desc' | 'y_asc';
  horizontal?: boolean;
  yMin?: number;
  yMax?: number;
  highlight?: string[];
  params?: RecipeParams;
  option?: Record<string, unknown>;
}

export interface ValidationEnv {
  dataset(id: string): Dataset | undefined;
  managers(): string[];
}

export type Validation =
  | { ok: true; spec: ChartSpec; warnings: string[] }
  | { ok: false; errors: string[] };

export const MAX_OPTION_CHARS = 24_000;
const MAX_DATA_POINTS = 1000;
const MAX_NODES = 6000;
const MAX_DEPTH = 9;
const MAX_STRING = 200;
const MAX_SERIES = 12;
const MAX_CATEGORIES = 400;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

// ---------- ECharts option sanitizer ----------

const TOP_KEYS = new Set(['title', 'tooltip', 'legend', 'grid', 'xAxis', 'yAxis', 'series', 'visualMap', 'dataZoom', 'radar', 'color', 'animation', 'animationDuration', 'textStyle']);
const SERIES_TYPES = new Set(['line', 'bar', 'scatter', 'heatmap', 'radar', 'boxplot', 'pie', 'treemap']);
const BLOCKED_KEYS = new Set([
  'link', 'sublink', 'target', 'sublinkTarget', 'extraCssText', 'renderMode', 'appendToBody', 'rich', 'backgroundColor',
  'graphic', 'toolbox', 'brush', 'timeline', 'baseOption', 'options', 'media', 'dataset', 'transform', 'aria',
  '__proto__', 'constructor', 'prototype',
]);
const UNSAFE_TEXT = /[<>]|&#|javascript:|data:|https?:|\/\/|url\(|image:|path:|\\u|\bon[a-z]+\s*=/i;

export interface SanitizeResult { option: Record<string, unknown>; warnings: string[]; datasetIds: string[] }

/**
 * Validates and cleans a model-supplied ECharts option. With `expand` false the `$data`/`$rows`
 * bindings are checked but kept as references, which is the compact form stored in specs and links.
 */
export function sanitizeOption(input: unknown, env: ValidationEnv, expand = true): { ok: true; value: SanitizeResult } | { ok: false; error: string } {
  let raw = input;
  if (typeof raw === 'string') {
    if (raw.length > MAX_OPTION_CHARS) return { ok: false, error: `The ECharts option is too large (limit ${MAX_OPTION_CHARS} characters).` };
    try { raw = JSON.parse(raw); } catch { return { ok: false, error: 'The ECharts option is not valid JSON.' }; }
  }
  if (!isObject(raw)) return { ok: false, error: 'The ECharts option must be a JSON object.' };
  const warnings: string[] = [];
  const datasetIds = new Set<string>();
  let nodes = 0;
  let failure: string | null = null;

  const bind = (spec: unknown): unknown => {
    if (!isObject(spec)) return null;
    const column = typeof spec.$data === 'string' ? spec.$data : null;
    const rows = typeof spec.$rows === 'string' ? spec.$rows : null;
    const ref = column ?? rows;
    if (!ref) return null;
    const dot = ref.indexOf('.');
    const dataset = env.dataset(dot > 0 ? ref.slice(0, dot) : '');
    if (!dataset) { failure = `Data binding "${ref}" names an unknown dataset.`; return []; }
    datasetIds.add(dataset.id);
    const fields = ref.slice(dot + 1).split(',').map(name => name.trim()).filter(Boolean);
    for (const field of fields) if (!dataset.columns.some(item => item.name === field)) { failure = `Data binding "${ref}": dataset ${dataset.id} has no column "${field}". Columns: ${dataset.columns.map(item => item.name).join(', ')}.`; return []; }
    if (dataset.rows.length > MAX_DATA_POINTS) { failure = `Data binding "${ref}" has too many rows.`; return []; }
    if (!expand) return column ? { $data: ref } : { $rows: ref };
    if (column) return dataset.rows.map(row => row[fields[0]] ?? null);
    return dataset.rows.map(row => fields.map(field => row[field] ?? null));
  };

  const walk = (value: unknown, depth: number, path: string, key: string): unknown => {
    if (failure) return undefined;
    nodes += 1;
    if (nodes > MAX_NODES) { failure = 'The ECharts option has too many values.'; return undefined; }
    if (depth > MAX_DEPTH) { failure = 'The ECharts option is nested too deeply.'; return undefined; }
    if (value === null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.length > MAX_STRING || UNSAFE_TEXT.test(value)) { warnings.push(`Removed an unsafe or oversized string at ${path}.`); return undefined; }
      if (key === 'type' && /^series\[\d+\]\.type$/.test(path) && !SERIES_TYPES.has(value)) { failure = `Series type "${value}" is not available. Use ${[...SERIES_TYPES].join(', ')}.`; return undefined; }
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length > MAX_DATA_POINTS) { failure = `${path} has too many items.`; return undefined; }
      return value.map((item, index) => walk(item, depth + 1, `${path}[${index}]`, key)).filter(item => item !== undefined);
    }
    if (isObject(value)) {
      const bound = bind(value);
      if (bound !== null) return bound;
      const out: Record<string, unknown> = {};
      for (const [name, item] of Object.entries(value)) {
        if (BLOCKED_KEYS.has(name) || !/^[A-Za-z$][A-Za-z0-9]*$/.test(name)) { warnings.push(`Removed option "${name}" at ${path}.`); continue; }
        const cleaned = walk(item, depth + 1, path ? `${path}.${name}` : name, name);
        if (cleaned !== undefined) out[name] = cleaned;
      }
      return out;
    }
    return undefined;
  };

  const option: Record<string, unknown> = {};
  for (const [name, item] of Object.entries(raw)) {
    if (!TOP_KEYS.has(name)) { warnings.push(`Removed unsupported top-level option "${name}".`); continue; }
    const cleaned = walk(item, 1, name, name);
    if (cleaned !== undefined) option[name] = cleaned;
  }
  if (failure) return { ok: false, error: failure };
  const series = option.series;
  if (!Array.isArray(series) || !series.length) return { ok: false, error: 'The ECharts option needs at least one series.' };
  if (series.length > 8) return { ok: false, error: 'The ECharts option has too many series (limit 8).' };
  for (const item of series) {
    if (!isObject(item) || typeof item.type !== 'string' || !SERIES_TYPES.has(item.type)) return { ok: false, error: `Each series needs a type from ${[...SERIES_TYPES].join(', ')}.` };
  }
  return { ok: true, value: { option, warnings, datasetIds: [...datasetIds] } };
}

// ---------- Spec validation ----------

const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const finite = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};
const stringList = (value: unknown, max: number): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const cleaned = list.map(item => String(item).trim()).filter(Boolean).slice(0, max);
  return cleaned.length ? cleaned : undefined;
};

function canonicalManager(env: ValidationEnv, name: unknown): string | null {
  const wanted = String(name ?? '').trim().toLowerCase();
  return env.managers().find(manager => manager.toLowerCase() === wanted) ?? null;
}

function cleanParams(raw: unknown, env: ValidationEnv, errors: string[]): RecipeParams {
  const out: RecipeParams = {};
  if (!isObject(raw)) return out;
  const managerList = stringList(raw.managers, 16);
  if (managerList) {
    out.managers = [];
    for (const name of managerList) {
      const found = canonicalManager(env, name);
      if (found) out.managers.push(found); else errors.push(`Unknown manager "${name}" in params.managers. Use resolve_entity first.`);
    }
  }
  for (const key of ['manager', 'a', 'b'] as const) {
    if (raw[key] === undefined || raw[key] === null || raw[key] === '') continue;
    const found = canonicalManager(env, raw[key]);
    if (found) out[key] = found; else errors.push(`Unknown manager "${String(raw[key])}" in params.${key}. Use resolve_entity first.`);
  }
  for (const key of ['season', 'from', 'to'] as const) {
    const number = finite(raw[key]);
    if (number === undefined) continue;
    if (number < FIRST_SEASON || number > LAST_SEASON) errors.push(`params.${key} must be between ${FIRST_SEASON} and ${LAST_SEASON}.`);
    else out[key] = Math.floor(number);
  }
  const bin = finite(raw.bin);
  if (bin !== undefined) out.bin = Math.max(2, Math.min(50, Math.floor(bin)));
  if (typeof raw.league === 'string' && raw.league.trim()) {
    const league = LEAGUES.find(item => item.toLowerCase() === String(raw.league).trim().toLowerCase());
    if (league) out.league = league; else errors.push(`params.league must be one of ${LEAGUES.join(', ')}.`);
  }
  if (typeof raw.metric === 'string' && raw.metric.trim()) out.metric = raw.metric.trim().slice(0, 30);
  return out;
}

export function datasetIdsOf(spec: ChartSpec): string[] {
  const ids = new Set<string>();
  if (spec.datasetId) ids.add(spec.datasetId);
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (isObject(value)) {
      for (const [key, item] of Object.entries(value)) {
        if ((key === '$data' || key === '$rows') && typeof item === 'string') ids.add(item.slice(0, Math.max(0, item.indexOf('.'))));
        else walk(item);
      }
    }
  };
  walk(spec.option);
  return [...ids].filter(Boolean);
}

export function validateSpec(raw: unknown, env: ValidationEnv): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ['The chart spec must be an object.'] };
  const type = String(raw.type ?? '');
  if (!ALL_KINDS.includes(type)) return { ok: false, errors: [`Unknown chart type "${type}". Use one of ${ALL_KINDS.join(', ')}.`] };
  const kind = type as ChartKind;
  const title = text(raw.title, 120);
  if (!title) errors.push('A chart needs a short title.');
  const spec: ChartSpec = { type: kind, title };
  const subtitle = text(raw.subtitle, 200);
  if (subtitle) spec.subtitle = subtitle;
  if (UNSAFE_TEXT.test(title) || UNSAFE_TEXT.test(subtitle)) errors.push('Titles cannot contain markup or links.');

  const isRecipe = (RECIPES as readonly string[]).includes(kind);
  if (isRecipe) {
    spec.params = cleanParams(raw.params, env, errors);
    const p = spec.params;
    if (kind === 'career_timeline' && !p.manager) errors.push('career_timeline needs params.manager.');
    if (kind === 'h2h_scoreboard' && (!p.a || !p.b || p.a === p.b)) errors.push('h2h_scoreboard needs two different managers in params.a and params.b.');
    if (kind === 'season_race' && !p.season) errors.push('season_race needs params.season.');
    if (kind === 'scoring_distribution' && p.from && p.to && p.from > p.to) errors.push('params.from must not be after params.to.');
    return errors.length ? { ok: false, errors } : { ok: true, spec, warnings };
  }

  if (kind === 'echarts') {
    const optionInput = raw.option ?? raw.optionJson;
    if (optionInput === undefined) errors.push('echarts charts need an option (JSON).');
    else {
      const cleaned = sanitizeOption(optionInput, env, false);
      if (!cleaned.ok) errors.push(cleaned.error);
      else { spec.option = cleaned.value.option; warnings.push(...cleaned.value.warnings); }
    }
    return errors.length ? { ok: false, errors } : { ok: true, spec, warnings };
  }

  const datasetId = text(raw.datasetId, 20);
  const dataset = datasetId ? env.dataset(datasetId) : undefined;
  if (!datasetId) errors.push(`${kind} charts need a datasetId from a query tool.`);
  else if (!dataset) errors.push(`Unknown datasetId "${datasetId}". Run a query tool first and use the datasetId it returns.`);
  spec.datasetId = datasetId;
  if (!dataset) return { ok: false, errors };

  const column = (name: string | undefined, label: string, numeric = false): string | undefined => {
    if (!name) return undefined;
    const found = dataset.columns.find(item => item.name === name) ?? dataset.columns.find(item => item.name.toLowerCase() === name.toLowerCase());
    if (!found) { errors.push(`${label} "${name}" is not a column of ${dataset.id}. Columns: ${dataset.columns.map(item => `${item.name} (${item.type})`).join(', ')}.`); return undefined; }
    if (numeric && found.type !== 'number') { errors.push(`${label} "${found.name}" must be numeric.`); return undefined; }
    return found.name;
  };
  const x = text(raw.x, 60) || undefined;
  const seriesColumn = text(raw.series, 60) || undefined;
  const valueColumn = text(raw.value, 60) || undefined;
  const labelColumn = text(raw.label, 60) || undefined;
  const yList = stringList(raw.y, 8);
  const ySet = yList?.map(name => column(name, 'y', true)).filter((name): name is string => !!name);

  if (kind === 'table') {
    const shown = yList?.map(name => column(name, 'column')).filter((name): name is string => !!name);
    if (shown?.length) spec.y = shown;
  } else if (kind === 'stat_cards') {
    if (ySet?.length) spec.y = ySet;
    const label = column(labelColumn, 'label');
    if (label) spec.label = label;
    const value = column(valueColumn, 'value', true);
    if (value) spec.value = value;
    if (dataset.rows.length > 1 && (!spec.value || !spec.label)) errors.push('stat_cards on a multi-row dataset needs label and value columns.');
    if (dataset.rows.length > 8) errors.push('stat_cards shows at most 8 cards. Use fewer rows or another chart type.');
  } else if (kind === 'heatmap') {
    const xc = column(x, 'x');
    const rowc = column(seriesColumn, 'series');
    const vc = column(valueColumn ?? yList?.[0], 'value', true);
    if (!xc || !rowc || !vc) errors.push('heatmap needs x (column category), series (row category), and value (numeric).');
    else { spec.x = xc; spec.series = rowc; spec.value = vc; }
  } else if (kind === 'radar') {
    if (!ySet || ySet.length < 3 || ySet.length > 8) errors.push('radar needs 3 to 8 numeric columns in y, one per axis.');
    else spec.y = ySet;
    const label = column(labelColumn ?? seriesColumn ?? x, 'label');
    if (!label) errors.push('radar needs a label column that names each row.');
    else spec.label = label;
    if (dataset.rows.length > 6) errors.push('radar draws at most 6 rows. Filter or limit the dataset.');
  } else if (kind === 'boxplot') {
    const xc = column(x, 'x');
    const yc = column(yList?.[0], 'y', true);
    if (!xc || !yc) errors.push('boxplot needs x (category) and one numeric y column of raw values.');
    else { spec.x = xc; spec.y = [yc]; }
  } else {
    const xc = column(x, 'x');
    if (!xc) errors.push(`${kind} needs an x column.`);
    else spec.x = xc;
    if (!ySet?.length) errors.push(`${kind} needs at least one numeric y column.`);
    else spec.y = ySet;
    const sc = column(seriesColumn, 'series');
    if (sc) spec.series = sc;
    if (spec.series && spec.y && spec.y.length > 1) errors.push('Use either a series column or several y columns, not both.');
    if (kind === 'scatter' && spec.x) {
      if (dataset.columns.find(item => item.name === spec.x)?.type !== 'number') errors.push('scatter needs a numeric x column.');
      const label = column(labelColumn, 'label');
      if (label) spec.label = label;
    }
    if (kind === 'rank_over_time' && (!spec.series || spec.y?.length !== 1)) errors.push('rank_over_time needs a series column and exactly one y column holding the rank.');
  }

  if (raw.sort !== undefined) {
    if (['none', 'x', 'y_desc', 'y_asc'].includes(String(raw.sort))) spec.sort = raw.sort as ChartSpec['sort'];
    else errors.push('sort must be none, x, y_desc, or y_asc.');
  }
  if (raw.horizontal === true) spec.horizontal = true;
  const yMin = finite(raw.yMin); const yMax = finite(raw.yMax);
  if (yMin !== undefined) spec.yMin = yMin;
  if (yMax !== undefined) spec.yMax = yMax;
  const highlight = stringList(raw.highlight, 20);
  if (highlight) spec.highlight = highlight;

  if (spec.series) {
    const distinct = new Set(dataset.rows.map(row => String(row[spec.series!])));
    if (distinct.size > MAX_SERIES) errors.push(`The series column has ${distinct.size} values. A chart can draw at most ${MAX_SERIES} series, so filter or limit the dataset.`);
  }
  const xName = spec.x;
  if (xName && ['line', 'area', 'bar', 'stacked_bar', 'rank_over_time', 'heatmap'].includes(kind)) {
    const categories = new Set(dataset.rows.map(row => String(row[xName])));
    if (categories.size > MAX_CATEGORIES) errors.push(`The x column has ${categories.size} values; limit is ${MAX_CATEGORIES}.`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, spec, warnings };
}

/** Accepts the flat arguments the model sends to render_chart. */
export function normalizeModelSpec(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...args };
  if (typeof out.y === 'string') out.y = out.y.split(',').map(item => item.trim()).filter(Boolean);
  if (typeof out.highlight === 'string') out.highlight = out.highlight.split(',').map(item => item.trim()).filter(Boolean);
  if (typeof out.horizontal === 'string') out.horizontal = out.horizontal === 'true';
  return out;
}
