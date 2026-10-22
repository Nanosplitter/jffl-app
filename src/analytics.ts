import type { Analytics } from 'firebase/analytics';
import { LEAGUES } from './types.ts';

declare const __APP_VERSION__: string;

const leagueSlugs = new Set<string>(LEAGUES.map(league => league.slug));
const PARAM_LIMIT = 100;
const SEEN_KEY = 'jffl.analytics.seen';

/** Section name used as the screen class in Analytics. */
export function screenName(pathname: string) {
  const [root, a, b] = pathname.split('/').filter(Boolean);
  if (!root) return 'Leagues';
  if (root === 'league') return b === 'team' ? 'Team' : b === 'match' ? 'League match' : 'League';
  if (root === 'matchday') return 'Matchday';
  if (root === 'players') return !a || leagueSlugs.has(a) ? 'Players' : 'Player';
  if (root === 'summary') return 'Standings';
  if (root === 'weekly') return 'Weekly roundup';
  if (root === 'cups') return b === 'match' ? 'Cup match' : 'Cups';
  if (root === 'history') return a === 'cup' ? 'Cup history' : 'History';
  if (root === 'archive') {
    if (a === 'ask') return 'Ask the archive';
    if (a === 'records') return 'Record book';
    if (a === 'titles') return 'Titles';
    if (a === 'rivals') return 'Rivals';
    if (a === 'managers') return pathname.split('/').filter(Boolean).length > 2 ? 'Manager' : 'Managers';
    if (a === 'draft') return 'Draft';
    if (a === 'weeks') return 'Week in history';
    return 'Archive';
  }
  return 'Not found';
}

export interface PageContext {
  screen: string;
  screenClass: string;
  contentGroup: string;
  league: string;
}

/** Specific screen, its section, and the league in the path. */
export function pageContext(pathname: string): PageContext {
  const parts = pathname.split('/').filter(Boolean);
  const [root, a, b, c, d, e] = parts;
  const league = leagueIn(pathname);
  let screen = screenName(pathname);
  if (root === 'league' && a && !b) screen = leagueName(a);
  else if (root === 'league' && b === 'team' && c) screen = `Team · ${leagueName(a)} · ${c}`;
  else if (root === 'league' && b === 'match' && c) screen = `Match · ${leagueName(a)} · ${c}`;
  else if (root === 'matchday' && a && b) screen = `Matchday · ${leagueName(a)} · ${b}`;
  else if (root === 'players' && a && leagueSlugs.has(a)) screen = `Players · ${leagueName(a)}`;
  else if (root === 'players' && a) screen = `Player · ${a}`;
  else if (root === 'summary' && a && leagueSlugs.has(a)) screen = `Standings · ${leagueName(a)}`;
  else if (root === 'weekly' && a) screen = `Week ${a}`;
  else if (root === 'cups' && a && b === 'match' && c) screen = `Cup match · ${cupLabel(a)} · ${c}`;
  else if (root === 'cups' && a && b === 'round' && c && d === 'highlight' && e) screen = `Cup · ${cupLabel(a)} · ${c} · ${decode(e)}`;
  else if (root === 'cups' && a && b === 'round' && c) screen = `Cup · ${cupLabel(a)} · ${c}`;
  else if (root === 'cups' && a && b === 'highlight' && c) screen = `Cup · ${cupLabel(a)} · ${decode(c)}`;
  else if (root === 'cups' && a) screen = `Cup · ${cupLabel(a)}`;
  else if (root === 'history' && a === 'cup' && b) screen = `Cup history · ${leagueSlugs.has(b) ? leagueName(b) : decode(b)}`;
  else if (root === 'history' && a && leagueSlugs.has(a)) screen = `History · ${leagueName(a)}`;
  else if (root === 'archive' && a === 'ask' && b === 't') screen = 'Saved chat';
  else if (root === 'archive' && a === 'ask' && (b === 's' || b === 'share')) screen = 'Shared answer';
  else if (root === 'archive' && a === 'records' && b) screen = `Record book · ${decode(b)}`;
  else if (root === 'archive' && a === 'rivals' && b && c) screen = `Rivals · ${decode(b)} · ${decode(c)}`;
  else if (root === 'archive' && a === 'managers' && b) screen = `Manager · ${decode(b)}`;
  else if (root === 'archive' && a === 'weeks' && b) screen = `Week ${b} in history`;
  return { screen: clip(screen), screenClass: screenName(pathname), contentGroup: groupFor(pathname), league };
}

/** Client redirects are not visits. The destination route is counted instead. */
export function countsAsPage(pathname: string) {
  return pathname !== '/history/ask'
    && !pathname.startsWith('/history/ask/')
    && pathname !== '/history/archive'
    && !pathname.startsWith('/history/archive/');
}

function leagueName(slug: string | undefined) {
  return LEAGUES.find(league => league.slug === slug)?.name ?? slug ?? '';
}

function cupLabel(id: string) {
  if (id === 'jffl') return 'JFFL Cup';
  if (id === 'premier') return 'Premier Cup';
  if (id === 'championship') return 'Championship Cup';
  if (id === 'league-one') return 'League One Cup';
  return id;
}

function leagueIn(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'history' && parts[1] === 'cup') return leagueSlugs.has(parts[2] ?? '') ? parts[2] : '';
  if (parts[0] === 'cups') return leagueSlugs.has(parts[1] ?? '') ? parts[1] : '';
  return parts.find(part => leagueSlugs.has(part)) ?? '';
}

function groupFor(pathname: string) {
  const root = pathname.split('/').filter(Boolean)[0] ?? '';
  if (!root || root === 'league') return 'Leagues';
  if (root === 'matchday') return 'Matchday';
  if (root === 'players') return 'Players';
  if (root === 'summary') return 'Standings';
  if (root === 'weekly') return 'Weekly';
  if (root === 'cups') return 'Cups';
  if (root === 'history') return 'History';
  if (root === 'archive') return 'Archive';
  return 'Other';
}

function decode(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function clip(value: string, limit = PARAM_LIMIT) {
  return value.length <= limit ? value : value.slice(0, limit);
}

function appVersion() {
  try { return __APP_VERSION__ || '1.0.0'; } catch { return '1.0.0'; }
}

type Param = string | number | boolean;
type AnalyticsApi = {
  analytics: Analytics;
  logEvent: typeof import('firebase/analytics').logEvent;
  setUserId: typeof import('firebase/analytics').setUserId;
  setUserProperties: typeof import('firebase/analytics').setUserProperties;
};

let loading: Promise<AnalyticsApi | null> | null = null;
let queue: Promise<void> = Promise.resolve();
let lastPage = '';
let lastUrl = '';
let scrolledFor = '';
let started = false;
const searchTimers = new WeakMap<HTMLInputElement, number>();

function client() {
  loading ??= load();
  return loading;
}

async function load(): Promise<AnalyticsApi | null> {
  if (typeof window === 'undefined') return null;
  const { getFirebaseApp } = await import('./firebaseApp');
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    const { initializeAnalytics, isSupported, logEvent, setDefaultEventParameters, setUserId, setUserProperties } = await import('firebase/analytics');
    if (!await isSupported()) return null;
    const version = appVersion();
    const analytics = initializeAnalytics(app, {
      config: { send_page_view: false, app_name: 'JFFL', app_version: version },
    });
    setDefaultEventParameters({ app_name: 'JFFL', app_version: version });
    return { analytics, logEvent, setUserId, setUserProperties };
  } catch {
    return null;
  }
}

function send(event: string, params?: Record<string, Param>) {
  queue = queue.then(async () => {
    const api = await client();
    if (!api) return;
    api.logEvent(api.analytics, event, params);
  }).catch(() => { /* A blocked analytics script leaves the rest of the site alone. */ });
}

function apply(change: (api: AnalyticsApi) => void) {
  queue = queue.then(async () => {
    const api = await client();
    if (!api) return;
    change(api);
  }).catch(() => { /* A blocked analytics script leaves the rest of the site alone. */ });
}

export function startAnalytics() {
  if (started || typeof window === 'undefined') return;
  started = true;
  void client();
  window.addEventListener('click', onClick, true);
  window.addEventListener('change', onChange, true);
  window.addEventListener('input', onSearch, true);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('error', onError);
}

export function trackPage(pathname: string, search: string) {
  if (!countsAsPage(pathname)) return;
  const path = `${pathname || '/'}${search}`;
  if (path === lastPage) return;
  const context = pageContext(pathname);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const location = origin ? `${origin}${path}` : path;
  const referrer = lastUrl || (typeof document === 'undefined' ? '' : document.referrer);
  lastPage = path;
  lastUrl = location;
  const params: Record<string, string> = {
    page_title: context.screen,
    page_path: clip(path),
    page_location: clip(location, 1000),
    content_group: context.contentGroup,
    firebase_screen: context.screen,
    firebase_screen_class: context.screenClass,
  };
  if (referrer) params.page_referrer = clip(referrer, 1000);
  if (context.league) params.league = context.league;
  send('page_view', params);
}

export function identifyUser(uid: string | null) {
  apply(api => {
    api.setUserId(api.analytics, uid);
    api.setUserProperties(api.analytics, { signed_in: uid ? 'yes' : 'no' });
  });
}

export function setFollowedLeague(key: string | null) {
  const league = key?.split(':')[0] ?? '';
  apply(api => {
    api.setUserProperties(api.analytics, { followed_league: leagueSlugs.has(league) ? league : 'none' });
  });
}

export function setAnalyticsTheme(dark: boolean) {
  apply(api => {
    api.setUserProperties(api.analytics, { theme: dark ? 'dark' : 'light' });
  });
}

export function trackSignIn(uid: string) {
  identifyUser(uid);
  send(rememberUser(uid) ? 'login' : 'sign_up', { method: 'Google' });
}

export function trackFollow(key: string | null) {
  setFollowedLeague(key);
  if (!key) { send('unfollow_manager'); return; }
  const league = key.split(':')[0] ?? '';
  send('follow_manager', leagueSlugs.has(league) ? { league } : {});
}

export function trackAsk() {
  send('ask_question');
}

export function trackShare() {
  send('share', { method: 'link', content_type: 'answer' });
}

function rememberUser(uid: string) {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : [];
    const ids = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    if (ids.includes(uid)) return true;
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids, uid].slice(-40)));
    return false;
  } catch {
    return true;
  }
}

function onClick(event: MouseEvent) {
  const node = event.target;
  if (!(node instanceof Element)) return;
  const link = node.closest('a');
  if (link instanceof HTMLAnchorElement && link.href) {
    let url: URL;
    try { url = new URL(link.href, window.location.origin); } catch { return; }
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.host !== window.location.host) {
        const extension = url.pathname.split('.').pop()?.toLowerCase() ?? '';
        const file = ['pdf', 'csv', 'zip'].includes(extension);
        send(file ? 'file_download' : 'click', {
          link_url: clip(url.href, 1000),
          link_domain: clip(url.host),
          ...(file ? { file_extension: extension, file_name: clip(url.pathname.split('/').pop() ?? '') } : { outbound: true }),
        });
        return;
      }
      send('select_content', { content_type: 'link', content_id: clip(`${url.pathname}${url.search}`) });
      return;
    }
  }
  const button = node.closest('button');
  if (!(button instanceof HTMLButtonElement) || button.closest('.ask-starters, .ask-chips')) return;
  const label = buttonLabel(button);
  if (!label) return;
  send('select_content', { content_type: 'button', content_id: clip(label) });
}

function buttonLabel(button: HTMLButtonElement) {
  const text = button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  if (text && text.length <= 48) return text;
  const aria = button.getAttribute('aria-label')?.trim() ?? '';
  return aria.length <= 48 ? aria : '';
}

function onChange(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  const label = target.getAttribute('aria-label') || target.id || 'filter';
  const option = target.selectedOptions[0]?.textContent?.replace(/\s+/g, ' ').trim() || target.value;
  send('select_content', { content_type: 'filter', content_id: clip(`${label}: ${option}`) });
}

function onSearch(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const hint = `${target.getAttribute('aria-label') ?? ''} ${target.placeholder}`.toLowerCase();
  if (!/search|find/.test(hint)) return;
  const pending = searchTimers.get(target);
  if (pending) window.clearTimeout(pending);
  const term = target.value.trim();
  if (term.length < 2 || term.includes('@')) return;
  searchTimers.set(target, window.setTimeout(() => {
    send('search', { search_term: clip(term) });
  }, 800));
}

function onScroll() {
  const path = `${window.location.pathname}${window.location.search}`;
  if (scrolledFor === path) return;
  const height = document.documentElement.scrollHeight - window.innerHeight;
  if (height <= 0 || window.scrollY / height < 0.9) return;
  scrolledFor = path;
  send('scroll', { percent_scrolled: 90 });
}

function onError(event: ErrorEvent) {
  const message = event.message?.trim();
  if (!message || message === 'Script error.') return;
  send('exception', { description: clip(message), fatal: false });
}
