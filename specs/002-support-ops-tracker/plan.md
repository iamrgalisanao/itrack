# Implementation Plan: Support Ops Tracker (Phase 1)

**Branch**: `002-support-ops-tracker` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-support-ops-tracker/spec.md`

## Summary

Add a support-focused operational layer on top of the existing task system:
10 new nullable columns on `detailed_activities`, a new `SupportOpsController`
(list + quick-intake, including auto-provisioning a per-project "Support
Requests" Module→Activity→SubActivity chain so intake doesn't force users
through the full hierarchy), and a new `/support-ops` frontend page with a
6-column board, stale-update highlighting, and a detail modal. Editing an
*existing* issue's support fields reuses the existing
`PUT /detailed-activities/{id}` endpoint (extended to accept the new fields)
rather than forking a second update code path — it's still the same
underlying task record, with the same audit-logging and notification logic
already in place. No new frontend or backend dependencies; reuses the
audit-logging and role-check conventions already established in
`DetailedActivityController`, and introduces a proper API Resource for the
one genuinely new endpoint.

## Technical Context

**Language/Version**: PHP 8.4 (Laravel 13, unchanged) / JavaScript (ES2022+),
React 19 (unchanged) — same stack as `001-real-auth-cutover`

**Primary Dependencies**: None new. Reuses existing Eloquent models
(`Project`, `Module`, `Activity`, `SubActivity`, `DetailedActivity`), the
existing `AuditLogger` service, existing shadcn/ui components already in
`frontend/src/components/ui/` (Card, Badge, Dialog, Select, Input, Tabs),
React Router, and the shared Axios instance in `frontend/src/lib/api.js`

**Storage**: MySQL. One additive migration on `detailed_activities` (10
nullable columns, matching the pattern of
`2026_06_25_014400_add_client_visible_to_detailed_activities_table.php`). No
new tables — the "Support Requests" container reuses the existing
Module/Activity/SubActivity tables via a `code = 'SUPPORT-OPS'`
find-or-create per project, not a new schema concept.

**Testing**: PHPUnit Feature tests for the new `SupportOpsController`
(index/store, role-gating for create vs. view, fail-closed for invalid
role) — this feature *does* add backend code, so per Constitution
Principle III these are required, not optional like they were for the
backend-unchanged `001-real-auth-cutover`. Frontend: manual verification via
quickstart.md (no test runner in this repo, unchanged from 001).

**Target Platform**: Same dev/prod web app as 001 — Laravel API at
`localhost:8000`, Vite dev server at `localhost:5173`.

**Project Type**: Web application (backend/ + frontend/, existing structure)

**Performance Goals**: N/A — same low-traffic internal-tool scale as every
other existing view; no new performance-sensitive path.

**Constraints**: Must not change `KanbanGuard`/Kanban Board, Work Program,
Schedule, or Reports behavior for any task regardless of `work_type` (FR-010);
`/support-ops` viewing is internal-only, fail-closed (FR-011); issue
create/update is further restricted to the existing `canWrite()` role set
(FR-001, FR-008) — Department Head can view but not write, corrected during
this planning pass to match `DetailedActivityController`'s actual role model
(the spec originally said Department Head could create issues; that
contradicted `canWrite()` and has been fixed in `spec.md`).

**Scale/Scope**: 1 migration, 1 model update (`DetailedActivity` fillable +
casts), 1 new controller (`SupportOpsController`, 2 endpoints: index + store),
1 new API Resource, 1 modified controller method
(`DetailedActivityController::update()` — new fields + widened Team Member
allow-list), 1 new route group, 1 new frontend page (`SupportOps.jsx`), 1 nav
entry, a handful of new `lib/api.js` client functions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Fail-Closed Access Control | Yes | `SupportOpsController` MUST use an inclusion-based check for both view access (`isAdmin() \|\| isProjectManager() \|\| isTeamMember() \|\| isDepartmentHead()`) and write access (`canWrite()`) — never a deny-list. This repeats the exact shape of the C1 mistake `/speckit-analyze` caught in `001-real-auth-cutover`'s `KanbanGuard`; this plan explicitly avoids reintroducing it on the backend side. **PASS**, with an explicit design constraint carried into tasks.md. |
| II. Consistent API Contracts | Yes, with a correction | `DetailedActivityController` (existing, predates the constitution) actually returns raw Eloquent models/arrays directly (`return $task;`, `return $detailedActivity;`, `return $query->get();`) — a pre-existing violation of this principle that this feature does not need to fix. However, `SupportOpsController` is *new* code written under this constitution, so it MUST NOT copy that shape: it returns through a proper API Resource (`SupportIssueResource`), even though the controller it's most similar to doesn't. **PASS**, with the resource class added as an explicit task. |
| III. Test Coverage Grows With the Feature | Yes | Unlike 001, this feature *adds* backend code — Feature tests for `SupportOpsController` are mandatory, covering: successful intake (auto-provision + create), view access for all 5 roles (4 internal roles pass, Client denied), write access restricted to `canWrite()` roles (Department Head denied on create/update even though they can view), and the stale-flagging data shape. **PASS**, tasks.md must include these as real tasks, not optional. |
| IV. Audit Sensitive Mutations | Yes | `DetailedActivityController` already calls `AuditLogger::record()`/`::denied()` on every create/update/delete — broader than just role/permission changes. `SupportOpsController`'s intake action MUST follow the same convention (`task.created` equivalent, e.g. `support_issue.created`) for consistency with the established pattern in this codebase. **PASS**, carried into tasks.md. |
| V. Small, Additive, Reversible Migrations | Yes | Single migration, 10 nullable columns, one concern (support metadata), matching the exact precedent of `add_client_visible_to_detailed_activities_table`. **PASS**. |
| VI. Real Auth Is the Only Forward Path | Yes | This feature has no identity system of its own — it entirely depends on `001-real-auth-cutover` already being merged, and reads `request->user()->role` the same way `DetailedActivityController` does today. **PASS**. |

No violations. Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: Design artifacts (data-model.md, contracts/,
quickstart.md) confirm the architecture above — no new entities beyond the
existing task hierarchy, no new role/permission concepts, and the two
backend touch points (new `SupportOpsController` + extended
`DetailedActivityController::update()`) both fold into already-audited,
already-role-checked code paths rather than introducing parallel ones. Gate
re-evaluation: **PASS**, unchanged from pre-design.

**Correction made during this planning pass**: `spec.md` FR-001 originally
listed Department Head among the roles that can *create* a support issue.
Reading `DetailedActivityController::store()`/`::update()` showed task-write
access is gated by `canWrite()` (Admin, Project Manager, Team Member only —
Department Head is explicitly excluded, same as Client). `spec.md` FR-001,
FR-008, and FR-011 were corrected to separate "can view the board"
(4 internal roles, matching `KanbanGuard`) from "can create/edit an issue"
(`canWrite()` roles only), before writing this plan.

**Also surfaced here**: `DetailedActivityController::update()` currently
strips every field except `['status', 'progress', 'notes', 'output',
'actual_start_date', 'actual_end_date']` when the requester is a Team
Member. Since editing an existing support issue reuses this same endpoint
(see Summary), that allow-list MUST be extended to include the 10 new
support fields — otherwise Team Members, the people most likely to actually
work support tickets day to day, would be silently blocked from updating
`next_action`, `evidence`, `root_cause`, `resolution`, `client_priority`,
`last_client_update_at`, `client_name`, `tenant_name`, `channel`, and
`work_type`.

## Project Structure

### Documentation (this feature)

```text
specs/002-support-ops-tracker/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
# Option 2: Web application (frontend/ + backend/, matches existing repo layout)

backend/
├── database/migrations/
│   └── <timestamp>_add_support_fields_to_detailed_activities_table.php   # new
├── app/Models/
│   ├── DetailedActivity.php    # modified — add 10 fields to $fillable + casts
│   ├── Module.php              # unchanged — reused for the auto-provisioned chain
│   ├── Activity.php            # unchanged — reused
│   └── SubActivity.php         # unchanged — reused
├── app/Http/Controllers/
│   ├── SupportOpsController.php       # new — index (list) + store (quick intake)
│   └── DetailedActivityController.php # modified — accept new fields in
│                                       #   update() validation; widen the
│                                       #   Team Member allow-list to include them
├── app/Http/Resources/
│   └── SupportIssueResource.php   # new — Constitution Principle II compliance
│                                  #   for this new controller (existing
│                                  #   DetailedActivityController predates the
│                                  #   constitution and is not being retrofitted)
└── routes/api.php              # modified — add GET/POST /api/support-ops

frontend/
├── src/
│   ├── pages/SupportOps.jsx    # new — board, intake form, filters; detail
│   │                           #   modal is the shared component below
│   ├── components/
│   │   └── TaskDetailModal.jsx # new — extracted from Kanban.jsx's inline
│   │                           #   task detail modal (Details/Comments/Files
│   │                           #   tabs), generalized with an optional slot
│   │                           #   for support-specific fields so both
│   │                           #   Kanban and Support Ops share one
│   │                           #   implementation instead of duplicating the
│   │                           #   Comments/Files integration and form chrome
│   ├── pages/Kanban.jsx        # modified — inline modal JSX replaced with
│   │                           #   <TaskDetailModal>, no behavior change
│   ├── lib/api.js              # modified — add fetchSupportIssues/createSupportIssue
│   │                           #   client functions
│   └── App.jsx                 # modified — add /support-ops route + nav item
└── tests/                      # none exist yet; no test infra added by this feature
```

**Structure Decision**: One new backend controller + one migration, one new
frontend page. Work Program, Schedule, and Reports remain read-only
referenced (FR-010) — zero lines changed in any of them. **Kanban.jsx is
touched** (a deliberate, user-approved exception to the original "zero lines
changed" plan): its task detail modal is extracted into a shared
`TaskDetailModal` component reused by Support Ops, rather than duplicating
the Comments/Files integration and modal chrome. Kanban's own behavior and
fields (including its `type`-based internal priority, distinct from Support
Ops' `client_priority`) are unchanged after the extraction — this is a
refactor, not a feature change to Kanban.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
