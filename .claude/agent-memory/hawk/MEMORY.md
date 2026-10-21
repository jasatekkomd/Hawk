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
- Dev hosts: Auth0 `auth-dev.ekkomd.com`, API `api-dev.ekkomd.com`. A push to `dev` deploys the V2 dev build
  (`.github/workflows/deploy-v2-dev.yml`). V2 dev app URL: **not yet recorded; add it here once found.**
- Local: `npm run dev` serves on port 5173 (strictPort). `.env.example` lists the `VITE_*` vars.
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
- [ ] Record the V2 dev app URL above.
- [ ] First baseline pass on `dev`: full suite, contract gate, build/lint; list failures and untested risk areas.

## Log
- 2026-10-21: Hawk created, tuned to V2 and ekko-ds, memory seeded. No tests run yet.
