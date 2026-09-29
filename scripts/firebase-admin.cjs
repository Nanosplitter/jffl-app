// Use Firebase CLI's existing login in memory. Never print or persist tokens.
const path = require('node:path');
const root = path.join(process.env.APPDATA, 'npm', 'node_modules', 'firebase-tools', 'lib');
const { getGlobalDefaultAccount } = require(path.join(root, 'auth.js'));
const { requireAuth } = require(path.join(root, 'requireAuth.js'));
const { Client } = require(path.join(root, 'apiv2.js'));
const project = 'jffl-live-colin';

async function client(origin, apiVersion = 'v1') {
  const account = getGlobalDefaultAccount();
  if (!account) throw new Error('Firebase CLI login required');
  await requireAuth({ project, nonInteractive: true, ...account }, true);
  return new Client({ urlPrefix: origin, apiVersion });
}

module.exports = { client, project };

if (require.main === module) {
  (async () => {
    const billing = await client('https://cloudbilling.googleapis.com');
    const accounts = await billing.get('/billingAccounts');
    console.log(JSON.stringify({ accounts: (accounts.body.billingAccounts || []).map(a => ({ name: a.name, displayName: a.displayName, open: a.open })) }));
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
