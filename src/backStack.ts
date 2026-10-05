export interface BackCrumb {
  path: string;
  label: string;
}

export type BackMap = Record<string, BackCrumb>;

/** Remember where a pushed page came from. A replace keeps the page it replaced's origin. */
export function rememberBack(map: BackMap, type: 'PUSH' | 'REPLACE', priorKey: string, nextKey: string, crumb: BackCrumb): BackMap {
  if (priorKey === nextKey) return map;
  const next = { ...map };
  if (type === 'REPLACE') {
    if (next[priorKey]) next[nextKey] = next[priorKey];
    delete next[priorKey];
    return next;
  }
  next[nextKey] = crumb;
  return next;
}

const LEAGUE_NAMES: Record<string, string> = {
  premier: 'Premier League',
  championship: 'Championship',
  'league-one': 'League One',
};

const CUP_NAMES: Record<string, string> = {
  jffl: 'JFFL Cup',
  premier: 'Premier League Cup',
  championship: 'Championship Cup',
  'league-one': 'League One Cup',
};

/** A readable name for a route when the page has not set one yet. */
export function fallbackBackLabel(pathname: string) {
  if (pathname === '/') return 'Home';
  if (pathname === '/weekly') return 'Weekly roundup';
  if (pathname === '/summary') return 'Standings';
  if (pathname === '/players') return 'Players';
  if (pathname.startsWith('/players/')) return 'Player';
  if (pathname === '/cups') return 'Cups';
  if (pathname === '/history') return 'Trophies & history';
  if (pathname === '/archive/managers') return 'Managers';
  if (pathname.startsWith('/archive')) return 'Archive';
  const leagueSlug = pathname.match(/^\/league\/([^/]+)/)?.[1];
  const leagueName = leagueSlug ? LEAGUE_NAMES[leagueSlug] : undefined;
  if (leagueName) {
    if (pathname.includes('/match/')) return `${leagueName} match`;
    return leagueName;
  }
  const cup = pathname.match(/^\/cups\/([^/]+)/);
  if (cup) {
    const name = CUP_NAMES[cup[1]] ?? 'Cup';
    return pathname.includes('/match/') ? `${name} match` : name;
  }
  return 'Back';
}
