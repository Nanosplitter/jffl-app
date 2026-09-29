const fs = require('node:fs');
const { client, project } = require('./firebase-admin.cjs');

async function main() {
  const action = process.argv[2];
  if (action === 'enable-firestore') {
    const api = await client('https://serviceusage.googleapis.com');
    const result = await api.post(`/projects/${project}/services/firestore.googleapis.com:enable`, {});
    console.log(JSON.stringify({ operation: result.body.name }));
  } else if (action === 'web-config') {
    const api = await client('https://firebase.googleapis.com', 'v1beta1');
    const app = '1:740731132957:web:7fe06407f90916ffd53af4';
    const result = await api.get(`/projects/${project}/webApps/${app}/config`);
    const data = result.body;
    fs.writeFileSync('.env.local', [
      `VITE_FIREBASE_API_KEY=${data.apiKey}`,
      `VITE_FIREBASE_AUTH_DOMAIN=${data.authDomain}`,
      `VITE_FIREBASE_PROJECT_ID=${data.projectId}`,
      `VITE_FIREBASE_APP_ID=${data.appId}`,
    ].join('\n') + '\n');
    console.log('Firebase web configuration saved to ignored .env.local');
  } else if (action === 'link-billing') {
    const account = process.argv[3];
    if (!/^billingAccounts\/[0-9A-F-]+$/.test(account || '')) throw new Error('Specify the selected billing account');
    const api = await client('https://cloudbilling.googleapis.com');
    const result = await api.put(`/projects/${project}/billingInfo`, { billingAccountName: account });
    console.log(JSON.stringify({ project: result.body.projectId, billingEnabled: result.body.billingEnabled }));
  } else if (action === 'configure-spend-cap') {
    // The public Budgets API does not persist Firebase's enforcing service caps.
    // Avoid creating an alerts-only budget that conflicts with the console cap.
    throw new Error('Configure service spend caps in Firebase Console: Settings → Usage and billing → Account & budgets. Verify the saved cap there; this helper only manages budget alerts.');
  } else if (action === 'configure-budget') {
    const billing = await client('https://cloudbilling.googleapis.com');
    const info = await billing.get(`/projects/${project}/billingInfo`);
    if (!info.body.billingEnabled) throw new Error('Select and link a billing account first');
    const budgets = await client('https://billingbudgets.googleapis.com');
    // Charge API quota to this project instead of the Firebase CLI OAuth project.
    const requestOptions = () => ({ headers: new Headers({ 'x-goog-user-project': project }) });
    const parent = info.body.billingAccountName;
    const existing = await budgets.get(`/${parent}/budgets`, requestOptions());
    const displayName = 'JFFL monthly $5';
    const target = (existing.body.budgets || []).find(budget => budget.displayName === displayName && budget.budgetFilter?.projects?.includes('projects/740731132957'));
    const body = {
      displayName,
      budgetFilter: { projects: ['projects/740731132957'], calendarPeriod: 'MONTH', creditTypesTreatment: 'INCLUDE_ALL_CREDITS' },
      amount: { specifiedAmount: { currencyCode: 'USD', units: '5' } },
      thresholdRules: [0.5, 0.9, 1].map(thresholdPercent => ({ thresholdPercent, spendBasis: 'CURRENT_SPEND' })),
      notificationsRule: { disableDefaultIamRecipients: false, enableProjectLevelRecipients: true },
    };
    const result = target ? await budgets.patch(`/${target.name}`, { ...body, etag: target.etag }, requestOptions()) : await budgets.post(`/${parent}/budgets`, body, requestOptions());
    console.log(JSON.stringify({ name: result.body.name, displayName: result.body.displayName, amount: result.body.amount, spendCap: result.body.spendCap || null }));
  } else throw new Error('Unknown setup action');
}
main().catch(error => { console.error(JSON.stringify({ message: error.message, status: error.status, apiError: error.context?.body?.error })); process.exitCode = 1; });
