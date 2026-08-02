---

description: "Task list for 017-bug-tracker"
---

# Tasks: Bug Tracker

**Input**: Design documents from `/specs/017-bug-tracker/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — this feature has real authorization/tenant-isolation
and sequencing/notification-dedup behavior that must be test-backed per
Constitution Principle III and VIII, matching 013–016's precedent.

**Organization**: Tasks are grouped by user story (US1/US2/US3, priority
order from spec.md) after Setup/Foundational phases shared by all three.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (report/triage), US2 (due dates + breach notifications), US3 (Client visibility)

## Path Conventions

Existing web app structure: `backend/app/...`, `backend/database/migrations/...`, `backend/tests/Feature/...`, `frontend/src/...`.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Create migration `backend/database/migrations/2026_08_06_090000_create_bugs_table.php` per data-model.md: `project_id` (FK cascade), `bug_number` (unsigned int), unique(`project_id`,`bug_number`), `title`, `description` (nullable text), `reporter_id`/`owner_id` (FK users, `owner_id` nullable), `priority`, `status`, `sprint_label` (nullable), `due_date` (nullable date), `visibility`, `breach_notified_at` (nullable timestamp), timestamps.
- [X] T002 [P] Create `backend/app/Models/Bug.php`: `use BelongsToProject` (`resolveProjectId()` returns `project_id`), `STATUS_*`/`PRIORITY_*`/`VISIBILITY_*` constants matching data-model.md's enums, `$fillable` per sec-mass-assignment constraint (excludes `bug_number`/`project_id`), `reporter()`/`owner()` `belongsTo(User::class)`, `project()` `belongsTo(Project::class)`, a `group()` accessor implementing research.md D4's status→group map.
- [X] T003 [P] Create `backend/app/Http/Resources/BugResource.php`: exposes `id`, `bug_id` (derived `"BUG-" . str_pad(...)"`), `title`, `description`, `reporter`/`reporter_id`, `owner`/`owner_id` (nullable), `priority`, `status`, `group` (derived), `sprint_label`, `due_date`, `is_overdue` (derived), `visibility`, `created_at`/`updated_at` — never `bug_number` raw or `breach_notified_at`.

**Checkpoint**: Schema and serialization shape exist; no endpoints yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Create `backend/app/Http/Controllers/BugController.php` with the shared access helpers only (no CRUD bodies yet): constructor/private helpers mirroring `AttachmentController`'s shape — resolve the acting user via `AccessContext::user($request)`, and a private `canManage(User $user): bool` (Admin/PM/Team Member/Department Head) matching `KANBAN_INTERNAL_ROLES`'s backend equivalent.
- [X] T005 Register routes in `backend/routes/api.php`: `GET/POST /projects/{project}/bugs`, `GET/PATCH/DELETE /bugs/{bug}`, inside the existing authenticated route group.
- [X] T006 [P] Add `fetchBugs(projectId)`, `createBug(projectId, data)`, `fetchBug(id)`, `updateBug(id, data)`, `deleteBug(id)` to `frontend/src/lib/api.js`, matching the existing `fetchRetroSessions`/`createRetroSession` call shape.
- [X] T007 [P] In `frontend/src/App.jsx`: add a `BugTrackerGuard` component, a nav entry ("Bug Tracker") in `NAV_GROUPS`, and the `/bug-tracker` route wired to a new `BugTracker` page (created in T008). Every role — including Client — has a legitimate path into this feature (internal roles get full CRUD, Client gets read-only per FR-011), so `BugTrackerGuard` is a deliberate pass-through with no role check of its own: all project-level and role-level enforcement happens server-side (`BugController`) and via the page's own conditional rendering (T036), exactly like `AttachmentController`/`TaskFiles.jsx` never gate Client out of the component tree, only out of specific actions/data.
- [X] T008 [P] Create a skeleton `frontend/src/pages/BugTracker.jsx` (project selector reusing the existing project-picker pattern from `Retrospectives.jsx`, empty state, no CRUD yet).

**Checkpoint**: Routes exist and return (empty/stub) responses; the page is reachable and internal users, Client users, and unauthorized users all reach the correct guard outcome. Foundation ready for all three user stories.

---

## Phase 3: User Story 1 - Report and triage a bug (Priority: P1) 🎯 MVP

**Goal**: Internal users can create bugs and move them through the four
statuses, seeing them grouped into Incoming/Development Work/Resolved.

**Independent Test**: As an internal user with project access, create a bug
and confirm it lands in "Incoming" with a sequential Bug ID, then change
Status through to Fixed and confirm it moves through all three groups
(spec.md US1 Independent Test).

### Tests for User Story 1

- [X] T009 [P] [US1] Test in `backend/tests/Feature/BugTrackerTest.php`: internal user with project access creates a bug → 201, appears with Status "Awaiting Review", group "Incoming", `bug_id` "BUG-001".
- [X] T010 [P] [US1] Test: a second bug on the same project gets `bug_id` "BUG-002" (sequencing, research.md D2).
- [X] T011 [P] [US1] Test: deleting a bug then creating a new one never reuses a `bug_number` (contracts/bug-tracker-api.md DELETE test case).
- [X] T012 [P] [US1] Test: changing Status to "Ready for Dev"/"Fixing" places the bug in group "Development Work"; changing to "Fixed" places it in "Resolved" — including a direct "Awaiting Review" → "Fixed" jump (free-selection status model, research.md D4).
- [X] T013 [P] [US1] Test: internal user WITHOUT access to the bug's project is denied on list, create, show, update, and delete (IDOR case, laravel-owasp-security — contracts/bug-tracker-api.md).
- [X] T014 [P] [US1] Test: missing required `title` → 422; invalid `priority`/`status` enum value → 422.
- [X] T015 [P] [US1] Test: an internal user with project access changes a bug's `reporter_id` via PATCH to a different internal user → the bug's Reporter persists as the new user on a subsequent GET (FR-003 reassignment).

### Implementation for User Story 1

- [X] T016 [US1] Implement `BugController::index(Request $request, Project $project)`: `canManage()`-independent (any role can attempt; Client filtering is US3's job — for US1 assume internal caller), checks `Project::accessibleTo($user)`, eager-loads `reporter`/`owner`, returns `BugResource::collection(...)`.
- [X] T017 [US1] Implement `BugController::store(Request $request, Project $project)`: validates per contracts/bug-tracker-api.md, generates `bug_number` inside `DB::transaction()` with `lockForUpdate()` on the project's existing bugs (research.md D2), defaults `reporter_id` to the creating user, defaults `status` to `Awaiting Review` and `visibility` to `internal` if omitted, denies Client (403) and denies users without project access (403).
- [X] T018 [US1] Implement `BugController::show(Request $request, Bug $bug)`: checks `$bug->isAccessibleTo($user)`, returns `BugResource`.
- [X] T019 [US1] Implement `BugController::update(Request $request, Bug $bug)`: validates per contracts/bug-tracker-api.md, allows any subset of the editable fields (including `reporter_id` reassignment, T015), denies Client (403) and users without project access (403), free-selection status validation (`in:` the four values only, no transition-order gate).
- [X] T020 [US1] Implement `BugController::destroy(Request $request, Bug $bug)`: denies Client and users without project access, deletes the bug (no cascade concerns — Bug has no child records in this phase).
- [X] T021 [US1] Build out `frontend/src/pages/BugTracker.jsx`: three status-group sections (Incoming/Development Work/Resolved) rendering bugs with Bug ID, title, Reporter, Priority (color-coded, matching `Retrospectives.jsx`'s Type color-coding convention), Status (as a per-row `<select>` reusing the same UI pattern 014 established for Type), a create-bug dialog/form (title, description, priority — matching this project's existing form/modal pattern, not monday dev's separate "form view").

**Checkpoint**: User Story 1 is fully functional and independently testable — an internal user can run the entire report→triage→resolve lifecycle.

---

## Phase 4: User Story 2 - Track due dates and get notified of overdue bugs (Priority: P2)

**Goal**: Bugs can carry a due date with a live countdown; the Reporter and
Owner get exactly one SLA breach notification if it passes unresolved.

**Independent Test**: Set a near-future due date, confirm the countdown
renders; simulate it passing while Status isn't Fixed, confirm exactly one
notification reaches Reporter and Owner (spec.md US2 Independent Test).

### Tests for User Story 2

- [X] T022 [P] [US2] Test in `BugTrackerTest.php`: a bug with `due_date` in the past and `status != Fixed` produces exactly one `Notification` (type `overdue`) for its Reporter and one for its Owner (different `recipient_user_id`s), via a call that exercises `NotificationController::index()`.
- [X] T023 [P] [US2] Test: polling `GET /api/notifications` a second time for the same overdue bug produces no duplicate notification (event_key dedup, research.md D3), and confirms the bug's `breach_notified_at` was set after the first poll.
- [X] T024 [P] [US2] Test: a bug marked `Fixed` before its due date passes produces zero breach notifications, even after polling past the due date (FR-009).
- [X] T025 [P] [US2] Test: a bug with no `due_date` never produces a breach notification.
- [X] T026 [P] [US2] Test: a bug with only a Reporter (no Owner) produces exactly one notification, not an error/duplicate for a missing Owner.

### Implementation for User Story 2

- [X] T027 [US2] Add a private `generateBugBreachNotifications(): void` method to `backend/app/Http/Controllers/NotificationController.php`, called from `index()` alongside the existing `generateOverdueNotifications()`/`generateDueSoonNotifications()` (research.md D3): query `Bug::where('status', '!=', Bug::STATUS_FIXED)->whereNotNull('due_date')->where('due_date', '<', now())->whereNull('breach_notified_at')` — the `whereNull('breach_notified_at')` clause is the fast filter data-model.md documents, skipping bugs already processed by a prior poll rather than relying solely on `sendNotification()`'s event_key dedup; for each remaining bug, call `Notification::sendNotification()` for Reporter and (if set and different) Owner with `recipientUserId`, `userRole` = that recipient's actual role, `type = Notification::TYPE_OVERDUE`, unique `event_key` per bug+recipient, `linkUrl = "/bug-tracker?bug={$bug->id}"`; set `breach_notified_at` on the bug immediately after its notifications are sent.
- [X] T028 [US2] Extend `BugController::store`/`update` validation to accept `due_date` (nullable date) and `owner_id` (nullable, must reference an internal user).
- [X] T029 [US2] Add due date + Owner fields to `BugTracker.jsx`'s create/edit form; render a live countdown (client-side `setInterval`, research.md D5) or an overdue badge for any bug with `due_date` set and `status != Fixed`, using the `is_overdue` field from `BugResource` to decide overdue styling.
- [X] T030 [US2] In `BugTracker.jsx`, following the same `?session=`/`?task=` deep-link pattern already used in `Retrospectives.jsx`/`Kanban.jsx`, add `?bug=` handling so clicking a breach notification in the bell navigates to and highlights the correct bug.

**Checkpoint**: User Stories 1 AND 2 both work independently; due dates and breach alerts layer cleanly on top of the P1 board.

---

## Phase 5: User Story 3 - Client views their own visible bugs (Priority: P3)

**Goal**: Client-role users get read-only visibility into bugs explicitly
marked client-visible on projects they have access to.

**Independent Test**: Mark one bug client-visible, leave another
internal-only; sign in as a Client with project access and confirm only
the visible one appears, read-only (spec.md US3 Independent Test).

### Tests for User Story 3

- [X] T031 [P] [US3] Test in `BugTrackerTest.php`: Client user with project access sees only `visibility = client_visible` bugs on `GET /projects/{project}/bugs`; `internal` bugs are absent from the response entirely.
- [X] T032 [P] [US3] Test: Client user requesting an `internal`-only bug directly via `GET /bugs/{bug}` → 403/404 (IDOR case, contracts/bug-tracker-api.md).
- [X] T033 [P] [US3] Test: Client user attempting `POST`/`PATCH`/`DELETE` on any bug (visible or not) → 403 for every one.
- [X] T034 [P] [US3] Test: Client user WITHOUT access to the project → 403 on every Bug Tracker endpoint for that project, including a `client_visible` bug on it.

### Implementation for User Story 3

- [X] T035 [US3] Extend `BugController::index`/`show` with an `isClient()`-conditional `where('visibility', Bug::VISIBILITY_CLIENT_VISIBLE)` filter, matching `AttachmentController::index()`'s exact pattern (research.md D1); Client requests still pass through the same `isAccessibleTo()`/`Project::accessibleTo()` project check as everyone else.
- [X] T036 [US3] Add a `visibility` toggle (Internal / Client-visible) to `BugTracker.jsx`'s create/edit form, visible only to internal roles — matches the existing "Internal"/"Client-visible" control already shown in `TaskFiles.jsx` for Attachments.
- [X] T037 [US3] In `BugTracker.jsx`, render read-only for Client-role users (no create button, no status/priority `<select>`s, no visibility toggle, no delete) — reuse the same `canWrite`-style conditional rendering pattern already established in `Retrospectives.jsx`.

**Checkpoint**: All three user stories work independently and together — the full feature described in spec.md is complete.

---

## Phase 6: Polish & Definition-of-Done Gate

**Purpose**: Constitution Principle VIII gate, applied across the whole
feature.

- [X] T038 [P] Manually run quickstart.md Scenarios 1–5 against a locally
      running instance.
- [X] T039 Run `php artisan test --filter=BugTrackerTest` and the full
      `php artisan test` suite — confirm no regression in any existing
      feature (e.g. `NotificationController`'s existing overdue/due-soon
      behavior is unaffected by T027's addition).
- [X] T040 Authorization review (Constitution Principle I): confirm every
      Bug endpoint fails closed for Client writes and for any role lacking
      project access — no inline role-string comparisons.
- [X] T041 Tenant/project-isolation review (Constitution Principle VIII
      item 3): confirm every query is scoped through `Project::accessibleTo
      ()`/`BelongsToProject::isAccessibleTo()`, not role-gated in
      isolation — re-verify against T013/T032/T034's IDOR test cases.
- [X] T042 OWASP review (`laravel-owasp-security`): confirm no broken
      access control path exists for `GET /bugs/{bug}` (direct-ID access is
      the highest-risk surface introduced by this feature) and that
      `sec-mass-assignment` holds for `bug_number`/`project_id`.
- [X] T043 code-slop review: confirm `BugController`/`Bug` model match the
      shape of `RetrospectiveController`/`RetroSession` (no new service
      class, no premature abstraction), and `generateBugBreachNotifications
      ()` matches its siblings' shape exactly.

**Checkpoint**: All Definition-of-Done Gate items pass — feature is done.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (needs the `Bug` model/
  migration to exist) — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on
  US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational AND on US1's
  `BugController::store`/`update` existing (T017/T019) to extend with
  `due_date`/`owner_id` handling — not fully independent of US1's
  implementation tasks, though it is independently *testable* once T017/
  T019 exist.
- **User Story 3 (Phase 5)**: Depends on Foundational AND on US1's
  `index`/`show` existing (T016/T018) to extend with the visibility filter
  — same relationship as US2.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- T002 and T003 [P] — model and resource, different files.
- T006, T007, T008 [P] — frontend API functions, App.jsx wiring, and the
  page skeleton are different files (T007/T008 both touch new/edited
  frontend files but not the same lines; treat as parallel-safe).
- All test tasks within a story phase (T009–T015, T022–T026, T031–T034)
  are [P] — independent test methods in the same file can be authored in
  parallel by different contributors, though in solo execution they're
  typically written together in one pass.
- T038 (manual quickstart) can run in parallel with T039 (automated suite)
  — different verification surfaces.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks everything).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: run quickstart.md Scenario 1–2 independently.
5. This is a usable Bug Tracker board on its own — due dates/notifications
   and Client visibility are additive, not required for the board to be
   useful.

### Incremental Delivery

1. Setup + Foundational → routes/page reachable.
2. Add US1 → full internal CRUD + status-group board → validate → this is
   the MVP.
3. Add US2 → due dates + breach alerts → validate independently.
4. Add US3 → Client read-only visibility → validate independently.
5. Phase 6 → Definition-of-Done Gate across the whole feature.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- US2 and US3 each extend US1's controller methods rather than duplicating
  them — documented explicitly in Dependencies above so it's clear these
  aren't fully order-independent despite being independently *testable*.
- Commit after each phase checkpoint, consistent with 013–016's practice.
