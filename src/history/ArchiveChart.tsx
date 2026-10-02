import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

function selectedPair(data: unknown): [string, string] | null {
  if (!data || typeof data !== 'object' || !('pair' in data)) return null;
  const pair = (data as { pair?: unknown }).pair;
  if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return null;
  return [pair[0], pair[1]];
}

export function ArchiveChart({ option, summary, height = 380, onSelect }: { option: object; summary: string; height?: number; onSelect?: (pair: [string, string]) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartInstance | null>(null);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
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
  }, []);

  useEffect(() => {
    if (!ready || !chartRef.current) return;
    chartRef.current.setOption(option as never, true);
  }, [ready, option]);

  return <figure className="score-chart">
    <div ref={hostRef} className="score-chart-canvas" style={{ height }} role="img" aria-label={summary} />
    <p className="sr-only">{summary}</p>
  </figure>;
}
