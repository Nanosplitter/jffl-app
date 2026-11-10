export const NUDGE_INTERVAL_MS = 30_000;
export const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

/** A tab counts as open when it is visible and someone used it in the last 10 minutes. */
export function tabIsActive(visible: boolean, lastInputAt: number, now: number): boolean {
  const idle = now - lastInputAt;
  return visible && idle >= 0 && idle <= ACTIVE_WINDOW_MS;
}
