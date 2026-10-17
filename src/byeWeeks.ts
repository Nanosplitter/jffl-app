/** 2026 NFL bye week by the abbreviation ESPN publishes on a roster. */
const BYE_WEEK: Record<string, number> = {
  CAR: 5, KC: 5,
  CIN: 6, DET: 6, MIA: 6, MIN: 6,
  BUF: 7, JAX: 7, LAC: 7, WSH: 7,
  HOU: 8, NO: 8, NYG: 8, SF: 8,
  PIT: 9, TEN: 9,
  CHI: 10, DEN: 10, PHI: 10, TB: 10,
  ATL: 11, CLE: 11, GB: 11, LAR: 11, NE: 11, SEA: 11,
  BAL: 13, IND: 13, LV: 13, NYJ: 13,
  ARI: 14, DAL: 14,
};

export function byeWeek(proTeam: string | null | undefined) {
  if (!proTeam) return null;
  return BYE_WEEK[proTeam.trim().toUpperCase()] ?? null;
}

/** Status under a score that has not posted. A bye replaces a kickoff. */
export function pendingPlayLabel(proTeam: string | null | undefined, week: number, kickoff: string | null) {
  if (byeWeek(proTeam) === week) return 'Bye';
  return kickoff ?? 'Yet to play';
}
