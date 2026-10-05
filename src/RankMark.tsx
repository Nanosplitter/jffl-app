/** A small raised number in front of a matchup name. Null stays blank. */
export function RankMark({ value }: { value?: number | null }) {
  if (value == null) return null;
  return <sup className="rank-mark">{value}</sup>;
}

export function cupSeed(cupId: string, person: { jfflSeed: number; leagueSeed: number } | null | undefined) {
  if (!person) return null;
  return cupId === 'jffl' ? person.jfflSeed : person.leagueSeed;
}
