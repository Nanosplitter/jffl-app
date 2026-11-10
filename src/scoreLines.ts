import { scoringLabel } from './scoring.ts';
import type { ScoreLine } from './types';

const STAT_ORDER = ['Pass attempts', 'Completions', 'Pass yards', 'Pass TD', 'Interceptions', 'Rush attempts', 'Rush yards', 'Rush TD', 'Receptions', 'Rec yards', 'Rec TD', 'Targets', 'Fumbles', 'Fumbles lost', 'Field goals', 'Extra points', 'Defensive TD', 'Defensive INT', 'Fumble recoveries', 'Safeties', 'Sacks', 'Points allowed', 'Yards allowed'];
const YARD_STATS: Record<string, string> = { pass: 'Pass yards', rush: 'Rush yards', rec: 'Rec yards' };
const VOLUME_STATS = new Set(['Pass attempts', 'Completions', 'Rush attempts', 'Receptions', 'Targets', 'Fumbles']);

const shown = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

export interface ScoringRule { name: string; points: number }
export interface ScorePopupRow { text: string; points: string | null }

function pointsForStat(label: string, count: number, rules: ScoringRule[]): string {
  const named = rules.map(rule => ({ name: scoringLabel(rule.name).trim(), points: rule.points }));
  const lower = label.toLowerCase();
  const exact = named.find(rule => rule.name.toLowerCase() === lower);
  if (exact) return shown(count * exact.points);
  for (const rule of named) {
    const bundle = rule.name.match(/^Every (\d+) (pass|rush|rec) yards$/i);
    if (!bundle || YARD_STATS[bundle[2].toLowerCase()] !== label) continue;
    const size = Number(bundle[1]);
    if (!size) continue;
    return shown(Math.floor(count / size) * rule.points);
  }
  const banded = named.some(rule => {
    const name = rule.name.toLowerCase();
    return name.startsWith(`${lower} `) || name.startsWith(`${lower}-`);
  });
  if (banded) return '—';
  return VOLUME_STATS.has(label) ? '0' : '—';
}

export function scorePopupRows(player: { scoreLines?: ScoreLine[] | null; weekStats?: Record<string, number> | null }, scoring?: ScoringRule[] | null): ScorePopupRow[] {
  if (Array.isArray(player.scoreLines)) {
    const rows = player.scoreLines.filter(line => line && typeof line.points === 'number' && line.points !== 0 && line.label);
    if (!rows.length) return [{ text: 'No scoring stats yet.', points: null }];
    return rows.map(line => ({
      text: typeof line.count === 'number' ? `${shown(line.count)} ${line.label}` : line.label,
      points: shown(line.points),
    }));
  }
  const rank = (name: string) => {
    const index = STAT_ORDER.indexOf(name);
    return index === -1 ? STAT_ORDER.length : index;
  };
  const stats = Object.entries(player.weekStats ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] !== 0);
  if (!stats.length) return [{ text: 'No scoring stats yet.', points: null }];
  stats.sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  const priced = !!scoring?.length;
  const rows = stats.map(([label, count]) => ({ text: `${shown(count)} ${label}`, points: priced ? pointsForStat(label, count, scoring) : null }));
  const kept = priced ? rows.filter(row => row.points !== '0') : rows;
  return kept.length ? kept : [{ text: 'No scoring stats yet.', points: null }];
}

export function scorePopupText(player: { scoreLines?: ScoreLine[] | null; weekStats?: Record<string, number> | null }, scoring?: ScoringRule[] | null): string[] {
  return scorePopupRows(player, scoring).map(row => row.points == null ? row.text : `${row.text} ${row.points}`);
}
