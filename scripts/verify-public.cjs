// Anonymous requests exercise deployed rules, not administrator permissions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { project } = require('./firebase-admin.cjs');
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).map(line => line.split('=')));
const apiKey = env.VITE_FIREBASE_API_KEY;
const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const url = path => `${root}/${path}?key=${encodeURIComponent(apiKey)}`;

(async () => {
  for (const slug of ['premier', 'championship', 'league-one']) {
    for (const collection of ['publicLeagues', 'publicRosters']) {
      const response = await fetch(url(`${collection}/${slug}`));
      assert.equal(response.status, 200, `Public read ${collection}/${slug}`);
      const document = await response.json();
      assert.equal(document.fields.slug.stringValue, slug);
      console.log(`${collection}/${slug}: anonymous read allowed, ${document.fields.updatedAt.stringValue}`);
    }
  }
  for (const path of ['_sync/lease', 'publicLeagues/unknown', 'publicLeagues']) {
    const response = await fetch(url(path));
    assert.equal(response.status, 403, `Private/unknown/list read ${path}`);
  }
  const denied = await fetch(url('publicLeagues/_security-test'), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { securityTest: { booleanValue: true } } }),
  });
  assert.equal(denied.status, 403, 'Anonymous write must be denied');
  console.log('Private reads, unknown documents, collection lists, and anonymous writes denied.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
