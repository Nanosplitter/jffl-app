import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getAuth, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth';
import { deleteDoc, doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseApp } from './firebaseApp';
import { parseFollowed, type FollowedManager } from './follow';
import { MANAGERS } from './reference';

const CACHE_KEY = 'jffl.follow.v1';
const SKIP_PREFIX = 'jffl.follow.skip.';

interface AccountUser { uid: string; name: string }

interface AccountValue {
  ready: boolean;
  configured: boolean;
  user: AccountUser | null;
  followed: FollowedManager | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
  setFollowed: (next: FollowedManager | null) => Promise<void>;
}

const AccountContext = createContext<AccountValue | null>(null);

const readStorage = (storage: Storage | undefined, key: string) => {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
};
const writeStorage = (storage: Storage | undefined, key: string, value: string | null) => {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch { /* storage can be blocked */ }
};

function readCache(uid: string): FollowedManager | null {
  const raw = readStorage(typeof localStorage === 'undefined' ? undefined : localStorage, CACHE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { uid?: string; key?: string; name?: string };
    if (value.uid !== uid) return null;
    return parseFollowed(value.key, value.name);
  } catch {
    return null;
  }
}

function writeCache(uid: string | null, followed: FollowedManager | null) {
  const storage = typeof localStorage === 'undefined' ? undefined : localStorage;
  if (!uid || !followed) { writeStorage(storage, CACHE_KEY, null); return; }
  writeStorage(storage, CACHE_KEY, JSON.stringify({ uid, key: followed.key, name: followed.name }));
}

function authMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: string }).code) : '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/unauthorized-domain') return 'Sign-in is not available on this site yet.';
  return 'Could not sign in. Try again.';
}

function accountName(user: User) {
  return user.displayName?.trim() || 'Signed in';
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const app = getFirebaseApp();
  const configured = !!app;
  const [ready, setReady] = useState(!configured);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [followed, setFollowedState] = useState<FollowedManager | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userRef = useRef<AccountUser | null>(null);
  userRef.current = user;

  useEffect(() => {
    if (!app) return undefined;
    const auth = getAuth(app);
    const db = getFirestore(app);
    let stopProfile = () => {};
    const stopAuth = onAuthStateChanged(auth, next => {
      stopProfile();
      if (!next) {
        setUser(null);
        setFollowedState(null);
        writeCache(null, null);
        setReady(true);
        return;
      }
      const account = { uid: next.uid, name: accountName(next) };
      setUser(account);
      setFollowedState(readCache(next.uid));
      setReady(true);
      stopProfile = onSnapshot(doc(db, 'users', next.uid), snapshot => {
        if (userRef.current?.uid !== next.uid) return;
        const data = snapshot.data();
        const saved = snapshot.exists() ? parseFollowed(data?.followedKey, data?.followedName) : null;
        setFollowedState(saved);
        writeCache(next.uid, saved);
      }, () => { /* A failed profile read leaves the cached highlight in place until sign-out. */ });
    });
    void getRedirectResult(auth).catch(reason => {
      const message = authMessage(reason);
      if (message) setError(message);
    });
    return () => { stopAuth(); stopProfile(); };
  }, [app]);

  const value = useMemo<AccountValue>(() => ({
    ready,
    configured,
    user,
    followed,
    error,
    signIn: async () => {
      if (!app) return;
      setError(null);
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();
      const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches;
      try {
        if (narrow) await signInWithRedirect(auth, provider);
        else await signInWithPopup(auth, provider);
      } catch (reason) {
        const message = authMessage(reason);
        if (message) setError(message);
      }
    },
    signOutUser: async () => {
      if (!app) return;
      setError(null);
      writeCache(null, null);
      await signOut(getAuth(app));
    },
    setFollowed: async next => {
      if (!app || !userRef.current) return;
      const uid = userRef.current.uid;
      const db = getFirestore(app);
      setFollowedState(next);
      writeCache(uid, next);
      try {
        if (!next) await deleteDoc(doc(db, 'users', uid));
        else await setDoc(doc(db, 'users', uid), { followedKey: next.key, followedName: next.name });
        writeStorage(typeof localStorage === 'undefined' ? undefined : localStorage, `${SKIP_PREFIX}${uid}`, null);
      } catch {
        setError('Could not save that manager.');
      }
    },
  }), [app, configured, error, followed, ready, user]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error('Account is only available inside AccountProvider.');
  return value;
}

export function useFollowed(): FollowedManager | null {
  return useContext(AccountContext)?.followed ?? null;
}

export function FollowedNote({ on }: { on: boolean }) {
  return on ? <span className="sr-only">, followed manager</span> : null;
}

function skipped(uid: string) {
  return readStorage(typeof localStorage === 'undefined' ? undefined : localStorage, `${SKIP_PREFIX}${uid}`) === '1';
}

export function FollowPrompt() {
  const { ready, user, followed, setFollowed } = useAccount();
  const [choice, setChoice] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!ready || !user || followed || skipped(user.uid)) { setOpen(false); return; }
    setOpen(true);
  }, [ready, user, followed]);
  if (!open || !user) return null;
  const save = () => {
    const manager = MANAGERS.find(item => item.key === choice);
    if (!manager) return;
    void setFollowed({ key: manager.key, name: manager.manager });
    setOpen(false);
  };
  const skip = () => {
    writeStorage(typeof localStorage === 'undefined' ? undefined : localStorage, `${SKIP_PREFIX}${user.uid}`, '1');
    setOpen(false);
  };
  return <div className="follow-prompt" role="dialog" aria-label="Follow a manager">
    <p className="eyebrow">Follow a manager</p>
    <p>Highlight them across the site. Pick yourself if that’s you.</p>
    <div className="follow-prompt-actions">
      <label>Manager
        <select value={choice} onChange={event => setChoice(event.target.value)}>
          <option value="">Choose a manager</option>
          {(['premier', 'championship', 'league-one'] as const).map(slug => <optgroup key={slug} label={slug === 'league-one' ? 'League One' : slug === 'premier' ? 'Premier' : 'Championship'}>
            {MANAGERS.filter(item => item.slug === slug).map(item => <option key={item.key} value={item.key}>{item.manager}</option>)}
          </optgroup>)}
        </select>
      </label>
      <div className="follow-prompt-buttons">
        <button type="button" className="button" disabled={!choice} onClick={save}>Follow</button>
        <button type="button" className="button secondary" onClick={skip}>Skip</button>
      </div>
    </div>
  </div>;
}

export function AccountButton() {
  const { configured, ready, user, followed, error, signIn, signOutUser, setFollowed } = useAccount();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  if (!configured) return null;
  if (!user) return <button type="button" className="account-button" disabled={!ready || busy} onClick={() => { setBusy(true); void signIn().finally(() => setBusy(false)); }}>{busy ? 'Signing in…' : 'Sign in'}</button>;
  return <div className="account-menu" ref={panel}>
    <button type="button" className="account-button" aria-expanded={open} aria-controls="account-panel" onClick={() => setOpen(value => !value)}>{user.name}</button>
    {open && <div id="account-panel" className="account-panel">
      <label>Follow a manager
        <select aria-label="Manager to follow" value={followed?.key ?? ''} onChange={event => {
          const manager = MANAGERS.find(item => item.key === event.target.value);
          void setFollowed(manager ? { key: manager.key, name: manager.manager } : null);
        }}>
          <option value="">No one</option>
          {(['premier', 'championship', 'league-one'] as const).map(slug => <optgroup key={slug} label={slug === 'league-one' ? 'League One' : slug === 'premier' ? 'Premier' : 'Championship'}>
            {MANAGERS.filter(item => item.slug === slug).map(item => <option key={item.key} value={item.key}>{item.manager}</option>)}
          </optgroup>)}
        </select>
      </label>
      <Link to="/archive/ask" onClick={() => setOpen(false)}>Your chats</Link>
      <button type="button" onClick={() => { setOpen(false); void signOutUser(); }}>Sign out</button>
      {error && <p className="account-error" role="alert">{error}</p>}
    </div>}
    {!open && error && <p className="sr-only" role="alert">{error}</p>}
  </div>;
}
