# B2: Active "other" feature packets: test knowledge

Source: `/home/user/ekko-web-app/.ai/features/<slug>/spec.md` (+ `veraterm-coding-service/plan.md`), read 2026-10-26 on
`ekko-web-app` `codex/v2-23-mobile-validation` @ `849bf99` (merge of PR #81 `codex/gerrit-V2-121-remaining-bugfixes`).
No `plans/<slug>/` dir exists for ANY of these 15 features (plans/ only has chip-editing, chips-and-signoff, legal-acceptance,
login-upgrade, note-editing, note-template-creation, patient-management, realtime-collaboration, recording*, v1-parity, visit-management).
Contract manifest `contract/route-manifest.json` is generated from backend `codex/gerrit-V2-121-remaining-bugfixes` @ `cda7a912`
(494 routes; global `ValidationPipe` whitelist=false, forbidNonWhitelisted=false, transform=true).
Hub convention: "As built on `ian-v2-lane` (verified 2026-10-20; ADR-018)" sections and "Overridden 2026-10-20 (ADR-018)" strikes
supersede older text. Built code is the record (`.ai/README.md` "Built behaviour is not removed by omission"); spec-vs-code divergence
is raised, not "fixed". Many items below are BACKEND; Hawk tests them via API/contract or reports them, not via Vitest.

| Slug | Status | Owner / assignee | Created | Tier | Nature |
|---|---|---|---|---|---|
| security-criticals | in-development (since 2026-10-20) | gerrit / gerrit | 2026-08-01 (amended 08-25, 10-20) | 1 | backend security register + June-batch fixes |
| v2-updates | in-development | gerrit / gerrit (per package) | 2026-10-20 | 1 | catch-all: tenancy holes, bugs, guardrails for `ian-v2-lane` |
| global-search | in-development | gerrit / gerrit | 2026-07-26 | 1 | ⌘K modal + `POST /global-search` |
| report-template | in-development | gerrit / ian | 2026-07-27 | 1 | workspace letterhead + report body config |
| veraterm-coding-service | in-development | gerrit / gerrit | 2026-08-05 (upd. 08-27) | 1 | term correction + coding of facts; Show codes chips |
| status-page-and-alerting | in-development | manish / raja gowtham | 2026-08-13 | 1 | infra: CloudWatch→SNS email; public status page |
| golden-dataset-v2-extension | backlog (deferred post-launch 2026-08-21) | gerrit / gerrit | 2026-08-18 | 2 | offline label files in `ekko-golden-v1` |
| infra-hardening | backlog | manish / (none) | 2026-08-03 | 1 | infra: NAT, Redis per env, SSE split, CI gates |
| allergies, ask-ekko, abha, live-clinical-suggestions, scheduling-calendar, insurance-claims, eval-harness | draft | see §9 | | | NOT requirements |

---------------------------------------------------------------------------------------------------------------------------

## 1. security-criticals (in-development; owner gerrit; created 2026-08-01; tier 1)

**What it is.** Remediation of the June 2026 Security & Compliance Review Criticals (B-1, B-2, B-3, P-2, E-1; P-1 withdrawn
2026-08-25) plus a branch-attributed findings register S-1..S-20, plus (2026-10-20) the 19 Oct tenancy audit items C1/H1/H2/H3,
M1-M3, L1-L8, W1 whose work is scheduled in `v2-updates`. Gerrit 2026-10-20: all fixed before `ian-v2-lane` merges. Almost all
backend (`ekko-coreService-nodejs`), shared V1/V2 files. Rule: "a finding without a branch is not a finding"; `origin/main` and
`origin/develop` diverged (121 main-only, 336 develop-only commits as of 08-24).

**Register status on `ian-v2-lane` (2026-10-20).** FIXED: B-1, B-2 (mitigated in place), S-19, S-20, S-17 premise, staff-settings
global-role mutation. OPEN: B-3, S-1/2/3, S-7, S-8, S-10, S-14; plus C1, H1, H2, H3, M1-M3, L1-L8, `.env.bak.2026-09-13`, W1.

### Every critical/finding with expected fixed behaviour (security test cases)
| ID | Sev | Defect | Expected (fixed / test) |
|---|---|---|---|
| B-1 | Crit | encounter reads by ID across tenants | `getEncounterById`, `getEncountersByPatientId`, `getEncounterSummary`, `updateEncounterStatus`, `getDoctorByEncounterId`: other tenant's valid ID → **404**; own tenant → success (two-tenant, real HTTP). Likely fixed by Prisma tenant extension (`Encounter` DIRECT, NOT NULL) |
| B-2 | Crit | permissions computed from `?current_user_id=` | Overridden (ADR-018): param kept for workspace select; honoured ONLY when the row carries the caller's own email. Test: foreign `current_user_id` → caller's own permissions/context unchanged (`request_with_foreign_current_user_id_param_is_ignored_and_context_unchanged`) |
| B-3 | Crit | `token.service.ts:13` falls back to hard-coded secret for file-access tokens | service refuses to start if `JWT_SECRET` missing or <32 bytes; literal gone; rotate. STILL OPEN (= v2-updates B10/F6) |
| P-1 | — | emedhub token in ekko-frontend-forms | WITHDRAWN 2026-08-25 "not applicable" (single-tenant custom build). Recorded as N/A, never "closed" |
| P-2 | Crit | patient-portal JWT from phone + tenant prefix, OTP never checked server-side | verify-otp stores short-lived single-use Redis marker keyed by phone; generate-jwt consumes it. No marker → **401**; reused marker → **401**; OTP-disabled tenant: server reads tenant setting, no client flag honoured; Redis down → fail closed with retry message; tokens already issued valid to expiry (1 h) |
| E-1 | Crit→verify | committed `.env` in extension | history scan; rotate anything found; only `.env.example` tracked |
| S-1 | High | `all-exceptions.filter.ts:29` logs `JSON.stringify(message)` = validation messages quoting submitted values (PHI) | no request body/PHI in logs (PR #1450 open) |
| S-2 | High | request URL (with query string) logged twice per exception (:29, :33 + stack) | URL not logged / query stripped |
| S-3 | High | response body carries `path: request.url` and `error: exception.stack` | no stack, no URL in client error bodies. **Hawk already saw this live on api-dev2 (V2-66)** |
| S-4 | High | `patient.repository.ts:1464` logs phone (develop only; fixed on main by PR #1378, never forward-ported) | no phone in logs |
| S-5 | Med | `console.log(UserCredentials)` in `getPatients` (develop :754 / main :748) | removed |
| S-6 | High | `GET /patients?search=` puts names/phones in URL → logged by S-2, echoed by S-3 | PHI not in URLs (`rules/api.md#no-phi-or-pii-in-urls`) |
| S-7 | **Crit** | `PhoneNumberGuard` / `PhoneNumberTenantPrefixGuard` fail-open: compare only if both params present, else `return true` | must fail closed (missing param → 401/400). Routes (all `@Public()`): `GET /auth/profile-phone`, `GET/POST /patients/with-consent`, `GET/POST /patients/with-consent-tenant-prefix` (POST throttled 3/60s), `GET /consent/templates/by-subdomain`, `POST /patients/with-consent/unified` (`ConsentMultiAuthGuard` delegates). POST: omit `phoneCountryCode` → creates consent patient with attacker-chosen phone (DTO fields `@IsOptional`, no whitelist); omit `tenantPrefix` skips tenant check. Fix PR #1451: country code required, POST rejects phone-less write, GET deprecation window. Also guard `:55` logs phone digits on mismatch. OQ3: are there rows with blank `phone_country_code`? |
| S-8 | High | `POST /userdetails/contacts` no `@PERMISSIONS` (develop regression) | re-gated on `visit.create.{self,org}` (all 6 roles) — deliberate widening |
| S-9 | Med | contacts picker returns colleague `email` + `phone` | response should be id/name/title/role only (V2 client drops them client-side; not a server fix) |
| S-10 | High | `authorization.guard.ts:96-106` strips last segment: `.self` ≡ `.org`; `@PERMISSIONS(a,b)` is AND across distinct bases | latent (seed grants both scopes); per-user grant of `settings.update.self` passes `POST /tenant-settings`, `DELETE /tenant-settings/reset`, `PATCH /portal/tenant`, `POST /portal/tenant/logo-upload`. Pinned by `authorization-permission-semantics.spec.ts` |
| S-11 | High | structured error bodies (`{code:'SECTION_LOCKED',...}`) flattened to `{"statusCode":409,"message":"Unexpected error","data":null}`; same object logged verbatim | client must receive structured codes (`CONTENT_CHANGED_RELOAD`, `SIGNED_WHILE_EDITING`, `NOTE_CHANGED_RELOAD`, lock conflicts); log must not. Test: V2 client branching on these codes vs actual wire |
| S-12 | Med | `postSignupOnboarding` "Others" unwind writes `leads` LAST after 5 un-transacted deletes | lead → DB txn → Auth0 (idempotent) |
| S-13 | Med | `tenant.delete` no empty-provisional guard | refuse on non-empty tenant |
| S-14 | High | `POST /userdetails/post-signup-onboarding` `@AuthenticationOnly()` only, no onboarding-status guard, `role` free string | interim: reject role ∉ `['admin','doctor']`; any authed user posting `role:"other"` after onboarding must be refused |
| S-15 | Low-Med | `STREAM_KEY` = `"undefined:transcript-stream"` (module-scope env read) | env-namespaced; conditional on shared Redis |
| S-16 | Med | `.env.example` 38 of 99 keys; no boot-time env assertion | boot validation (do NOT delete `DATABASE_URL`) |
| S-17 | High | `Usage` lost `encounter_id @unique` + `isPaymentExemptPA` on V2 branches → PA+doctor consult billed twice | one consult = one Usage row; PA exempt. Premise present on `ian-v2-lane` per 10-20 |
| S-18 | Med | `soniox.service.ts:643-651` swallows licence refusals (records unmetered); `transcriptions.service.ts:188` propagates | discriminate P2002 race (warn) vs licence refusal (surface) |
| S-19 | High | tenant classification boot gate only in API, not Temporal worker / payment cron; unclassified model exits unscoped at `tenant.extension.ts:279-282` | fixed on ian-v2-lane (`tenant-classification.gate.ts`, `entrypoints-reach-the-tenant-gate.spec.ts`) |
| S-20 | High | `linked-editor.guard.ts`: doctor branch dead, PA branch compares user id vs contact_id; only `recording.create.org` passes | fixed (resolves contact relation, D41). Test: linked PA WITHOUT org recording perm can act; unlinked holder can't (per spec intent) |
| L7 export | — | V2 export route fixed: patient name in S3 key; share links never expire; doctor/date transposed in email; OTP page masks wrong end of phone | V1 still live (export-share OQ4) |

Edge decisions: cross-tenant = 404 not 403 (don't leak existence); over-filtering must not hide a clinic's own record (test both
directions); no RBAC strings added; no feature flag (revert+redeploy). Method rule: absence of `tenant_id` at a call site is NOT
evidence (Prisma extension scopes DIRECT/TRANSITIVE models; with no tenant in CLS it throws `TenantIsolationError`); check
classification, raw SQL, `runWithoutTenantScope`, then `where`.

**Hawk-relevant:** S-3/S-11 are observable from the V2 client (error bodies, "Unexpected error" toasts on 409s). S-6: V2 must
send search text in POST bodies (global search does). Probes against S-7/P-2/S-14 are security tests that need Jasper's sign-off
before running on api-dev2 (memory: 12 probe cases pending).

---------------------------------------------------------------------------------------------------------------------------

## 2. v2-updates (in-development; owner gerrit; created 2026-10-20; tier 1)

**What it is.** Catch-all of code defects found reverse-engineering the 15 Oct V1-parity build (ADR-018) on
`ian-v2-lane` (core `74bbfa39`, web `6c1c226`) plus guardrails. "Nothing here changes what the product does for a doctor;
everything here changes whether it is safe to put two clinics on it." Ships as work packages, order fixed: G1 → T1-T4 → rest.
Each PR carries `DO-NOT-REGRESS.md` rows + tests. Worked example: tenant A Org Admin edits global Doctor role → after fix
403 "system role is not editable from a workspace"; visit create with tenant B `patient_id` → 404.

### Tenancy holes (backend unless noted)
| # | Sev | Gap | Fix pkg / expected |
|---|---|---|---|
| C1 | Crit | any Org Admin can create/reactivate mappings on SYSTEM_DEFINED roles (`tenant_id IS NULL`) → changes every clinic | T1: refuse unless super_admin; require `role.tenant_id = actor.tenant_id`; super_admin edit allowed + audited |
| H1 | High | `insertEncounter`/`createVisit` trust client `patient_id`/`contact_ids`; response returns other clinic's name/DOB/phone | T3: verify in txn → **404 `PATIENT_NOT_FOUND`** (not 403), writes nothing |
| H2 | High | `tenantNullable` models: "mine or shared" filter applied to update/delete | T2: writes strict `{tenant_id: current}`; shared rows only via `runWithoutTenantScope` |
| H3 | High | legacy `DELETE /userdetails/:userId` deletes shared Auth0 login, matches NULL-tenant by UUID | T4: route via `WorkspaceMembersService.remove`; never delete Auth0 login (even single-workspace user: deactivate only); tenant-filtered |
| M1 | Med | no Postgres RLS | T6 last |
| M2 | Med | CLS bypass mutated in place; ledger writes flip BYPASS mid-request | T5 |
| M3 | Med | Staff hold `settings.update.org`, can enable `*.allow_non_clinical_*` for themselves | T5: those keys need org_admin |
| L1-L8 | Low | upload S3 key not prefix-checked; export S3 keys no tenant segment; live-session Redis key written `${ENVIRONMENT}:live:session::${id}` deleted `live:session:${id}`; Socket.IO gateway trusts bare session id; upload job user not re-checked; recording lease read w/o tenant; advice rows accept client UUIDs; two unordered `findFirst({email})` → arbitrary workspace | T5 one-liners |
| **W1** | Med (web) | visit/patient query keys not tenant-scoped; `usePurgeVisitCacheOnTenantSwitch` never called (stale previous-tenant visits up to 15 s); recent searches keyed by user not tenant | T5: purge on tenant change; in-flight old-tenant responses discarded; recents keyed by tenant |

### Functional bugs
| # | Bug | Fix / AC |
|---|---|---|
| B1 | CONTEXT rows (`transcription_type=CONTEXT`) read as speech by `readCanonicalTranscript` → context extracted twice (fails OPEN: wrong clinical content) | F1: `canonical_transcript_excludes_context_rows`, `context_item_text_is_extracted_exactly_once`; context-only encounter → empty transcript |
| B2 | PA Stop lands `PA_IN_PROGRESS`, not in `SIGNABLE_SOURCE_STATUSES` → unsignable | F2 OPEN Q1 (Gerrit): add to signable list OR render to `PENDING_SIGN_OFF`; AC `pa_stop_leaves_the_note_signable_by_the_linked_doctor`; unlinked PA still can't sign |
| B3 | PA always 403 on note style (contact_id vs userId) | `linked_pa_can_read_and_write_note_style` |
| B4 | `GET /v2/settings/members` `.strict()` rejects `current_user_id` → 400 for multi-workspace users | `members_endpoint_accepts_current_user_id_and_returns_200` |
| B5 | note-generation stream raw `fetch` w/o `current_user_id` | `note_generation_stream_carries_current_user_id_when_a_workspace_is_active` |
| B6 | `postVisit` drops IP/OP no, request no, referral doctor, study date | `post_visit_sends_ip_op_no_referral_dr_and_encounter_date` |
| B7 | Soniox WS drop shows "reconnecting" but never reconnects | `soniox_close_while_recording_reconnects_with_bounded_retries_then_errors`; expired key → mint via session route; fail → `error`, keep lease, allow Stop |
| B8 | `CommonInterceptor` sets static `AiConfig` fields → one user's model setting changes all requests | per-request CLS |
| B9 | uploaded PDF filename (often patient name) logged | `responses_fallback_log_line_contains_no_filename` |
| B10 | `JWT_SECRET` fallback | `boot_fails_without_jwt_secret` |
| B11 | `.env.bak.2026-09-13` committed in web repo (six `VITE_*`) | purge + rotate (OQ3 which are secret) |
| B12 | prod task def lacks `TEMPORAL_*`; dev `AUTH0_AUDIENCE` looks like a client id | `prod_task_def_declares_every_temporal_variable_dev_declares` |
| B13-B18 | `@RequiresEntitlement` unused; dead `design-adapters/components/{Tabs,Avatar}.tsx`; upload status polled every 15 s on every open visit and invalidates whole `["visits"]` cache; dispatcher `setInterval` in API; integration specs need DB `ekkomd_gerrit_ian`; migration writes permission rows; `tenant_context_one_active_clinic` aborts on duplicate active rows | housekeeping (F7) |
| B19 | lane lacks `405be8cf` (after-Stop fast tier) | `ian_v2_lane_contains_405be8cf` |
| G1 | no `DO-NOT-REGRESS.md`, CI path-filtered to `src/v2/**` | register in both repos + top-20 pinning tests (country-code field, `phone_or_name`+`search`, patient swap until sign-off, `note_template_id` on one-tap create, sign-off queue `content_sha256`, `SYMPTOM` codeable, `current_user_id` ownership, `PA_IN_PROGRESS` normalisation, Staff export, `/v2/terminology/suggest`); CI fails if a row is removed without a decision link |

Other ACs: T1 `org_admin_cannot_create_or_reactivate_mapping_on_a_null_tenant_role`, `..._mutate_a_role_owned_by_another_tenant`;
T2 `update_on_a_tenant_nullable_model_without_tenant_filter_touches_only_own_rows`, `delete_..._never_touches_null_tenant_rows_outside_bypass`;
T3 `create_visit_with_foreign_tenant_{patient,contact}_id_returns_404_and_writes_nothing`; T4 `legacy_user_delete_never_deletes_the_auth0_login`,
`..._matches_only_rows_in_the_actor_tenant`; F5 `per_user_model_setting_does_not_change_the_static_default`;
`workspace_switch_purges_visit_and_patient_queries_and_recent_searches`; `live_session_redis_key_written_and_deleted_under_the_same_name`.
Access: T1 makes system roles read-only from a workspace; M3 narrows Staff. No new permission strings, no flag. QA pass: two tenants,
two browsers, the worked example. Success: 4xx on `/v2/settings/members` → 0. Non-goals: not `/v2/intake/*` delta on app-dev2
(own spec), not V1/main/develop.

**Reality check (web @ 849bf99):** W1 partly addressed differently: `usePurgeVisitCacheOnTenantSwitch` (`src/features/visits/use-visits-list.ts:128`)
is still defined with NO caller, but `src/features/auth/workspace-session-boundary.tsx:38-44` cancels queries, `client.clear()`s
the whole cache and resets stores when the selected workspace no longer matches; `pick-workspace-page.tsx:113`,
`accept-invite-page.tsx:69`, `use-auth.ts:27` also `queryClient.clear()`. Recents (`use-recent-searches.ts`) are sessionStorage,
owner key = backend user + selected workspace, cleared on mismatch. B5 fixed (`notes.api.ts:40` sets `current_user_id`).
B6 fixed (`visits.api.ts:256-280` sends `ip_op_no`, `referral_dr`, `encounter_date`). B7 web reconnect exists
(`live-transcription.ts:74` `RECONNECT_DELAYS_MS=[500,1000,2000]`, gives up after 3). `.env.bak.*` NOT tracked on this branch
(only `.env.example`). Backend items unverifiable from web. Test idea: switch workspace mid-visits-request; assert no previous-tenant
rows render and recents empty.

---------------------------------------------------------------------------------------------------------------------------

## 3. global-search (in-development; owner gerrit; created 2026-07-26; tier 1)

**What it is.** Top-bar "Search everything.." field / ⌘K (Ctrl+K) modal that jumps to a Visit, Patient or Settings page by name,
UHID (`external_id_1`) or phone; navigation only. Backend aggregator `POST /global-search` over visit search, patient search and a
static permission-tagged settings-route index. Companion fix spec `global-search-compliance-fixes` (audit + sessionStorage).

**Behaviours (testable).**
- Open: click field or ⌘K/Ctrl+K. Close: Esc, backdrop click, clicking a result.
- 0-1 chars → no backend query, shows recents. ≥2 chars → query; 150 ms debounce. Prefix-only, case-insensitive on first/last
  name, UHID, digits-normalised phone ("9876" matches "+91 9876543210"). `patient_code` NOT matched. No fuzzy, no transliteration
  (Devanagari/Tamil stored names match only same script).
- Matched characters bolded. Groups in nav order Visits → Patients → Settings; alphabetical by name within group; NO cap; scrolls.
- Doctors never appear as result rows (only visit meta + filter option). Departments/doctors not text-searchable.
- Row: name + UHID inline; breadcrumb below (Nav › Context › Name); right meta: visits "doctor | department" (department =
  `Doctor.specialty`), patients "age | gender" (full word). Settings rows: name + path + gear avatar.
- Refine dropdown: Department and Doctor only, multi-select; counts contextual to current text query, computed from scoped result
  set. Pills below tabs: one per field, values comma-joined ("Doctor: Laura Gomez, Robert Kim"); pill X clears whole field;
  "Clear all" clears everything; filters persist until changed or modal closes. Long values: meta ellipsis, pills wrap.
- Recents: max 4, recorded ONLY on result click; sessionStorage keyed user+tenant; cleared on logout, tenant switch, tab close.
- Slow: "taking longer" at ~3 s, retry prompt at ~5 s; network failure → connectivity message; never crash. Empty →
  friendly empty state ("Type to search…" / "No results"), not an error.
- Click result → navigate; destination re-enforces access on load. Stateless per keystroke, nothing carries into a consult.

**Roles/permissions.** All roles (Doctor, PA, Staff, Optometrist, Org Admin). Endpoint gated `patient.read.*`, `visit.read.*`,
`settings.read.org`; role lacking a resource read perm gets no results of that type; admin-only settings pages excluded for
Staff/PA. No new strings. Access tokens with API audience only.

**API.** `POST /global-search`, query text in BODY (never URL). Manifest: `GlobalSearchController.search`,
`src/global-search/global-search.controller.ts:13`, `GlobalSearchDto` field `search` (+ filters). Spec changelog 10-20 said route
missing (core #1379); **it now exists in the contract manifest** (backend `codex/gerrit-V2-121-remaining-bugfixes` @ cda7a912) and
is no longer in `contract/baseline.json`. Perf gate p95 <300 ms pre-build; rollback p95 >500 ms sustained or any leak.

**PHI/tenancy/audit.** Query text is PHI: never in server logs, error messages, monitoring labels, analytics (normal AND error
paths). Results tenant-scoped; filter options from scoped set. Audit: record-view writes on detail read paths
(`RecordAccessAuditService.recordView`, `src/v2/audit`). No quota writes.

**ACs (all):** <2 chars no query+recents; prefix match fields, no `patient_code`; grouping/alpha/no cap; no doctor rows;
tenancy (x2); permission gate; admin settings hidden from Staff/PA; recents sessionStorage user+tenant cleared on logout/switch;
no query text in logs; filter counts reflect text query; pill semantics; timeout delayed-then-retry and no crash, empty state;
destination re-enforces access; no writes/quota.

**Reality check.** Built: `src/features/search/{search-modal,search-filters,search.api,use-search,use-recent-searches,types}.ts(x)`.
`search.api.ts` POSTs `/global-search` with `REQUEST_TIMEOUT_MS`. Non-goals: not a command palette, no NL, no typed syntax.

---------------------------------------------------------------------------------------------------------------------------

## 4. report-template (in-development; owner gerrit; assignee ian; created 2026-07-27; tier 1)

**What it is.** Org-scoped "Report Template" admin setting: (1) header logo band canvas, (2) body section/datapoint visibility +
ordering, (3) footer contact blocks, (4) AI draft from an uploaded printed letterhead. Fixes a live prescriber-identity defect
(one doctor's reg. no. printing on another's prescription).

**As built (ian-v2-lane, D16/D28/D37).** Workspace letterhead: backend `src/letterhead/workspace-letterhead.*`, routes
`GET/PUT /v2/settings/letterhead`, `GET /v2/settings/letterhead/logos/:slot`; 8 presets `tpl_a`-`tpl_h`; PNG/JPEG logos in S3
`letterheads/{tenantId}/…`; printed-page margins; stored versioned `letterhead.v2_workspace` in `tbl_user_setting` (`user_id=null`);
read by `src/v2/export/export-render.service.ts` (server-side render; "no server-side PDF" non-goal VOID). Report templates
`src/reports/` create/edit/soft-remove under tenant row lock with atomic audit; V1 treatment-plan templates reused. Legacy
`DoctorLetterHead` NOT migrated (DoctorLetterHead migration overridden). NOT built: canvas positioning, body-field config,
AI-from-scan. Name collision: existing `ReportTemplate` Prisma model is radiology.

**Behaviours / render rules (normative; testable on exported PDF).**
1 hidden section → no render, page skipped; 2 hidden datapoint → no render; 3 visible configurable datapoint with no value collapses;
4 section whose visible datapoints all absent → nothing, no heading; 5 mandatory datapoint always renders: empty → label + blank
space (line) or blank cell (table), NO placeholder text ever ("nil"/"not recorded" forbidden); 6 recorded negative ("No known
allergies") prints as text; 7 labels English, values exactly as captured (code-switched OK; missing glyph = font defect);
8 deterministic (rendered-page diff); 9 preview and export share one component tree.
- Doctor block = encounter's assigned doctor (`Encounter.doctor_id` → registration_number/credentials/designations), NEVER the
  session user; identical whether Staff/PA/Admin/other doctor exports. No assigned doctor → blank block + logged warning, never
  substitute. Missing reg. no. → that field blank. Doctor identity fields read-only, can't be saved as text.
- Extended header (patient basics + doctor) collapses entirely when no data (persistent editor warning).
- Canvas: image placements only, A4-relative mm, scaling `fit` (default, letterbox) or `fill` (crop), NO stretch; ~4 mm safe zone
  warns, doesn't block; out-of-bounds coordinates rejected server-side; fonts embedded; mobile = select/preview only.
- Body: sections Notes, Vitals, Labs, Prescriptions, Patient Advice, Optometry: toggle + drag reorder; datapoints reorder only within
  section (cross-section drop snaps back; payload rejected server-side); mandatory = lock, no toggle; payload hiding mandatory
  rejected server-side. Labs/Prescriptions columns unchanged.
- Footer: left/centre/right blocks from contact pool (phone, email, website), values only, no labels; page number + "Powered by
  ekkomd.com" watermark + `Remove Watermark` unchanged.
- Lifecycle: presets never mutated; one active custom template per org; re-customise replaces; revert deactivates.
  Template metadata must match rendered logo slots (`tpl_e/f/h` declared 2 render 1 = defect).
- AI upload: PNG/JPEG/single-page PDF, 5 MB; layout only (no text transcribed, no logo extracted); opens as DRAFT, never
  auto-activated; multi-page/corrupt/low-confidence → clear message, back to preset selection, upload discarded; never logged/retained.
- Failures: config fetch fails at export → default layout, export proceeds; letterhead/doctor fetch fails → block blank, no
  partial PDF; missing logo → empty placement, no broken-image glyph; oversize/wrong type rejected, never converted; unknown
  config key ignored. Two admins save → last write wins. Clinical values never truncated; headings never orphaned.

**Roles.** Editor tenant-Admin only; route not exposed to Doctor/PA/Staff/Optometrist. Rides `/tenant-settings` guards
(`settings.read.org` family) or new `report-template.*` family; NEVER extend overloaded `letterhead_template.*`. Kill switch =
config-read disable → default layout. All plans; no Usage row on export.

**Tenancy/audit.** Render resolves only the encounter's own org config; cross-tenant config/letterhead request → 404 no existence
signal; two-org isolation test. Config-change audit = OQ3 (DPDP clock). AI uploads treated as potentially PHI-bearing.
Hazard (V1): never insert a key ahead of index 0 of `LETTER_HEAD_SETTING` array (positional read).
Open Qs: mandatory list (OQ4), empty vs negative distinguishable (OQ5), tpl_e/f/h fix (OQ7).

**Reality check.** Web: `src/features/settings/letterhead*.ts(x)` (`letterhead.api.ts` GET/PUT `/v2/settings/letterhead`, logos by
slot; also `letterhead-rebuild.api.ts`, `-layout`, `-qr`, `-library-card`); `src/features/reports/` (report-template-manager,
report-type-builder, report-import, visit-reports); `src/features/export/` (export drawer). Hawk already ran Letterhead suites
(memory: L01-L30 filed V2-189..218).

---------------------------------------------------------------------------------------------------------------------------

## 5. veraterm-coding-service (in-development; owner gerrit; created 2026-08-05, updated 2026-08-27; tier 1)

**What it is.** VeraTerm (Ekko's own Python/FastAPI service, repo `Aidocscribe/ekko-veraterm`) corrects ASR-damaged clinical terms
(esp. Indian brand drugs) on extracted facts and attaches codes (SNOMED, ICD-10, LOINC, RxNorm, CDCI/INDIA_DRUG). Runs upstream,
per FACT (not per turn, not per note render), as a non-awaited Temporal activity; degrade-never-block. Ordering contract:
extract → merge → correct+code → project to prescription/lab rows → generate note with `[[fact:id|surface]]`/`[[rx:id]]` markers.
Never run over generated note text.

**As built (ian-v2-lane).** `veraterm.http-client.ts` Stage A `POST /v1/suggest` only (`/v1/refine` never called; Stage B not
applied, `refine` result stores candidates only); `coding-dispatch.service.ts` per merged window, audits
`CODE_APPLIED_POST_SIGNOFF` / `CODE_CANDIDATE_STORED_POST_SIGNOFF` in txn; `coding-persistence.ts` → `tbl_fact_code`
(`APPLIED`/`CANDIDATE`), floors env `VERATERM_STAGE_A_RAW_SCORE_FLOOR_*`; `GET /v2/encounters/:id/codes` (APPLIED only);
`POST /v2/terminology/suggest` (chip-edit dropdown, typed term + section only; Tier-1 approved 2026-09-09). `SYMPTOM` codeable.
Gate: per-tenant entitlement `terminology_coding`, kill switch `TERMINOLOGY_CODING_ENABLED`, `recheckOnExecute=true`.
Dev index `placeholder-v0-no-snomed` (75,087 rows; no SNOMED/RxNorm/LOINC) → no floor verdict valid. Second family
`/v1/prescriptions/{suggest,refine}` (`X-API-Key`) feeds the V1-style prescription card brand suggestions (D38).
Client: payload one term + section enum, never sentence/`verbatim`, no tenant identity; `index_version` required on every response
(missing → degrade); `coded_by = veraterm:<index_version>`; TLS required (loopback exempt, private ranges NOT); timeout, circuit
breaker, 7 health counters.

**Correction rules.** (1) `verbatim` never changes; (2) apply only ≥ floor (MEDICATIONS 0.95 hypothesis; LABS/ASSESSMENT may be
lower; uncalibrated, OQ4); below floor: value stands, candidates stored, low confidence; (3) always re-correct from
`original_value`; idempotent; (4) doctor edit final (`correction_locked`), posts de-identified feedback pair; (5) entity_key change
→ merge re-check. DEVIATION (PR #1433): `entity_key` NOT re-keyed (rule 5 unbuilt); only `value.drug_name` replaced.
Stage-aware thresholds: Stage A on `raw_score`; `score_floored` never thresholdable; Stage B (LLM-floored 0.90) never blended.
Soundalikes (Losar/Losec, Zocor/Cozaar, Cardivas/Cardace): escalate to Stage B with context; else no correction.
`DrugNormalizationService` (+0.15 phonetic boost, AUTO_ACCEPT 0.92, CONFIRM_FLOOR 0.6) must NOT auto-verify a name VeraTerm declined.
Unmatched drug → no `Drug` row created, `drug_id` null, low-confidence marker.

**UI (Show codes, what Hawk can test).** "Show codes" toggle on the note, OFF by default (view preference, in memory). ON: coded
terms as inline chips coloured by code system. Prescription/lab chip edit → applies everywhere, no prompt. Medical-fact chip edit
→ prompt "update everywhere, or just here" ("just here" detaches to plain text). Typing in chip queries suggest, dropdown of real
candidates; typed term matching nothing → chip removed, text survives as prose, no invented code. Deleting chip removes the
reference, never the prescription (reconciler flags prescribed-but-not-in-note). No clinician confirm queue, no code browser.
Drug with no RxNorm → shows Ekko drug identity, never a gap. Editing prose around chip keeps reference. Unresolved term = no chip
(absence is the signal). Flag off → `/codes` returns no chips and reads no fact_code row; `/codes` must set
`Cache-Control: private, no-store`.

**Roles.** Doctor and PA see codes; nothing for Admin/Staff; no new permissions (`/codes` uses `visit.read.self/org`); chip edit
uses note-edit permission. Sign-off: correction stops, coding doesn't (code-only accepted post sign-off; correction → CANDIDATE).

**API/edge.** VeraTerm outage → facts uncoded, note unaffected; superseded/retracted never enqueued; job id `(fact_id, fact_version)`
→ exactly one row; doctor edit stales old code + re-enqueue. Code-switched verbatim: send English canonical form only.
`/codes` response is projection-shaped: never facts list, `verbatim`, `value_json`, `original_value`, provenance, candidates.

**Compliance.** Stage B → Gemini (note pipeline's primary) = PHI egress; zero-retention scope for terminology use OUTSTANDING;
processor list/notice, data residency, retention bucket (A1) gate tenant enablement (BLOCK at flag-on if unmet). Audit write
events deferred until before `terminology_coding` enabled for any tenant.

**Key ACs:** `no_code_is_ever_stored_that_veraterm_did_not_return…`, `stage_a_decisive_results_apply_without_any_llm_call`,
`veraterm_outage_leaves_facts_uncoded_and_note_generation_unaffected`, `verbatim_is_never_modified…`,
`zero_silent_wrong_molecule_substitutions_on_the_soundalike_fixture_set`, `no_tenant_identifier_or_patient_name_appears_in_any_request_to_veraterm`,
`editing_a_medical_fact_chip_prompts_everywhere_or_just_here`, `a_chip_edited_to_an_unmatched_term_is_removed_and_the_text_survives_as_prose`,
`deleting_a_chip_removes_the_reference_and_never_the_prescription`, `the_codes_endpoint_sets_cache_control_private_no_store`,
`the_codes_endpoint_returns_no_chips_…_when_terminology_coding_enabled_is_off_for_the_tenant`.

**Reality check (web).** `src/features/notes/chips/note-codes.api.ts:93` GET `/v2/encounters/:id/codes`;
`src/features/notes/chips/edit/code-edit.api.ts` uses `POST /v2/encounters/:id/codes/references/:noteRefId/suggest` (body `{term}`)
and `PATCH …/codes/references/:noteRefId`, NOT `/v2/terminology/suggest` (that route exists in the manifest at line ~23221 but has
no web caller). Entitlement `terminology_coding` default `false` in `src/features/entitlements/entitlements.api.ts:22-41`.
Tests exist: `no-code-browser.test.ts`, `note-codes.api.test.ts`, `code-edit.api.test.ts`. Spec says G1 pins
`/v2/terminology/suggest`: divergence worth asking about (which suggest route is canonical).

---------------------------------------------------------------------------------------------------------------------------

## 6. status-page-and-alerting (in-development; owner manish; assignee raja gowtham; created 2026-08-13; tier 1)

**What it is.** Greenfield infra (repo `ekko-terraform-be`): CloudWatch alarms → per-env SNS topic (`ekko-alarms-dev|qa|prod`)
→ email `alarm@ekkomd.com`; public self-built status page per env: `status.ekkomd.com`, `status-dev.ekkomd.com`,
`status-qa.ekkomd.com` (naming OQ2: `<name>-<env>` vs `dev-status`). Not EKKO Pulse (`ekko-monitoring`, private, localStorage
incidents, tab-open polling).
**Behaviours.** Alarms: ECS CPU/mem, ALB 5xx, ALB unhealthy hosts, core `/health` failure (canary or ALB), RDS connections/CPU, all in
Terraform. Every alarm subject/body names the environment explicitly (e.g. `[qa]`). Lambda on EventBridge (~60 s) reads alarm state,
writes static JSON to PRIVATE S3 bucket via CloudFront OAC (no listing; only the Lambda role writes); `Cache-Control` ~30 s;
`CreateInvalidation` ONLY on status change. Page: operational banner, per-component status, 90-day uptime bars, "view history";
components: Web App, API, Note generation, VeraTerm coding, Live transcription, Sign-in. Services without real signal
(ekko-sse-backend, analytics) EXCLUDED rather than fake green. "Subscribe" → public endpoint → `SNS.Subscribe` email
(AWS-generic confirmation email accepted v1) to `ekko-status-updates-prod`; notifications only on change.
**Rules.** Page state derives from the same alarm data (never a manual flag); green-during-outage ≤ one evaluation period.
No PHI or tenant-identifying content (no hospital names) in alarms or page. No AWS creds in browser. Public, no login.
**Test-relevant ACs:** reachable without login; deliberate status change visible within one Lambda cycle with zero invalidations;
subscriber receives confirmation and a notification on next real change only; bucket private.
**Reality check.** Nothing in web app (infra only). Hawk's network allowlist `*.ekkomd.com` would reach status-*.ekkomd.com if live.

---------------------------------------------------------------------------------------------------------------------------

## 7. golden-dataset-v2-extension (backlog; owner gerrit; created 2026-08-18; tier 2)

**What it is.** Offline V2-shaped answer keys for the 50 de-identified golden cases in `ekko-golden-v1`: Layer 1
`expected_facts.json` (end-state fact ledger, all 50; `sources` ⊆ {TRANSCRIPT, CONTEXT} on the 6 cases with attached document),
Layer 2 `expected_merge_ops.json` (ADD/UPDATE/SUPERSEDE/RETRACT per window, 15 hardest cases, `chunker_version`), Layer 3
`expected_codes.json` (codes; `code:null, reason:INDEX_GAP` counted). Process: machine draft → human (Gerrit) → clinician sign-off
(`review_status: clinician_reviewed`). Eval contract: match key `(fact_type, entity_key, polarity)` + per-type values; merge ops exact
per window; code accuracy over non-INDEX_GAP; thresholds report-only first. LOW-confidence labels excludable. Label files rejected if
`schema_version` mismatches manifest. Deferred post-launch (2026-08-21): interim scoring vs golden-v1 labels (105 rx / 64 labs /
93 vitals) via DeepEval deterministic layer. No product surface, no roles, no PHI (de-identified). Not testable in the web app;
relevant only as the accuracy gate behind VeraTerm/extraction.

---------------------------------------------------------------------------------------------------------------------------

## 8. infra-hardening (backlog; owner manish; no assignee; created 2026-08-03; tier 1)

**What it is.** Minimal infra fixes: (1) ECS dev/qa/prod `assign_public_ip=false`, private subnets + NAT; ALB only public ingress;
(2) verify prod Postgres `PubliclyAccessible` + SG ingress, record result, fix immediately if public; (3) per-env Redis instance +
secret for `ekko-workers` Celery (today all three use `develop/ekkomd/redis_url-wUnmVz`), same AZ as consumers; cutover drained,
dev→qa→prod; (4) resolve `ekko-sse-backend` vs core notification-streaming split-brain: enumerate client call sites (V1, ekko-web-app,
extension, forms), keep exactly one, delete the other; (5) CI on every PR fails on lint/typecheck/test + secrets scan
(gitleaks/trufflehog) for core, ekko-web-app, forms, extension, analytics (V1 out of scope); allowlist documented, never blanket
disable; pre-existing failures triaged as Jira, not exempted. Non-goals: full VPC/ALB split, RLS, SG overhaul.
**Test relevance:** post-cutover regression of outbound integrations (STT, LLM, Twilio, SES, Zoho); notification streaming in V2
must keep working after the retirement (enumerate which host `ekko-web-app` hits). Web reality: CI gate for ekko-web-app is the
repo's own concern (Hawk runs `npm run test:run`, `lint`, `build`, `contract:check`).

---------------------------------------------------------------------------------------------------------------------------

## 9. Draft packets (NOT requirements; summaries only)

**allergies-drug-interactions** (draft; owner gerrit; author Jacqueline PM; created 2026-07-10, amended 2026-09-11; tier 1).
After 2026-10-20 the allergy RECORD half shipped under `patient-management` (`src/v2/allergies`, `AllergyIntolerance`/
`AllergyReaction`, migration `20260912000000`, Clinical Flags, confirm/clinical-status routes); this packet now covers ONLY the
drug-interaction check (`ddi_rule`, alert overrides, CDS alerts), none of which exists. Decisions worth knowing for Patients tests:
dated NKA is an explicit negation, never a blank list; blank = "Not recorded in Ekko"; manual entry only (no auto-promotion of
encounter ALLERGY facts). Planned check: on prescription create/update vs confirmed allergies + RX/CURRENT_MED facts;
Contraindicated/Major → interruptive modal, override needs logged reason; Moderate → inline banner; Minor → log-only.
Linked PA may edit allergy record until sign-off but may not acknowledge/override interruptive alerts. Entitlement `cds_allergy_alerts`.
Proposed perms `allergy.read.{org,self}`, `allergy.write…` (memory: org admin lacks allergy write; consistent).

**ask-ekko** (draft, STALE + BENCHED 2026-08-02/08-12; owner gerrit; created 2026-07-10; tier 1). Floating panel; Phase 1 Q&A
grounded in the open encounter (`POST /ask-ekko/encounter/:encounterId` streamed, answers cite record location, never fabricate,
decline dose/prescription decisions, one thread per patient/encounter, no bleed between patients); Phase 2 literature with
citations. Blocked on PHI/model-policy questions (O-1). Reality: `src/features/ask-ekko/ask-ai-page.tsx` is a "DOGFOOD
PLACEHOLDER" ("Placeholder — this destination ships with the ask-ekko feature."), no PermissionGate. Not a requirement.

**abha-patient-linking** (draft; owner mahalingam.r; created 2026-08-13; tier 1). ABDM SANDBOX-only (`https://abhasbx.abdm.gov.in/abha/api`)
ABHA create/link at intake via Aadhaar OTP; tenant setting `abha.enabled` (PORTAL_SETTING); permission `patient.abha.link.org`;
cross-check ABDM name/DOB vs Ekko record; `abha_verification_status = VERIFIED`; unreachable phone → skip, registration continues;
synthetic identities only. Production certification parked. No V2 web code found (ekko-ds has an ABHA design; memory notes it is not wired).

**live-clinical-suggestions** (draft, STALE 2026-08-12; owner gerrit; created 2026-07-10). Non-directive live CDS prompts during
the consult (e.g. pregnancy status before pelvic X-ray), with rationale + guideline citation, one-tap dismiss/override, auto
`ADDRESSED` when the doctor asks; rules engine + MedGemma RAG; never diagnoses/dosing; full event logging. Must be re-based on
medical-object live facts before planning. Nothing to test.

**scheduling-calendar** (draft; owner gerrit; created 2026-07-10). FHIR-shaped Appointment/Schedule/Slot; statuses `pending` →
`booked` → arrived/checked-in…; FullCalendar day/week/month; double-booking prevented by Postgres exclusion constraint → 409 "that
slot was just taken" + next free slot; WhatsApp/SMS reminders (booking, T-24h, same day); generic inbound booking API. NOTE: the V2
web app already has `src/features/calendar/` and `src/features/booking/` (built ahead of/independently of this draft; with
permission-boundary tests). Spec is not the oracle for those; built code is (ADR-018).

**insurance-claims** (draft, STALE 2026-08-12; owner gerrit; created 2026-07-10). India reimbursement claim-form library
(upload blank insurer PDF → PROCESSING → NEEDS_REVIEW → READY) + fill from a signed (COMPLETED) encounter; paid per-tenant
add-on; future NHCX channel. Depends on VeraTerm codes and per-tenant entitlements. Nothing built in web.

**eval-harness** (draft; owner gerrit; created 2026-08-01; tier 3 [VERIFY]). CI eval of prompt/model changes on the 50 golden
cases (baseline rx ~50%, labs ~54%, vitals ~60% strict-pass, note fact coverage ~83%); deterministic asserts + LLM judges nightly;
nine named regression traps. 2026-08-21: QA-owned DeepEval repo `ekko-model-evaluation-benchmarking` is the operative runner
(hard gates HALLUCINATED_DRUG / MISSED_DRUG / WRONG_DOSE); promptfoo `ekko-evals` superseded. Backend/prompt tooling only.

---------------------------------------------------------------------------------------------------------------------------

## 10. Cross-cutting test ideas for Hawk (derived)
1. Tenancy/workspace switch: two workspaces, switch with Visits/Patients/Search open and a request in flight; assert cache
   cleared (`workspace-session-boundary.tsx`), recents empty, no previous-tenant rows (v2-updates W1, global-search recents AC).
2. Error-shape: trigger a 409 (lock/sign-off conflict) and a 400 validation error on api-dev2; check the toast/copy is not
   "Unexpected error" when the server meant a structured code (S-11) and that the body has no `stack`/`path` (S-3; V2-66).
3. PHI-in-URL: confirm global search, patient search, notes stream never put names/phones in query strings (S-6, global-search).
4. Multi-workspace user: Settings › Team returns 200 (B4); note generation uses the active workspace (B5).
5. New visit drawer: IP/OP no, referral doctor, study date reach the server (B6) — check request payload in Playwright.
6. Recording: kill the Soniox socket mid-recording; expect up to 3 reconnects (0.5/1/2 s) then an error state with Stop available (B7).
7. Letterhead/export: doctor block = assigned doctor when exported by Staff/PA/Admin/another doctor; no-doctor → blank block;
   mandatory empty → label + blank, no "nil" (report-template render rules).
8. Show codes: default OFF; with `terminology_coding` off no chips; unmatched chip edit removes chip keeps prose; medical-fact chip
   prompts "everywhere / just here"; delete chip keeps prescription.
9. Permissions: global search hides admin-only settings for Staff/PA; Org Admin cannot edit system roles (C1) — UI should not
   offer it or should show the 403 copy "system role is not editable from a workspace".
10. Security probes (S-7 fail-open guards, P-2 OTP marker, S-14 post-signup unwind, S-10 scope suffix) need Jasper's explicit
    sign-off before any run against api-dev2; never run against production.
