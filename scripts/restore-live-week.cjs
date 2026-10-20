// Recover a finished week's score history from Firestore point-in-time recovery.
// Reads publicLive/{slug} as it was at --at, and copies it to publicLiveWeeks/{slug}-{week}.
// Dry run unless --write is given. Needs PITR enabled and a read time inside the last 7 days.
// Needs FIRESTORE_ACCESS_TOKEN (an OAuth access token). The restore-live-week workflow supplies it.
// Usage: node scripts/restore-live-week.cjs --at 2026-10-14T12:00:00Z --week 6 [--write]
const project = 'jffl-live-colin';
const arg = name => { const index = process.argv.indexOf(`--${name}`); return index === -1 ? null : process.argv[index + 1]; };
const at = arg('at');
const week = Number(arg('week'));
const write = process.argv.includes('--write');
const slugs = ['premier', 'championship', 'league-one'];
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

async function call(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.FIRESTORE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${json.error?.message ?? response.statusText}`);
  return json;
}

(async () => {
  if (!process.env.FIRESTORE_ACCESS_TOKEN) throw new Error('FIRESTORE_ACCESS_TOKEN is required');
  if (!at || Number.isNaN(Date.parse(at)) || !Number.isInteger(week) || week < 1) throw new Error('Usage: --at <ISO time> --week <number> [--write]');
  const readTime = encodeURIComponent(new Date(at).toISOString());
  for (const slug of slugs) {
    let found;
    try {
      found = await call('GET', `${base}/publicLive/${slug}?readTime=${readTime}`);
    } catch (error) {
      console.log(`${slug}: cannot read at that time (${error.message})`);
      continue;
    }
    const fields = found.fields ?? {};
    const docWeek = Number(fields.week?.integerValue);
    const teams = Object.keys(fields.series?.mapValue?.fields ?? {}).length;
    if (docWeek !== week) { console.log(`${slug}: document held week ${docWeek}, not ${week}; skipped`); continue; }
    console.log(`${slug}: week ${docWeek}, ${teams} teams, updated ${fields.updatedAt?.stringValue}`);
    if (!write) continue;
    try {
      await call('PATCH', `${base}/publicLiveWeeks/${slug}-${week}?currentDocument.exists=false`, { fields });
      console.log(`${slug}: restored to publicLiveWeeks/${slug}-${week}`);
    } catch (error) {
      console.log(`${slug}: not written (${error.message})`);
    }
  }
  if (!write) console.log('Dry run. Run again with write ticked to restore.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
