# Hawk memory

Durable context for Hawk. Read it first, and update it at the end of each task.
No secrets, credentials or PHI here, ever.

## Origin (2026-10-21)
- Created by Jasper (jasper.p@ekkomd.com); definition `.claude/agents/hawk.md` (jasatekkomd/Hawk PR #1, ekko-web-app PR #77).
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
  - Env vars (TEST10 roles): `EKKO_TEST_ORGADMIN_EMAIL` org admin, `EKKO_TEST_DOCTOR_EMAIL` doctor, `EKKO_TEST_CLINICAL_EMAIL`
    clinical staff, `EKKO_TEST_STAFF_EMAIL` + `EKKO_TEST_STAFF2_EMAIL` staff, `EKKO_TEST_DOCADMIN_EMAIL` org admin+doctor; shared `EKKO_TEST_PASSWORD`.
    PA and Optometrist can't be invited on the Free plan (V2-233, 23 Oct).
    If any is unset, mark login-dependent tests as blocked.
- **Live V2 dev app (current): `https://app-dev2.ekkomd.com`** (confirmed by Jasper, 2026-10-21).
  - API `api-dev2.ekkomd.com`; Auth0 tenant `dev-iqxyolpw0karbhgx` (login page on custom domain `auth-dev.ekkomd.com` since 22 Oct); audience `https://api-dev2.ekkomd.com`
    (real access tokens, so the v1 token bug is fixed here).
  - Built from **`ekko-web-app` branch `codex/v2-23-mobile-validation`** (author Iancalvinj), NOT `dev`. Matched by
    `/v2/visits/search`, `/v2/settings/*`, "Pending intake", the Seats copy and Libre Baskerville, none of which exist on `dev`.
  - Not deployed by GitHub Actions (no run targets it); likely manual upload to S3/CloudFront. Check `last-modified`
    on the page against the branch head to confirm what's live.
  - Login flow: `/signup` → "Log In" link → Auth0 identifier page → password page → `/onboarding/pick-workspace` → role home.
    Both test accounts work; workspace **TEST10** (1 Doctor, 1 Org Admin, 0 visits as of 2026-10-21).
- Old V2 dev app: `https://app-dev-v2.ekkomd.com` (Auth0 `auth-dev`, built from `dev` by `deploy-v2-dev.yml`, last run 2026-09-17). **Broken:** secret `DEV_V2_VITE_CORE_SERVICE_URL` = `auth-dev.ekkomd.com`, so every API call hits Auth0 and fails CORS ("Couldn't load your workspaces"). The org admin test account does not work there (wrong password).
- `dev` frozen since 2026-09-17; V2 baseline is `ian-v2-lane` (ADR-018), release lane `codex/v2-23-mobile-validation`.
- Local run against `api-dev`: `.env.local` (gitignored) with `VITE_CORE_SERVICE_URL=api-dev.ekkomd.com`; the public SPA
  client ID can be read from the deployed bundle. Never commit it.
- ekko-design-system is NOT attached by default. In a cloud session, attach it read-only (`add_repo`
  Aidocscribe/ekko-design-system, read) and clone shallow to `/home/user/ekko-design-system`. Push is refused (read-only by design).
  Newest design: `anbu` @ cd2339d (26 Oct). Space pages = modules-proto/dashboard/settings/workspace/admin/<id>
  (workspace-letterhead, workspace-patient-intake: 22 states, images/; editor only in proto-by-roles/dashboard-master.html).
- Letterhead (23 Oct, 4efd05c, TEST10): suite doc https://claude.ai/artifact/Ct2zEvaj67pKGVgoDmxLFo holds Run 1 (137
  cases), Run 1b (9 templates), Run 2 (keystrokes, every control) and real use; bugs L01-L30 + N01 FILED as V2-189..V2-218 (23 Oct). TEST10 KEEPS
  "Hawkqa Classic test" (default) + copy and team "Hawkqa team" (Jasper: never delete test data unless he asks).
- "Unclear Ticket" board column = status **Spec In-progress** (26 Oct: 8 of Jasper's: V2-191,206,214,224,228,229,230,235). gerrit (dev
  agent) parks decision-dependent tickets there. Jasper wants replies that only say WHY the bug was raised, plain words, no decisions or
  "what's needed"; 6 POSTED 26 Oct (not 214: Jasper replied; not 224). Comment sign-off = "Found by Jasper's agent." (NOT "Hawk QA"). Facts: Staff default
  tabs = Info+Visits (spec, tenant-overridable); design templates Split Header/Side Logo/Triple Logo have NO clinic block (Hawk's L19 ask was
  wrong); design preview = min 2 pages + sample sections; spec: missing reg no. prints blank; Anbu: V2-224 working as designed.
- Patients by role (23 Oct): Staff(+05) sees only Patient Info+Visits tabs (lacks patient.*.read); Clinical staff has no
  patient.read (V2-171). +03 shows Staff in Users but logs in as Clinical staff. ~1 in 3 logins land on /signup after
  picking TEST10 (any role; tokens fine, /visits works). Staff tabs filed V2-235; login + Users-role bugs not filed (not Patients; Jasper: file only Patients-module bugs). Org admin has no allergy rights (no "+ Add").
- Patient intake Run 1 (23 Oct, app-dev2 = b86f6a3): doc https://claude.ai/artifact/BidxoG1JF95UzKFnQmKfui, 80 cases, bugs
  I01-I09 FILED V2-226..232 (+comments V2-123, V2-124). Public form /intake/KVFU; OTP = real SMS (don't send). TEST10 baseline restored (OTP on, front desk,
  4 required fields, 0 consents). Leave the "Test Yourself" pending submission alone (not Hawk's). V2-225 filed (Load more).
- Letterhead Run 2 + real use (23 Oct): L21 number fields clamp per keystroke (font size 14 saves 48; only Width/Height
  fixed); export via signed visit works (default, team letterhead both apply). Signed synthetic visit "Hawkqa Visitcheck"
  by uploading an espeak-ng consult mp3 (apt install espeak-ng; Recording options > Upload recording, ~35 s). QA doctor
  profile now synthetic (Hawkqa Doctor, HQA-000123, Jasper OK 23 Oct); PDF+Word exports print it. Word ignores section order.
- Browser automation: use the globally installed Playwright (`npm root -g`), not a fresh `npm i playwright`
  (its browser version won't match `/opt/pw-browsers`). Keep scripts in scratch, outside every repo.
- Safety: rerouting app traffic or injecting CORS headers in Playwright is blocked as security weakening.
  Run the app locally with the right env instead.
- Git quirk: shallow clones here track only one branch, so `git status` can't see pushed branches and
  stop hooks warn about "unpushed" commits. Fix it with
  `git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*' && git fetch origin <branch>`.

## V2 testing facts (from dev @ a1bd5af, 2026-09-17)
- **Spec knowledge (26 Oct): `v2-knowledge/00-INDEX.md`** (+6 digests). `main` .ai is stale; read .ai on codex/v2-23 or ian-v2-lane.
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
- Doctor: patient.read, no patient.delete/restore, calendar.schedule=false. Playwright storage state omits workspace: pick TEST10.
- 12 security-probe cases need Jasper's explicit sign-off before running against api-dev2.
- New component tests (111, 21 failing on real bugs) kept outside the repo: scratchpad run1/hawk-tests/__hawk__/.
  Never push them to codex/v2-23-mobile-validation (Ian's branch); ask before any team branch.

### Onboarding (2026-10-22, Jira V2-24)
- Filed V2-64 (Bug, Medium, labels Medium+Patients, assignee Ian Calvin Jacob): Patients "+" opens the visit flow.
  TICKET CONTENT RULE (Jasper, 2026-10-23): write only the issue, steps, actual result, expected behavior and the
  evidence (screenshots). NO recommended fixes, code pointers, root causes, file names or solutions. Focus on the issue.
  Every ticket Hawk files starts with an info panel: "Reported by Hawk QA, Jasper P's AI testing agent (built on
  Claude Code) ... filed on Jasper's behalf. Questions go to Jasper P." (Jasper, 2026-10-22).
  Edit descriptions that hold images as ADF (keep the media ids) or the images break; markdown edits are unsafe there.
  Bulk bugs with screenshots: `python3 tools/jira_bug.py bugs.json` (create + attach, attribution panel added),
  `--attach KEY files...`, `--check`. Needs env JIRA_API_TOKEN (JIRA_EMAIL defaults to jasper.p@ekkomd.com).
  JIRA_API_TOKEN works in Hawk sessions started after it was saved (/myself 200; CREATE_ISSUES+ATTACHMENTS granted).
  Jira link API: {type:Blocks, inwardIssue:A, outwardIssue:B} means A blocks B.
  Before filing, JQL-search V2 for duplicates AND check ekko-ds/spec/DEBT: design-defined or undrawn behaviour is not an app bug.
  Mask emails with Playwright screenshot `mask`. Severity map: S1 Highest, S2 High, S3 Medium (labels = priority + Patients).
### Patients Run 1 filing (2026-10-22)
- B01 = existing V2-37 (Hawk comment + 10/10 repro evidence added). S2: B02 V2-65, B03 V2-66, B04 V2-67, B05 V2-68,
  B06 V2-69, B07 V2-70, B08 V2-71, B09 V2-72, B10 V2-73. S3: B11 V2-74, B12 V2-75, B13 V2-76, B15 V2-77 (blocked by
  V2-65), B16 V2-78, B19 V2-79 (rel V2-43), B20 V2-80, B22 V2-81, B23 V2-82, B24 V2-83, B25 V2-84, B29 V2-85, B31 V2-86, B32 V2-87.
- S3 not filed: B18/B30/B34 not reproduced on 22 Oct build; B14 undrawn in design (parked item); B21 matches ekko-ds
  PatientRow (name over id); B33 is spec (global-search-compliance-fixes Fix B); B17 blocked (no account without patient access).
- S4 (Low): B35 V2-91, B36 V2-92, B37 V2-93, B39 V2-94. Not reproduced: B41 (rail ring now shows), B42. B40 tablet-only,
  B43 spec question (unfiled). B38 copy breaks live in ekko-ds (and src/design-adapters copies them): goes to ds proposal.
- ekko-ds proposals still to raise: B10 `.pi-flag-x {display:none}`; B26 contrast (--gray-400 stat label 2.43:1, primary
  button 4.43:1 at 12px); B38 copy (UploadDocumentsDialog em dash, "Search documents..", "Visit Date" on patient docs,
  "No X-ray on file for this visit" on patient page, title case "Upload Files"/"Total Visits").
- src/design-adapters/ = Ian's app-owned copies of ekko-ds components (not vendored); fixes there are app work.
- 2026-10-22 V2-99 (Highest, Onboarding): new invitees 500 on legal "Accept and continue". Backend 482d9e10 requires ACTIVE
  membership (legal-documents.repository.ts:132) but invitees are PENDING until invites/:id/accept; app gates invite pages
  behind RequireLegalAcceptance. Repro'd by backend unit test (mocked Prisma). Live repro needs an invite inbox Hawk lacks.
  Backend unit tests: ts-jest OOMs on full typecheck; use a scratch jest config with isolatedModules + diagnostics off.
- Design oracle for Patients: modules-proto/dashboard/patients/*/images/*.png are 2880x1800 renders of each state; compare
  side by side with app 1440 shots (crop design at 2x). Patients design diff filed as V2-109 (7 sheets attached).
- Test data in TEST10 (22 Oct): KVFU-00000T..Z (Sprobe, Sdouble x2, Sdup x2, Bartholomew long name, Stitle) + 2 PNG docs on Sprobe, 2 visits + vitals
  on Visitcheck, allergy on Sprobe. Vitals: fill inputs by aria-label (index fill hits HBA1C).
- 22 Oct ~06:53 UTC: new app-dev2 build (Ian, likely e6a4ab1, new login-return page). Auth0 now via custom domain
  auth-dev.ekkomd.com; ~30 min outage before that (ACUL needs custom domain). Login helper must not wait for *.auth0.com.
  The Atlassian connector cannot upload attachments; screenshots must be attached by hand in Jira.
  Ian 712020:21f98651-e8e9-4500-838e-0ec097ca9278; Ram (ramavigneshwaran.p) 712020:81f4f6d6-0ae8-4ea0-a304-89ec980f41f0. Labels = priority + area.
  Jasper's token lacks Modify Reporter: reporter can't be set to others (23 Oct; Sajiv's 6 filed V2-219..224, panel names Ram).
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

## Open items
- [ ] Merge `ekko-web-app` PR #77 (and `jasatekkomd/Hawk` PR #1).
- [ ] Jasper to rotate the QA account password (it was shared in chat on 2026-10-21) and store the new one only in the Hawk environment.
- [ ] Rotate the credentials committed in `ekko-test-automation`.
- [ ] Jasper to revoke the Jira API token pasted in chat on 2026-10-22 and add a new one only as JIRA_API_TOKEN in the Hawk env.
- [ ] **Parked for later (Jasper, 2026-10-21):** confirm with design (Anbuu) the ekko-ds treatment and copy for the 5
  Patients failure states the design specs list as undrawn, then update the test suite (PAT-UX-028):
  1. Validation failure in Patient Info (patient-info design-spec, "A validation failure")
  2. Failed save in Patient Info ("A save that fails")
  3. Failed roster load (patients-roster design-spec)
  4. Empty Documents tab (patient-documents design-spec, "A patient with no documents")
  5. A file that won't open (patient-documents design-spec, "A file that will not open")
- [ ] Fix `DEV_V2_VITE_CORE_SERVICE_URL` for app-dev-v2 or retire it. Doctor-only account on api-dev still missing.

## Bugs and questions (app-dev2 unless noted)
- 2026-10-21 · Low · Overview H1: the serif is correct (`--font-display` = Libre Baskerville, settings page titles,
  chosen 2026-09-08), but the app renders it at **26px**; ekko-ds `.set-head h1` specifies **22px / 26px line-height**. Status: reported, not filed.
- 2026-10-21 · Question (dev code) · `role-home.ts` sends any user with org_admin to `/settings`, so a doctor+admin
  never lands on Visits; its own comment suggests the opposite.
