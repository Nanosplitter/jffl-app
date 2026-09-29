// Seed only the six published documents from a validated, anonymous ESPN snapshot.
const fs = require('node:fs');
const { client, project } = require('./firebase-admin.cjs');

function value(input) {
  if (input === null) return { nullValue: null };
  if (typeof input === 'string') return { stringValue: input };
  if (typeof input === 'boolean') return { booleanValue: input };
  if (typeof input === 'number' && Number.isFinite(input)) return Number.isInteger(input) ? { integerValue: String(input) } : { doubleValue: input };
  if (Array.isArray(input)) return { arrayValue: { values: input.map(value) } };
  if (typeof input === 'object') return { mapValue: { fields: fields(input) } };
  throw new Error('Unsupported Firestore value');
}
function fields(input) { return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, value(item)])); }

(async () => {
  const data = JSON.parse(fs.readFileSync('functions/local-data.json', 'utf8'));
  const api = await client('https://firestore.googleapis.com');
  const database = `projects/${project}/databases/(default)`;
  for (const slug of ['premier', 'championship', 'league-one']) {
    const summary = data.summaries[slug], roster = data.rosters[slug];
    if (summary?.schemaVersion !== 1 || summary.slug !== slug || summary.updatedAt !== roster?.updatedAt || !summary.teams?.length || !roster.players?.length) throw new Error(`Invalid ${slug} snapshot`);
    const writes = [['publicLeagues', summary], ['publicRosters', roster]].map(([collection, snapshot]) => ({ update: { name: `${database}/documents/${collection}/${slug}`, fields: fields(snapshot) } }));
    await api.post(`/${database}/documents:commit`, { writes });
    console.log(`${slug}: published ${summary.teams.length} teams and ${roster.players.length} roster entries`);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
