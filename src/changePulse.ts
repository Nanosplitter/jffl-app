/** Draw the chart the first time it appears, and again only when the latest values move. */
export function animateOnChange(previous: string | null, next: string): boolean {
  return previous === null || previous !== next;
}

/** A highlight is for a later change, not the first paint. */
export function flashOnChange(previous: string | null, next: string): boolean {
  return previous !== null && previous !== next;
}

export function chartMotionKey(mode: 'chance' | 'score', point: { chance: number; scoreLeft: number | null; scoreRight: number | null; projectedLeft: number | null; projectedRight: number | null } | undefined): string {
  if (!point) return '';
  if (mode === 'chance') return String(point.chance);
  return `${point.scoreLeft ?? ''}|${point.scoreRight ?? ''}|${point.projectedLeft ?? ''}|${point.projectedRight ?? ''}`;
}
