---

description: "Task list template for feature implementation"
---

# Tasks: Permission Hardening

**Input**: Design documents from `/specs/007-permission-hardening/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/permission-hardening-api.md, quickstart.md

**Tests**: Included. Constitution Principle III explicitly names "permission hardening work" as requiring Feature-test coverage for the happy path and at least one denied/unauthorized path per role-gated change — this feature adds or changes authorization on eight controllers plus two entirely new subsystems (assignments, preview), so the bar is the full role matrix per surface, not a sample.

**Organization**: Tasks are grouped by user story (US1-US3, matching spec.md's priorities). Two things are Foundational rather than part of any one story: `AccessContext` and the repointing of all eight project-scoped controllers' existing private `user()` helper to it. Both US1's new accessibility checks and US2's entire preview mechanism depend on this one seam existing first — building it twice (once naively for US1, then reworked for US2) would be the exact "N places to keep in sync" risk this plan's other primitives (`BelongsToProject`, the exception-handler rule) were built to avoid.

**A note on audit tasks and story boundaries**: spec.md's US3 acceptance scenarios describe verifying that assignment grants/revokes and preview start/end appear in the Admin Audit Logs viewer — but the `AuditLogger::record()` calls themselves are written as part of building the mutating endpoints in US1 (`ProjectAssignmentController`) and US2 (`PreviewSessionController`, `ResolvePreviewSession`), per Constitution Principle IV ("adding one is part of the task, not a follow-up") — an endpoint cannot be considered built without deciding whether and how it audits. This mirrors 006-real-user-management's tasks.md, where audit assertions were embedded directly in each story's own test tasks rather than deferred to a separate audit-focused phase. US3's priority label reflects when the *consistent-denial-experience* half of its scope (FR-010, genuinely separable, needs both US1's and US2's denial surfaces to exist to be "consistent" across) is worth shipping — not that audit code is written last.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Paths are absolute from repository root, matching plan.md's Project Structure section

## Path Conventions

Web application, matching this repo's existing 001-006 structure: `backend/app/`, `backend/database/migrations/`, `backend/tests/`, `frontend/src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolding so later phases have somewhere to add real logic — no business logic yet.

- [ ] T001 [P] Add empty `ProjectAssignmentController` and `PreviewSessionController` stubs (empty actions: `index`/`store`/`destroy` and `store`/`destroy` respectively) in `backend/app/Http/Controllers/` — no routes registered yet
- [ ] T002 [P] Add an empty "Project Assignments" tab shell (5th tab, alongside the existing Members/User Accounts/Grants/Logs) to `frontend/src/pages/Admin.jsx` — no data wiring yet; add an empty `PreviewBanner.jsx` placeholder in `frontend/src/components/`

**Checkpoint**: Controller stubs exist, tab renders empty — nothing functional yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `AccessContext` and the shared controller seam every subsequent check (new or pre-existing) resolves the acting user through. **MUST complete before any user story phase.**

**⚠️ CRITICAL**: This repoints a helper called by every existing check in eight controllers — it must be proven behavior-preserving (identical results with no preview active, which is the only state possible before US2 exists) before any story-specific work adds new checks on top of it.

### Tests first (write these, confirm they FAIL before implementing)

- [ ] T003 [P] Unit test in `backend/tests/Unit/AccessContextTest.php`: `AccessContext::user($request)` returns `$request->user()` when no `preview_target` request attribute is set — the only reachable state before US2's `ResolvePreviewSession` exists, so this is the correctness baseline everything else builds on

### Implementation

- [ ] T004 Implement `AccessContext` (`backend/app/Support/AccessContext.php`) — `public static function user(Request $request): User { return $request->attributes->get('preview_target') ?? $request->user(); }` (data-model.md) — make T003 pass
- [ ] T005 Repoint the existing private `user(Request $request): User` helper in `ProjectController`, `ModuleController`, `ActivityController`, `SubActivityController`, `DetailedActivityController`, `CommentController`, `AttachmentController`, and `ReportController` (all in `backend/app/Http/Controllers/`) from `return $request->user();` to `return AccessContext::user($request);` — one line each, eight files (depends on T004). Run the full existing `backend/tests/Feature` suite afterward and confirm zero regressions — no request attribute is ever set yet, so every call must still resolve identically to `$request->user()`

**Checkpoint**: `AccessContext` exists and is proven behavior-preserving. Every user story below builds new checks on top of this seam without needing to touch it again.

---

## Phase 3: User Story 1 - Team Members and Clients see only their assigned projects (Priority: P1) 🎯 MVP

**Goal**: Replace department-wide visibility with per-user project assignment for Team Member/Client roles, across every project-scoped surface — including the six nested-resource controllers that currently have no project-level check at all (research.md's Finding).

**Independent Test**: As an Admin, assign a Team Member to exactly one of three projects in their department; sign in as that Team Member and confirm only the assigned project appears anywhere in the app, and the other two return 403 if accessed directly by ID — at every nesting depth, not just the project resource itself.

### Tests for User Story 1

- [ ] T006 [P] [US1] Feature test in `backend/tests/Feature/ProjectScopingTest.php` (new file): a Team Member assigned to Project A only sees Project A — not their whole department — across `GET /api/dashboard`, `GET /api/projects/{id}/modules`, and `GET /api/reports` (FR-001-FR-003)
- [ ] T007 [P] [US1] Feature test in the same file: a second Team Member in the *same department* but a *different* assignment sees neither the first Team Member's project nor any department-wide view — the actual regression this feature fixes, not merely "assignment grants access" in isolation
- [ ] T008 [P] [US1] Feature test in the same file: for an unassigned-but-existing project, every one of `ModuleController`/`ActivityController`/`SubActivityController`/`DetailedActivityController`/`CommentController`/`AttachmentController` denies both read (`index`/`show`) and write (`store`/`update`/`destroy`) with `403` for a Team Member/Client (FR-003) — the primary regression test for research.md's Finding
- [ ] T009 [P] [US1] Feature test in the same file: the identical requests from T008, repeated against a project ID that does not exist at all, produce a **byte-identical response body** to T008's existing-but-inaccessible case — never `404` (FR-005/FR-011)
- [ ] T010 [P] [US1] Feature test in the same file: Admin, Project Manager, and Department Head are provably unaffected — existing `RoleAccessTest.php`'s Department-Head-with-`DepartmentGrant` scoping tests still pass unmodified, and a new assertion confirms these three roles still get a normal `404` (not `403`) for a genuinely nonexistent project ID (FR-004)
- [ ] T011 [P] [US1] Feature test in the same file: removing a Team Member's project assignment denies their very next request under their *existing* session — no re-login required (FR-002, matching 006's immediate-effect precedent)
- [ ] T012 [P] [US1] Feature test in the same file: `POST /api/project-assignments` for a pair that already exists returns `200` (not `201`) with the existing row, and writes **no** new audit entry (FR-017)
- [ ] T013 [P] [US1] Feature test in the same file: assigning a Department Head, Project Manager, Admin, or a disabled user account is rejected `422` (FR-016)
- [ ] T014 [P] [US1] Feature test in the same file: `project_assignment.created` and `project_assignment.deleted` audit entries exist after grant/revoke, identifying the acting Admin/PM, target user, and project (FR-013)
- [ ] T015 [P] [US1] Feature test in the same file: deleting a project removes its `project_assignments` rows (FR-014) — no orphaned rows
- [ ] T016 [P] [US1] Feature test in the same file: a user's assignments survive a role change to a broader role (e.g. Team Member → Project Manager) and remain intact-but-dormant, restoring the original narrower access if the role is later changed back (FR-015)

### Implementation for User Story 1

- [ ] T017 [US1] Migration in `backend/database/migrations/2026_07_25_090000_create_project_assignments_table.php`: `user_id`/`project_id`/`assigned_by_user_id` as real `foreignId()->constrained()` (project_id cascades on delete), unique on `[user_id, project_id]` (data-model.md)
- [ ] T018 [US1] `ProjectAssignment` model in `backend/app/Models/ProjectAssignment.php` (data-model.md) — depends on T017
- [ ] T019 [US1] `Project` model (`backend/app/Models/Project.php`): add `assignments(): HasMany`; change `scopeAccessibleTo`'s Team Member/Client branch from `where('department', ...)` to `whereHas('assignments', fn ($q) => $q->where('user_id', $user->id))` — Admin/PM/Department Head branches untouched (data-model.md) — depends on T018; make T006, T007, T010 pass
- [ ] T020 [P] [US1] `BelongsToProject` trait in `backend/app/Models/Concerns/BelongsToProject.php` — `abstract resolveProjectId(): int` + `isAccessibleTo(User $user): bool` delegating to `Project::accessibleTo($user)->whereKey($this->resolveProjectId())->exists()` (data-model.md) — depends on T019
- [ ] T021 [P] [US1] Apply `BelongsToProject` + implement `resolveProjectId()` on `Module`, `Activity`, `SubActivity`, `DetailedActivity`, `Comment`, `Attachment` models per data-model.md's per-model relationship chain — depends on T020
- [ ] T022 [US1] Add `abort_unless($model->isAccessibleTo(AccessContext::user($request)), 403)` to every method of `ModuleController`/`ActivityController`/`SubActivityController`/`DetailedActivityController`/`CommentController`/`AttachmentController` currently lacking a project-level check (for `index`/`store`, check the shallow-route parent before querying/creating children) — depends on T005, T021; make T006, T008 pass
- [ ] T023 [US1] Exception-handler rule (`backend/app/Exceptions/Handler.php` or `bootstrap/app.php`'s `withExceptions`): map `ModelNotFoundException` for `Project`/`Module`/`Activity`/`SubActivity`/`DetailedActivity`/`Comment`/`Attachment` to the same `403` shape `BelongsToProject`'s denial uses, only when `AccessContext::user($request)` is Team Member or Client (research.md) — depends on T005; make T009 pass
- [ ] T024 [US1] `ProjectAssignmentResource` in `backend/app/Http/Resources/ProjectAssignmentResource.php` (data-model.md's Response shapes)
- [ ] T025 [US1] Implement `ProjectAssignmentController::index/store/destroy`: Admin/PM-only; `store` validates FR-016 (target role Team Member/Client, `is_active`) and uses `firstOrCreate` for FR-017 idempotency; both mutations call `AuditLogger::record()` (`project_assignment.created`/`.deleted`, FR-013) — depends on T018, T024; make T011-T014 pass
- [ ] T026 [US1] Register `GET/POST /api/project-assignments`, `DELETE /api/project-assignments/{id}` in `backend/routes/api.php`, inside the existing authenticated group — depends on T025, T001
- [ ] T027 [P] [US1] One-off Artisan command `backend/app/Console/Commands/BackfillProjectAssignments.php` (`permissions:backfill-assignments`): seeds one `project_assignments` row per existing Team Member/Client for every project in their current department — the concrete rollout backfill decision spec.md's Assumptions requires before this feature is deployable (quickstart.md's Prerequisites) — depends on T017
- [ ] T028 [US1] Frontend: add `fetchProjectAssignments(params)`/`createProjectAssignment(data)`/`deleteProjectAssignment(id)` to `frontend/src/lib/api.js`; wire the "Project Assignments" tab's list/create/delete UI in `frontend/src/pages/Admin.jsx`, following the existing Members/User Accounts tabs' fetch/toast/error conventions — depends on T026, T002

**Checkpoint**: User Story 1 is fully functional and independently testable/demoable as the MVP — the core exposure the PRD calls out is closed, across every nesting depth.

---

## Phase 4: User Story 2 - Admin can preview the app as a specific user (Priority: P2)

**Goal**: A read-only, bounded-lifetime "preview as user" mode that reflects the target's *entire* access — new project-assignment scoping and every pre-existing role check alike — with every write rejected and every state transition audited.

**Independent Test**: As an Admin, start a preview session as a specific Team Member; confirm the project list matches that Team Member's real assignments, and confirm every create/edit/delete action is disabled or rejected while previewing.

### Tests for User Story 2

- [ ] T029 [P] [US2] Feature test in `ProjectScopingTest.php`: previewing as a Team Member with one assignment shows exactly that assignment across Dashboard/Modules/Reports, not the Admin's own full access (FR-006)
- [ ] T030 [P] [US2] Feature test in the same file: previewing as a Client hits the *pre-existing* `GET /api/reports/export-csv` Client-role denial — not the Admin's own unrestricted export access (FR-006; research.md's finding on the shared `user()` helper repointed in T005)
- [ ] T031 [P] [US2] Feature test in the same file: every write type (create/update/delete across the six nested controllers, and `POST`/`DELETE /api/project-assignments`) is rejected `403` while a valid preview session is active, and the attempted write never actually applies (reload without previewing and confirm unchanged) (FR-007)
- [ ] T032 [P] [US2] Feature test in the same file: a blocked write produces a `preview.write_blocked` audit entry with `target_user_id`/`attempted_method`/`attempted_path` (FR-007)
- [ ] T033 [P] [US2] Feature test in the same file: a non-Admin gets `403` from `POST /api/preview-sessions` (FR-008)
- [ ] T034 [P] [US2] Feature test in the same file: starting a preview targeting another Admin is rejected `422` (FR-009)
- [ ] T035 [P] [US2] Feature test in the same file: starting a preview targeting a disabled user account is rejected `422` at creation, not merely detected later (round-3 review high-priority item)
- [ ] T036 [P] [US2] Feature test in the same file: starting a new preview while one is already active for the same Admin succeeds — ends the prior session and replaces it — rather than being blocked by `BlockWritesDuringPreview` (round-3 review point 1)
- [ ] T037 [P] [US2] Feature test in the same file, one case per reason: a presented `X-Preview-Session` header that is expired, targets a now-disabled user, targets a user whose role has changed since the session started, or doesn't resolve to any session at all, each produce `409` with the `X-Preview-Ended` header and **no domain data** in the response body (FR-019; round-3 review point 3)
- [ ] T038 [P] [US2] Feature test in the same file: `preview.started` exists on start; `preview.ended` exists for each of explicit end (`reason: manual`), expiry (`reason: expired`), target disabled (`reason: target_disabled`), and target role change (`reason: target_role_changed`) (FR-018)
- [ ] T039 [P] [US2] Feature test in the same file: `preview_sessions.expires_at` is set to exactly `started_at + 2 hours` at creation (FR-020)

### Implementation for User Story 2

- [ ] T040 [US2] Migration in `backend/database/migrations/2026_07_25_090500_create_preview_sessions_table.php`: `admin_user_id`/`target_user_id` as `foreignId()->constrained('users')->cascadeOnDelete()`, `target_role_at_start` string, `token` unique string(64), `started_at`/`ended_at` (nullable)/`expires_at` timestamps (data-model.md)
- [ ] T041 [US2] `PreviewSession` model in `backend/app/Models/PreviewSession.php` with `invalidReason(): ?string` checking `ended_at` → `expires_at` → `target.is_active` → `target.role !== target_role_at_start`, in that order (data-model.md) — depends on T040
- [ ] T042 [US2] `ResolvePreviewSession` middleware (`backend/app/Http/Middleware/ResolvePreviewSession.php`): no header → pass through; valid token → attach `preview_target` request attribute; invalid/missing → set `ended_at` + `AuditLogger::record('preview.ended', ...)` with the specific reason if not already ended, then short-circuit `409` + `X-Preview-Ended: 1` + no domain data (data-model.md) — depends on T041; make T037, T038 (the non-manual reasons) pass
- [ ] T043 [US2] `BlockWritesDuringPreview` middleware (`backend/app/Http/Middleware/BlockWritesDuringPreview.php`): reject non-`GET` requests carrying a resolved `preview_target`, except `POST /api/preview-sessions`, `DELETE /api/preview-sessions/current`, `POST /api/logout`; audit `preview.write_blocked` (contracts/permission-hardening-api.md) — depends on T042; make T031, T032, T036 pass
- [ ] T044 [US2] Register `ResolvePreviewSession` then `BlockWritesDuringPreview`, in that order, into the existing authenticated route group in `backend/routes/api.php` — depends on T042, T043
- [ ] T045 [US2] `PreviewSessionResource` in `backend/app/Http/Resources/PreviewSessionResource.php` — includes `token` only on the `store` (start) response, never on any other response (data-model.md)
- [ ] T046 [US2] Implement `PreviewSessionController::store` (Admin-only; reject Admin target FR-009 and disabled target per T035; end any prior active session for this Admin first; `target_role_at_start` snapshot; `expires_at = now()->addHours(2)`; `preview.started` audit) and `::destroy` (current session, Admin must own it, `reason: manual` audit) — depends on T041, T045; make T029, T030, T033-T035, T039 pass
- [ ] T047 [US2] Register `POST /api/preview-sessions`, `DELETE /api/preview-sessions/current` in `backend/routes/api.php` — depends on T046, T001
- [ ] T048 [US2] Frontend: `frontend/src/lib/previewSession.js` (`sessionStorage`-backed token/target helper); a new request interceptor in `frontend/src/lib/api.js` attaching `X-Preview-Session` when set; a response-interceptor branch reading `X-Preview-Ended` (clears local state, surfaces a toast, triggers a refetch); `startPreview(targetUserId)`/`endPreview()` in `api.js`; `frontend/src/context/PreviewContext.jsx`; `frontend/src/components/PreviewBanner.jsx` (End Preview control); a per-row "Preview" action on Admin.jsx's User Accounts tab — depends on T047, T002

**Checkpoint**: User Stories 1 and 2 both work independently and together — preview correctly reflects a target's complete access, not just the new assignment dimension.

---

## Phase 5: User Story 3 - Consistent access-denied experience and an audit trail for access changes (Priority: P3)

**Goal**: Every access-denied case across the app looks and behaves identically, and the assignment/preview audit trail built in US1/US2 is verifiably visible end-to-end through the existing Admin Audit Logs viewer.

**Independent Test**: Trigger an access-denied condition from three different entry points (direct URL, API call to a nested resource, an action button that shouldn't be visible); confirm all three produce the same access-denied experience. Separately, assign then revoke a project assignment and confirm both actions appear in the Admin Audit Logs viewer.

### Tests for User Story 3

- [ ] T049 [P] [US3] Manual verification (documented in quickstart.md Scenario 7, run here): navigating to a role-gated route, calling a project-scoped API directly for an unassigned project, and a mid-session assignment revocation on an open Reports page all render the same `AccessDenied` component/experience (FR-010)
- [ ] T050 [P] [US3] Feature test in `ProjectScopingTest.php`: `GET /api/audit-logs` (the same endpoint the existing Logs tab already reads) returns the `project_assignment.created`/`.deleted` entries from T014 and the `preview.started`/`.ended` entries from T038 — verifying the already-built audit trail is visible end-to-end through the viewer Admin already uses, not new audit-writing code (FR-013/FR-018; see this file's "note on audit tasks" above)

### Implementation for User Story 3

- [ ] T051 [US3] `AccessDenied` component in `frontend/src/components/AccessDenied.jsx` — icon/heading/message/recovery-action, parameterized by an optional message
- [ ] T052 [US3] Reduce `KanbanGuard`/`SupportOpsGuard`/`AdminGuard` in `frontend/src/App.jsx` to a role check + `<AccessDenied />`, removing the three duplicated JSX copies — depends on T051
- [ ] T053 [US3] Wire project-scoped `403` handling into `frontend/src/pages/{Dashboard,Schedule,WorkProgram,Reports}.jsx`: render `<AccessDenied />` inline instead of the current generic toast when a project-scoped fetch returns `403` mid-session — depends on T051

**Checkpoint**: All three user stories are independently functional together.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across the whole feature, matching quickstart.md and the constitution's regression expectations.

- [ ] T054 [P] Walk through every scenario in `specs/007-permission-hardening/quickstart.md` (1-10, 6b, 7b) manually, including the rollout backfill command from T027
- [ ] T055 Run `cd backend && php artisan test` — confirm all existing tests plus the new `ProjectScopingTest.php` and `Unit/AccessContextTest.php` pass
- [ ] T056 [P] Confirm `cd frontend && npm run build` and `npm run lint` remain clean
- [ ] T057 Regression check: confirm Admin, Project Manager, and Department Head see identical data across Dashboard/Kanban/Work Program/Schedule/Reports as before this feature, and that the existing Admin Control Center's Members/User Accounts/Grants/Logs tabs are unchanged

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001's controller stubs need to exist for later route registration) — BLOCKS all user stories, since `AccessContext` and the eight-controller repoint are depended on by both US1's new checks and US2's entire mechanism.
- **User Stories (Phase 3-5)**: All depend on Foundational (Phase 2) completion. US2 has a real, spec-acknowledged dependency on US1 (previewing a Team Member's assignments requires assignments to exist and be enforced) — it can be *built* in parallel but cannot be meaningfully *demoed* before US1. US3 depends on both US1 and US2 existing to have denial/audit surfaces to be consistent across (T049, T050).
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — no dependency on US2/US3.
- **User Story 2 (P2)**: Can start after Foundational — depends on US1's `scopeAccessibleTo`/assignment mechanism for its own independent test to mean anything (spec.md's own framing), though its code (migration, middleware, controller) can be written in parallel.
- **User Story 3 (P3)**: Can start after Foundational, but T049/T050 need US1's and US2's denial/audit surfaces (T008/T009, T031/T037, T014/T038) to exist to verify against.

### Within Each Phase

- Tests before implementation (T006-T016 before T017-T028; T029-T039 before T040-T048; T049-T050 before/alongside T051-T053)
- T004 (AccessContext) before T005 (repoint) before every controller-check task in US1/US2 (T022, T023, T042, T043, T046)
- T017/T018/T019 (assignment schema + `scopeAccessibleTo`) before T020/T021 (trait) before T022 (controller checks)
- T040/T041 (preview schema) before T042 (`ResolvePreviewSession`) before T043 (`BlockWritesDuringPreview`) before T044 (route registration) — this ordering is load-bearing, not incidental (plan.md's Constraints)

### Parallel Opportunities

- T001, T002 (Setup) can run in parallel — different files
- T003 is a single Foundational test; T004/T005 depend on it sequentially — small phase, little parallelism, by design (matches 006's economical Foundational phase)
- T006-T016 (US1 tests) can run in parallel — one shared file, but independent assertions; T020, T021, T027 (US1 implementation) can run in parallel once their own dependencies are met
- T029-T039 (US2 tests) can run in parallel once Foundational is done, even before US1's implementation tasks finish (though their assertions won't be meaningful until US1 lands)
- T049, T050 (US3 tests) can run in parallel

---

## Parallel Example: User Story 1 tests

```bash
# Launch US1's test assertions together (T006-T016 share ProjectScopingTest.php,
# coordinate on merge, but are independently writable):
Task: "Feature test: Team Member sees only assigned project, not whole department"
Task: "Feature test: second Team Member, same department, different assignment — no cross-visibility"
Task: "Feature test: all six nested controllers deny read+write for unassigned existing project"
Task: "Feature test: nonexistent project ID produces byte-identical 403 to unassigned-existing case"
Task: "Feature test: Admin/PM/Department Head unaffected, still get 404 for nonexistent IDs"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (`AccessContext` + the eight-controller repoint — proven behavior-preserving before anything else builds on it)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run quickstart.md Scenarios 1-3, 8, 10 against US1 alone; run T027's backfill command against seed data and confirm no existing account's access narrows
5. Deploy/demo if ready — preview and consistent-denial UX can genuinely ship later without touching US1's code

### Incremental Delivery

1. Setup + Foundational → the shared authorization seam exists, proven correct, before any story-specific check is added
2. Add User Story 1 → validate independently (quickstart Scenarios 1-3, 8, 10) → MVP
3. Add User Story 2 → validate independently (quickstart Scenarios 4-6, 6b)
4. Add User Story 3 → validate independently (quickstart Scenario 7, 7b)
5. Phase 6 Polish — full quickstart.md pass + regression check

---

## Notes

- [P] tasks = different files, or independent assertions in a shared test file, no dependencies
- [Story] label maps task to specific user story for traceability
- `AccessContext` and the controller `user()` repoint are intentionally Foundational, not per-story — see the Organization note above
- Verify T003/T006-T016/T029-T039/T049-T050 fail before their corresponding implementation tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
