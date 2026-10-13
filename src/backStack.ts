export interface BackCrumb {
  path: string;
  label: string;
}

/** Pages underneath the current one, oldest first. `here` is the page this stack belongs to. */
export interface BackTrailState {
  stack: BackCrumb[];
  here: string;
}

export type Arrival = 'push' | 'replace' | 'pop' | 'reload' | 'load';

export function emptyTrail(): BackTrailState {
  return { stack: [], here: '' };
}

function lastIndex(stack: BackCrumb[], path: string) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index].path === path) return index;
  }
  return -1;
}

/** Fold one arrival into the trail. The same page rendered again leaves the trail alone. Home clears it. */
export function arrive(state: BackTrailState, path: string, kind: Arrival, origin: BackCrumb | null): BackTrailState {
  if (!path) return state;
  if (path.split('?')[0] === '/') return state.stack.length === 0 && state.here === path ? state : { stack: [], here: path };
  if (kind === 'reload') return state.here === path ? state : { ...state, here: path };
  if (kind === 'replace') return { ...state, here: path };
  if (kind === 'pop') {
    const index = lastIndex(state.stack, path);
    if (index >= 0) return { stack: state.stack.slice(0, index), here: path };
    if (origin && origin.path !== path) return { stack: [...state.stack, origin], here: path };
    return { ...state, here: path };
  }
  if (state.here === path) return state;
  if (kind === 'load' && !origin) return { stack: [], here: path };
  if (!origin || origin.path === path) return { ...state, here: path };
  return { stack: [...state.stack, origin], here: path };
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
  const weekly = pathname.match(/^\/weekly(?:\/(\d+))?$/);
  if (weekly) return weekly[1] ? `Week ${weekly[1]}` : 'Weekly roundup';
  if (pathname === '/summary' || pathname.startsWith('/summary/')) return 'Standings';
  if (pathname === '/players' || (pathname.startsWith('/players/') && LEAGUE_NAMES[pathname.split('/')[2] ?? ''])) return 'Players';
  if (pathname.startsWith('/players/')) return 'Player';
  if (pathname === '/cups') return 'Cups';
  if (pathname.startsWith('/history/cup')) return 'JFFL Cup history';
  if (pathname === '/history' || pathname.startsWith('/history/')) return 'Trophies & history';
  if (pathname.startsWith('/archive/records')) return 'Record book';
  const rivals = pathname.match(/^\/archive\/rivals\/([^/]+)\/([^/]+)$/);
  if (rivals) return `${decodeURIComponent(rivals[1])} vs ${decodeURIComponent(rivals[2])}`;
  if (pathname === '/archive/titles') return 'Titles';
  if (pathname === '/archive/rivals') return 'Head-to-head';
  if (pathname === '/archive/draft') return 'Draft';
  const historyWeek = pathname.match(/^\/archive\/weeks(?:\/(\d+))?$/);
  if (historyWeek) return historyWeek[1] ? `Week ${historyWeek[1]} in history` : 'Week in history';
  if (pathname === '/archive/ask/share') return 'Shared answer';
  if (pathname === '/archive/ask') return 'Ask the archive';
  if (pathname === '/archive/managers') return 'Managers';
  if (pathname.startsWith('/archive')) return 'Archive';
  const leagueSlug = pathname.match(/^\/league\/([^/]+)/)?.[1];
  const leagueName = leagueSlug ? LEAGUE_NAMES[leagueSlug] : undefined;
  if (leagueName) {
    if (pathname.includes('/match/')) return `${leagueName} match`;
    if (pathname.includes('/team/')) return leagueName;
    return leagueName;
  }
  const cup = pathname.match(/^\/cups\/([^/]+)/);
  if (cup) {
    const name = CUP_NAMES[cup[1]] ?? 'Cup';
    if (pathname.includes('/round/')) return `${name} round`;
    if (pathname.includes('/highlight/')) return name;
    return pathname.includes('/match/') ? `${name} match` : name;
  }
  return 'Back';
}

/** Where a direct visit goes back, when nobody opened this page from inside the site. */
export function fallbackBackTarget(pathname: string): { to: string; label: string } | null {
  const league = pathname.match(/^\/league\/([^/]+)(\/.*)?$/);
  if (league) {
    const name = LEAGUE_NAMES[league[1]];
    if (!name) return { to: '/', label: 'Home' };
    if (!league[2]) return { to: '/', label: 'All leagues' };
    return { to: `/league/${league[1]}`, label: name };
  }
  if (/^\/summary\/[^/]+$/.test(pathname)) return { to: '/summary', label: 'Standings' };
  if (pathname.startsWith('/history/')) return { to: '/history', label: 'Trophies & history' };
  if (pathname.startsWith('/players/')) return { to: '/players', label: 'Players' };
  const cup = pathname.match(/^\/cups\/([^/]+)(\/.*)?$/);
  if (cup) {
    const name = CUP_NAMES[cup[1]] ?? 'Cup';
    if (!cup[2]) return { to: '/cups', label: 'All cups' };
    return { to: `/cups/${cup[1]}`, label: name };
  }
  if (pathname.startsWith('/archive/managers/')) return { to: '/archive/managers', label: 'All managers' };
  if (pathname.startsWith('/archive/')) return { to: '/archive', label: 'Archive' };
  return null;
}
