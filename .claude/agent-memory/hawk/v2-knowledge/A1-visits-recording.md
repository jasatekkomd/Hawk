# A1: Visits, visit context, recording (archived specs, test knowledge)

Source: `.ai/completed/archive/{visit-management,visit-context,recording}/spec.md` (each dir has only spec.md).
Repo checked: `ekko-web-app` branch `codex/v2-23-mobile-validation` @ 849bf99 (2026-10-26). Read-only.
**Reading rule (ADR-018, `.ai/README.md`):** all three are `status: done`, archived 2026-10-20 at baseline
`ekko-coreService-nodejs@74bbfa39 · ekko-web-app@6c1c226 (ian-v2-lane, 2026-10-15)`. Where spec and built code differ,
**built code is the record** unless a spec Changelog/ADR says otherwise. Check `DO-NOT-REGRESS.md` before filing
"spec says X, app does Y" bugs; file those as divergences/questions, not defects. Each spec has a "What changed in the
build" header and strike-through "Overridden 2026-10-20 (ADR-018)" lines: those overrides win.

---

## 1. Visit management (Visit Creation & Visit List)

**Frontmatter:** status `done`; owner/assignee `gerrit`; created 2026-08-22; completed 2026-10-20; tier 1. Prose author
note Jacqueline (PM). Amended 2026-08-23 (ADR-011), 2026-09-11 (filters/search/customize + card), 2026-09-11 (one-tap fix).

**What it is:** the `/visits` home screen (port of V1 `VisitPage` + desktop list + `CreateVisitModal`) rebuilt as one
responsive tree on ekko-ds + TanStack Query. Active/Completed scopes, date-grouped cards, header-mode search, Customize
popover (Status/Doctor/Date/Card Details), Ready-for-sign-off count chip, last-touched line, two create surfaces (Staff
modal/drawer, everyone else one-tap) on one API, same-day duplicate warning. Bulk PHI-read surface, quota-metered create.

**Build deltas (header + overrides):** untitled visit may stay unbound while documenting; **sign-off requires a bound
active patient (D02)**; patient swap allowed until sign-off (D03/D09); a visit id not in the selected workspace renders an
**"unavailable" state, never a blank editor (D19)**; one-tap opens `/visits/:id/view` only; `?record=1` is the single
auto-start path; old `/record` and `/note` pages gone (router keeps `visits/:id/record` and `visits/:id/note` as
redirects to the view). Status normalisation is client-side (`LEGACY_STATUS_ALIASES`). Overrides: one-tap body also
carries `note_template_id` (pins template on `encounter.applied_style`); **staff stay on the worklist after create**;
**full-create drawer requires a bound patient** (row 22 overridden; `pick-bind.ts`); create-patient form = Unicode name
pattern, tenant form settings decide visible/required fields (Settings > Patient intake / Visit form), ONE
`CountryPhoneField` writing `phoneCountryCode` + `patientPhone`, City + State present (never re-derive from the old
Mr/Mrs/Ms/Dr/Prof + regex text: "country-code regression"); `CreateVisitDTO` gained `note_template_id`,
`encounter_date`, `ip_op_no`, `referral_dr`.

### Key behaviours (testable)
- **List query:** `POST /encounters/visits/search` (Active) / `POST /encounters/visits/completed` (Completed);
  `useInfiniteQuery` key `['visits', scope, {search, doctorId, statuses, startDate, endDate}]`; `limit: 25`;
  `hasMore = page < pagination.totalPages`; end footer **"No more visits to load"**. One endpoint per scope regardless
  of filters (fixes V1 bug where search dropped completed visits). Scope switch keeps filters.
- **Grouping:** by `encounterDate` only (NOT `updated_at`; V1 regression). Headers `Today`, `Yesterday`, then
  `DD-MM-YYYY`, newest day first; within a day server order (`created_at asc`) = clinic-queue order. No client sort or
  filter of fetched pages.
- **Order invariant:** server `encounter_date desc, created_at asc`, "everywhere, always". Spec: Orderby NOT built,
  drag-reorder off-spec. **Reality: Orderby IS built** (`visits-customize-menu.tsx` "Orderby" submenu, URL `order=recent`,
  default "oldest", sent as `orderBy` in `visits.api.ts`). Spec-vs-code divergence; under ADR-018 built code wins: raise, don't file as bug.
- **Default filter (Active):** `IN_PROGRESS` + `NOT_STARTED` preselected, shown as removable pills, clearable; a filter never a sort.
- **Filter state in URL** (`use-visit-filters.ts`, `useSearchParams`): scope, doctor id, status codes, dates (non-PHI).
  **Search text is component state only: never URL, localStorage, sessionStorage, IndexedDB, analytics, logs.** Refresh
  exits search mode and clears query.
- **Search (header mode):** magnifier swaps title row for focused empty field + close; placeholder **"Search by name or
  UHID"**; panel height doesn't change; **Escape or close restores title AND clears query** (list refetches without
  `search`); 400 ms debounce; **min 2 chars** (V1 fired at 1); server-side only, current scope only; switching scope with
  search open keeps query and applies to new scope. Same for every role (no Staff always-on field).
  Server matcher: first_name startsWith, last_name startsWith, patient_code contains, external_id_1 contains,
  phone_number startsWith, "first last" split; case-insensitive except phone; no transliteration (stored script only).
- **Customize popover** (anchored under panel header): Filters (Status, Doctor, Date; one sub-panel open at a time),
  Display (Card Details, Reset to default).
  - **Status:** multi-select; options = `GET /encounters/statuses` → `normalizeEncounterStatus` → dedupe. Never offer
    retired (`PA_IN_PROGRESS`, `PA_PAUSED`, `SUBMITTED_TO_DOCTOR`) or design's At Vitals / Ready for Consult / Returned /
    PA In Progress. `GENERATING_NOTE` never offered (server excludes it). Selecting Ready for sign-off sends
    `status: ['PENDING_SIGN_OFF','SUBMITTED_TO_DOCTOR']`.
  - **Doctor:** single-select, `POST /doctors/search`; PA uses `GET /doctors/my-doctors`. Row hidden when clinic has one doctor.
  - **Date:** preset rail Today / Last 5 days / This week / This month, **Clear pinned bottom**; 42-cell month grid;
    **preset must paint the calendar**; fill `--primary-100`, ink `--primary-800`; sends `start_date`/`end_date`
    (inclusive, end coerced 23:59:59.999 UTC). Works on every scope. **Completed default = last 30 days**; Clear on
    Completed restores 30-day default.
  - **Card Details:** toggles UHID · Recording Status · Time · Doctor · Visit Status, all default on; Name not toggleable;
    off removes field from every card and re-clamps name; ready/last-touched lines are not toggles. Reset restores filters + Card Details.
- **Filter persistence:** server-side `tbl_user_setting` via `GET/POST /user-settings`, new `SettingTypes`
  `VISITS_LIST_FILTER_SETTING`; never contains search text/patient id/visit id; slow/failed read → render defaults
  immediately, no retry loop; retired status/unavailable clinician in a saved filter → collapse/drop silently, never error.
  **Reality: `VISITS_LIST_FILTER_SETTING` not found in src** (only `/user-settings` for note type), so persistence looks unbuilt.
- **Card (one contract, DS `VisitCard`):** 3 bands: Name (`--text-primary`, clamped; empty → **"Untitled Visit"** only,
  never "New Visit"); Meta (mic+duration, clock+time; one icon colour; UHID only via Card Details, no `ID: <code>` line);
  Footer after **dashed hairline**: clinician chip (dropdown, **stopPropagation**, so clicking chip must not select card) +
  status pill. Selected = inset `--primary` box-shadow ring (no border/width jog). Duration: `Ns` under a minute else `N min`
  (max of `audio_transcriptions[].duration`). No documentation-state (drafted/empty/signed) on card. Names wrap (Tamil/Devanagari) at ~320px rail, never mid-grapheme truncation.
- **Status pill labels (client, not seed):** NOT_STARTED "Not Started", IN_PROGRESS "In Progress", PAUSED "Paused",
  PENDING_SIGN_OFF **"Ready for sign-off"**, GENERATING_NOTE "Generating Note" (+indeterminate spinner), COMPLETED
  "Completed", SIGNED "Signed", AT_OPTOMETRY "At Optometry"; unknown → title-cased raw code, neutral-outline (never
  Not Started orange). Tokens: neutral / live / muted-warning / **attention** (only PENDING_SIGN_OFF) / progress /
  success-quiet (COMPLETED, SIGNED) / informational / neutral-outline. Retired codes normalize first and never reach the
  unknown fallback; legacy row byte-identical to migrated one. Note: this conflicts with Hawk's ekko-ds tone map (Pending
  Sign off = fuchsia etc.) and app has extra `CANCELLED` in `visit-status.ts`; ask before filing colour bugs.
- **Reassign chip** (`PATCH /encounters/:id/doctor?doctor_id=`): **enabled only at NOT_STARTED and PAUSED**
  (`canReassignClinician`, verified in code); disabled IN_PROGRESS, GENERATING_NOTE, PENDING_SIGN_OFF, COMPLETED, SIGNED,
  AT_OPTOMETRY. Disabled without `visit.update.*`. PA picker = my-doctors only; server 403 → message verbatim, chip
  reverts, list invalidated. Quota-exhausted target → refused before write, chip reverts.
- **Ready for sign-off:** pill + line **"Ready for sign-off · Marked by <first name> · <HH:mm today | DD MMM, HH:mm>"**;
  unknown marker → pill alone, never "Unknown". **Count chip "Ready for sign-off · N"** in header for every role; renders
  only N>0; count = `visits/search {page:1, limit:1, status:[aliases], doctor_id}` reading total; staleTime 60 s,
  refetch on focus + `['visits']` invalidation; failure → chip without number (never 0), retry 1. Press: status filter +
  clinician=self (Doctor) / linked doctors (PA); Staff/Optometrist/Radiologist/Org Admin status only; shown as removable
  pills; press again clears only what it set. No reordering. List is truth if count disagrees.
- **Last touched:** "Last edited by <first name> · <time>" (relative "4 min ago" within 1 h, HH:mm today, DD MMM, HH:mm);
  hidden for NOT_STARTED with no writes and when `last_edited_by` NULL; sits below ready line; when later than
  `marked_ready_at` AND editor ≠ marker, timestamp gets attention token. Refetch-based, not live. Only first names
  (never email/id/role), never in URL/storage/logs.
- **Empty/error states (copy fixed):** no data, no filters: **"No visits yet."** + New visit button (if `visit.create.*`);
  filters/search no match: **"No visits match your filters."** + **Clear filters**; Completed empty range: **"No completed
  visits between <start> and <end>."**; error: message + **Retry** (retry 2, exponential), loaded pages stay, no patient
  name/query in error text. Empty list + unselected detail pane must not repeat the same sentence.
- **Unselected surface (≥xl 1280):** both panes mount, no auto-select, detail pane shows a short purpose line, **no tab
  strip, no Start Recording, no Export**, no patient data/counts/recently-viewed. Filter change doesn't close open detail.
  **Below xl the card page (`visits-list-page.tsx`) is used, accepted** (split view is ≥1280 only); mobile out of scope.
  Responsive: ≥xl two panes (~320px rail); md-lg route-driven single pane with back; <md single column, Customize behind one trigger, New visit icon-only.
- **Recording guard:** while this browser records, clicking another card is blocked with toast **"Recording in progress
  — finish or stop recording before leaving this screen."**; other cards read non-interactive. New visit also blocked (toast).
- **Refresh:** `refetchOnWindowFocus`; mutations invalidate `['visits']`; no push/socket on list.
- **Create (both → `POST /encounters/visit`):** New visit button only with `visit.create.self|org`; route guarded too.
  - One-tap (non-Staff): `{doctor_id, note_type_id}` (+ `note_template_id`), **no patient_id, no patientGender, no
    placeholder patient, never `/encounters/quick-encounter`** → Untitled Visit. Doctor defaults self; PA defaults linked
    doctor if exactly one else required; others required. Optimistic pending card (`onMutate`, rollback), navigate to real
    `/visits/new` then `replace` to `/visits/:id/view` (never a fake `temp-<ts>` id). Double tap = exactly one encounter.
    On error: remove card, restore cache, back to `/visits`, server message.
  - Staff drawer/modal: patient async combobox (300 ms debounce, `GET /patients?search=`; rows avatar, name+age/gender,
    phone | patient_code; sticky **Create New Patient** row only with `patient.create.*`), clinician required, care team
    (STAFF contacts via `POST /userdetails/contacts`), context textarea, attachments → `POST /documents/upload`
    (`encounterId`, `documentType: patient_documents`) after create. Attachment failure: visit kept, failed files listed with retry (not a vanishing toast).
  - **Duplicate check:** on patient selection `GET /encounters/check-existing?date=<today>&patient_id=` ; non-completed
    same-day encounter → inline warning naming it + status, **"Open existing visit"** and **"Create anyway"**, neither preselected.
  - DOB↔age two-way sync. Note type: cached query (settings default → `DEFAULT_NOTE_TYPE` → first → ""), no extra round trip.
  - Quota exhausted (`checkVisitAvailability`): no encounter/Usage row; specific message naming quota + doctor; one-tap doesn't navigate.
  - Deep link `/visits/new?patientId=<id>` opens prefilled, user confirms (no auto-create on mount).

### Roles / permissions
All six seeded roles (Doctor, PA, Staff, Optometrist, Org Admin, Radiologist) hold `visit.read.*` + `visit.create.*`; all
see full-tenant list (no self/org row filter; Org Admin not privileged). Strings: list `visit.read.self|org`; create
`visit.create.*`; reassign `visit.update.*`; Create New Patient `patient.create.*`; patient search `patient.read.*`; doctor
filter `doctor.read.*`; PA linked `linked-doctors.read.self`; attachments `document.create.*`; prefs `settings.read/update.self` (all roles).
**R1:** `POST /encounters/visit` must refuse a PA creating for an unlinked doctor (`isPALinkedToDoctor`, `ForbiddenException`, same helper as reassign).
Auth: access token with audience via `getAccessTokenSilently()`, never ID token.

### API facts
`GET /encounters/statuses` (auth only, excludes GENERATING_NOTE); `searchVisits` excludes COMPLETED always (so SIGNED and
AT_OPTOMETRY appear in Active); `AT_OPTOMETRY` has no seeded label. R2 fields on list DTO: `last_edited_by {user_id,
first_name}`, `marked_ready_by` (same), `marked_ready_at` ISO; cleared when leaving PENDING_SIGN_OFF; never fabricate from `updated_at`.
Gender enum `MALE|FEMALE|OTHER|UNKNOWN|RATHER_NOT_SAY`. Contract fixture exists: `src/test/contract/fixtures/case-5-quick-encounter-required.fixture.ts`.

### Isolation / PHI / audit
- Tenant missing → **no query at all**, session-error state, re-auth. Tenant switch → `removeQueries` (not invalidate)
  on `['visits']`/`['patients']` before first paint; filter state reset. Cache in-memory only, cleared on logout.
- Error/monitoring payloads for `visits/search`, `visits/completed`, `check-existing`, `POST /encounters/visit` redacted.
- No console logs of PHI (V1 logged clinician identities). Audit: list/search not audited (accepted gap, inherits
  `global-search-compliance-fixes`; tenant enablement requires read-access audit writer).

### Hazards / non-goals / open (don't report as bugs)
Non-goals: detail page, recording, sign-off, export; scheduling/Upcoming pane (OQ10; app has `upcoming-visit-card.tsx`
from later work); saved views, bulk, card multi-select, CSV, print; delete from list; live push; any edit-permission
affordance (hand back/take over); writing status from list; client fuzzy matching; "my visits" toggle; offline.
Known: Staff front-desk worklist (`fd-worklist-page.tsx`) exists beyond this packet. SIGNED in Active is intentional (OQ5).
1200px laptop gets card page (accepted). Design Customize retired labels are a design conflict (OQ9). Two card
implementations = build bug for Ian/Tess (edge 48/49). Monitoring dashboard unnamed (OQ4). Role-seed mismatch (`lab_technician` = Radiologist) OQ3.
Load budget p95 < 500 ms on list endpoints (120 today / 40k completed).

### Reality check (src)
Built: `src/features/visits/` → `visits.api.ts` (visits/search, visits/completed, `/encounters/visit`, check-existing,
statuses, `/encounters/:id/doctor`), `use-visits-list.ts` (retry 2, count staleTime 60 s, retry 1), `use-visit-filters.ts`
(400 ms debounce, URL params), `visit-status.ts` (`LEGACY_STATUS_ALIASES`, labels, tokens, REASSIGNABLE), `group-by-date.ts`,
`empty-states.tsx` (all 3 copies + error), `ready-count-chip.tsx`, `visit-card-lines.tsx` (Marked by / Last edited by),
`duplicate-warning.tsx`, `create-visit-drawer.tsx`, `create-patient-form.tsx`, `dob-age.ts`, `visits-customize-menu.tsx`,
`visit-date-calendar.tsx`, `card-details.ts`, `visits-split-view`, `visit-view-page.tsx` (`?record=1`). Router: `visits`,
`visits/:id/view`, `visits/new`, redirects `visits/:id/record|note`. Divergences: Orderby built; filter persistence enum absent.

---

## 2. Visit context (Add context: documents, photos, private dictation)

**Frontmatter:** status `done`; owner/assignee `gerrit`; created 2026-08-25; amended 2026-09-03; completed 2026-10-20; tier 1.

**What it is:** attach patient-brought material and clinician dictation to a visit: **photograph** (camera), **upload**
file/PDF, **attach a recording** (`AUDIO`), **dictate** (`DICTATION`), plus typed **text** (`TEXT`). All become
`clinical_context` rows, are parsed, produce medical-object facts, and join the note on the same path as transcript facts
(with provenance `clinical_context_id`). Reuses V1 endpoints `encounters/:encounterId/context`.

**Build deltas:** delete is bulk `DELETE /encounters/:id/context` with ids in body (not `/:contextId`). Camera (D20): video
only, tracks released on capture/close, image staged in unsent in-memory draft, explicit send. **Text/document intake stays
available while recording (D04).**

### Key behaviours / ACs
- Endpoints: `POST` (multipart `files`, max **10** per batch via `FilesInterceptor('files', 10)`, plus `dto.text`; per-item
  `clinical_context_type` ∈ `FILE|TEXT|AUDIO|DICTATION`, no separate mode field, D8), `GET` list, `GET need-regenerate`,
  `PATCH :contextId`, `DELETE` bulk `{contextIds: uuid[]}` (bodyless 400s). 11th file refused; UI should warn **before** upload.
- Limits: audio > **25 MB** (`CONTEXT_AUDIO_MAX_BYTES`) refused (whole batch, before S3); app also caps files at 25 MB (`CONTEXT_FILE_MAX_BYTES`, V2-72).
- Parse failure (blurry photo): `extraction_status = FAILED`, item **kept and visible**, note generates without it, failure surfaced to uploader, one audit row, no medical fact.
- `extraction_status` = V1 text-extraction (`PENDING|PROCESSING|SUCCESS|FAILED|NOT_REQUIRED`, set synchronously at upload,
  TEXT → NOT_REQUIRED). New `object_status` = V2 lifecycle (`PROCESSING → APPLIED|FAILED`).
- **After note generated:** `need-regenerate` flags stale; **never auto-regenerate**; explicit control in UI (D2)
  (`stale-note-banner.tsx`). Before first generation: just included, no flag. This is also the post-Stop correction path.
- **After sign-off: refused** (`assertEncounterEditable`).
- Delete after facts reached note: facts **stay**, provenance points at inactive item, UI shows source no longer attached (D3).
- Conflict rule D7: newer **source date** (`context_date`) wins, not upload time; otherwise context fills gaps; loser
  `SUPERSEDED`. Undated/uncertain-date behaviour is OPEN (risky).
- Context list returns only FILE/TEXT/AUDIO/DICTATION, never edit-trail rows (`NOTE_*`, `PRESCRIPTION_*`, `LAB_*`, `VITAL_*`).
- Dictation never enters transcript, never played back into the room. Labelling: must NOT promise secrecy ("private note"
  is wrong); state once at capture that it becomes part of the record (D1). Not hidden from patient record requests.
- ACs list (test names): `a_private_dictation_produces_a_medical_object_and_never_enters_the_transcript`,
  `audio_over_context_audio_max_bytes_is_refused`, `context_attached_after_sign_off_is_refused`,
  `only_a_doctor_or_a_pa_may_attach_a_dictation`, `a_staff_user_attaching_a_dictation_is_refused_and_nothing_is_persisted`,
  `a_batch_mixing_a_photograph_and_a_dictation_is_refused_whole_for_a_staff_user`,
  `a_second_tenant_can_neither_read_nor_write_another_tenants_clinical_context` (**404 not 403**),
  `attaching_a_context_item_writes_one_audit_row_with_ids_only`, `deleting_a_context_item_writes_one_audit_row`,
  `context_files_are_uploaded_to_s3_with_server_side_encryption_specified`, `this_feature_adds_no_consume_visit_call_site`, plus facts/provenance ACs (backend).

### Roles / permissions
- Upload/patch/delete: `visit.update.self|org` only (D4 removed `document.create`). Read: `visit.read.*`.
- FILE/TEXT/AUDIO: any role that can edit the visit (all six seeded roles hold `visit.update`).
- **DICTATION: `role_code` doctor or pa only**, per item in service; mixed batch with a forbidden dictation → **whole
  request refused**, nothing written. UI hides dictation control for other roles (app: `mayDictate = (doctor||pa) &&
  !consultationRecording` in `context-composer.tsx`, so dictation is also hidden while the consult is recording).
- Staff sending `AUDIO` for what is really dictation: accepted as AUDIO, facts `asserted_by: OTHER`. Not a bug (D8).
  AUDIO facts never `DOCTOR`; DICTATION facts `DOCTOR`.

### PHI / audit / isolation
New PHI path (letter images, dictations). Audit `CLINICAL_CONTEXT` rows ids-only (filename often = patient name, must
not be in audit). S3 `ServerSideEncryption: AES256`. `clinical_context` has no `tenant_id` (transitive via encounter); cross-tenant = 404.
Image OCR goes to OpenAI gpt-4o-mini (processor list open with counsel). `content_text` missing from G7 erasure (routed elsewhere).

### Non-goals / open
Not patient-facing upload; not OCR engine choice; not edit-trail half; tenant-configurable restrictions deferred
(`per-tenant-entitlements`); billing: context converts reservation via `reserve-and-confirm-billing` only (no own
consumeVisit); one-visit-per-encounter assertion moved there. Open: SupersedeReason for context supersede; undated source.
QA: photograph real crumpled paper under clinic lighting, not clean scans.

### Reality check (src)
Built under `src/features/visits/context/`: `context.api.ts` (bulk DELETE body, MAX_CONTEXT_FILES 10, 25 MB caps, DICTATION),
`context-composer.tsx` (camera via `CameraCapture`, role-gated dictation), `dictation.ts`, `text-dictation.ts`
(`/v2/encounters/:id/context/dictation/credentials`), `stale-note-banner.tsx` + `use-visit-context.ts` (need-regenerate),
`visit-context-tab.tsx`, `context-batches.ts`. Mic-error toasts: "Allow microphone access to record audio.", "This browser
cannot record audio.", "The recording could not be saved. Please record it again."

---

## 3. Recording (V2 capture screen + pipeline trigger)

**Frontmatter:** status `done`; owner/assignee `gerrit`; created 2026-08-22; completed 2026-10-20; tier 1. Amended
2026-08-23 (ADR-011), 2026-09-03 (ADR-014: **Stop is one-way and triggers generation**; handoff = pause/resume in one session).

**What it is:** one explicit recording state machine (Zustand) + capture screen, browser-direct Soniox transport via
`/live-transcription`, and a 4(+heartbeat) endpoint V2 control plane that writes status, holds a per-encounter Redis lease,
and starts/signals the notes-flow-v2 Temporal workflow. Fixes V1 cross-patient transcript bleed and leaked mic streams.

**Build deltas:** non-live upload = `POST/GET /v2/encounters/:encounterId/recording/upload` (S3, **500 MB**, outbox,
`recordingUploadPipeline` Temporal workflow, session id = upload uuid); needs `notes_flow_v2` entitlement + Soniox; V1's
Sarvam/non-entitled fallback NOT integrated (open). Session ownership verified on every append/end; V2 transport bound to
lease (D43); transcription prefs resolved server-side from assigned doctor, PA inherits (D44); Soniox keepalive while
paused; `LinkedEditorGuard` (D41). Overrides: **recording start converts the visit reservation and writes Usage**
(metering IS touched); **a PA's Stop lands at `PA_IN_PROGRESS`** (normalised on read; not yet in signable list,
`features/v2-updates`). Unverified at archive: real-mic PA handover, all-role browser matrix.

### State machine (client, this browser)
`IDLE → REQUESTING_MIC → STARTING → RECORDING ⇄ PAUSED → STOPPING → STOPPED`; `ERROR` from any. `reconnecting` is a flag
on RECORDING (amber pill), not a state. "Someone else recording" is NOT a state (this browser is IDLE + server lease info).
Code: `recording-store.ts` statuses `idle|requesting-mic|starting|recording|paused|stopping|stopped|error`, errorKind
`permission-denied|no-device|already-active|start-failed|transport-failed`; resume goes paused→starting.
Session object `{encounterId, tenantId, sessionId, socket, audioContext, workletNode, stream, startedAtMs}`, max one,
nothing module-scoped; teardown on unmount/route/encounter change: stop tracks, close AudioContext, close socket +
listeners, `POST session/end`, null session.
Screen states checklist: idle, requesting-mic, starting, recording, recording-reconnecting, paused, stopping, stopped,
error, permission-denied, someone-else-recording, quota-refused, signed-off-read-only.

### Control plane (status writes, server)
| Endpoint | Behaviour |
|---|---|
| `POST /v2/encounters/:id/recording/start` | authz (perm + tenancy + linked editor) → 409 if COMPLETED/SIGNED → claim lease (`409 recording_already_active` `{holderName, holderUserId, startedAtMs}`) → `checkVisitAvailability` (**402** quota, no status/workflow/session) → write `IN_PROGRESS` → returns `{status, sessionAllowed:true, recordingSessionId, pipeline:'pending'}`; workflow opened in background (3 retries ~1 s) |
| `.../pause` | holder only → `PAUSED` (sub_status `PAUSED_BY_DOCTOR` for everyone incl. PA; render nowhere) |
| `.../resume` | renew lease (compares `recordingSessionId`, NOT caller, so another linked user can resume) → `IN_PROGRESS` → startForSession (duplicate no-op) |
| `.../stop` | signal `recordingStopped` to `{encounterId}:{recordingSessionId}` → release lease; status walks `GENERATING_NOTE → PENDING_SIGN_OFF` (PA: `PA_IN_PROGRESS`, see override) |
| `.../heartbeat` | body `{recordingSessionId}`; every **20 s** from a Worker (not main-thread setInterval); lease TTL **90 s** |
Client never sends a status string. Status independent of role. `session/create` (Soniox temp key, 1 h, memory only),
`session/transcript`, `session/end` = transport.

### Lease rules
Redis `v2:recording:active:{encounterId}` `{recordingSessionId, tenantId, userId, firstName, startedAtMs, lastHeartbeatAtMs}`.
One active session per encounter. **No takeover / force-start, ever.** Second person: header "**<name> is recording**",
Start disabled with reason, transcript read-only, everything else (attach docs, edit entities) enabled; stale holder shows
"recording since 10:41". Same user, second tab: "You are already recording this encounter in another tab" (spec copy;
not found verbatim in src). Heartbeat continues while paused and while mic disconnected. Lost lease: capture stops, never
silently resumes; reclaim dialog names the gap duration; Continue mints a new `recordingSessionId`; audit
`RECORDING_LEASE_EXPIRED` + `RECORDING_CONTINUED_AFTER_GAP`. Heartbeat worker gets no access token/Soniox key. Switching encounters kills the old worker.
Upload refused while lease held by anyone.

### Edge rows (test-relevant)
- E1 patient switch A→B: teardown on leaving A; store refuses Start for B while A session exists ("finish or stop the
  recording for <A> first"); transcript key `['transcript', B]` renders empty. **Mandated A→B test.** E2 stray events for
  non-active encounter dropped + counted.
- E3 dropped connection: spec = 5 attempts 1→8 s jitter, 60 s in-memory ring buffer, then auto-pause banner + Resume;
  expired key → `session/end` BEFORE new `session/create`. **Reality: `RECONNECT_DELAYS_MS = [500, 1000, 2000]` (3
  attempts) and `MAX_PENDING_SAMPLES = 30 s`** in `live-transcription.ts`: divergence, ask before filing.
- E4/6a/8 handoff: PA pause → doctor Resume = same session/workflow/stream; any number of times; one Stop. Pause > ~5 min
  idle-out → Resume becomes fresh Start (new session id, workflow resumes at offset).
- E5 crash/tab close: transcript safe to last flush (≤15 s/≤200 chars); encounter stays IN_PROGRESS; lease expires ≤90 s; reopen offers Start (new session appends).
- E7 unlinked PA: 403 at every control endpoint + `session/create`. Staff & Org Admin: 403 on all (no recording perms).
- E9 COMPLETED/SIGNED: 409, Start not rendered. **E9a PENDING_SIGN_OFF: Start NOT rendered** (Stop one-way); editing + context still allowed. E10 completed mid-recording → "This note has been signed."
- E11 mic denied: dialog, back to IDLE, **no session/status/workflow**. E12 distinct messages: no device / busy (Zoom/Teams/Meet) /
  OverconstrainedError silent retry `{audio:true}`. Spec copy "Ekko needs your microphone", "No microphone found — connect
  one and try again", "Your microphone is in use by another app (check Zoom/Teams/Meet)". **Reality copy** (`capture-primitives.tsx`):
  "Microphone access is blocked" / "No microphone found" + "Ekko cannot record without the microphone. Allow access in your
  browser's address bar, then try again." / "Connect a microphone or headset, then try again. If one is connected, check
  that another app is not holding it." (busy merged with no-device: divergence).
- E13 mic unplugged mid-recording: auto-pause, `PAUSED`, banner "Recording paused — microphone disconnected", lease held.
- E14 backgrounded tab keeps recording (AudioWorklet), timer from `performance.now()`; wakeLock best effort; `visibilitychange` does NOT pause.
- E15/16 Temporal down: 200, no UI indication at all.
- E18 quota at Start: 402, nothing written. E21 upload during live recording refused (client + server).
- E24 Stop confirmed by state: pill leaves RECORDING only after tracks stopped + AudioContext closed; `session/end` failure → "Stopped — finishing upload".
- E28 no transcript/audio/key/session id in any browser storage, cookies or URL. E30 two tabs same person (above).
- Max duration: auto-**stop** at `RECORDING_MAX_MINUTES` (default 45) with dialog; no auto-generate (V1 bug). Not found in src grep: verify.
- V1 parity: note-type select locked while recording; Upload only when not recording; sync indicator (syncing / "Last sync at h:mma" / sync failed).

### Roles / permissions
Doctor + linked PA: all controls until COMPLETED. Radiologist holds recording perms (can record, **not a bug**).
Optometrist only `transcription.create.*` (no recording). Staff/Org Admin none. Strings: control + upload
`recording.create.self|org`; `session/create`+transcript `live_transcription.create.*`; end `live_transcription.end.*`;
read transcript `transcript.view.*`. Linked editor = assigned doctor OR active `DoctorPA` OR org-scoped recording permission.

### PHI / audit / isolation
Audio browser → Soniox directly (Ekko stores no live audio, OQ3). Audit rows `RECORDING_STARTED|PAUSED|RESUMED|STOPPED|
BLOCKED|LEASE_EXPIRED` ids/enums only; only record of PA vs doctor. 409 body: display name + user id only. Cross-tenant id → 404
before lease read; unlinked → 403 before lease read. `session/transcript`/`end` reject session ids not owned (IDOR fix). No transcript text in logs/metrics/Temporal payloads.
Realtime events (ids only): `recording.started|paused|resumed|stopped(reason stopped|lease_expired)`, `facts.changed`; works without realtime channel (banner one navigation later).

### Non-goals / open / V1 diffs
No post-generation append recording (ADR-014 §7; corrections go via context dictation); no multi-device; no diarisation
UI, no in-consult transcript edit, no language/STT picker (OQ1), no `/speech-to-text`, no offline/IndexedDB queue, no audio
playback. Open: pause lapsing lease vs live-note reconciliation (edge 4); diarization across handover; `pipeline:'unavailable'`
has no value since start returns `pending`; PA licence on V2 (OQ2); `/speech-to-text` decommission (OQ4).

### Reality check (src)
Built in `src/features/recording/`: `recording-store.ts`, `capture-controller.ts`, `capture-screen.tsx`, `capture-states.tsx`,
`capture-primitives.tsx`, `capture-runtime.tsx` ("Recording in progress" guard), `capture-worklet.js` (AudioWorklet),
`recording.api.ts` (base `/v2/encounters/:id/recording`, `recording_already_active`, heartbeat), `recording-heartbeat.ts`
(`HEARTBEAT_INTERVAL_MS = 20_000`) + `recording-heartbeat.worker.ts`, `recording-lost-dialog.tsx`, `live-transcription.ts`
(`/live-transcription/session/create|transcript|end`), `navigation-guard.tsx`, `recording-upload.tsx` + `.api.ts`
(`/v2/encounters/:id/recording/upload`), `microphone-picker.tsx`, `visit-live-transcript.tsx`. Not found: max-minutes auto-stop
constant, same-person-other-tab copy, "microphone disconnected" copy, "Ekko needs your microphone".
