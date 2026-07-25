# Implementation Plan: Permission Hardening

**Branch**: `007-permission-hardening` | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-permission-hardening/spec.md`

## Summary

Replace Team Member/Client project visibility from "everything in my department" to "only my explicit per-user assignments," via a new `project_assignments` table and an updated `Project::scopeAccessibleTo`. The larger, previously-invisible half of this work: **Module, Activity, SubActivity, DetailedActivity, Comment, and Attachment controllers currently perform zero project- or department-level authorization at all** — any authenticated user can read, and where role allows, write any project's nested data by ID, regardless of department. This plan closes that gap with one reusable primitive (`BelongsToProject` trait + `Project::scopeAccessibleTo`), applied identically across all six controllers, rather than six divergent checks. Adds a DB-backed, bounded-lifetime Admin "preview as user" mechanism (new `preview_sessions` table, a `ResolvePreviewSession` middleware that validates the preview token before any controller runs — short-circuiting with 409 and no domain data if it's invalid, rather than silently falling back to the Admin's own view mid-response — plus the `AccessContext` accessor every read-scoping check uses, and a global middleware blocking writes while previewing), a shared `AccessDenied` UI component consolidating three currently-duplicated Guard components, and audit coverage for every grant/revoke and preview start/end. No new framework or storage technology; all migrations are additive.

## Technical Context

**Language/Version**: PHP 8.4 (Laravel 13, unchanged) / JavaScript (ES2022+), React 19 (unchanged) — same stack as 001-006.

**Primary Dependencies**: None new. Reuses `Project::scopeAccessibleTo` (extended, not replaced — research.md), `HasRole` trait predicates, `AuditLogger::record()` (new `project_assignment.*`/`preview.*` actions, extending its existing action list), `DepartmentGrantController` as the structural precedent for the new `ProjectAssignmentController` (Admin-only CRUD, composite-uniqueness validation, audit-on-every-mutation). No new package for tokens — a plain random string column, following this codebase's existing `department_grants.granted_by_user_id` precedent of a simple column rather than reaching for a package.

**Storage**: MySQL. **Two small, additive migrations**: `project_assignments` (user_id, project_id, assigned_by_user_id, timestamps, unique on `[user_id, project_id]`) and `preview_sessions` (admin_user_id, target_user_id, target_role_at_start, token, started_at, ended_at nullable, expires_at, timestamps — `target_role_at_start` is what lets `ResolvePreviewSession` detect a mid-session role change per FR-019, not just a disabled account). No column on any existing table changes meaning; `projects.project_owner` is untouched (see spec.md's Assumptions on why "PM owns project" is explicitly deferred).

**Testing**: PHPUnit Feature tests extending `RoleAccessTest.php`'s established pattern (`actingAs($user, 'sanctum')`, `assertStatus`, `assertDatabaseHas('audit_logs', ...)`, per-role-loop denial checks) — new file `backend/tests/Feature/ProjectScopingTest.php` covering: (1) a Team Member/Client sees only assigned projects across Dashboard/Modules("Kanban")/Reports, and a second Team Member in the *same department* but a *different* assignment sees neither the other's project nor a shared department-wide view (the actual regression this feature fixes); (2) every one of the six previously-unguarded controllers (Module/Activity/SubActivity/DetailedActivity/Comment/Attachment) denies read and write for an unassigned Team Member/Client, both for a project that exists and one that doesn't, asserting **identical 403 response bodies** for both (FR-005/FR-011); (3) Admin/PM/Department Head behavior is provably unchanged (existing `RoleAccessTest` department-head-with-grants tests must still pass unmodified); (4) preview mode: read reflects target exactly — including previewing as a Client correctly triggering the pre-existing report-export denial, not the Admin's own unrestricted access (round-4 review's finding on the shared `user()` helper) — every write type is rejected with the write itself never committed, preview ends on explicit stop / expiry / target disabled / target role changed, non-Admin and preview-as-Admin are both rejected; (5) assignment idempotency, invalid-target rejection (wrong role, disabled account), cascade-delete on project deletion; (6) every grant/revoke/preview-start/preview-end action produces exactly one matching `audit_logs` row. Frontend: manual verification via quickstart.md, unchanged practice from 001-006.

**Target Platform**: Same dev/prod web app as prior features — Laravel API at `localhost:8000`, Vite dev server at `localhost:5173`.

**Project Type**: Web application (backend/ + frontend/, existing structure).

**Performance Goals**: Per SC-006, no material response-time regression on project-scoped endpoints. Not a numeric target beyond that — this app has no existing latency baseline to target a number against (matches every prior feature's own assessment of scale) — but the design satisfies SC-006 structurally: the new `whereHas('assignments', ...)` clause in `scopeAccessibleTo` and the per-request `BelongsToProject` accessibility check are both single indexed lookups (unique index on `[user_id, project_id]` backs both), not N+1 or full-table scans, so no new query-count class is introduced relative to the existing `accessibleTo` calls this feature extends.

**Constraints**: Per FR-003, the new authorization check MUST be the *same* check (the `BelongsToProject` trait, ultimately delegating to `Project::scopeAccessibleTo`) applied identically in all six previously-unguarded controllers — not six independently-written checks that could drift. Per FR-005/FR-011, a Team Member/Client's request for a project-scoped resource that doesn't exist and one that exists-but-is-inaccessible MUST produce the same 403 — since Laravel's default implicit route-model binding already 404s a genuinely-missing ID before any authorization code runs, this requires an explicit interception (research.md), scoped **only** to Team Member/Client requesters so Admin/PM/Department Head behavior is provably unaffected (FR-004). Per FR-006/FR-007, preview mode MUST NOT change who is actually authenticated (Sanctum's session subject stays the Admin throughout — audit `actor_*` fields always reflect the real Admin, never the previewed target) — only *what data reads return*, via one central `AccessContext::user($request)` call site that every read-scoping check uses instead of `$request->user()` directly. A presented-but-invalid preview token MUST NOT cause a controller to run at all — `ResolvePreviewSession` validates and short-circuits (409, no domain data) before any controller sees the request, so there is never a response that mixes "preview just ended" signaling with real data from either identity (round-3 review). Per FR-020, a preview session has a fixed 2-hour maximum lifetime from `started_at`, chosen to comfortably cover a single verification session (SC-003's 30-second target) without needing a renewal flow. Role-based endpoint gating (e.g. Clients being denied report exports) always evaluates before assignment scoping — assignment scoping only narrows an endpoint the effective user's role can already reach, never substitutes for that check (round-3 review point 4; contracts/permission-hardening-api.md). **The full per-request ordering, which `/speckit-tasks` MUST preserve** (round-4 review): (1) `ResolvePreviewSession` resolves and validates any preview token, short-circuiting invalid ones before anything else runs; (2) `BlockWritesDuringPreview` rejects non-GET requests under an active preview; (3) every pre-existing role gate inside a controller (Client export denial, `client_visible` filtering, etc.) evaluates against the *effective* user — this is why each of the eight project-scoped controllers' existing private `user()` helper is repointed to `AccessContext::user()` rather than left resolving the real Sanctum user (research.md); (4) only after a role gate passes does project-assignment scoping (`BelongsToProject`/`scopeAccessibleTo`) apply. Getting (3) and (4) in the wrong order, or skipping (3)'s effective-user resolution for pre-existing checks, would mean previewing as a Client fails to reproduce the Client's own export denial — FR-006 requires the preview to be complete, not just cover the parts of access control this feature added.

**Scale/Scope**: 2 new migrations, 2 new models (`ProjectAssignment`, `PreviewSession`), 1 new service (`AccessContext`), 1 new trait (`BelongsToProject`, applied to 6 existing models), 2 new global middlewares (`ResolvePreviewSession`, `BlockWritesDuringPreview`), 1 exception-handler addition (non-enumeration 403 mapping), 6 modified controllers (adding the accessibility check to every method that currently has none), 1 new controller (`ProjectAssignmentController`), 1 new controller (`PreviewSessionController`), 1 modified model (`Project::scopeAccessibleTo`), 1 new frontend tab (Admin.jsx "Project Assignments"), 1 new frontend preview-mode affordance (start/end control + banner), 1 new shared `AccessDenied` component replacing 3 duplicated Guard-panel copies, new PHPUnit Feature tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Fail-Closed Access Control | Yes | Every new and modified check goes through `HasRole` predicates and the single `BelongsToProject`/`scopeAccessibleTo` primitive — never a raw `$user->role === '...'` comparison. An unrecognized role or a preview target that fails `hasValidRole()` denies via the same `whereRaw('1 = 0')` fallback `scopeAccessibleTo` already uses. **PASS**. |
| II. Consistent API Contracts | Yes | New `ProjectAssignmentResource`/preview-session response shapes only expose the fields listed in data-model.md — never a raw model. **PASS**. |
| III. Test Coverage Grows With the Feature | Yes | This is Principle III's own named example ("permission hardening work"). Every one of the six newly-guarded controllers gets an explicit allowed + denied test; preview mode's write-rejection and mid-session invalidation are exactly the kind of denied-path coverage this principle requires. **PASS**. |
| IV. Audit Sensitive Mutations | Yes | Assignment grant/revoke and preview start/end are the core scenario this principle names. All routed through `AuditLogger::record()`, extending its existing action-list docblock (which research.md notes is already slightly stale relative to actual usage — this feature's additions keep the docblock accurate for its own new actions, not a general docblock cleanup). **PASS**. |
| V. Small, Additive, Reversible Migrations | Yes | Two new tables, no existing column touched, no data migration/backfill for the schema itself. (The *rollout* backfill — seeding assignments so no existing user's access narrows on deploy day — is a data operation, not a schema change; see research.md and quickstart.md.) **PASS**. |
| VI. Real Auth Is the Only Forward Path | Yes | Reads/writes exclusively via Sanctum-authenticated `$request->user()` (or `AccessContext::user($request)` for scoping reads during preview) — preview mode explicitly does not touch or duplicate authentication, only read-scoping, and `ResolvePreviewSession` validates *before* a controller ever runs rather than authenticating as a second identity (research.md). No mock-role dependency anywhere. **PASS**. |

No unjustified violations. Complexity Tracking section is not needed — `AccessContext` and `BelongsToProject` are new, but each is a single small reusable primitive introduced specifically because the alternative (six independently-written per-controller checks) is the actual complexity risk the constitution's Principle I exists to prevent.

**Post-Phase 1 re-check**: Design artifacts (data-model.md, contracts/, quickstart.md) confirm the architecture above — one trait for nested-resource accessibility, one service for preview-aware effective-user resolution, one middleware for the global write-block, one exception-handler rule for non-enumeration. No new access-control concept was introduced outside these four; `scopeAccessibleTo` remains the single source of truth `ProjectController`/`ReportController` already depended on, now also depended on by the six previously-unguarded controllers instead of each inventing its own check. Gate re-evaluation: **PASS**, unchanged from pre-design.

## Project Structure

### Documentation (this feature)

```text
specs/007-permission-hardening/
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
│   ├── 2026_07_25_090000_create_project_assignments_table.php   # new
│   └── 2026_07_25_090500_create_preview_sessions_table.php      # new
├── app/Models/
│   ├── Project.php                    # modified — scopeAccessibleTo's
│   │                                   #   Team Member/Client branch now
│   │                                   #   checks project_assignments
│   │                                   #   instead of department match
│   ├── ProjectAssignment.php          # new
│   ├── PreviewSession.php             # new — invalidReason(): ?string,
│   │                                   #   checking ended_at/expires_at/
│   │                                   #   target.is_active/target.role vs
│   │                                   #   target_role_at_start, in order
│   ├── Module.php                     # modified — `use BelongsToProject`
│   ├── Activity.php                   # modified — `use BelongsToProject`
│   ├── SubActivity.php                # modified — `use BelongsToProject`
│   ├── DetailedActivity.php           # modified — `use BelongsToProject`
│   ├── Comment.php                    # modified — `use BelongsToProject`
│   └── Attachment.php                 # modified — `use BelongsToProject`
├── app/Models/Concerns/
│   └── BelongsToProject.php           # new — one trait, requires each
│                                       #   using model to implement
│                                       #   resolveProjectId(): int;
│                                       #   provides isAccessibleTo(User $user): bool
│                                       #   delegating to
│                                       #   Project::accessibleTo($user)
│                                       #   ->whereKey($this->resolveProjectId())
│                                       #   ->exists()
├── app/Support/
│   └── AccessContext.php              # new — static user(Request $request): User
│                                       #   reads $request->attributes->get(
│                                       #   'preview_target') ?? $request->user();
│                                       #   the ONE call site every
│                                       #   read-scoping check uses. No lookup
│                                       #   logic of its own — ResolvePreviewSession
│                                       #   below has already done validation
│                                       #   before a controller ever runs
├── app/Http/Middleware/
│   ├── ResolvePreviewSession.php      # new — runs first in the group,
│   │                                   #   before BlockWritesDuringPreview;
│   │                                   #   validates a presented
│   │                                   #   X-Preview-Session header, attaches
│   │                                   #   the resolved target to the request
│   │                                   #   if valid, or short-circuits with
│   │                                   #   409 + X-Preview-Ended header and
│   │                                   #   NO domain data if invalid —
│   │                                   #   auditing preview.ended at the
│   │                                   #   point of detection (FR-019;
│   │                                   #   round-3 review point 3)
│   └── BlockWritesDuringPreview.php   # new — applied alongside
│                                       #   auth:sanctum/EnsureUserIsActive/
│                                       #   ResolvePreviewSession in
│                                       #   routes/api.php's group array,
│                                       #   after ResolvePreviewSession;
│                                       #   rejects non-GET requests when
│                                       #   the request carries a resolved
│                                       #   preview target, except
│                                       #   POST /api/preview-sessions and
│                                       #   DELETE /api/preview-sessions/current
│                                       #   (round-3 review point 1), audits
│                                       #   the attempt (FR-007)
├── app/Exceptions/
│   └── Handler.php (or bootstrap/app.php withExceptions)  # modified — a
│                                       #   ModelNotFoundException for
│                                       #   Project/Module/Activity/
│                                       #   SubActivity/DetailedActivity/
│                                       #   Comment/Attachment renders as
│                                       #   403 (not Laravel's default 404)
│                                       #   ONLY when AccessContext::user()
│                                       #   is a Team Member or Client
│                                       #   (FR-005/FR-011); Admin/PM/Dept
│                                       #   Head keep default 404 behavior
│                                       #   (FR-004 — provably unchanged)
├── app/Http/Controllers/
│   ├── ProjectController.php          # modified — private user() helper
│   │                                   #   repointed to AccessContext::user()
│   │                                   #   (research.md — makes this and
│   │                                   #   every controller below
│   │                                   #   preview-aware for both the new
│   │                                   #   checks and pre-existing ones,
│   │                                   #   with no other line changed)
│   ├── ModuleController.php           # modified — every method gains
│   │                                   #   an accessibility check via the
│   │                                   #   trait (currently has none);
│   │                                   #   user() helper repointed
│   ├── ActivityController.php         # modified — same
│   ├── SubActivityController.php      # modified — same
│   ├── DetailedActivityController.php # modified — accessibility check
│   │                                   #   added; user() helper repointed
│   │                                   #   so the existing client_visible
│   │                                   #   check (unchanged logic) now also
│   │                                   #   resolves against the effective
│   │                                   #   user during preview
│   ├── CommentController.php          # modified — same
│   ├── AttachmentController.php       # modified — same
│   ├── ReportController.php           # modified — user() helper
│   │                                   #   repointed so the existing Client
│   │                                   #   export-denial check (unchanged
│   │                                   #   logic) is preview-aware too
│   ├── ProjectAssignmentController.php  # new — index/store/destroy,
│   │                                   #   Admin/PM-only, mirrors
│   │                                   #   DepartmentGrantController's
│   │                                   #   shape (composite-uniqueness
│   │                                   #   validation, audit every action)
│   └── PreviewSessionController.php   # new — store (start)/destroy
│                                       #   (end, current session)
├── app/Http/Resources/
│   ├── ProjectAssignmentResource.php  # new
│   └── PreviewSessionResource.php     # new — never exposes `token` in a
│                                       #   list/show response, only on the
│                                       #   store (start) response the
│                                       #   frontend needs to capture once
└── routes/api.php                     # modified — add
                                        #   GET/POST /api/project-assignments,
                                        #   DELETE /api/project-assignments/{id},
                                        #   POST /api/preview-sessions,
                                        #   DELETE /api/preview-sessions/current;
                                        #   add ResolvePreviewSession then
                                        #   BlockWritesDuringPreview (in that
                                        #   order) to the existing
                                        #   authenticated group

frontend/
├── src/
│   ├── lib/
│   │   ├── api.js                    # modified — request interceptor
│   │   │                             #   attaches `X-Preview-Session`
│   │   │                             #   header when a preview token is
│   │   │                             #   active; response interceptor
│   │   │                             #   reads an `X-Preview-Ended` response
│   │   │                             #   header to clear stale local
│   │   │                             #   preview state (FR-019); new
│   │   │                             #   fetchProjectAssignments/
│   │   │                             #   createProjectAssignment/
│   │   │                             #   deleteProjectAssignment/
│   │   │                             #   startPreview/endPreview calls
│   │   └── previewSession.js         # new — small sessionStorage-backed
│   │                                 #   helper (token, target user
│   │                                 #   summary) read by api.js and the
│   │                                 #   preview banner; sessionStorage
│   │                                 #   (not localStorage) so a closed
│   │                                 #   tab doesn't leave a lingering
│   │                                 #   client-side preview flag
│   ├── context/
│   │   └── PreviewContext.jsx        # new — start/end actions, active
│   │                                 #   target user, consumed by a small
│   │                                 #   always-visible banner when active
│   ├── components/
│   │   ├── AccessDenied.jsx          # new — the ONE access-denied panel;
│   │   │                             #   replaces the near-identical JSX
│   │   │                             #   currently duplicated 3x in
│   │   │                             #   App.jsx's KanbanGuard/
│   │   │                             #   SupportOpsGuard/AdminGuard, and is
│   │   │                             #   also what pages render inline when
│   │   │                             #   a project-scoped fetch returns 403
│   │   │                             #   mid-session (FR-010)
│   │   └── PreviewBanner.jsx         # new — persistent bar shown while
│   │                                 #   previewing, with an End Preview
│   │                                 #   control
│   ├── App.jsx                      # modified — KanbanGuard/
│   │                                 #   SupportOpsGuard/AdminGuard each
│   │                                 #   reduced to a role check + 
│   │                                 #   <AccessDenied />, duplicated JSX
│   │                                 #   removed
│   └── pages/
│       └── Admin.jsx                # modified — 5th tab, "Project
│                                     #   Assignments" (grid-cols-4 →
│                                     #   grid-cols-5), reusing the
│                                     #   Tabs/Table/Card pattern 006's
│                                     #   "User Accounts" tab already
│                                     #   established; preview-as control
│                                     #   lives on the existing "User
│                                     #   Accounts" tab (per-row "Preview"
│                                     #   action) rather than a new page

backend/tests/Feature/
└── ProjectScopingTest.php            # new — see Testing above
```

**Structure Decision**: The nested-resource fix is a **trait**, not a policy class or a duplicated per-controller check — `BelongsToProject` gives every one of the six models one `isAccessibleTo(User $user)` method backed by the exact same `Project::scopeAccessibleTo` the top-level `ProjectController`/`ReportController` already use, so there is exactly one place project-level access logic lives, matching `docs/prd_v2.md`'s own stated intent ("Existing `Project::accessibleTo(User)` should become the central access gate") without inventing a second, parallel mechanism (a Policy class per model) that would just be six more places to keep in sync. Preview mode is deliberately **not** a change to authentication — `ResolvePreviewSession` validates and resolves the target *before* any controller runs, and `AccessContext` is the one seam every read-scoping check reads that resolution from, keeping Sanctum's actual session subject (and therefore every audit log's `actor_*` fields) always the real Admin. Validating before the controller runs, rather than inside the eventual response, is also what guarantees an invalid/expired preview token never returns a response mixing "preview ended" signaling with real domain data from either identity (round-3 review point 3). The non-enumeration fix is an **exception-handler rule**, not per-controller `find()`-instead-of-route-binding rewrites — it's one small, centrally-testable rule instead of rewriting how all six controllers resolve their route parameters. No new frontend page for assignment/preview management — both extend the existing Admin Control Center tabbed structure, matching 006's precedent exactly.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
