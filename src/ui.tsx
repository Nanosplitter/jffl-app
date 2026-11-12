import { useEffect, useState } from 'react';
import { pointsBackLabel, type ScoringRole, type SeasonOutlook } from './competitions';
import type { Freshness, Team } from './types';

export const points = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
export const record = (team: Team) => team.wins == null || team.losses == null ? '—' : `${team.wins}–${team.losses}${team.ties ? `–${team.ties}` : ''}`;
export const weeklyAverage = (team: Pick<Team, 'pointsFor' | 'wins' | 'losses' | 'ties'> | null) => {
  if (!team || team.pointsFor == null || team.wins == null || team.losses == null || team.ties == null) return null;
  const games = team.wins + team.losses + team.ties;
  return games > 0 ? team.pointsFor / games : null;
};

export function OutlookCell({ outlook, className = '' }: { outlook: SeasonOutlook; className?: string }) {
  return <td className={`outlook ${outlook.tone} ${className}`.trim()}><span className="outlook-label">{outlook.label}</span>{outlook.detail ? <span className="outlook-detail">{outlook.detail}</span> : null}</td>;
}

export function PointsBack({ back, role, className = '' }: { back: number | null; role: ScoringRole; className?: string }) {
  const label = pointsBackLabel(back, role);
  const lead = role === 'leader' || role === 'tied';
  return <td className={`numeric points-back ${role === 'behind' ? 'muted' : ''} ${className}`.trim()} title={label.phrase || undefined}>{lead ? <span className="scoring-trophy" aria-hidden="true">🏆</span> : label.text}{label.phrase ? <span className="sr-only">{lead ? label.phrase : `, ${label.phrase}`}</span> : null}</td>;
}

export function Fresh({ data, error = false }: { data: Freshness; error?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const stale = error || data.refreshStatus === 'error' || now - Date.parse(data.updatedAt) > 7 * 60_000;
  const time = new Date(data.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return <span className={`fresh ${stale ? 'stale' : ''}`} title={new Date(data.updatedAt).toLocaleString()}>{stale ? 'Update delayed · ' : ''}Updated {time}</span>;
}
