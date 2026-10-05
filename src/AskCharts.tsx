import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Download, Link2, RotateCcw, SlidersHorizontal, Table2 } from 'lucide-react';
import { controlTable, datasetOf, rerunDataset, type Session } from './history/askRuntime.ts';
import { type Controls } from './history/askTools.ts';
import { resolveChart } from './history/chartBuild.ts';
import { DARK_THEME, LIGHT_THEME, createColorMap, csvOf, drillPrompt, emptyChart, fmt, putLeagueLast, type BuildEnv, type ColorMap, type ResolvedChart } from './history/chartKit.ts';
import { leagueInk, leagueOfManager, leagueSlug } from './reference';
import { LAST_SEASON, FIRST_SEASON, LEAGUES, type ChartSpec } from './history/chartSpec.ts';
import type { ChartInstance } from './history/echartsSetup.ts';
import './ask-styles.css';

export function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

const hasControls = (controls: Controls) => controls.from !== undefined || controls.to !== undefined || !!controls.leagues?.length || !!controls.types?.length || !!controls.excludeTwoWeek;
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'chart';

const download = (name: string, href: string) => {
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

async function emailChartImage(option: unknown, width: number, height: number) {
  const { echarts } = await import('./history/echartsSetup.ts');
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;background:#ffffff;`;
  document.body.appendChild(host);
  const chart = echarts.init(host, undefined, { renderer: 'canvas', width, height });
  try {
    const source = option as { textStyle?: Record<string, unknown>; series?: unknown; grid?: { right?: number } };
    const series = Array.isArray(source.series) ? source.series.map(item => {
      if (!item || typeof item !== 'object' || (item as { type?: string }).type !== 'bar') return item;
      const bar = item as { barMaxWidth?: number; label?: Record<string, unknown> };
      return { ...bar, barMaxWidth: Math.max(bar.barMaxWidth ?? 0, 56), label: { ...bar.label, fontSize: 16 } };
    }) : source.series;
    chart.setOption({
      ...source,
      series,
      grid: source.grid ? { ...source.grid, right: Math.max(source.grid.right ?? 0, 56) } : source.grid,
      backgroundColor: '#ffffff',
      animation: false,
      textStyle: { ...source.textStyle, fontSize: 16, color: '#151719' },
    }, true);
    return chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
  } finally {
    chart.dispose();
    host.remove();
  }
}

const YEARS = Array.from({ length: LAST_SEASON - FIRST_SEASON + 1 }, (_, index) => FIRST_SEASON + index);
const TYPES = ['Season', 'Cup', 'Superbowl'];

export interface ChartSnapshot {
  title: string;
  subtitle?: string;
  image: string | null;
  imageWidth?: number;
  cards?: Array<{ label: string; value: string; note?: string }>;
  table: ResolvedChart['table'] | null;
  caveats: string[];
}

export interface ChartHandle {
  snapshot: () => Promise<ChartSnapshot>;
}

export interface ChartViewProps {
  spec: ChartSpec;
  session: Session;
  color: ColorMap;
  dark: boolean;
  initialControls?: Controls;
  onAsk?: (text: string) => void;
  onShare?: (controls: Controls) => void;
  headingLevel?: 'h2' | 'h3';
}

export const ChartView = forwardRef<ChartHandle, ChartViewProps>(function ChartView({ spec, session, color, dark, initialControls, onAsk, onShare, headingLevel = 'h3' }, ref) {
  const theme = dark ? DARK_THEME : LIGHT_THEME;
  const [controls, setControls] = useState<Controls>(initialControls ?? {});
  const [measure, setMeasure] = useState<string | null>(null);
  const [showData, setShowData] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const askRef = useRef(onAsk);
  askRef.current = onAsk;
  const [ready, setReady] = useState(false);

  const controlId = spec.datasetId && controlTable(session, spec.datasetId) ? spec.datasetId : null;
  const table = controlId ? controlTable(session, controlId) : null;
  const base = controlId ? datasetOf(session, controlId) : undefined;
  const measures = useMemo(() => {
    if (!base || !spec.y || spec.y.length !== 1 || !['line', 'area', 'bar'].includes(spec.type)) return [];
    return base.columns.filter(column => column.type === 'number' && column.name !== spec.x && column.name !== spec.series).map(column => column.name);
  }, [base, spec]);
  const effective = useMemo<ChartSpec>(() => measure && spec.y?.length === 1 ? { ...spec, y: [measure] } : spec, [spec, measure]);

  const resolved = useMemo<ResolvedChart>(() => {
    const override = controlId && hasControls(controls) ? rerunDataset(session, controlId, controls) : undefined;
    if (override && override.rows.length === 0) return emptyChart(spec.title, 'No rows match these controls. Widen the years, leagues, or game types.', { subtitle: spec.subtitle });
    const env: BuildEnv = {
      dataset: id => (override && id === controlId ? override : datasetOf(session, id)),
      archive: session.ctx.archive, theme, color,
    };
    return resolveChart(effective, env);
  }, [effective, controls, controlId, session, theme, color, spec.title, spec.subtitle]);

  // Create the chart instance once the chart type needs one; keep it across updates so changes animate.
  const wantsChart = resolved.kind === 'echarts';
  useEffect(() => {
    if (!wantsChart || !hostRef.current) return undefined;
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let chart: ChartInstance | null = null;
    import('./history/echartsSetup.ts').then(({ echarts }) => {
      if (disposed || !hostRef.current) return;
      chart = echarts.init(hostRef.current, undefined, { renderer: 'canvas' });
      chartRef.current = chart;
      chart.on('click', params => {
        const prompt = drillPrompt(params as never, spec.title);
        if (prompt) askRef.current?.(prompt);
      });
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(hostRef.current);
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
      chartRef.current = null;
      setReady(false);
    };
  }, [wantsChart, spec.title]);

  useEffect(() => {
    if (!ready || !chartRef.current || !resolved.option) return;
    chartRef.current.setOption(resolved.option as never, true);
  }, [ready, resolved.option]);

  const update = useCallback((patch: Partial<Controls>) => setControls(previous => {
    const next: Controls = { ...previous, ...patch };
    for (const key of Object.keys(next) as Array<keyof Controls>) if (next[key] === undefined || (Array.isArray(next[key]) && !(next[key] as unknown[]).length) || next[key] === false) delete next[key];
    return next;
  }), []);
  const toggle = (key: 'leagues' | 'types', value: string) => {
    const current = controls[key] ?? [];
    update({ [key]: current.includes(value) ? current.filter(item => item !== value) : [...current, value] } as Partial<Controls>);
  };

  const Heading = headingLevel;
  const showControls = !!controlId || measures.length > 1;
  const rows = resolved.table.rows;
  const caveats = [...new Set([...resolved.caveats, ...resolved.warnings])];

  useImperativeHandle(ref, () => ({
    snapshot: async () => {
      let image: string | null = null;
      if (resolved.kind === 'echarts' && resolved.option) {
        const override = controlId && hasControls(controls) ? rerunDataset(session, controlId, controls) : undefined;
        const emailColor = createColorMap(() => LIGHT_THEME.palette);
        const light = resolveChart(effective, {
          dataset: id => (override && id === controlId ? override : datasetOf(session, id)),
          archive: session.ctx.archive, theme: LIGHT_THEME, color: emailColor,
        });
        try {
          image = light.option ? await emailChartImage(light.option, 1200, Math.round(light.height * 1.45)) : null;
        } catch { image = null; }
      }
      return {
        title: resolved.title,
        subtitle: resolved.subtitle,
        image,
        imageWidth: image ? 1200 : undefined,
        cards: resolved.cards,
        table: resolved.kind === 'table' ? resolved.table : null,
        caveats: [],
      };
    },
  }), [resolved, effective, controls, controlId, session]);

  return <figure className="ask-chart">
    <figcaption className="ask-chart-head">
      <Heading>{resolved.title}</Heading>
      {resolved.subtitle && <p>{resolved.subtitle}</p>}
    </figcaption>
    {resolved.cards && resolved.cards.length > 0 && <dl className="ask-cards">
      {resolved.cards.map(card => <div key={card.label}><dt>{card.label}</dt><dd>{card.value}</dd>{card.note && <small>{card.note}</small>}</div>)}
    </dl>}
    {resolved.kind === 'echarts' && <div className="ask-canvas-wrap">
      <div ref={hostRef} className="ask-canvas" style={{ height: resolved.height }} role="img" aria-label={resolved.summary} />
    </div>}
    {resolved.kind === 'table' && (rows.length > 0 ? <DataTable table={resolved.table} caption={resolved.title} /> : <p className="ask-empty">{resolved.summary}</p>)}
    {resolved.kind !== 'table' && <p className="sr-only">{resolved.summary}</p>}
    <div className="ask-chart-actions">
      {resolved.kind !== 'table' && rows.length > 0 && <button type="button" aria-expanded={showData} onClick={() => setShowData(value => !value)}><Table2 size={15} aria-hidden="true" />{showData ? 'Hide data' : 'View data'}</button>}
      {resolved.kind === 'echarts' && <button type="button" onClick={() => {
        const url = chartRef.current?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: dark ? '#141517' : '#ffffff' });
        if (url) download(`${slug(resolved.title)}.png`, url);
      }}><Download size={15} aria-hidden="true" />PNG</button>}
      {rows.length > 0 && <button type="button" onClick={() => {
        const url = URL.createObjectURL(new Blob([csvOf(resolved.table)], { type: 'text/csv' }));
        download(`${slug(resolved.title)}.csv`, url);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}><Download size={15} aria-hidden="true" />CSV</button>}
      {onShare && <button type="button" onClick={() => onShare(controls)}><Link2 size={15} aria-hidden="true" />Share link</button>}
    </div>
    {showControls && <details className="ask-controls">
      <summary><SlidersHorizontal size={15} aria-hidden="true" />Adjust this chart</summary>
      <div className="ask-controls-body">
        {controlId && <>
          <div className="ask-control-row">
            <label>From<select value={controls.from ?? ''} onChange={event => update({ from: event.target.value ? Number(event.target.value) : undefined })}><option value="">Any</option>{YEARS.map(year => <option key={year}>{year}</option>)}</select></label>
            <label>To<select value={controls.to ?? ''} onChange={event => update({ to: event.target.value ? Number(event.target.value) : undefined })}><option value="">Any</option>{YEARS.map(year => <option key={year}>{year}</option>)}</select></label>
          </div>
          <fieldset><legend>Leagues</legend>{LEAGUES.map(league => <label key={league} className="ask-check"><input type="checkbox" checked={!!controls.leagues?.includes(league)} onChange={() => toggle('leagues', league)} />{league}</label>)}</fieldset>
          {table === 'team_games' && <>
            <fieldset><legend>Games</legend>{TYPES.map(type => <label key={type} className="ask-check"><input type="checkbox" checked={!!controls.types?.includes(type)} onChange={() => toggle('types', type)} />{type}</label>)}</fieldset>
            <label className="ask-check"><input type="checkbox" checked={!!controls.excludeTwoWeek} onChange={event => update({ excludeTwoWeek: event.target.checked })} />Leave out two-week JFFL Cup totals</label>
          </>}
        </>}
        {measures.length > 1 && <label>Measure<select value={measure ?? spec.y?.[0] ?? ''} onChange={event => setMeasure(event.target.value)}>{measures.map(name => <option key={name} value={name}>{name}</option>)}</select></label>}
        <button type="button" className="ask-reset" onClick={() => { setControls({}); setMeasure(null); }} disabled={!hasControls(controls) && !measure}><RotateCcw size={14} aria-hidden="true" />Reset</button>
        <p className="ask-control-note">These controls re-run the saved search on this device. They do not ask the assistant again.</p>
      </div>
    </details>}
    {caveats.length > 0 && <ul className="ask-caveats" aria-label="Data notes">{caveats.slice(0, 4).map(text => <li key={text}>{text}</li>)}</ul>}
    {showData && resolved.kind !== 'table' && <DataTable table={resolved.table} caption={`${resolved.title} data`} />}
  </figure>;
});

function cellInk(cell: unknown) {
  if (typeof cell !== 'string') return '';
  return leagueInk(leagueSlug(cell) ?? leagueOfManager(cell));
}

function DataTable({ table, caption }: { table: ResolvedChart['table']; caption: string }) {
  const ordered = putLeagueLast(table.columns, table.rows);
  const shown = ordered.rows.slice(0, 200);
  return <div className="table-scroll ask-data" tabIndex={0} role="region" aria-label={caption}>
    <table>
      <caption className="sr-only">{caption}</caption>
      <thead><tr>{ordered.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{shown.map((row, index) => <tr key={index}>{row.map((cell, position) => <td key={position} className={[typeof cell === 'number' ? 'numeric' : '', cellInk(cell)].filter(Boolean).join(' ') || undefined}>{fmt(cell, 2)}</td>)}</tr>)}</tbody>
    </table>
    {table.rows.length > shown.length && <p className="ask-control-note">Showing {shown.length} of {table.rows.length} rows. Download the CSV for all of them.</p>}
  </div>;
}
