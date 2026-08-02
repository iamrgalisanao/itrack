# Implementation Plan: Bug Tracker

**Branch**: `013-sprint-retrospectives` (continues on current branch, no dedicated branch — matches 014/015/016) | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-bug-tracker/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

A new standalone `Bug` entity, project-scoped, with a sequential per-project
Bug ID, a 4-value Status that drives which of 3 display groups it appears
in (Incoming / Development Work / Resolved), Priority, optional Owner
(distinct from Reporter), an optional free-text Sprint/Milestone label, an
optional due date with a live countdown, and the existing
`visibility`/`client_visible` convention for Client read access. SLA breach
notifications reuse the codebase's existing *lazy, request-triggered*
notification-generation pattern (`NotificationController::index()`'s
`generateOverdueNotifications()`/`generateDueSoonNotifications()`) rather
than introducing new scheduler infrastructure — this is a new sibling
method, `generateBugBreachNotifications()`, following the identical shape.
Authorization reuses the `BelongsToProject` trait + `AccessContext::user()`
+ `isClient()`-conditional visibility filter pattern already used by
`Attachment`/`Comment` (not Retrospectives' own internal-only pattern),
because — unlike Retrospectives — this feature has a real Client-reachable
path.

## Technical Context

**Language/Version**: PHP 8.3 (backend, Laravel 13.8 confirmed via `backend/composer.json`), JavaScript/JSX with React 19.2 (frontend, no TypeScript in this repo)

**Primary Dependencies**: Laravel 13.8, Eloquent/MySQL, existing `Notification`/`AuditLogger`/`AccessContext`/`BelongsToProject`/`Project::scopeAccessibleTo()` infrastructure; React 19, axios, existing shadcn/Radix UI components (`Tabs`, `Dialog`, `Select` etc. already in `frontend/src/components/ui/`)

**Storage**: New MySQL table `bugs`; no changes to any existing table

**Testing**: `php artisan test` (PHPUnit, matching `RetrospectivesTest.php`'s structure) for authorization, tenant-isolation, Bug ID sequencing, status-grouping, and breach-notification cases. No frontend test framework configured — manual/browser verification per project practice (per Constitution Development Workflow §4), same as 013–016.

**Target Platform**: Web (existing React SPA over Sanctum session API)

**Project Type**: Web application (existing `backend/` + `frontend/` structure)

**Performance Goals**: N/A beyond existing app norms — no new performance-sensitive path; breach-notification generation is a bounded scan over undue bugs, same cost profile as the existing overdue-task scan it mirrors.

**Constraints**: Must not touch Work Program's Module→Activity→SubActivity→Task hierarchy (FR scope). Must reuse the existing `client_visible` convention rather than invent a new visibility mechanism (Constitution Delivery Constraints). Bug ID must never be reused after deletion (FR-002) — requires a concurrency-safe sequence, not a naive `count()+1`.

**Scale/Scope**: One new model/table, one new controller, one new resource, one new frontend page, one new nav entry, one new route guard, plus additions to the existing `NotificationController`.

### Coding-Standard Constraints

- **laravel-best-practices `controller-api-resources`**: `BugController` returns `BugResource`/`BugResource::collection()`, never raw Eloquent JSON — matches every other controller in this codebase (`RetroSessionResource`, `AttachmentResource`, etc.).
- **laravel-best-practices `eloquent-eager-loading`**: the bug list endpoint MUST eager-load `reporter`, `owner` (both `belongsTo(User::class)`) to avoid N+1 — mirrors `RetrospectiveController`'s eager-loading patterns.
- **laravel-best-practices `sec-mass-assignment`**: `Bug::$fillable` explicitly lists writable columns only; `bug_number` (the generated sequence value), `project_id`, and `reporter_id`'s default-to-creator behavior are set server-side, never accepted directly from client-controlled mass-assignment on create.
- **php-best-practices `type-return-types` / `type-parameter-types`**: all new controller methods and the new private `generateBugBreachNotifications()` method on `NotificationController` (matching its siblings' shape) use typed parameters/returns, matching the rest of `RetrospectiveController.php`.
- **laravel-testing `db-assert-has` / `auth-acting-as`**: every new endpoint gets an authorization-denied test (Client attempting write, user without project access, internal role attempting an action Client should never reach) using `actingAs()` + `assertForbidden()`/`assertStatus(403)`, matching `RetrospectivesTest.php` and `AttachmentTest.php`'s existing structure.
- **laravel-owasp-security `sec-broken-access-control`**: every Bug endpoint MUST re-check project access via `BelongsToProject::isAccessibleTo()` on the specific bug instance, not just a role check — an IDOR test (a user without access to the bug's project, requesting it directly by ID) is a required test case (see data-model.md/contracts and quickstart.md).
- **code-slop `over-eng-premature-interface` / `over-eng-dependency-creep`**: no new service classes, no new generic "notification service" abstraction — `generateBugBreachNotifications()` is a private method on the existing `NotificationController`, exactly matching the shape of the two methods it sits beside. No new package/dependency is introduced.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Status |
|---|---|---|
| I. Fail-Closed Access Control | New endpoints — every one re-checks project access + role, denies by default (see Coding-Standard Constraints, OWASP row) | PASS |
| III. Test-Backed Changes | New PHPUnit tests planned for every new endpoint/behavior (auth, tenant isolation, sequencing, grouping, breach dedup) | PASS |
| VII. Installed Coding-Standard Skills Govern Implementation | Reviewed above, concrete constraints listed, not generic citation | PASS |
| VIII. Definition-of-Done Gate | Tests, authz review, tenant-isolation review, OWASP review, code-slop review all carried forward as explicit tasks in tasks.md | PASS |
| Delivery Constraints — client_visible reuse | Reuses the existing `Attachment`/`Comment` `visibility` convention exactly, per spec FR-010 | PASS |
| Delivery Constraints — stack fixed | No new framework/library; reuses existing Laravel/React/Sanctum stack and existing UI components | PASS |

No violations. Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/017-bug-tracker/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   └── bug-tracker-api.md
├── quickstart.md         # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── Models/
│   │   └── Bug.php                          # new — uses BelongsToProject, HasFactory
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── BugController.php            # new — index/store/show/update/destroy
│   │   │   └── NotificationController.php   # modified — add generateBugBreachNotifications()
│   │   └── Resources/
│   │       └── BugResource.php              # new
├── database/
│   └── migrations/
│       └── 2026_08_06_090000_create_bugs_table.php   # new
└── tests/
    └── Feature/
        └── BugTrackerTest.php                # new

frontend/
├── src/
│   ├── App.jsx                # modified — nav entry + route + BugTrackerGuard (internal+client, unlike Retrospectives' internal-only guard)
│   ├── lib/
│   │   └── api.js              # modified — fetchBugs/createBug/updateBug/deleteBug
│   └── pages/
│       └── BugTracker.jsx      # new
```

**Structure Decision**: Existing web application structure (`backend/` +
`frontend/`) is unchanged. Bug Tracker follows the exact same shape as
013-sprint-retrospectives (one model, one controller, one resource, one
page, one nav entry) with the one structural difference that its access
guard must admit Client-role users (read-only, visibility-filtered) rather
than deny them outright — matching `Attachment`/`Comment`'s guard shape
instead of Retrospectives'.

## Complexity Tracking

*No violations — section not applicable.*
