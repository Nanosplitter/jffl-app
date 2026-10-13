/** The week a roundup URL should show. A missing or future week is the current one, once that week is known. */
export function weeklyWeek(param: string | undefined, currentWeek: number) {
  const requested = Number(param);
  const numbered = param != null && param !== '' && Number.isInteger(requested) && requested >= 1;
  if (!numbered) return currentWeek >= 1 ? currentWeek : 0;
  if (currentWeek >= 1 && requested > currentWeek) return currentWeek;
  return requested;
}

/** Week-in-history stays on weeks 1–14. A missing or unknown week opens week 5. */
export function historyWeek(param: string | undefined) {
  const requested = Number(param);
  return Number.isInteger(requested) && requested >= 1 && requested <= 14 ? requested : 5;
}
