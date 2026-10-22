# Hawk memory

Durable context for Hawk. Read it first, and update it at the end of each task.
No secrets, credentials or PHI here, ever.

## Origin (2026-10-21)
- Hawk was created by Jasper (jasper.p@ekkomd.com) in a Claude Code cloud session.
  The definition is `.claude/agents/hawk.md`. Its first home was the `jasatekkomd/Hawk` repo (PR #1);
  it was then added here (`Aidocscribe/ekko-web-app` PR #77, targeting `dev`).
- Mission: test **V2** (`ekko-web-app`), the rebuild of V1 (`Ekko-Frontend-react-ts`, bug fixes only).
- Default mode: propose fixes; apply them only when the request authorizes it. Every task ends with the 7-part report.

## Repos
| Repo | Role |
|---|---|
| `Aidocscribe/ekko-web-app` | **V2, the target.** `dev` is the integration branch; `main` holds only the synced `.ai/` docs |
| `Aidocscribe/Ekko-Frontend-react-ts` | V1, the reference for behavioral parity |
| `Aidocscribe/ekko-design-system` | ekko-ds, the design source of truth. Read-only for Hawk; clone shallow into scratch space |
| `Aidocscribe/ekko-coreService-nodejs` | backend (NestJS); the other half of the contract gate |
| `ekko-test-automation` | legacy Playwright + Gherkin suite against `app-qa.ekkomd.com`. Has committed plaintext QA credentials: never reuse them |

## Environment
- Cloud environment **"Hawk"** (separate from Default) holds the test setup.
  - Network access: Limited, allowing `*.ekkomd.com` and `*.auth0.com`, plus package managers.
  - Env vars: `EKKO_TEST_ORGADMIN_EMAIL` (org admin), `EKKO_TEST_DOCTOR_EMAIL` (doctor), `EKKO_TEST_PASSWORD`.
    If any is unset, mark login-dependent tests as blocked.
  - In the Default environment (2026-10-21), `auth-dev`, `api-dev` and `app-qa.ekkomd.com` were all unreachable
    until the domains were allowed. Re-check reachability before reporting environment blockers.
- **Live V2 dev app (current): `https://app-dev2.ekkomd.com`** (confirmed by Jasper, 2026-10-21).
  - API `api-dev2.ekkomd.com`; Auth0 tenant `dev-iqxyolpw0karbhgx.us.auth0.com`; audience `https://api-dev2.ekkomd.com`
    (real access tokens, so the v1 token bug is fixed here).
  - Built from **`ekko-web-app` branch `codex/v2-23-mobile-validation`** (author Iancalvinj), NOT `dev`. Matched by
    `/v2/visits/search`, `/v2/settings/*`, "Pending intake", the Seats copy and Libre Baskerville, none of which exist on `dev`.
  - Not deployed by GitHub Actions (no run targets it); likely manual upload to S3/CloudFront. Check `last-modified`
    on the page against the branch head to confirm what's live.
  - Login flow: `/signup` → "Log In" link → Auth0 identifier page → password page → `/onboarding/pick-workspace` → role home.
    Both test accounts work; workspace **TEST10** (1 Doctor, 1 Org Admin, 0 visits as of 2026-10-21).
- Old V2 dev app: `https://app-dev-v2.ekkomd.com` (Auth0 `auth-dev`, built from `dev` by `deploy-v2-dev.yml`, last run
  2026-09-17). **Broken:** secret `DEV_V2_VITE_CORE_SERVICE_URL` = `auth-dev.ekkomd.com`, so every API call hits Auth0
  and fails CORS ("Couldn't load your workspaces"). The org admin test account does not work there (wrong password).
- `dev` has not moved since 2026-09-17 (`a1bd5af`); active V2 work is on feature branches.
- Local run against `api-dev`: `.env.local` (gitignored) with `VITE_CORE_SERVICE_URL=api-dev.ekkomd.com`; the public SPA
  client ID can be read from the deployed bundle. Never commit it.
- Local: `npm run dev` serves on port 5173 (strictPort). `.env.example` lists the `VITE_*` vars.
- ekko-design-system is NOT attached by default. In a cloud session, attach it read-only (`add_repo`
  Aidocscribe/ekko-design-system, read) and clone shallow to `/home/user/ekko-design-system`. Push is refused (read-only by design).
  Checked at `fccc0fb` (2026-10-20).
- Network: `i.ibb.co` (Auth0 login logo) is blocked in the Hawk environment. Harmless; not an app bug.
- Browser automation: use the globally installed Playwright (`npm root -g`), not a fresh `npm i playwright`
  (its browser version won't match `/opt/pw-browsers`). Keep scripts in scratch, outside every repo.
- Safety: rerouting app traffic or injecting CORS headers in Playwright is blocked as security weakening.
  Run the app locally with the right env instead.
- Git quirk: shallow clones here track only one branch, so `git status` can't see pushed branches and
  stop hooks warn about "unpushed" commits. Fix it with
  `git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*' && git fetch origin <branch>`.

## V2 testing facts (from dev @ a1bd5af, 2026-09-17)
- Vitest 3 + jsdom + RTL + user-event + MSW 2; about 134 test files, co-located under `src/features/**`.
  Run `npm run test:run` (`npm test` is watch mode).
- `src/test/setup.ts`: `matchMedia` defaults to non-matching, and MSW unhandled requests are `bypass`.
- Helpers in `src/test/utils.tsx`: `makePermissionsValue`, `makeTestQueryClient`.
- Contract gate: `npm run contract:check` + `npx vitest run src/test/contract/`. It is CI's only cross-check
  with the backend; six mismatches once shipped past mocked tests.
- **No Playwright in V2 yet.** Proposing it is open; it is not added.
- Specs: `.ai/features/<slug>/spec.md`. Status values on dev are `draft | backlog | in-development | done`
  (older syncs used `in-build` / `shipped`). Plans and HAZARDS live in `plans/<feature>/`.
- `DEBT.md`: `src/ekko-ds/MANIFEST` line order varies by machine collation. That is known and benign;
  don't report it as a bug.

## Patients module (researched 2026-10-21 on `codex/v2-23-mobile-validation` @ 2c09e2a)
- Test suite (218 cases, IDs `PAT-<AREA>-NNN`): Claude Doc https://claude.ai/artifact/C9LauSqX9So2t3rPcBpMhd
- Hub spec `features/patient-management/spec.md` is NOT synced into the repo (.ai is one commit behind hub);
  read acceptance criteria via `plans/patient-management/*` and `DEBT.md`.
- Backend `ekko-coreService-nodejs` `main` has NO `/v2/*` routes; the app's /v2/patients calls come from an
  unmerged backend branch (#1545 lineage). Backend rules from `main` (/patients) are second-hand for api-dev2.
- CONFIRMED live 2026-10-22: roster "+" (aria "New patient") navigates to `/visits/new?newPatient=1&from=/patients`;
  rail switches to Visits; after "Create patient" (201) the drawer becomes "New visit" with the patient bound; Esc
  didn't close it. Design (IS §12, roster spec) expects a standalone Create New Patient drawer that toasts
  "Patient created ✓" and closes. Drawer header back/close icons render as blank squares.
- Create patient lives in the New visit drawer (`/visits/new?newPatient=1`); ekko-ds NewPatientDrawer/ABHA not wired.
- Edit = PATCH `/v2/patients/:id/profile` with `revision` (409 on conflict), though DEBT.md says read-only. Asked Jasper.
- Suspected gaps to verify first: no duplicate-patient check; title never sent; card Cancel and create-drawer scrim
  discard drafts silently; allergy typing not a draft; load-more failures silent; visit-preview and WhatsApp caches
  not evicted on patient switch; sort menu ignores Esc; WhatsApp withdraw unconfirmed; 3 vs 5 gender options;
  create toast shows raw server message; mobile ≤767 blank screen when roster collapsed with no selection.
- Older backend (main) suspects: `?current_user_id=` impersonation, gender missing → 500, unvalidated sort_by → 500,
  unbounded limit, stack traces in error bodies, no audit except patient view, mime type trusted, no virus scan.

### Run 1 (2026-10-21, build 2c09e2a, TEST10): 126 pass, 61 fail, 18 blocked, 13 not run of 218
- Results tab "Run 1 results" in the suite doc (43 bugs B01-B43 with a Status dropdown). Raw: scratchpad run1/merged.json.
- Top bugs: B01 S1 logout aborted 6/10, app silently signs back in; B02 S2 /v2/patients/search returns no
  hasMore/nextCursor (roster stuck at 20, documents at 24); B03 S2 api-dev2 error bodies carry stack traces and
  `toApiError` shows `body.error` when `message` is an array; B04 S2 visit-preview + consent caches survive patient
  switch; B05 S2 vital chips use input limits not clinical ranges; B06 S2 same-date vitals out of order;
  B07 S2 double-submit creates two patients; B08 no duplicate check; B09 app 25 MB vs server 10 MB upload cap.
- Gates on 2c09e2a: 2019 tests pass, contract 26/26 (pinned to backend codex/v2-23-mobile-validation @ d4196c8f;
  checks requests only), build and lint pass. setup.ts fails tests on unhandled requests (afterEach), not pure bypass.
- Test data left in TEST10: 27 synthetic "Hawkqa" patients (ids in scratchpad run1/B/created.json, run1/C/created.json).
  App has no patient delete; the API delete needs patient.delete (org admin has it, doctor doesn't).
- Doctor account: patient.read but no patient.delete/restore, calendar.schedule=false; org admin lacks allergy.write.
- Workspace choice isn't stored in Playwright storage state; scripts must pick TEST10 after login.
- 12 security-probe cases need Jasper's explicit sign-off before running against api-dev2.
- New component tests (111, 21 failing on real bugs) kept outside the repo: scratchpad run1/hawk-tests/__hawk__/.
  Never push them to codex/v2-23-mobile-validation (Ian's branch); ask before any team branch.

### Onboarding (2026-10-22, Jira V2-24)
- Jira: site scribeai-2024.atlassian.net, project V2 (V2 bugs, Ian Calvin Jacob assignee on V2-24).
- V2-24: create-account shows only "Fill in all required fields above." (`create-account-page.tsx:171`); `ObField` has an
  `error` prop but only the phone field gets one. Same pattern in setup-workspace ("Fill in workspace name and specialty.").
- Design oracle (`modules-proto/onboarding/onboarding.html` OB._checks/_setError/_announce): per-field messages
  ("Enter your first name", "Enter your last name", "Enter a valid phone number", "Choose your role",
  "Enter your registration number"), red box + aria-invalid + aria-describedby, Continue stays enabled and refuses,
  first invalid field focused, live region "N fields need attention before you can continue", all fields re-check on input.

## Design-system notes
- ekko-ds rules: tokens only; control heights 24/30/36/44; even spacing; fixed status tone map;
  no dashes and no "SOAP" in UI copy; no native `<select>`, `type="date"` or `title` tooltips.
- Feedback states (Jasper, 2026-10-21: "the design system has the UI for all failure and success states"):
  success = toast with design copy ending "✓" ("Basic information saved ✓", "Patient created ✓"); refusal = toast naming
  what went wrong and the limit; persistent failure = `Alert` (info/warning/success/error tones); drawer problem with an
  action = `DrawerBanner`; held work = top bar sync icon ("Syncing" / "Sync error"); loading = skeletons. Judge app
  feedback against these. Patients specs still list undrawn states (validation/save failure in Patient Info, roster
  failed load, empty Documents, unopenable file): expect the general parts, confirm with design.
- App gap (code, 2026-10-21): Patient Info profile save shows no success toast; design says "… information saved ✓".
- Breakpoints: 1120 / 1024 (overlays; test exactly 1024) / 1000 / 480 floor (the dashboard has no phone design) /
  580 for onboarding.
- Discrepancy to keep in mind: the ekko-ds React README says "built with ekko-ds, not shadcn/ui", while
  ADR-004 lists shadcn/ui in the V2 stack. When it matters, ask which applies to a given screen.
- The ekko-ds docs still say the system lives inside `Ekko-Frontend-react-ts`. In V2 it is vendored at `src/ekko-ds/`.

## Open items
- [ ] Merge `ekko-web-app` PR #77 (and `jasatekkomd/Hawk` PR #1).
- [ ] Jasper to rotate the QA account password (it was shared in chat on 2026-10-21) and store the new one only in the Hawk environment.
- [ ] Rotate the credentials committed in `ekko-test-automation`.
- [ ] **Parked for later (Jasper, 2026-10-21):** confirm with design (Anbuu) the ekko-ds treatment and copy for the 5
  Patients failure states the design specs list as undrawn, then update the test suite (PAT-UX-028):
  1. Validation failure in Patient Info (patient-info design-spec, "A validation failure")
  2. Failed save in Patient Info ("A save that fails")
  3. Failed roster load (patients-roster design-spec)
  4. Empty Documents tab (patient-documents design-spec, "A patient with no documents")
  5. A file that won't open (patient-documents design-spec, "A file that will not open")
- [x] Record the V2 dev app URL (app-dev2, 2026-10-21).
- [ ] Fix secret `DEV_V2_VITE_CORE_SERVICE_URL` for `app-dev-v2` (or retire that site).
- [ ] Get a doctor-only account on `api-dev`: there, the "doctor" test account also has Org Admin, so it lands on `/settings`.
- [ ] First baseline pass on `dev`: full suite, contract gate, build/lint; list failures and untested risk areas.

## Bugs and questions (app-dev2 unless noted)
- 2026-10-21 · ~~Medium · Seats card "FREE SEATS 2 / 2 assigned · none available"~~ **Retracted: not a bug.** Per ekko-ds
  `WorkspaceOverview.tsx`, each column is "<plan tier> seats" with the TOTAL as the number; "Free" is the tier name, not "unused".
  Lesson: check the ds component before reporting copy that looks contradictory.
- 2026-10-21 · Low · Visits empty state differs by width: 1440 "No visits match the current filters" (default filters
  In Progress + Not Started) vs 1024 "No visits yet." (Ready for sign-off). Status: reported, not filed.
- 2026-10-21 · Low · Overview H1: the serif is correct (`--font-display` = Libre Baskerville, settings page titles,
  chosen 2026-09-08), but the app renders it at **26px**; ekko-ds `.set-head h1` specifies **22px / 26px line-height**. Status: reported, not filed.
- 2026-10-21 · Question (dev code) · `role-home.ts` sends any user with org_admin to `/settings`, so a doctor+admin
  never lands on Visits; its own comment suggests the opposite.
- 2026-10-21 · Lead (dev, local) · Visits list looked empty after resizing across 1280 without reload; fine after reload. Unconfirmed.
- Breakpoint note: two-pane Visits switches at 1280 (Tailwind `xl`, per the feature spec), not ekko-ds's 1024.

## Log
- 2026-10-21: Hawk created, tuned to V2 and ekko-ds, memory seeded. No tests run yet.
- 2026-10-21: Logged in to app-dev-v2 (broken API host) and local dev; captured Visits dashboard. Found app-dev2 is the live
  V2 dev site, traced it to `codex/v2-23-mobile-validation`, tested login for both roles, logged 2 bugs + 2 questions.
- 2026-10-21: Jasper asked for memory to be saved automatically, without asking. See "Memory" in hawk.md.
- 2026-10-21: Wrote the Patients module test suite (218 cases after adding ekko-ds feedback cases) as a Claude Doc; findings above.
- 2026-10-21: Run 1 of the Patients suite executed (see Run 1 above).
