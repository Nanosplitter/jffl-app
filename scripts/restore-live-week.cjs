// Recover a finished week's score history from Firestore point-in-time recovery.
// Reads publicLive/{slug} as it was at --at, and copies it to publicLiveWeeks/{slug}-{week}.
// Dry run unless --write is given. Needs PITR enabled and a read time inside the last 7 days.
// Usage: node scripts/restore-live-week.cjs --at 2026-10-14T12:00:00Z --week 6 [--write]
const { client, project } = require('./firebase-admin.cjs');

const arg = name => { const index = process.argv.indexOf(`--${name}`); return index === -1 ? null : process.argv[index + 1]; };
const at = arg('at');
const week = Number(arg('week'));
const write = process.argv.includes('--write');
const slugs = ['premier', 'championship', 'league-one'];
const base = `/projects/${project}/databases/(default)/documents`;

(async () => {
  if (!at || Number.isNaN(Date.parse(at)) || !Number.isInteger(week) || week < 1) throw new Error('Usage: --at <ISO time> --week <number> [--write]');
  const firestore = await client('https://firestore.googleapis.com');
  for (const slug of slugs) {
    let found;
    try {
      found = await firestore.get(`${base}/publicLive/${slug}`, { queryParams: { readTime: new Date(at).toISOString() } });
    } catch (error) {
      console.log(`${slug}: cannot read at that time (${error.message})`);
      continue;
    }
    const fields = found.body.fields ?? {};
    const docWeek = Number(fields.week?.integerValue);
    const teams = Object.keys(fields.series?.mapValue?.fields ?? {}).length;
    if (docWeek !== week) { console.log(`${slug}: document held week ${docWeek}, not ${week}; skipped`); continue; }
    console.log(`${slug}: week ${docWeek}, ${teams} teams, updated ${fields.updatedAt?.stringValue}`);
    if (!write) continue;
    try {
      await firestore.patch(`${base}/publicLiveWeeks/${slug}-${week}`, { fields }, { queryParams: { 'currentDocument.exists': false } });
      console.log(`${slug}: restored to publicLiveWeeks/${slug}-${week}`);
    } catch (error) {
      console.log(`${slug}: not written (${error.message})`);
    }
  }
  if (!write) console.log('Dry run. Add --write to restore.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
