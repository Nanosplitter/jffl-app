# Contributor guide for AI agents

This file is the working contract for AI coding agents in this repository. Read
it together with `README.md` before changing the app. Treat user instructions as
the authority when they differ from these defaults.

## What this app does

JFFL League Central is a read-only dashboard for three public ESPN fantasy
football leagues. A scheduled Python function fetches ESPN data and publishes
validated Firestore snapshots. The React client reads the shared snapshots;
opening the site must never trigger ESPN requests or browser-side writes.

The site includes league/team/roster views, standings, matchups, weekly scoring,
cup brackets, historical commissioner records, and a locally persisted theme
preference. Some historical records come from supplied commissioner materials
and are static source data, not ESPN history.

## Repository map

- `src/App.tsx`: application routes and top-level page composition.
- `src/data.tsx`: Firestore subscriptions and local development snapshot path.
- `src/types.ts`: shared TypeScript data contracts.
- `src/competitions.ts`: cup, trophy-race, promotion-band, and week-score logic.
- `src/CompetitionPages.tsx`: competition/commissioner pages.
- `src/TeamIdentity.tsx`: team identity and logo rendering.
- `src/styles.css`, `src/competition-styles.css`: visual system and responsive layouts.
- `functions/main.py`: scheduled entry point, Firestore storage, and overlap lease.
- `functions/sync_service.py`: per-league refresh, validation, and snapshot shaping.
- `functions/espn_adapter.py`: boundary around the pinned `espn-api` package.
- `functions/league_config.py`: season and ESPN league identifiers.
- `firestore.rules`, `firestore.indexes.json`: public document access and indexes.
- `tests/`, `functions/tests/`: frontend/rules and updater tests.
- `tests/fixtures/`: stable, credential-free fixtures for competition behavior.
- `scripts/`: local setup, seeding, verification, and admin helpers.
- `functions/verify_live.py`: optional live ESPN inspection/export tool; its output
  may contain private league/roster details and must remain local.

## Data and privacy invariants

- Keep `espn-api` pinned to the version in `functions/requirements.txt`; changes
  to ESPN behavior belong behind `espn_adapter.py`.
- League IDs and the current season are defined in both
  `functions/league_config.py` and `src/types.ts`. Keep them consistent.
- Each league refresh is independent. Validate before publishing summary and
  roster documents together. A failed refresh must preserve that league's last
  good data and must not block the other leagues.
- Published documents are only `publicLeagues/{slug}` and
  `publicRosters/{slug}`. Internal lease/status data stays private.
- Firestore allows public reads only for published documents. Do not add client
  writes, collection listing, or public access to internal synchronization data.
- Preserve missing values as `null`/absent; never turn an unknown score,
  projection, or stat into zero. Preserve D/ST identifiers as strings.
- Strip account identifiers, owner IDs, email addresses, cookies, credentials,
  and other private ESPN data before publishing. Do not log these values.
- `functions/local-data.json`, live exports, email/PDF source files, `.env.local`,
  `.firebaserc`, logs, build output, dependencies, and local tooling are not
  repository content. Do not stage them, even if a local ignore rule changes.
- Firebase web API keys in Vite config are public client configuration; server
  credentials, tokens, service-account files, and private keys are secrets.
- Never run tests, seed scripts, or deployment commands against production by
  default. Use fixtures, Firebase emulators, and a demo project. Production
  deploys, seeding, security-rule changes, and billing changes require an
  explicit user request in the active conversation.
- This repository intentionally omits `.firebaserc`. Select and confirm the
  Firebase target explicitly for any authorized deploy.

## Local workflow

Use Node.js 22+ and Python 3.13. Install Java 21+ only if running Firestore
emulator rules tests. The usual frontend checks are:

```powershell
npm ci
npm run build
npm run test:competitions
```

Python updater tests (after creating/installing the local venv as described in
`README.md`):

```powershell
$env:PYTHONPATH = Join-Path (Get-Location) 'functions'
functions/venv/Scripts/python.exe -m pytest functions/tests -q
```

Firestore rules tests use the emulator and a demo project:

```powershell
firebase --project demo-jffl emulators:exec --only firestore "npm run test:rules"
```

`functions/verify_live.py` contacts ESPN. Use it only when live comparison is
needed; keep generated exports local and do not use them as unit-test fixtures.

## Change guidance

- Preserve the simple, high-contrast dashboard and responsive, keyboard-accessible
  controls. Avoid adding decorative layers without a product reason.
- Keep routes directly loadable and use existing league slugs and IDs.
- Add stable tests for changes to competition rules, serialization, lineup
  grouping, or Firestore access behavior.
- Update `README.md` when routes, setup, data sources, or operations materially
  change. Keep this file focused on contributor rules and invariants.
- Do not commit generated data, binaries, dependency folders, local config, or
  production identifiers. Review staged filenames and diffs before committing.
