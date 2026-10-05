import { useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { arrive, emptyTrail, fallbackBackLabel, fallbackBackTarget, type BackCrumb, type BackTrailState } from './backStack';

const TRAIL_KEY = 'jffl-back-trail';
const PENDING_KEY = 'jffl-back-pending';
const LABELS_KEY = 'jffl-back-labels';

const pageLabels = new Map<string, string>();
let seen: { key: string; path: string } | null = null;
let booted = false;
let version = 0;
const listeners = new Set<() => void>();

function loadTrail(): BackTrailState {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(TRAIL_KEY) || '') as BackTrailState;
    if (parsed && Array.isArray(parsed.stack) && typeof parsed.here === 'string') return parsed;
  } catch { /* A missing trail just means this page was opened on its own. */ }
  return emptyTrail();
}

function saveTrail(state: BackTrailState) {
  try { sessionStorage.setItem(TRAIL_KEY, JSON.stringify(state)); } catch { /* The back link still has its fallback. */ }
}

function loadLabels(): Record<string, string> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(LABELS_KEY) || '{}') as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function labelFor(path: string) {
  return loadLabels()[path] || fallbackBackLabel(path.split('?')[0]);
}

function rememberLabel(path: string, label: string) {
  const labels = loadLabels();
  if (labels[path] === label) return;
  labels[path] = label;
  try { sessionStorage.setItem(LABELS_KEY, JSON.stringify(labels)); } catch { /* Names fall back to the route. */ }
}

function readPending(): BackCrumb | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PENDING_KEY) || '') as { path?: string; label?: string; at?: number };
    if (!parsed?.path || !parsed.label || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > 10000) return null;
    return { path: parsed.path, label: parsed.label };
  } catch {
    return null;
  }
}

function clearPending() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* Nothing to clear. */ }
}

function referrerPath() {
  try {
    const url = new URL(document.referrer);
    if (url.origin !== location.origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function historyIndex() {
  const index = (window.history.state as { idx?: number } | null)?.idx;
  return typeof index === 'number' ? index : 0;
}

function documentKind(): 'navigate' | 'reload' | 'back_forward' {
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (entry?.type === 'reload' || entry?.type === 'back_forward') return entry.type;
  return 'navigate';
}

function emit() {
  version += 1;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function currentVersion() {
  return version;
}

function commit(state: BackTrailState, path: string, kind: 'push' | 'replace' | 'pop' | 'reload' | 'load', origin: BackCrumb | null) {
  const next = arrive(state, path, kind, origin);
  if (next !== state) saveTrail(next);
  return next;
}

/** Pages call this so the next back link can name them. */
export function usePageLabel(label: string | null | undefined) {
  const location = useLocation();
  if (!label) return;
  pageLabels.set(location.key, label);
  rememberLabel(`${location.pathname}${location.search}`, label);
}

/** Record each arrival, including a full page load, so the back link can name the page that opened this one. */
export function BackTrail() {
  const location = useLocation();
  const type = useNavigationType();
  const path = `${location.pathname}${location.search}`;
  const state = loadTrail();
  if (!booted) {
    booted = true;
    const kind = documentKind();
    if (kind === 'reload') commit(state, path, 'reload', null);
    else if (kind === 'back_forward') {
      const origin = state.here && state.here !== path ? { path: state.here, label: labelFor(state.here) } : null;
      commit(state, path, 'pop', origin);
    } else {
      const pending = readPending();
      const from = referrerPath();
      const origin = pending && pending.path !== path && (pending.path === from || !from)
        ? pending
        : from && from !== path
          ? { path: from, label: labelFor(from) }
          : null;
      commit(state, path, 'load', origin);
    }
    clearPending();
    seen = { key: location.key, path };
  } else if (!seen || seen.key !== location.key || seen.path !== path) {
    const prior = seen;
    if (type === 'REPLACE') commit(state, path, 'replace', null);
    else if (type === 'POP') {
      const origin = prior && prior.path !== path ? { path: prior.path, label: pageLabels.get(prior.key) || labelFor(prior.path) } : null;
      commit(state, path, 'pop', origin);
    } else {
      const origin = prior ? { path: prior.path, label: pageLabels.get(prior.key) || labelFor(prior.path) } : null;
      commit(state, path, 'push', origin);
    }
    clearPending();
    seen = { key: location.key, path };
  }
  return null;
}

function restore(path: string) {
  const state = loadTrail();
  const next = arrive(state, path, 'pop', state.here && state.here !== path ? { path: state.here, label: labelFor(state.here) } : null);
  if (next !== state) saveTrail(next);
  emit();
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement)) return;
    if (link.target === '_blank') return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    let url: URL;
    try { url = new URL(link.href, location.href); } catch { return; }
    if (url.origin !== location.origin) return;
    const path = `${location.pathname}${location.search}`;
    const next = `${url.pathname}${url.search}`;
    if (next === path) return;
    const label = (seen && pageLabels.get(seen.key)) || labelFor(path);
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ path, label, at: Date.now() })); } catch { /* A full load can still use the referrer. */ }
  }, true);
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    restore(`${location.pathname}${location.search}`);
  });
}

/** The one back control for the site. A click from another page wins over the direct-visit fallback. */
export function SiteBack() {
  const location = useLocation();
  const navigate = useNavigate();
  useSyncExternalStore(subscribe, currentVersion, currentVersion);
  const path = `${location.pathname}${location.search}`;
  const state = loadTrail();
  const crumb = state.here === path ? state.stack.at(-1) ?? null : null;
  const fallback = crumb ? null : fallbackBackTarget(location.pathname);
  if (!crumb && !fallback) return null;
  const label = crumb?.label ?? fallback!.label;
  const to = crumb?.path ?? fallback!.to;
  return <Link className="back-link" to={to} onClick={event => {
    if (!crumb || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (historyIndex() > 0) {
      navigate(-1);
      return;
    }
    if (history.length > 1) {
      window.history.back();
      return;
    }
    saveTrail(arrive(loadTrail(), crumb.path, 'pop', null));
    navigate(crumb.path);
  }}>← {label}</Link>;
}
