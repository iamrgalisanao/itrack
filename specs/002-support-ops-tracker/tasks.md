---

description: "Task list for the Support Ops Tracker (Phase 1) feature"
---

# Tasks: Support Ops Tracker (Phase 1)

**Input**: Design documents from `/specs/002-support-ops-tracker/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/support-ops-api.md, quickstart.md. Depends on
`001-real-auth-cutover` already being merged (real `request->user()->role`
is what every access check here relies on).

**Tests**: Unlike `001-real-auth-cutover` (which made no backend changes),
this feature adds real backend code, so per Constitution Principle III
automated PHPUnit Feature tests are mandatory, not optional — they appear as
explicit test tasks within each backend-touching story. Frontend has no test
runner in this repo (unchanged from 001), so frontend verification is
manual, using quickstart.md's scenarios.

**Organization**: Tasks are grouped by user story (from spec.md, in priority
order) to enable independent implementation and verification of each story.

**Revision note**: This version incorporates all four `/speckit-analyze`
findings — T008 (G1: moving issues between board columns, FR-004 had zero
coverage), T027 (G2: general edit-and-save in the detail modal, US4
Acceptance Scenario 2 had zero coverage beyond display + one specific
action), T018's null-role case (G3, matching T011's existing pattern), and
T016's explicit project-scoping decision (U1: the intake form inherits the
board's currently-selected project rather than having its own picker).

**Post-implementation correction**: After T005–T018 were built, the user
flagged that the "Needs TSMS Check" column and the "Endpoint or workflow"
field were too specific to one project's tooling (TSMS) to be usable by
every project. Renamed throughout spec.md, data-model.md,
contracts/support-ops-api.md, this file, and the actual code/tests:
"Needs TSMS Check" → **"Needs Investigation"**; the `endpoint` field →
**`affected_area`** ("Area or workflow affected"). The backing `status`
values (`not_started`, etc.) and all access-control logic are unchanged —
this was a labeling/field-naming fix only, confirmed via the full test
suite (80/80 passing) after the rename.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- All file paths are relative to the repository root

---

## Phase 1: Setup

- [x] T001 Confirm local environment is ready: backend serving at
      `localhost:8000`, frontend serving at `localhost:5173` (both already
      running from `001-real-auth-cutover`), and confirm you can sign in as
      `pm@itrack.test`, `team@itrack.test`, `depthead@itrack.test`, and
      `client@itrack.test` (all password `password`) — per quickstart.md
      Prerequisites. **Confirmed**: both servers running (correct itrack
      processes, not a stray project); all 4 accounts authenticate (200).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and model changes every other phase reads from or
writes to.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Create migration
      `backend/database/migrations/<timestamp>_add_support_fields_to_detailed_activities_table.php`
      adding 10 nullable columns to `detailed_activities` per data-model.md:
      `work_type` (string, default `'project'`), `client_name`,
      `tenant_name`, `channel`, `client_priority` (all string, nullable),
      `last_client_update_at` (timestamp, nullable), `next_action`,
      `evidence`, `root_cause`, `resolution` (all text, nullable). Run
      `php artisan migrate`. **Applied** — all 10 columns confirmed present;
      all 70 existing tasks defaulted to `work_type: project`.
- [x] T003 [P] In `backend/app/Models/DetailedActivity.php`: add the 10 new
      fields to `$fillable`, and add `'last_client_update_at' => 'datetime'`
      to `$casts`. **Confirmed** via tinker: fillable includes the new
      fields, cast is registered.
- [x] T004 [P] Create `backend/app/Http/Resources/SupportIssueResource.php`
      per the shape documented in `contracts/support-ops-api.md` — this is
      new code, so per Constitution Principle II it uses a proper API
      Resource from the start (unlike the pre-existing
      `DetailedActivityController`, which is not being retrofitted).
      **Confirmed** via smoke test against a real record — correct shape,
      no syntax errors.

**Checkpoint**: Schema and model support the new fields. User story
implementation can begin.

---

## Phase 3: User Story 1 - Triage support work on its own board (Priority: P1) 🎯 MVP

**Goal**: Internal users can view a dedicated `/support-ops` board scoped to
one project, showing only support-type tasks in six columns, move issues
between those columns, and none of this changes the existing Kanban Board,
Work Program, or Reports.

**Independent Test**: Per quickstart.md Scenario 1 & 2 — sign in as an
internal user, load `/support-ops`, confirm the six columns and correct
scoping; move a card between columns and confirm its status updates;
confirm `/kanban` for the same project is unaffected; confirm Client role
is denied and Department Head can view.

### Implementation for User Story 1

- [x] T005 [US1] Create `backend/app/Http/Controllers/SupportOpsController.php`
      with an `index(Request $request)` method: requires `project_id` query
      param, queries `DetailedActivity` across the project's full
      Module→Activity→SubActivity hierarchy filtered by `work_type` (from
      the `work_types` query param, comma-separated, default `support`),
      returns `SupportIssueResource::collection(...)`. View access check is
      **inclusion-based**: `isAdmin() || isProjectManager() ||
      isTeamMember() || isDepartmentHead()` — grant only these four roles,
      deny everyone else including Client and any null/unrecognized role.
      Do **not** write this as a deny-list (e.g. "block only if Client") —
      that's the exact fail-open shape `/speckit-analyze` caught and fixed
      in `001-real-auth-cutover`'s `KanbanGuard`; this backend endpoint must
      not repeat it.
- [x] T006 [US1] In `backend/routes/api.php`: add
      `Route::get('support-ops', [SupportOpsController::class, 'index'])`
      inside the existing `auth:sanctum` middleware group.
- [x] T007 [US1] Create `frontend/src/pages/SupportOps.jsx` with: a project
      selector (reuse the existing project-loading pattern from
      `frontend/src/pages/WorkProgram.jsx` or `Schedule.jsx`), and a
      6-column board (Intake / Needs Info / Needs Investigation /
      Investigating / Client Update Due / Resolved) mapping to backing
      status values `backlog` / `blocked`+`delayed` / `not_started` /
      `in_progress` / `for_review` / `completed` per data-model.md — the
      Needs Info column MUST include both `blocked` and `delayed` tasks,
      matching `Kanban.jsx`'s existing equivalence for those two statuses.
- [x] T008 [US1] In `frontend/src/pages/SupportOps.jsx`: implement moving an
      issue between columns (drag-and-drop, matching the existing pattern
      in `frontend/src/pages/Kanban.jsx`, or a per-card status `<Select>` if
      drag-and-drop proves too heavy for Phase 1) that calls the existing
      `updateDetailedActivity(id, { status })` client function per the
      status→column mapping in data-model.md — satisfies FR-004. When
      moving a card into the "Needs Info" column, write `status: 'blocked'`
      (not `'delayed'`), matching `Kanban.jsx`'s own convention of writing
      `blocked` and treating `delayed` as a read-side equivalence only, not
      something newly assigned from the UI.
- [x] T009 [US1] In `frontend/src/lib/api.js`: add
      `fetchSupportIssues(projectId, workTypes = 'support')` calling
      `GET /support-ops` with `{ params: { project_id: projectId, work_types: workTypes } }`.
- [x] T010 [US1] In `frontend/src/App.jsx`: add a `/support-ops` route
      element wrapped in a new `SupportOpsGuard` (mirroring the now-fixed
      `KanbanGuard` pattern — inclusion-based: grant only Admin, Project
      Manager, Team Member, Department Head via `useAuth().user?.role`, deny
      everyone else), and add a "Support Ops" nav item (suggested icon:
      `MessagesSquare` from `lucide-react`, per
      `docs/support_ops_module_plan.md`) to `NAV_ITEMS`, hidden for Client
      the same way the Kanban Board entry already is.
- [x] T011 [US1] Backend Feature test
      `backend/tests/Feature/SupportOpsControllerTest.php`: `index` returns
      only `work_type = support` tasks scoped to the given `project_id`;
      Client role gets `403`; a user with `role = null` gets `403`
      (fail-closed); Department Head gets `200` (view-only, per FR-011).
      Also assert existing `RoleAccessTest`/`AuthenticationTest` still pass
      unmodified (no regression from adding the new route). **Confirmed**:
      7 new tests / 12 assertions pass; full suite (76 tests / 273
      assertions) passes with zero regressions.
- [x] T012 [US1] Manual verification: run quickstart.md Scenario 1
      (dedicated board, Kanban/Work Program unaffected, moving a card
      between columns updates status) and Scenario 2 (Client denied,
      Department Head can view). **Confirmed by the user**: board renders
      correctly for PM and Department Head; Client denied; a test issue
      dragged from Intake to Needs Info on Support Ops correctly wrote
      `status: blocked`, and the same task appeared under Kanban's
      "Blocked / Delayed" column — proving the shared-record design (FR-004)
      works end to end. Test issue deleted after verification.

**Checkpoint**: The board exists, is correctly scoped and access-controlled,
supports moving issues between columns, and nothing else in the app changed.

---

## Phase 4: User Story 2 - Log a new client issue quickly (Priority: P1)

**Goal**: An internal user with write access can create a new support issue
in one form, without navigating the full project/module/activity picker
flow.

**Independent Test**: Per quickstart.md Scenario 3 — as a Team Member,
submit quick intake and confirm a new Intake-column card appears with
`work_type: support`, `status: backlog`, `progress: 0`, and that a
"Support Requests" module now exists under the target project.

### Implementation for User Story 2

- [x] T013 [US2] In `SupportOpsController`, add a `store(Request $request)`
      method: find-or-create `Module`/`Activity`/`SubActivity` scoped to
      `project_id` keyed on `code = 'SUPPORT-OPS'` (per data-model.md),
      validate the intake payload per `contracts/support-ops-api.md`
      (`project_id`, `name`, `client_name`, `client_priority` required;
      `tenant_name`, `channel`, `timestamp`, `affected_area`,
      `expected_behavior`, `actual_behavior`, `evidence`, `next_action`
      nullable), compose `timestamp`/`affected_area`/`expected_behavior`/
      `actual_behavior` into the `description` field as a structured text
      block (these four are intake-form-only inputs, not new columns — see
      contracts doc), and create the `DetailedActivity` under the resolved
      Sub-Activity with `work_type: support`, `status: backlog`,
      `progress: 0`, `client_visible: false`.
- [x] T014 [US2] In `SupportOpsController::store()`: gate write access with
      `canWrite()` (Admin, Project Manager, Team Member only — **not**
      Department Head, matching `DetailedActivityController::store()`'s
      exact existing rule). On denial, call
      `AuditLogger::denied($request, 'support_issue.create', 'detailed_activity')`
      and return `403` with the same message style
      `DetailedActivityController` already uses. On success, call
      `AuditLogger::record()` with event `support_issue.created`, following
      the exact pattern already used for `task.created`.
- [x] T015 [US2] In `backend/routes/api.php`: add
      `Route::post('support-ops', [SupportOpsController::class, 'store'])`
      inside the `auth:sanctum` group.
- [x] T016 [US2] In `frontend/src/pages/SupportOps.jsx`: add a quick-intake
      form/modal capturing client, tenant, channel, priority, issue title,
      timestamp, affected area/workflow, expected behavior, actual behavior,
      evidence, and next action, with required-field validation (client,
      priority, issue title) blocking submission client-side before it
      reaches the API. The form does **not** have its own project picker —
      it inherits the project already selected on the board (T007);
      opening quick intake without a project selected first is disabled.
- [x] T017 [US2] In `frontend/src/lib/api.js`: add
      `createSupportIssue(data)` calling `POST /support-ops`.
- [x] T018 [US2] Extend `SupportOpsControllerTest`: `store` creates the
      auto-provisioned hierarchy on first call and reuses it (idempotent) on
      a second call for the same project; created issue has the correct
      defaults; `AuditLogger` records `support_issue.created`; Department
      Head and Client both get `403` on `store` (even though Department Head
      passed `index`'s view check in T011); a user with `role = null` also
      gets `403` on `store` (fail-closed), mirroring T011's null-role case
      for `index` — don't leave this endpoint's fail-closed behavior
      untested just because it happens to require one more auth-state setup
      than the role-based cases. **Confirmed**: 4 new tests / 21 assertions
      pass; full suite (80 tests / 294 assertions) passes with zero
      regressions. Also smoke-tested the full create flow via the real API
      (csrf-cookie → login → POST /support-ops) — 201, correct field
      composition, auto-provisioned hierarchy confirmed idempotent; test
      record and its auto-provisioned chain deleted after verification.
- [x] T019 [US2] Manual verification: run quickstart.md Scenario 3
      (quick intake as a Team Member, confirm card + auto-provisioned
      module). **Confirmed working by the user.**

**Checkpoint**: Users can log new issues in one form; MVP (US1 + US2) is
functionally complete.

---

## Phase 5: User Story 3 - See which issues need a client update now (Priority: P2)

**Goal**: Open issues that have gone too long without a client update are
visually flagged on the board, using the P1/P2/P3 thresholds.

**Independent Test**: Per quickstart.md Scenario 4 — backdate a P1 issue's
`last_client_update_at` past 1 hour and confirm it's flagged; confirm a
fresh P2 issue under 4 hours is not; confirm a Resolved issue is never
flagged; confirm a no-priority issue shows as "priority not set," not
flagged either way.

### Implementation for User Story 3

- [x] T020 [US3] In `frontend/src/pages/SupportOps.jsx`: compute staleness
      per issue from `client_priority` + `last_client_update_at`, applied
      only when `status !== 'completed'` — P1 → 1 hour, P2 → 4 hours,
      P3 → 1 business day (per data-model.md's Staleness rule table). An
      issue with no `client_priority` is neither stale nor fresh — track it
      as a distinct third state. **Implementation note**: when
      `last_client_update_at` is null (no explicit client update recorded
      yet), the clock starts from `created_at` instead — not addressed
      explicitly in data-model.md, added as a reasonable default so a fresh
      P1 intake doesn't sit in permanent limbo. P3's "1 business day" skips
      weekends (not public holidays — out of scope for Phase 1). **Verified**
      with a standalone 10-case test covering all three states, the
      resolved-never-flagged rule, weekend-skipping, and the `created_at`
      fallback — all pass.
- [x] T021 [US3] In `frontend/src/pages/SupportOps.jsx`: visually
      distinguish all three states on each card — stale (flagged), fresh
      (unflagged), and priority-not-set (visibly distinct from both, e.g. a
      muted "no priority" badge). Stale issues get a destructive left border
      plus a "Needs update" badge; no-priority issues get a dashed muted
      badge; fresh issues get neither.
- [x] T022 [US3] Manual verification: run quickstart.md Scenario 4 (all four
      staleness sub-scenarios: stale P1, fresh P2, resolved-never-flagged,
      no-priority-distinct). **Confirmed by the user.**

**Checkpoint**: Staleness is visible on the board without manual timestamp
checking.

---

## Phase 6: User Story 4 - Track full investigation context on an issue (Priority: P2)

**Goal**: Every support-specific field is visible and editable from a detail
view, alongside the task's existing comments and attachments — and Team
Members (not just PM/Admin) can actually edit them.

**Independent Test**: Per quickstart.md Scenario 5 — open an issue's detail
view, edit `next_action` and `root_cause` as a Team Member, save, reopen,
confirm persistence; confirm Department Head is denied on write.

### Implementation for User Story 4

- [x] T023 [US4] In `backend/app/Http/Controllers/DetailedActivityController.php`,
      `update()` method: add the 10 new fields to the validation array per
      data-model.md's rules (`work_type`, `client_priority` as `in:` lists;
      the rest as nullable string/text/date).
- [x] T024 [US4] In the same `update()` method: extend the
      `$allowedForTeamMember` array to include all 10 new fields — without
      this, a Team Member editing a support issue would be silently
      stripped down to just `status`/`progress`/`notes`/`output`/
      `actual_start_date`/`actual_end_date`, unable to update
      `next_action`, `evidence`, `root_cause`, `resolution`,
      `client_priority`, `last_client_update_at`, `client_name`,
      `tenant_name`, `channel`, or `work_type`.
- [x] T025 [US4] Backend Feature test (new file or extend
      `RoleAccessTest`/`SupportOpsControllerTest`): a Team Member can update
      `next_action`, `client_priority`, and `resolution` on an existing
      support issue via `PUT /detailed-activities/{id}` and the changes
      persist; a Department Head attempting the same request still gets
      `403` (the `canWrite()` gate upstream of the allow-list is unchanged).
      **Confirmed**: 2 new tests added; full suite 82/82 passing.
- [x] T026 [US4] **Architecture change (user-approved)**: extract
      `frontend/src/pages/Kanban.jsx`'s inline task detail modal (the
      `isEditModalOpen`/`selectedTask`/`modalTab` JSX block, Details/Comments/
      Files tabs, `TaskComments`/`TaskFiles` integration) into a new shared
      `frontend/src/components/TaskDetailModal.jsx` taking `task`, `onClose`,
      `onSave(updatedTask)`, `userRole`, and an optional `extraFields` slot
      (render prop or children) for fields specific to the calling page.
      Update `Kanban.jsx` to render `<TaskDetailModal>` with no `extraFields`
      instead of its inline JSX. **Kanban's own behavior must not change** —
      this is a refactor, not a feature change. Keep Kanban's `type`-based
      internal priority field exactly as it is; it is a different concept
      from Support Ops' `client_priority` and must not be merged into one
      control. **Done**: `TaskDetailModal.jsx` created; `Kanban.jsx`'s inline
      modal JSX, its now-redundant `modalTab`/`commentCount`/`fileCount`/
      `isSaving` state, and its now-unused `X`/`MessageSquare`/`Paperclip`/
      `TaskComments`/`TaskFiles` imports removed. Lint confirms zero new
      issues in either file (same pre-existing baseline errors, unrelated to
      this change, still present at shifted line numbers only).
- [x] T027 [US4] In `frontend/src/pages/SupportOps.jsx`: render
      `<TaskDetailModal>` for the selected issue, passing an `extraFields`
      section with editable inputs for `client_name`, `tenant_name`,
      `channel`, `client_priority`, `next_action`, `evidence`, `root_cause`,
      and `resolution` — these save through the same `onSave` path as the
      base modal (one "Save Changes" button covers both base and
      support-specific fields), satisfying US4 Acceptance Scenario 2 (edit
      and persist `next_action`/`evidence`/`root_cause`/`resolution`).
- [x] T028 [US4] In `SupportOps.jsx`'s `extraFields` section: add a "Record
      client update" action, separate from the general Save button, that
      sets `last_client_update_at` to now via `updateDetailedActivity()` and
      immediately clears any stale flag on that card in the board view (no
      full page reload needed) — this is a fast single-click action, not
      part of the general edit form.
- [x] T029 [US4] Confirm `frontend/src/lib/api.js`'s existing
      `updateDetailedActivity(id, data)` (already present, unmodified) is
      sufficient for saving both the base and support-specific fields
      through `TaskDetailModal`'s shared `onSave` — no new client function
      needed.
- [x] T030 [US4] Manual verification: run quickstart.md Scenario 5 (detail
      view fields + comments/attachments reuse, general field edit-and-save
      from T027, Team Member can edit new fields, Department Head denied on
      write) **plus a Kanban Board regression check** — open an existing
      Kanban task's detail modal post-extraction and confirm it looks and
      behaves exactly as it did before (Details/Comments/Files tabs, save,
      `type`-based priority field unchanged). **Confirmed by the user** —
      including the intake-modal visual-consistency fix along the way.

**Checkpoint**: Issues have working memory — investigation context
persists and is editable by the people actually doing the work.

---

## Phase 7: User Story 5 - Narrow the board to what matters right now (Priority: P3)

**Goal**: The board can be filtered by client, tenant, priority, work type,
and staleness; `learning`-type entries stay hidden unless explicitly
requested.

**Independent Test**: Per quickstart.md Scenario 6 — filter by client,
confirm only that client's issues show; filter to "needs update," confirm
only stale issues show; toggle the Learning filter, confirm learning entries
appear only then.

### Implementation for User Story 5

- [x] T031 [US5] In `frontend/src/pages/SupportOps.jsx`: add filter controls
      for client, tenant, priority, work type, and "needs update"
      (staleness from US3), applied client-side over the already-fetched
      issue list. **Implementation note**: "work type" filtering is covered
      by T032's Learning toggle (which controls the server fetch scope
      itself) — a separate client-side work-type dropdown wasn't added
      since Phase 1 intake only ever creates `work_type: support`, so there
      is nothing else to filter among until a future phase adds more create
      paths.
- [x] T032 [US5] In `frontend/src/pages/SupportOps.jsx`: add a "Learning"
      filter toggle that re-calls `fetchSupportIssues(projectId,
      'support,learning')` when enabled, and `'support'` (default) when
      disabled — `learning`-type entries never appear unless this is on
      (FR-012).
- [x] T033 [US5] Manual verification: run quickstart.md Scenario 6 (client
      filter, needs-update filter, Learning toggle). **Confirmed by the user.**

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T034 Run `cd backend && php artisan test` and confirm every existing
      test plus the new `SupportOpsControllerTest` cases pass — zero
      regressions (SC-004). **Confirmed**: 82/82 passing, 299 assertions.
- [x] T035 Manual regression check: confirm Reports & Health and Schedule
      View render unchanged for a project that now contains support-type
      tasks (FR-010) — per quickstart.md's Regression check section.
      **Confirmed via code** (`grep -r work_type` across every backend
      controller and `Reports.jsx`/`Schedule.jsx`/`WorkProgram.jsx` returns
      zero matches outside the Support Ops files) **and by the user visually
      in-browser.**
- [x] T036 Run the full quickstart.md validation end-to-end (all 6
      scenarios) as a final sign-off pass. **Confirmed by the user.**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
  (the new columns/model fields/resource don't exist until this completes)
- **User Story 1 (Phase 3)**: Depends on Foundational only — this is the MVP
  board (view + move)
- **User Story 2 (Phase 4)**: Depends on Foundational; in practice also
  depends on US1 (there's no board to see the new card appear on until T007
  exists), so implement after US1 — together US1+US2 are the MVP
- **User Story 3 (Phase 5)**: Depends on Foundational + US1 (needs the board
  and the fetched issue data to compute staleness against)
- **User Story 4 (Phase 6)**: Depends on Foundational + US1; independent of
  US2/US3 — could be built in parallel with US3 by a second person
- **User Story 5 (Phase 7)**: Depends on Foundational + US1 + US3 (needs-update
  filter depends on US3's staleness computation existing)
- **Polish (Phase 8)**: Depends on all five user stories being complete

### Within Each User Story

- US1: T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012
- US2: T013 → T014 → T015 → T016 → T017 → T018 → T019
- US3: T020 → T021 → T022
- US4: T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030
- US5: T031 → T032 → T033

### Parallel Opportunities

- T003 and T004 (Foundational) touch different files and can run in
  parallel.
- US3 (Phase 5) and US4 (Phase 6) are independent of each other once US1 is
  done — a team of two could split them.
- Within US1, T009 (`lib/api.js`) could be done in parallel with T007/T008
  (`SupportOps.jsx`) by different people, but both depend on T006 (route
  must exist) — sequential is simpler for one implementer.

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 (Setup) and Phase 2 (Foundational)
2. Complete Phase 3 (User Story 1) — a board exists and issues can be moved
   between columns
3. Complete Phase 4 (User Story 2) — issues can actually be logged
4. **STOP and VALIDATE**: run quickstart.md Scenarios 1–3 before continuing
5. This is the real MVP — a team can start using Support Ops for intake and
   triage even before staleness flagging or the detail view exist

### Incremental Delivery

1. Setup + Foundational → schema ready
2. US1 → board exists, correctly scoped and access-controlled, movable
3. US2 → issues can be logged (MVP complete)
4. US3 → staleness visible
5. US4 → full investigation context, editable by Team Members
6. US5 → filtering for when volume grows
7. Polish → full regression + sign-off pass

---

## Analysis remediation log

All four `/speckit-analyze` findings for this feature are now folded in:

| Finding | Severity | Resolution |
|---|---|---|
| G1 — moving issues between columns had zero task coverage (FR-004) | CRITICAL | T008 added |
| G2 — detail modal had no general edit-and-save (US4 Scenario 2) | HIGH | T027 added |
| G3 — `store` test lacked a null-role case, unlike `index`'s test | MEDIUM | Folded into T018 |
| U1 — intake form's project-scoping was left implicit | LOW | Resolved in T016: inherits the board's selected project |
