---

description: "Task list template for feature implementation"
---

# Tasks: Daily Operating Dashboard (Support Ops Phase 3)

**Input**: Design documents from `/specs/004-daily-operating-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/today-dashboard-api.md, quickstart.md

**Tests**: Included. Constitution Principle III ("Test Coverage Grows With the Feature") and plan.md's Testing section both require Unit coverage for the two new services and Feature coverage for the endpoint's role/access matrix — these are not optional here.

**Organization**: Tasks are grouped by user story (US1/US2/US3, matching spec.md's priorities) to enable independent implementation and testing of each story. `SupportOpsStaleness` and `SupportOpsTodayClassifier` are built once in Foundational rather than split per story: FR-009's precedence rule requires all three support-issue branches (Waiting for Client → Stale → P1) to exist together to be correctly tested (e.g. "stale AND P1 appears only in Stale" cannot be verified with only one branch implemented), and FR-009a's Learning bypass is defined in terms of never touching those same branches. Splitting this into "one branch per story" would mean re-touching the same function repeatedly and would make each story's tests depend on later stories' code — the opposite of independent testability.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Paths are absolute from repository root, matching plan.md's Project Structure section

## Path Conventions

Web application, matching this repo's existing 001/002/003 structure: `backend/app/`, `backend/tests/`, `frontend/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolding so later phases have somewhere to add real logic — no business logic yet.

- [x] T001 [P] Add `GET /api/support-ops/today` route in `backend/routes/api.php`, pointing to a new (initially empty) `today` action on `SupportOpsController`
- [x] T002 [P] Create `frontend/src/pages/TodayDashboard.jsx` page skeleton (component shell, no data fetching yet)
- [x] T003 [P] Wire a `/support-ops/today` route + a "Today" nav entry into `frontend/src/App.jsx`, reusing the existing `SupportOpsGuard` component (no new guard)

**Checkpoint**: Route reachable, page renders empty — nothing functional yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The classification core every user story's data depends on. **MUST complete before any user story phase.**

**⚠️ CRITICAL**: No user story work can begin until this phase is complete — every section (Stale, P1 — Watch Closely, Waiting for Client, Learning Priorities) is produced by the same single classification pass over the same query result.

### Tests first (write these, confirm they FAIL before implementing)

- [x] T004 [P] Unit test `SupportOpsStaleness` in `backend/tests/Unit/SupportOpsStalenessTest.php` — P1 (>1hr), P2 (>4hr), P3 (business-day rollover incl. a Friday reference landing on Monday and an already-weekend reference), the `completed`-status short-circuit, and the unset/null-priority short-circuit (data-model.md's staleness table)
- [x] T005 [P] Unit test `SupportOpsTodayClassifier` in `backend/tests/Unit/SupportOpsTodayClassifierTest.php` — FR-009 precedence (an issue that is both `blocked` and stale lands only in Waiting for Client; an issue that is both P1 and stale lands only in Stale), and FR-009a's Learning bypass (a learning entry with a `blocked` status or a `client_priority` value is still classified only as Learning Priority, never cross-classified)

### Implementation

- [x] T006 [P] Implement `SupportOpsStaleness` in `backend/app/Services/SupportOpsStaleness.php` — mirrors `SupportOps.jsx`'s `getStalenessState`/`addOneBusinessDay` field-for-field, using Carbon's `addWeekday()` for the P3 threshold (research.md); make T004 pass
- [x] T007 Implement `SupportOpsTodayClassifier` in `backend/app/Services/SupportOpsTodayClassifier.php` — applies FR-009/FR-009a's sequential-exclusive-check precedence per issue, using `SupportOpsStaleness` internally (data-model.md's algorithm); make T005 pass (depends on T006)
- [x] T008 [P] Create `TodaySupportIssueResource` in `backend/app/Http/Resources/TodaySupportIssueResource.php` — same field set as the existing `SupportIssueResource`, plus a nested `project: {id, name}`, plus an `overdue_since` field populated only for items in the `stale` bucket (contracts/today-dashboard-api.md)
- [x] T009 Implement `SupportOpsController::today()`: re-run the fail-closed role check (`isAdmin() || isProjectManager() || isTeamMember() || isDepartmentHead()`); resolve accessible project ids via `Project::query()->accessibleTo($user)->pluck('id')`; query `DetailedActivity` with `work_type` in `['support', 'learning']` **and** `status != 'completed'` (DB-level narrowing, data-model.md) across those project ids, eager-loading `subActivity.activity.module.project`; delegate classification to `SupportOpsTodayClassifier`; sort the `stale` bucket by overdue duration descending; return all four buckets via `TodaySupportIssueResource::collection()` plus `generated_at` (depends on T001, T007, T008)
- [x] T010 [P] Add `fetchTodayDashboard = () => api.get('/support-ops/today')` to `frontend/src/lib/api.js`

**Checkpoint**: `GET /api/support-ops/today` is fully functional and returns correctly classified, correctly scoped data. User story phases below only add frontend rendering and endpoint-level tests — no further classification logic changes.

---

## Phase 3: User Story 1 - Triage what's urgent without checking every project one by one (Priority: P1) 🎯 MVP

**Goal**: A user can see every stale issue and every not-yet-stale P1 issue across all accessible projects on one screen, correctly labeled by project, with the most-overdue stale issue first.

**Independent Test**: Stale and non-stale P1 issues spread across two or more accessible projects; open the Today view; confirm every one appears with the correct project label, in the correct section, and that this endpoint is properly scoped and safe to use standalone (role matrix + cross-project leakage) — this is the foundation the other two stories build on, so its Feature test also covers the endpoint's overall access safety.

### Tests for User Story 1

- [x] T011 [P] [US1] Feature test in `backend/tests/Feature/SupportOpsTodayTest.php`: role matrix — 200 for Admin/Project Manager/Team Member/Department Head, 403 for Client and an unrecognized/null role, 401 unauthenticated
- [x] T012 [US1] Feature test in `backend/tests/Feature/SupportOpsTodayTest.php`: the exact cross-project leakage matrix — (a) Team Member sees a support issue from their own department's project, (b) Team Member does **not** see one from a different department's project, (c) Admin and Project Manager each see issues from both departments' projects, (d) Department Head sees issues only from their granted department(s), not an ungranted one (depends on T011 for shared test-file setup)
- [x] T013 [P] [US1] Feature test in `backend/tests/Feature/SupportOpsTodayTest.php`: a stale P1 issue and a not-yet-stale P1 issue are classified into Stale and P1 — Watch Closely respectively, never both; an issue that is both P1 and stale appears only in Stale (FR-009 acceptance scenario 3); the Stale bucket is sorted most-overdue-first
- [x] T014 [P] [US1] Feature test in `backend/tests/Feature/SupportOpsTodayTest.php`: zero accessible/qualifying issues still returns `200` with all four arrays empty, not an error
- [x] T014a [P] [US1] Feature test in `backend/tests/Feature/SupportOpsTodayTest.php`: seed ordinary `DetailedActivity` rows with `work_type = project`, `bug`, `feature`, and/or `admin` that otherwise look like they could qualify (P1 and stale, `blocked`/`delayed` status, etc.); assert they appear in none of `stale`, `watch_closely`, `waiting_for_client`, or `learning_priorities` (FR-011)

### Implementation for User Story 1

- [x] T015 [US1] Wire `TodayDashboard.jsx` to call `fetchTodayDashboard()` on mount; render the "Stale" and "P1 — Watch Closely" sections, each item labeled with its `project.name` (FR-007)
- [x] T016 [US1] Add a clear per-section empty state for Stale/P1 when their array is empty, and a single dashboard-level error state (not four broken-looking empty sections) when the fetch itself fails (FR-010)
- [x] T017 [US1] Wire item selection in the Stale/P1 sections to open the existing `TaskDetailModal` (FR-008), reusing whatever fetch/update plumbing `SupportOps.jsx` already uses for it — no new detail-fetch path

**Checkpoint**: User Story 1 is fully functional and independently testable/demoable as the MVP.

---

## Phase 4: User Story 2 - See what's waiting on the client, not on us (Priority: P2)

**Goal**: A user can see every `blocked`/`delayed` support issue across accessible projects in its own section, distinct from Stale/P1.

**Independent Test**: Issues in `blocked`/`delayed` status across two or more accessible projects; open the Today view; confirm all appear in Waiting for Client, including one that is also technically stale by timestamp math (precedence — FR-009 acceptance scenario 2).

### Tests for User Story 2

- [x] T018 [P] [US2] Feature test in `backend/tests/Feature/SupportOpsTodayTest.php`: an issue with `status = blocked` and one with `status = delayed` both appear in Waiting for Client (FR-005); an issue that is both `blocked` and stale by timestamp math appears **only** in Waiting for Client, never duplicated into Stale (FR-009)

### Implementation for User Story 2

- [x] T019 [US2] Render the "Waiting for Client" section (with its own empty state, per FR-010) in `TodayDashboard.jsx`, reusing the same item-selection → `TaskDetailModal` wiring built in T017

**Checkpoint**: User Story 1 and User Story 2 both work independently.

---

## Phase 5: User Story 3 - See today's learning priorities alongside support triage (Priority: P3)

**Goal**: A user can see every open `work_type = learning` entry across accessible projects in its own section, isolated from the three support-issue sections regardless of what `status`/`client_priority` values it happens to carry.

**Independent Test**: Open learning entries across accessible projects; open the Today view; confirm they appear in Learning Priorities and that a completed one does not; confirm a learning entry with a `blocked` status or `client_priority` still appears only in Learning Priorities (FR-009a).

### Tests for User Story 3

- [x] T020 [P] [US3] Feature test in `backend/tests/Feature/SupportOpsTodayTest.php`: an open learning entry appears in Learning Priorities (FR-006); a completed learning entry does not appear anywhere; a learning entry carrying `status = blocked` and/or `client_priority = P1` still appears only in Learning Priorities, never in Waiting for Client/Stale/P1 — Watch Closely (FR-009a)

### Implementation for User Story 3

- [x] T021 [US3] Render the "Learning Priorities" section (with its own empty state) in `TodayDashboard.jsx`, reusing the same item-selection wiring built in T017

**Checkpoint**: All three user stories are independently functional together.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across the whole feature, matching quickstart.md and the constitution's regression expectations.

- [x] T022 [P] Walk through all six scenarios in `specs/004-daily-operating-dashboard/quickstart.md` manually (Scenario 2's backdating step uses `php artisan tinker`, not "Record client update now" — see quickstart.md)
- [x] T023 [P] Confirm Department Head sees the `TaskDetailModal` in its existing view-only-for-edit-fields mode when opened from this new Today entry point, matching every other entry point (FR-008)
- [x] T024 Run `cd backend && php artisan test` — confirm all existing tests plus the new `SupportOpsStalenessTest`, `SupportOpsTodayClassifierTest`, and `SupportOpsTodayTest` pass
- [x] T025 [P] Confirm `cd frontend && npm run build` and `npm run lint` remain clean (no new dependency was introduced)
- [x] T026 Regression check: confirm the existing `/support-ops` board, Kanban Board, Work Program, Schedule, and Reports views are unchanged

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001's route needs to exist for T009 to attach to) — BLOCKS all user stories, since every section comes from the same classification pass
- **User Stories (Phase 3-5)**: All depend on Foundational (Phase 2) completion. They do not depend on each other — US2 and US3 each only add a rendering block plus tests against the endpoint T009 already produces correctly
- **Polish (Phase 6)**: Depends on all three user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — no dependency on US2/US3. Its Feature test file (`SupportOpsTodayTest.php`) is created here and extended (not recreated) by US2/US3's test tasks
- **User Story 2 (P2)**: Can start after Foundational — independently testable via its own Feature test task, though the shared test file already exists from US1
- **User Story 3 (P3)**: Can start after Foundational — same pattern as US2

### Within Each Phase

- Tests before implementation (T004/T005 before T006/T007; T011-T014 before T015-T017; etc.)
- Services before controller (T006, T007, T008 before T009)
- Backend before frontend wiring within a story (endpoint already exists from Foundational, so each story's frontend task can start immediately once its own tests are written)

### Parallel Opportunities

- T001, T002, T003 (Setup) can all run in parallel — different files
- T004 and T005 (Foundational tests) can run in parallel — different files, no shared dependency
- T006 and T008 can run in parallel once T004/T005 exist (T007 depends on T006; T009 depends on T007 and T008)
- T011, T013, T014, T014a can run in parallel (different test methods, same file — coordinate to avoid merge conflicts on one file); T012 depends on T011's setup existing in that file
- T018 and T020 (US2/US3 tests) can run in parallel with each other, and either can start as soon as Foundational is done — they don't depend on US1's tasks, only on the shared endpoint
- T022, T023, T025 (Polish) can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# Launch both Unit tests together (different files):
Task: "Unit test SupportOpsStaleness in backend/tests/Unit/SupportOpsStalenessTest.php"
Task: "Unit test SupportOpsTodayClassifier in backend/tests/Unit/SupportOpsTodayClassifierTest.php"

# Once staleness's test exists, implement it while the resource is built in parallel:
Task: "Implement SupportOpsStaleness in backend/app/Services/SupportOpsStaleness.php"
Task: "Create TodaySupportIssueResource in backend/app/Http/Resources/TodaySupportIssueResource.php"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (both services + the endpoint — this is most of the real backend work, since FR-009's precedence can't be built incrementally)
3. Complete Phase 3: User Story 1 — role matrix, leakage matrix, Stale/P1 rendering
4. **STOP and VALIDATE**: Run quickstart.md Scenarios 1, 2, 5, 6 against US1 alone
5. Deploy/demo if ready — Waiting for Client and Learning Priorities can genuinely ship later without touching US1's code

### Incremental Delivery

1. Setup + Foundational → the endpoint exists, fully correct, before any UI renders it
2. Add User Story 1 → validate independently → MVP
3. Add User Story 2 → validate independently (Scenario 3)
4. Add User Story 3 → validate independently (Scenario 4)
5. Phase 6 Polish — full quickstart.md pass + regression check

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- `SupportOpsStaleness`/`SupportOpsTodayClassifier` are intentionally Foundational, not per-story — see the Organization note above for why FR-009/FR-009a make this the correct split, not a shortcut
- Verify T004/T005/T011-T014/T014a/T018/T020 fail before their corresponding implementation tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
