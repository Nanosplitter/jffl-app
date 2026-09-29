import { readFile } from 'node:fs/promises';
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

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
});
