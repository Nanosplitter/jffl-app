import { DARK_THEME, LIGHT_THEME, axisStyle, baseOption, esc, type Theme } from './chartKit.ts';
import type { SeriesRow, YearScore } from './stats.ts';

export interface ChartPoint {
  value: number;
  url?: string;
  tip: string;
  color?: string;
  label?: string;
  /** Selecting this bar chooses these two managers, in display order. */
  pair?: [string, string];
}

export function chartTheme(dark: boolean) {
  const theme = dark ? DARK_THEME : LIGHT_THEME;
  const accent = typeof document === 'undefined' ? theme.accent : getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || theme.accent;
  return { theme, accent };
}

function tooltip(theme: Theme) {
  return { ...baseOption(theme).tooltip, confine: true, trigger: 'item' as const };
}

function yZoom(theme: Theme, count: number, visible: number) {
  if (count <= visible) return undefined;
  const end = Math.round(visible / count * 1000) / 10;
  const slider = {
    type: 'slider' as const, yAxisIndex: 0, start: 0, end, width: 14, right: 2,
    borderColor: theme.line, textStyle: { color: theme.muted }, showDetail: false,
    fillerColor: theme.dark ? 'rgba(74,168,221,0.25)' : 'rgba(0,118,182,0.18)',
  };
  return [
    { type: 'inside' as const, yAxisIndex: 0, start: 0, end, zoomOnMouseWheel: true, moveOnMouseWheel: true },
    slider,
  ];
}

export function horizontalBars(dark: boolean, categories: string[], points: ChartPoint[], opts: { name?: string; max?: number; visible?: number; room?: number; fontSize?: number; barMaxWidth?: number; nameWidth?: number; labelInside?: boolean; reference?: { value: number; name: string; label: string; tip: string } } = {}) {
  const { theme, accent } = chartTheme(dark);
  const reference = opts.reference;
  const names = reference ? [...categories, reference.name] : categories;
  const rows: ChartPoint[] = reference ? [...points, { value: reference.value, label: reference.label, tip: reference.tip, color: theme.palette[1] }] : points;
  const visible = Math.max(opts.visible ?? 12, names.length <= 16 ? names.length : 0);
  const zoom = yZoom(theme, names.length, visible);
  const labeled = rows.some(point => point.label);
  const inside = opts.labelInside === true;
  const room = inside ? 12 : opts.room ?? (labeled ? 132 : 16);
  const size = opts.fontSize ?? 12;
  const ink = (color?: string) => color === theme.palette[1] || (theme.dark && color === theme.palette[5]) ? '#151719' : '#ffffff';
  return {
    ...baseOption(theme),
    legend: undefined,
    grid: { left: 8, right: zoom ? room + 28 : room, top: 8, bottom: 8, containLabel: true },
    tooltip: { ...tooltip(theme), formatter: (params: { data?: ChartPoint & { stat?: string } }) => params.data?.tip ?? '' },
    dataZoom: zoom,
    xAxis: { type: 'value' as const, min: 0, max: opts.max, ...axisStyle(theme), axisLabel: { color: theme.muted, fontSize: size, hideOverlap: true } },
    yAxis: {
      type: 'category' as const, data: names, inverse: true, ...axisStyle(theme, false),
      triggerEvent: rows.some(point => point.pair),
      axisLabel: {
        color: (value: string) => value === reference?.name ? theme.palette[1] : theme.text,
        interval: 0, width: opts.nameWidth ?? (inside ? 128 : 180), overflow: 'truncate' as const, fontSize: size,
      },
    },
    series: [{
      type: 'bar' as const, name: opts.name ?? 'Value', cursor: rows.some(point => point.url || point.pair) ? 'pointer' as const : 'default' as const,
      data: rows.map(point => ({
        value: point.value, tip: point.tip, url: point.url, pair: point.pair, stat: point.label,
        itemStyle: { color: point.color ?? accent, borderRadius: inside ? [6, 6, 6, 6] : [0, 6, 6, 0] },
        label: inside ? { color: ink(point.color ?? accent) } : undefined,
      })),
      barMaxWidth: opts.barMaxWidth ?? 22,
      label: {
        show: labeled, position: inside ? 'insideLeft' as const : 'right' as const, distance: inside ? 10 : 10,
        overflow: inside ? 'none' as const : undefined,
        color: theme.text, fontSize: opts.fontSize ? opts.fontSize : 13, fontWeight: 600, lineHeight: inside ? 18 : undefined,
        formatter: (params: { data?: { stat?: string } }) => params.data?.stat ?? '',
      },
      emphasis: { itemStyle: { opacity: 0.85 } },
    }],
  };
}

export interface StackPart { name: string; color: string; values: number[]; }

export function stackedBars(dark: boolean, categories: string[], parts: StackPart[], opts: { labels: string[]; tips: string[]; urls?: Array<string | undefined>; fontSize?: number; room?: number; visible?: number; reference?: { value: number; name: string; label: string; tip: string; color?: string } }) {
  const { theme } = chartTheme(dark);
  const reference = opts.reference;
  const names = reference ? [...categories, reference.name] : categories;
  const size = opts.fontSize ?? 13;
  const room = opts.room ?? 112;
  const visible = Math.max(opts.visible ?? 12, names.length <= 16 ? names.length : 0);
  const zoom = yZoom(theme, names.length, visible);
  const common = baseOption(theme, { legend: true });
  const lastIndex = categories.map((_, row) => parts.reduce((last, part, index) => (part.values[row] ?? 0) > 0 ? index : last, -1));
  const tipFor = (row: number) => (reference && row === categories.length ? reference.tip : opts.tips[row] ?? '');
  const series = parts.map((part, index) => ({
    type: 'bar' as const,
    name: part.name,
    stack: 'titles',
    color: part.color,
    cursor: 'pointer' as const,
    barMaxWidth: 28,
    itemStyle: { color: part.color },
    emphasis: { focus: 'series' as const },
    data: names.map((_, row) => {
      const value = reference && row === categories.length ? 0 : part.values[row] ?? 0;
      const end = lastIndex[row] === index;
      return {
        value,
        url: opts.urls?.[row],
        tip: tipFor(row),
        itemStyle: { color: part.color, borderRadius: end ? [0, 6, 6, 0] : 0, borderColor: theme.dark ? '#1f1f1f' : '#ffffff', borderWidth: value > 0 ? 1 : 0 },
      };
    }),
    label: {
      show: true, position: 'right' as const, color: theme.text, fontSize: size, fontWeight: 600, distance: 8,
      formatter: (params: { dataIndex?: number }) => {
        const row = params.dataIndex ?? -1;
        if (row < 0 || row >= categories.length || lastIndex[row] !== index) return '';
        return opts.labels[row] ?? '';
      },
    },
  }));
  if (reference) series.push({
    type: 'bar' as const,
    name: 'Typical',
    stack: 'typical',
    cursor: 'default' as const,
    barMaxWidth: 28,
    barGap: '-100%',
    emphasis: { focus: 'none' as const },
    data: names.map((_, row) => row === categories.length ? {
      value: reference.value,
      tip: reference.tip,
      itemStyle: { color: reference.color ?? theme.palette[9], borderRadius: [0, 6, 6, 0] },
    } : { value: null, tip: '', itemStyle: { color: 'transparent', borderRadius: 0 } }),
    label: {
      show: true, position: 'right' as const, color: theme.text, fontSize: size, fontWeight: 600, distance: 8,
      formatter: (params: { dataIndex?: number }) => params.dataIndex === categories.length ? reference.label : '',
    },
  });
  return {
    ...common,
    legend: { ...common.legend, data: parts.map(part => part.name), icon: 'roundRect', itemWidth: 28, itemHeight: 14, itemGap: 28, textStyle: { color: theme.text, fontSize: Math.max(size, 16) } },
    grid: { left: 8, right: zoom ? room + 28 : room, top: 48, bottom: 8, containLabel: true },
    tooltip: {
      ...common.tooltip, trigger: 'axis' as const,
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ data?: { tip?: string } }>;
        return params.find(item => item.data?.tip)?.data?.tip ?? '';
      },
    },
    dataZoom: zoom,
    xAxis: { type: 'value' as const, min: 0, ...axisStyle(theme) },
    yAxis: {
      type: 'category' as const, data: names, inverse: true, ...axisStyle(theme, false),
      axisLabel: {
        color: (value: string) => value === reference?.name ? (reference.color ?? theme.palette[9]) : theme.text,
        interval: 0, width: 220, overflow: 'truncate' as const, fontSize: size,
      },
    },
    series,
  };
}

function signedMargin(value: number) {
  const abs = Math.abs(value);
  const text = Number.isInteger(abs) ? String(abs) : abs.toFixed(1).replace(/\.0$/, '');
  if (value > 0) return `+${text}`;
  if (value < 0) return `-${text}`;
  return '0';
}

export function signedBars(dark: boolean, categories: string[], points: ChartPoint[]) {
  const { theme, accent } = chartTheme(dark);
  const zoom = categories.length > 14;
  const values = points.map(point => point.value).filter(value => Number.isFinite(value));
  const peak = Math.max(0, ...values);
  const trough = Math.min(0, ...values);
  const pad = Math.max(12, Math.round((peak - trough) * 0.22));
  return {
    ...baseOption(theme, { zoom }),
    legend: undefined,
    textStyle: { color: theme.text, fontSize: 15 },
    grid: { left: 8, right: 16, top: 36, bottom: zoom ? 78 : 28, containLabel: true },
    tooltip: { ...tooltip(theme), textStyle: { color: theme.text, fontSize: 16 }, formatter: (params: { data?: ChartPoint }) => params.data?.tip ?? '' },
    xAxis: {
      type: 'category' as const, data: categories, ...axisStyle(theme, false),
      axisLabel: { color: theme.text, fontSize: 14, interval: 0, hideOverlap: false, rotate: categories.length > 16 ? 40 : 0 },
    },
    yAxis: {
      type: 'value' as const, min: Math.floor(trough - pad), max: Math.ceil(peak + pad), ...axisStyle(theme),
      axisLabel: { color: theme.muted, fontSize: 15 },
    },
    series: [{
      type: 'bar' as const, name: 'Margin',
      data: points.map(point => ({
        ...point,
        label: { position: point.value >= 0 ? 'top' as const : 'bottom' as const },
        itemStyle: { color: point.value > 0 ? accent : point.value < 0 ? theme.palette[5] : theme.muted, borderRadius: point.value >= 0 ? [6, 6, 0, 0] : [0, 0, 6, 6] },
      })),
      barMaxWidth: 36,
      label: {
        show: true, color: theme.text, fontSize: 14, fontWeight: 600, distance: 6,
        formatter: (params: { data?: ChartPoint }) => params.data ? signedMargin(params.data.value) : '',
      },
      labelLayout: { moveOverlap: 'shiftY' as const },
    }],
  };
}

export function scoringLine(dark: boolean, years: YearScore[]) {
  const { theme, accent } = chartTheme(dark);
  const common = baseOption(theme, { zoom: true });
  const breakSeason = years.find(year => year.season === 2013)?.season;
  return {
    ...common,
    grid: { left: 8, right: 16, top: 18, bottom: 58, containLabel: true },
    tooltip: {
      ...common.tooltip, trigger: 'axis' as const,
      axisPointer: { type: 'line' as const, lineStyle: { color: theme.muted, type: 'dashed' as const } },
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ dataIndex?: number }>;
        const year = years[params[0]?.dataIndex ?? -1];
        if (!year) return '';
        return `<b>${year.season}</b><br/>Mean score: ${year.mean}<br/>Games: ${year.games.toLocaleString('en-US')}`;
      },
    },
    xAxis: {
      type: 'category' as const, data: years.map(year => String(year.season)), boundaryGap: false, ...axisStyle(theme, false),
      axisLabel: { color: theme.muted, hideOverlap: true, formatter: (value: string) => value.slice(2) },
    },
    yAxis: { type: 'value' as const, min: 0, max: 120, interval: 40, ...axisStyle(theme) },
    series: [{
      type: 'line' as const, name: 'Mean score', data: years.map(year => year.mean),
      symbol: 'circle', symbolSize: 8, showSymbol: true,
      lineStyle: { width: 2.5, color: accent }, itemStyle: { color: accent },
      emphasis: { focus: 'series' as const, scale: 1.45 },
      markLine: breakSeason === undefined ? undefined : {
        silent: true, symbol: 'none', label: { show: false },
        lineStyle: { color: theme.muted, type: 'dashed' as const, width: 1 },
        data: [{ xAxis: String(breakSeason) }],
      },
    }],
  };
}

export function seasonLine(dark: boolean, categories: string[], points: ChartPoint[], opts: { min?: number; max?: number; zoom?: boolean } = {}) {
  const { theme, accent } = chartTheme(dark);
  const common = baseOption(theme, { zoom: opts.zoom ?? categories.length > 16 });
  return {
    ...common,
    legend: undefined,
    grid: { left: 8, right: 16, top: 18, bottom: opts.zoom || categories.length > 16 ? 58 : 12, containLabel: true },
    tooltip: {
      ...common.tooltip, trigger: 'axis' as const,
      axisPointer: { type: 'line' as const, lineStyle: { color: theme.muted, type: 'dashed' as const } },
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ dataIndex?: number; data?: ChartPoint }>;
        return params[0]?.data?.tip ?? '';
      },
    },
    xAxis: {
      type: 'category' as const, data: categories, boundaryGap: false, ...axisStyle(theme, false),
      axisLabel: { color: theme.muted, hideOverlap: true, formatter: (value: string) => value.slice(2) },
    },
    yAxis: { type: 'value' as const, min: opts.min, max: opts.max, ...axisStyle(theme) },
    series: [{
      type: 'line' as const, data: points, symbol: 'circle', symbolSize: 8, cursor: points.some(point => point.url) ? 'pointer' as const : 'default' as const,
      lineStyle: { width: 2.5, color: accent }, itemStyle: { color: accent },
      emphasis: { scale: 1.45 },
    }],
  };
}

export function seriesBars(dark: boolean, rows: SeriesRow[], mode: 'meetings' | 'share', compact = false) {
  const { theme, accent } = chartTheme(dark);
  const categories: string[] = [];
  const points: ChartPoint[] = rows.map(row => {
    const decided = row.winsA + row.winsB;
    const leader = row.winsA === row.winsB ? 'Level' : row.winsA > row.winsB ? row.teamA : row.teamB;
    const first = leader === 'Level' ? row.teamA : leader;
    const second = first === row.teamA ? row.teamB : row.teamA;
    const share = decided ? Math.max(row.winsA, row.winsB) / decided : 0;
    const record = `${Math.max(row.winsA, row.winsB)}\u2013${Math.min(row.winsA, row.winsB)}${row.ties ? `\u2013${row.ties}` : ''}`;
    const lead = leader === 'Level' ? `${row.teamA} and ${row.teamB} are level ${record}` : `${leader} leads ${record}`;
    const who = leader === 'Level' ? 'Level' : leader;
    const label = mode === 'meetings'
      ? `${row.meetings} · ${who} ${record}`
      : `${Math.round(share * 100)}% · ${who} ${record}`;
    categories.push(`${first} / ${second}`);
    return {
      value: mode === 'meetings' ? row.meetings : Math.round(share * 1000) / 10,
      color: share >= 0.75 ? theme.palette[5] : accent,
      label,
      pair: [first, second],
      tip: `<b>${esc(first)} / ${esc(second)}</b><br/>${esc(lead)}<br/>${row.meetings} meetings`,
    };
  });
  return horizontalBars(dark, categories, points, {
    name: mode === 'meetings' ? 'Meetings' : 'Leader win %',
    max: mode === 'share' ? 100 : undefined,
    visible: rows.length,
    fontSize: compact ? 15 : 16,
    barMaxWidth: 40,
    labelInside: compact,
    room: compact ? 8 : 228,
  });
}

export interface CareerSeasonPoint {
  season: string;
  points: number | null;
  finish: number | null;
  tip: string;
}

export function careerSeasons(dark: boolean, rows: CareerSeasonPoint[]) {
  const { theme, accent } = chartTheme(dark);
  const common = baseOption(theme, { legend: true, zoom: rows.length > 16 });
  const finishes = rows.map(row => row.finish).filter((value): value is number => value !== null);
  const maxFinish = Math.max(8, ...finishes);
  return {
    ...common,
    grid: { left: 8, right: 16, top: 44, bottom: rows.length > 16 ? 58 : 12, containLabel: true },
    tooltip: {
      ...common.tooltip, trigger: 'axis' as const,
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ dataIndex?: number }>;
        return rows[params[0]?.dataIndex ?? -1]?.tip ?? '';
      },
    },
    xAxis: { type: 'category' as const, data: rows.map(row => row.season), ...axisStyle(theme, false), axisLabel: { color: theme.muted, hideOverlap: true, formatter: (value: string) => value.slice(2) } },
    yAxis: [
      { type: 'value' as const, name: 'Points', min: 0, ...axisStyle(theme) },
      { type: 'value' as const, name: 'Finish', min: 1, max: maxFinish, inverse: true, interval: 1, ...axisStyle(theme, false), splitLine: { show: false } },
    ],
    series: [
      { type: 'bar' as const, name: 'Points', data: rows.map(row => row.points), barMaxWidth: 22, itemStyle: { color: accent, borderRadius: [6, 6, 0, 0] } },
      {
        type: 'line' as const, name: 'Finish', yAxisIndex: 1, symbol: 'circle', symbolSize: 8, connectNulls: false,
        data: rows.map(row => row.finish), lineStyle: { width: 2.5, color: theme.palette[1] }, itemStyle: { color: theme.palette[1] },
      },
    ],
  };
}

function barLabel(theme: Theme) {
  return {
    show: true, position: 'top' as const, color: theme.text, fontSize: 16, fontWeight: 600, distance: 8,
    formatter: (params: { data?: ChartPoint }) => {
      const value = params.data?.value ?? 0;
      if (!value) return '';
      return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
    },
  };
}

export function draftGroups(dark: boolean, categories: string[], titleRate: ChartPoint[], topRate: ChartPoint[]) {
  const { theme, accent } = chartTheme(dark);
  const common = baseOption(theme, { legend: true });
  const peak = Math.max(0, ...titleRate.map(point => point.value), ...topRate.map(point => point.value));
  const axisMax = Math.min(100, Math.max(20, Math.ceil(peak * 1.3 / 5) * 5));
  return {
    ...common,
    textStyle: { color: theme.text, fontSize: 16 },
    legend: { ...common.legend, itemWidth: 18, itemHeight: 14, itemGap: 28, textStyle: { color: theme.text, fontSize: 17 } },
    grid: { left: 8, right: 16, top: 56, bottom: 8, containLabel: true },
    tooltip: {
      ...common.tooltip, trigger: 'axis' as const, textStyle: { color: theme.text, fontSize: 16 },
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ dataIndex?: number; data?: ChartPoint }>;
        return params.find(item => item.data?.tip)?.data?.tip ?? '';
      },
    },
    xAxis: { type: 'category' as const, data: categories, ...axisStyle(theme, false), axisLabel: { color: theme.text, interval: 0, hideOverlap: false, fontSize: 16 } },
    yAxis: { type: 'value' as const, max: axisMax, ...axisStyle(theme), axisLabel: { color: theme.muted, fontSize: 16, formatter: (value: number) => `${value}%` } },
    series: [
      { type: 'bar' as const, name: 'Won the league', data: titleRate, barMaxWidth: 48, barGap: '22%', itemStyle: { color: accent, borderRadius: [6, 6, 0, 0] }, label: barLabel(theme) },
      { type: 'bar' as const, name: 'Finished top 3', data: topRate, barMaxWidth: 48, barGap: '22%', itemStyle: { color: theme.palette[1], borderRadius: [6, 6, 0, 0] }, label: barLabel(theme) },
    ],
  };
}

export function gameScatter(dark: boolean, points: Array<{ season: number; score: number; tip: string; url?: string }>) {
  const { theme, accent } = chartTheme(dark);
  const common = baseOption(theme, { zoom: true });
  return {
    ...common,
    legend: undefined,
    grid: { left: 8, right: 16, top: 16, bottom: 58, containLabel: true },
    tooltip: { ...tooltip(theme), formatter: (params: { data?: { tip: string } }) => params.data?.tip ?? '' },
    xAxis: { type: 'value' as const, name: 'Season', min: 2002, max: 2025, ...axisStyle(theme), nameTextStyle: { color: theme.muted } },
    yAxis: { type: 'value' as const, name: 'Score', min: 0, scale: true, ...axisStyle(theme) },
    series: [{
      type: 'scatter' as const, cursor: 'pointer' as const, symbolSize: 12,
      data: points.map(point => ({ ...point, value: [point.season, point.score], itemStyle: { color: accent, opacity: 0.9 } })),
    }],
  };
}

export function h2hMargins(dark: boolean, left: string, categories: string[], points: ChartPoint[]) {
  const option = signedBars(dark, categories, points);
  const { theme } = chartTheme(dark);
  return {
    ...option,
    title: { text: `${left} margin`, left: 0, top: 2, textStyle: { color: theme.text, fontSize: 16, fontWeight: 600 } },
    grid: { ...option.grid, top: 48 },
  };
}
