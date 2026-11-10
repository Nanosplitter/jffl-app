import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { animateOnChange } from '../changePulse';
import { hasZoomWindow, keepDataZoom, zoomedYRange, type ZoomWindow } from './chartKit.ts';
import type { ChartInstance } from './echartsSetup.ts';

export function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function pointValue(row: unknown): [number, number] | null {
  const value = row && typeof row === 'object' && 'value' in row ? (row as { value?: unknown }).value : row;
  if (!Array.isArray(value) || typeof value[0] !== 'number' || typeof value[1] !== 'number') return null;
  if (!Number.isFinite(value[0]) || !Number.isFinite(value[1])) return null;
  return [value[0], value[1]];
}

function xExtent(chart: ChartInstance): [number, number] | null {
  const model = (chart as unknown as { getModel?: () => { getComponent?: (name: string, index: number) => { axis?: { scale?: { getExtent?: () => number[] } } } } }).getModel?.();
  const extent = model?.getComponent?.('xAxis', 0)?.axis?.scale?.getExtent?.();
  if (!extent || extent.length < 2 || !Number.isFinite(extent[0]) || !Number.isFinite(extent[1]) || extent[1] <= extent[0]) return null;
  return [extent[0], extent[1]];
}

function fitVisibleY(chart: ChartInstance, source: object) {
  const base = (source as { yAxis?: { min?: number; max?: number; interval?: number } | unknown[] }).yAxis;
  if (!base || Array.isArray(base)) return;
  const live = chart.getOption() as { dataZoom?: ZoomWindow[]; series?: Array<{ silent?: boolean; data?: unknown[] }> };
  const restore = () => chart.setOption({ yAxis: { min: base.min ?? null, max: base.max ?? null, interval: base.interval ?? null } }, false);
  if (!hasZoomWindow(live.dataZoom)) { restore(); return; }
  const extent = xExtent(chart);
  if (!extent) return;
  const points: Array<[number, number]> = [];
  for (const series of live.series ?? []) {
    if (!series || series.silent || !Array.isArray(series.data)) continue;
    for (const row of series.data) {
      const point = pointValue(row);
      if (point) points.push(point);
    }
  }
  const clamp = base.min === 0 && base.max === 100 ? { min: 0, max: 100 } : undefined;
  const range = zoomedYRange(points, extent[0], extent[1], clamp);
  if (!range) { restore(); return; }
  chart.setOption({ yAxis: { min: range.min, max: range.max, interval: null, scale: true } }, false);
}

function axisValue(chart: ChartInstance, x: number): number | null {
  const raw = chart.convertFromPixel({ xAxisIndex: 0 }, x);
  const value = Array.isArray(raw) ? raw[0] : raw;
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function plotRect(chart: ChartInstance): { x: number; y: number; width: number; height: number } | null {
  const model = (chart as unknown as { getModel?: () => { getComponent?: (name: string, index: number) => { coordinateSystem?: { getRect?: () => { x: number; y: number; width: number; height: number } } } } }).getModel?.();
  const rect = model?.getComponent?.('grid', 0)?.coordinateSystem?.getRect?.();
  return rect && rect.width > 0 && rect.height > 0 ? rect : null;
}

function selectedPair(data: unknown): [string, string] | null {
  if (!data || typeof data !== 'object' || !('pair' in data)) return null;
  const pair = (data as { pair?: unknown }).pair;
  if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return null;
  return [pair[0], pair[1]];
}

export function ArchiveChart({ option, summary, height = 380, onSelect, motionKey, dragZoom = false }: { option: object; summary: string; height?: number; onSelect?: (pair: [string, string]) => void; motionKey?: string; dragZoom?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const motionRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const dragZoomRef = useRef(dragZoom);
  dragZoomRef.current = dragZoom;
  const optionRef = useRef(option);
  optionRef.current = option;
  const [ready, setReady] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let detachDrag: (() => void) | null = null;
    let chart: ChartInstance | null = null;
    import('./echartsSetup.ts').then(({ echarts }) => {
      if (disposed || !hostRef.current) return;
      chart = echarts.init(hostRef.current, undefined, { renderer: 'canvas' });
      chartRef.current = chart;
      const choose = (pair: [string, string] | null) => {
        if (!pair || !onSelectRef.current) return false;
        onSelectRef.current(pair);
        return true;
      };
      chart.on('click', (params: { componentType?: string; name?: unknown; value?: unknown; data?: unknown; dataIndex?: number }) => {
        if (choose(selectedPair(params.data))) return;
        if (params.componentType === 'yAxis' && chart) {
          const stored = chart.getOption() as { yAxis?: Array<{ data?: unknown[] }>; series?: Array<{ data?: unknown[] }> };
          const categories = stored.yAxis?.[0]?.data ?? [];
          const label = typeof params.name === 'string' ? params.name : typeof params.value === 'string' ? params.value : '';
          const index = typeof params.dataIndex === 'number' ? params.dataIndex : categories.findIndex(item => item === label);
          if (choose(selectedPair(stored.series?.[0]?.data?.[index]))) return;
        }
        const data = params.data;
        const url = data && typeof data === 'object' && 'url' in data && typeof (data as { url?: unknown }).url === 'string' ? (data as { url: string }).url : null;
        if (url) navigateRef.current(url);
      });
      chart.on('mouseover', (params: { componentType?: string }) => {
        if (params.componentType === 'yAxis') chart?.getZr().setCursorStyle('pointer');
      });
      chart.on('mouseout', (params: { componentType?: string }) => {
        if (params.componentType === 'yAxis') chart?.getZr().setCursorStyle('default');
      });
      let fitting = false;
      const syncZoom = () => {
        if (!chart || fitting) return;
        const live = chart.getOption() as { dataZoom?: ZoomWindow[] } | undefined;
        setZoomed(hasZoomWindow(live?.dataZoom));
        if (!dragZoomRef.current) return;
        fitting = true;
        try { fitVisibleY(chart, optionRef.current); } finally { fitting = false; }
      };
      chart.on('datazoom', syncZoom);
      chart.getZr().on('dblclick', () => {
        const live = chart?.getOption() as { dataZoom?: unknown[] } | undefined;
        if (!live?.dataZoom?.length) return;
        chart?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
      });
      const host = hostRef.current;
      const band = document.createElement('div');
      band.className = 'chart-zoom-band';
      band.setAttribute('aria-hidden', 'true');
      host.appendChild(band);
      let startX: number | null = null;
      let dragged = false;
      const localX = (event: PointerEvent) => event.clientX - host.getBoundingClientRect().left;
      const hideBand = () => { band.classList.remove('is-on'); };
      const onDown = (event: PointerEvent) => {
        if (!dragZoomRef.current || event.button !== 0 || !chart) return;
        const bounds = host.getBoundingClientRect();
        const y = event.clientY - bounds.top;
        const plot = plotRect(chart);
        if (plot && (y < plot.y || y > plot.y + plot.height)) return;
        startX = localX(event);
        dragged = false;
        try { host.setPointerCapture(event.pointerId); } catch { /* The drag still follows pointermove on the chart. */ }
      };
      const onMove = (event: PointerEvent) => {
        if (startX == null || !chart) return;
        const x = localX(event);
        if (!dragged && Math.abs(x - startX) < 6) return;
        dragged = true;
        const plot = plotRect(chart);
        const left = Math.min(startX, x);
        const right = Math.max(startX, x);
        band.style.top = `${plot?.y ?? 8}px`;
        band.style.height = `${plot?.height ?? Math.max(host.clientHeight - 40, 1)}px`;
        band.style.left = `${left}px`;
        band.style.width = `${Math.max(right - left, 1)}px`;
        band.classList.add('is-on');
      };
      const finish = (event: PointerEvent, apply: boolean) => {
        if (startX == null) return;
        const from = startX;
        const moved = dragged;
        startX = null;
        dragged = false;
        hideBand();
        if (!apply || !moved || !chart) return;
        const a = axisValue(chart, from);
        const b = axisValue(chart, localX(event));
        if (a == null || b == null || a === b) return;
        chart.dispatchAction({ type: 'dataZoom', startValue: Math.min(a, b), endValue: Math.max(a, b) });
      };
      const onUp = (event: PointerEvent) => finish(event, true);
      const onCancel = (event: PointerEvent) => finish(event, false);
      host.addEventListener('pointerdown', onDown);
      host.addEventListener('pointermove', onMove);
      host.addEventListener('pointerup', onUp);
      host.addEventListener('pointercancel', onCancel);
      detachDrag = () => {
        host.removeEventListener('pointerdown', onDown);
        host.removeEventListener('pointermove', onMove);
        host.removeEventListener('pointerup', onUp);
        host.removeEventListener('pointercancel', onCancel);
        band.remove();
      };
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(host);
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      detachDrag?.();
      chart?.dispose();
      chartRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    if (!ready || !chartRef.current) return;
    const reduceMotion = motionKey !== undefined && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animate = !reduceMotion && (motionKey === undefined || animateOnChange(motionRef.current, motionKey));
    if (motionKey !== undefined) motionRef.current = motionKey;
    const drawn = animate
      ? option
      : { ...option, animation: false, animationDuration: 0, animationDurationUpdate: 0 };
    try {
      const live = chartRef.current.getOption() as { dataZoom?: ZoomWindow[] } | undefined;
      chartRef.current.setOption(keepDataZoom(drawn, live?.dataZoom) as never, true);
      if (dragZoom) fitVisibleY(chartRef.current, drawn);
      const next = chartRef.current.getOption() as { dataZoom?: ZoomWindow[] } | undefined;
      setZoomed(hasZoomWindow(next?.dataZoom));
    } catch { /* A bad option must not take down the page. */ }
  }, [ready, option, motionKey]);

  const resetZoom = () => chartRef.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
  return <figure className="score-chart">
    {dragZoom && zoomed && <button type="button" className="chart-zoom-reset" onClick={resetZoom}>Reset</button>}
    <div ref={hostRef} className={`score-chart-canvas${dragZoom ? ' drag-zoom' : ''}`} style={{ height }} role="img" aria-label={summary} />
    <p className="sr-only">{summary}</p>
  </figure>;
}
