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

Overview `/`; team `/league/:slug/team/:teamId`; league match `/league/:slug/match/:matchId`; rostered players `/players`; player `/players/:playerId`.
Player fantasy totals and projections are scoped to the corresponding league's
scoring. The player page keeps each played week's counting stats; a week with
no captured line stays blank. Missing numbers display as a dash. Starters,
bench, and IR follow the current scoring-period lineup. D/ST IDs remain
strings, including negative IDs.

Commissioner's pages:

- `/summary`: searchable standings, points for/against, win percentage, previous-week/start/draft rank movement, league scoring averages, and provisional promotion/relegation bands.
- `/cups`: all four cups; `/cups/jffl`, `/cups/premier`, `/cups/championship`, `/cups/league-one`: complete interactive brackets, per-week scores, totals, manager highlights, and round selection. Each match opens `/cups/{cup}/match/{id}` with the week-by-week scores and both starting lineups, including weeks that have already finished.
- `/weekly`: current or completed-week scoring leaderboard, 100+ club, scoring extremes, margins, and current starting-player performances.
- `/history`: 13 current trophy races, historical trophy and JFFL Cup tables, and league timeline.
- `/archive`: league history through 2025 from the commissioner workbook. Scoring, the record book, titles, head-to-head series, manager careers, draft slot, and a week in history. Related routes sit under `/archive/`.
- `/archive/ask` and `/archive/ask/share#...`: the AI "Ask the archive" assistant and shared answers (see below). Older `/history/archive` and `/history/ask` links redirect here.

The header's sun/moon button switches light and dark themes. The preference is
saved locally; the initial default follows the visitor's system preference.

Cup seeds, pairings, starting ranks, and historical trophy counts follow the
supplied 2026 Week 2 PDF. The Championship Cup first round uses **Josh vs. SeanH,
99–86**, as confirmed by the owner. JFFL Cup rounds span weeks 3–4, 6–7, 9–10,
12–13, and 15–16; league cups use weeks 2, 5, 8, and 11. A team advances only
after every required score is final. A level tie plays the following week, so a
league cup can run two weeks and the JFFL Cup three. If that replay is also
level, the match is an old fashioned duel and nobody advances.
No browser writes or administrative interface are exposed.

Live and completed team scores come from ESPN, including its historical score
corrections. Historical trophy/finals counts and through-2025 cup records are
labeled source snapshots from the supplied PDF/email. They do not automatically
gain new historical totals. Current-season cup results and trophy races update
from the live snapshots. Promotion bands are provisional because Jason's
trophy-based exceptions determine final allocations. Raw emails, PDF files,
contact information, and mail metadata are not published.

## Ask the archive (AI assistant)

`/archive/ask` lets visitors ask questions about the 2002 to 2025 archive and the
2026 season in progress in plain language, and get answers with interactive charts.
`/archive/ask/share#...` opens a shared answer. Archive is a header section; Ask the
archive is one of its pages.

How it works:

- The browser calls Gemini through **Firebase AI Logic** (`firebase/ai`). There is no
  Cloud Function and no Gemini key in the page. Requests are protected by App Check
  (reCAPTCHA Enterprise) and the project's Firebase AI quotas. The Gemini side can live in a
  separate Firebase project (set `VITE_AI_FIREBASE_*`, below); Firestore stays on the main one.
  This repo's setup uses the project that holds the Gemini prepay credits for AI Logic, App
  Check, and Remote Config, and `jffl-live-colin` for Firestore and hosting.
- The model never sees the whole archive and never types numbers. It calls tools
  (`src/history/askTools.ts`) that run exact queries over the bundled `archive.json`:
  game and season queries, head-to-head, manager careers, record book, title years,
  draft slots, and week slices. It then asks for a chart by naming a returned dataset.
- The 2026 season comes from the same Firestore snapshots as the rest of the site
  (`publicLeagues` and `publicRosters`), never from ESPN directly. `src/history/liveSeason.ts`
  maps ESPN teams to manager nicknames and turns the snapshots into 2026 game and season rows
  plus a 2026-only `player_weeks` table (`query_players`: starters, bench, and points by week).
  Games still being played have `status: live`, and answers and caveats say so with the
  snapshot time. Records, head-to-head, and week-in-history count finished games only. 2026
  titles stay unknown until decided, and the 2026 draft slot is not available. Past-week
  bench players are not in ESPN's saved lineups, so their slot is unknown. The page shows
  "This season as of ..." and rebuilds the tables when a snapshot updates; charts already on
  screen keep their rows.
- Charts (`src/history/chartSpec.ts`, `chartBuild.ts`, `recipes.ts`, `src/AskCharts.tsx`) are
  typed specs (line, area, bar, stacked bar, scatter, heatmap, radar, boxplot, table, stat cards,
  rank over time), seven league recipes (rivalry matrix, season race, career timeline, trophy
  wall, scoring distribution, draft slot curve, head-to-head scoreboard), or a sanitized Apache
  ECharts option. Specs are validated before drawing; unsafe or unknown fields are rejected.
  ECharts is lazy-loaded with only the chart types it needs.
- Each chart can re-run its saved query locally with new years, leagues, or game types
  ("Adjust this chart"), show its data table, export PNG or CSV, and make a share link.
  Clicking a point asks a follow-up about it.
- JFFL Cup scores are two-week totals; the tools flag mixing them with single weeks, and
  caveats are shown under each chart. Unknown values stay unknown, never zero.
- The current chat lives in `sessionStorage` for the tab. Nothing is stored on a server. Share
  links hold the chart recipe and the queries (not rows) in the URL fragment, compressed
  (limit 8 KB). The receiving browser re-validates and rebuilds everything from its own copy of
  the archive and makes no model call. The written summary in a link is unverified text and is
  shown as plain text with a note. A link whose charts use 2026 data also holds the snapshot
  time; the receiver's charts use their current snapshot and say the numbers may have changed.
- Questions and tool results are sent to Google (Gemini) through Firebase, so the page tells
  visitors not to include personal details.

Local use (no Firebase project changes needed):

```powershell
$env:VITE_ASK_MOCK = 'true'   # canned local assistant; real archive numbers, canned wording
npm run dev
```

Without `VITE_ASK_MOCK` and without `.env.local`, the dev server also uses the local assistant.
With `.env.local` pointing at a real project, a question goes to that project's Firebase AI Logic
(which only works after the rollout steps below). Production builds never include the local assistant.

Configuration (all public client config; no secrets):

| Setting | Where | Purpose |
| --- | --- | --- |
| `VITE_AI_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID` | `.env.local` / build env | Optional web config of a separate Firebase project used only for the assistant. Without them the main project is used. Must also be present in the production build env. |
| `VITE_RECAPTCHA_SITE_KEY` | `.env.local` / build env | reCAPTCHA Enterprise site key for App Check, created in the AI project. Required in production; without it the assistant shows as not set up. |
| `VITE_ASK_MOCK` | dev only | Use the local assistant even when Firebase is configured. |
| `VITE_APPCHECK_DEBUG_TOKEN` | dev only | Debug token registered in the console for local App Check. |
| `ask_enabled` | Remote Config | Kill switch. `false` pauses the assistant without a deploy. |
| `ask_model` | Remote Config | Model name, default `gemini-3.8-flash`. |
| `ask_thinking` | Remote Config | `minimal`, `low` (default), `medium`, `high`, or `default`. |
| `ask_max_output_tokens` | Remote Config | Default 2048. |

Client-side courtesy limits (`src/history/askGuards.ts`): 500 characters per question, 20 questions
per chat, a short cooldown, and 40 questions per browser per day. They are not security; App Check,
quotas, and budget alerts are.

Budget plan (about $10 a month): start on the free tier, and when billing is enabled keep Gemini
requests around 60 a day, lower the per-user requests-per-minute quota from 100 to about 10, and set
budget alerts at $5 and $10. At the introductory $0.75 in / $3.75 out per million tokens (until the end
of 2026; $1.50 / $7.50 after), an answer with a few tool steps is typically a fraction of a cent. Run
the evaluation below to measure the real cost per question before widening access.

Quality check (local, billable, never run in CI): `scripts/eval-ask.ts` sends about 19 golden
questions (`src/history/askEval.ts`) to the Gemini API with your own key and compares answers with
numbers computed from the archive. The current-season question uses the committed week 3
fixtures in `tests/fixtures/`, not live ESPN data.

```powershell
$env:GEMINI_API_KEY = '<your key>'   # shell only; do not write it to a file
node --experimental-strip-types scripts/eval-ask.ts --only most-super-bowls,chart-trend
```

Output goes to `ask-eval-output/` (ignored). Numbers in an answer that no tool returned are listed for
review.

### Rollout checklist (needs explicit owner approval; nothing here runs automatically)

These change the production Firebase project, so they are documented rather than done:

1. Choose the Firebase target explicitly (`.firebaserc` is intentionally absent) and confirm it. If
   Gemini billing lives in a different project, run these steps against that project and set
   `VITE_AI_FIREBASE_*`.
2. Enable Firebase AI Logic with the Gemini Developer API (`firebase init ailogic` or the console).
3. Create a reCAPTCHA Enterprise key, register the web app in App Check, put the site key in
   `VITE_RECAPTCHA_SITE_KEY`, and register debug tokens for local testing. Enforce App Check for
   Firebase AI Logic only after confirming a real browser passes.
4. Add the Remote Config parameters above (`ask_enabled` true, `ask_model`, `ask_thinking`).
5. Set the per-user quota and budget alerts described above.
6. Run `scripts/eval-ask.ts`, review failures, then `npm run build` and `firebase deploy --only hosting`.
7. To stop spending quickly: set `ask_enabled` to `false` in Remote Config, or disable the API.

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
pages and after the first question in Ask the archive. All visitors share the same provider reads; visiting a page never contacts
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
Ask the archive reads the three roster documents only once a visitor sends a first
question (or opens a saved chat or share link that used player data). That adds
three document reads, plus three more each time the updater publishes a new roster
snapshot while the page stays open. Visits without a question add none.

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
