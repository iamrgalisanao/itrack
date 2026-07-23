---

description: "Task list template for feature implementation"
---

# Tasks: Real User Management

**Input**: Design documents from `/specs/006-real-user-management/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/user-management-api.md, quickstart.md

**Tests**: Included. Constitution Principle III and plan.md's Testing section require Feature-test coverage for the full role matrix, the global disabled-account gate (proven against an *arbitrary* existing endpoint, not just this feature's own), and the last-enabled-Admin invariant (both a direct Unit test of the pure guard and Feature-level integration tests).

**Organization**: Tasks are grouped by user story (US1-US4, matching spec.md's priorities). Two things are Foundational rather than part of any one story: (1) the global `EnsureUserIsActive` middleware — it changes the contract of *every* authenticated endpoint in this app, not just this feature's own, so it must be proven correct in isolation before any story's own tests can mean anything; (2) the `wouldLeaveNoEnabledAdmins` invariant helper — both US2 (edit/demote) and US3 (disable) call the same guard, so it's built once, not duplicated per story.

**Post-`/speckit-analyze` correction (2026-07-23)**: the initial draft of this file had a logic error in its last-Admin "beyond self-protection" tests (T021/T028 in that draft) — the scenario as worded ("a second enabled Admin demotes the *other*, now-sole-remaining enabled Admin") is unreachable sequentially: with exactly 2 enabled Admins, demoting one down to 1 is *safe and must succeed*, not be rejected. The corrected tests below (T022, T030) instead verify a valid two-step sequence — a safe demotion succeeds, then the resulting sole-remaining Admin cannot be further touched by anyone — and the true "this isn't just a self-check" proof is moved to where it actually belongs: a direct Unit test (T008) of `wouldLeaveNoEnabledAdmins(target, proposedChanges)`, whose signature never takes an acting-user parameter at all, so it structurally cannot special-case "self" vs. "other." Two coverage gaps were also closed: T008 (the missing Unit test itself, matching 004/005's established pure-logic-gets-a-Unit-test pattern) and T025 (proving `is_active`/`password` sent to the general update endpoint are silently ignored, not just "not required" — the actual design intent from research.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Paths are absolute from repository root, matching plan.md's Project Structure section

## Path Conventions

Web application, matching this repo's existing 001-005 structure: `backend/app/`, `backend/database/migrations/`, `backend/tests/`, `frontend/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolding so later phases have somewhere to add real logic — no business logic yet.

- [ ] T001 [P] Migration in `backend/database/migrations/`: add `is_active` boolean to `users`, `default(true)` (no backfill needed — every existing row gets the default)
- [ ] T002 [P] Add `UserManagementController` stub (empty actions: `index`, `store`, `update`, `disable`, `reactivate`, `resetPassword`) and register `GET/POST /api/users`, `PATCH /api/users/{id}`, `POST /api/users/{id}/disable`, `POST /api/users/{id}/reactivate`, `POST /api/users/{id}/reset-password` in `backend/routes/api.php`, inside the existing `auth:sanctum` group
- [ ] T003 [P] Add an empty "Users" tab shell (4th tab, alongside the existing Members/Grants/Logs) to `frontend/src/pages/Admin.jsx` — no data wiring yet

**Checkpoint**: Routes reachable, tab renders empty — nothing functional yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The global disabled-account gate and the last-Admin invariant helper — both shared by every user story below. **MUST complete before any user story phase.**

**⚠️ CRITICAL**: The disabled-account gate changes the contract of every authenticated endpoint in this app, not just this feature's own — it must be proven correct against an *arbitrary pre-existing* endpoint before any story-specific work begins.

### Tests first (write these, confirm they FAIL before implementing)

- [ ] T004 [P] Feature test in `backend/tests/Feature/UserManagementTest.php`: after introducing the global middleware, an **active** user's request to an arbitrary pre-existing endpoint (e.g. `GET /api/projects`, not anything this feature adds) still succeeds exactly as before — proves the gate is additive, not a behavior change for accounts that were never disabled
- [ ] T005 [P] Feature test in the same file: a **disabled** user's request to that same arbitrary pre-existing endpoint returns `401` (not 403 — research.md's decision to reuse the frontend's existing "session ended" interceptor); a fresh login attempt as that disabled user returns the same generic `422` "provided credentials are incorrect" a wrong password would (never a distinct "account disabled" message)
- [ ] T006 [P] Feature test in the same file: every one of this feature's six new endpoints denies all four non-Admin roles (403) and an unauthenticated request (401) — the role-gate proven generically before any endpoint has real business logic (FR-001)
- [ ] T007 [P] Feature test in the same file: `UserResource`'s output never includes `password` or `remember_token`, even if those keys somehow exist on the underlying model instance passed to it (a contract test on the Resource's field list, not just "the model already hides them") (FR-011)
- [ ] T008 [P] Unit test `wouldLeaveNoEnabledAdmins()` in `backend/tests/Unit/UserTest.php` — pure logic, no DB/HTTP round-trip (matching 004/005's established pattern of a direct Unit test for pure business logic alongside Feature-level integration tests): returns `false` when the target isn't currently an enabled Admin; returns `false` when the proposed change doesn't remove Admin role or active status; returns `true` only when the target *is* the sole enabled Admin and the change would remove that status. Note in the test's docblock that the function's signature — `(target, proposedChanges)` — never takes an acting-user parameter at all, so it cannot special-case "self" vs. "other" even in principle (FR-007, SC-005)

### Implementation

- [ ] T009 [P] `User` model: add `is_active` to `$fillable`/casts (boolean); implement `wouldLeaveNoEnabledAdmins(User $target, array $proposedChanges): bool` (data-model.md's algorithm) wrapped in `DB::transaction()` with `User::where('role', self::ROLE_ADMIN)->where('is_active', true)->lockForUpdate()` — the count read and the eventual write must share one locked transaction, never a bare count-then-write — make T008 pass
- [ ] T010 Implement `EnsureUserIsActive` middleware (`backend/app/Http/Middleware/`); register it in `backend/bootstrap/app.php` alongside `auth:sanctum` on the existing authenticated route group (not per-controller); returns `401` for `is_active === false` — make T004, T005 (the non-login half) pass (depends on T009 for the `is_active` cast to exist)
- [ ] T011 Modify `AuthController::login()`: include `'is_active' => true` in the `Auth::attempt()` credentials array, so a disabled account fails login with the exact same generic message a wrong password already produces — make T005's login half pass
- [ ] T012 Implement `UserResource` (`backend/app/Http/Resources/`); wire the Admin-only `isAdmin()` gate into every `UserManagementController` action (fail-closed, matching `SupportOpsController::canView()`'s existing inclusion-based pattern) — make T006, T007 pass (depends on T009)

**Checkpoint**: The global gate and the invariant helper are proven correct and regression-free. Every user story below only adds its own endpoint logic on top of this.

---

## Phase 3: User Story 1 - Admin views and creates user accounts (Priority: P1) 🎯 MVP

**Goal**: An Admin can search/filter/paginate the user list and create a new account with a role and (where required) a department; that account can immediately sign in.

**Independent Test**: Create a user with a specific role/department as Admin; confirm they appear in the list and can sign in landing with exactly that role/department.

### Tests for User Story 1

- [ ] T013 [P] [US1] Feature test in `UserManagementTest.php`: Admin creates a user (name, email, password, role, department); the user appears in `GET /api/users`; a `user.created` audit entry exists with `{ role, department }` metadata (never the password) (FR-002, FR-009)
- [ ] T014 [P] [US1] Feature test in the same file: creating a user with an email already in use is rejected (422), no duplicate row created (FR-003)
- [ ] T015 [P] [US1] Feature test in the same file: creating a Team Member/Department Head/Client with no department is rejected (422); Admin/Project Manager with no department succeeds (FR-002, Edge Cases)
- [ ] T016 [P] [US1] Feature test in the same file: `GET /api/users` supports `search` (name/email), `role`/`department`/`status` filters, and pagination; `per_page` above `100` is rejected/clamped, never returning an unbounded result set (FR-010, plan.md's Low finding)

### Implementation for User Story 1

- [ ] T017 [US1] Implement `UserManagementController::index()`: search/filter/paginated `UserResource::collection()` — make T016 pass (depends on T012)
- [ ] T018 [US1] Implement `UserManagementController::store()`: validation per data-model.md's table (`role` via `User::validRoles()`, never a hand-typed list; `department` `required_if` the three roles that need it), `Hash::make()` the password, `AuditLogger::record('user.created', ...)` — make T013-T015 pass (depends on T012)
- [ ] T019 [US1] Frontend: add `fetchUsers(params)`/`createUser(data)` to `frontend/src/lib/api.js`; wire the "Users" tab's list table (search/filter controls, pagination) and a create form, following `Admin.jsx`'s existing Members/Grants tabs' fetch/toast/error conventions

**Checkpoint**: User Story 1 is fully functional and independently testable/demoable as the MVP.

---

## Phase 4: User Story 2 - Admin edits an existing user's role, department, or details (Priority: P2)

**Goal**: An Admin can edit a user's name/email/role/department, with the change taking effect on that user's very next request, and can never demote the last enabled Admin (including themselves).

**Independent Test**: Edit an existing user's role/department; confirm their access reflects it on their very next request, with no re-login.

### Tests for User Story 2

- [ ] T020 [P] [US2] Feature test in `UserManagementTest.php`: editing a signed-in user's department changes what they see on their *very next* request under their *existing* session (e.g. `GET /api/projects` before and after, same session, no re-login) (FR-004)
- [ ] T021 [P] [US2] Feature test in the same file: editing a user's email to one already used by a different account is rejected (422) (FR-003)
- [ ] T022 [P] [US2] Feature test in the same file, two steps: (1) with exactly two enabled Admins A and B, Admin A demotes Admin B away from the Admin role — this **succeeds** (exactly one enabled Admin, A, remains, which is safe); (2) that same now-sole-remaining Admin (A) then attempts to demote themselves — this is **rejected**. Together these prove the guard is keyed to the *target's resulting admin count*, not to a hardcoded "is the actor editing themselves" check (FR-007, SC-005) — the deeper "this genuinely can't special-case self vs. other" proof is T008's direct Unit test of the guard's own signature
- [ ] T023 [P] [US2] Feature test in the same file: a `user.updated` audit entry contains only the changed fields' old/new values for `name`/`email`/`role`/`department` — never `password`, never `is_active` (FR-009, data-model.md)
- [ ] T024 [P] [US2] Feature test in the same file: editing a `User`'s system role never creates, modifies, or otherwise touches any `TeamMember` row (the separate, non-authenticating job-title roster) — a direct regression check for FR-012's non-conflation requirement, not just something true by construction that nobody verifies
- [ ] T025 [P] [US2] Feature test in the same file: sending `is_active` or `password` in a `PATCH /api/users/{id}` request body has **no effect** — the user's active status and password are both unchanged afterward — proving research.md's "kept out of the general update endpoint's mass-assignable fields" design decision actually holds, not just that they're absent from the documented request shape

### Implementation for User Story 2

- [ ] T026 [US2] Implement `UserManagementController::update()`: `sometimes`-validated fields (never `is_active`/`password` here — research.md), calls `wouldLeaveNoEnabledAdmins()` (T009) before applying a role change, `AuditLogger::record('user.updated', ...)` with a computed changed-fields diff — make T020-T025 pass (depends on T009, T012)
- [ ] T027 [US2] Frontend: add `updateUser(id, data)` to `api.js`; wire an edit form/modal in the Users tab, reusing the same fields as the create form

**Checkpoint**: User Story 1 and User Story 2 both work independently.

---

## Phase 5: User Story 3 - Admin disables or reactivates a user account (Priority: P2)

**Goal**: An Admin can disable a user (denying their very next request, whether login or an existing session) and later reactivate them, without ever touching historical data, and never leaving zero enabled Admins.

**Independent Test**: Disable an active user; confirm their existing session and a fresh login are both denied; reactivate; confirm access returns.

### Tests for User Story 3

- [ ] T028 [P] [US3] Feature test in `UserManagementTest.php`: disabling a user denies their very next request under their *already-open* session to an arbitrary endpoint (not just this feature's own), and a fresh login attempt with correct credentials also fails with the generic incorrect-credentials message (FR-005, SC-002)
- [ ] T029 [P] [US3] Feature test in the same file: reactivating a disabled user restores login and existing-session access (FR-005)
- [ ] T030 [P] [US3] Feature test in the same file, the same two-step shape as T022, applied to disabling instead of role-editing: (1) with exactly two enabled Admins A and B, Admin A disables Admin B — **succeeds** (one enabled Admin, A, remains); (2) A then attempts to disable themselves — **rejected**, since A is now the sole remaining enabled Admin (FR-007, SC-005)
- [ ] T031 [P] [US3] Feature test in the same file: a disabled user's pre-existing audit log entries, comments, attachments, and assigned tasks are all still present and still correctly display that user's name/role — disabling touches only future access, never history (FR-006)
- [ ] T032 [P] [US3] Feature test in the same file: `user.disabled`/`user.reactivated` audit entries exist with the acting Admin and target user identified (FR-009)
- [ ] T033 [P] [US3] Feature test in the same file, documenting the concurrency limitation honestly (plan.md's Testing section): the invariant holds correctly across two *sequential* disable attempts against two different remaining-enabled Admins (a same-process proxy for the true concurrent case PHPUnit's synchronous runner can't simulate). This task MUST also verify — by direct code inspection during review, not a runtime assertion — that both `update()`'s demotion path (T026) and `disable()`'s path (T034) call the exact same `wouldLeaveNoEnabledAdmins()` helper (T009), not two separate, near-equivalent implementations that could drift out of sync with each other over time

### Implementation for User Story 3

- [ ] T034 [US3] Implement `UserManagementController::disable()`/`reactivate()`: both call `wouldLeaveNoEnabledAdmins()` (T009) before disabling, `AuditLogger::record('user.disabled'|'user.reactivated', ...)` — make T028-T033 pass (depends on T009, T012)
- [ ] T035 [US3] Frontend: add `disableUser(id)`/`reactivateUser(id)` to `api.js`; wire a disable/reactivate action (with a confirmation step) in the Users tab, showing status clearly per row

**Checkpoint**: User Stories 1-3 are all independently functional together.

---

## Phase 6: User Story 4 - Admin resets a user's password (Priority: P3)

**Goal**: An Admin can set a new password for a user, who can then sign in with it (and not the old one), without any value ever appearing in an audit log.

**Independent Test**: Reset a user's password as Admin; confirm they can sign in with the new value and not the old one.

### Tests for User Story 4

- [ ] T036 [P] [US4] Feature test in `UserManagementTest.php`: after a password reset, the user can sign in with the new password and the old one no longer works (FR-008)
- [ ] T037 [P] [US4] Feature test in the same file: reset rejects a password shorter than 8 characters or a mismatched confirmation (`required|string|min:8|confirmed`, research.md)
- [ ] T038 [P] [US4] Feature test in the same file: a `user.password_reset` audit entry exists identifying the acting Admin and target user, with no password value anywhere in its `metadata` (FR-008, FR-009)

### Implementation for User Story 4

- [ ] T039 [US4] Implement `UserManagementController::resetPassword()`: validate, `Hash::make()`, `AuditLogger::record('user.password_reset', ...)` with metadata excluding the password entirely — make T036-T038 pass (depends on T012)
- [ ] T040 [US4] Frontend: add `resetUserPassword(id, data)` to `api.js`; wire a reset-password action in the Users tab (two password fields, matching the `confirmed` rule)

**Checkpoint**: All four user stories are independently functional together.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across the whole feature, matching quickstart.md and the constitution's regression expectations.

- [ ] T041 [P] Walk through all six scenarios in `specs/006-real-user-management/quickstart.md` manually, including Scenario 4's browser-level check that a disabled user's open session gets redirected to `/login` automatically (confirming the reused frontend interceptor actually fires end-to-end, not just returns the right status code)
- [ ] T042 Run `cd backend && php artisan test` — confirm all existing tests plus the new `UserManagementTest` and `UserTest` (Unit) pass
- [ ] T043 [P] Confirm `cd frontend && npm run build` and `npm run lint` remain clean
- [ ] T044 Regression check: confirm the existing Admin Control Center's Members, Grants, and Logs tabs are unchanged, and that login/me/logout for an active (never-disabled) user behaves exactly as it did before this feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T002's routes/T001's column need to exist) — BLOCKS all user stories, since the global gate and the invariant helper are both shared by every story below.
- **User Stories (Phase 3-6)**: All depend on Foundational (Phase 2) completion. US2 and US3 both depend on T009's `wouldLeaveNoEnabledAdmins()` helper specifically, but not on each other.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — no dependency on US2-4. Its Feature test file (`UserManagementTest.php`) is created here and extended (not recreated) by later stories' test tasks.
- **User Story 2 (P2)**: Can start after Foundational — depends on T009 (shared invariant helper), not on US1/US3/US4.
- **User Story 3 (P2)**: Can start after Foundational — depends on T009, not on US1/US2/US4.
- **User Story 4 (P3)**: Can start after Foundational — no dependency on T009 at all (password reset doesn't touch role/status).

### Within Each Phase

- Tests before implementation (T004-T008 before T009-T012; T013-T016 before T017-T019; T020-T025 before T026-T027; T028-T033 before T034-T035; T036-T038 before T039-T040)
- T009 (invariant helper) before T010 (middleware needs the `is_active` cast) and before T026/T034 (which call it)
- T012 (Resource + Admin gate) before every story's controller-action tasks

### Parallel Opportunities

- T001, T002, T003 (Setup) can all run in parallel — different files
- T004-T008 (Foundational tests) can run in parallel — T004-T007 are different assertions in the same Feature-test file (coordinate on merge); T008 is a separate Unit-test file, fully independent
- T013-T016, T020-T025, T028-T033, T036-T038 (each story's own tests) can each run in parallel internally, and US2/US3/US4's test tasks can all start as soon as Foundational is done — none depend on US1's tasks
- T041, T043 (Polish) can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# Launch all Foundational tests together (T004-T007 share a file; T008 is separate):
Task: "Feature test: active user unaffected by new middleware on an arbitrary endpoint"
Task: "Feature test: disabled user denied (401) on an arbitrary endpoint + generic login failure"
Task: "Feature test: non-Admin/unauthenticated denied on every new endpoint"
Task: "Feature test: UserResource never exposes password/remember_token"
Task: "Unit test: wouldLeaveNoEnabledAdmins() pure logic, in tests/Unit/UserTest.php"

# In parallel, start the model/helper work these tests will exercise:
Task: "User model: is_active fillable/cast + wouldLeaveNoEnabledAdmins() with locked transaction"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (the global gate + invariant helper — this is the highest-risk shared infrastructure)
3. Complete Phase 3: User Story 1 — list + create
4. **STOP and VALIDATE**: Run quickstart.md Scenarios 1-2 against US1 alone
5. Deploy/demo if ready — edit, disable/reactivate, and password reset can genuinely ship later without touching US1's code

### Incremental Delivery

1. Setup + Foundational → the global gate and invariant helper exist, fully correct, before any story-specific endpoint is built
2. Add User Story 1 → validate independently → MVP
3. Add User Story 2 → validate independently (Scenario 3)
4. Add User Story 3 → validate independently (Scenarios 4-5)
5. Add User Story 4 → validate independently (Scenario 6)
6. Phase 7 Polish — full quickstart.md pass + regression check

---

## Notes

- [P] tasks = different files or different assertions in a shared test file, no dependencies
- [Story] label maps task to specific user story for traceability
- The global middleware and the invariant helper are intentionally Foundational, not per-story — see the Organization note above
- Verify T004-T008/T013-T016/T020-T025/T028-T033/T036-T038 fail before their corresponding implementation tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
