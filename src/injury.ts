const HEALTHY = new Set(['ACTIVE', 'NORMAL', 'Active']);
const INJURY_LABELS: Record<string, string> = {
  OUT: 'OUT',
  QUESTIONABLE: 'Q',
  DOUBTFUL: 'D',
  INJURY_RESERVE: 'IR',
  SUSPENSION: 'SUS',
};
const INJURY_NAMES: Record<string, string> = {
  OUT: 'Out',
  QUESTIONABLE: 'Questionable',
  DOUBTFUL: 'Doubtful',
  INJURY_RESERVE: 'Injury reserve',
  SUSPENSION: 'Suspension',
};

export function injuryLabel(status: string | null | undefined) {
  if (!status || HEALTHY.has(status)) return null;
  return INJURY_LABELS[status] ?? status.replaceAll('_', ' ');
}

export function injuryName(status: string | null | undefined) {
  if (!status || HEALTHY.has(status)) return undefined;
  return INJURY_NAMES[status] ?? status.replaceAll('_', ' ');
}
