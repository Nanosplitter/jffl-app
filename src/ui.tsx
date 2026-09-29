import { useEffect, useState } from 'react';
import type { Freshness, Team } from './types';

export const points = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const record = (team: Team) => team.wins == null || team.losses == null ? '—' : `${team.wins}–${team.losses}${team.ties ? `–${team.ties}` : ''}`;

export function Fresh({ data, error = false }: { data: Freshness; error?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const stale = error || data.refreshStatus === 'error' || now - Date.parse(data.updatedAt) > 7 * 60_000;
  const time = new Date(data.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return <span className={`fresh ${stale ? 'stale' : ''}`} title={new Date(data.updatedAt).toLocaleString()}>{stale ? 'Update delayed · ' : ''}Updated {time}</span>;
}
