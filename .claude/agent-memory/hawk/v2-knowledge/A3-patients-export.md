# A3: Patients, Export/Share, Reports, Rx drug names, Search compliance, Staff/Admin homes, Left panel

Source: `/home/user/ekko-web-app/.ai/completed/archive/<slug>/` (all `status: done`, `completed: 2026-10-20`,
archived at baseline `ekko-coreService-nodejs@74bbfa39 · ekko-web-app@6c1c226 (ian-v2-lane, 2026-10-15)`; app-dev2
also runs an unpushed intake/booking delta). Every packet opens with a **"What changed in the build"** block and
"Overridden 2026-10-20 (ADR-018)" strikethroughs: **those overrides beat the original spec text**. Per `.ai/README.md`,
built behaviour on the baseline is the record. Divergence from a spec is a question to raise, not automatically a bug.
Reality check run on `codex/v2-23-mobile-validation` @ `849bf99` (read-only grep, app not run).

---------------------------------------------------------------------------------------------------------------
## 1. patient-management (Patients module)
**Frontmatter:** done · owner rama · tier 1 · created 2026-08-27 · completed 2026-10-20. Shipped from a `draft` spec.
**What it is:** the `/patients` screen: a roster (search, sort, "+") plus a 6-tab detail shell (Patient Info, Visits,
Measurements, Medications, Labs, Documents) rebuilt on the V2 stack (V1 `PatientDesktopViewLeftSidebar` /
`PatientDetailsDesktopView` is parity reference only). The highest-density PHI surface outside the consult.

**As-built deltas (top block):** routes `/v2/patients/:id/{visits,measurements,medications,labs,documents,archive,restore}`
+ `DELETE /v2/patients/:id`; extra permission `patient.restore.org`; `NoteSignature.patient_snapshot` **NOT added**
(so signed-header snapshot AC is unbuilt); Clinical Flags is now an **editable allergy record** (`src/v2/allergies`,
migration `20260912000000`; add / record-no-known / confirm / mark-inactive in `patient-allergies.tsx`); web patient
edit ignores parts of tenant intake policy (open). Roster accepts both `phone_or_name` and `search` (do not rename).

### Key behaviours (testable)
- **Roster:** 20 rows, keyset cursor (sort key + `patient_id` tiebreak), virtualize >~100 rows. Sort three-way:
  Recently added / Name A–Z / Name Z–A; **default Recently added at every login session**; persisted only in
  `sessionStorage` key `patient_list_sort`, cleared on logout. Search matches name, phone, `patient_code`,
  `external_id_1` by **prefix**, server-side, **debounce 250ms** (V1 500ms), in-flight request cancelled per keystroke
  (no out-of-order results). Non-Latin stored vs Latin typed: no transliteration (edge 1).
- **Empty copy (verbatim, must differ):** "No patients yet." (zero patients) vs "No patients match this search."
  (zero matches). Roster load failure = retry state distinct from both (edge 12).
- **"+" by role:** Doctor/PA → **New Patient** (gated `patient.create.*`); Front desk → **New Visit** flow (visit drawer
  with patient pick step). Label and behaviour from the same role check.
- **No duplicate detection** on create: decided (Gerrit 2026-09-10), edge 17. Two records for one human = accepted.
  Do NOT file "no duplicate warning" as a spec violation (it is a product decision; Hawk filed V2-71 anyway, framed as risk).
- **Open patient:** header (name, UHID, photo/initials) paints **immediately from the roster row, no request**, never
  moves. Only the active tab fetches. Patient Info **prefetched on row hover and keyboard focus** (requirement).
  Skeletons not spinners; CLS < 0.1. Perceived: row click → header < 100ms; tab switch → skeleton < 100ms.
- **Paging:** Visits 20 cards keyset newest first; Medications/Labs latest **10 date-groups** + explicit "Load older"
  (no infinite scroll); Documents 24 cards, lazy thumbnails; Measurements grid = latest reading per measure, Graph
  View fetches history for one measure on demand.
- **Patient Info:** summary card (avatar, name, Total Visits / Upcoming tiles, Patient UHID = `patient_code`, ABHA status,
  Last visit). **Upcoming = `NOT_STARTED` with a future scheduled date only** (edge 21); abandoned visits count in Total.
  Basic Info: Name, DOB, Age, Gender, Blood Group. Contact: Mobile Number, Email, Address, District, State, PIN, Country.
  Address = **five independently labelled fields**. Mobile = **ONE visible field** with searchable country-code dropdown
  inside, writes `phone_country_code` + `phone_number`. **Per-card Edit/Save/Cancel** (Basic and Contact separately).
  Gender = dropdown over real `Gender` enum. Blood Group: "Not recorded" when NULL, never blank. Age: DOB+Age shown →
  computed read-only; Age without DOB → editable. Blank fields = clickable placeholder text. ABHA Number = **"Not linked"**
  always (never shows `external_id_1/2`).
- **Photo:** photo everywhere an avatar is drawn; none → initials coloured by DS stable name hash. Upload/replace/remove
  with crop on summary card, gated `patient.update.*`.
- **Visits tab:** card = title, date/time/duration, doctor (from list join, never per-card fetch), status pill.
  Client-side search covers loaded pages only (non-goal: full-history search). Completed visits: Summary and Notes
  ("Simplified", **never "SOAP"**) toggle panels, mutually exclusive, each with Copy. "Go to visit →" opens drawer
  (Context for upcoming, Consultation for completed); drawer drops its own Documents + Patient Info tabs, Doctor/PA get
  a Measurements tab; drawer footer hidden.
- **Status groups (edge 20, 10 seeded statuses):** Signed (`COMPLETED`,`SIGNED`) read-only + Summary/Notes;
  Settled-unsigned (`PENDING_SIGN_OFF`,`SUBMITTED_TO_DOCTOR`,`PA_PAUSED`,`PAUSED`,`NOT_STARTED`) render normally,
  `NOT_STARTED` no content sections; In flight (`IN_PROGRESS`,`PA_IN_PROGRESS`,`GENERATING_NOTE`) "in progress" pill,
  Summary/Notes **hidden not empty**, no live update; **Unknown status → raw string in pill, content hidden, never crash**.
- **Measurements:** Vitals 10-tile grid (Temperature, Respiratory Rate, Blood Pressure, Heart Rate, SpO2, Random Blood
  Glucose, Height, Weight, BMI, Pain Score) + Grid/Graph toggle; pill anchors scroll, don't filter. Graph plots real
  history; 1 value → single marker; 0 → **"No vitals recorded yet."** and toggle hidden (edge 8). X-ray = always empty
  state (no data source).
- **Optometry gate (edge 23, fails OPEN):** render only if patient HAS optometry data AND viewer is Optometrist, Doctor
  with `specialty='ophthalmology'` (lowercase stored value), PA linked via `DoctorPA` to such a doctor, or Doctor/PA whose
  specialty is unknown (NULL or contact link missing). Recorded non-eye specialty hides it. Never an empty Optometry
  section. Same rules in the Visits-drawer Measurements tab. 6 test cases + "absent when no data" case.
- **Medications/Labs:** read-only, date-grouped, Copy + Download per group; **Download = PDF and Word (.docx) only**.
  Meds columns: Drug Name (`drug_name`, `brand` secondary line), Dosage (`dose`), Frequency, Duration (new nullable
  cols; pre-migration rows blank, not error), SIG, Manufacturer (same `brand` value: decided, not duplication bug),
  Patient Notes. Labs: Lab Name, Notes, Date Ordered. `COMPLETED`/`SIGNED` groups have no edit affordance.
- **Documents:** shared docs engine scoped to patient (search, filter, sort, Capture, Upload). Responses must not
  contain `s3_key` anywhere (edge 22).
- **Archive vs Delete (edge 18):** Archive any patient role may update: `isActive=false`, hidden from roster,
  reversible by Org Admin, audited, `patient_code` never reissued. Delete refused at ≥1 Encounter with inline message
  naming the count + offering Archive; allowed + audited at 0. Neither cascades.
- **Signed-header snapshot (edge 19):** spec'd but column not added → expect live values in signed notes (known gap).

### Roles / permissions
Seeded default matrix (tenant-overridable): Org Admin, Doctor, PA = all 6 tabs; Optometrist = Info, Visits,
Measurements; Staff (front desk) = Info, Visits. New strings: `patient.medications.read.self/org`,
`patient.labs.read.self/org`, `patient.measurements.read.self/org`, `patient.documents.read.self/org`. Info =
`patient.read.*`; Visits = `visit.read.*`. Roster actions on `patient.create/update/archive/delete.*` (+`patient.restore.org`).
Tab strip renders from **effective grants**, tab without grant is **omitted** (not disabled/empty). Direct API without
grant → 403. Granting the new strings must not change consult behaviour (front desk still sees Rx/labs in consult).
Custom tenant roles hold none of the 4 until granted. **Never verify RBAC as `super_admin`** (bypass at
`authorization.guard.ts:116`).

### API
`GET /patients/:id` (V1-era, audited); V2 web uses `POST /v2/patients/search`, `GET /v2/patients/:id`, `/summary`,
`/visits`, `/measurements`, `/medications`, `/labs`, `/documents`, `PATCH /v2/patients/:id/profile` (revision → 409),
`/medications/export`, `/labs/export`, `/whatsapp-consent`. `GET /patients/vitals-2y/:patientId` must not exist.
Cross-tenant docs id → **404**. Perf gates: search p95 < 300ms; tab first fetch (200+ encounters) p95 < 400ms;
rollback at p95 > 500ms or any cross-tenant leak.

### Isolation / PHI / audit
- **Edge 7 (required test):** patient switch → active tab back to Patient Info, open edit **cancelled, never saved into
  new patient**, search/filter/expanded state cleared, previous patient's query cache **evicted not reused**.
- Edge 16: only the sort string in `sessionStorage`; no PHI in local/session storage/IndexedDB.
- Audit: opening Visits/Measurements/Medications/Labs/Documents writes one `recordView` row per open (ids only),
  fire-and-forget; Archive/Delete write rows naming actor + patient. No user action blocks on audit.
- Remove `console.log(UserCredentials)` from roster repository (merge-blocking).

### Hazards / non-goals / gaps
Non-goals: duplicate detection/merge, CSV import, true erasure, 7th Optometry tab, X-ray integration, write
affordances on Meds/Labs, full-history omni-search, 4-mode identifier display. Open: matrix default (esp. documents),
V1→V2 cutover owner, `patient_snapshot` acceptance, monitoring owner. Worst output (edge 9): wrong patient's data after
rapid switch / flag missing from cache race.

### Reality check
Built: `src/features/patients/` (patients-page, roster-panel, patient-detail-shell, patient-tabs.ts with
`DOCUMENTS_TAB_AVAILABLE=true`, tabs/, patient-allergies, create-patient-drawer, whatsapp-consent,
`patient-cache-eviction.test.tsx`). Constants: `ROSTER_DEBOUNCE_MS=250`, page sizes 20/20/10/20(measurements)/24,
`NOT_RECORDED`, `NOT_LINKED`, `NOT_RECORDED_IN_EKKO`, both roster empty strings, "Load older medications/labs/documents".
Optometry decided server-side (`optometry_visible` flag in measurements response). **No archive/delete/restore UI in
`features/patients`** (grep empty); delete only via API. Roster search is `POST /v2/patients/search` (body), not query param.

---------------------------------------------------------------------------------------------------------------
## 2. export-share (getting note + prescription out)
**Frontmatter:** done · owner gerrit · assignee gerrit · tier 1 · created 2026-08-22 · completed 2026-10-20.
**What it is:** one **server-side** renderer for Download, Print, Copy-to-clipboard, and Send-to-patient
(WhatsApp/SMS/email) via `POST /v2/encounters/:encounterId/export {sections[], format, channel, recipient?}`. The
browser never builds or uploads a PDF. Public patient links: 72h token + 30-day short link, OTP-gated, revocable.

**As-built deltas:** revoke is **per-encounter** `POST /v2/encounters/:id/exports/revoke` (kills every link), not per
`:exportId`. Public OTP routes `/v2/exports/:encounterId/:exportId/*`. Pipeline-stamp requirement relaxed for
manual-report-only and optometry-only exports (generated-note, Rx, mixed still need it). Public links serve immutable
PDF/HTML siblings from one snapshot; patient rebinding invalidates the original; legacy tokens without snapshot → **410**.
Workspace letterhead = `letterhead.v2_workspace` config, 8 presets, server-side. Eye diagrams: sanitised SVG → PNG.
A `reports` section exists (radiology/optometry print through export). **Access override:** Staff may export AND revoke,
doctors not narrowed to assigned doctor (`export-access.ts:123-160`); the DoctorPA-link check on every export is struck.
Real-recipient delivery acceptance **not run**.

### Key behaviours
- Pipeline: Resolve (`[[rx:…]]` via shared `MARKER_RE`, fallback `tbl_note_ref.display_text`) → Assert (no marker in
  payload or rendered text, else `EXPORT_MARKER_LEAK`, nothing stored/sent) → Render → Store opaque key
  `medical-reports/{encounterId}/{uuid}.pdf` → Mint token 72h + short link 30d (re-send revokes previous) → Deliver + audit.
- Print = same server PDF in hidden iframe (byte-identical to download). Copy = `format=text` server render.
- **Signed axis only:** signed = `COMPLETED` (and `SIGNED`); everything else (incl. `PENDING_SIGN_OFF`, legacy values)
  is unsigned, identical stamp. Stamp verbatim: **"DRAFT — not yet signed by the doctor · Prepared 23 Aug 2026, 2:14pm"**;
  clipboard first line `DRAFT (unsigned) — prepared <date, time>`. Never "submitted for review". No confirm/nudge modal.
  Export module must contain no status list and no retired status strings (`SUBMITTED_TO_DOCTOR`,`PA_IN_PROGRESS`,`PA_PAUSED`).
- Post sign-off: frozen signed text; later drug correction must not change re-export.
- **PENDING Rx rows export**: patient copy "⚠ to be confirmed with your doctor", clinician copy "PENDING — unconfirmed";
  dialog line **"1 medicine is unconfirmed. It will be marked on the patient's copy."** `REJECTED` rows never export.
- Recipient pre-filled from record, shown in full to sender; non-matching number → token `otp_on_first_open`.
- Concurrency: exports saved state at request time, `REPEATABLE READ` snapshot; presence line
  **"Anitha is editing History. Unsaved changes won't be included."** non-blocking; never takes/respects a section lock;
  presence down → line omitted, export unchanged.
- Messages carry first name + link only; email = **link only, no PDF attachment**; SMS needs DLT (may be hidden).
- Errors (verbatim spec): marker leak/render fail "Couldn't prepare the document. Nothing was sent." + Retry (500
  `EXPORT_RENDER_FAILED`, one auto retry on timeout/OOM only, 10s render timeout); WhatsApp fail after 2 retries
  "WhatsApp couldn't deliver — send by SMS, email, or copy the link"; Twilio 21610 "Patient hasn't opted in to WhatsApp —
  send by SMS instead"; never show "Sent" on failure. Link service down → send blocked, download/print/copy still work.
  Expired short link 404 "please contact your healthcare provider for a new link". Sent chip "Sent to ••••4471 · 2:14pm · Revoke".
- Limits: `@Throttle` 5/min per user; 10 patient-sends per encounter per day; double-tap Send deduped by idempotency key.
- Token: 72h (`TOKEN_EXPIRY_SECONDS 259200`), OTP 300s, OTP rate 60s, post-OTP token 24h; OTP sent to the token's
  number only. Tamil/Devanagari must render (Noto fonts). No LLM on any export path.

### Roles (original matrix; note override above)
Doctor: everything at any status. Staff: download/print/copy any status; **send only when signed** (as-built: may
export and revoke; verify send rule live). PA: download/print/copy at any status; **never send** (blocked on regulatory
question). Admin: no clinical export. Perms: send/revoke `visit.process_export.self|org`; download/print/copy
`note.export.self|org`. Non-entitled tenant → 403 on `/v2/...export`. Cross-tenant encounter → **404** not 403.

### PHI / audit
Logs: ids, channel, codes, phone masked `****4471`; no name in logs, S3 key, metadata, short-link target, errors.
Audit (`audit_logs` via V2 AuditService, same txn): `EXPORT_RENDERED`, `EXPORT_DOWNLOADED`, `EXPORT_PRINTED`,
`EXPORT_COPIED`, `EXPORT_SENT`, `EXPORT_LINK_REVOKED`, `EXPORT_LINK_ACCESSED`, `EXPORT_OTP_VERIFIED`. No browser storage
of document/note/recipient. Patient web view: `noindex`, no analytics, no app navigation.

### Non-goals / known residuals
No V1 changes, no template editor, no patient portal/history, no fax/ABDM/FHIR/printer, no bulk or scheduled export,
no edit from dialog, no read receipts. Residual: stale number on the patient record is sent to correctly (only
revoke/notice). Two unsigned copies can differ; "Prepared" time is the disambiguator.

### Reality check
`src/features/export/` (export-drawer, export.api.ts calls `POST /v2/encounters/:id/export`, `GET …/export/recipients`,
`GET …/automatic-export`). Types: `ExportFormat = "pdf" | "word"` (spec said PDF only, Word added), `ExportWay =
download|print|share`, channels `whatsapp|sms|email`, sections incl. `reports`, optometry variants; `idempotencyKey`
present. Tests cover presence line and unconfirmed notice. **No web call to `exports/revoke` found** (revoke UI may be
missing or elsewhere: verify). "Prepared" string not in web (server-rendered).

---------------------------------------------------------------------------------------------------------------
## 3. radiology-reports (dictation → structured report)
**Frontmatter:** done · owner mahalingam · tier 1 · created 2026-08-14 · completed 2026-10-20.
**What it is:** tenant-defined Report Types (own the heading list) + Templates (default wording per heading). Dictation is
classified per heading (normal/abnormal/not_mentioned); normals paste stored wording **verbatim**; AI_SUMMARY headings
synthesised from headings above. Signed via `report.signoff.self`.

**As-built:** `PATCH /reports/types/:reportTypeId`; extra `ai-fill`, `save-as-template`; writes serialise with patient
rebinding/sign-off + atomic audit (the spec's "audit gap" is closed); templates V2 create/edit/soft-remove under tenant
row lock; V1 report-file extraction = review-only preview. Reports render into V2 PDF export (non-goal overridden).
Optometrist/radiologist role questions open.

### Key behaviours / state machine
- `POST /reports {encounter_id, template_id, sections?}` creates `DRAFT` immediately, prefilled from template defaults.
  Sign off with zero dictation is valid. **One active draft per encounter**: new selection soft-deactivates the old.
- `POST /reports/:id/generate {transcript}` only fills an existing draft; no draft → **404**. Leaves `EDITED` sections
  untouched. LLM response missing any heading or malformed → **400, nothing persisted** (never default to not_mentioned).
  Zero headings → 400 before LLM.
- `not_mentioned` + template toggle `fill_not_mentioned_with_normal` (default ON) → default wording or blank;
  `clinical_status` NOT_MENTIONED stays distinguishable from NORMAL.
- AI_SUMMARY: from populated headings above by `sort_order`; blank if none; source `AI_GENERATED`; modifies nothing else.
- Edit: `PATCH /reports/:id/sections/:sectionId` or bulk `PATCH /reports/:id/sections` (**all-or-nothing**, one bad id →
  404, nothing saved); `source → EDITED`, `clinical_status` immutable.
- Sign-off `POST /reports/:id/signoff`: one txn `Report.status=SIGNED_OFF` + `Encounter.encounter_status=SIGNED`. After:
  new draft, generate, section edits, bulk save all reject (400). Known gap edge 20: one signed report locks the whole
  encounter even with other reports.
- Heading edits soft-deactivate old headings; old reports keep references. Multiple reports per encounter, newest first.
- Enums: field types PARAGRAPH, TEXT, NUMBER, CHOICE, YES_NO, AI_SUMMARY; sources DEFAULT_NORMAL, DICTATED, BLANK,
  EDITED, AI_GENERATED; status DRAFT/SIGNED_OFF.

### Roles
`report.view.self/org` (Radiologist, Doctor, Org Admin, PA); `report.create.self/org` (Radiologist, Doctor, PA);
`report.signoff.self` (Radiologist, Doctor only); `report-template.manage.org` (Radiologist, Doctor, Org Admin).
**Staff: none. Optometrist: none.** Radiologist = display name for `role_code lab_technician`; visit tabs limited to
Report + Documents (`VISIT_TABS_SETTING`); `tabs.report` defaults false org-wide. Solo radiologist signup NOT supported
(not in onboarding pickers): out of scope, not a bug.

### PHI / tenancy
All 6 models tenant-classified; cross-tenant encounter/template → not found. No browser storage. Prompts treat heading
names as delimited data (prompt-injection test idea). CDS: Impression summarises only, no advice.

### Reality check
`src/features/reports/` (visit-reports.tsx, report-template-manager, report-type-builder, report-import, reports.api.ts)
calls `/reports/types`, `/reports/templates[/:id]`, `/reports/encounter/:id`, `/reports`, `/sections`, `/template`,
`/generate`, `/ai-fill`, `/signoff`, `/save-as-template`. Built.

---------------------------------------------------------------------------------------------------------------
## 4. prescription-drug-names (drug accuracy + note↔Rx consistency)
**Frontmatter:** done · owner gerrit · tier 1 · created 2026-07-10 · completed 2026-10-20 (shipped June 2026 in V1 lineage).
**What it is:** prescription row is the single source of truth; note A&P references drugs via inline `[[rx:id]]` tokens
rendered as live chips; brand-first extraction, manufacturer autofill from Drug catalog.

**As-built:** `src/v2/drugs`, `drug_catalog`, `rx-markers.ts`; V1 field-scoped VeraTerm suggestions inside V2 Rx card
(`POST /prescriptions/suggestions[/update]`, sends term + field + selected medicine only); seven V1 SIG shortcuts.
Columns actually shipped: `common_name`, `manufacturer`, `drug_id` (bound via `POST /v2/drugs/search`); **no
`generic_name`/`indication`/`role` columns**.

### Behaviours (edge table)
Edit drug in list → chip re-renders everywhere (A&P, other sections, script), wording untouched. Editing a chip in the note
**warns that it also updates the prescription**. Delete drug → chip greyed/struck, dropped from script, surrounding words
kept. Drug not in A&P still prints, no nag. Unknown drug captured verbatim, never auto-corrected, stays an editable chip.
Home meds (MedicationStatement) separate from visit Rx. Supportive drug sits next to the drug it supports. Unverified:
plain-text drug name auto-converting to chip (AC unchecked).
**Hard rule for testers:** a raw `[[rx:…]]` must never appear in any rendered surface (note view, PDF, copy, message).

### Roles / PHI
Doctor and PA via existing note/Rx edit rights; no new permission strings. Drug names never in logs. Prescription views
were unaudited (now covered by list-read audit per global-search override).

### Reality check
`[[rx:` handled in 2 web files; `drugs/search` in 3; `suggestions` in 18. Built.

---------------------------------------------------------------------------------------------------------------
## 5. global-search-compliance-fixes (audit writer + recents storage)
**Frontmatter:** done · owner gerrit · assignee gerrit · tier 1 · created 2026-08-01 · completed 2026-10-20.
**What it is:** Fix A: `RecordAccessAuditService.recordView` writes one `audit_logs` row per patient/encounter detail
view (ids only, fire-and-forget). Fix B: search recents moved to `sessionStorage`.

**As-built:** as specified. Recents keyed by **user id, not tenant** (low-severity gap recorded in `security-criticals`;
known, don't file as new). Override: patient-scoped list reads (vitals, prescriptions, labs, documents, allergies) and
member/user reads ARE audited (`record-access-audit.service.ts:28-38`).

### Behaviours / ACs
- One row per patient detail view (`entity_type=patient`) and encounter detail view (`encounter`), fields tenant_id,
  user_id, entity_type, entity_id, action=view; all roles logged, none exempt; tenant/user only from the token.
- Forced audit failure does not fail/delay read; increments `audit_write_failures` / greppable `audit_write_failure` log.
- No name, query text or clinical value in rows. Retention **3 years**. Index (tenant_id, created_at).
- Recents: sessionStorage only; tab close clears; logout and tenant switch clear explicitly; legacy localStorage recents
  deleted on first load.
- Gate: enabling V2 for a tenant requires the read-access writer verified on the deployed backend **by query**.
- History lesson: `main` vs `develop` divergence hid merged fixes (#1377 audit, #1378 phone-lookup PII logs).

### Reality check
`src/features/search/use-recent-searches.test.ts` asserts sessionStorage-only, legacy localStorage removal, owner
isolation, clear on logout. Built (client half). Audit rows are backend-only: verify via API/DB, not UI.

---------------------------------------------------------------------------------------------------------------
## 6. staff-fd-worklist (Staff home)
**Frontmatter:** done · owner jacqueline · tier 1 · created 2026-09-11 · completed 2026-10-20. Shipped from `draft`.
**What it is:** Staff (`role_code staff` ≡ "Front desk" ≡ shell `frontdesk`) land on a full-width Visits worklist (`.fd`),
not the doctor visits panel + consult.

**As-built:** Staff land on shared `/visits`, which swaps in `fd-worklist-page.tsx`; **Pending and In Queue tabs are
`degraded`**. "PARK A" (distinct Staff path vs shared `/visits`) still open.

### Behaviours / ACs
- Tabs verbatim: **All · Pending · In Queue · In Consult · Completed**; membership via ADR-011 normalized statuses only;
  no retired PA-era labels; **no Orderby control** (server/clinic-queue order).
- New Patient + New Visit drawers; visit create = `POST /encounters/visit` (`CreateVisitDTO`), **never
  `quick-encounter`**; Staff keeps full create UX (patient-optional one-tap does not apply).
- Staff must not open live note, recording, PA submit, or sign-off from this home (edge 10 worst output).
- `/visits` deep link keeps Staff chrome, never elevates. Empty day → empty state with New Visit / New Patient CTAs.
- Drawer / registration OTP state cleared on navigate-away and patient switch (edge 7).
- `data-admin=1` Staff still home = FD worklist (capability ≠ role).
- RBAC: `visit.read.*`, `visit.create.*`, `patient.read.*`, `patient.create.*` from seed; no permissions UI.

### Reality check
`features/visits/fd-worklist-page.tsx`, `fd-status-tabs.ts` (`FD_WORKLIST_TABS`, column widths from Figma 372:162),
`visits-route.tsx`, `features/shell/role-home.ts`. **Pending and In Queue both filter `NOT_STARTED`** → identical lists
(intentional "degraded", not a bug). Also renders "Pending intake" (intake delta).

---------------------------------------------------------------------------------------------------------------
## 7. admin-org-landing (Org Admin home)
**Frontmatter:** done · owner jacqueline · tier 1 · created 2026-09-11 · completed 2026-10-20. Shipped from `draft`.
**What it is:** `org_admin` (copy "Admin") lands on org/settings; `data-admin` is a capability, never a role.

**As-built:** home is `/settings` (`OrgSettingsLanding`, links only). Built sections: Note Templates, Account,
Professional, Preferences, Defaults, Patient intake, Visit form, Letterhead, Team (PA linking), Users; Security partial;
**Billing, Plan & Usage, User Role Manager are placeholders hidden from nav** (billing deferred, ADR-018): not bugs.

### Behaviours / ACs
Landings: doctor/PA → `/visits`; staff → FD worklist; org_admin → `/settings`. `doctor`/`staff` + `data-admin=1` keep
role home. Admin can reach invite/org entry points and Patients read (mutations only if seeded). No admin clinical
worklist. Cross-tenant invite fails server-side (P0). Settings API down → error state, **no silent fallback to doctor
home**. Settings forms clear on tenant/user switch. Last-admin self-demotion: open question (block expected).

### Reality check
`role-home.ts` `ROLE_HOME = {staff:"/visits", org_admin:"/settings", clinician:"/visits"}`; order: staff check first,
then org_admin, else clinician. **So a user holding doctor + org_admin roles lands on `/settings`** (spec only covers
`data-admin` capability, not dual roles; open question, matches Hawk memory). Settings rail item only for org_admin or
super_admin (`canOpenWorkspaceSettings`). `features/settings/settings-landing.test.tsx` exists; `OrgSettingsLanding` name
not found in src (renamed).

---------------------------------------------------------------------------------------------------------------
## 8. left-panel (global nav rail) + plan.md
**Frontmatter:** spec done · owner anbu · assignee sagar · tier 2 · created 2026-08-03 · completed 2026-10-20.
plan.md: `status: in-development` (stale), owner anbu, assignee gerrit, created 2026-08-12; build PR `ekko-web-app#3`,
64 tests, compliance Lane A **PASS** 2026-08-12.
**What it is:** the dark 54px rail (Visits, Patients, Calendar, Ask AI, Settings, gift glyph) and the router-level
recording navigation guard.

**As-built deviations (recorded, not final design):** hand-written `.rail` markup not ekko-ds `AppRail`; **Settings moved
to TopBar**; Calendar + Ask AI are live items to placeholder routes `/calendar`, `/ask-ai`; Visits/Patients permission
gating dropped ("DOGFOOD DEVIATION" in `nav-items.ts`); guard also blocks on **unsaved clinical edits** (D29/D33).

### Behaviours / ACs
- Recording active → any route transition (rail, back/forward, address bar, in-app link, search `navigate()`) blocked
  with toast verbatim **"Recording in progress — finish or stop recording before leaving this screen."** (one
  `useBlocker` in AppShell, deduped toast, `beforeunload` best effort). Stop → navigation resumes; audio/transcript
  survive blocked attempts (test as Doctor and PA).
- Active item: tile bg, `#a681fe` label, gradient icon (not gray idle), `aria-current="page"`, exact-or-descendant match
  (`/visits/:id/view` keeps Visits active). Rail is `<nav>` with accessible name; live items are tab stops with visible
  focus ring.
- Gift glyph: inert, `aria-disabled="true"`, out of tab order, no hover/cursor, no toast.
- Measurements (Figma 21390:75019): 54px width, 32px tile 8px radius, 46px item, 10px label, inset 4/4/6px, 10px
  container radius, 20px icons, surface `#0f0d26`; nav block `top:76px` → `118px` when visits panel collapses
  (`.44s cubic-bezier(.22,1,.36,1)`). Below `md` (48rem) → bottom bar with same items (provisional; open question 3).
- Hiding an item is not access control: direct route must still be refused server-side. WCAG AA for
  `--text-on-dark-muted` on `#0f0d26` and focus ring (still owed). No PHI, no endpoints, no audit.

### Reality check
`src/components/layout/{NavRail,BottomNav,nav-items.ts,AppShell}`, `features/recording/navigation-guard.tsx` (toast copy
matches), `features/shell/shell-store.ts`. Current `NAV_ITEMS`: Visits (`visit.read.*`), Patients (`patient.read.*`),
Calendar (`visit.read.*`), Ask AI (no permission → visible to all), Settings (`settings.read.org|self`, `audit.read.org`,
and only for org_admin/super_admin). So Visits/Patients gating appears **restored** in this branch, contrary to the
archive note. Router has `calendar`, `ask-ai`, `settings/*`. Note: the spec's toast copy contains an em dash, which
conflicts with the ekko-ds "no dashes in UI copy" rule (spec-fixed copy; raise as design question, not app bug).

---------------------------------------------------------------------------------------------------------------
## Cross-cutting test notes
- RBAC tests: name the role, never super_admin; check allowed + denied paths, direct API call 403/404.
- Cross-tenant reads must 404 (no existence disclosure) for patients' docs, exports, reports.
- Isolation: patient switch (edit cancelled, cache evicted), tenant switch/logout (recents, sort, settings forms, drawers).
- Copy guardrails: "Simplified" not "SOAP"; "Not recorded", "Not linked", "Not recorded in Ekko"; DRAFT stamp wording.
- Known non-bugs: no duplicate detection; Manufacturer = brand; Pending/In Queue identical; Billing/Plan placeholders
  hidden; Calendar/Ask AI placeholder pages; no solo-radiologist signup; recents keyed by user not tenant; signed-note
  header snapshot not built; export Word format; Staff may export/revoke.
