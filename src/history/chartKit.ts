import type { Archive, Cell, Dataset } from './askTools.ts';

export interface Theme {
  text: string;
  muted: string;
  line: string;
  accent: string;
  surface: string;
  dark: boolean;
  palette: string[];
}

export const LIGHT_THEME: Theme = {
  text: '#151719', muted: '#62686d', line: '#d9dcdf', accent: '#0076b6', surface: '#ffffff', dark: false,
  palette: ['#0076b6', '#d9822b', '#2a9d6f', '#b04a8f', '#5b6ee1', '#c8453d', '#7a8b2d', '#2fa4b8', '#8e6bbf', '#6b7280'],
};

export const DARK_THEME: Theme = {
  text: '#f4f5f6', muted: '#c2c6cb', line: '#3a4048', accent: '#4aa8dd', surface: '#1f1f1f', dark: true,
  palette: ['#4aa8dd', '#f0a155', '#4cc08e', '#d77fb8', '#8c9bf0', '#ee7a72', '#a8b84a', '#5cc4d6', '#b99be0', '#9ca3af'],
};

export interface Card { label: string; value: string; note?: string }

export interface ResolvedChart {
  kind: 'echarts' | 'table' | 'cards';
  title: string;
  subtitle?: string;
  /** Local-only: may contain functions, so it is never serialised or shared. */
  option?: Record<string, unknown>;
  cards?: Card[];
  table: { columns: string[]; rows: Cell[][] };
  summary: string;
  caveats: string[];
  warnings: string[];
  /** Suggested pixel height for the chart area. */
  height: number;
  /** Controls that make sense for this chart. */
  datasetIds: string[];
}

export interface BuildEnv {
  dataset(id: string): Dataset | undefined;
  archive: Archive;
  theme: Theme;
  color(name: string): string;
}

export type ColorMap = ((name: string) => string) & { reset(): void };

export function createColorMap(palette: () => string[]): ColorMap {
  const assigned = new Map<string, number>();
  const pick = ((name: string) => {
    let index = assigned.get(name);
    if (index === undefined) { index = assigned.size; assigned.set(name, index); }
    const colors = palette();
    return colors[index % colors.length];
  }) as ColorMap;
  pick.reset = () => assigned.clear();
  return pick;
}

export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export const fmt = (value: Cell | undefined, places = 1): string => {
  if (value === null || value === undefined) return '\u2014';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(places).replace(/\.?0+$/, '');
  return String(value);
};

export function axisStyle(theme: Theme, grid = true) {
  return {
    axisLine: { lineStyle: { color: theme.line } },
    axisTick: { lineStyle: { color: theme.line } },
    axisLabel: { color: theme.muted, hideOverlap: true },
    nameTextStyle: { color: theme.muted, align: 'left' as 'left' | 'center' },
    splitLine: { show: grid, lineStyle: { color: theme.line, opacity: 0.55 } },
  };
}

export function baseOption(theme: Theme, opts: { legend?: boolean; zoom?: boolean; top?: number } = {}) {
  return {
    animationDuration: 600,
    animationDurationUpdate: 500,
    animationEasing: 'cubicOut' as const,
    color: theme.palette,
    textStyle: { color: theme.text },
    grid: { left: 8, right: 18, top: opts.top ?? (opts.legend ? 44 : 20), bottom: opts.zoom ? 56 : 12, containLabel: true },
    legend: opts.legend ? { type: 'scroll' as const, top: 0, textStyle: { color: theme.text }, pageIconColor: theme.text, pageTextStyle: { color: theme.muted }, inactiveColor: theme.line } : undefined,
    tooltip: {
      confine: true, backgroundColor: theme.dark ? '#26292d' : '#ffffff', borderColor: theme.line, textStyle: { color: theme.text },
      axisPointer: { type: 'shadow' as const },
    },
    dataZoom: opts.zoom ? [
      { type: 'inside' as const },
      { type: 'slider' as const, height: 18, bottom: 8, borderColor: theme.line, textStyle: { color: theme.muted }, fillerColor: theme.dark ? 'rgba(74,168,221,0.25)' : 'rgba(0,118,182,0.18)' },
    ] : undefined,
  };
}

export function tableOf(dataset: Dataset, columns?: string[], limit = 500): ResolvedChart['table'] {
  const names = columns?.length ? columns : dataset.columns.map(column => column.name);
  return { columns: names, rows: dataset.rows.slice(0, limit).map(row => names.map(name => row[name] ?? null)) };
}

export function csvOf(table: ResolvedChart['table']): string {
  const quote = (cell: Cell) => {
    const text = cell === null ? '' : String(cell);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [table.columns.map(quote).join(','), ...table.rows.map(row => row.map(quote).join(','))].join('\r\n');
}

/** Turns a click on a chart element into a follow-up question for the assistant. */
export function drillPrompt(params: { data?: unknown; name?: unknown; seriesName?: unknown; componentType?: unknown }, title: string): string | null {
  const data = params.data as { drill?: unknown } | undefined;
  if (data && typeof data === 'object' && typeof data.drill === 'string') return data.drill.slice(0, 200);
  const name = typeof params.name === 'string' ? params.name.trim() : '';
  const series = typeof params.seriesName === 'string' ? params.seriesName.trim() : '';
  if (!name && !series) return null;
  const context = title.length > 70 ? `${title.slice(0, 67)}...` : title;
  const subject = series && name && series !== name ? `${series} in ${name}` : name || series;
  return `Tell me more about ${subject} (from the chart "${context}")`.slice(0, 240);
}

export function emptyChart(title: string, message: string, extras: Partial<ResolvedChart> = {}): ResolvedChart {
  return { kind: 'table', title, table: { columns: [], rows: [] }, summary: message, caveats: [message], warnings: [], height: 120, datasetIds: [], ...extras };
}

export function numberList(values: Array<number | null>) { return values.filter((value): value is number => value !== null); }

export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}
