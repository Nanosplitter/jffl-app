# JFFL League Central

Public dashboard: https://jffl-live-colin.web.app

React, TypeScript, and Vite on Firebase Hosting. A Python adapter reads ESPN using
`espn-api==0.46.0`; visitors only read shared Firestore snapshots.

## Deployment status

Implemented:

- Firebase Hosting frontend, Firestore public snapshots, and scheduled Python updater.
- Anonymous reads verified; browser writes, collection lists, and internal reads denied.
- All three leagues seeded with 2026 ESPN data; the updater refreshes league snapshots independently.
- Direct league and team links, competition pages, and light/dark themes.

Automatic refreshes continue while the owner's PC is off. Timestamps and delayed
update notices make retained snapshots visible. Production billing and spend
controls are configured in Firebase and Google Cloud consoles, not in this repo.

## Leagues and pages

| League | ESPN ID | Route |
| --- | --- | --- |
| Premier League | 831337 | `/league/premier` |
| Championship | 50597 | `/league/championship` |
| League One | 2035286513 | `/league/league-one` |

Overview `/`; team `/league/:slug/team/:teamId`; rostered players `/players`.
Player fantasy totals and projections are scoped to the corresponding league's
scoring. Missing numbers display as a dash. Starters, bench, and IR follow the
current scoring-period lineup. D/ST IDs remain strings, including negative IDs.

Commissioner's pages:

- `/summary`: searchable standings, points for/against, win percentage, previous-week/start/draft rank movement, league scoring averages, and provisional promotion/relegation bands.
- `/cups`: all four cups; `/cups/jffl`, `/cups/premier`, `/cups/championship`, `/cups/league-one`: complete interactive brackets, per-week scores, totals, manager highlights, and round selection. Each match opens `/cups/{cup}/match/{id}` with the week-by-week scores and, for the current week, both starting lineups.
- `/weekly`: current or completed-week scoring leaderboard, 100+ club, scoring extremes, margins, and current starting-player performances.
- `/history`: 13 current trophy races, historical trophy and JFFL Cup tables, and league timeline.

The header's sun/moon button switches light and dark themes. The preference is
saved locally; the initial default follows the visitor's system preference.

Cup seeds, pairings, starting ranks, and historical trophy counts follow the
supplied 2026 Week 2 PDF. The Championship Cup first round uses **Josh vs. SeanH,
99–86**, as confirmed by the owner. JFFL Cup rounds span weeks 3–4, 6–7, 9–10,
12–13, and 15–16; league cups use weeks 2, 5, 8, and 11. A team advances only
after every required score is final. Ties show **Awaiting commissioner decision**;
resolving an exceptional tie requires a commissioner-approved reference update.
No browser writes or administrative interface are exposed.

Live and completed team scores come from ESPN, including its historical score
corrections. Historical trophy/finals counts and through-2025 cup records are
labeled source snapshots from the supplied PDF/email. They do not automatically
gain new historical totals. Current-season cup results and trophy races update
from the live snapshots. Promotion bands are provisional because Jason's
trophy-based exceptions determine final allocations. Raw emails, PDF files,
contact information, and mail metadata are not published.

## Local development

Requires Node.js 22+ and Python 3.13. This workspace uses a project-local venv.

```powershell
npm ci
uv venv functions/venv --python 3.13
uv pip install --python functions/venv/Scripts/python.exe -r functions/requirements.txt -r functions/requirements-dev.txt
functions/venv/Scripts/python.exe functions/verify_live.py --export
npm run dev
```

Without `.env.local`, Vite serves the ignored real development snapshot through
`/__local-data`. This route is available only in the development server; it is
never included in the production build. With `.env.local`, the site reads the
configured Firebase project. Copy `.env.example` and fill in the public Firebase
web SDK values, or run `node scripts/cloud-setup.cjs web-config` using the existing
an authorized Firebase CLI login. Firebase web API keys are public configuration, not access
credentials; Firestore rules enforce access.

For local Firestore testing use `VITE_USE_EMULATORS=true` and a demo Firebase
project. Do not point destructive development tests at production.

## Verification

```powershell
npm run build
npm run test:competitions
$env:PYTHONPATH = Join-Path (Get-Location) 'functions'
functions/venv/Scripts/python.exe -m pytest functions/tests -q
firebase --project demo-jffl emulators:exec --only firestore "npm run test:rules"
functions/venv/Scripts/python.exe functions/verify_live.py
node scripts/verify-public.cjs
```

Firestore emulator tests need Java 21+. A project-local JRE used for verification
is ignored under `.tools/java21/`; it does not modify system Java settings.

Checks completed on 2026-09-28: production build, 11 Python tests, 5 cup tests, 3 emulator rule
tests, live comparison of every team's list/record/standing/roster and every
rostered player's scored points, deployed anonymous security checks, desktop and
phone layouts, searchable/filterable players, and hosted direct team links.
Cup tests use a fixed public Week 3 fixture in `tests/fixtures/`, independent of
credentials, ESPN availability, and changing live scores. They check PDF pairings,
Week 2 results, two-leg completion, tied scores, and missing-league behavior.

## Updater and storage

`functions/main.py` defines one scheduled function, `refresh_jffl`, in `us-east1`:
every three minutes, zero minimum instances, one maximum instance, concurrency
one, 256 MB RAM, first-generation CPU allocation, 150-second timeout, no scheduler
retries. An expiring Firestore transaction lease also prevents overlapping runs.

The ESPN adapter bounds each league refresh to a 42-second request deadline,
uses connection/read timeouts, and allows at most one retry of selected transient
errors. Each league refresh runs independently. A validated summary and roster
are committed together in a Firestore batch:

- `publicLeagues/{slug}`: teams, standings, current/historical weekly matchups, completed weeks, scoring, freshness.
- `publicRosters/{slug}`: rostered players, slots, weekly and cumulative stats.
- `_sync/lease`: private synchronization state.

Validation checks ownership, duplicate IDs, finite JSON numbers, and a conservative
700 KB ceiling per document. Published data excludes account identities, email
addresses, cookies, and credentials. Failures retain the previous successful
snapshot and record the failed attempt separately. If even the status write fails,
the next league still refreshes; the client recognizes stale timestamps.

The frontend subscribes to three summaries. Rosters load only for team/player
pages. All visitors share the same provider reads; visiting a page never contacts
ESPN. Arrays are exempted from Firestore indexing to avoid unnecessary index work.

## Cloud maintenance

The helpers reuse the existing Firebase CLI login **in memory** and never print or
save authentication tokens. `firebase-admin.cjs` locates a Windows global Firebase
CLI installation under `%APPDATA%/npm/node_modules/firebase-tools`.

Choose the intended Firebase project explicitly before deploying. `.firebaserc`
is local-only and ignored; do not commit a personal deployment target. Set an
Artifact Registry cleanup policy when prompted by the Firebase CLI. Grant
the updater's runtime service account `roles/datastore.user` if it does not have
Firestore access; avoid broader project roles. The scheduler-created service
account must retain the invoker permission configured by Firebase.

Manage service caps and budget alerts in the Firebase and Google Cloud consoles.
Budget alerts do not pause services. Treat production billing configuration as
out-of-band operational state; never put account details or project bindings in
source control.

After backend changes, deploy functions and wait for a natural scheduled
invocation. Verify all three public `updatedAt` timestamps advance with
`refreshStatus: ok` and the new schema fields before publishing dependent pages.

Manual seeding (administrator operation):

```powershell
functions/venv/Scripts/python.exe functions/verify_live.py --export
node scripts/seed-firestore.cjs
```

Subsequent frontend/rules releases:

```powershell
npm run build
firebase deploy --only hosting,firestore --project <your-firebase-project>
```

## Costs and limitations

The target is below $5/month, not a guaranteed total. At a three-minute cadence,
six published-document writes per run are about 2,880 writes per day; lease traffic,
visitor document reads, hosting transfer, logs, builds, and container storage also
contribute. Inactive functions scale to zero. One scheduler job serves all leagues.

[Firebase spend caps](https://firebase.google.com/docs/projects/billing/spend-caps)
are currently a preview feature, use gross estimated costs before credits, and
can overshoot during reporting delays. A Functions cap does not cover Firestore,
Hosting, Scheduler, or every supporting service. A project budget is alerts only.

ESPN's API is unofficial and `espn-api` is community maintained. Provider changes
may require adapter updates. No ESPN authentication is required for these leagues
as verified today. The first version covers the 2026 season and rostered players;
it does not include free agents, historical ESPN season browsing, roster writes,
or AI advice. The separately supplied historical commissioner records are shown
as a source snapshot.
