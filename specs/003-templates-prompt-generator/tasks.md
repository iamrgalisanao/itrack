---

description: "Task list for the Templates and Prompt Generator (Support Ops Phase 2) feature"
---

# Tasks: Templates and Prompt Generator (Support Ops Phase 2)

**Input**: Design documents from `/specs/003-templates-prompt-generator/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/generation-log-api.md, quickstart.md. Depends on
`002-support-ops-tracker` already being merged (this feature reads
`SupportIssueResource` fields and reuses `SupportOpsController`'s existing
role-gating — nothing here works without that controller and resource
already existing).

**Tests**: This feature adds one new backend endpoint (Constitution
Principle III makes its Feature test mandatory, not optional) and
deliberately adds `node:test` unit tests for the pure-JS template/parsing
logic (plan.md's Testing section — the highest-risk logic in the feature,
covered even though this repo has no frontend test runner otherwise). Both
appear as explicit test tasks. Frontend UI verification beyond the unit
tests is manual, using quickstart.md's scenarios (unchanged convention from
001/002).

**Organization**: Tasks are grouped by user story (from spec.md, in priority
order) to enable independent implementation and verification of each story.
This feature has **zero schema change** — no migration task exists anywhere
below, unlike 001/002.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- All file paths are relative to the repository root

---

## Phase 1: Setup

- [x] T001 Confirm local environment is ready: backend serving at
      `localhost:8000`, frontend serving at `localhost:5173`, and you can
      sign in as `pm@itrack.test`, `team@itrack.test`, `depthead@itrack.test`,
      and `client@itrack.test` (all password `password`) per
      quickstart.md's Prerequisites. Confirm at least one Support Ops issue
      exists with `client_name`/`tenant_name` set (create one via quick
      intake if needed), plus one whose `description` was set directly (not
      via intake) so it has no structured labels — quickstart.md's
      Prerequisites need both. **No migration to run** — this feature adds
      zero columns/tables (plan.md's Storage section).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one shared backend surface every user story's "Generate"
action depends on for its audit-log call.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Add a `generationLog(Request $request, $id)` action to
      `backend/app/Http/Controllers/SupportOpsController.php` implementing
      the full behavior in `contracts/generation-log-api.md`:
      1. Re-run `SupportOpsController::index()`'s existing inclusion-based
         view-access check (`isAdmin() || isProjectManager() ||
         isTeamMember() || isDepartmentHead()`) — fail-closed, deny Client
         and null/unrecognized roles with `403`.
      2. Load the `DetailedActivity` by `$id`; return `404` if it doesn't
         exist or isn't Support-Ops-scoped (same `work_type` scoping
         `index()` already applies).
      3. Validate the body: `artifact_type` required, `in:template,draft,packet`;
         `template_stage` required-non-null when `artifact_type=template`,
         must be null/omitted otherwise, `in:acknowledgement,intake_request,
         investigation_started,progress_update,waiting_for_client,
         root_cause_found,resolved`; `issue_updated_at` required, string,
         and MUST match ISO 8601 (e.g. a `date_format:Y-m-d\TH:i:sP`-style
         rule matching what `toIso8601String()` actually produces) — reject
         missing, non-string, or malformed values with `422` per
         contracts/generation-log-api.md. Treat this purely as a format
         check: do **not** parse it into a `Carbon`/`DateTime` instance
         anywhere in this action — step 4 needs the original string
         untouched for an exact comparison, and parsing-then-reformatting
         risks silently accepting a value that wouldn't actually match
         `toIso8601String()`'s output byte-for-byte.
      4. Compute `snapshot_stale = ($request->issue_updated_at !== $issue->updated_at?->toIso8601String())`
         — a plain string comparison of the untouched request value against
         the freshly-loaded model's own serialization, no parsing/
         reformatting of either side.
      5. Compute `included_client_name`/`included_tenant_name`
         **branching on `artifact_type`** per data-model.md's table: for
         `template`/`draft`, only `included_client_name = trim($issue->client_name) !== ''`
         is real — `included_tenant_name` is hardcoded `false` regardless of
         the issue's actual `tenant_name`; for `packet`, both are real
         checks (`trim($issue->tenant_name) !== ''` too).
      6. If `snapshot_stale` is `false` **and** nothing is included per step
         5, return `{"logged": true}` without writing any row. Otherwise,
         map `artifact_type` to the action name
         (`template`→`support_issue.template_generated`,
         `draft`→`support_issue.draft_started`,
         `packet`→`support_issue.packet_generated`) and call
         `AuditLogger::record($request, $action, 'detailed_activity', $id, null, ['artifact_type' => ..., 'template_stage' => ..., 'included_client_name' => ..., 'included_tenant_name' => ..., 'snapshot_stale' => ...])`.
         Never include the generated text or actual `client_name`/
         `tenant_name` values anywhere in metadata, the request, or the
         response.
      7. Return `{"logged": true}` in both the write and skip-write cases.
- [x] T003 [P] In `backend/routes/api.php`: add
      `Route::post('support-ops/{id}/generation-log', [SupportOpsController::class, 'generationLog'])`
      inside the existing `auth:sanctum` middleware group, alongside the
      existing `support-ops` routes.
- [x] T004 Backend Feature test
      `backend/tests/Feature/SupportOpsGenerationLogTest.php` covering the
      full matrix from `contracts/generation-log-api.md` and plan.md's
      Testing section: `200` for each of Admin, Project Manager, Team
      Member, and Department Head individually; `403` for Client and for a
      null/unrecognized role; `401` unauthenticated; `404` for a nonexistent
      issue id; `404` for a syntactically valid id belonging to an ordinary
      Kanban-only task never touched by Support Ops (distinct test from the
      nonexistent-id case); `422` for invalid/missing `artifact_type`, for
      `template_stage` mismatched with `artifact_type`, **for a missing
      `issue_updated_at`, for a non-string `issue_updated_at`, and for a
      malformed/wrong-format `issue_updated_at` (e.g. a Unix timestamp, a
      `Y-m-d`-only date, or a valid-but-differently-formatted ISO
      variant)**; an issue with both `client_name`/`tenant_name` blank
      returns `200` but writes **zero** `audit_logs` rows (assert on the
      database, not just the HTTP status); an issue with `client_name`
      blank but `tenant_name` set, called with `artifact_type: template` —
      writes **zero** rows — versus the same issue called with
      `artifact_type: packet` — writes one row with
      `included_tenant_name: true` (proves the artifact-type branching is
      real, not a shared issue-level check); and a stale `issue_updated_at`
      (a validly-formatted ISO string that simply doesn't match the issue's
      actual current `updated_at`) against a both-blank issue still writes a
      row with `metadata.snapshot_stale: true`.
- [x] T005 [P] In `frontend/src/lib/api.js`: add
      `logSupportGeneration(issueId, { artifact_type, template_stage, issue_updated_at }) => api.post(`/support-ops/${issueId}/generation-log`, { artifact_type, template_stage, issue_updated_at })`.

**Checkpoint**: The shared generation-log endpoint exists, is fully tested,
and has a client wrapper. User story implementation can begin.

---

## Phase 3: User Story 1 - Send a client status update without retyping it from scratch (Priority: P1) 🎯 MVP

**Goal**: A user can pick one of seven fixed message stages on a Support Ops
issue and get a copy-ready, channel-agnostic client message pre-filled with
the client name and issue title.

**Independent Test**: Per quickstart.md Scenario 1 & 2 — open any issue,
generate each of the seven stages, confirm exact canonical wording, confirm
no internal-only fields or messaging-provider names ever appear, confirm
edit-before-copy and copy-to-clipboard both work, and confirm missing
`client_name`/title render cleanly instead of erroring.

### Implementation for User Story 1

- [x] T006 [P] [US1] Create `frontend/src/lib/supportTemplates.js` exporting
      a function that renders one of the seven fixed Message Template
      stages (Acknowledgement, Intake request, Investigation started,
      Progress update, Waiting for client, Root cause found, Resolved) given
      `{ client_name, name }`, using the **exact** canonical wording table in
      data-model.md's "Message Template" section — including the
      client-name-absent wording variant and the missing-title
      `"your reported issue"` substitution. Structurally exclude
      `tenant_name`, `evidence`, `root_cause`, `resolution`, and
      `next_action` — none of these are parameters this function even
      accepts (FR-002). Confirm none of the seven strings names a messaging
      provider or app (FR-001, SC-003).
- [x] T007 [P] [US1] Create `frontend/src/lib/supportTemplates.test.js`
      (`node:test` + `node:assert`, run via
      `node --test frontend/src/lib/supportTemplates.test.js`) with unit
      tests for all seven stages × {client_name present, client_name absent}
      × {title present, title absent}, asserting the exact canonical string
      from data-model.md and that no messaging-provider name ever appears
      anywhere in the output.
- [x] T008 [US1] In `frontend/src/pages/SupportOps.jsx`'s issue detail
      `extraFields` render (the same slot used for the Phase 1 support
      fields): add a template-stage picker (the seven stages), a "Generate"
      button, an editable plain-text `<textarea>` (never
      `dangerouslySetInnerHTML` — FR-015) showing the rendered template
      text, a "Copy" button, and the Data Privacy Act privacy notice (FR-012)
      placed near these controls, visible but never blocking. **Generate
      from `selectedIssue` (this page's own last-fetched state), never from
      `form` (the parameter `extraFields(form, setForm)` receives, which
      holds `TaskDetailModal`'s in-progress, possibly-unsaved edits) — FR-016.
      `extraFields` is defined as a closure inside `SupportOps.jsx`, so
      `selectedIssue` is already in scope even though `form` is the
      parameter; the generator must deliberately reach past `form` for
      `client_name`/`name`.** The "Copy" button uses
      `navigator.clipboard.writeText()` on the textarea's **current** value
      (so user edits made *after* generation are what gets copied,
      FR-003/FR-004 — this is unrelated to FR-016, which only governs what
      the *initial* generated text is sourced from), showing a visible
      success confirmation, or a visible non-blocking error with the text
      remaining selectable if the browser denies clipboard access. Depends
      on T006.
- [x] T009 [US1] Wire the "Generate" button (not the stage-picker's
      selection-change event) to call
      `logSupportGeneration(issue.id, { artifact_type: 'template', template_stage, issue_updated_at: issue.updated_at })`
      fire-and-forget — never awaited before displaying the generated text
      or enabling Copy, and its failure is logged to the console only, never
      surfaced to the user (FR-013's audit-failure behavior). Only make this
      call when the rendered template's `client_name` is non-empty
      (post-trim) — per the artifact-type-specific frontend gating rule for
      `template` in `contracts/generation-log-api.md` (client name only;
      `tenant_name` is irrelevant to this artifact type's gating decision).
      Depends on T005, T008.
- [x] T010 [US1] Manual verification: run quickstart.md Scenario 1 (exact
      canonical wording for all seven stages, zero internal-only fields,
      zero messaging-provider references, edit-before-copy, copy
      correctness) and Scenario 2 (missing `client_name`/title substitution
      rules render cleanly).

**Checkpoint**: User Story 1 is fully functional and independently
testable — this is the MVP.

---

## Phase 4: User Story 2 - Get an AI-ready troubleshooting prompt for a technical issue (Priority: P1)

**Goal**: A user can generate a structured, copy-ready technical prompt
pre-filled from the issue's tracked fields, with untracked fields clearly
blank and a description-parsing step that never blocks on malformed input.

**Independent Test**: Per quickstart.md Scenario 3 & 4 — generate the packet
on an issue with full data and confirm every field maps per data-model.md
exactly (including the optional root-cause addendum), then confirm
malformed/unstructured `description` still generates a complete packet with
the affected fields blank instead of erroring.

### Implementation for User Story 2

- [x] T011 [P] [US2] In `frontend/src/lib/supportTemplates.js`: add a
      description-parsing function implementing data-model.md's parsing
      grammar exactly — recognize `Timestamp:`, `Area/workflow affected:`,
      `Expected:`, `Actual:` case-insensitively at line starts only; a
      label's value is everything after its colon, trimmed, continuing
      across lines until the next recognized label or end of string
      (multi-line values supported); a missing or empty-after-trim label
      yields no value for that field (never fabricated, never inferred);
      unstructured/prose descriptions with none of the four labels yield all
      four blank, never falling back to the raw description text; if a label
      appears more than once, use only the first occurrence.
- [x] T012 [US2] In `frontend/src/lib/supportTemplates.js`: add the
      troubleshooting-packet-rendering function per data-model.md's
      Troubleshooting Packet mapping table exactly: Client issue=`name`,
      Tenant=`tenant_name`, Provider/client=`client_name`, Timestamp=the
      parsed `Timestamp:` value verbatim, **falling back** to
      `new Date(created_at).toLocaleString()` (matching the exact convention
      already used in `Admin.jsx`'s audit log display,
      `SupportOps.jsx`'s `last_client_update_at` display, and
      `Reports.jsx`'s `generated_at` display) when not present/parseable;
      Environment/Request payload/Error message=always a blank placeholder;
      Endpoint or workflow/Expected behavior/Actual behavior=the parsed
      values or blank; Screenshots/log snippets=`evidence` (text only, never
      an actual file attachment reference); the static analysis-request
      footer text; and, only when `root_cause` is non-empty, an additional
      "Suspected root cause so far: {root_cause}" line appended after the
      footer (omitted entirely — not blank — when `root_cause` is empty).
      Depends on T011.
- [x] T013 [P] [US2] Add unit tests to
      `frontend/src/lib/supportTemplates.test.js` for: the parsing function
      (case-insensitivity, a description missing one/some/all labels,
      differently-cased labels, multi-line values, a duplicated label using
      only the first occurrence, and fully unstructured prose) and the
      packet-rendering function (full-data mapping correctness against
      data-model.md's table, all-blank-placeholder case, Timestamp fallback
      to `created_at`, and the `root_cause` present/absent addendum
      behavior).
- [x] T014 [US2] In `SupportOps.jsx`'s `extraFields` render: add a "Generate
      troubleshooting packet" button, an editable plain-text `<textarea>`
      (FR-015) showing the rendered packet, a "Copy" button (same
      clipboard/error-handling behavior as T008), and the privacy notice
      (FR-012) placed near these controls. **Generate from `selectedIssue`,
      never from `form` — same FR-016 constraint as T008**, applied here to
      every field the packet reads (`client_name`, `tenant_name`, `name`,
      `description`, `evidence`, `root_cause`, `created_at`) — all of these
      must reflect last-saved data, not an in-progress unsaved edit in the
      same modal. Depends on T012.
- [x] T015 [US2] Wire "Generate troubleshooting packet" to call
      `logSupportGeneration(issue.id, { artifact_type: 'packet', template_stage: null, issue_updated_at: issue.updated_at })`
      fire-and-forget, only when the rendered packet's `client_name`
      **or** `tenant_name` is non-empty (post-trim) — the packet-specific
      gating rule in `contracts/generation-log-api.md` (the only artifact
      type where `tenant_name` matters for gating). Depends on T005, T014.
- [x] T016 [US2] Manual verification: run quickstart.md Scenario 3 (full
      field mapping including the root-cause addendum present/absent
      behavior) and Scenario 4 (malformed/missing description parsing never
      blocks generation).

**Checkpoint**: User Stories 1 and 2 are both independently functional —
client communication and technical triage both work.

---

## Phase 5: User Story 3 - Draft a one-off client update that doesn't fit any fixed stage (Priority: P2)

**Goal**: A user can open a freeform composer pre-filled with the same
client-facing details as the fixed templates, write a custom message, and
copy it — with the draft never surviving any navigation away from it.

**Independent Test**: Per quickstart.md Scenario 5 — open the composer,
confirm the pre-fill, type custom text, then close/reopen/switch-issue/
navigate-away/reload in turn and confirm the draft is empty again every
time.

### Implementation for User Story 3

- [x] T017 [P] [US3] In `frontend/src/lib/supportTemplates.js`: add a
      freeform-composer pre-fill function per data-model.md's "Freeform
      Composer" section — `"Hi {client_name}, regarding \"{name}\": "` using
      the same client-name/title present-or-absent substitution rules as
      the fixed templates (T006), with an empty body for the user to
      continue typing.
- [x] T018 [P] [US3] Add unit tests to
      `frontend/src/lib/supportTemplates.test.js` for the freeform pre-fill
      function (client_name present/absent × title present/absent).
- [x] T019 [US3] In `SupportOps.jsx`'s `extraFields` render: add a "Start
      freeform draft" button opening a composer pre-filled per T017, backed
      by local component state only — no `localStorage`/`sessionStorage`/
      backend draft-save of any kind (FR-014) — that resets to a fresh
      pre-fill every time it's opened (on issue change, remount, or a fresh
      "Start freeform draft" click), an editable plain-text `<textarea>`
      (FR-015), a "Copy" button (same behavior as T008), and the privacy
      notice (FR-012) near these controls. **Pre-fill from `selectedIssue`,
      never from `form` — same FR-016 constraint as T008/T014.** Depends on
      T017.
- [x] T020 [US3] Wire the "Start freeform draft" button (not merely opening
      the composer) to call
      `logSupportGeneration(issue.id, { artifact_type: 'draft', template_stage: null, issue_updated_at: issue.updated_at })`
      fire-and-forget, gated on non-empty `client_name` only — same gating
      rule as `template` (T009), since the freeform draft never includes
      `tenant_name` either. Depends on T005, T019.
- [x] T021 [US3] Manual verification: run quickstart.md Scenario 5 — confirm
      the draft is discarded (empty pre-fill again) after each of: close/
      reopen the issue, switch to a different issue and back, navigate to
      another page and back, and a browser reload.

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification that spans all three artifact types together —
these scenarios need US1, US2, and US3 all present to be meaningful, unlike
the story-specific checks above.

- [x] T022 [P] Manual verification: quickstart.md Scenario 6 — generate a
      template, the freeform draft, and the packet on the same issue without
      clicking "Record client update now," then re-fetch the issue and
      confirm `status` and `last_client_update_at` are byte-for-byte
      unchanged from before (FR-009) — check the persisted API/DB values,
      not the time-relative "stale" display.
- [x] T023 [P] Manual verification: quickstart.md Scenario 7 — confirm the
      audit trigger fires only on an explicit "Generate"/"Start freeform
      draft" click (never on stage-browsing, editing, copying, or
      close/reopen), that re-clicking Generate logs again, and that an issue
      with `client_name` blank but `tenant_name` set produces zero entries
      for `template`/`draft` but one entry with `included_tenant_name: true`
      for `packet` (FR-013's artifact-type-specific inclusion rule, tested
      end-to-end through the UI this time rather than directly via the API
      as in T004).
- [x] T024 [P] Manual verification: quickstart.md Scenario 8 — block the
      `generation-log` request via devtools and confirm Generate/Copy still
      work normally with no blocking error, failure visible only in the
      console (FR-013's audit-failure behavior).
- [x] T025 [P] Manual verification: quickstart.md Scenario 9 — confirm the
      privacy notice is present and non-blocking near all **three**
      artifacts' controls (templates, freeform composer, and packet — not
      just two of them).
- [x] T026 [P] Manual verification: quickstart.md Scenario 10 — Team Member
      and Department Head can both generate successfully; Client is denied
      both in the UI and via a direct API call (`403`); an unauthenticated
      direct call gets `401`; an invalid `artifact_type` gets `422`; a
      nonexistent issue id and a non-Support-Ops-scoped id both get `404`
      (distinct cases, per T004).
- [x] T027 [P] Manual verification: quickstart.md Scenario 11 — set a
      `client_name`/`evidence` value containing markup/special characters,
      confirm it renders and copies as literal plain text with no script
      execution or HTML rendering (FR-015).
- [x] T028 [P] Manual verification: quickstart.md Scenario 7, steps 13–14 —
      a stale `issue_updated_at` against a both-blank issue still logs (with
      `metadata.snapshot_stale: true`), while a fresh, matching
      `issue_updated_at` against the same both-blank issue does not log.
- [x] T029 [P] Manual verification: quickstart.md Scenario 12 — with an
      unsaved edit to `client_name` (and, separately, `tenant_name`/
      `evidence`/`root_cause` for the packet) sitting in the issue detail
      form, confirm every one of the three generators (template, freeform
      draft, packet) still produces text using the **last-saved** value, not
      the unsaved one — then confirm generation *does* pick up the new value
      once it's actually saved. This is the one manual check that would
      catch a T008/T014/T019 implementation that reached for `form` instead
      of `selectedIssue` (FR-016).
- [x] T030 [P] Manual verification: quickstart.md Scenario 13 — using
      browser devtools' Network tab, confirm a `generation-log` request's
      body carries the exact `issue_updated_at` string from the page's own
      last-fetched issue data (unmodified, not reformatted) and contains
      only `artifact_type`/`template_stage`/`issue_updated_at` — no
      `included_client_name`/`included_tenant_name` fields, confirming T005/
      T009/T015/T020 never send the privacy flags the server derives itself.
- [x] T031 Regression check: run `cd backend && php artisan test` (all
      existing tests plus the new `SupportOpsGenerationLogTest` pass); run
      `node --test frontend/src/lib/supportTemplates.test.js` (all pass);
      run `cd frontend && npm run build && npm run lint` (clean — no new
      dependency was introduced, and this repo's lint debt is already
      cleared from the earlier follow-up pass); manually confirm the Kanban
      Board, Work Program, Schedule, and Reports views are unchanged.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user
  stories (every story's "Generate" action calls the endpoint built here).
- **User Stories (Phase 3+)**: All depend on Foundational phase completion.
  - US1 (P1) and US2 (P1) have no dependency on each other and can proceed
    in parallel once Foundational is done.
  - US3 (P2) has no dependency on US1/US2 either, beyond sharing the same
    `supportTemplates.js` file (additive, non-conflicting functions) and the
    same `extraFields` render in `SupportOps.jsx`.
- **Polish (Phase 6)**: Depends on US1, US2, **and** US3 all being complete
  — every task in this phase exercises at least two of the three artifact
  types together.

### Within Each User Story

- The `supportTemplates.js` rendering function comes before its
  `supportTemplates.test.js` tests are meaningful to run, and before the
  `SupportOps.jsx` UI task that calls it.
- The `SupportOps.jsx` UI task (rendering + Copy) comes before the
  `logSupportGeneration` wiring task (which attaches to the same "Generate"
  button the UI task creates).
- Manual quickstart verification is last in every story.

### Parallel Opportunities

- T003 and T005 (Foundational) can run in parallel with each other, and with
  T002 once T002's method signature is settled (T003 just needs the route
  name; T005 doesn't touch the backend at all) — these are genuinely
  different files with no dependency between them, matching the `[P]`
  definition at the top of this document.
- Within each user story, the `supportTemplates.js` task and its matching
  `.test.js` task are marked `[P]` — genuinely different files, so the test
  task can be written against the function's intended behavior before or
  alongside the implementation.
- **US1, US2, and US3's phases are NOT cleanly parallel across people**,
  despite each being independently testable once built: `T006`/`T011`+`T012`/
  `T017` all add functions to the *same* `frontend/src/lib/supportTemplates.js`
  file, `T007`/`T013`/`T018` all add cases to the *same*
  `supportTemplates.test.js`, and `T008`/`T014`/`T019` all edit the *same*
  `SupportOps.jsx`. Two people editing these concurrently on separate
  branches will hit merge conflicts even though their additions are
  logically independent (non-overlapping functions/UI sections) — this is
  parallelism by **branch discipline and coordination** (agree on who
  merges first, rebase after), not the dependency-free parallelism the `[P]`
  marker denotes elsewhere in this document. Treat "can be worked on by
  different people" and "can run with zero coordination" as different
  claims — only the Foundational-phase and same-story test-file pairings
  above are the latter.

---

## Parallel Example: Foundational + User Story 1

```bash
# Foundational — after T002 (endpoint) exists:
Task: "Add POST /api/support-ops/{id}/generation-log route in backend/routes/api.php"
Task: "Add logSupportGeneration client function in frontend/src/lib/api.js"

# User Story 1 — after Foundational completes:
Task: "Create frontend/src/lib/supportTemplates.js with the 7 template functions"
Task: "Create frontend/src/lib/supportTemplates.test.js with unit tests for all 7 stages"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — every story's audit call
   depends on it).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: run quickstart.md Scenarios 1–2 independently.
5. Deploy/demo if ready — client status updates alone are the highest-value
   slice (spec.md's "Why this priority" for US1).

### Incremental Delivery

1. Setup + Foundational → shared generation-log endpoint ready.
2. Add User Story 1 → validate → deploy/demo (MVP).
3. Add User Story 2 → validate → deploy/demo (technical triage added).
4. Add User Story 3 → validate → deploy/demo (freeform composer added).
5. Polish → full cross-cutting verification (audit trigger boundaries,
   privacy notice on all three artifacts, DPA snapshot-consistency edge
   cases, XSS safety, full regression suite).

### Parallel Team Strategy

With two developers past Foundational: Developer A takes US1, Developer B
takes US2 — both touch `supportTemplates.js`/`SupportOps.jsx`, so this is
coordinated parallel work (agree on merge order, rebase after, per the
"Parallel Opportunities" note above), not the dependency-free `[P]`
parallelism this document uses elsewhere. Design overlap is minimal (each
adds independent functions/UI sections), so the coordination cost is merge
mechanics only — but it is real and should be planned for, not assumed away.
US3 is small enough to fold in afterward by either developer.

---

## Notes

- [P] tasks = different concerns/files, no dependencies between them.
- [Story] label maps task to specific user story for traceability.
- This feature has no migration task anywhere — verify that stays true
  during implementation; if a need for a new column emerges, treat that as
  a signal to revisit scope against the Assumptions in spec.md, not a cue to
  quietly add one.
- Commit after each task or logical group, consistent with prior features in
  this project.
- Stop at each checkpoint to validate a story independently before moving on.
- **FR-016 discipline**: T008, T014, and T019 each carry an explicit
  reminder to generate from `selectedIssue` (last-saved), never `form`
  (in-progress unsaved edits in the same modal) — this is easy to get wrong
  because `form` is the parameter `extraFields(form, setForm)` actually
  receives, so reaching for `selectedIssue` instead requires deliberately
  using the closure, not the parameter. Double-check this specifically in
  code review for all three tasks; it's the one place a natural
  implementation shortcut would silently reopen the exact disclosure/audit
  divergence the rest of this feature's design works hard to prevent.
