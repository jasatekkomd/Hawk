# A2 — Notes pipeline + sign-off: test knowledge (from .ai/completed/archive/*)

Source: `/home/user/ekko-web-app/.ai/completed/archive/` (sign-off, live-note-generation,
notes-flow-v2-medical-object [spec, walkthrough, prompts], note-references-on-read [spec, plan],
transcript-chunker, medical-object-schema [spec, plan]). Read 2026-10-26 on branch
`codex/v2-23-mobile-validation` @ 849bf99. All six are `status: done`, archived 2026-10-20 at the V2
baseline (ADR-018) against `ekko-coreService-nodejs@74bbfa39 · ekko-web-app@6c1c226 (ian-v2-lane, 2026-10-15)`.
**Struck text and "Overridden 2026-10-20 (ADR-018)" notes win over the original prose.** `done` = history:
where the built code differs from the spec, ADR-018 says the code is the record; raise divergences, do not file
them as bugs without checking. Mostly backend specs; UI-testable parts flagged **[UI]**.

---------------------------------------------------------------------------------------------------
## 1. sign-off — "the doctor's signature makes the note a record"

**Frontmatter:** done · owner/assignee gerrit · created 2026-08-22 · amended 2026-09-06 · amends ADR-011, ADR-013 ·
tier 1 · completed 2026-10-20.

**What it is.** The V2 signing act: `POST /v2/encounters/:encounterId/sign-off` resolves every note section's
marker-form body one final time, writes an immutable snapshot (`tbl_signed_note_section.resolved_text`) plus a
signature row (`tbl_note_signature`, `content_sha256`, signer, `actor_mode`, `signed_at`), accepts pending
transcript labs/prescriptions through the unmodified V1 path, moves the encounter to `COMPLETED`, and after that
every read path (app, PDF, export, copy, WhatsApp) serves the snapshot. V1's sign-off had no confirmation, no
signature record, permission `visit.update.*` instead of `visit.signoff.*`, and failures went to `console.error`.

**As built (2026-10-20 note):** addendum endpoint **NOT implemented** (deferred, ADR-018 §Open; "signed records stay
immutable"); V1 `PATCH /encounters/sign-off/:id` still live beside V2; added refusals `PATIENT_REQUIRED` and
`NOTE_CHANGED_RELOAD`, a pending-upload check, row lock. Gate is `encounter.pipeline_version` (V2 encounter stays
signable after a tenant's entitlement is turned off), not the live entitlement. Batch/queue: spec says retired
2026-09-06, then ADR-018 says `GET sign-off-queue` + `POST sign-off-batch` are "LIVE and load-bearing". **Reality in
this repo:** the app calls a per-encounter `GET /v2/encounters/:id/sign-off-sheet` (`sign-off.api.ts`) and the
contract manifest lists `sign-off-sheet` + `sign-off` and NO queue/batch route. Soft-block layer deferred (v1 lists
no attention items, no tick; `unresolved_ack_count` always 0; `UNACKNOWLEDGED_ITEMS` never raised in v1).

### 1.1 Who may act (ADR-011 + ADR-013)
| Actor | Edit | Set PENDING_SIGN_OFF | Sign |
|---|---|---|---|
| Doctor of record | yes until COMPLETED | yes | yes, `DOCTOR_SELF` |
| PA linked via `DoctorPA` | yes until COMPLETED | yes | yes, `PA_DELEGATED`, only if tenant `delegated_signing_enabled` ON AND encounter has `doctor_id` AND `isPALinkedToDoctor`; setting OFF → 403 `DELEGATED_SIGNING_NOT_ENABLED` |
| PA not linked | no (403) | no | no |
| Admin / Staff / Optometrist / Lab | no | no | no (read only with `note.view.*`) |
- Permissions: `visit.signoff.self|org` (doctor), `visit.signoff.delegated` (PA path, seeded, fixed per role), read
  `note.view.self|org`, export `note.export.self|org`. Holding `visit.signoff.org` does NOT let a doctor sign a
  colleague's encounter (actor resolution is the operative gate). Button visibility is presentation only.
- Delegated gate order (each fails distinctly): entitled → holds `visit.signoff.delegated` → setting ON (else 403
  `DELEGATED_SIGNING_NOT_ENABLED`) → `doctor_id` assigned (else 409 `NO_DOCTOR_OF_RECORD`) AND linked (else 403
  `NOT_LINKED`); the two preconditions are asserted separately.
- Dual-role user resolves by `encounter.doctor_id`, never role precedence: own encounter → DOCTOR_SELF; linked
  doctor's → PA_DELEGATED/403 by setting; unlinked doctor's → 403 whatever roles held.
- Unlinked PA refused at commit time (not page load), on every write path. With setting ON or OFF the refusal is
  `NOT_LINKED`, never `DELEGATED_SIGNING_NOT_ENABLED`.
- `delegated_signing_enabled`: per tenant (never per user), default ON, toggle audited
  (`SIGNOFF_DELEGATION_ENABLED/DISABLED`), forward only (turning OFF re-attributes/revokes nothing already signed).
  **App:** `features/entitlements/entitlements.api.ts` reads `delegated_signing` (default `false` client-side).
- `PENDING_SIGN_OFF` is a **signal, not a gate**: locks nobody out; PA keeps editing; doctor may move it back to
  `IN_PROGRESS`; doctor never needs to pass through it. `SUBMITTED_TO_DOCTOR`, `PA_IN_PROGRESS`, `PA_PAUSED` retired.

### 1.2 Preconditions and refusal codes (server, under `SELECT … FOR UPDATE`)
- 404 not found / inactive / other tenant (app also models `ENCOUNTER_NOT_FOUND`, `NOT_ENTITLED`).
- Source status must be `IN_PROGRESS | PAUSED | PENDING_SIGN_OFF` else 409 `INVALID_SOURCE_STATUS` (incl.
  `NOT_STARTED`, `AT_OPTOMETRY`, `SIGNED`, retired `SUBMITTED_TO_DOCTOR`); `COMPLETED` → 409 `ALREADY_SIGNED`
  (+ existing `signatureId`, `signedAt`); `GENERATING_NOTE` → `GENERATION_IN_FLIGHT`.
- 403 `NOT_DOCTOR_OF_RECORD` / `NOT_LINKED` / `DELEGATED_SIGNING_NOT_ENABLED`.
- 409 `NO_DOCTOR_OF_RECORD`, `NO_NOTE_TO_SIGN` (no active header with ≥1 active detail), `GENERATION_IN_FLIGHT`,
  `RECORDING_IN_FLIGHT` (active recording session), `NOTE_CHANGED_RELOAD` (If-Match / section `updated_at`
  stale), `CONTENT_CHANGED_RELOAD` (sha mismatch; same meaning), `CONTENT_NOT_RENDERED` (sha not issued by the
  sheet/queue render; ledger keyed `{tenant,user,encounter}` so A's sha can't satisfy B), `UNACKNOWLEDGED_ITEMS`
  (deferred), `PATIENT_REQUIRED` (no bound active patient, built), pending-upload refusal (built, code not named).
- App also models `UNSETTLED_AUTOSAVE`, `SECTION_SAVE_FAILED`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_TOO_LONG`
  (key cap 128 chars). Refusal body is `{ statusCode, reason, … }` OUTSIDE the `{data}` envelope.
- **Nothing about another user's lock/presence/unsaved text ever blocks signing.**
- Known UX gap (finding 10, decision 12 open): `postCompleteTail` reopens the header AFTER the client was told
  'complete', so a first-generation note can look finished while Sign returns 409 `GENERATION_IN_FLIGHT`.

### 1.3 Commit sequence, idempotency, recovery (state machine)
T1 (one tx): final resolve → insert signature `commit_state=PENDING` + sha over concatenated sections (NFC UTF-8) +
one snapshot row per section with `last_edited_by_user_id` (from `note_detail.updated_by`); audit
`NOTE_SIGNOFF_STARTED` → step 2: unmodified V1 `signOffEncounter()` (PENDING Transcript labs → ACCEPTED, Suggested
labs → REJECTED, Transcript rx → ACCEPTED) → step 3: unmodified `updateEncounterStatus(id,'COMPLETED')` → T2:
`COMMITTED`, release all section locks, audit `NOTE_SIGNED`, publish `encounter.signed` (fire and forget).
- **Signed iff** `COMPLETED` AND an `ORIGINAL` signature with `COMMITTED` (`isEncounterSigned()`);
  `isEncounterSignedOff()` stays status-only.
- Torn commit (resume on next read + 5 min sweeper): PENDING + not COMPLETED → delete signature+snapshot, audit
  `NOTE_SIGNOFF_ABANDONED` (reason `TORN_COMMIT`), encounter fully editable by every linked user; PENDING + COMPLETED
  → promote, `NOTE_SIGNED{recovered:true}` (app shows "(An earlier signature was completed rather than a new one
  taken.)"). Accepted labs/rx are never rolled back (edge 35).
- `Idempotency-Key` header: same key → same signature row, no re-run; new key on signed encounter → 409
  `ALREADY_SIGNED`. `@@unique([encounter_id, sequence])`, sequence 1 = ORIGINAL. Two tabs at once → exactly one
  ORIGINAL + one 409.
- **Client rule (edge 2):** never flip to signed optimistically. On timeout/error: "Couldn't confirm — checking…",
  re-read once, then **Signed** (real `signed_at`) or **"Not signed. Nothing was changed. Try again."**; retry
  reuses the SAME key. App (`use-sign-off.ts`): states idle/signing/unconfirmed/signed/already_signed/refused; key
  kept only on unstructured failure, discarded on success or structured refusal; reset on encounter change
  during render; `invalidateQueries(visitKeys.all)` on success.

### 1.4 Review sheet [UI] (states the PR must list: clean, hard-blocked, signing, signed, refused, torn "couldn't
confirm", legacy-signed, addendum composer; soft-block deferred)
- Order: attribution (patient, visit date, doctor of record; PA path reads *"Signing on behalf of Dr X"* BEFORE
  the act) → what signing does → (attention block, deferred) → note as it will be frozen (server's final
  resolution, never a client re-render) → rx/vitals/labs → **Sign**. One tap on a clean record; no
  confirm-twice dialog. ekko-ds components + semantic tokens only, provisional.
- Spec verbatim lede: *"This freezes the note text and the prescription for this visit. Later corrections appear as
  an addendum, never as a change to what you sign."* App renders "This freezes the note text and the prescription
  for this visit. You won’t be able to edit the signed record." (consistent with addendum not built).
- Spec verbatim stale copy: *"This note changed — reload."*; delegated-off: *"Delegated signing isn't enabled for
  this clinic. Mark the visit ready and Dr X will sign it."* (app's version: "…Mark the visit ready for sign-off and
  the doctor of record will sign it."). Sha mismatch on signed render: *"This record can't be verified — contact
  support."* (renders nothing else; P0). Legacy: *"Signed before signature records were kept"*.
  **Copy conflict to note, not auto-file:** spec-fixed copy contains an em dash; ekko-ds bans dashes in UI copy.
  App strings with dashes: "This note changed — reload.", "Couldn't sign — try again.", "Reload the note before
  signing — Ekko needs you…". Raise as design question.
- Hard blocks (button disabled + reason): signer's own unsaved/in-flight edit, generation in flight, recording
  active, empty note, failed section save, stale version. Soft blocks (deferred): unmatched/refused/LOW drug,
  rx/note mismatch, pending labs, missing-row marker, another user editing.
- App copy per refusal lives in `src/features/sign-off/sign-off-refusals.ts` (no codes shown to user; unknown →
  "Ekko couldn't sign this visit. Open it and check the note."). Refetch on NOTE/CONTENT_CHANGED_RELOAD,
  CONTENT_NOT_RENDERED, GENERATION_IN_FLIGHT, UNSETTLED_AUTOSAVE. ALREADY_SIGNED treated as settled success.

### 1.5 Live collaboration race (edges 14–16) [UI]
- Signature wins; locks force-released at T2 (`SECTION_LOCKS_RELEASED_ON_SIGNOFF`). Snapshot = saved text only.
- Other editor on `encounter.signed`: read-only in place, keeps text, shows *"Dr. Priya signed this visit while you
  were editing. Your unsaved text was not included."*, actions **Copy for an addendum** / **Discard**; buffer in
  component memory only (never local/session storage/IndexedDB).
- Late save → 409 `SIGNED_WHILE_EDITING` → same panel, not a generic toast. Channel down → signature still commits.
- **App status:** no `SIGNED_WHILE_EDITING`, `encounter.signed`, or addendum code found in `src/` (grep). Treat the
  race/preservation panel as unbuilt in the web app; verify before testing.

### 1.6 After signing (freeze)
- Refused post-sign: fact merge/supersede, note-ref fan-out, reconciliation, new coding dispatch, every human edit
  (note, rx, vitals, labs, context, regenerate) by anyone → 409 + `SIGNED_NOTE_WRITE_REFUSED{path}`. Message in
  backend: "This encounter is signed off — post-sign-off changes go through amendment".
- Accepted: in-flight VeraTerm result with codes only (`CODE_APPLIED_POST_SIGNOFF`); a correction becomes a
  CANDIDATE (`CODE_CANDIDATE_STORED_POST_SIGNOFF`), fact value untouched.
- No `COMPLETED → PENDING_SIGN_OFF`, no un-sign, no "edit anyway" for any role incl. super-admin. Only exception:
  erasure purge job (deletes, never edits).
- Addendum (spec only, NOT built): `POST /v2/encounters/:id/addendum`, kind ADDENDUM, sequence n+1,
  `reason_code` CLARIFICATION|CORRECTION|LATE_RESULT|OTHER, refused on unsigned (409 `NOT_SIGNED`); >3 addenda
  collapse behind "show all".
- Legacy (pre-migration COMPLETED, no signature row): render `note_detail.value`, legacy line, no addendum.

### 1.7 Isolation, PHI, audit
- Edge 29: sheet state, sha, idempotency key, ack cleared on navigation; mandated switch-patients test (app has
  `src/features/sign-off/patient-switch.test.tsx`). `resolved_text` is the most consequential PHI; never logged.
- Audit (ids/enums/counts only; never note text, drug, patient name, or `content_sha256`): NOTE_SIGNOFF_STARTED,
  NOTE_SIGNED (actor_mode, section_count, ref_count, unresolved_ack_count, active_editor_count,
  released_lock_count, recovered), NOTE_SIGNOFF_ABANDONED, NOTE_SIGNOFF_REJECTED (reason enum), SIGNED_NOTE_WRITE_
  REFUSED, SECTION_LOCKS_RELEASED_ON_SIGNOFF, CODE_*_POST_SIGNOFF, NOTE_ADDENDUM_CREATED, SIGNED_NOTE_EXPORTED
  (PDF/WHATSAPP/COPY/DOWNLOAD), SIGNOFF_DELEGATION_ENABLED/DISABLED. `batch_id` always NULL.
- Letterhead must print *"signed by PA X for Dr. Y"* for PA_DELEGATED (ADR-013 §5). No metering: signing writes no
  Usage row. No LLM on the signing path. p95 < 800 ms on a 200-ref note.
- Non-goals: no PKI/DSC (sha is tamper evidence only), no countersignature, no auto-sign, no batch (per spec), no
  structured amendment, no V1 frontend change.
- Open: Q2 letterhead renderer reading path; Q3 DSC need; Q4 printed integrity line; Q5 retention/legal hold; Q8
  realtime-collaboration owner.

---------------------------------------------------------------------------------------------------
## 2. live-note-generation

**Frontmatter:** done · owner gerrit · completed 2026-10-20 (no created; body 2026-09-01) · tier 1.
**What it is.** The note builds during the consult. Original design (15 s client interval, one LLM call, Redis draft,
reconciliation at Stop) was **replaced 2026-10-05 (live-pipeline-v3)**: the live note is a read-only projection of
the fact ledger the Temporal recording pipeline writes; prose per section is warm-rendered on a fast model after
each merge and cached by fact fingerprint; **Stop renders the note server-side** and lands the encounter at
`PENDING_SIGN_OFF`. Measured Stop → note 4–5 s when caught up (23 s with queued primary merges, fixed).

### 2.1 Behaviour
- `GET /v2/encounters/:id/live-note` → headings, prose per section, provisional rx/lab/vital cards, pending-review
  count (ACTIVE non-HIGH facts), `state: ok | degraded | unavailable` + `reason`. Client polls every **2 s**.
- `POST /v2/encounters/:id/live-note/session` pins the note type once per session; re-pin on template switch =
  re-render, never re-extraction. No transcript leaves the browser via these routes.
- Also built: `GET …/live-note/review` (`note.update.*`, read once per finalise) and `…/review/:factId`
  (Confirm/Decline). Cadence: 3 s web flush, 2 s stream write, 2 s pipeline poll, 2 s projection poll.
- Only `HIGH` facts render live; MEDIUM/LOW counted: **"N items pending review"** (app: "1 item pending review" /
  "3 items pending review"). Live view rejects all edit input while recording (pause counts as recording).
- Continuous surface (2026-09-09): template chosen → every section heading, empty bodies (not an empty-state
  message; "No note yet — record the consult, then Generate" must be gone) → recording fills in place → finalising
  keeps content → ready = editable in place. **Section DOM nodes must be the same before/after the editable
  transition** (no remount); the read-only indicator is *replaced* by an editable affordance (app line:
  "Live note · read-only while recording").
- Stop is one-way and is Generate (ADR-014 §2): `IN_PROGRESS → GENERATING_NOTE → PENDING_SIGN_OFF`
  (`PA_IN_PROGRESS` per text for a PA, though ADR-011 retired it). No Generate button on a first note; only
  Regenerate (same renderer, reuses header). Reopen after finalise opens editable, no replay.
- Fallback (must not be deleted): no pipeline (not entitled → `state: unavailable, reason: NO_PIPELINE`, shows
  transcript + empty sections), failed windows, empty ledger, lease expiry without Stop (no actor) → full
  transcript reconciliation, encounter back to `IN_PROGRESS`, client generates via same renderer.
- Template resolution: explicit → session pin → `Encounter.note_type_id` → `SOAP` type → first active; else
  `NO_TEMPLATE` → full path.
- Verbatim copy: three consecutive failed reads → **"Live note unavailable — your note will be generated when you
  finish."** (recording unaffected); failed section render → **"This section could not be written automatically.
  Dictate or type it, or regenerate the note."** (never blank). Empty section text in app: "No information recorded".
- Edge 20: finalising with nothing recorded → empty sections stay, read-only, no error. Edge 21: failed finalise →
  note stays with everything, read-only, says so, never empties; offer retry only where possible (ADR-015).
- Warm prose carries `[[rx:<factId>]]`; projection resolves for display; at Stop fact ids are translated to rx rows.
- Lease: 90 s TTL, heartbeat-renewed. Quota metered at transcription start; live note does not meter.
- Determinism: medication name/strength/frequency/route at temperature 0; narrative (HPI, Assessment) at 0.6.

### 2.2 Roles / perms
Doctor and linked PA identical; Admin/Staff none; Optometrist inherits doctor. Live-note endpoints
`recording.create.self|org` (+ linked editor); reconciliation write `note.create.*`; Confirm/Decline
`note.update.*`. No feature flag, no kill switch (rollback = revert + redeploy). All plans.

### 2.3 PHI/audit/isolation
Warm-prose cache in Ekko Redis only, 24 h TTL, never in Temporal payloads; no client storage. Every Confirm/Decline
writes an audit row (actor, encounter, fact, decision). No server timer (tenant CLS). CDS: records, never suggests.
### 2.4 Open / known
OQ1 untested whether doctors want it (no flag to retreat). OQ6 `LIVE_WINDOWS_FAST_TIER` default off (first live change
~30 s). **OQ7 known gap:** "actually, no fever" retracts the symptom but a DIAGNOSIS inferred from it stays in
Assessment (carried to ADR-018 §Open) — not a new bug. Unchecked ACs: linked PA edits after Stop at every status
before COMPLETED; reconciliation no-op if generation exists; lease expiry triggers reconciliation; Confirm/Decline
audit; med fields reproducible; `/streaming/generate-notes` unchanged for V1; all seven 2026-09-09 surface ACs.

---------------------------------------------------------------------------------------------------
## 3. notes-flow-v2-medical-object (spec + walkthrough + prompts)

**Frontmatter:** spec done · owner/assignee gerrit · created 2026-08-03 · tier 1 · completed 2026-10-20.
walkthrough.md and prompts.md: `status: draft` (companion docs, not requirements), created 2026-08-10.
**What it is.** The incremental medical object: during recording a chunker cuts the transcript into windows, a
per-session Temporal workflow runs extraction → merge → (non-awaited) VeraTerm correction + coding, building an
encounter-scoped fact ledger (`tbl_medical_fact`). At Stop, structured sections (rx, labs, vitals) project instantly
from facts and the prose references rows via `[[rx:prs_…]]` markers, so one edit propagates everywhere. Gated by the
`notes_flow_v2` entitlement; V1 path is the fallback.

### 3.1 Testable rules
- Merge ops: ADD / UPDATE / SUPERSEDE(reason CORRECTION|REVISION) / RETRACT. SUPERSEDE only within same fact type
  family AND same `entity_key` (code guard). Different `subject` = never same fact. Later `effective_seq` wins.
  Unknown ids rejected; uncovered candidates force-ADDed. Machine op targeting a `correction_locked` fact is
  REJECTED and dropped (as built).
- CORRECTION = earlier fact wrong, disappears from every surface (audit keeps it). REVISION = earlier right when said,
  may persist as history. Spoken REVISION path NOT built (OQ6, validate first).
- Worked example: "BP 140 over 90" then "BP was 130 over 90" → record shows 130/90 exactly once.
- `verbatim` immutable forever; corrections change `value.drug_name` + `entity_key`, rerun from `original_value`
  (idempotent, no drug→drug walk). Doctor edit → `correction_locked`, machine never overwrites.
- VeraTerm spans per type: RX/CURRENT_MED → drug_name (MEDICATIONS); LAB_ORDER/RESULT → name (LABS);
  DIAGNOSIS/EXAM_FINDING → description (ASSESSMENT); SYMPTOM etc. not coded. Floor 0.95 MEDICATIONS (hypothesis).
  Below floor / Stage B refusal → CANDIDATE, fact stays LOW, rx row capped at confirm, advice says "please check
  with your doctor" ("We-stat" case). Superseded facts never coded. Coding never blocks the note; chips appear when
  codes arrive. As built: Stage A only.
- No clinician confirm step anywhere; object is backend-only: **no endpoint returns the ledger** (fact list,
  verbatim, value_json, original_value, candidates). Projections are readable (`GET /v2/encounters/:id/codes` =
  APPLIED codes anchored to note refs only).
- Generate/Stop path: read object → persist rx first → structured sections render before prose → prose with
  `[[rx:id]]` → deterministic section parser (no `validationNotes` LLM) → advice from live rx rows → reconciliation
  check. Existing generate route branches server-side (OQ4 resolved); client unchanged.
- Prompt rules (prompts.md, testable at output): notes write only given sections; empty section =
  **"No information recorded"**; NEGATIVE facts as denials ("denies chest pain"); UNCERTAIN stays hedged; English
  note regardless of consult language; drug names never retyped (only `[[rx:id]]`); unknown marker ids stripped,
  text kept; advice uses live rows, no diagnosis/prognosis. Extraction/merge/Stage B/labs/rx at temp 0; notes and
  advice may be > 0. Rx: Indian sig ("1-0-1", "SOS") kept verbatim; dose change → new dose + "increased from 5 mg
  this visit" in patient_notes; unstated field null, never default. Chip edit: rx/lab chips propagate everywhere;
  fact chips ask "everywhere, or just here?"; deleting a chip removes the reference not the prescription (reconciler
  flags prescribed-but-not-in-note); no-match term removes the chip. Note is never re-coded after generation.
- Ids: UUIDs exposed as `fct_` (facts), `prs_` (rx), `fcd_` (codes); never short ids (F11 collides with ICD-10).
### 3.2 Roles/perms
Doctors and PAs; no new permission strings; no role sees the ledger. Flag `notes_flow_v2`, default off, all plans.
### 3.3 Isolation/PHI/audit
Edge 5: workers key on `encounter_id`/session; mandated rapid A→B switch test, zero cross-encounter facts.
Audit: FACT_EDIT, FACT_SUPERSEDED(CORRECTION), CODE_APPLIED, CODE_SUPERSEDED, TERM_CORRECTION_LOCKED. No client
storage. Stage B is the only path where transcript context leaves the process (VeraTerm, Ekko VPC).
### 3.4 Gaps / overrides / non-goals
- Edge 6 overridden: V2 DOES write Usage (reserve-and-confirm at recording start) — not a bug.
- Visit-context extraction exists (non-goal struck). Edge 2 (PA_IN_PROGRESS → SUBMITTED_TO_DOCTOR) is pre-ADR-011.
- Non-goals: no ledger UI/facts panel; no clinician coding workflow; lab/diagnosis chips in prose not in v2 (rx only);
  no patient-scoped longitudinal store; no FHIR; no historical backfill.
- Workflow id is per session (ADR-011 §4); gap recorded 2026-09-01: nothing under `src/v2/sign-off/` signals
  `recordingStopped`.
- Rollback triggers: one silent wrong clinical value = P0, flag off same day; v1-fallback > 5%/24 h.

---------------------------------------------------------------------------------------------------
## 4. note-references-on-read

**Frontmatter:** done · owner gerrit · assignee empty · created 2026-09-06 · tier 1 · completed 2026-10-20.
Built: backend PR #1509 (`c42f7a6b`, 2026-09-07). plan.md has no status (plan file).
**What it is.** `GET /notes/get-notes/encounter/:encounterId?role=doctor&include=refs` returns resolved prose
(never raw markers) plus, per section, a span map so the web app can mount chips on the right words.

### 4.1 Shape and rules
`refs[]: {noteRefId, refType: RX|DIAGNOSIS|LAB (only RX emitted), refId, position (1-based), start, end
(UTF-16 code units, [start,end)), source: ROW|LAST_KNOWN, rowPresent}`.
- Without `include=refs`: response byte-identical to before. Unknown `include` value ignored (never 400).
- `value.slice(start,end)` equals the rendered text exactly; a failing span is dropped + counted
  (`v2_note_ref_map_dropped_total`, alarm at 1), never emitted. Spans ascending, non-overlapping.
- `refs: []` = no references; `refs` absent with include sent = map not computable this read (resolver failure or
  no-encounter path). Client must distinguish.
- Orphan marker → no span, no text. Name-matched ref (no marker) → no span; client ignores `/codes` chips with no
  span. Detached ref (marker kept, ref row deleted) → no span, counted `reason="no_ref_row"` (plan F3).
- Same rx twice → two spans, same refId, two positions, two noteRefIds. Pre-migration body → `refs: []`.
- LAST_KNOWN + rowPresent true = display_text mismatch (render normally); LAST_KNOWN + rowPresent false = removed
  row (only this case gets the struck-through "removed" treatment).
- Map valid only against the `value` it shipped with; after any save the client re-reads (never re-derives).
- Signed encounters (override): served from the frozen snapshot with a 6-field `SignedRef` and **no `noteRefId`**
  (no delete handle). App normalises both shapes (`note-fetch.api.ts`: `signed = !("noteRefId" in r)`).
- Chip delete: `DELETE /notes/ref/:refId` keyed on `noteRefId` (`tbl_note_ref.id`), not prescription id.
- Perf: 0 extra queries (measured 12 = 12), ≤ 10 ms p95 added on 200-ref note, ≤ 200 B/span (measured 186).
- Not-found/cross-tenant on this V1 route returns `200 {data: []}`, not 404 (plan F4) — known, not a bug.
- RBAC `note.view.self|org`, no new permission; `/codes` rides `visit.read.*` (pre-existing asymmetry). No flag.
- Isolation: map lives in the same per-encounter TanStack Query entry as the note; switch-patients test asserts no
  span from A applied to B. No new audit event, no new PHI path, no browser storage. Export/PDF never reads it.
- Spec non-goal "chip editing blocked": **the app now has chip editing** (`/v2/encounters/:id/codes/references/
  :referenceId/suggest` + PATCH, `features/notes/chips/edit/`), so that non-goal is history.
- OQ1 (marker round trip on prose save) belongs to note-editing; risk: a client saving resolved text flattens refs.

---------------------------------------------------------------------------------------------------
## 5. transcript-chunker

**Frontmatter:** done · owner/assignee gerrit · created 2026-08-12 · tier 1 · completed 2026-10-20.
**What it is.** Deterministic code (no AI) that cuts the final-token transcript into windows for extraction, inside
the per-session Temporal workflow. Backend only; no UI, no endpoints.
- **Chunker v2 (`CHUNKER_VERSION = 2`, 5 Oct):** close at sentence ends (`.` `?` `!` `।`, abbreviations like
  Dr./mg./b.i.d. excepted) once ≥ 40 tokens (first window 10); fallback 30 tokens past minimum at a segment
  boundary; hard cap 400 tokens; pause gap 2000 ms; 45 s cap only when segment times supplied (browser path never).
  Constants, not env. Original 1.5 s / 15 s / 45 s rules overridden.
- Stop / explicit pause / sign-off flush remainder with no minimum; silence → no window; pause length → zero
  windows; window_seq monotonic, gapless, once per encounter/session; resume continues seq.
- Payload ids + offsets only (no transcript text in Temporal). Final tokens only. Documents bypass the chunker
  (`source_kind: DOCUMENT`). Idempotent per `(encounter_id, window_seq)`. Same buffer → byte-identical windows.
- Pause endpoint: `POST /v2/encounters/:encounterId/recording/pause`.
- Isolation: rapid A→B switch → zero cross-encounter windows. No Usage rows. Missing Redis buffer → gap, V1
  fallback at generate if coverage short.
- Owed: golden-50 boundary calibration "not verifiable" (status log).
- **Tester relevance:** a spoken correction shows in the live note only after its window closes (~sentence end ≥ 40
  tokens); slow correction display is the documented trade, not necessarily a bug.

---------------------------------------------------------------------------------------------------
## 6. medical-object-schema (spec + plan)

**Frontmatter:** spec done · owner/assignee gerrit · created 2026-08-12 · tier 1 · completed 2026-10-20 · schema
frozen 2026-08-18 (PR #1415). plan.md says `in-development`, created 2026-08-18 (stale plan frontmatter).
**What it is.** The tables: `tbl_medical_fact`, `tbl_fact_code`, `tbl_note_ref`, `Prescriptions.fact_id`, plus
post-freeze `tbl_note_ref.display_text` (varchar 256), `tbl_lab_fact` (lab↔fact N:1 join), `clinical_context_id`
on facts, actor columns, allergies relation. Schema only; no endpoints/UI.
- Enums: FactType `SYMPTOM DIAGNOSIS EXAM_FINDING VITAL RX CURRENT_MED ALLERGY LAB_ORDER LAB_RESULT ADVICE SOCIAL
  OTHER` (prompts.md lists a larger draft set incl. HISTORY, PROCEDURE, PLAN, ADVICE_POINT, ADMIN, polarity
  UNCERTAIN, asserted_by ATTENDANT/DOCUMENT; the schema is authoritative); polarity POSITIVE|NEGATIVE; asserted_by
  DOCTOR|PATIENT|OTHER; confidence HIGH|MEDIUM|LOW; source_kind TRANSCRIPT|DOCUMENT; status
  ACTIVE|SUPERSEDED|RETRACTED; supersede_reason CORRECTION|REVISION; code_system SNOMED|ICD10|LOINC|RXNORM|
  INDIA_DRUG; code_status APPLIED|CANDIDATE|SUPERSEDED (APPLIED requires code+display, CHECK constraint);
  ref_type RX|DIAGNOSIS|LAB. Enums grow additively only.
- `tbl_note_ref` unique `(note_detail_id, position)` (not ref_id); derived data rebuilt on every note save;
  `display_text` makes it PHI-bearing (no logs, no analytics).
- FKs: fact→encounter RESTRICT; code→fact CASCADE; note_ref→note_detail CASCADE; rx.fact_id SET NULL;
  superseded_by NO ACTION. `deleted_at`/`deleted_by` added to encounter/patient.
- Deletion: UI delete = soft delete on visit/patient; facts invisible via non-deleted encounter join; restore keeps
  facts/codes/refs. Erasure = ops purge job (DPDP purge/defer, GDPR Art.17(3), HIPAA refuse + amend via
  CORRECTION supersede), PHI-free audit row; deferred (C1: must exist before `notes_flow_v2` for a real tenant).
- Deferred (⏩, owners backend lead): V1 hard-delete FK failure → 409 "visit has clinical facts; use soft delete"
  (never 500); delete blocked while a recording/workflow is active; read-path invisibility test.
- **Tester relevance:** deleting a visit that has facts on a V1 path may hit RESTRICT; expected 409, a 500 is a bug.

---------------------------------------------------------------------------------------------------
## 7. Reality check in `src/` (ekko-web-app, codex/v2-23-mobile-validation @ 849bf99)
| Piece | Found | Where |
|---|---|---|
| Sign-off sheet + sign | yes | `src/features/sign-off/` (sheet, api, hook, refusals, signability, patient-switch test); `GET /v2/encounters/:id/sign-off-sheet`, `POST …/sign-off` + Idempotency-Key |
| Sign off offered statuses | yes | `signability.ts`: raw status in IN_PROGRESS/PAUSED/PENDING_SIGN_OFF; COMPLETED → ALREADY_SIGNED |
| Ready for sign-off filter/count | yes | `visits/visit-status.ts` (filter sends PENDING_SIGN_OFF + SUBMITTED_TO_DOCTOR), `ready-count-chip.tsx`, `visit-sign-off-control.test.tsx` |
| Queue / batch | no | only mentioned in a test; not in contract manifest |
| PA "on behalf of" | yes | sheet subtitle "`<patient>` · signing on behalf of `<doctor>`"; entitlements `delegated_signing` |
| Addendum, SIGNED_WHILE_EDITING panel, `encounter.signed` push, legacy-signed line, "can't be verified" | **not found** | grep empty |
| Live note | yes | `src/features/live-note/` (session pin, projection, review flag), copy strings above |
| Finalise / continuous surface | yes | `features/notes/finalise/`, `note-surface.tsx` ("No note yet" asserted absent in test) |
| `include=refs` + spans | yes | `features/notes/editing/note-fetch.api.ts` (`params: {role:"doctor", include:"refs"}`) |
| Chips / Show codes / detach / chip edit | yes | `features/notes/chips/` (`/codes`, `/codes/references/:id[/suggest]`, `DELETE /notes/ref/:id`) |
| Contract manifest | has `sign-off`, `sign-off-sheet`, `live-note`, `live-note/session`, `live-note/review[/:factId]`, `/codes`, `/codes/references/*`, `/notes/ref/:refId`, get-notes (V1 + `/v2/notes/get-notes/…`), V1 `/encounters/sign-off/:encounterId` |

## 8. Test ideas that fall straight out of the specs
1. Sign as doctor (clean) → pill COMPLETED, sheet "Signed", editor read-only everywhere, export shows same text.
2. Edit a section in tab B after opening sheet in tab A → Sign in A → "This note changed — reload." + sheet re-reads.
3. Double-click / two tabs Sign → one signature, other shows already-signed as success.
4. Throttle/kill network mid-sign → "Couldn't confirm" → re-check → Signed or "Not signed. Nothing was changed. Try
   again."; retry must reuse the same Idempotency-Key (inspect request headers).
5. Sign during active recording → `RECORDING_IN_FLIGHT` copy; right after Stop → possibly `GENERATION_IN_FLIGHT`.
6. Switch patient A→B with sheet open/refused → no A banner/text/key on B (edge 29).
7. Roles: doctor (allowed), org admin / clinical staff / staff (no Sign off), PA linked/unlinked (blocked: PA cannot
   be invited on Free plan, V2-233), dual-role DOCADMIN on own vs others' visits.
8. Try every edit path on a COMPLETED visit (note, rx, vitals, labs, context, regenerate) → refused, no change.
9. Live note: headings render empty on template pick; HIGH-only facts; "N items pending review"; read-only line
   replaced at ready; same DOM nodes; template switch mid-consult re-renders; 3 failed polls → unavailable line.
10. Chips: Show codes off reads as prose; on shows chips on right words (incl. Tamil+English); edit prose before a
    chip then re-read; delete chip keeps the prescription.
11. PHI: no patient name/note text in sign-off/live-note URLs, toasts, console; no sign-off state in browser storage.
