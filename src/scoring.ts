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
  defensive0pointsallowed: '0 points allowed',
  defensive1to6pointsallowed: '1-6 points allowed',
  defensive7to13pointsallowed: '7-13 points allowed',
  defensive14to17pointsallowed: '14-17 points allowed',
  defensive18to21pointsallowed: '18-21 points allowed',
  defensive22to27pointsallowed: '22-27 points allowed',
  defensive28to34pointsallowed: '28-34 points allowed',
  defensive35to45pointsallowed: '35-45 points allowed',
  defensive45pluspointsallowed: '46+ points allowed',
  defensivelessthan100yardsallowed: 'Under 100 yards allowed',
  defensive100to199yardsallowed: '100-199 yards allowed',
  defensive200to299yardsallowed: '200-299 yards allowed',
  defensive300to349yardsallowed: '300-349 yards allowed',
  defensive350to399yardsallowed: '350-399 yards allowed',
  defensive400to449yardsallowed: '400-449 yards allowed',
  defensive450to499yardsallowed: '450-499 yards allowed',
  defensive500to549yardsallowed: '500-549 yards allowed',
  defensive550plusyardsallowed: '550+ yards allowed',
};

export function scoringLabel(name: string) {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SCORING_NAMES[key] ?? name.replace(/([a-z])([A-Z])/g, '$1 $2');
}
