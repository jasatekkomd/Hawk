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
- Test suite (212 cases, IDs `PAT-<AREA>-NNN`): Claude Doc https://claude.ai/artifact/C9LauSqX9So2t3rPcBpMhd
- Hub spec `features/patient-management/spec.md` is NOT synced into the repo (.ai is one commit behind hub);
  read acceptance criteria via `plans/patient-management/*` and `DEBT.md`.
- Backend `ekko-coreService-nodejs` `main` has NO `/v2/*` routes; the app's /v2/patients calls come from an
  unmerged backend branch (#1545 lineage). Backend rules from `main` (/patients) are second-hand for api-dev2.
- Create patient lives in the New visit drawer (`/visits/new?newPatient=1`); ekko-ds NewPatientDrawer/ABHA not wired.
- Edit = PATCH `/v2/patients/:id/profile` with `revision` (409 on conflict), though DEBT.md says read-only. Asked Jasper.
- Suspected gaps to verify first: no duplicate-patient check; title never sent; card Cancel and create-drawer scrim
  discard drafts silently; allergy typing not a draft; load-more failures silent; visit-preview and WhatsApp caches
  not evicted on patient switch; sort menu ignores Esc; WhatsApp withdraw unconfirmed; 3 vs 5 gender options;
  create toast shows raw server message; mobile ≤767 blank screen when roster collapsed with no selection.
- Older backend (main) suspects: `?current_user_id=` impersonation, gender missing → 500, unvalidated sort_by → 500,
  unbounded limit, stack traces in error bodies, no audit except patient view, mime type trusted, no virus scan.

## Design-system notes
- ekko-ds rules: tokens only; control heights 24/30/36/44; even spacing; fixed status tone map;
  no dashes and no "SOAP" in UI copy; no native `<select>`, `type="date"` or `title` tooltips.
- Breakpoints: 1120 / 1024 (overlays; test exactly 1024) / 1000 / 480 floor (the dashboard has no phone design) /
  580 for onboarding.
- Discrepancy to keep in mind: the ekko-ds React README says "built with ekko-ds, not shadcn/ui", while
  ADR-004 lists shadcn/ui in the V2 stack. When it matters, ask which applies to a given screen.
- The ekko-ds docs still say the system lives inside `Ekko-Frontend-react-ts`. In V2 it is vendored at `src/ekko-ds/`.

## Open items
- [ ] Merge `ekko-web-app` PR #77 (and `jasatekkomd/Hawk` PR #1).
- [ ] Jasper to rotate the QA account password (it was shared in chat on 2026-10-21) and store the new one only in the Hawk environment.
- [ ] Rotate the credentials committed in `ekko-test-automation`.
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
- 2026-10-21: Wrote the Patients module test suite (212 cases) as a Claude Doc; findings above.
