import type { Cell, Dataset } from './askTools.ts';
import { datasetIdsOf, sanitizeOption, type ChartSpec } from './chartSpec.ts';
import {
  axisStyle, baseOption, emptyChart, esc, fmt, numberList, quantile, tableOf,
  type BuildEnv, type Card, type ResolvedChart,
} from './chartKit.ts';
import { buildRecipe, isRecipe } from './recipes.ts';

interface Pivot { categories: Array<string | number>; series: Array<{ name: string; values: Array<number | null> }> }

const label = (text: string) => text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, char => char.toUpperCase());

export function pivot(dataset: Dataset, x: string, seriesColumn: string | undefined, yColumns: string[], sort: ChartSpec['sort']): Pivot {
  const categories: Array<string | number> = [];
  const seen = new Set<string>();
  for (const row of dataset.rows) {
    const key = String(row[x]);
    if (row[x] === null || row[x] === undefined || seen.has(key)) continue;
    seen.add(key);
    categories.push(row[x] as string | number);
  }
  const numeric = categories.every(category => typeof category === 'number');
  if (numeric && sort !== 'y_desc' && sort !== 'y_asc') categories.sort((a, b) => (a as number) - (b as number));
  else if (sort === 'x') categories.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  const index = new Map(categories.map((category, position) => [String(category), position]));
  const names = seriesColumn ? [...new Set(dataset.rows.map(row => String(row[seriesColumn] ?? 'Unknown')))] : yColumns.map(label);
  const series = names.map(name => ({ name, values: categories.map(() => null as number | null) }));
  const lookup = new Map(names.map((name, position) => [name, position]));
  for (const row of dataset.rows) {
    const position = index.get(String(row[x]));
    if (position === undefined) continue;
    if (seriesColumn) {
      const target = series[lookup.get(String(row[seriesColumn] ?? 'Unknown'))!];
      const value = row[yColumns[0]];
      target.values[position] = typeof value === 'number' ? value : null;
    } else {
      yColumns.forEach((column, columnIndex) => {
        const value = row[column];
        series[columnIndex].values[position] = typeof value === 'number' ? value : null;
      });
    }
  }
  if (sort === 'y_desc' || sort === 'y_asc') {
    const totals = categories.map((_, position) => series.reduce((sum, item) => sum + (item.values[position] ?? 0), 0));
    const order = categories.map((_, position) => position).sort((a, b) => sort === 'y_desc' ? totals[b] - totals[a] : totals[a] - totals[b]);
    return { categories: order.map(position => categories[position]), series: series.map(item => ({ name: item.name, values: order.map(position => item.values[position]) })) };
  }
  return { categories, series };
}

function describeSeries(spec: ChartSpec, data: Pivot): string {
  type Point = { value: number; series: string; at: string | number };
  let best: Point | null = null;
  let worst: Point | null = null;
  for (const item of data.series) {
    for (let position = 0; position < item.values.length; position += 1) {
      const value = item.values[position];
      if (value === null) continue;
      if (best === null || value > best.value) best = { value, series: item.name, at: data.categories[position] };
      if (worst === null || value < worst.value) worst = { value, series: item.name, at: data.categories[position] };
    }
  }
  const names = data.series.map(item => item.name);
  const listed = names.length > 6 ? `${names.slice(0, 6).join(', ')} and ${names.length - 6} more` : names.join(', ');
  const extreme = (point: Point | null) => point ? `${fmt(point.value)}${data.series.length > 1 ? ` (${point.series}, ${point.at})` : ` (${point.at})`}` : 'none';
  return `${label(spec.type)} chart: ${data.categories.length} ${spec.x ?? 'items'} values from ${data.categories[0] ?? 'none'} to ${data.categories[data.categories.length - 1] ?? 'none'}. Series: ${listed}. Highest ${extreme(best)}. Lowest ${extreme(worst)}.`;
}

function typedChart(spec: ChartSpec, dataset: Dataset, env: BuildEnv): ResolvedChart {
  const { theme } = env;
  const base: ResolvedChart = {
    kind: 'echarts', title: spec.title, subtitle: spec.subtitle, table: tableOf(dataset), summary: '', caveats: [...dataset.caveats], warnings: [], height: 340, datasetIds: [dataset.id],
  };
  const highlight = new Set((spec.highlight ?? []).map(name => name.toLowerCase()));
  const dim = (name: string) => highlight.size > 0 && !highlight.has(name.toLowerCase());
  const colorFor = (name: string, index: number) => spec.series ? env.color(name) : theme.palette[index % theme.palette.length];

  if (spec.type === 'table') {
    const shown = spec.y?.length ? spec.y : undefined;
    return { ...base, kind: 'table', table: tableOf(dataset, shown), summary: `Table of ${dataset.rows.length} rows with columns ${(shown ?? dataset.columns.map(column => column.name)).join(', ')}.`, height: 0 };
  }

  if (spec.type === 'stat_cards') {
    const cards: Card[] = [];
    if (dataset.rows.length === 1) {
      const names = spec.y?.length ? spec.y : dataset.columns.filter(column => column.type === 'number').map(column => column.name).slice(0, 8);
      for (const name of names) cards.push({ label: label(name), value: fmt(dataset.rows[0][name]) });
    } else if (spec.label && spec.value) {
      for (const row of dataset.rows) cards.push({ label: String(row[spec.label] ?? ''), value: fmt(row[spec.value]) });
    }
    return { ...base, kind: 'cards', cards, summary: cards.map(card => `${card.label}: ${card.value}`).join('. '), height: 0 };
  }

  if (spec.type === 'heatmap') {
    const x = spec.x!; const rowColumn = spec.series!; const value = spec.value!;
    const columns = [...new Set(dataset.rows.map(row => String(row[x])))];
    const rows = [...new Set(dataset.rows.map(row => String(row[rowColumn])))];
    const cells: Array<[number, number, number]> = [];
    for (const row of dataset.rows) {
      const cell = row[value];
      if (typeof cell === 'number') cells.push([columns.indexOf(String(row[x])), rows.indexOf(String(row[rowColumn])), cell]);
    }
    const values = cells.map(cell => cell[2]);
    const option = {
      ...baseOption(theme, { top: 8 }), legend: undefined,
      grid: { left: 8, right: 18, top: 8, bottom: 58, containLabel: true },
      tooltip: { ...baseOption(theme).tooltip, trigger: 'item', formatter: (params: { value: [number, number, number] }) => `${esc(rows[params.value[1]])} / ${esc(columns[params.value[0]])}<br/><b>${fmt(params.value[2])}</b>` },
      xAxis: { type: 'category', data: columns, splitArea: { show: true }, ...axisStyle(theme, false), axisLabel: { color: theme.muted, rotate: columns.length > 10 ? 45 : 0, interval: 0 } },
      yAxis: { type: 'category', data: rows, inverse: true, ...axisStyle(theme, false), axisLabel: { color: theme.muted, interval: 0 } },
      visualMap: { min: spec.yMin ?? Math.min(...values), max: spec.yMax ?? Math.max(...values), calculable: true, orient: 'horizontal', left: 'center', bottom: 4, textStyle: { color: theme.muted }, inRange: { color: [theme.dark ? '#14202b' : '#e8f3f9', theme.accent] } },
      series: [{ type: 'heatmap', data: cells, label: { show: columns.length * rows.length <= 120, color: theme.text, formatter: (params: { value: [number, number, number] }) => fmt(params.value[2]) }, emphasis: { itemStyle: { borderColor: theme.text, borderWidth: 1 } } }],
    };
    return { ...base, option, height: Math.max(300, 90 + rows.length * 30), summary: `Heatmap of ${value} by ${rowColumn} (rows) and ${x} (columns). ${cells.length} cells, from ${fmt(Math.min(...values))} to ${fmt(Math.max(...values))}.` };
  }

  if (spec.type === 'radar') {
    const axes = spec.y!;
    const maxima = axes.map(name => Math.max(...numberList(dataset.rows.map(row => typeof row[name] === 'number' ? row[name] as number : null)), 1));
    const option = {
      ...baseOption(theme, { legend: true }),
      tooltip: { ...baseOption(theme).tooltip, trigger: 'item' },
      radar: { indicator: axes.map((name, index) => ({ name: label(name), max: Math.ceil(maxima[index] * 1.1) })), axisName: { color: theme.muted }, splitLine: { lineStyle: { color: theme.line } }, splitArea: { show: false }, axisLine: { lineStyle: { color: theme.line } } },
      series: [{
        type: 'radar',
        data: dataset.rows.map((row, index) => ({
          name: String(row[spec.label!] ?? `Row ${index + 1}`),
          value: axes.map(name => typeof row[name] === 'number' ? row[name] : null),
          itemStyle: { color: env.color(String(row[spec.label!] ?? index)) }, lineStyle: { width: 2.5, color: env.color(String(row[spec.label!] ?? index)) }, areaStyle: { opacity: 0.12 },
        })),
      }],
    };
    const missing = dataset.rows.some(row => axes.some(name => typeof row[name] !== 'number'));
    return { ...base, option, height: 380, summary: `Radar chart comparing ${dataset.rows.map(row => String(row[spec.label!])).join(', ')} on ${axes.join(', ')}.`, caveats: [...base.caveats, ...(missing ? ['Some values are missing and are left blank on the radar. They are not zero.'] : [])] };
  }

  if (spec.type === 'boxplot') {
    const groups = new Map<string, number[]>();
    for (const row of dataset.rows) {
      const value = row[spec.y![0]];
      if (typeof value !== 'number') continue;
      const key = String(row[spec.x!]);
      groups.set(key, [...(groups.get(key) ?? []), value]);
    }
    const names = [...groups.keys()];
    if (spec.sort === undefined || spec.sort === 'x') names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const stats = names.map(name => {
      const sorted = [...groups.get(name)!].sort((a, b) => a - b);
      return [sorted[0], quantile(sorted, 0.25), quantile(sorted, 0.5), quantile(sorted, 0.75), sorted[sorted.length - 1]];
    });
    const option = {
      ...baseOption(theme, { zoom: names.length > 16 }),
      tooltip: { ...baseOption(theme).tooltip, trigger: 'item', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: names, ...axisStyle(theme, false) },
      yAxis: { type: 'value', scale: true, min: spec.yMin, max: spec.yMax, ...axisStyle(theme) },
      series: [{ type: 'boxplot', data: stats, itemStyle: { color: theme.dark ? '#1d3b50' : '#e8f3f9', borderColor: theme.accent, borderWidth: 1.5 }, boxWidth: [8, 36] }],
    };
    return { ...base, option, summary: `Box plot of ${spec.y![0]} for ${names.length} groups of ${spec.x}. Boxes show the middle half and the line shows the median; whiskers reach the minimum and maximum.` };
  }

  const data = pivot(dataset, spec.x!, spec.series, spec.y!, spec.sort);
  const many = data.series.length > 1;
  const zoom = data.categories.length > 24 && !spec.horizontal && spec.type !== 'scatter';
  const options = baseOption(theme, { legend: many, zoom });
  const summary = describeSeries(spec, data);

  if (spec.type === 'scatter') {
    const rows = dataset.rows.filter(row => typeof row[spec.x!] === 'number' && typeof row[spec.y![0]] === 'number');
    const groups = spec.series ? [...new Set(rows.map(row => String(row[spec.series!])))] : [spec.y![0]];
    const showLabels = rows.length <= 40 && !!spec.label;
    const option = {
      ...options, legend: spec.series ? options.legend ?? baseOption(theme, { legend: true }).legend : undefined,
      grid: { ...options.grid, top: spec.series ? 44 : 20 },
      tooltip: { ...options.tooltip, trigger: 'item', formatter: (params: { name: string; seriesName: string; value: [number, number] }) => `${params.name ? `<b>${esc(params.name)}</b><br/>` : ''}${spec.series ? `${esc(params.seriesName)}<br/>` : ''}${esc(spec.x)}: ${fmt(params.value[0])}<br/>${esc(spec.y![0])}: ${fmt(params.value[1])}` },
      xAxis: { type: 'value', name: spec.x, nameLocation: 'middle', nameGap: 28, scale: true, ...axisStyle(theme), nameTextStyle: { color: theme.muted, align: 'center' } },
      yAxis: { type: 'value', name: spec.y![0], scale: true, min: spec.yMin, max: spec.yMax, ...axisStyle(theme) },
      series: groups.map((group, index) => ({
        type: 'scatter', name: group, symbolSize: 11,
        itemStyle: { color: colorFor(group, index), opacity: dim(group) ? 0.3 : 0.9 },
        label: { show: showLabels, formatter: '{b}', position: 'right', color: theme.muted, fontSize: 11 },
        data: rows.filter(row => !spec.series || String(row[spec.series]) === group).map(row => ({ name: spec.label ? String(row[spec.label] ?? '') : '', value: [row[spec.x!], row[spec.y![0]]] })),
      })),
    };
    return { ...base, option, summary: `Scatter plot of ${spec.y![0]} against ${spec.x}, ${rows.length} points.` };
  }

  const horizontal = spec.horizontal && (spec.type === 'bar' || spec.type === 'stacked_bar');
  const categoryAxis = { type: 'category', data: data.categories.map(String), ...axisStyle(theme, false), inverse: !!horizontal, boundaryGap: spec.type !== 'line' && spec.type !== 'area' && spec.type !== 'rank_over_time', axisLabel: { color: theme.muted, hideOverlap: true, interval: data.categories.length > 40 ? 'auto' : 0 } };
  const rankMax = spec.type === 'rank_over_time' ? Math.max(...numberList(data.series.flatMap(item => item.values)), 1) : null;
  const allValues = numberList(data.series.flatMap(item => item.values));
  const barFloor = (spec.type === 'bar' || spec.type === 'stacked_bar') && allValues.every(value => value >= 0) ? 0 : undefined;
  const valueAxis = {
    type: 'value', min: spec.yMin ?? (rankMax ? 1 : barFloor), max: spec.yMax ?? rankMax ?? undefined, inverse: spec.type === 'rank_over_time',
    interval: rankMax ? 1 : undefined, scale: spec.type === 'line' || spec.type === 'area' ? spec.yMin === undefined && spec.yMax === undefined : false,
    name: many ? undefined : label(spec.y![0]), ...axisStyle(theme),
  };
  const series = data.series.map((item, index) => {
    const color = colorFor(item.name, index);
    const faded = dim(item.name);
    if (spec.type === 'bar' || spec.type === 'stacked_bar') {
      return {
        type: 'bar', name: item.name, data: item.values, stack: spec.type === 'stacked_bar' ? 'total' : undefined, barMaxWidth: 38,
        itemStyle: { color, opacity: faded ? 0.3 : 1, borderRadius: spec.type === 'bar' ? (horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]) : 0 },
        label: { show: !many && data.categories.length <= 24, position: horizontal ? 'right' : 'top', color: theme.muted, formatter: (params: { value: number | null }) => params.value === null ? '' : fmt(params.value) },
        emphasis: { focus: 'series' },
      };
    }
    return {
      type: 'line', name: item.name, data: item.values, connectNulls: false, symbol: 'circle', symbolSize: data.categories.length > 40 ? 4 : 7,
      lineStyle: { width: highlight.size && !faded ? 4 : 2.5, color, opacity: faded ? 0.3 : 1 }, itemStyle: { color, opacity: faded ? 0.3 : 1 },
      areaStyle: spec.type === 'area' ? { opacity: 0.16 } : undefined, emphasis: { focus: 'series' },
    };
  });
  const option = {
    ...options,
    tooltip: { ...options.tooltip, trigger: 'axis', valueFormatter: (value: unknown) => fmt(value as Cell) },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series,
  };
  return { ...base, option, height: horizontal ? Math.max(260, 70 + data.categories.length * 30) : 340, summary };
}

export function resolveChart(spec: ChartSpec, env: BuildEnv): ResolvedChart {
  if (isRecipe(spec.type)) return buildRecipe(spec, env);
  if (spec.type === 'echarts') {
    const cleaned = sanitizeOption(spec.option, { dataset: env.dataset, managers: () => [] });
    if (!cleaned.ok) return emptyChart(spec.title, cleaned.error);
    const ids = datasetIdsOf(spec);
    const first = ids.map(id => env.dataset(id)).find((dataset): dataset is Dataset => !!dataset);
    const option: Record<string, unknown> = {
      animationDuration: 600, color: env.theme.palette, textStyle: { color: env.theme.text },
      ...cleaned.value.option,
    };
    const themed = (axis: unknown) => (Array.isArray(axis) ? axis : axis ? [axis] : []).map((item: Record<string, unknown>) => {
      const style = axisStyle(env.theme);
      return { ...style, ...item, axisLabel: { ...style.axisLabel, ...(item.axisLabel as object | undefined) } };
    });
    if (option.xAxis) option.xAxis = themed(option.xAxis);
    if (option.yAxis) option.yAxis = themed(option.yAxis);
    const common = baseOption(env.theme);
    option.tooltip = { ...common.tooltip, ...(option.tooltip as object | undefined) };
    if (option.legend) option.legend = { textStyle: { color: env.theme.text }, ...(option.legend as object) };
    return {
      kind: 'echarts', title: spec.title, subtitle: spec.subtitle, option,
      table: first ? tableOf(first) : { columns: [], rows: [] },
      summary: `Custom chart with ${(option.series as unknown[]).length} series. ${first ? `Data from ${first.title}.` : ''}`,
      caveats: first?.caveats ?? [], warnings: cleaned.value.warnings, height: 340, datasetIds: ids,
    };
  }
  const dataset = spec.datasetId ? env.dataset(spec.datasetId) : undefined;
  if (!dataset) return emptyChart(spec.title, 'The data for this chart is not available.');
  return typedChart(spec, dataset, env);
}
