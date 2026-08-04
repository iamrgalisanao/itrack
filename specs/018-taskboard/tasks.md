---

description: "Task list for 018-taskboard"
---

# Tasks: Taskboard

**Input**: Design documents from `/specs/018-taskboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — this feature has real authorization/tenant-isolation, idempotency,
and notification-dedup behavior that must be test-backed per Constitution Principle III
and VIII, matching 013–017's precedent.

**Organization**: Tasks are grouped by user story (US1/US2/US3, priority order from
spec.md) after Setup/Foundational phases shared by all three.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (plan/create tasks under an Epic), US2 (assign + notify), US3 (read-only view + Client denial)

## Path Conventions

Existing web app structure: `backend/app/...`, `backend/database/migrations/...`,
`backend/tests/Feature/...`, `frontend/src/...`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Create migration `backend/database/migrations/2026_08_0X_add_taskboard_fields_to_detailed_activities_table.php` per data-model.md: `priority` (nullable string), `estimated_story_points` (nullable unsigned small int), `sprint_label` (nullable string, max 100), `assignee_user_id` (nullable FK → users, `nullOnDelete()`). No `task_type`, no `actual_story_points` (research.md, spec.md Assumptions).
- [X] T002 [P] Extend `backend/app/Models/DetailedActivity.php`: add the four new fields to `$fillable`, add `'estimated_story_points' => 'integer'` to `$casts`, add `assignee(): BelongsTo` relation, add `PRIORITY_*`/`PRIORITIES` constants reusing `Bug`'s exact vocabulary (data-model.md).
- [X] T003 [P] Extend `backend/app/Services/AuditLogger.php`: change `record()`'s return type from `void` to `?AuditLog`, returning the created row (`return AuditLog::create([...]);`) — verified additive, no existing call site uses the return value (research.md D5).

**Checkpoint**: Schema and model shape exist; no endpoints yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create `backend/app/Http/Controllers/TaskboardController.php` with shared access helpers only (no bodies yet): resolve the acting user via `AccessContext::user($request)` (matching `BugController`'s pattern), and note the two role checks this controller will use — `Project::accessibleTo()` for read access, `isPmOrAdmin()` for write access (verified as `DetailedActivityController::store()`'s actual existing gate, plan.md).
- [X] T005 Register routes in `backend/routes/api.php`: `GET/POST /projects/{project}/taskboard/tasks`, inside the existing authenticated route group, near the Bug Tracker block.
- [X] T006 [P] Add `fetchTaskboardTasks(projectId)`, `createTaskboardTask(projectId, data)` to `frontend/src/lib/api.js`, under a `// Taskboard` banner, matching the existing flat function-per-endpoint convention.
- [X] T007 [P] In `frontend/src/pages/WorkProgram.jsx`: extend `viewMode` to a 3-way value (`'list'|'gantt'|'taskboard'`, `?view=taskboard` URL param), add a third toggle pill wrapped in `{!isClient && (...)}` (spec FR-008 — Client never sees this option), and normalize a manually-typed `view=taskboard` back to `list` when `isClient` is true.
- [X] T008 [P] Create a skeleton `frontend/src/components/TaskboardView.jsx` (project/Epic-aware empty state, no fetch/CRUD yet), imported and mounted by `WorkProgram.jsx`'s new third branch.

**Checkpoint**: Routes exist and return (empty/stub) responses; the toggle is reachable for internal roles and correctly absent/normalized for Client. Foundation ready for all three user stories.

---

## Phase 3: User Story 1 - Plan and create tasks under an Epic (Priority: P1) 🎯 MVP

**Goal**: Admin/PM can create tasks against an Epic (Module) from a new grouped
Taskboard view, without needing to touch Activity/SubActivity at all.

**Independent Test**: As Admin/PM, open the Taskboard, create a task against a
never-before-used Epic, and confirm it appears grouped correctly with no manual
structural setup (spec.md US1 Independent Test).

### Tests for User Story 1

- [X] T009 [P] [US1] Test in `backend/tests/Feature/TaskboardTest.php`: Admin/PM with project access creates a task against a fresh Module → 201, task appears under the resolved `Taskboard`/`Unclassified Tasks` container (contracts/taskboard-api.md POST test cases).
- [X] T010 [P] [US1] Test: two Taskboard task creations against the same fresh Module produce exactly one `Taskboard` Activity and one `Unclassified Tasks` SubActivity, not two (data-model.md idempotency).
- [X] T011 [P] [US1] Test: `module_id` belonging to a different project than the URL's `{project}` is rejected (422/403) — the IDOR case since `module_id` is client-supplied.
- [X] T012 [P] [US1] Test: `sprint_label` normalization — `"Sprint 1"`, `" Sprint 1"`, `"Sprint 1 "` all persist as `"Sprint 1"`; `""` and `"   "` both persist as `null` (research.md D6), verified as separate assertions since they're different outcomes.
- [X] T013 [P] [US1] Test: missing required title → 422; invalid `priority` → 422; `estimated_story_points` rejects negative ints and values over 100.
- [X] T014 [P] [US1] Test: Team Member/Department Head/Client attempting `POST .../taskboard/tasks` → 403 (create is `isPmOrAdmin()`-only, stricter than `update()`'s `canWrite()`).
- [X] T015 [P] [US1] Test: an Activity named `Taskboard` with existing Taskboard-created child tasks cannot be deleted via `ActivityController::destroy()` (409); an empty Activity sharing that name deletes normally. Same pair of cases for `SubActivityController::destroy()` and `Unclassified Tasks` (data-model.md deletion guard, contracts/taskboard-api.md DELETE test cases).

### Implementation for User Story 1

- [X] T016 [US1] Implement `TaskboardController::resolveDefaultSubActivity(int $moduleId): SubActivity` per data-model.md: locks the Module row (`lockForUpdate()`), reuses-or-creates the `Taskboard` Activity and `Unclassified Tasks` SubActivity, does **not** open its own transaction (research.md D2 — the caller owns the single transaction).
- [X] T017 [US1] Implement `TaskboardController::index(Request $request, Project $project)`: project-access gate, `DetailedActivity::query()->whereHas('subActivity.activity.module', ...)->with(['subActivity.activity.module', 'assignee'])->get()`, Client role denied entirely at this endpoint (spec FR-008 — no client_visible-style partial filter here, unlike Bug Tracker), returns `DetailedActivityResource::collection(...)`.
- [X] T018 [US1] Implement `TaskboardController::store(Request $request, Project $project)`: `isPmOrAdmin()` gate, validates `module_id`/`name`/`priority`/`estimated_story_points`/`sprint_label` per data-model.md. Include `assignee_user_id` in the same validation array now, with its base rule (`nullable|integer`, `Rule::exists('users','id')->where(...)` excluding Client role) — this key must exist in `$validated` so T030's project-access closure has something to attach to. Wraps `resolveDefaultSubActivity()` + `detailedActivities()->create()` in one `DB::transaction()`, writes `AuditLogger::record($request, 'task.created', 'detailed_activity', $task->id, ...)`.
      *Note: T030 (US2) adds a second, stricter check on top of this same `assignee_user_id` rule — it does not introduce a new field.*
- [X] T019 [US1] Add the reserved-name deletion guard to `backend/app/Http/Controllers/ActivityController.php::destroy()`: reject (409) when `$activity->name === 'Taskboard'` and it has any SubActivity/DetailedActivity descendants.
- [X] T020 [US1] Add the reserved-name deletion guard to `backend/app/Http/Controllers/SubActivityController.php::destroy()`: reject (409) when `$subActivity->name === 'Unclassified Tasks'` and it has any `DetailedActivity` children.
- [X] T021 [US1] Extend `backend/app/Http/Resources/DetailedActivityResource.php`: add `priority`, `estimated_story_points`, `sprint_label`, `assignee_user_id`, and a nested `assignee` object to the non-Client branch only (data-model.md — Client branch untouched).
- [X] T022 [US1] Build out `frontend/src/components/TaskboardView.jsx`: fetch via `fetchTaskboardTasks`, group client-side by `sprint_label` with a literal `'Backlog'` bucket first then remaining labels alpha-sorted, render each group as `Collapsible` + `Table` (columns: Task, Epic, Status, Priority badge, Points, Assignee) with a per-group point-sum header (sum of `estimated_story_points`, treating `null` as 0, showing "0 points" when none — data-model.md).
- [X] T023 [US1] Add the "New Task" create dialog to `TaskboardView.jsx` (Epic/Module picker + title/priority/points/sprint-label fields — assignee field added in US2), calling `createTaskboardTask`.
- [X] T024 [US1] Relabel `frontend/src/components/TaskDetailModal.jsx`'s existing "Priority" UI text (~line 491, bound to `form.type`) to "Type" — no data change, purely the label (research.md D7) — done now, before US2 adds the new real Priority field to the same modal, so the two are never simultaneously mislabeled.

**Checkpoint**: User Story 1 is fully functional and independently testable — Admin/PM
can create and view grouped tasks under any Epic.

---

## Phase 4: User Story 2 - Assign work and get notified (Priority: P2)

**Goal**: Admin/PM can assign tasks to team members with real project-access
validation; assignment notifications fire correctly, including on reassignment back to
a prior assignee.

**Independent Test**: Assign a task, reassign to someone else, reassign back to the
first person — confirm three separate notifications, not fewer (spec.md US2
Independent Test).

### Tests for User Story 2

- [X] T025 [P] [US2] Test in `TaskboardTest.php`: assigning a task on create fires exactly one `Notification` row with `recipient_user_id` set and `detailed_activity_id` equal to the task's own id (the real FK, not null — research.md D5).
- [X] T026 [P] [US2] Test: reassigning to a different user via `update()` fires exactly one new notification; resubmitting the same assignee fires none; clearing the assignee fires none.
- [X] T027 [P] [US2] Test: the full sequence assign-A → assign-B → assign-A-again produces three notifications total, not two — proving the dedup key isn't permanently keyed on the task+recipient pair (research.md D5).
- [X] T028 [P] [US2] Test: a same-second variant of the assign-A → assign-B → assign-A sequence (three rapid updates, no artificial delay) still produces three notifications — proving the audit-log-id-based key doesn't collide the way a timestamp-based key could.
- [X] T029 [P] [US2] Test: `assignee_user_id` referencing a real, non-Client internal user who has no access to the target project is rejected (422) on both create and update — the case a plain `exists:users,id` rule alone would pass (research.md D4).

### Implementation for User Story 2

- [X] T030 [US2] Add an `internalUserHasProjectAccess` validation helper (or equivalent closure) shared by `TaskboardController::store()` and `DetailedActivityController::update()`: after the base `exists:users,id`-plus-not-Client rule passes, additionally requires `Project::query()->accessibleTo($candidate)->whereKey($project->id)->exists()` (data-model.md, research.md D4).
- [X] T031 [US2] In `TaskboardController::store()`, after the task is created: if `assignee_user_id` is set, write `AuditLogger::record($request, 'task.assigned', 'detailed_activity', $task->id, null, ['from' => null, 'to' => $task->assignee_user_id])` and, inside `DB::afterCommit()`, fire `Notification::sendNotification(...)` with `$activityId = $task->id`, `event_key = "assignment:event:{$auditEntry->id}"` (research.md D5).
- [X] T032 [US2] Apply the same assignment-notification logic to `DetailedActivityController::update()`: capture `$previousAssigneeId = $task->getOriginal('assignee_user_id')` before `$task->update($validated)`, and only write the audit row + schedule the notification when `$task->assignee_user_id !== null && $task->assignee_user_id !== $previousAssigneeId`.
- [X] T033 [US2] Add an assignee field to `TaskboardView.jsx`'s create dialog and to `TaskDetailModal.jsx`'s Details tab, sourced from the existing `fetchProjectAssignments({ project_id })` (`frontend/src/lib/api.js:214`) — not a task-derived shortlist (plan.md/research.md — the endpoint is already `isPmOrAdmin()`-gated server-side, the same role restriction as who's allowed to set an assignee at all).

**Checkpoint**: User Stories 1 AND 2 both work independently; assignment and correct
notification behavior layer cleanly on top of the P1 board.

---

## Phase 5: User Story 3 - View planning without editing (Priority: P3)

**Goal**: Team Member/Department Head see Taskboard fields read-only; any attempt to
write them through the existing update endpoint is silently ignored, not rejected with
a spurious error. Client has zero access to the Taskboard view itself.

**Independent Test**: As a Team Member, open the Taskboard and confirm every field is
visible but no control for changing it is usable; as Client, confirm the view is
entirely inaccessible (spec.md US3 Independent Test).

### Tests for User Story 3

- [X] T034 [P] [US3] Test in `TaskboardTest.php`: a Team Member submitting `priority`/`estimated_story_points`/`sprint_label`/`assignee_user_id` (including a deliberately invalid `assignee_user_id`) alongside a legitimate `status` change via the existing `update()` endpoint gets 200, `status` applied, Taskboard fields unchanged in the DB — and critically, no 422, proving the strip happens *before* validation (research.md D3, contracts/taskboard-api.md).
- [X] T035 [P] [US3] Test: Client role denied on `GET /projects/{project}/taskboard/tasks` (403, spec FR-008 — full denial, not a filtered response).
- [X] T036 [P] [US3] Test: `DetailedActivityResource`'s Client branch never exposes `priority`/`estimated_story_points`/`sprint_label`/`assignee_user_id` on any response (regression-style check, matches this project's existing "client-visible data stays explicit" delivery constraint).

### Implementation for User Story 3

- [X] T037 [US3] Extend `DetailedActivityController::update()` per research.md D3: strip `priority`/`estimated_story_points`/`sprint_label`/`assignee_user_id` from `$request->all()` *before* validation for any non-`isPmOrAdmin()` caller (`Arr::except`), add the Taskboard fields' validation rules (including T030's project-access check) applied only for `isPmOrAdmin()` callers. Do **not** add these fields to the existing `$allowedForTeamMember` allowlist (contradictory with the strip, research.md D3).
- [X] T038 [US3] In `TaskboardView.jsx` and `TaskDetailModal.jsx`, add a `canManageTaskboardFields = isPmOrAdmin(currentUser)` flag: Team Member/Department Head see Priority/Points/Sprint Label/Assignee rendered but `disabled`; only PM/Admin get live, editable inputs and the "New Task" button; `fetchProjectAssignments()` is only called when `canManageTaskboardFields` is true (plan.md — matches the endpoint's own server-side gate, avoids a pointless 403).

**Checkpoint**: All three user stories work independently and together — the full
feature described in spec.md is complete.

---

## Phase 6: Polish & Definition-of-Done Gate

**Purpose**: Constitution Principle VIII gate, applied across the whole feature.

- [X] T039 [P] Manually run quickstart.md Scenarios 1–7 against a locally running
      instance.
- [X] T040 Run `php artisan test --filter=TaskboardTest` and the full `php artisan test`
      suite — confirm no regression in `DetailedActivityController`, `ActivityController`,
      `SubActivityController`, `Kanban`, or `Notification` test coverage.
- [X] T041 Authorization review (Constitution Principle I): confirm every Taskboard
      endpoint and every extended endpoint fails closed for Client and for any role
      lacking project access — no inline role-string comparisons.
- [X] T042 Tenant/project-isolation review (Constitution Principle VIII item 3): confirm
      every query is scoped through `Project::accessibleTo()`/`DetailedActivity::isAccessibleTo()`,
      re-verify against T011/T029's IDOR-shaped test cases.
- [X] T043 OWASP review (`laravel-owasp-security`): confirm the strip-before-validate
      ordering (T037) actually prevents a Team Member from writing Taskboard fields via
      a crafted request, and that the assignee project-access check (T030) closes the
      gap a plain `exists` rule would leave open.
- [X] T044 code-slop review: confirm `TaskboardController` matches `BugController`'s
      shape (no new service class), `resolveDefaultSubActivity()` has no unnecessary
      nested transaction, and the diff doesn't introduce a "list users" endpoint that
      duplicates `GET /project-assignments`.

**Checkpoint**: All Definition-of-Done Gate items pass — feature is done.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (needs the new `DetailedActivity`
  fields to exist) — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational AND on US1's `TaskboardController::store()`
  (T018) existing to extend with assignee handling — not fully independent of US1's
  implementation tasks, though independently *testable* once T018 exists.
- **User Story 3 (Phase 5)**: Depends on Foundational AND on US1/US2's `TaskboardController`/
  `DetailedActivityController::update()` work (T018, T032) existing to extend with the
  strip-before-validate guard — same relationship as US2 to US1.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T002 and T003 [P] — model and service, different files.
- T006, T007, T008 [P] — frontend API functions, `WorkProgram.jsx` toggle wiring, and
  the `TaskboardView.jsx` skeleton are different files.
- All test tasks within a story phase (T009–T015, T025–T029, T034–T036) are [P] —
  independent test methods, typically authored together in one pass for solo execution.
- T039 (manual quickstart) can run in parallel with T040 (automated suite) — different
  verification surfaces.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks everything).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: run quickstart.md Scenarios 1–2 independently.
5. This is a usable Taskboard on its own — assignment/notifications and the
   read-only/Client-denial boundary are additive, not required for the board to be
   useful for planning and grouping.

### Incremental Delivery

1. Setup + Foundational → the toggle and routes are reachable.
2. Add US1 → Epic-scoped task creation + grouped table → validate → this is the MVP.
3. Add US2 → assignment + correct notification behavior → validate independently.
4. Add US3 → read-only enforcement + Client denial → validate independently.
5. Phase 6 → Definition-of-Done Gate across the whole feature.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- US2 and US3 each extend US1's controller methods rather than duplicating them —
  documented explicitly in Dependencies above, matching 017-bug-tracker's precedent for
  this same kind of layered-permission feature.
- Commit after each phase checkpoint, consistent with 013–017's practice.
