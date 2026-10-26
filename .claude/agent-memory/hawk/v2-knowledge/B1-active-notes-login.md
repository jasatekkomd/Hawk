# B1 — Active packets: notes (collab, editing, templates, customization), login, enterprise, workspace deletion

Source: `/home/user/ekko-web-app/.ai/features/<slug>/` (read in full) + `plans/<slug>/` (skimmed).
Repo HEAD read: `codex/v2-23-mobile-validation` @ 849bf99 (merge of PR #81). Read 2026-10-26. No PHI, no credentials.
Precedence reminder: per `.ai/README.md` + ADR-018, **built behaviour on the baseline branch wins over spec text**;
every packet carries "As built on `ian-v2-lane` (verified 2026-10-20)" and many `~~struck~~ Overridden 2026-10-20 (ADR-018)`
lines. Test against the override, not the struck text.

| Slug | status | owner / assignee | created | tier | Built in V2 web? |
|---|---|---|---|---|---|
| realtime-collaboration | in-development | gerrit / gerrit | 2026-08-23 | 1 | **Backend only. Web client ABSENT** |
| note-editing | in-development | gerrit / gerrit | 2026-08-22 | 1 | Yes (Layer A + Layer B chips) |
| note-template-creation | in-development | anbuu / ian | 2026-09-08 | 1 | Yes, minus upload + instructions |
| note-customization | in-development | anbuu / ian | 2026-09-07 | 1 | Partial (overlay, lock, reset) |
| login-upgrade | in-development | Ramavigneshwaran P / Jasper | 2026-08-06 | 1 | Mostly (onboarding pages, OTP, invites) |
| enterprise-plan-tenants | **draft** (NOT a requirement) | ram / none | 2026-08-31 | 1 | No (targets V1 frontend) |
| workspace-deletion | in-development | Ian | 2026-10-22 | 1 | Yes (Settings > Workspace > Overview) |

---------------------------------------------------------------------------------------------------

## 1. realtime-collaboration (in-development, gerrit, 2026-08-23, tier 1)

**What it is.** Implements ADR-011 §3: on one encounter, presence roster, prose-section soft locks (advisory), live
save-granularity push over SSE, optimistic concurrency on entities (drugs/vitals/labs/facts never locked), literal-mention
broadcast, and an activity trail read from `audit_logs`. No CRDT/OT. Spec text says `/encounters/:id/collab/*`; **built
routes are prefixed `/v2/`** and the stream is **one multiplexed `GET /v2/collab/stream` per client** (ADR-018 override).

**Reality: backend `src/v2/collab/` built; web client absent.** grep of `src/` finds no `/collab` URL, no
`EventSource`/`ReadableStream` SSE client; only comments + `src/features/notes/editing/provisional.tsx` placeholders
("Anitha is editing", "Anitha changed this"). So every presence/lock/live AC below is **untestable in the web app today**
(API-only via api-dev2, if entitled). Gate: `notes_flow_v2` entitlement row (`collab.runtime.ts`); unentitled → 403.

### Key behaviours / numbers (testable at API level)
- Heartbeat `POST /v2/encounters/:id/collab/heartbeat` every **10 s** while screen mounted + tab visible; also renews held locks.
- Presence TTL **30 s** (3 missed beats). Redis key `collab:{tenantId}:enc:{encounterId}:presence:{userId}` →
  `{u,n,r,t,s,sec?}`; `s ∈ editing|viewing|away`; `sec` only while editing. Roster set `…:viewers` (1 h).
- `pagehide` → `navigator.sendBeacon` DELETE `…/collab/presence` (instant leave). Tab hidden **>60 s** → `away`; returns on focus.
- Roster shows **first name**, role, avatar, `editing <section>` / `viewing` / `away Nm`. Never surname, never values.
- Lock: `…:lock:{sectionId}` `SET NX EX 45` → `{u,n,tok,t}`. Claim on focus `POST …/sections/:sectionId/lock`.
  Conflict = **409 `section_locked`** `{holder:{user_id,first_name,role}, claimed_at}`. Renew = Lua CAS on token (never resurrects).
- Release: blur → immediate DELETE (CAS); save 2xx → immediate; idle **30 s** client (visual cue at **25 s**); server TTL **45 s**;
  badge shows "Dr. Priya — connection lost" once last beat > 45 s. Unmount releases all via sendBeacon.
- Override: same POST with `{"override": true}` — **every editor, no role gate, no delay, no confirm**. Publishes
  `section_lock_overridden`; audit `SECTION_LOCK_OVERRIDDEN`, `entity_type:'ENCOUNTER'`, `new_values:{section_id,from_user_id,to_user_id}`.
  Displaced user sees: *"Dr. Priya took over this section. Your unsaved text is kept below — copy anything you still need."*
  Draft kept in component memory only; their later save is refused by stale-write, never merged.
- **Server never refuses a write because of a lock.** Only sign-off freeze, EditGuards, or stale-write refuse.
- Entity optimistic concurrency: body `expected_updated_at` (ISO ms); `updateMany where updated_at=expected`; count 0 → 404
  (row gone) or **409 `stale_write`** `{error, entity_type, entity_id, current_updated_at, changed_by{user_id,first_name,role}, changed_at}` — no clinical value.
  **Web code actually uses code `ENTITY_STALE`** (`note-editing.types.ts`) — spec/code naming mismatch; contract-check it.
  Loser banner (inline, never modal): *"Anitha changed this to Calpol 650 a moment ago. Your change was not applied."* +
  **Keep theirs** / **Apply mine anyway**. **Never auto-retry.**
- Entity change event re-renders in place inside another user's held section: highlight **3 s**, chip *"Anitha · just now"*
  for **60 s** then decays to dot; cursor/scroll/typed prose untouched; no modal.
- Transport: fetch+ReadableStream with Bearer **access token in header** (never token in URL). `seq` per encounter; replay ring
  50 events / 120 s; `Last-Event-ID` reconnect; gap → single `resync` (client invalidates all encounter queries).
  Backoff 1→2→4→8→10 s cap ±20 % jitter; after **60 s** failing → poll `GET …/collab/state` every **10 s**.
- Event union (15 types): `presence`(every 15 s snapshot), `section_locked`, `section_released`, `section_lock_overridden`,
  `section_saved`, `entity_changed`, `literal_mention_flagged`, `facts_arrived`(counts only), `recording.started|paused|resumed|stopped`
  (dotted names are deliberate), `status_changed`, `encounter.signed` (`signature_id`, `signed_at`), `resync`.
  Unknown type → dropped (`unparseable_or_unknown_type`). Closed union; no free `data` field.
- Caps: publish ≤ **10 events/s/encounter** → coalesced `resync`; lock claim/release **10/min/user/section** → **429**;
  room hard cap **20** (21st → `collab_room_full`, still fully editable); design target 8.
- Literal-mention flag: event carries section ids only; client renders *"'Dolo' appears as typed text here — review the wording"*.
  Guard not built anywhere → ships with empty `section_ids`.

### Roles / permissions
Editors = assigned Doctor + PA linked via `DoctorPA` (claim/override). Viewers = Optometrist, Lab tech (roster only, claim refused
server-side). Admin/Staff/Org admin/Super admin: no surface, endpoints refuse. No new permission strings: stream/roster/heartbeat/trail
ride `visit.read.self|org`; lock ride `note.update.self|org`. Unlinked PA refused by same guard as edit. All plans; no plan gating.
Kill switch env `COLLAB_REALTIME_ENABLED` (default true); with it or entitlement off, all edits still work.

### Isolation / PHI / audit
Keys tenant-first; tenantId only from access-token claims; encounter resolved via tenant Prisma ext **before** key built →
cross-tenant id **404**, zero events. NULL-tenant encounter → `collaboration_unavailable` (spec says can't occur: NOT NULL).
Patient switch: SSE, Zustand slice, heartbeat, locks torn down on unmount; no module-level state (V1 AUDIT-01 class).
No browser storage of tokens/prose/events. Trail (`GET …/collab/activity`) shows names/actions/times only; real surfaced
actions: `RECORDING_STARTED/STOPPED`, `NOTE_SECTION_EDITED`, `PRESCRIPTION_UPDATED/DELETED`, `VITAL_UPDATED`, `LAB_UPDATED`,
`SECTION_LOCK_OVERRIDDEN`, `NOTE_SIGNED`, `NOTE_ADDENDUM_CREATED`, `CONTEXT_ATTACHED/DELETED`. Excluded: FACT_* merge rows,
`CONTEXT_EXTRACTION_FAILED`, presence/lock churn, reads, IPs. "Note generated" and "marked ready for sign-off" rows are owed (no source).
Trail copy e.g. "Anitha took over Plan from Dr. Priya · 12:35", "Anitha changed a medicine · 12:22".

### Hazards / edges / open
Section ids are UUIDs — a slug passes key/payload tests but silently writes no override audit row (`audit_unpersisted`).
Built-but-unwired history: libs existed with no route (all 404) and `collab-access.guard` selected non-existent `status` column;
`CollabFanout.revoke()` had no caller. Same user two tabs = one roster entry, both may hold locks. Sign-off deletes all locks.
`PENDING_SIGN_OFF` blocks nobody. Redis down → all unlocked, edits fine. Build status: (A) presence+trail and (B) locks built;
(C) entity concurrency → note-editing lane; (D) literal-mention deferred. Open Qs: Redis `maxclients`; ekko-sse-backend deployed?;
literal-mention guard owner; audit_logs index; retired-status labels; clinician first name in Redis (Manish+Gerrit, pre-pilot).
**V1 parity: none** (V1 has no presence/locks). Design (`plans/realtime-collaboration/design-sources.md`): Avatar + `.ai-chip--pa`
are real; lock badge, change-highlight motion, 3 encounter-presence tokens, avatar overflow "+3", two-action banner are DS requests.
Do NOT reuse `--presence-available` for "editing".

---------------------------------------------------------------------------------------------------

## 2. note-editing (in-development, gerrit, 2026-08-22, amended 08-23 / 09-08 / 09-09, tier 1)

**What it is.** Entity-aware editing of the generated note on the medical object. Bodies stored in marker form
(`[[rx:<prescription_id>]]`), resolved at every read; a chip edit changes the row once and every surface follows.
Prose stays free. Layer A (rx/lab/vitals edits, autosave, freeze, note surface) and Layer B (code chips, Show codes).
Built: backend `entity-edit.service.ts`, `edit-guards.service.ts`, `stale-write.filter.ts`; web `src/features/notes/editing/`,
`chips/`, `chips/edit/`, `history/` (Version History, restore — ADR-018 D08), `note-surface*.ts(x)`. Gate: `notes_flow_v2`
entitlement row; Layer B gate `terminology_coding` row. Stub: medical-fact chip "everywhere" (`StubFactEditClient`).

### Key behaviours
- Three edit kinds: (1) Rx/lab chip → applies everywhere, no prompt. (2) Medical-fact chip → prompt **"Change everywhere, or
  just here?"** (just here = detach to plain text). (3) Free prose → saved as typed, never machine-rewritten.
- Chip edit: pick from real candidates **or delete; no free typing** (2026-09-09). Unmatched term → chip removed, text kept as prose.
  Delete chip = removes reference, never the Rx row. VeraTerm down → "Suggestions unavailable", Delete only; Rx grid still saves.
  Chip editor copy seen: "Search vocabulary", "Type to search", "No match for “x”", "Remove this reference".
- Missing/inactive row → renders last-known `display_text`, never a raw marker or gap. Removed row = struck-through treatment.
- Human term edit sets `correction_locked` (merge agent can't overwrite); survives Regenerate.
- Advice goes **stale**, never auto-regenerates; banner + "Update advice" ("Updating…").
- Regenerate confirm: **"Regenerate this note?"** + "Your typed text will be replaced. Your drug and vitals corrections are kept."
- Autosave: per section, debounce **1.5 s idle or blur**; entity edits commit immediately. Indicator states (code):
  "Unsaved changes" · "Saving…" · "Saved HH:MM" · **"Not saved — this section changed"** · "Not saved — the coded terms changed" · error msg.
  After **2 failed retries** → explicit error state, text stays. Connection drop → retry once then "couldn't save — copy your text".
  (Copy contains em dashes: violates ekko-ds "no dashes in UI copy" rule — flag.)
- Note surface: exactly one of **Live draft / Generating / Generated / Signed** via single selector (`note-surface-state.ts`);
  others not mounted. Live draft = recording lease held → saved sections read-only. Completed generation replaces streamed prose.
  **No `#`/markdown ever on screen** (headings from format names; defects counted `data-heading-defects`).
  No DS toolbar control without a handler (no Dictate/Customize/Undo/Redo/Copy from NotesToolbar); but `NoteStyleButton` and
  `NoteHistoryButton` ARE mounted (ADR-018) — do not report them as violations.
- Sign-off freeze wins over in-flight autosave: "this note is signed", text stays to copy, body byte-identical.
- Sign-off must resolve markers; failed resolution refuses signature (never signs raw markers).

### Wire / API (web calls observed)
`GET /v2/notes/get-notes/encounter/:id` (camelCase `noteSections[]`), `PUT /notes/update-note`, `PUT /prescriptions/update-prescription/:id`,
`PATCH /prescriptions/delete-prescription/:id`, `/vitals/update-vital/:id`, `/labs/update-lab/:id`, `/notes/ref/:refId` (detach),
`/v2/encounters/:id/codes`, `…/codes/references/:ref/suggest`, `/notes/:noteId/versions[/:id[/restore]]`.
Refusal codes (zod, `note-editing.types.ts`): `SECTION_STALE {note_detail_id,current_updated_at,changed_by_user_id}`,
`ENTITY_STALE {entity_type,entity_id,current_updated_at,changed_by_user_id,current_value?}`, `SECTION_HAS_REFERENCES`,
`SECTION_REFS_INVALID`. Token = row `updated_at`; no version column. 404 for missing/cross-tenant encounter; 403 unlinked PA;
409 on signed (`COMPLETED`).
**Known gaps (plans/note-editing/plan.md §8-9):** note read historically lacked `updatedAt` → saves token-less → server LWW 200.
Client mitigations: `stale-check.ts` read-before-write CAS on section text + **read-after-write confirmation** (a 200 the note
doesn't show = refused, "Not saved — this section changed"); a 2xx carrying a coded refusal = refusal; failed confirm read ≠ refusal.
Remaining: code-less 409 inside race is classified as "This note is signed" (wrong copy) — test two-window race.

### Roles
Editors: assigned doctor + DoctorPA-linked PA at **every status before sign-off** incl. `PENDING_SIGN_OFF` (no status gate, ADR-011).
Unlinked PA → 403 on every edit endpoint (prose, entity, detach, delete). Admin/Staff/Optometrist: no editing surface.
Permissions: `note.update.*`, `prescription.update.*`/`delete.*`, `vitals.update.*`/`vital.upsert.*`, `lab.update.*`. No new strings.
**Known bug (note-customization as-built): PA link check compares `contact_id` with user id → linked PAs get 403.**

### Isolation / PHI / audit
No note content (incl. unsaved) in any browser storage. Encounter switch mid-edit carries nothing over (compliance AC).
Audit: `NOTE_SECTION_EDITED`, `PRESCRIPTION_UPDATED`, `TERM_CORRECTION_LOCKED`, `NOTE_REF_DETACHED`, `SECTION_LOCK_OVERRIDDEN`,
`ENTITY_WRITE_REJECTED_STALE` — ids only. `tbl_note_ref.display_text` now holds clinical text (PHI). Metering untouched.

### Hazards / edges / non-goals
Edge 3a: lock service unavailable → sections unlocked, stale-write only (this IS the shipped mode). Edge 21: entity change
re-renders inside held section. Edge 26/27/29/30 (`refs` absent ≠ `refs: []`, no retry loop). Non-goals: no fact-ledger UI, no
coding queue, no lab/diagnosis refs in prose, no CRDT/cursors, no post-sign-off edit, no V1 change. Open: template control hidden
during recording (`{!sessionLive && …}`); collapsed section in PDF; reconciliation surfacing.
V1 parity bar: `ManageNotes.tsx`, `AutoSaveStatusIndicator` (syncing / saved-at) — autosave must not regress.

---------------------------------------------------------------------------------------------------

## 3. note-template-creation (in-development, anbuu / ian, 2026-09-08, rev 09-17, tier 1)

**What it is.** Clinics/doctors build, share and manage note templates (named ordered prose sections), governed by a tenant
policy. Built 7–15 Oct on `ian-v2-lane`: backend `src/v2/note-templates/` (11 routes), web `src/features/note-templates/`
(library, `template-editor.tsx` via `NewNoteTemplateSheet` adapter, `template-menu.tsx`), Settings → Note Templates (`/settings/note-templates`).
**Deferred:** upload/extraction (AC05–09, 20, 38–39); **raw templates and non-empty section instructions are refused**
`503 TEMPLATE_INSTRUCTION_REVIEW_UNAVAILABLE` (AC02, 10, 41) — do not report as a bug.

### Policy matrix (`tenant_context.note_template_policy`, default `CLINIC_LOCKED`)
| Policy | Doctor / PA | Admin / Org Admin |
|---|---|---|
| **Clinic decides** `CLINIC_LOCKED` | pick, favourite, style only; create/edit/publish/archive → `TEMPLATE_POLICY_LOCKED`; pencil + "New Note Template" absent | create, edit in place, publish team, archive, set clinic default |
| **Doctors may create their own** `DOCTOR_FREE` | create `self`, edit/archive own, publish `team` | same + archive anyone's team template |
Staff / super admin: no access (403). Front desk never reaches it. Policy flip audited (`NOTE_TEMPLATE_POLICY_CHANGED`), existing templates stay usable.

### Key behaviours / limits
- Fields: name ≤**80**; Note Structure (Structured default / Raw); Visibility **Only me** (`self`) / **My team** (`team`) — "Whole clinic"
  dropped; `ekko` scope not authorable; Specialty (Applies to) label, default **"All specialties"**, store lowercase `Specialties.name`.
- Sheet order per section: **Instruction → Format → Detail** (drawer differs; do not unify). Extracted column fixed:
  Vitals · Prescriptions · Labs · Patient advice (not addable/removable).
- Reserved names (case-folded, trimmed): medication(s), medicine(s), drug(s), prescription(s), rx, lab(s), investigation(s),
  test(s), vital(s), vital signs, advice, patient advice → inline *"Ekko already captures this — it appears as the <card> table"* + server refusal.
- Caps: **100 active templates/tenant** (archived + ekko don't count; 101st refused **before sheet opens**), **30 sections** (31st refused,
  limit named), section name ≤60, instruction ≤500, raw ≤2000, upload ≤10 MB. Other codes: `DUPLICATE_SECTION`,
  `INVALID_SECTION_REFERENCE`, `INVALID_SPECIALTY`.
- Copy-on-write: owner edits own `self`/`team` in place; Admin edits clinic template in place; non-owner → fork to `self` with
  `derived_from` and notice; `ekko` globals fork for everyone. Fork name collision → suffix "Cardio follow-up (2)".
  Duplicate name within one owner's self set → rejected; across owners allowed.
- Unshare team→self by owner/Admin; defaults fall down chain: user default → tenant default → Ekko default → first available. Never empty.
- Archive = soft (`archived_at`); leaves every picker/filter incl. Favourites (pref row kept); notes render from `applied_style` snapshot;
  open visits unchanged (pinned at pick). Empty Favourites group shows its own empty state.
- Structured ↔ Raw switch preserves both sides. Preview Note = 560 px A4 page, placeholders only.
- Picker (`#ntplMenu`): groups Favourites / Created by You / Created by Team / Defaults by Ekko; Sort Default / Name A–Z / Z–A;
  Created by Everyone/You/Team/Ekko; row star, pencil (only if editable), ⋯ (Set as default / Delete). Pills: Customised, Clinic, Ekko, Default.
  Picker filters by visit doctor's specialty, shows All-specialties always, others under collapsed "Other".
- ONE default: picker "Set as default" and drawer footer "Set as default" write the same `UserNoteTemplatePref.is_default`.
- Desktop only for authoring; mobile selects only.

### API (web)
`GET/POST /v2/note-templates`, `POST /v2/note-templates/search` (**search text in body, never query string**), `GET/PATCH /v2/note-templates/policy`,
`GET/PATCH /:id`, `POST /:id/archive`, `PATCH /:id/preference`, `GET/POST /:templateId/style`, `/v2/encounters/:id/note-template`;
durable pin via `POST /v2/encounters/:id/live-note/session`. Permissions: `note_template.read.org/create.self/update.self/archive.self/publish.org`,
`note_template.manage_clinic.org`, `note_template_policy.update.org` (+ Org Admin holds `note_style.*.self`). Must stay distinct after S-10 suffix stripping.

### Isolation / audit / hazards
Tenant B can't read/edit A's templates; sees own + ekko globals; pinning foreign template refused. Ekko globals discriminated by
`tenant_id IS NULL`, **never "owner IS NULL"** (departed doctor's team templates are ownerless but tenant-scoped).
Audit: `NOTE_TEMPLATE_CREATED/_UPDATED/_VISIBILITY_CHANGED/_ARCHIVED`, `NOTE_TEMPLATE_POLICY_CHANGED`, `NOTE_TEMPLATE_EXTRACTION`.
No browser storage of in-progress template. Upload compliance (consent basis, DPA scope) open with counsel. Data model exceeded spec:
`note_header.note_type_id` / `note_detail.note_section_id` nullable + snapshot trigger. Plan note: late responses on patient/workspace
switch must be guarded; network failure must not fall back to an empty template list. Test data: Ian left "Local template test" locally.

---------------------------------------------------------------------------------------------------

## 4. note-customization (in-development, anbuu / ian, 2026-09-07, rev 09-17, tier 1) + discovery-brief.md

**What it is.** A doctor's personal style overlay on a template (detail level, per-section format, order, sections), via the
Customize Note Style drawer (`#cnsDrawer`, 760 px = 464 editor + 296 rail). Partially built: `note-style.{controller,service,schema}.ts`,
`tbl_note_style_overlay`, web `src/features/note-templates/note-style.tsx` mounted as `NoteStyleButton` in `visit-consultation-tab.tsx`.

### Key behaviours (as built + spec)
- **Locked while recording and while generating** (409; ADR-018 D04) — instant re-layout preview struck. UI copy (code):
  *"Customization is locked while recording, editing, generating and after sign-off."*
- Detail level Brief / Detailed / Super Detailed, **default Detailed**; un-overridden section must draft at Detailed (not Brief).
  Tile copy must describe length only (current DS "1 - 2 lines per section. Essentials only." etc. must change).
- Format Bullet / Paragraph / Numbered; detail override editable; **free-text instructions disabled/refused** (D12).
- One removal control: **trash** (eye removed, no `hidden` key, no per-note hide). Re-added library section restores defaults.
- Custom sections: name ≤60; reserved names refused (same list as templates); library sections cannot be renamed / added twice.
- Save → personal overlay; if note exists, confirm *"Regenerate this note with your new style? Your typed changes will be replaced…"*;
  decline = overlay saved, prose untouched. **Reset to Default** deletes overlay (audit `NOTE_STYLE_RESET`), clears pill, offers regen.
  **Set as default** footer switch = same record as picker. Client checks: >30 sections → "Use at most 30 sections."; name →
  "Give every section a name of up to 60 characters."
- Customised pill only on that doctor's account; colleague unaffected. Clinic-added section reaches doctor at Detailed/Paragraph;
  clinic-removed section drops tweaks silently.
- `CLINIC_LOCKED` + Team template: trash, rail, custom-section entry disabled with *"Set by your clinic"*; level/format still save;
  server refuses section-list change (`TEMPLATE_POLICY_LOCKED`).
- Shape pinned at pick in `Encounter.applied_style`; `NoteHeader.applied_style` = style used at generation. Template switch re-pins;
  orphan facts under read-only "Unsectioned".
- Regen failure: 2 retries then section keeps previous content + inline failure bar with reason + Retry (ADR-015: failure ≠ empty).
  Idempotent on `(note_id, section_ref, style_hash)`. Re-draft creates a note revision (Version History restore = durable undo,
  records who wrote replaced prose). Style read fail at Stop → defaults + `v2_style_read_failed`.
- Signed note: Customize + refresh hidden, endpoints 409. Per-section refresh NOT yet verified built.
- Roles: Doctor + linked PA (own overlay); encounter doctor's overlay applies when PA drafts. Admin/Staff no styling.
  Permissions `note_style.read.self` / `note_style.update.self`. **Known bug: linked PAs get 403 (contact_id vs user id).**
- Audit `NOTE_REDRAFT` (actor, encounter, section, trigger save/refresh/reset/template-switch), `NOTE_STYLE_SAVED` (no payload).
  Overlay rows tenant-scoped; deleted with user; `applied_style` retained with record. No browser storage.
- Schema: overlay carries extra `key` (UUID), `sourceName`, `base` — a strict schema per spec text breaks overlays.
- Brief: verdict "Build as configurable default"; phases A style → B templates → C upload. Prototype `NL_EXTRA` negatives must not port.
- Open: who specs Version History; optometry drawer; RBAC strings.

---------------------------------------------------------------------------------------------------

## 5. login-upgrade (in-development, owner Ram, assignee Jasper, 2026-08-06, tier 1)

**What it is.** Rebuild of 5 auth journeys: sign up, log in + pick workspace, invite (accept/decline), forgot password (in-app OTP),
workspace switch; one identity across many workspaces. Process flows (mermaid in spec) are binding.
Built: `src/features/onboarding/` (~60 files), `RequireAuth`/`RequireWorkspace`/`RequireLegalAcceptance`, email OTP (Redis,
`/auth/send-otp`, `/auth/verify-otp`), invites as pending `tbl_user_details` rows (`POST /userdetails/invite-user`, `user.create.org`,
rate-limited), resend (`POST /userdetails/resend-invite`: delivery failure keeps pending row, **503**, never recreates Auth0 user/seat),
`GET /userdetails/my-workspaces`, `/userdetails/invites/:userId/accept|decline`, create-workspace, `/v2/settings/profile/complete`.
**Not built:** `WorkspaceInvite` model + 48 h expiry/decline lifecycle, `EmailOtp` table, `/v2/auth/*`, `LoginEventType` extension.
`current_user_id` **kept** (B-2 fixed by ownership check; web `lib/api/client.ts` appends it from `active-workspace` on every call).

### Journeys / testable rules
- Signup: email → 6-digit OTP → (only then) "Tell us about yourself" (first, last, phone, role Admin|Doctor; Doctor adds registration
  no., free text) → create password (**8+, 1 upper, 1 lower, 1 number, 1 special**) → pending invites? else **mandatory** setup
  workspace (name, logo, clinician count) → optional Invite team (only "Skip for now") → All done.
  Role picker = **Admin / Doctor only** ("Others" withdrawn 2026-05-06; PA/Staff have no self-signup). Doctor ⇒ doctor+org_admin; Admin ⇒ org_admin.
- Signup email (code `lib/signup-email.ts`): blank → **"Enter your work email"**; malformed → **"Enter a valid email address"**;
  known typo → "Enter a valid email address. Did you mean @gmail.com?". Typos: gmial/gamil/gmai.com, outlok, hotmai, yaho, and
  `(gmail|googlemail|outlook|live|hotmail|yahoo|msn|aol|icloud|protonmail).(co|con|cmo|comm|comn|cpm|cm|om)`. Must allow
  yahoo.co.uk, yahoo.fr, hotmail.co.uk, custom `.co`/`.health`. Max 254. Same rules server-side (DTOs).
- Profile step (code): "First name is required." / "Last name is required." / phone error / "Select your role." /
  "Medical registration number is required."; focus first invalid; `aria-invalid` + description. (Design oracle in memory says
  "Enter your first name" etc. — copy mismatch to check.) Doctor→Admin removes reg field + error.
- Verify screen: "Sending your verification code…" while pending; send failure → Resend; "code sent" only after SES acceptance.
- OTP: 6 digits, single use, hashed, **10 min**, **5 attempts**, resend invalidates old; RateLimitGuard reused
  (`/auth/forgot-password` 3/hr/IP 1 h block; `/auth/login` 5/5 min 15 min block; `/auth/signup` 3/hr/IP — NAT watch item).
- Public requests (check-email, OTP, signup, reset) use a client **without stale token or workspace**; expired login must not block them.
- `requiresProfile` (server-derived) routes to profile; setup-workspace direct nav checks it and fails closed. Repair path:
  Account settings "Complete your profile in this workspace" → `/onboarding/repair-profile` → `POST /v2/settings/profile/complete`
  (revision-checked, no workspace created, roles unchanged).
- Login: **Auth0 Universal Login redirect only** (no ROPC/no password POST to Ekko); Google via `connection:'google-oauth2'`.
  0 workspaces → setup (Doctor/Admin); exactly 1 + no pending → auto-enter; else Pick a workspace (open/accept/decline/create
  [Doctor & Org Admin]). Stale/deleted selected membership is rejected, never falls back to another workspace.
- Invite: Org Admin → any role (max **2 Org Admins**); Doctor → PA/Staff per spec but **built gate is `user.create.org` (Org Admin
  only)** due to S-10. Validations: already member ("user already exists"), already pending, admin cap, seat unavailable.
  Paid seat Doctor only. Landing shows workspace · Joining as · Invited by · member count. Accept adds to list, **no auto-entry**.
  Doctor-sent PA invite auto-creates DoctorPA in that tenant. Existing user → new `(email,tenant)` row, no new Auth0 identity.
  Double accept idempotent ("already accepted — open it from your workspace list"). Bulk invite cap **50**, per-row results.
  Duplicate workspace name → "This workspace name is already in use."
- Forgot password: unknown email → *"We couldn't find an account with this email address. Please check for typos, or sign up to
  create a new account."* + Sign up link; Google-only → "You signed up with Google — use Sign in with Google." (no code);
  **existing sessions stay alive** after reset (flow diagram says invalidate: spec text, Ram's decision, wins).
- Workspace switch / non-member target → **404** (not 403; flow diagram says 403 — spec text wins); client hard-resets all tenant
  state (queries, patient data). Removed mid-session → 401/404 → back to pick-workspace.
- Google signup: only auto-verified email proceeds; otherwise revert to signup, nothing created. Same email = same account.

### Hazards / known issues (spec + plan)
- `postSignupOnboarding` "other" branch still live via API: unauthenticated-role, untransacted destructive unwind (deletes user row,
  tenant, Auth0 user, then lead) — **destructive; do not probe on shared env without Jasper's sign-off.**
- Plan: Auth0 `cacheLocation="localstorage"` + refresh tokens (`offline_access`) — refresh token in localStorage (XSS exposure);
  active workspace in **sessionStorage** (`lib/auth/active-workspace.ts`) — check logout clears both. Earlier bug: reload bounced to
  /signup (memory notes ~1 in 3 logins still land on /signup). `getTenantByEmail` once returned only one workspace (tenant-scope
  leak, fixed with `runWithoutTenantScope`). Unordered `findFirst` → undefined workspace for multi-tenant users historically.
- Non-goals: MFA, other SSO, SCIM, invite revocation (`REVOKED` unused), leave-workspace, patient-portal auth.
- Open: workspace-context mechanism; multi-org doctor count; error catalogue never produced; compliance gate outstanding.
- Audit: auth events → `LoginEvent` (enum extension not built). OTP never logged; no email/OTP in URLs (compliance condition).

---------------------------------------------------------------------------------------------------

## 6. enterprise-plan-tenants (**draft** — NOT a requirement; ram, 2026-08-31, tier 1)

What it would be: `Tenant.billing_mode STANDARD|ENTERPRISE` (super-admin set, audited, forward-only), Choose a Plan replaced by
"Enterprise · Annual · 12 seats · renews 31 March 2027 / To add seats, reach out to Ekko [Contact us]", plan + add-on purchase endpoints
refused, super-admin seat provisioning (MONTHLY|ANNUAL, Cashfree ref mandatory + idempotent, period end in tenant TZ), derived
**Unassigned** doctor (no active License): read-only, sign-off allowed only on already-billed encounters, writes 403 *"No seat assigned.
Contact your organisation admin."* (distinct from quota), PA writes on Unassigned doctor's encounter refused, in-flight recording completes.
**Targets V1 frontend (`Ekko-Frontend-react-ts`), not V2.** Nothing in V2 `src/` (no `billing_mode`, no "No seat assigned").
Compliance gate not run; many `[VERIFY]`s. Use only as background; do not file V2 bugs against it.

---------------------------------------------------------------------------------------------------

## 7. workspace-deletion (in-development, Ian, 2026-10-22, tier 1)

**What it is.** Org admin permanently deletes the selected workspace and its data (Ian's decision 2026-10-22), plus existing-profile
recovery (see login-upgrade repair path). Built: `src/features/settings/workspace-delete.tsx` in Settings → Workspace → Overview.

### Behaviours (spec + code)
- Visible only if `GET /v2/settings/workspace/deletion` → `{canDelete:true}` (active org-admin assignment on current membership).
  Creator identity alone / generic settings permission confers nothing. Card copy: "Permanently delete this workspace and its data.
  All members will lose access. This cannot be undone." Button "Delete workspace".
- Dialog "Permanently delete {name}?" — "Patients, visits, notes, files, settings and memberships in this workspace will be permanently
  removed. Your login and other workspaces stay available." Checkbox "Permanently delete workspace and all its data" + text
  "Type **DELETE <NAME UPPERCASED>** to confirm" (e.g. `DELETE MAYO`). Submit "Permanently delete workspace" disabled until both;
  exact, case-sensitive, untrimmed match (`name.toUpperCase()` — check names with spaces, lowercase-only, non-ASCII/ß, Turkish i).
  Esc/outside click blocked while pending.
- `DELETE /v2/settings/workspace` body `{confirmation, revision, permanentlyDelete}`; **no client tenant id**. Server rechecks DB role,
  revision, phrase, permanent flag. Returns pending; on success web cancels queries, `clearActiveWorkspace()`, `queryClient.clear()`,
  navigates `/onboarding/pick-workspace`, toast "Workspace permanently deleted" or "Workspace deletion started. Access is removed while
  cleanup finishes." Error → `role="alert"` with API message.
- Disables workspace + all memberships immediately; scheduler retries every **30 s**; storage failure keeps disabled workspace +
  marker (never reported complete). DB hard-deleted in one transaction after storage cleanup; unowned incoming reference blocks
  before destructive cleanup. Auth0 identity + other memberships preserved. V2 guard rejects removed memberships (no silent switch).
- Preconditions: active autopay cancelled first; active recording/upload, Temporal work, imports, export dispatch must finish;
  queued exports/appointment messages cancelled. Cloud purge needs `EKKO_APP_VERSION=V2`, `EKKO_ISOLATED_V2_AUDIT=true`,
  `V2_WORKSPACE_STORAGE_PURGE_ENABLED=true`. Redis cleanup by exact UUID tokens, never global flush. Logs: opaque ids only.
- Deployment pending Ian's command (as of spec). **Destructive: never run against TEST10 or shared data; only a throwaway synthetic
  workspace, with Jasper's explicit OK.** Test denied path with doctor/non-admin roles (card must be absent and DELETE refused).
- Design flags: native `<input type="checkbox">` (ekko-ds Checkbox exists) — conformance check.

---------------------------------------------------------------------------------------------------

## Cross-cutting test notes
- Patient-switch isolation tests owed: collab (unmount teardown), note editing (no unsaved buffer/chip state carried), templates
  (late responses after patient/workspace switch), workspace switch/delete (query cache cleared).
- Copy/design flags found in code: em dashes in autosave states ("Not saved — this section changed"); `title="Version history"`
  tooltip in `notes/history/note-history.tsx` (should be `data-tip`); native checkbox in workspace delete.
- Contract mismatches to check with `npm run contract:check`: collab `stale_write` (spec) vs `ENTITY_STALE`/`SECTION_STALE` (web);
  collab routes `/v2/…`; note read must carry `updatedAt` for section token.
- Draft packet (enterprise) is not a requirement; struck lines are not requirements; ADR-018 overrides win.
