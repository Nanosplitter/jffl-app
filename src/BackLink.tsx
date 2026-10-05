import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { rememberBack, fallbackBackLabel, type BackMap } from './backStack';

const STORAGE_KEY = 'jffl-back-stack';
const pageLabels = new Map<string, string>();

let seen: { key: string; path: string } | null = null;

function loadBackMap(): BackMap {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') as BackMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveBackMap(map: BackMap) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* The back link still has its fallback. */ }
}

function historyIndex() {
  const index = (window.history.state as { idx?: number } | null)?.idx;
  return typeof index === 'number' ? index : 0;
}

/** Pages call this so the next back link can name them. */
export function usePageLabel(label: string | null | undefined) {
  const { key } = useLocation();
  if (label) pageLabels.set(key, label);
}

/** Record each in-app navigation so a later back link can return to the page that opened it. */
export function BackTrail() {
  const location = useLocation();
  const type = useNavigationType();
  const path = `${location.pathname}${location.search}`;
  if (!seen) seen = { key: location.key, path };
  else if (seen.key !== location.key) {
    if (type === 'PUSH' || type === 'REPLACE') {
      const crumb = { path: seen.path, label: pageLabels.get(seen.key) || fallbackBackLabel(seen.path.split('?')[0]) };
      saveBackMap(rememberBack(loadBackMap(), type, seen.key, location.key, crumb));
    }
    seen = { key: location.key, path };
  } else if (seen.path !== path) seen = { key: location.key, path };
  return null;
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  const { key } = useLocation();
  const navigate = useNavigate();
  const from = loadBackMap()[key];
  if (!from || historyIndex() <= 0) return <Link className="back-link" to={to}>{children}</Link>;
  return <Link className="back-link" to={from.path} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(-1);
  }}>← {from.label}</Link>;
}
