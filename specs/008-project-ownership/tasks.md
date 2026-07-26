# Tasks: Project Ownership and PM-Scoped Administration

**Input**: Design documents from `/specs/008-project-ownership/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/project-ownership-api.md, quickstart.md (all present, all reviewed and revised as of this generation)

**Tests**: Included. Explicitly requested — spec.md's own SC-001/SC-004 require automated-test verification, and task generation for this feature was requested with seven specific scenarios named for coverage (ownerless-safety-net, self/other-owned, multi-owner include/exclude, transfer-to-co-owner, concurrent-transfer 409, no-PM-UI, unchanged assignment reads). All seven are covered below.

**Organization**: Tasks are grouped by user story (US1 = P1, US2 = P2, US3 = P3) per spec.md's priority order and the constitution's Principle III (test coverage grows with the feature).

## Path Conventions

Web app, matching the existing repo layout: `backend/` (Laravel API), `frontend/` (React/Vite). Exact file paths are given per task, matching plan.md's Project Structure section.

<!-- Sample tasks from the template have been replaced entirely with this feature's actual tasks. -->

## Phase 1: Setup

- [ ] T001 Confirm the `008-project-ownership` branch is checked out and both dev servers (`cd backend && php artisan serve`, `cd frontend && npm run dev`) start cleanly — environment check only, no code changes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `project_ownerships` table, model, scope, and resource every user story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T002 Create migration `backend/database/migrations/2026_07_26_090000_create_project_ownerships_table.php` — `user_id`, `project_id`, `assigned_by_user_id` (all `foreignId()->constrained()`); `project_id` gets `cascadeOnDelete()` per FR-014 (deleting a project removes its ownership rows), and `user_id` also gets `cascadeOnDelete()` per data-model.md — defensive referential integrity only, since this app has no user hard-delete path today (spec.md's Assumptions); unique index on `[user_id, project_id]`, timestamps (data-model.md's table schema)
- [ ] T003 [P] Create `backend/app/Models/ProjectOwnership.php` — `$fillable = ['user_id','project_id','assigned_by_user_id']`; `user()`, `project()`, `assignedBy()` `BelongsTo` relations (data-model.md)
- [ ] T004 [P] Add `ownerships(): HasMany` relation and `scopeOwnedBy(Builder $query, User $user): Builder` to `backend/app/Models/Project.php` — leave the existing `scopeAccessibleTo` completely untouched (data-model.md, FR-009)
- [ ] T005 [P] Create `backend/app/Http/Resources/ProjectOwnershipResource.php` mirroring `ProjectAssignmentResource`'s exact shape: `id`, `user{id,name,role,department}`, `project{id,name}`, `assigned_by{id,name}`, `created_at` (data-model.md's Response shape, Constitution Principle II)
- [ ] T006 Run `php artisan migrate`; confirm the new table and its constraints exist and that zero rows are present after migration (FR-016 — no backfill); run the full `php artisan test` suite and confirm zero regressions from the migration alone

**Checkpoint**: Foundation ready — all three user stories can now be implemented.

---

## Phase 3: User Story 1 - Projects have a real, assignable owner (Priority: P1) 🎯 MVP

**Goal**: An Admin can designate/remove one or more real Project Manager owners per project, see current owners, and any non-Admin request to do so is denied.

**Independent Test**: As an Admin, assign a specific Project Manager as the owner of a specific project; confirm that PM appears as an owner of that project and no other, and confirm a different PM is not shown as an owner of it.

### Tests for User Story 1 ⚠️

> Write these first; confirm they fail before starting the Implementation tasks below.

- [ ] T007 [P] [US1] Feature test: Admin assigns a PM as a project's owner → `201`, appears via `GET /api/project-ownerships?project_id=`, audit log has `project_ownership.created` — in `backend/tests/Feature/ProjectOwnershipControllerTest.php` (new file)
- [ ] T008 [P] [US1] Feature test: a project can have more than one owner (FR-004) — assigning a second PM to an already-owned project leaves both recorded, neither replaced — in `backend/tests/Feature/ProjectOwnershipControllerTest.php`
- [ ] T009 [P] [US1] Feature test: only active Project Manager accounts are valid ownership targets (FR-005) — Team Member, Client, Department Head, Admin, and a disabled PM are all `422` — in `backend/tests/Feature/ProjectOwnershipControllerTest.php`
- [ ] T010 [P] [US1] Feature test: a duplicate `(user_id, project_id)` grant is idempotent — `200` with the existing resource, no new audit entry — in `backend/tests/Feature/ProjectOwnershipControllerTest.php`
- [ ] T011 [P] [US1] Feature test: every non-Admin role (PM, Department Head, Team Member, Client) is denied `403` on `GET /api/project-ownerships`, `POST /api/project-ownerships`, and `DELETE /api/project-ownerships/{id}` — including PM, since ownership reads are Admin-only unlike assignment reads (research.md) — in `backend/tests/Feature/ProjectOwnershipControllerTest.php`
- [ ] T012 [P] [US1] Feature test: removing a project's owner succeeds with or without a same-action replacement, and a project may validly end up with zero owners (FR-002/FR-003) — `204`, audit `project_ownership.deleted` — in `backend/tests/Feature/ProjectOwnershipControllerTest.php`
- [ ] T013 [P] [US1] Feature test: deleting a project cascades its ownership rows, leaving zero orphaned rows (FR-014) — in `backend/tests/Feature/ProjectOwnershipControllerTest.php`

### Implementation for User Story 1

- [ ] T014 [US1] Create `backend/app/Http/Controllers/ProjectOwnershipController.php` with `index()` (Admin-only; `project_id`/`user_id` query filters), `store()` (FR-005 active-PM validation, idempotent on duplicate pair, `project_ownership.created` audit), `destroy()` (`project_ownership.deleted` audit) — mirrors `DepartmentGrantController`/`ProjectAssignmentController`'s established Admin-CRUD shape (plan.md, research.md)
- [ ] T015 [US1] Add routes to `backend/routes/api.php`: `GET /api/project-ownerships`, `POST /api/project-ownerships`, `DELETE /api/project-ownerships/{id}` (Admin-only)
- [ ] T016 [US1] Add `fetchProjectOwnerships(params)`, `createProjectOwnership(data)`, `deleteProjectOwnership(id)` to `frontend/src/lib/api.js` (contracts/project-ownership-api.md)
- [ ] T017 [US1] Add a "Project Ownership" tab to `frontend/src/pages/Admin.jsx` (`grid-cols-5` → `grid-cols-6`) with a list view and an assign-owner dialog, reusing the existing "Project Assignments" tab's list/create-dialog pattern (plan.md)
- [ ] T018 [US1] Run T007-T013 — all green before proceeding to User Story 2

**Checkpoint**: Admin can fully manage real project ownership through both the API and the UI. User Story 2 now has something real to scope PM authority against.

---

## Phase 4: User Story 2 - A Project Manager can only administer projects they own (Priority: P2)

**Goal**: A PM's authority to assign/remove Team Member/Client access narrows to projects they own, with the FR-018 ownerless-project safety net; Admin authority and every role's read-visibility are provably untouched.

**Independent Test**: As a PM who owns Project A but not Project B (which has a *different* owner), confirm assign/revoke succeeds on A and is denied on B.

### Tests for User Story 2 ⚠️

> Write these first; confirm they fail before starting the Implementation tasks below. T019 covers the full 7-row enforcement matrix from data-model.md in one pass — do not skip the two multi-owner rows.

- [ ] T019 [P] [US2] Feature test suite covering data-model.md's enforcement matrix row-by-row, one test method per row: Admin always allowed regardless of ownership; PM on an ownerless project allowed (FR-018); PM who is the project's sole owner allowed; PM who is not an owner of a solely-other-owned project denied `403`; PM who is *one of several* co-owners allowed; PM excluded from a *multi-owner* project denied `403` (the row most likely to be missed without an explicit test); any other role denied `403` — extending `backend/tests/Feature/ProjectScopingTest.php`
- [ ] T020 [P] [US2] Feature test: a PM who owns zero projects is denied on a project that already has a different owner, but succeeds on a project that currently has none at all — both assertions in the same test method, against two different fixture projects, to prove the FR-007/FR-018 distinction isn't accidental — in `backend/tests/Feature/ProjectScopingTest.php`
- [ ] T021 [P] [US2] Feature test: Admin's `store()`/`destroy()` behavior on `/api/project-assignments` is provably byte-identical with and without ownership rows present for the target project (FR-008/SC-002) — in `backend/tests/Feature/ProjectScopingTest.php`
- [ ] T022 [P] [US2] Feature test: `GET /api/project-assignments` is unaffected by ownership for PM readers — a PM who owns zero projects still sees the full, unfiltered assignment list for any project (Assumptions; contracts/project-ownership-api.md's "Global" section) — in `backend/tests/Feature/ProjectScopingTest.php`
- [ ] T023 [P] [US2] Feature test: PM read-visibility across Dashboard/Kanban/Work Program/Schedule/Reports endpoints is byte-identical regardless of what that PM owns (SC-002) — reuse 007's existing project-visibility assertions with an owning vs. non-owning PM fixture — in `backend/tests/Feature/ProjectScopingTest.php`

### Implementation for User Story 2

- [ ] T024 [US2] Modify `ProjectAssignmentController::store()`/`destroy()` in `backend/app/Http/Controllers/ProjectAssignmentController.php` — split the existing `isPmOrAdmin()` check into three branches: Admin (unchanged), Project Manager (`$hasAnyOwner = ProjectOwnership::where('project_id', $projectId)->exists()`; `$isOwner = Project::query()->ownedBy($user)->whereKey($projectId)->exists()`; deny only if `$hasAnyOwner && !$isOwner`), other roles (unchanged 403) — per data-model.md's enforcement-point code; leave `index()` untouched
- [ ] T025 [US2] Run T019-T023 plus the complete existing `backend/tests/Feature/ProjectScopingTest.php` suite (007 regression) — all green before proceeding to User Story 3

**Checkpoint**: PM assignment authority is correctly scoped for every row of the enforcement matrix. Admin, other roles, and every role's read-visibility are all provably unchanged.

---

## Phase 5: User Story 3 - Ownership changes hands cleanly and is fully audited (Priority: P3)

**Goal**: An Admin can transfer a project's ownership atomically — correct under concurrency, correct when consolidating into an existing co-owner — and every ownership change is fully audited.

**Independent Test**: As an Admin, replace a project's sole owner with a different PM in one action; confirm the prior owner immediately loses and the new owner immediately gains administrative authority, and confirm the audit log has exactly one entry naming both.

### Tests for User Story 3 ⚠️

> Write these first; confirm they fail before starting the Implementation tasks below.

- [ ] T026 [P] [US3] Feature test: transfer is atomic — prior owner loses authority and new owner gains it on their very next request (no re-login), exactly one `project_ownership.transferred` audit entry (never two separate created/deleted entries) whose `entity_id` is the surviving (new-owner) row's id — in `backend/tests/Feature/ProjectOwnershipControllerTest.php`
- [ ] T027 [P] [US3] Feature test: transferring to a PM who already co-owns the project consolidates rather than erroring — no `422`/unique-constraint violation, the prior owner's row is removed, the existing co-owner row is left untouched, and exactly one `project_ownership.transferred` audit entry is written — in `backend/tests/Feature/ProjectOwnershipControllerTest.php`
- [ ] T028 [P] [US3] Feature test for the FR-015 guarantee — a standard PHPUnit feature test runs single-connection/single-process, so it cannot force two HTTP requests to genuinely race at the database level; write the **deterministic** regression test that actually matters instead: create an ownership row, delete it directly (`$ownership->delete()`, simulating "a concurrent transfer already won and removed this row" without needing real thread interleaving), then call `POST /api/project-ownerships/{id}/transfer` against that now-gone id — assert `409` and assert no new ownership row was created for the attempted target (i.e., the endpoint's re-query-inside-the-lock genuinely aborts on a vanished row, rather than trusting a stale pre-transaction read). Treat true multi-connection lock-contention (two real overlapping `DB::transaction()`s via a second manually-opened connection) as an optional deeper test, not a blocking requirement — the deterministic version above is what proves the fix, without the false confidence of a test that looks concurrent but actually just runs sequentially — in `backend/tests/Feature/ProjectOwnershipControllerTest.php`
- [ ] T029 [P] [US3] Feature test: transfer target validation — `new_owner_user_id` must be an active PM (`422` otherwise, same check as `store()`) and must not equal the ownership record's current `user_id` (`422`, "Cannot transfer ownership to the current owner.") — in `backend/tests/Feature/ProjectOwnershipControllerTest.php`
- [ ] T030 [P] [US3] Feature test: a disabled or role-changed owner's ownership record persists but grants no administrative authority, and authority resumes automatically the moment the account is re-enabled/restored to Project Manager, with zero re-assignment (FR-011) — mirrors 007's own dormant-assignment test pattern. **Also assert, in the same test, that a different PM (who is not an owner of this project) remains denied `403` while the sole owner's record is dormant** — the project is not ownerless during dormancy (the row still exists, just inactive), so FR-018's safety net must not incorrectly reapply and open the project up to any PM; this is the one governance detail that's easy to get backwards if `$hasAnyOwner` is implemented as "any *active-authority* owner exists" instead of "any ownership *row* exists regardless of dormancy" — in `backend/tests/Feature/ProjectOwnershipControllerTest.php`

### Implementation for User Story 3

- [ ] T031 [US3] Add `transfer(Request $request, ProjectOwnership $ownership)` to `backend/app/Http/Controllers/ProjectOwnershipController.php`: validate `new_owner_user_id` first (a convenience pre-check only, not authoritative); then inside `DB::transaction()`, re-query `ProjectOwnership::where('id', $ownership->id)->lockForUpdate()->first()` using **only** the route-bound model's `->id` — never its other fields, which were read before the lock and may be stale — abort `409` if the re-query is empty; delete the old row; `lockForUpdate()`-check for an existing co-owner row and reuse it if found, otherwise create a new one; write one `project_ownership.transferred` audit entry with `entity_id` = the surviving row's id and metadata `{project_id, from_user_id, to_user_id, from_ownership_id, to_ownership_id}` (data-model.md)
- [ ] T032 [US3] Add route `POST /api/project-ownerships/{id}/transfer` to `backend/routes/api.php` (Admin-only)
- [ ] T033 [US3] Add `transferProjectOwnership(id, newOwnerUserId)` to `frontend/src/lib/api.js` and a per-row "Transfer" action to the "Project Ownership" tab in `frontend/src/pages/Admin.jsx` (plan.md)
- [ ] T034 [US3] Run T026-T030 — all green

**Checkpoint**: All three user stories are independently functional. The full ownership lifecycle — grant, remove, transfer, dormancy — is complete and fully audited.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T035 [P] Regression test confirming no PM-facing UI was added for ownership or assignment management in this feature — `AdminGuard` in `frontend/src/App.jsx` still denies every non-Admin role reaching the Admin Control Center, confirming spec.md's explicitly stated API-only PM scope holds — in `backend/tests/Feature/ProjectScopingTest.php` or a frontend manual check per quickstart.md
- [ ] T036 [P] Run `npm run lint` and `npm run build` in `frontend/` — clean, no leftover unused imports or reference errors
- [ ] T037 Run the complete `php artisan test` suite — 100% pass, zero regressions across 001-008
- [ ] T038 Execute `specs/008-project-ownership/quickstart.md` Scenarios 0-11 (plus 3a) manually against the running dev servers — including Scenario 3a (multi-owner include/exclude) and Scenario 8 (concurrent-transfer 409), which have no automated-test substitute for the UI-level experience

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: No dependencies.
- **Foundational (T002-T006)**: Depends on Setup — BLOCKS every user story.
- **User Story 1 (T007-T018)**: Depends on Foundational only. Must complete before US2/US3, since both need `ProjectOwnershipController` and its table populated with real fixtures to test against.
- **User Story 2 (T019-T025)**: Depends on Foundational (for `scopeOwnedBy`) and on US1 (for fixture data — a PM/project ownership to test "owns"/"doesn't own" against). Does not touch `ProjectOwnershipController` itself.
- **User Story 3 (T026-T034)**: Depends on US1's `ProjectOwnershipController` existing (adds the `transfer` action to it). Independent of US2 otherwise — can be staffed in parallel with US2 if two developers are available, since they touch different controllers (`ProjectAssignmentController` vs. `ProjectOwnershipController`).
- **Polish (T035-T038)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests are written and confirmed failing before their corresponding Implementation tasks.
- Model/scope/resource (Foundational) before controller (US1) before the dependent behavior change (US2) and the dependent new action (US3).

### Parallel Opportunities

- T003, T004, T005 (Foundational) — different files, no dependencies among them.
- T007-T013 (US1 tests) — same test file, but independent PHPUnit methods; safe to write in parallel, run together.
- T019-T023 (US2 tests) — same file, independent methods.
- T026-T030 (US3 tests) — same file, independent methods.
- US2 and US3 implementation (T024 vs. T031) can proceed in parallel once US1 is done, if staffed separately.

---

## Parallel Example: User Story 1

```bash
# All seven US1 tests are independent PHPUnit methods in the same new file —
# write and run them together before starting T014:
Task: T007 Admin assigns a PM as project owner
Task: T008 A project can have more than one owner
Task: T009 Only active PM accounts are valid ownership targets
Task: T010 Duplicate grant is idempotent
Task: T011 Every non-Admin role is denied on all three endpoints
Task: T012 Removing an owner is allowed; zero-owner state is valid
Task: T013 Deleting a project cascades its ownership rows
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1).
3. **Stop and validate**: Admin can fully manage real project ownership. This alone replaces the meaningless free-text `project_owner` field with something queryable — real value shipped, even before PM authority is scoped.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. User Story 1 → test independently → deploy/demo (MVP).
3. User Story 2 → test independently → deploy/demo — this is the actual governance gap the feature exists to close.
4. User Story 3 → test independently → deploy/demo — transfer + full audit trail, the operational-continuity layer on top.
5. Polish → full regression + manual quickstart pass → ship.

### Parallel Team Strategy

With two developers, after Foundational is done: Developer A takes User Story 2 (`ProjectAssignmentController`), Developer B takes User Story 3 (`ProjectOwnershipController`'s `transfer` action) — both depend on US1 existing but not on each other.

---

## Notes

- [P] tasks touch different files or independent test methods with no dependency on an incomplete task.
- [Story] labels map every user-story-phase task back to spec.md's US1/US2/US3 for traceability.
- Every user story is independently completable and testable per its own Independent Test above.
- Confirm each phase's tests fail before implementing that phase.
- Commit after each task or logical group, per this project's established per-story commit convention (007's `03f3d2f` → `2121865` → `b189389` pattern).
- Stop at any checkpoint to validate a story independently before moving to the next.
