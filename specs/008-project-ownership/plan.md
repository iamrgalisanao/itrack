# Implementation Plan: Project Ownership and PM-Scoped Administration

**Branch**: `008-project-ownership` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-project-ownership/spec.md`

## Summary

Introduces a real `project_ownerships` relationship (many-to-many, Project Manager ↔ Project) to replace the free-text `project_owner` label that has no queryable meaning today. Narrows 007-permission-hardening's `ProjectAssignmentController::store()`/`destroy()` so a Project Manager may only grant/revoke Team Member/Client project access on a project **that already has at least one owner** unless they are one of that project's owners — a project with **zero** owners remains unrestricted for any PM (FR-018), which is what makes this safe to deploy with no backfill and no staged rollout mechanism. Admin stays completely unrestricted, exactly as before. Adds Admin-only ownership CRUD plus a dedicated, concurrency-safe transfer action (atomic remove-one/add-one under a row lock, one audit entry), and extends the Admin Control Center with a new "Project Ownership" tab mirroring the existing "Project Assignments" tab's shape. No migration backfills ownership from the free-text field (confirmed no reliable signal exists); every project starts ownerless, which is an explicitly valid, unrestricted state (FR-003, FR-018) — the PM-scoped restriction activates per-project, automatically, only once an Admin assigns that specific project its first owner.

## Technical Context

**Language/Version**: PHP 8.4 (Laravel 13, unchanged) / JavaScript (ES2022+), React 19 (unchanged) — same stack as 001-007.

**Primary Dependencies**: None new. Reuses `HasRole` trait predicates (`isAdmin()`, `isProjectManager()`, never a raw role-string comparison), `AuditLogger::record()` (new `project_ownership.*` actions, extending its existing list), and `DepartmentGrantController`/`ProjectAssignmentController`'s established Admin-CRUD shape (composite-uniqueness validation, audit on every mutation) as the direct structural precedent for the new `ProjectOwnershipController`.

**Storage**: MySQL. **One small, additive migration**: `project_ownerships` (`user_id`, `project_id`, `assigned_by_user_id`, timestamps, unique on `[user_id, project_id]`) — byte-for-byte the same shape as 007's `project_assignments` table. `projects.project_owner` (the existing free-text column) is untouched — kept per the constitution's additive-migration principle, not dropped in this change (spec.md's Assumptions).

**Testing**: PHPUnit Feature tests extending `ProjectScopingTest.php`'s established pattern (`actingAs`, `assertStatus`, `assertDatabaseHas('audit_logs', ...)`) — new coverage for: (1) a PM who owns Project A can assign/revoke Team Member/Client access on A but is denied on Project B, which is owned by a *different* PM; (1a) the full enforcement matrix (data-model.md) gets one test per row, including the two multi-owner rows that are easy to skip if only the single-owner Scenario 3 story is tested: a PM who is *one of several* owners is allowed, and a PM who is *not* one of several owners on that same multi-owner project is denied; (2) a PM who owns zero projects is denied on a project that already has an owner, but succeeds on a project that has none at all (FR-018 — this distinction must be tested explicitly, since the two look identical without a project that has a different owner in the fixture); (3) Admin is unrestricted regardless of ownership, provably unchanged; (4) ownership transfer is atomic (old owner loses authority, new owner gains it, one `project_ownership.transferred` audit entry, not two separate created/deleted entries); (5) two concurrent transfer requests against the same ownership row: exactly one succeeds, the other gets `409`, and the project ends up with exactly one new owner, never two (FR-015 — this needs an explicit test since it's the one place `lockForUpdate()` matters, and the test must exercise the actual HTTP endpoint, not a direct model call, so it genuinely covers the route-model-binding-then-lock ordering described in data-model.md); (6) transferring to a PM who already co-owns the project consolidates (no duplicate row, no constraint violation) rather than erroring; (7) a disabled or role-changed owner's record persists but grants no authority, and authority resumes automatically if reinstated (should require zero new code, mirroring 007's FR-015 finding); (8) only active Project Manager accounts may be designated an owner (422 otherwise); (9) duplicate ownership assignment is idempotent; (10) deleting a project cascades its ownership rows; (11) PM read-visibility (Dashboard/Kanban/Work Program/Schedule/Reports) is provably unchanged by this feature. Frontend: manual verification via quickstart.md, unchanged practice from 001-007.

**Target Platform**: Same dev/prod web app as prior features — Laravel API at `localhost:8000`, Vite dev server at `localhost:5173`.

**Project Type**: Web application (backend/ + frontend/, existing structure).

**Performance Goals**: No material response-time regression on project-assignment write endpoints (the new ownership check is one additional indexed-lookup query, same class of cost as 007's own assignment-scoping check).

**Constraints**: Per FR-006/FR-007/FR-018, the ownership check in `ProjectAssignmentController::store()`/`destroy()` MUST apply only to the Project Manager branch, AND only once the target project has at least one owner recorded — a project with zero owners MUST remain unrestricted for any PM (the deploy-day rollout safety net; no backfill, no feature flag). The existing Admin branch MUST remain provably byte-identical to today's behavior (FR-008, SC-002). Per FR-011, a disabled or non-PM owner's dormant authority MUST require no dedicated "is this owner still valid" code path — it falls out for free from the existing `isProjectManager()`/`EnsureUserIsActive` checks already gating every authenticated request, exactly as 007's own assignment-persistence requirement did. Per FR-010, ownership transfer MUST be one atomic database transaction (old ownership row removed, new one created, both-or-neither) producing exactly one audit entry (`project_ownership.transferred`), not two independent created/deleted entries — a transfer is one action from an Admin's perspective, not a sequence they must reason about themselves. Per FR-015, the `[user_id, project_id]` unique constraint alone is **not** a sufficient concurrency guarantee for transfer specifically — it only prevents a duplicate `(user_id, project_id)` pair, not a stale-read race where two concurrent transfers of the *same* ownership row both proceed on their own now-invalid assumption of what they're replacing. The transfer transaction MUST `lockForUpdate()` the ownership row being transferred and re-verify it still exists before acting, aborting with `409 Conflict` if a concurrent request already consumed it — mirroring 006's own precedent for guarding a read-then-write invariant, scoped down to only the one operation (transfer) that actually has this shape; plain `store()`/`destroy()` remain adequately protected by the unique constraint and delete-idempotency respectively, with no locking needed there.

**Scale/Scope**: 1 new migration, 1 new model (`ProjectOwnership`), 1 new scope on `Project` (`scopeOwnedBy`, parallel to the existing `scopeAccessibleTo`), 1 new controller (`ProjectOwnershipController`: index/store/destroy/transfer), 1 new Resource (`ProjectOwnershipResource`), 2 modified methods (`ProjectAssignmentController::store`/`destroy`, adding the ownership branch for PM), 1 new frontend Admin Control Center tab ("Project Ownership"), new PHPUnit Feature tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Fail-Closed Access Control | Yes | The new ownership check uses `HasRole` predicates (`isAdmin()`, `isProjectManager()`) exclusively — never a raw role-string comparison. An unrecognized role or non-PM/non-Admin actor is denied by the existing `isPmOrAdmin()` gate, unchanged. **PASS**. |
| II. Consistent API Contracts | Yes | New `ProjectOwnershipResource` exposes only `id`/`user`/`project`/`assigned_by`/`created_at`, mirroring `ProjectAssignmentResource` exactly — never a raw model. **PASS**. |
| III. Test Coverage Grows With the Feature | Yes | A new authorization rule (PM scoped to owned projects) on an existing endpoint is exactly this principle's target — full allowed/denied coverage required in tasks.md, including the "Admin provably unaffected" regression proof (mirroring 007's own FR-004 test pattern). **PASS**. |
| IV. Audit Sensitive Mutations | Yes | Ownership add/remove/transfer are the core scenario this principle names. All routed through `AuditLogger::record()`, extending its action list with `project_ownership.created`/`.deleted`/`.transferred`. **PASS**. |
| V. Small, Additive, Reversible Migrations | Yes | One new table, no existing column touched or dropped. `projects.project_owner` is explicitly retained (spec.md's Assumptions) — this migration adds a relationship alongside it, doesn't replace it in the same change. **PASS**. |
| VI. Real Auth Is the Only Forward Path | Yes | Reads/writes exclusively via Sanctum-authenticated `$request->user()`, same as `ProjectAssignmentController`. No mock-role dependency anywhere. **PASS**. |

No unjustified violations. Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: Design artifacts (data-model.md, contracts/, quickstart.md) confirm the architecture above — one new table shaped identically to `project_assignments`, one new `Project::scopeOwnedBy` mirroring the existing `scopeAccessibleTo` pattern, and the ownership check added only to the PM branch of two existing methods. No new access-control concept introduced beyond "PM authority now requires an ownership row," which composes cleanly with every existing 007 primitive rather than replacing any of them. Gate re-evaluation: **PASS**, unchanged from pre-design.

## Project Structure

### Documentation (this feature)

```text
specs/008-project-ownership/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
# Option 2: Web application (frontend/ + backend/, matches existing repo layout)

backend/
├── database/migrations/
│   └── 2026_07_26_090000_create_project_ownerships_table.php   # new —
│       user_id/project_id/assigned_by_user_id, unique on
│       [user_id, project_id], cascadeOnDelete on project_id (FR-014)
├── app/Models/
│   ├── Project.php                    # modified — new scopeOwnedBy(),
│   │                                   #   new ownerships() relation
│   └── ProjectOwnership.php           # new — same shape as ProjectAssignment
├── app/Http/Controllers/
│   ├── ProjectOwnershipController.php # new — index/store/destroy/transfer,
│   │                                   #   Admin-only (see research.md on
│   │                                   #   why ownership management itself
│   │                                   #   isn't PM-delegable)
│   └── ProjectAssignmentController.php # modified — store()/destroy()'s
│                                       #   existing isPmOrAdmin() branch
│                                       #   split: Admin unrestricted
│                                       #   (unchanged), PM requires
│                                       #   Project::ownedBy($user) on the
│                                       #   target project
├── app/Http/Resources/
│   └── ProjectOwnershipResource.php   # new — mirrors ProjectAssignmentResource
└── routes/api.php                     # modified — add
                                        #   GET/POST /api/project-ownerships,
                                        #   DELETE /api/project-ownerships/{id},
                                        #   POST /api/project-ownerships/{id}/transfer

frontend/
└── src/pages/Admin.jsx                # modified — 6th tab, "Project
                                        #   Ownership" (grid-cols-5 →
                                        #   grid-cols-6), reusing the exact
                                        #   list/create-dialog pattern the
                                        #   "Project Assignments" tab
                                        #   already established in 007,
                                        #   plus a per-row "Transfer" action

backend/tests/Feature/
└── ProjectScopingTest.php             # extended — see Testing above
```

**Structure Decision**: The ownership check is added directly inside `ProjectAssignmentController`'s existing two methods, not as a new middleware or trait — unlike `BelongsToProject` (which had to serve six structurally-different nested models), there is exactly one call site that needs this rule, so a new abstraction would be premature. `Project::scopeOwnedBy` is deliberately the same shape as `Project::scopeAccessibleTo` (a query scope, not a standalone service) so the two compose naturally and read the same way to a future maintainer. Ownership management itself (`ProjectOwnershipController`) is Admin-only, not opened to owning PMs — spec.md's User Story 1 and Story 3 consistently frame ownership assignment/transfer as an Admin action, and 007's own precedent (department grants, user management) already reserves "who can access what" governance actions for Admin alone, never delegated to the role being governed.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
