// Published snapshots may still carry an ESPN id or a camelCase library name.
const SCORING_NAMES: Record<string, string> = {
  espnstat8: 'Every 25 pass yards',
  espnstat28: 'Every 10 rush yards',
  espnstat48: 'Every 10 rec yards',
  espnstat198: 'Field goals 50-59',
  espnstat209: '1-pt safety',
  defensive2ptreturns: 'Defensive 2-pt return',
  passing2ptconversions: 'Pass 2-pt conversion',
  rushing2ptconversions: 'Rush 2-pt conversion',
  receiving2ptconversions: 'Rec 2-pt conversion',
  madefieldgoalsfromunder40: 'Field goals under 40',
  madefieldgoalsfrom40to49: 'Field goals 40-49',
  madefieldgoalsfrom60plus: 'Field goals 60+',
};

export function scoringLabel(name: string) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SCORING_NAMES[key] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2');
}
