import { readFile } from 'node:fs/promises';
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';

let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-jffl',
    firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
  });
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      ...['premier', 'championship', 'league-one'].flatMap(slug => [
        setDoc(doc(db, 'publicLeagues', slug), { slug }),
        setDoc(doc(db, 'publicRosters', slug), { slug }),
      ]),
      setDoc(doc(db, '_sync', 'lease'), { token: 'private' }),
      setDoc(doc(db, 'publicHistory', '2026'), { schemaVersion: 1, season: 2026 }),
    ]);
  });
});
after(async () => { await environment?.cleanup(); });

test('all three published leagues and rosters are publicly readable', async () => {
  const db = environment.unauthenticatedContext().firestore();
  for (const slug of ['premier', 'championship', 'league-one']) {
    await assertSucceeds(getDoc(doc(db, 'publicLeagues', slug)));
    await assertSucceeds(getDoc(doc(db, 'publicRosters', slug)));
  }
});
test('unauthenticated and signed-in visitors cannot write', async () => {
  for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('visitor')]) {
    const db = context.firestore();
    await assertFails(setDoc(doc(db, 'publicLeagues', 'premier'), { overwritten: true }));
    await assertFails(setDoc(doc(db, 'publicRosters', 'premier'), { overwritten: true }));
  }
});
test('internal state, unlisted leagues, and collection scans are denied', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, '_sync', 'lease')));
  await assertFails(getDoc(doc(db, 'publicLeagues', 'other')));
  await assertFails(getDocs(collection(db, 'publicLeagues')));
  await assertFails(getDocs(collection(db, 'publicHistory')));
});
test('a saved season is publicly readable and not writable', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'publicHistory', '2026')));
  await assertFails(getDoc(doc(db, 'publicHistory', 'notes')));
  await assertFails(setDoc(doc(db, 'publicHistory', '2026'), { overwritten: true }));
});

const profile = { followedKey: 'premier:16', followedName: 'Jason' };
const thread = { title: 'Who won the most titles?', preview: 'Who won the most titles?', updatedAt: '2026-10-13T20:00:00.000Z' };
const message = { role: 'user', text: 'Who won the most titles?', charts: [], followUps: [], order: 0 };
const share = { owner: 'owner', kind: 'message', title: 'Who won the most titles?', createdAt: '2026-10-13T20:00:00.000Z', archive: '10-24' };

test('a visitor can read and write only their own profile and chats', async () => {
  const owner = environment.authenticatedContext('owner').firestore();
  const other = environment.authenticatedContext('other').firestore();
  await assertSucceeds(setDoc(doc(owner, 'users', 'owner'), profile));
  await assertSucceeds(getDoc(doc(owner, 'users', 'owner')));
  await assertFails(getDoc(doc(other, 'users', 'owner')));
  await assertFails(getDocs(collection(owner, 'users')));
  await assertFails(setDoc(doc(owner, 'users', 'owner'), { followedKey: 'nope', followedName: 'Jason' }));
  await assertFails(setDoc(doc(owner, 'users', 'other'), profile));
  await assertSucceeds(setDoc(doc(owner, 'users', 'owner', 'threads', 't1'), thread));
  await assertSucceeds(setDoc(doc(owner, 'users', 'owner', 'threads', 't1', 'messages', 'm1'), message));
  await assertSucceeds(setDoc(doc(owner, 'users', 'owner', 'threads', 't1', 'state', 'transcript'), { contents: [], sources: [] }));
  await assertSucceeds(getDocs(collection(owner, 'users', 'owner', 'threads')));
  await assertFails(getDoc(doc(other, 'users', 'owner', 'threads', 't1')));
  await assertFails(getDocs(collection(other, 'users', 'owner', 'threads')));
  await assertFails(setDoc(doc(owner, 'users', 'owner', 'threads', 't1', 'state', 'other'), { contents: [], sources: [] }));
});

test('a shared chat is readable by id and stays frozen', async () => {
  const owner = environment.authenticatedContext('owner').firestore();
  const other = environment.authenticatedContext('other').firestore();
  const anon = environment.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(anon, 'shares', 's1'), share));
  await assertFails(setDoc(doc(owner, 'shares', 's1'), { ...share, owner: 'other' }));
  await assertFails(setDoc(doc(owner, 'shares', 'missing', 'messages', 'm1'), { role: 'user', text: 'Hi', charts: [], order: 0 }));
  await assertSucceeds(setDoc(doc(owner, 'shares', 's1'), share));
  await assertSucceeds(setDoc(doc(owner, 'shares', 's1', 'messages', 'm1'), { role: 'assistant', text: 'Jason.', charts: [], order: 1 }));
  await assertSucceeds(getDoc(doc(anon, 'shares', 's1')));
  await assertSucceeds(getDocs(collection(anon, 'shares', 's1', 'messages')));
  await assertFails(getDocs(collection(anon, 'shares')));
  await assertFails(setDoc(doc(owner, 'shares', 's1'), { ...share, title: 'Changed' }));
  await assertFails(setDoc(doc(other, 'shares', 's1', 'messages', 'm2'), { role: 'user', text: 'No', charts: [], order: 2 }));
  await assertFails(setDoc(doc(anon, 'shares', 's1', 'messages', 'm1'), { role: 'assistant', text: 'Edited', charts: [], order: 1 }));
  await assertFails(deleteDoc(doc(other, 'shares', 's1')));
  await assertSucceeds(deleteDoc(doc(owner, 'shares', 's1', 'messages', 'm1')));
  await assertSucceeds(deleteDoc(doc(owner, 'shares', 's1')));
  await assertFails(getDoc(doc(anon, 'shares', 's1', 'messages', 'm1')));
});
