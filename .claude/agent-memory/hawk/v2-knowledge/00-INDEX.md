# V2 app knowledge (from ekko-web-app .ai/, read 2026-10-26)

Source: `.ai/` on `codex/v2-23-mobile-validation` @ 849bf99 (hub 941eab6, synced 2026-10-22).
`main`'s `.ai/` is STALE (hub 59f7e02, 3 Aug). Baseline branch is `ian-v2-lane` (ADR-018); built code there is
the record: spec-vs-code gaps are divergences to raise, not bugs. `DO-NOT-REGRESS.md` (repo root, W01-W50, F26-27)
lists deliberate behaviour; check it and "Overridden 2026-10-20 (ADR-018)" lines before filing.

| File | Covers |
|---|---|
| A1-visits-recording.md | visit-management, visit-context, recording (archived/done) |
| A2-notes-signoff.md | sign-off, live-note-generation, notes-flow-v2, note-references, chunker, medical-object |
| A3-patients-export.md | patient-management, export-share, radiology, prescriptions, search fixes, FD worklist, left panel, admin landing |
| A4-platform-parity.md | legal-acceptance, entitlements, reserve-and-confirm billing, migration bridge, cost ledger, Temporal, Ian's parity review D01-D44 |
| B1-active-notes-login.md | realtime-collaboration, note-editing, note-template-creation, note-customization, login-upgrade, enterprise (draft), workspace-deletion |
| B2-active-other.md | security-criticals, veraterm, report-template (letterhead), global-search, v2-updates (C1/H1-3/B1-19/W1), status page, infra, drafts |

## Layout of .ai/
- `constitution.md` > `rules/` (security, api, coding, compliance, quality-gates, deferred-work) > `architecture/` (facts; `ekko-web-app.md`, `overview.md`) > ADRs 001-018.
- `features/` = draft|backlog|in-development only; shipped specs in `completed/archive/<slug>/` (+ `_records/` parity review). `features/ARCHIVED.md` maps old paths.

## Rules that shape testing
- Absolute: no real data outside prod; no PHI in logs/errors/analytics/URLs/fixtures; no diagnosis/treatment/dosing advice (CDS line).
- Tenant isolation every query; cross-tenant read = **404** not 403; patient switch provably carries nothing over.
- quality-gates: B3c two-tenant test for tenant data; B3d mutation-check every absence assertion; B3e a test's fakes must not
  supply what its name claims; D2-D11 promotion gates (identity, negative RBAC, idempotency, patient switch, PHI-log w/ error injection, code-switched input).
- ADR-015: a failure must be distinguishable from an empty result (response + log + metric); screens degrade and say so, documents (PDF/export/sign) refuse.
- rules/coding.md: agents never push/PR to `main`; **agents never enter credentials or grant consent, even on dev** (conflicts with Hawk's QA logins: asked Jasper 2026-10-26);
  no `Claude-Session:` trailer / session URL in Ekko repo commits/PRs (Co-Authored-By only).
- UI hiding is UX only; server must refuse too. Search terms/ids go in POST bodies, never URLs.

## Core product facts
- Statuses: NOT_STARTED → IN_PROGRESS ⇄ PAUSED → GENERATING_NOTE → PENDING_SIGN_OFF → COMPLETED (+AT_OPTOMETRY, SIGNED for optometry/reports).
  V1 PA statuses normalised on read forever (ADR-012). Linked editors (doctor + DoctorPA-linked PAs) until sign-off; no handoff gate (ADR-011).
- Recording: one lease/encounter (90 s, 20 s heartbeat); PA→doctor handoff = pause + resume same session; Stop is final = Generate, no confirm dialog (deliberate);
  no editing while recording or paused (ADR-014). Post-Stop correction = context dictation.
- Delegated signing: linked PA + tenant `delegated_signing` (default ON); printout must say "signed by PA X for Dr Y" (ADR-013).
- Patient swap allowed until signed (ADR-018 D01). Sign-off requires a patient.
- Export: server PDF + workspace letterhead (tpl_a-h); OTP-gated link 72 h; doctor block = encounter's assigned doctor, blank if none.
- Client: axios 30 s timeout, `?current_user_id` on every call; TanStack cache 30 s stale/5 min gc, 15 MB budget, memory only;
  logout clears storage namespaces + query cache. Entitlement flags fetched but not used for UI gating.
- Known (not new) gaps: no collab web client; PA Stop → PA_IN_PROGRESS → unsignable (v2-updates B1, open); S-1..3 stack traces in errors (=V2-66);
  S-11 structured 409 codes flattened to "Unexpected error"; Calendar/Ask AI/Smart Dictation partial; Billing UI deferred.
