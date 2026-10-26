# A4: Platform specs (archived) + V1/V2 parity review: test knowledge

Source: `/home/user/ekko-web-app/.ai/completed/` (synced hub). Repo HEAD checked: `849bf99` (2026-10-25, merge PR #81) on
`codex/v2-23-mobile-validation`. All archived specs: `status: done`, `completed: 2026-10-20`, build =
`ekko-coreService-nodejs@74bbfa39 · ekko-web-app@6c1c226 (ian-v2-lane, 2026-10-15)`; "app-dev2 additionally runs an
unpushed patient intake/booking delta (ADR-018 §Open)". Read-only extraction; nothing in the repo was edited.

---

## 0. Index docs: `completed/README.md` + `features/ARCHIVED.md`

- `completed/` holds shipped specs. A spec moves from `features/<slug>/` on its release day (decision 2026-10-20).
  `features/` now holds only `draft | backlog | in-development`.
- Each archived spec has `## What changed in the build` directly under the title = the authoritative "as built"
  delta (override the body text below it). "Nothing" is a valid entry.
- Rules: archived spec = record of what the system does. Never re-implement from it; drift is fixed by PR to the spec.
  A behaviour change = new packet in `features/` citing the archived one.
- `_records/` = review records, not specs (the 2026-10-15 parity review behind ADR-018).
- Old citations `features/<slug>/spec.md#anchor` resolve through ARCHIVED.md. Archived 2026-10-20 (first line of
  "what changed"): llm-cost-ledger (Nothing), medical-object-schema (additive `clinical_context_id`, allergies relation),
  temporal-foundation (worker entry `worker.main.ts`), transcript-chunker (v2 chunker, sentence-end windows),
  prescription-drug-names (as specified), per-tenant-entitlements (built though spec never left backlog),
  reserve-and-confirm-billing (§8 + edges 11/13 overridden: patient swap allowed until sign-off),
  global-search-compliance-fixes (record-access audit on encounter+patient reads; recents in **sessionStorage**),
  legal-acceptance (as specified), left-panel (rail is hand-written `.rail`, not ekko-ds `AppRail`), note-references-on-read
  (`GET …?include=refs`, `DELETE /notes/ref/:refId`), migration-bridge (as specified), visit-context
  (bulk `DELETE /encounters/:id/context` with ids in body), visit-management (+ ADR-018 ownership: untitled visit may
  stay unbound while documenting; sign-off requires bound patient), patient-management (shipped from a `draft` spec),
  live-note-generation (design replaced by `live-pipeline-v3.md`), notes-flow-v2-medical-object (gated by
  `notes_flow_v2` entitlement, not env list), recording (edge 20 overridden: non-live upload is new
  `POST/GET /v2/encounters/:id/recording/upload`), sign-off (shipped with gaps: **`POST /v2/encounters/:id/addendum`
  NOT implemented**), export-share (revoke is per-encounter `POST /v2/encounters/:id/exports/revoke`, revokes every link;
  public OTP routes elsewhere), staff-fd-worklist + admin-org-landing (shipped from `draft`), radiology-reports (draft,
  V1 workflows inside V2 cards per D23/D28/D32), assistants-api-retirement (different route).
- Deleted 2026-10-20 (not requirements; dangling citations explained): `bullmq-queue-foundation` (ADR-006 → Temporal),
  `medical-data-standardization` (superseded by ADR-008 VeraTerm), `role-homes` (content = staff-fd-worklist +
  admin-org-landing), `sign-off-sheet` (as-built: sheet reads `GET sign-off-queue`; queue/batch routes are in use).
- Test implication: for anything "shipped from a draft spec", the code on baseline is the record (ADR-018); a spec/code
  mismatch is a divergence to raise, not automatically an app bug. Check `DO-NOT-REGRESS.md`.

---

## 1. Legal acceptance (`archive/legal-acceptance/spec.md`)

**Meta:** owner gerrit, created 2026-09-06, tier 1. What changed: "As specified" (`src/features/legal/*`, backend
`src/legal-documents/legal-documents.controller.ts`).
**What it is:** backend `AuthorizationGuard` refuses every non-exempt request with 403 `TERMS_NOT_ACCEPTED` until the
user accepts current `TERMS_OF_SERVICE` + `PRIVACY_POLICY` (+ `SUBSCRIPTION_TERMS` for org admin). This is the web
screen to accept. Binding decisions (Gerrit 2026-09-06): ONE Accept for all pending docs; NO decline; mid-session
terms change interrupts (grace period is an open backend item).

**Behaviors (testable)**
- Proactive gate: `RequireLegalAcceptance` layout route wraps `/onboarding/pick-workspace` AND the
  `RequireWorkspace → AppShell` subtree. Calls `GET /legal-documents/status`. `all_accepted:true` → route renders.
  Pending → acceptance screen rendered **in place, URL unchanged**; after accept the original route renders, no redirect.
- Reactive interrupt: root subscription on TanStack query+mutation caches detects 403 with `body.errorCode ===
  'TERMS_NOT_ACCEPTED'` OR the exact message `"You must accept the latest legal documents to continue."` on the
  **first refused attempt** (not after retries). Shows a full-viewport overlay above the still-mounted app. On accept:
  overlay closes, **all queries invalidated** (refused reads refetch); refused **mutations are NOT replayed**.
- Screen: `AuthLayout` dark canvas, signed-in footer ("You're signed in as … · Sign in with a different email"), title
  **"Before you continue"**, one tab per pending doc (server `title`), scroll region with
  **"Version {version} · Effective {date}"** + sanitized HTML, footer sentence **"By clicking Accept and continue, you agree
  to the {titles}."**, primary **"Accept and continue"** (busy while posting), ghost **"Log out"**. No checkbox, no
  decline, no "remind me later".
- Accept posts ALL pending ids in one call. Response still pending → re-render with new list + notice
  "A document was updated while you were reading." Any error → inline message under button, button re-enabled, status
  refetched.
- `content` null + `content_url` set → "Open {title}" link (new tab). Both null → "The text of this document isn't
  available. Contact support before accepting." and Accept **disabled**.
- Sanitization: DOMPurify in `src/lib/sanitize-html.ts`; strips `<style>`, `style` attrs, `<img>`/media, form
  controls, `on*`, `javascript:`; links forced `target=_blank rel="noopener noreferrer"`. ESLint forbids
  `dangerouslySetInnerHTML` elsewhere.
- Edge table: org admin sees SUBSCRIPTION_TERMS as 3rd tab (row 3); two tabs, A accepts, B's later accept gets 400 →
  refetch → opens (row 6); status fetch failing with anything other than TERMS_NOT_ACCEPTED → **fail open** + warn
  (row 12); session-override user (signup token) → same screen, footer omitted if no Auth0 email, Log out clears
  override (row 15); long doc scrolls inside card, card never exceeds viewport, no truncation (row 16); status lives only
  in TanStack memory cache, wiped on logout (row 18); legal query keys excluded from interrupt so it can't loop (row 19).
- Mid-session change interrupts a live recording; user restarts next segment (open item, not hidden).

**AC (keep IDs):** `status_pending_renders_the_acceptance_screen_in_place_of_the_route`,
`status_all_accepted_renders_the_route`, `each_pending_document_is_readable_via_its_own_tab`,
`accept_posts_every_pending_id_in_one_request`, `after_accept_the_original_route_renders_at_the_same_url`,
`accept_returning_still_pending_shows_the_new_document_list`, `accept_error_shows_inline_message_and_reenables_the_button`,
`terms_not_accepted_on_any_query_or_mutation_raises_the_overlay_over_the_mounted_app`,
`overlay_accept_invalidates_all_queries_and_closes`, `status_endpoint_failure_other_than_terms_fails_open`,
`content_html_is_sanitised_script_onerror_javascript_url_and_style_removed`,
`content_null_with_url_renders_a_new_tab_link_and_both_null_disables_accept`, `no_decline_control_is_rendered`,
`logout_is_the_only_other_exit`, `pick_workspace_route_is_behind_the_gate`.

**Roles/permissions:** every role gated identically. Accept needs `legal_documents.accept.self | .org` (all 5 seeded
roles); status is `@AuthenticationOnly`. Missing permission → plain 403 → inline error naming the admin, Log out exit.
No feature flag; all plans.

**API:** `GET /legal-documents/status` → `{ all_accepted, pending_documents[] }`, each `{id, type, version, title,
content (HTML|null), content_url (null today), effective_at}`. `POST /legal-documents/accept` `{ document_ids: uuid[] }`
→ new status; **400 if any id not currently pending**; server idempotent (unique `[user_id, document_id]`).
`GET /legal-documents/history` exists, unused. Exempt (`@SkipTermsCheck`): legal-documents controller,
`GET /access-control/get-permissions`, `GET /tenants/user-tenant`, `GET /licence/plan-usage`, userdetails `check-org`,
`signup-status`, `profile/:email`, `auth0/user-registered`, `auth0/user-status`, auth `set-image-access`, `login-track`.
**NOT exempt: `GET /userdetails/my-workspaces`.** Wire 403 body = `{statusCode, message, path, data:null, timestamp,
apiVersion, error:<stack>}`; `errorCode` and `pending_documents` NOT forwarded (filter strips them; logs them in full,
incl. all document HTML). Fresh Auth0 signup without `tbl_user_details` row is not gated until `auth0/user-registered`.

**PHI/audit:** no PHI. Server records `accepted_at, ip_address, user_agent`. Client logs nothing about content. Risk =
stored XSS. Success metric: zero manual rows (`legal_document_acceptance.ip_address IS NULL`).

**Hazards/open:** grace period for mid-session change (OQ1); future `effective_at` notice (OQ2; repo filters
`effective_at <= now`). Backend follow-ups (not built here): slim 403 body, stop filter logging, forward `errorCode`,
per-doc content endpoint (`plans/legal-acceptance/BACKEND-FOLLOW-UP.md`). Non-goals: no admin authoring UI, no history
view, no offline caching.

**Reality check (src):** BUILT. `src/features/legal/` (screen, `require-legal-acceptance.tsx`,
`legal-interrupt-provider.tsx`, `terms-not-accepted.ts` matches message + code, `sanitized-html.tsx`, tests).
Router: `RequireLegalAcceptance` wraps `onboarding/repair-profile`, `complete-profile`, **`invite-profile`**,
`pick-workspace` and the app (relevant to V2-99: invitees blocked behind legal gate). ESLint rule present; only
non-ds `dangerouslySetInnerHTML` is `sanitized-html.tsx`. **Copy divergences from spec:** subtitle "Please review and
accept Ekko's legal documents to keep using Ekko."; still-pending notice "A document was updated while you were reading.
Please review the current version below."; missing text renders "No text is available for this document." in the doc
region plus "The text of {titles} isn't available. Contact support before accepting."; error copy "Couldn't record your
acceptance. Please try again."; card width 720.

---

## 2. Per-tenant entitlements (`archive/per-tenant-entitlements/spec.md`)

**Meta:** owner/assignee gerrit, created 2026-08-07, tier 1. What changed: built though spec never left backlog:
backend `src/v2/entitlements/` (registry, service, `RequiresEntitlement` guard, audited CLI `npm run entitlements`),
migration `20260826000001_tenant_entitlements`, keys `notes_flow_v2`, `terminology_coding`, `delegated_signing`. Env
allowlists `NOTES_FLOW_V2_TENANTS`, `VERATERM_CORRECTION_TENANTS` no longer read.
**What it is:** "is feature X on for tenant Y?" with precedence **kill switch (env, OFF = NO for all) > tenant override
row (ON|OFF) > code-declared default**. Plan entitlements are a separate axis ANDed at call sites.

**Behaviors**
- `EntitlementService.isEnabled(tenantId, featureKey)`, per-instance cache **60 s TTL** + targeted Redis pub/sub
  invalidation on `entitlements:invalidate` `{tenantId}` (sub-second for flipped tenant only).
- Registry entries: `notes_flow_v2` default OFF, `recheckOnExecute:false`; `terminology_coding` default OFF,
  `recheckOnExecute:true`; `delegated_signing` default **ON** (old inverse list `DELEGATED_SIGNING_DISABLED_TENANTS`
  migrates as OFF overrides). Later: `note_customization`.
- Ops: CLI only (grant/revoke/list/audit), super-admin, no admin UI. Each write: actor, timestamp, reason, audit event.
- Flags to frontend (OQ1 decided 2026-09-17): session bootstrap carries ONE combined boolean per key =
  `killSwitch AND entitlement AND planIncludes`; per active tenant; refetched on tenant switch; never cached per user;
  memory only (TanStack), gone on logout. Frontend never reasons about axes; plan grey-out (future Prescription-only
  tier, spec `plan-feature-sets`) uses the same path as OFF.
- Edge rows: 1 evaluated at workflow entry, rides with workflow (no mid-consult switch); 2 cache staleness as above;
  3 new tenant gets defaults, 0 rows; 4 lookup failure → declared default + loud log (never fail open on non-GA);
  5 undeclared key rejected at write; 6 GA = default flip, ON overrides deleted, OFF survive; 7 rows cascade on tenant
  delete; 8 ~60 s cross-instance disagreement accepted; 9 workers re-check only `recheckOnExecute` keys; 10 keyed by
  tenant_id, scoped reads; 11 multi-tenant user: token's active tenant, never client-supplied id; 16 no client storage;
  **17 terminal actions (sign-off, export) gate on `Encounter.pipeline_version` (V1|V2, NULL=V1, stamped V2 once), NOT
  current entitlement: a V2-processed encounter stays signable + exportable forever**; cross-tenant encounter id → 404
  not 403 (encounter read before gate).

**AC:** `tenant_with_on_override_gets_feature_while_all_other_tenants_do_not`, `off_override_wins_over_a_feature_whose_default_is_on`,
`kill_switch_off_returns_no_for_a_tenant_with_an_on_override`, `undeclared_feature_key_is_rejected_at_override_write_time`,
`lookup_failure_yields_the_declared_default_and_logs`, `toggle_propagates_to_all_instances_within_the_cache_ttl`,
`mid_flight_encounter_finishes_on_the_pipeline_it_started_on`, `entitlement_check_never_returns_another_tenants_state`,
`override_write_emits_an_audit_event_with_actor_reason_and_diff`, `ga_default_flip_requires_zero_database_rows_for_the_common_case`,
`worker_job_reads_entitlement_through_the_tenant_scoped_context`, `recheck_on_execute_key_stops_queued_jobs_after_an_incident_off`,
`flags_object_is_recomputed_on_tenant_switch_and_never_cached_per_user`, `targeted_invalidation_drops_only_the_flipped_tenants_cache_entry`,
`v2_encounter_stays_signable_after_its_tenant_is_turned_off`, `v2_encounter_stays_exportable_after_its_tenant_is_turned_off`,
`new_encounter_is_refused_v2_entry_after_its_tenant_is_turned_off`, `cross_tenant_encounter_id_returns_404_not_403_at_sign_off`,
`entitlement_override_write_emits_an_audit_event_under_its_own_action_group`, `entitlement_audit_row_carries_the_target_tenant_id_not_the_actors`,
`reason_note_never_reaches_a_log_line_or_analytics_event`, `cli_rejects_a_reason_note_containing_a_patient_identifier_pattern`,
`migration_records_a_zero_count_of_v2_encounters_or_backfills_them_in_the_same_migration`.

**Data:** `tbl_tenant_entitlement` (tenant_id FK, feature_key, state ON|OFF, `reason_code` PILOT|INCIDENT|CONTRACT|OTHER
NOT NULL (OTHER requires note), `reason_note` nullable, granted_by, granted_at, lifecycle cols; unique (tenant_id,
feature_key)). Audit rows outlive tenant. Backfill `pipeline_version=V2` required where V2 artefacts exist.
**Roles:** no clinician surface; no new permissions.json entries. **PHI:** none; `reason_note` can become PHI via operator
(guarded by AC).
**Pre-build pain (now fixed per what-changed):** tenant not on env list got silent V1 generation (no live note, no chips).
**Rollback trigger:** any cross-tenant entitlement answer = P0.

**Reality check (src):** `src/features/entitlements/` BUILT client side: reads `featureFlags` from each workspace in
`GET /userdetails/my-workspaces` (core#1594), selects active workspace by tenantId then userId, query key
`["feature-flags", tenantId]` (not Auth0 sub). `readFlags` **fails closed: missing key / non-`true` → OFF, including
`delegated_signing`** (server default is ON: if BE omits the field, client shows OFF; test this). `FeatureGate`/
`useFeatureFlags` have **no consumers outside the entitlements folder** (grep), so gating is mostly server-side.
Sign-off maps `NOT_ENTITLED: "Sign-off isn't switched on for this clinic yet."` and `DELEGATED_SIGNING_NOT_ENABLED`
("Delegated signing isn't enabled for this clinic. Mark the visit ready for sign-off and the doctor of record will sign
it."). Test idea: V2 encounter in a tenant later turned OFF must NOT get NOT_ENTITLED at sign-off/export (row 17).

---

## 3. Reserve-and-confirm billing (`archive/reserve-and-confirm-billing/spec.md`)

**Meta:** owner gerrit, assignee gerrit, created 2026-08-25, tier 1.
**What changed (critical):** §8 + edge rows 11, 13 OVERRIDDEN (Gerrit 2026-10-20, accepting Ian's D01): a same-tenant
patient may be swapped on an encounter **until the note is signed, including after conversion**. Sign-off refuses
`PATIENT_REQUIRED` when no active patient bound; any rebind invalidates reviewed identity/content hash
(`NOTE_CHANGED_RELOAD`). Billing per encounter unaffected. Code: `visit-reservation.service.ts`
(`assertPatientChangeAllowed` refuses only COMPLETED/signed), `encounter.repository.ts:updateEncounterPatient`
(tenant-checked). Row 12 (first binding always allowed) and row 14 stand. Ownership on swap (D03/D09): note, audio,
documents, advice follow the visit; encounter-linked prescriptions/labs stay with encounter; patient-history entries
stay with original patient. AC `patient_reassignment_is_refused_after_the_encounter_converts` replaced by
`patient_reassignment_is_refused_after_sign_off_and_invalidates_the_review_hash_before_it`. Billing UI screens stay deferred.

**What it is:** a visit is **reserved** at doctor assignment (no charge), **converted** (billed) on the FIRST billable
processing event on the encounter: main recording start, context audio submitted, images submitted for processing.
Conversion idempotent per encounter (one encounter = one visit). Unprocessed reservation **releases**.
- Worked example: PA assigns 12 → 12 reservations, 0 charges, PA licence untouched; recording converts; images +
  context audio = no further charge; reassign doctor → charge re-targets; never signed → still billed; 4 unprocessed
  release at end of day.
- Attribution: assigned doctor, never caller. **PAs have unlimited visits; only doctors metered** (ADR-013). Dual
  PA+doctor counts as doctor. V2 regression found 2026-09-05: `isPaymentExemptPA` missing on develop/gerrit-lane → PA-only
  user hits `NotFoundException('No active license found for this user')`; Generate (`streaming.service.ts`),
  Regenerate, Transcription upload (>20 s audio, no existing Usage row) **fatal**; Soniox recording swallows (warning,
  no Usage row). "On V2 a PA can record, and then cannot produce a note." Restore = exemption + single-column
  `Usage.encounter_id @unique` together (S-17, blocking).
- Conversion never waits for sign-off (abuse resistance; sign-off must never carry a billing consequence).
- Quota exhausted → refuse at **assignment** with existing renewal-prompt message (edge 7). Exhausted between reserve and
  convert → **honour** (edge 8). Release job keys on `Encounter.created_at` (NOT `encounter_date`, which is UTC date;
  00:00–05:29 IST filed on previous day), end of day in **tenant timezone**. Context-audio-only consult bills same as full
  (edge 10). No cancel/merge/delete encounter endpoint exists (edge 9). Concurrency: two events racing → exactly one
  conversion, enforced by DB constraint (edge 6).

**AC:** `assigning_a_doctor_creates_a_reservation_and_bills_nothing`,
`an_encounter_with_recording_context_audio_and_two_images_bills_exactly_one_visit`,
`each_of_the_three_processing_entry_points_converts_when_it_is_the_first_and_is_a_no_op_when_it_is_not`,
`two_processing_events_committing_concurrently_produce_exactly_one_billed_visit`,
`a_pa_assigning_twelve_encounters_draws_nothing_from_the_pa_licence_and_reserves_twelve_against_the_assigned_doctors`,
`the_charge_lands_on_the_assigned_doctor_not_the_caller`, `reassignment_before_conversion_moves_the_reservation_and_does_not_create_a_second`,
`reassignment_after_conversion_retargets_the_billed_visit_and_does_not_create_a_second`, `a_generated_note_that_is_never_signed_remains_billed`,
`an_assignment_that_never_processes_is_released_and_never_billed`, `quota_exhausted_refuses_at_assignment_with_the_existing_renewal_message`,
`patient_reassignment_is_refused_after_sign_off_and_invalidates_the_review_hash_before_it` (replacement),
`patient_reassignment_is_allowed_before_the_encounter_converts`, `attaching_a_patient_to_a_converted_encounter_that_had_none_is_allowed`,
`patient_reassignment_is_refused_on_a_signed_off_encounter`, + two-tenant isolation of reservation/usage rows (B3c).

**API/infra:** `PATCH /encounters/:encounterId/patient` (was unguarded, even on signed encounters; now guarded at
sign-off). `PATCH /encounters/:id/doctor` (reassign). Bypasses that hide all metering: env
`BYPASS_PAYMENT_RESTRICTIONS=true` and tenant `is_payment_required=false`; local `.env` has bypass on and 0 License rows,
so **a licensed tenant fixture is required** or tests never reach the logic. No new permission strings; billing state
never client-supplied. Not a flag lever.
**Monitoring:** billed visits/day == distinct encounters with a billable event; conversion >100% = double billing;
rollback trigger = any encounter with >1 billed visit. Compliance gate (A7) recorded as NOT RUN.
**Non-goals:** pricing, seat model, invoicing, historical reconciliation, UI.

**Reality check (src):** client binds patient via `bindEncounterPatient` → `PATCH /encounters/:id/patient?patient_id=`
returning `{encounter_id, patient_id, historyReviewRequired?}`; when true toast "Patient-history entries remain with the
previous patient. Review them separately."; error toast "Could not change the patient. Refresh the visit and try
again." Reassign doctor `PATCH /encounters/:id/doctor?doctor_id=` (`reassign-popover.tsx`, visit-card shows
"{doctorName} — reassignment is unavailable at this status": em dash in UI copy). Sign-off copy
`PATIENT_REQUIRED: "Link a patient to this visit before signing off."`, `NOTE_CHANGED_RELOAD: "This note changed — reload."`
(em dash: ds copy-rule hit). Recording `QuotaRefusedState`: "No recordings left on this plan" / "This workspace has used
its recording allowance. An administrator can add capacity — everything else on this encounter still works." (em dash;
also says "workspace allowance", whereas spec meters per **doctor**). Create-visit failure toasts server message verbatim
("A quota rejection says which quota and which doctor"). No billing/plan/invoice screens beyond settings Overview/Seats
copy (deferred).

---

## 4. Migration bridge (`archive/migration-bridge/spec.md`)

**Meta:** owner manish, assignee rajagowtham, created 2026-08-28, tier 1. What changed: as specified (dockerfile without
migrate, `*-sync-ekko.yml` migrate job, `ekko-*-migrate-task-def.json`, `schema-parity.yml`). Item 4 TEMPORARY: migrate
task still shares `ecsTaskExecutionRole` until Terraform adds a dedicated role.
**What it is:** backend CI/CD only. Image build no longer touches Postgres (no `ARG/ENV DATABASE_URL`, no
`prisma migrate deploy`/`db seed`; `prisma generate` stays). Workflows run `build → migrate → deploy` (`deploy: needs:
migrate`); migrate = one-off in-VPC ECS task (`aws ecs run-task`, command override `npx prisma migrate deploy`,
`DATABASE_URL` from Secrets Manager), polled to completion; deploy only on exit 0. `MIGRATE_TIMEOUT_SECONDS: "600"`
(provisional), job `timeout-minutes: 20`, `aws ecs stop-task` on deadline. `wait-for-service-stability: true` active.
`db seed` dropped (not relocated) pending owner + `ekko-test-automation` owner confirmation.
**Edges:** migrate fails → deploy never runs, old version serves; migration ok + deploy fails safe only if additive
(human-reviewed rule); racing deploys and rollback out of scope.
**Hazards for QA:** dev/qa seed data may no longer refresh per build (affects env test data/role seeds); a deploy that
never stabilizes now fails the action; dev/qa DB private-only status was unverified; analytics backend reachability open.
No user-facing behavior, no roles, no PHI path. Non-goals: OIDC, self-hosted runners, destructive-migration guard.
**Reality check:** not in ekko-web-app (backend repo only). Note: web V2 app-dev2 deploy is manual (memory), unrelated.

---

## 5. LLM cost ledger (`archive/llm-cost-ledger/spec.md` + `plan.md`)

**Meta:** owner/assignee gerrit, created 2026-08-12, tier 1; plan approved 2026-08-18; built PR #1418 (`c00f7155`).
What changed: Nothing. `src/common/llm/llm-ledger.service.ts`, `tbl_llm_call`, `tbl_llm_price`.
**What it is:** one row per completed model call (success or failure, V1/V2, request or worker) via single write point
`LlmLedgerService.record()` (factory wrapper + 3 explicitly wired bypasses: `notes_stream`, `validation_notes`, PDF path).
Fire-and-forget (setImmediate, total try/catch, dropped-rows counter): ledger failure never fails/delays/retries the
clinical call. **No content ever** (no text columns; char columns length-capped).
- Attribution `user_id` = initiating actor (PA-driven consult → PA, not assigned doctor); worker rows inherit from
  workflow input; encounter-scoped rows never NULL user. Fallback Gemini→GPT-4o = 2 rows sharing `workflow_ref`, second
  `status: FALLBACK`; retries = one row per real call with `attempt`. Unknown model → `cost_usd NULL`, `price_missing
  true`, alarm. Status enum `SUCCESS · ERROR · TIMEOUT · FALLBACK`; `error_code` closed vocab `HTTP_<n>/TIMEOUT/
  INVALID_RESPONSE/UNKNOWN`, ≤64 chars, never provider message (C1); metrics labels agent/model/status only (C2);
  streaming worker no longer logs Gemini API key or note content (C3).
- Tables append-only via DB triggers (`tbl_llm_price` immutable; `tbl_llm_call` immutable except `cost_usd`,
  `price_id`, `price_missing`). No FKs on tenant/encounter/user (never block erasure). Prices seeded for gemini-2.5-pro,
  gemini-3.1-pro-preview, gemini-3.5-flash, gpt-4o, gpt-4o-mini, claude-sonnet-4-5 (plan says seven). Prompt keys
  `<key>@<version>` on all 11 entries in `prompts.config.ts`. Gemini `thoughtsTokenCount` folded into output tokens.
- AC (17): `every_provider_call_success_or_failure_produces_exactly_one_ledger_row`, `ledger_write_failure_does_not_fail_delay_or_retry_the_clinical_call`,
  `no_column_in_either_table_can_store_prompt_or_completion_text`, `cost_equals_tokens_times_price_row_and_recomputes_identically_from_stored_price_id`,
  `unknown_model_writes_null_cost_with_price_missing_flag_and_trips_alarm`, `fallback_sequence_writes_two_rows_sharing_workflow_ref`,
  `retried_activity_writes_one_row_per_actual_provider_call_with_attempt_numbers`, `veraterm_stage_b_calls_appear_with_agent_veraterm_stage_b` (deferred),
  `v1_path_calls_refine_transcript_notes_validation_appear_from_day_one`, `encounter_scoped_row_always_carries_the_initiating_users_id_including_async_worker_rows`,
  `pa_driven_encounter_rows_attribute_to_the_pa_not_the_assigned_doctor`, `per_user_cost_query_needs_no_join_beyond_tbl_llm_call`,
  `price_rows_are_append_only_update_attempt_fails`, `per_encounter_cost_query_returns_in_under_100ms_on_10m_rows_synthetic`,
  `error_code_never_contains_provider_message_or_body_text`, `ledger_metrics_carry_no_tenant_or_encounter_labels`,
  `streaming_worker_logs_no_credentials_or_streamed_content`.
- Known gaps: radiology call sites NOT instrumented (DEBT); Assistants replacement (§7) bypasses LlmService/ledger;
  no dashboards/budgets/UI; STT minutes not tracked; retention undecided; Langfuse absent in code.
**Reality check:** backend only; no web surface (correct per spec). Hawk relevance: verify no PHI in error toasts is
consistent; otherwise test via backend DB only.

---

## 6. Temporal foundation (`archive/temporal-foundation/spec.md` + `plan.md`)

**Meta:** owner/assignee gerrit, created 2026-08-13, tier 1; plan approved 2026-08-17; merged via backend PR #1414
(2026-08-21). What changed: worker entry `src/v2/temporal/worker/worker.main.ts`; only dev worker task def exists
(`ekko-dev-worker-task-def.json`), qa/prod still to add; worker shutdown closes blocking Redis consumers before draining (D26).
**What it is:** Temporal Cloud (ADR-010) rails for V2 pipelines. Namespace dev `quickstart-ekko-dev.tge2t`, region
`ap-south-1` (`TEMPORAL_ADDRESS ap-south-1.aws.api.temporal.io:7233`); `ekko-qa`, `ekko-prod` later.
- **Ids-only payloads** (inputs, args, returns, signals, queries, search attrs, workflow IDs, headers): ids/status/counts
  only, enforced by structural signature tests + runtime zod registry + red-case fixture; AES-256-GCM payload codec, key
  per env in Secrets Manager; codec key missing → worker fails fast, no plaintext fallback; API starts fail → v1 fallback.
- Workflow ID = encounter ID, `WorkflowIdReusePolicy: RejectDuplicate` (note: forbids reuse even after close, may fight
  re-opened encounters). `startWorkflowSafe` never throws into request path; Temporal unreachable → encounter runs **v1
  path**, alarm (fallback rate alarm >1%/1h; rollback >5%). Retry: `PIPELINE_ACTIVITY_RETRY` 3 attempts exponential
  (exhausted → window failed, workflow continues), `CODING_ACTIVITY_RETRY`, `HEARTBEAT_ACTIVITY_RETRY`. Task queues
  `notes-flow-v2`, `generate-fanout`. Search attributes `encounterId`, `tenantId`. Heartbeat workflow every 5 min
  (absence alarm, 2 consecutive misses). History retention 30 days (decide). V1 code must not import Temporal.
- Edge 8: patient switch = different encounter = different workflow; no cross-patient leakage via Temporal.
- AC: `worker_boots_connects_to_cloud_namespace_and_polls_its_task_queues`, `heartbeat_workflow_runs_end_to_end_every_5_minutes_and_its_absence_alarms`,
  `payload_codec_encrypts_all_payloads_no_plaintext_payload_visible_in_temporal_ui`, `no_workflow_or_activity_signature_accepts_or_returns_a_type_outside_the_ids_only_dto_set_per_the_security_rule`,
  `api_workflow_start_failure_falls_back_to_v1_path_without_erroring_the_request`, `worker_restart_mid_activity_resumes_the_workflow_without_data_loss`,
  `duplicate_start_with_same_encounter_id_is_rejected_while_workflow_open`, `replay_test_suite_fails_ci_on_a_nondeterministic_workflow_edit`,
  `codec_key_unavailable_fails_worker_boot_with_no_plaintext_fallback`, `v1_code_paths_import_no_temporal_modules_grep_clean`,
  `encounter_workflow_findable_in_temporal_ui_by_encounter_id_and_tenant_id_search_attributes`,
  `run_with_tenant_id_isolates_scope_across_sequential_activities_and_restores_outer_scope` (C3),
  `ids_only_suite_rejects_checked_in_red_case_fixture` (C4), `prod_namespace_blocked_until_baa_or_cto_determination_recorded` (C1),
  `namespace_regions_recorded_before_each_environment_ships` (C2).
- Open: BAA with Temporal Cloud (blocks prod namespace), prod region, spend ceiling (~$100/mo Essentials est.).
**Hawk relevance:** UI symptom of Temporal down/unavailable = encounter silently on V1 path (no live note, no chips). If
api-dev2's worker is down, live-note tests look like app bugs; distinguish env from defect. Backend only otherwise.

---

## 7. Assistants API retirement (`archive/assistants-api-retirement/spec.md`)

**Meta:** owner gerrit, no assignee, created 2026-08-03, **tier 2**. Deadline: OpenAI Assistants retired 2026-08-26;
target prod by 2026-08-19. Shipped via SCRIB-2963 (`baaecd85`, PR #1411).
**What changed:** goal met by a different route: no Assistants calls remain, but replacement
(`utils.service.ts callOpenAIResponsesFallback`, `src/common/text-extraction/`) **still uploads the PDF to OpenAI Files**
and calls Responses API with gpt-4o directly (not local extraction + `LlmService`). AC
`no_assistants_api_or_openai_file_upload_calls_remain_in_codebase_grep_clean` overridden 2026-10-20; routing via
LlmService + cost ledger is a debt item.
**Behaviors to test (PDF context analysis):** scanned PDF without text layer → OCR; below char threshold → existing
document-failure state, never answer from empty text; oversized → chunk/map-reduce with page cap, output flags "N of M
pages", never silent truncation; corrupt PDF → existing upload-failure path; LLM fail → fallback + bounded retry then same
failure state, no partial answers; Tamil/Hindi documents in parity set; temp 0 + structured outputs. No metering, no
UI change, tenant-scoped. Remaining AC: parity on golden set, OCR routing, page-coverage flag, provider fallback
integration test, determinism at temp 0, multilingual case, live by 2026-08-19.
**PHI note:** PDF binaries still go to OpenAI file storage (the PHI flow the spec meant to remove persists).

---

## 8. Ian V2 parity review 2026-10-15 (`archive/_records/ian-v2-parity-review-2026-10-15.md`)

**Meta:** review record (status draft, owner ian, tier 1), copied verbatim 2026-10-20 from
`feat/ian-v2-parity-spec-alignment`; decisions adopted/overridden by **ADR-018**. Not a spec, not a release certificate.
**Scope:** bring V1 baseline into V2 design first; preserve V2 work; defer V2-only expansion. **Billing deferred**
(plans, packages, seats, invoices, payment/autopay, integrations) but reservation/idempotency/metering safeguards stay.
Evidence: V1 FE `cade2ae`, V1 BE `95b42c2`; V2 FE base `3f94afa`, BE `81f3e32` with uncommitted local changes;
prod browser covered 12 settings destinations, 7 patient tabs, 7 consultation tabs (not exhaustive). Design
`ekko-design-system@c4e47cd` (newer `6c5c6db` not integrated): "Do not label local UI fully design-complete."
Inventory: `plans/v1-parity/plan.md` "Browser-to-code baseline checklist" (37 rows).

### Decisions D01–D15 (first table)
- **D01** patient bind/swap to same-tenant patient allowed until sign-off, incl. after conversion (conflicted with
  Gerrit's §8; ACCEPTED by Gerrit 2026-10-20).
- **D02** untitled visit may stay unbound while documenting; sign-off requires linked active patient; binding change
  invalidates reviewed identity/content hash; no fabricated patient.
- **D03** on swap: note/audio/documents/advice follow visit; encounter-linked Rx/labs stay on encounter; permanent
  patient-history entries stay with original patient (history-review indication returned for encounter-sourced allergies;
  full review workflow NOT complete).
- **D04** note customization **locked while recording** (UI + server refusal; style service rejects a recording lease);
  context-bar text/document intake stays available.
- **D05** remove sections only; no hide/eye option (design render still shows an eye = design exception).
- **D06** prefs/templates set in advance; post-recording changes offer regeneration with warning; instantaneous re-layout
  preview and per-section refresh UNVERIFIED.
- **D07** manual structured/raw template authoring first; upload/extraction deferred.
- **D08** note version history restore: restoring v1 of {1,2,3} creates **v4** current, keeps 1–3; retry of same restore
  returns v4 not v5; restore must not revert Rx/lab/vital corrections or overwrite signed record. Checks tenant, edit
  permission, current hash, recording/generation state, sign-off under visit row lock; restore + audit transactional.
  Acceptance needs: foreign tenant/note versions, stale hash, competing signature, failed audit rollback, retired section
  identity, idempotent retry. Retention of revision store unverified (C2 High).
- **D09** documents uploaded without patient stay with visit; binding associates them with patient; patient-library docs
  do NOT migrate on visit swap. Cases: patientless upload, bind, swap, foreign-tenant download, signed-visit mutation.
- **D10** patient advice adds Instruction/Duration rows (`advice_rows`); old paragraphs stay readable, never rewritten.
- **D11** expanded chrome, visit panel retained, top-row Live Transcript control with pin/close; context intake usable
  while recording; not pixel parity.
- **D12** arbitrary template instructions NOT sent to external reviewer without verified processor scope; fails closed (C3 High).
- **D13** shared legacy route changes + new `notes/:noteId/versions` need ADR-006 namespace/compat review; preserve V1 payloads.
- **D14** note-customization/template-creation code built while specs `draft` (SDLC discrepancy).
- **D15** post-sign-off changes "3 per month" allowance: deferred, NOT implemented; signed records immutable (ADR-011).

### Architecture gates for every port (use as Hawk acceptance checklist)
Tenant identity from auth+membership (caller ids can't select authority); DB isolation (DIRECT/TRANSITIVE/GLOBAL);
**role negatives per operation for Doctor, linked/unlinked PA, Staff, Admin** (not just hidden controls); workspace
preference must never mutate global role mappings; browser isolation (cancel stale requests on workspace/account change,
tenant/user-aware keys, clear patient drafts/subscriptions/PHI caches on switch/logout, no persisted note content);
files (ownership + storage prefix, no raw storage keys, bounded payloads); clinical writes (serialize with binding/sign-off,
reject stale writes, atomic audit); async (V2 recording lease + Temporal, ids-only, no LLM on live socket); scale
(paginated, no N+1, measured); operational proof = save + reload readback, failure/retry, two-tenant/role tests, real
browser flow. "A populated page or unit pass is not completion."

### V1 baseline status (2026-10-15)
Patients roster/create/edit/phone: partial (intake policy + roles open; a previously reported missing patient unresolved).
Visits/binding/care team: core present; role matrix outstanding. Recording/transcript/context: controller present; real
mic/reconnect/device + camera intake outstanding. Notes/templates/history: present; history contract + instruction review
open. Rx/labs/advice: CRUD present; catalog/suggestions/prior orders/templates/export parity unverified. Vitals/histories:
CRUD; default sets, **BP pairing**, units, longitudinal views remain. Documents: upload/download/ownership regression
remain. Profile/settings: mostly incomplete (V1 `updateProfile` deleted unchanged image, non-transactional; email-lookup
identity unsafe). Clinical prefs/intake form/letterhead: mostly incomplete; V1 `modifyDbChangesAccordingToFlags` called
global `permissionInvokeRevoke` (never wire workspace staff visibility to it). Members/PA linking/invites/account
security: partial; seat purchasing deferred. **Optometry: major missing workflow** (exam, refraction, diagrams, glasses Rx,
review plan). Lab reports: integration remains. Export/share/feedback: full PDF + delivery unverified. Billing: deferred.
Performance not certified (main bundle 963 kB → 391 kB after split; optometry chunk 417 kB).

### D14–D21 (implementation reconciliation; IDs reused)
- D14 profile writes resolve auth user+tenant, keep unchanged image, atomic update (test self-only, foreign-tenant
  denial, image failure, concurrent save).
- D15 clinical prefs merge catalogue → workspace → personal with read hash; staff-visibility = tenant policy only.
- **D16 letterhead**: `letterhead.v2_workspace` config in tenant `tbl_user_setting` (`user_id = null`); **8 presets,
  PNG/JPEG logos**, printed-page margins, identity options feed server exports; legacy doctor letterheads not migrated;
  replaced logos retained (no lifecycle).
- **D17 share links**: immutable PDF/HTML siblings from one export snapshot; patient rebinding invalidates original
  binding; legacy V2 tokens without snapshot version → **410** (no regeneration from current data).
- D18 suggested labs stay out of ordered list and exports until accepted; accept/reject uses signed-visit lock, optimistic
  stamp, audit.
- **D19** opening a visit ID not in the selected workspace → **unavailable state**, not blank editable consult; no editor
  or recorder mounts before a successful visit read; list remains.
- D20 context camera: video only, releases tracks on capture/close, image staged in unsent in-memory draft; sending
  explicit; no second mic while recording.
- D21 vitals unit conversion: original measurement type authoritative; switching display units never writes a rounded
  value; partial parse refused (`120/80` is not `120`).

### D22–D44 (clinical reuse / integration)
- D22 full V1 optometry workflows inside V2 cards (refraction, diagrams, glass Rx, review plan); previous-glass lookup +
  section print wired; full browser acceptance + PDF geometry unfinished.
- D23 V1 lab/radiology report workflows in V2 cards; report writes + Save as Template serialize with rebinding/sign-off,
  atomic audit; PA-doctor link guard enforced.
- D24 V1 bulk optometry/vital writes via V2 entity edits; duplicates, foreign/signed visits, concurrent create conflicts refused.
- D25 eye diagrams: randomized tenant/visit/type storage keys, **5 MB** limit, SVG allowlist (scripts/handlers/external
  URLs removed), failed replacement removes only the new upload.
- D26 Temporal worker shutdown order (see §6).
- D27 manual report/optometry-only exports don't need Notes Flow V2 pipeline stamp; generated-note/Rx/mixed exports keep
  the gate; revocation can revoke manual shares. Optometrist/radiologist role access NOT expanded (open role question).
- D28 report templates create/edit/remove; optimistic timestamp under row lock; soft removal; value-free audit.
- **D29** single V2 navigation guard: optometry cards, report editors, template drafts register unsaved state (ids only);
  **recording blocks leaving**; other unsaved work requires explicit discard; eye-diagram Save waits for upload, drawing
  preserved on failure.
- D30 optometry exports use same exam date/measurements as editor; SVG diagrams rasterized to PNG in PDF/HTML.
- D31 Rx: tenant-scoped drug search, cancellable, explicit Save; name edit clears stale identity/brand/manufacturer;
  **seven V1 SIG shortcuts** coexist with custom instructions. Local catalogue had only 8 synthetic drugs (catalogue gap).
- D32 report-file extraction preview inside report editors; Apply edits draft, Save separate; matched/missing/unmatched
  headings; cancellation discards late responses.
- D33 vitals/Rx/advice drafts in navigation guard; vitals keep refused edits across grid/list; drawing retry after failed read.
- Finding: header **upload-recording and smart-dictation menu entries were placeholders**; legacy audio upload enforces
  **25 MB** vs recording spec **500 MB**; old subscriber logs transcript/errors.
- D34 optometry exam import: one PDF/image/audio ≤ **10 MB**, review-only preview, then save via versioned vital batch;
  `OPTOMETRY_IMPORT_REQUESTED` audit before provider call (audit failure refuses); no filenames/raw responses in logs.
- D35 eye-diagram stale-baseline rejection (two editors must not overwrite silently); cancel/reopen reloads.
- D36 import labels include full measurement + eye; prompt `ophthalmology_vitals@2` forbids inventing method/eye.
- D37 treatment-plan templates dialog: search, bounded rows, preview, explicit Apply; remove needs confirmation, soft
  remove, doesn't clear applied text; names validated.
- D38 field-scoped medicine/brand suggestions via VeraTerm (only typed term + field + selected medicine sent); offline →
  limited workspace catalogue, manual entry continues; brand lookup never substitutes unrelated drugs; workspace/actor/
  medicine switch invalidates outstanding results.
- D39 extraction errors generic; original filenames not returned/logged.
- **D40** non-live upload = `POST/GET /v2/encounters/:encounterId/recording/upload`, bounded **500 MB** streaming,
  encounter lock, recording lease, signed refusal; workflow id `encounterId:uploadId`; **requires V2 entitlement + Soniox**;
  Sarvam fallback/non-entitled fallback outstanding.
- D41 linked-editor guard fixed (was comparing login UUIDs to contact UUIDs); cross-tenant 404 kept.
- D42 section-render prompt v3 preserves every fact (negatives → ROS, follow-up → Follow-up heading); nonempty fact sheet
  rendered "No information recorded" is shown degraded + retryable.
- D43 live-transcription session endpoints now verify owner user+tenant + linked editor + editable state + lease; previous
  lease holder rejected after handover/expiry; untenanted sessions expire closed.
- D44 transcription prefs come from the **assigned doctor** (PA inherits doctor's language hints/speaker settings),
  personal > workspace > catalogue; applied at session creation only.

### Compliance (2026-10-15): PASS WITH CONDITIONS (docs only, not release clearance)
C1 Medium no full role/tenant/browser/load evidence; C2 High revision-store retention/erasure unverified; C3 High external
template-instruction review purpose unresolved. Conditions: every port has foreign-tenant read/write + role-denial tests;
every new PHI store has a retention answer; no workspace setting writes global auth mappings; instruction review +
upload extraction stay disabled; D01 + D13 resolved before promotion.
Verification counts recorded: BE isolation 12 suites/87 tests; local PG 3 suites/20; FE grew 144/1,309 → 161 files/
1,432 tests; contract check had a known global-search endpoint gap.

### Reality check (src, HEAD 849bf99)
- Patient bind/swap: built (`visits.api.ts bindEncounterPatient`, `historyReviewRequired` toast). D01/D03 testable.
- Note history (D08): built, `src/features/notes/history/note-history.tsx` → `GET /notes/:noteId/versions`,
  `GET …/versions/:id`, `POST …/versions/:id/restore`.
- Recording upload (D40): built, `src/features/recording/recording-upload.api.ts` (`/v2/encounters/:id/recording/upload`),
  client copy "Up to 500 MB · MP3, WAV, WebM, MP4, M4A or OGG", error "Choose a supported recording up to 500 MB.";
  "Upload recording" entry in `RecordButton.tsx` (no longer placeholder per memory: espeak mp3 upload worked 23 Oct).
- Optometry (D22/D25/D29/D35/D37): `src/v1-reuse/optometry/` (SubjectiveRefraction, GlassPrescription, Fundus,
  AnteriorDiagram, TemplateDropdown for treatment plans). Copied V1 code: check for native controls / off-token styles.
- Reports/templates (D23/D28/D32): `src/features/reports/` (report-template-manager, visit-reports).
- Camera (D20): `design-adapters/.../document-camera/CameraCapture.tsx`.
- Letterhead (D16): `src/features/settings/letterhead-*` (already tested by Hawk, V2-189..218).
- D19 unavailable state: FD drawer shows "This visit is unavailable or you do not have access." on 403/404; the doctor
  consult view's unavailable state not located by grep (verify in browser: open foreign/unknown visit id).
- Export revoke (`exports/revoke`) and `advice_rows` not referenced by web client (grep 0) → share revoke UI likely absent;
  advice rows may be named differently: verify.
- `POST /v2/encounters/:id/addendum`: no client reference (matches "not implemented").
- Billing screens deferred: only Settings Overview/member profile mention seats.

---

## 9. Top test ideas derived (cross-cutting)
1. Legal gate: proactive (pick-workspace + invite pages), reactive overlay on first 403, still-pending path, 400 two-tab
   path, sanitizer fixture, fail-open on 500, no decline control, Log out exit, queries invalidated, mutations not replayed.
2. Entitlements: tenant switch recomputes flags (key by tenantId); missing `featureFlags` → all OFF incl.
   `delegated_signing`; V2 encounter after tenant OFF still signs/exports; cross-tenant encounter → 404.
3. Billing (needs licensed tenant fixture, not bypass): one visit per encounter across recording + context audio +
   images; PA never charged; PA-only user can generate a note; quota refusal at assignment with renewal message;
   patient swap allowed pre-sign-off, refused after, invalidates review hash (`NOTE_CHANGED_RELOAD`); sign-off without
   patient → `PATIENT_REQUIRED`.
4. Parity gates: role negatives per op (Doctor, linked/unlinked PA, Staff, Admin), foreign-tenant ids, navigation guard
   (recording blocks leave), unit conversion never writes rounded values, `120/80` parse refused, note restore idempotent.
5. Copy-rule hits already visible in code: em dashes in "This note changed — reload.", quota panel, reassignment
   unavailable label, CONTENT_NOT_RENDERED, "Couldn't sign — try again.".
