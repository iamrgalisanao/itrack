# Implementation Plan: Taskboard

**Branch**: `013-sprint-retrospectives` (continues on current branch, no dedicated branch — matches 014/015/016/017) | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-taskboard/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Taskboard reuses `Module` as "Epic" and `DetailedActivity` as "Task" — no new top-level
entities, no schema break to the existing required `Module → Activity → SubActivity →
DetailedActivity` chain. Four new nullable columns on `detailed_activities`
(`priority`, `estimated_story_points`, `sprint_label`, `assignee_user_id`) back a new
third view-mode inside Work Program (`?view=taskboard`) showing a flat, project-wide
task list grouped client-side by `sprint_label`. Task creation from this view only
requires picking an Epic; a reserved, application-owned `Taskboard`/`Unclassified Tasks`
Activity/SubActivity pair is transparently reused-or-created per Module (locked,
idempotent under concurrency) so the existing hierarchy stays intact. All
Taskboard-field writes are Admin/PM-only, enforced by stripping unauthorized fields from
the request *before* validation (not just hiding them from responses); the assignee is
validated against real project access, not just role; Client gets zero access to the
view itself (not just its writes), since Client's existing per-field visibility rules
already hide `sprint_label`, which would otherwise misrepresent every task as
unscheduled. Assignment notifications reuse the existing per-user notification
infrastructure, keyed off a persisted audit-log-row id (not a permanent task+recipient
pair, not a timestamp) so reassigning back to a prior assignee correctly notifies them
again. A pre-existing Kanban UI defect (a "Priority" field actually bound to the `type`
column) is corrected as part of this feature since it would otherwise collide with the
new, real Priority field added to the same task editor.

## Technical Context

**Language/Version**: PHP 8.3 (backend, Laravel 13.8 confirmed via `backend/composer.json`), JavaScript/JSX with React 19.2 (frontend, no TypeScript in this repo)

**Primary Dependencies**: Laravel 13.8, Eloquent/MySQL, existing `AccessContext`/`AuditLogger`/`Notification`/`Project::scopeAccessibleTo()` infrastructure; React 19, axios, existing shadcn/Radix UI components (`Table`, `Collapsible`, `Dialog`, `Select` already in `frontend/src/components/ui/`)

**Storage**: One additive migration on the existing `detailed_activities` table; no new tables

**Testing**: `php artisan test` (PHPUnit, matching `BugTrackerTest.php`'s structure) for authorization, tenant-isolation, default-container idempotency, field validation, and notification-dedup cases. No frontend test framework configured — manual/browser verification per project practice (Constitution Development Workflow §4), same as 013–017.

**Target Platform**: Web (existing React SPA over Sanctum session API)

**Project Type**: Web application (existing `backend/` + `frontend/` structure)

**Performance Goals**: N/A beyond existing app norms — no new performance-sensitive path; the Taskboard list query is a single `whereHas` scan over one project's `DetailedActivity` rows, same shape as `BugController::index`.

**Constraints**: Must not change `DetailedActivity.sub_activity_id`'s NOT NULL constraint or otherwise break Work Program's existing List/Gantt views, dashboard progress roll-up (`avg('progress')`), or Client per-field visibility rules. Must reuse `Bug`'s exact `priority` value vocabulary (Critical/High/Medium/Low) for app-wide consistency rather than inventing a second one.

**Scale/Scope**: Four new nullable columns, one new controller (`TaskboardController`), two extended controllers (`DetailedActivityController`, `ActivityController`, `SubActivityController` — reserved-container delete guards), one extended resource, one extended service (`AuditLogger::record()` now returns the created row), one new frontend component (`TaskboardView.jsx`), extensions to `TaskDetailModal.jsx`, `WorkProgram.jsx`, and `api.js`.

### Coding-Standard Constraints

- **laravel-best-practices `controller-api-resources`**: `TaskboardController` returns `DetailedActivityResource`/`DetailedActivityResource::collection()`, never raw Eloquent JSON — matches every other controller in this codebase.
- **laravel-best-practices `eloquent-eager-loading`**: `TaskboardController::index` MUST eager-load `subActivity.activity.module` and `assignee` to avoid N+1 across the flat project-wide task list — mirrors `BugController::index`'s eager-loading of `reporter`/`owner`.
- **laravel-best-practices `sec-mass-assignment`**: `DetailedActivity::$fillable` gains the four new fields, but `TaskboardController::store()` never mass-assigns `module_id` directly onto the model (it's not a `DetailedActivity` column at all — it's consumed to resolve the reserved SubActivity, then discarded from the create payload).
- **php-best-practices `type-return-types` / `type-parameter-types`**: `TaskboardController`'s methods and the new `resolveDefaultSubActivity()` helper use typed parameters/returns, matching `BugController.php`'s style.
- **laravel-testing `db-assert-has` / `auth-acting-as`**: every new/changed endpoint gets an authorization-denied test (Client, Team Member, cross-project user) using `actingAs()` + `assertStatus(403)`/`assertStatus(422)`, matching `BugTrackerTest.php`'s structure.
- **laravel-owasp-security `sec-broken-access-control`**: `assignee_user_id` is validated against actual project access (not just role), and the reserved-container delete guard prevents a data-integrity bypass — both are explicit IDOR-adjacent test cases (see quickstart.md and data-model.md).
- **code-slop `over-eng-premature-interface` / `over-eng-dependency-creep`**: no new service class for the assignment-notification logic (lives inline in `TaskboardController`/`DetailedActivityController`, matching `BugController`'s shape); `resolveDefaultSubActivity()` deliberately does not open its own nested transaction (avoids unnecessary savepoint complexity — see research.md D2); no new "list users" endpoint is added for the assignee picker (reuses the existing `GET /project-assignments`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Status |
|---|---|---|
| I. Fail-Closed Access Control | New/changed endpoints re-check project access + role on every request; Taskboard-field stripping happens before validation, not as an afterthought | PASS |
| III. Test-Backed Changes | New PHPUnit tests planned for every new behavior (auth ordering, tenant isolation, assignee project-access, container idempotency/deletion guard, field normalization, notification dedup) | PASS |
| VII. Installed Coding-Standard Skills Govern Implementation | Reviewed above, concrete constraints listed, not generic citation | PASS |
| VIII. Definition-of-Done Gate | Tests, authz review, tenant-isolation review, OWASP review, code-slop review all carried forward as explicit tasks in tasks.md | PASS |
| Delivery Constraints — client_visible reuse | `DetailedActivityResource`'s existing Client branch is extended by omission (new fields simply never added to that branch), matching the established pattern rather than inventing a new visibility mechanism | PASS |
| Delivery Constraints — stack fixed | No new framework/library; reuses existing Laravel/React/Sanctum stack and existing UI components | PASS |

No violations. Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/018-taskboard/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   └── taskboard-api.md
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── Models/
│   │   └── DetailedActivity.php              # extended — new fillable/casts/assignee()/PRIORITY_* constants
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── TaskboardController.php       # new — index/store, resolveDefaultSubActivity() helper
│   │   │   ├── DetailedActivityController.php # extended — update() validation + pre-validation field strip
│   │   │   ├── ActivityController.php        # extended — reserved-name delete guard
│   │   │   └── SubActivityController.php     # extended — reserved-name delete guard
│   │   └── Resources/
│   │       └── DetailedActivityResource.php  # extended — new fields, non-Client branch only
│   └── Services/
│       └── AuditLogger.php                    # extended — record() returns the created AuditLog
├── database/
│   └── migrations/
│       └── 2026_08_0X_add_taskboard_fields_to_detailed_activities_table.php   # new
└── tests/
    └── Feature/
        └── TaskboardTest.php                  # new

frontend/
├── src/
│   ├── pages/
│   │   └── WorkProgram.jsx           # modified — 3-way view toggle, Client-hidden third pill
│   ├── components/
│   │   ├── TaskboardView.jsx         # new — grouped table, create dialog, role-gated fields
│   │   └── TaskDetailModal.jsx       # modified — Priority relabel to Type, new additive Taskboard fields
│   └── lib/
│       └── api.js                    # modified — fetchTaskboardTasks/createTaskboardTask
```

**Structure Decision**: Existing web application structure (`backend/` + `frontend/`) is
unchanged. Taskboard extends Work Program's existing model/resource/controller rather
than introducing a parallel one, and adds exactly one new controller and one new
frontend component for the genuinely new surface (project-wide flat task listing and
Epic-only creation) that doesn't fit `DetailedActivityController`'s existing
single-SubActivity shape.

## Complexity Tracking

*No violations — section not applicable.*
