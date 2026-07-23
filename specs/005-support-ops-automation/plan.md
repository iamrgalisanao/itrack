# Implementation Plan: Support Ops Automation (Support Ops Phase 4)

**Branch**: `005-support-ops-automation` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-support-ops-automation/spec.md`

## Summary

Add three new, individually-targeted notification entry types — an overdue
client-update entry, a daily open-issue summary, and a weekly review report
— to this app's existing notification mechanism (the bell dropdown), all
generated lazily (on-access, not scheduled) the next time the relevant
user's own notifications are loaded. This is the first feature to populate
`notifications.recipient_user_id` (present in the schema today, unused);
every other notification type keeps its existing role-wide retrieval
unchanged. Zero new migration, zero new scheduler/queue infrastructure,
zero new frontend page — all three entry types render through the existing
`NotificationBell` component. Daily summaries reuse `SupportOpsTodayClassifier`
(004) directly for their per-section counts; weekly reports reuse this
app's existing `task.status_changed` audit trail for "resolved this week,"
introducing no new tracking.

## Technical Context

**Language/Version**: PHP 8.4 (Laravel 13, unchanged) / JavaScript (ES2022+),
React 19 (unchanged) — same stack as 001-004.

**Primary Dependencies**: None new. Reuses `App\Models\Notification` (the
existing `recipient_user_id` column, currently unused), `NotificationController`
and `NotificationBell.jsx` (existing UI/API surface — no new page), `App\Models\AuditLog`
(existing `task.status_changed` entries, written by `DetailedActivityController::update()`
independent of this feature), `App\Services\SupportOpsStaleness` and
`App\Services\SupportOpsTodayClassifier` (004, reused as-is for daily-summary
section counts and for "still stale" weekly counts), `Project::scopeAccessibleTo`
(001-004's established cross-project scoping mechanism), and Carbon's ISO
week support (`isoWeek`/`isoWeekYear`/`startOfWeek(Carbon::MONDAY)`) for
FR-010's week-boundary requirement.

**Storage**: MySQL. **Zero schema change** — `recipient_user_id` already
exists on `notifications`, nullable, currently unused by every existing
notification type. This feature is the first to populate it. No migration.

**Testing**: PHPUnit Feature tests covering: (1) the three new entry types'
generation and content correctness (overdue eligibility per FR-001, daily
section counts matching `SupportOpsTodayClassifier`, weekly opened/resolved/
stale counts per FR-011); (2) for **each** of the three modified endpoints
(`GET /api/notifications`, `PUT /api/notifications/{id}/read`, `POST
/api/notifications/read-all`) and **each** of the three new entry types,
the exact three-case retrieval matrix SC-005 requires:
  - a row with `recipient_user_id` = the requesting user's own id → visible/actionable
  - a row with `recipient_user_id` = a *different* user's id who shares the requester's role → NOT visible/actionable (403 for the two write endpoints, absent from the list for the read endpoint)
  - a row with `recipient_user_id` = null and `user_role` matching the requester's role → visible/actionable (proves legacy role-wide behavior is preserved, not just that new rows are safe)
(3) dedup — loading notifications twice in the same day/week/crossing never
produces a second entry; (4) the overdue-entry urgency correction — a
`support_overdue` row for an issue that's since been updated/resolved is
still returned (never omitted or deleted) with `severity` downgraded to
`info` and `metadata.is_currently_urgent: false`; (5) legacy notification
types (assignment, mention, task-overdue, task-due-soon) remain unaffected
— still retrieved by role, still visible to every user sharing that role,
proving this feature didn't regress the existing behavior it deliberately
leaves alone. Frontend: manual verification via quickstart.md (no test
runner in this repo, unchanged from 001-004).

**Target Platform**: Same dev/prod web app as prior features — Laravel API
at `localhost:8000`, Vite dev server at `localhost:5173`.

**Project Type**: Web application (backend/ + frontend/, existing structure)

**Performance Goals**: Generation for the three new entry types runs only
for the **current requesting user**, not eagerly for every internal user on
every request — a deliberate improvement over this app's existing
`generateOverdueNotifications()`/`generateDueSoonNotifications()`, which
already scan every task system-wide on every single `/api/notifications`
call regardless of who's asking (an existing, accepted pattern this feature
does not need to fix, but also should not imitate for its own, more
per-user-expensive content). Each of the three new checks is bounded to
issues/audit entries within the current user's own accessible projects, and
each is a no-op once that day/week/crossing's entry already exists (dedup).

**Constraints**: Per FR-006, the three new entry types MUST always carry a
populated `recipient_user_id` and MUST NOT be retrievable via a role-only
query — the retrieval query in `index()`, and the ownership checks in
`markAsRead()`/`markAllAsRead()` (currently `$notification->user_role !==
$user->role`, which would let any same-role user mark another user's
individually-scoped notification as read), all need the same correction:
`recipient_user_id = current_user.id` OR (`recipient_user_id IS NULL` AND
`user_role = current_user.role`). Every existing, pre-this-feature
notification type continues to have a null `recipient_user_id` and keeps
being retrieved by role alone — this feature adds a second, narrower
retrieval path alongside the existing one, it does not replace it. Per
FR-008, no scheduled job/queue infrastructure is introduced. Per FR-010, all
day/week boundaries use one single application-wide timezone and the ISO
(Monday-start) week convention — no per-user timezone concept is
introduced.

**Scale/Scope**: 1 modified controller (`NotificationController` — 3 new
private generation methods + corrected retrieval/ownership queries in 3
existing actions), 1 new backend service (`SupportOpsWeeklyReportBuilder`,
for the one genuinely new computation — daily summaries reuse 004's
classifier directly, no new service needed for that part), 1 new PHPUnit
Unit test file, 1 new/extended PHPUnit Feature test file, 0 new frontend
pages (existing `NotificationBell.jsx` renders the new content unchanged),
0 new migrations, 0 new routes (existing `/api/notifications*` routes are
reused as-is).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Fail-Closed Access Control | Yes | Recipient eligibility (FR-001) and per-user project scoping (FR-004/005) both reuse the identical role predicates (`isAdmin()`, `isProjectManager()`, etc.) and `Project::accessibleTo($user)` already established — no new, ad-hoc access-control concept. Failure mode is fail-closed by construction: a user is only ever a recipient of their own generated content, never anyone else's. **PASS**, carried into tasks.md with the explicit leakage-matrix tests from Testing above. |
| II. Consistent API Contracts | Partially applies | `NotificationController`'s existing endpoints predate this constitution and return raw `Notification` Eloquent models directly (the same pre-constitution pattern `SupportIssueResource`'s own docblock calls out for `DetailedActivityController`). This feature touches the same query path to add recipient-based filtering, which is a reasonable moment to introduce a `NotificationResource` for the response shape going forward, without a wholesale refactor of the endpoint's unrelated existing fields. **PASS after this addition**, carried into tasks.md. |
| III. Test Coverage Grows With the Feature | Yes | New generation logic and the corrected retrieval/ownership queries both ship with Feature tests in the same change, including the mandatory leakage matrix. **PASS**, required in tasks.md. |
| IV. Audit Sensitive Mutations | No | Generating a notification is not a sensitive mutation in the sense this principle targets (role changes, grants, deletions) — the existing overdue/due-soon/assignment/mention generators are not audit-logged either, and this feature's three new types follow the same, already-established precedent. **N/A**, consistent with existing notification-generation code. |
| V. Small, Additive, Reversible Migrations | Yes (trivially) | **No migration at all** — `recipient_user_id` already exists, unused. **PASS**. |
| VI. Real Auth Is the Only Forward Path | Yes | Reads `$request->user()->role`/`->id` via Sanctum session, identically to every other endpoint in this app. **PASS**. |

No unjustified violations. Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: Design artifacts (data-model.md, contracts/,
quickstart.md) confirm the architecture above — no new entities beyond one
new service, no new columns, and the corrected retrieval query is the only
change to existing endpoint behavior (and it is additive: legacy role-wide
notifications keep working exactly as before). Gate re-evaluation: **PASS**,
unchanged from pre-design.

## Project Structure

### Documentation (this feature)

```text
specs/005-support-ops-automation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
# Option 2: Web application (frontend/ + backend/, matches existing repo layout)

backend/
├── app/Http/Controllers/
│   └── NotificationController.php   # modified — 3 new private generation
│                                     #   methods (support-overdue, daily
│                                     #   summary, weekly report), all
│                                     #   scoped to the requesting user;
│                                     #   corrected retrieval/ownership
│                                     #   queries in index()/markAsRead()/
│                                     #   markAllAsRead()
├── app/Http/Resources/
│   └── NotificationResource.php     # new — replaces the raw-model return,
│                                     #   Constitution Principle II
├── app/Services/
│   └── SupportOpsWeeklyReportBuilder.php  # new — opened/resolved/stale
│                                            #   counts for a week, scoped
│                                            #   to a user's accessible
│                                            #   projects; reuses
│                                            #   SupportOpsStaleness (004)
│                                            #   for the "stale" count and
│                                            #   the existing task.status_changed
│                                            #   audit trail for "resolved"
└── (no new routes — reuses existing GET/PUT/POST /api/notifications*)

frontend/
└── (no changes — NotificationBell.jsx already renders whatever
    notifications/index returns; new entry types need no new UI beyond
    whatever title/message/severity content this feature's backend supplies)

backend/tests/Unit/
└── SupportOpsWeeklyReportBuilderTest.php  # new — opened/resolved/stale
                                            #   counting logic in isolation

backend/tests/Feature/
└── NotificationSupportOpsAutomationTest.php  # new — generation correctness,
                                               #   dedup, and the mandatory
                                               #   same-role/different-access
                                               #   leakage matrix for all
                                               #   three entry types, plus a
                                               #   regression check that
                                               #   legacy notification types
                                               #   are unaffected
```

**Structure Decision**: All three new entry types are generated from
`NotificationController` (the existing home for `generateOverdueNotifications()`/
`generateDueSoonNotifications()` — same rationale as 003/004's pattern of
extending an existing controller rather than creating a new one for a
closely-related concern), with the one genuinely new, non-trivial
computation (weekly opened/resolved/stale counting) extracted into its own
service for the same reason 004 extracted `SupportOpsStaleness`/
`SupportOpsTodayClassifier` — daily-summary counting needs no new service
since it's a direct reuse of 004's existing classifier. No new frontend
page or component — the existing `NotificationBell.jsx` is the single
delivery surface (per spec.md's Assumptions), and no new routes are needed
since `GET /api/notifications` already returns everything a user needs to
see, once its query is corrected.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
