const SPREAD = 15;

export function standardNormalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

/** Chance each side finishes ahead, from the gap in ESPN projected totals. A missing projection stays absent. */
export function projectedWinChance(homeProjected: number | null, awayProjected: number | null): { home: number; away: number } | null {
  if (homeProjected == null || awayProjected == null) return null;
  if (!Number.isFinite(homeProjected) || !Number.isFinite(awayProjected)) return null;
  const home = Math.min(100, Math.max(0, Math.round(standardNormalCdf((homeProjected - awayProjected) / SPREAD) * 100)));
  return { home, away: 100 - home };
}
