import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, doc, getFirestore, onSnapshot } from 'firebase/firestore';
import { LEAGUES, type LeagueRosterSnapshot, type LeagueSlug, type LeagueSummary } from './types';

type State<T> = { data: T | null; loading: boolean; error: boolean };
const empty = <T,>(): State<T> => ({ data: null, loading: true, error: false });
const configured = !!import.meta.env.VITE_FIREBASE_PROJECT_ID;
const db = configured ? getFirestore(initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})) : null;
if (db && import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') connectFirestoreEmulator(db, '127.0.0.1', 8080);

type LocalData = { summaries: Record<LeagueSlug, LeagueSummary>; rosters: Record<LeagueSlug, LeagueRosterSnapshot> };
let localPromise: Promise<LocalData> | null = null;
function readLocal() {
  return localPromise ??= fetch('/__local-data').then(async response => {
    if (!response.ok) throw new Error('Live development snapshot is unavailable');
    return response.json() as Promise<LocalData>;
  });
}

function watch<T>(collection: string, slug: LeagueSlug, receive: (value: T | null) => void, fail: () => void) {
  if (db) return onSnapshot(doc(db, collection, slug), snapshot => {
    const value = snapshot.exists() ? snapshot.data() : null;
    if (value && (value.schemaVersion !== 1 || value.slug !== slug || typeof value.updatedAt !== 'string'
      || (collection === 'publicLeagues' ? !Array.isArray(value.teams) || !Array.isArray(value.matchups) || !Array.isArray(value.scoring) : !Array.isArray(value.players)))) { fail(); return; }
    receive(value as T | null);
  }, fail);
  let cancelled = false;
  if (import.meta.env.DEV) readLocal().then(data => {
    if (!cancelled) receive((collection === 'publicLeagues' ? data.summaries[slug] : data.rosters[slug]) as T);
  }).catch(() => { if (!cancelled) fail(); });
  else fail();
  return () => { cancelled = true; };
}

const SummaryContext = createContext<Record<LeagueSlug, State<LeagueSummary>>>({
  premier: empty(), championship: empty(), 'league-one': empty(),
});

export function DataProvider({ children }: { children: ReactNode }) {
  const [summaries, setSummaries] = useState<Record<LeagueSlug, State<LeagueSummary>>>({
    premier: empty(), championship: empty(), 'league-one': empty(),
  });
  useEffect(() => {
    const stops = LEAGUES.map(({ slug }) => watch<LeagueSummary>('publicLeagues', slug,
      data => setSummaries(previous => ({ ...previous, [slug]: { data, loading: false, error: !data } })),
      () => setSummaries(previous => ({ ...previous, [slug]: { ...previous[slug], loading: false, error: true } }))));
    return () => stops.forEach(stop => stop());
  }, []);
  return <SummaryContext value={summaries}>{children}</SummaryContext>;
}
export const useSummaries = () => useContext(SummaryContext);

export function useRosters(slugs: LeagueSlug[]) {
  const key = slugs.join(',');
  const [states, setStates] = useState<Partial<Record<LeagueSlug, State<LeagueRosterSnapshot>>>>({});
  useEffect(() => {
    const selected = key.split(',').filter(Boolean) as LeagueSlug[];
    const stops = selected.map(slug => {
      setStates(previous => ({ ...previous, [slug]: previous[slug] ?? empty() }));
      return watch<LeagueRosterSnapshot>('publicRosters', slug,
        data => setStates(previous => ({ ...previous, [slug]: { data, loading: false, error: !data } })),
        () => setStates(previous => ({ ...previous, [slug]: { ...previous[slug] ?? empty(), loading: false, error: true } })));
    });
    return () => stops.forEach(stop => stop());
  }, [key]);
  return states;
}
export const localPreview = import.meta.env.DEV && !configured;
