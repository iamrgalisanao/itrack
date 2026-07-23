# Phase 0 Research: Support Ops Automation (Support Ops Phase 4)

No `NEEDS CLARIFICATION` markers exist in the Technical Context — every
decision below came from reading existing code (`NotificationController`,
`Notification` model/migration, `AuditLogger`/`AuditLog`,
`DetailedActivityController::update()`, `SupportOpsStaleness`/
`SupportOpsTodayClassifier` from 004, `Project::scopeAccessibleTo`) during
the spec's own architecture review, not new research after the fact.

## Decision: Populate the existing `recipient_user_id` column; correct the retrieval/ownership queries to check it

**Rationale**: `notifications.recipient_user_id` already exists (nullable,
migration comment: "future-ready"), but every existing notification type
(`assignment`, `mention`, `overdue`, `blocked`, `due_soon`) only ever sets
`user_role` and leaves it null — `NotificationController::index()`,
`markAsRead()`, and `markAllAsRead()` all query `where('user_role',
$user->role)` alone. That's safe today only because those types are
genuinely role-wide announcements. This feature's three entry types are
personal (a specific user's own accessible-project scope), so the retrieval
and ownership-check queries both need `recipient_user_id = current_user.id
OR (recipient_user_id IS NULL AND user_role = current_user.role)` — the
first clause serves this feature's new, individually-targeted rows; the
second preserves every existing role-wide type's behavior unchanged.

**Alternatives considered**: Adding a second table for personal
notifications — rejected, this is exactly the "second, parallel
notification system" the spec's Assumptions explicitly rule out, and the
column needed already exists unused. Filtering client-side after fetching
all role-matching rows — rejected, that would require ever transmitting
another user's personal content to the browser in the API response just to
hide it in the UI, which is a worse privacy posture than filtering
server-side.

## Decision: Generate all three entry types scoped only to the current requesting user, not eagerly for every internal user on every request

**Rationale**: The existing `generateOverdueNotifications()`/
`generateDueSoonNotifications()` scan every task system-wide and generate
role-wide entries on *every single* `/api/notifications` call, regardless
of who's asking — acceptable for that pattern since the work is a flat
table scan with cheap role-string targeting. This feature's content is
inherently per-user (each user's own accessible-project scope), so eagerly
generating it for every internal user on every request would mean running
`SupportOpsTodayClassifier`'s full pipeline once per user per request — a
multiplying cost with no benefit, since only the current requester's
content is about to be read anyway. Scoping generation to "check/generate
only this requester's own missing entries" is strictly cheaper and exactly
matches FR-008's "generated the next time **the user's** notifications are
loaded" (singular, not "loaded by anyone").

**Alternatives considered**: Eagerly generating for all internal users on
every request, matching the existing overdue/due-soon shape exactly —
rejected per the cost analysis above; nothing in the spec requires this,
and FR-008's own wording supports the cheaper, per-requester-only reading.

## Decision: Overdue-entry recipient eligibility mirrors the existing task-overdue notification's targeting, corrected with a project-access filter

**Rationale**: `generateOverdueNotifications()` already establishes this
app's precedent for "who gets an overdue-thing notification": always
Project Manager, plus whatever role `Notification::resolveRoleFromResponsible()`
resolves from the task's `responsible` field (free-text role codes, not a
real per-user assignee — confirmed by reading that method). FR-001 reuses
this exact targeting logic (Admin included too, since Admin already has
blanket access everywhere else in this app) and adds the one correction
this feature specifically requires: each candidate role is expanded to the
*individual users* holding it, filtered to only those who can actually
access the issue's project (`Project::accessibleTo`) — since `responsible`
never named a real person to begin with, there was never a "single true
owner" to resolve; every eligible individual is a legitimate recipient.

**Alternatives considered**: Inventing a new "assignee" concept on
`DetailedActivity` — rejected, out of scope (spec.md's Assumptions:
"no new schema for Support Issue itself") and would only serve this one
feature. Notifying only the first matching user — rejected, arbitrary and
not supported by any existing single-owner concept in this data model.

## Decision: Daily summary counts reuse `SupportOpsTodayClassifier` (004) directly; no new classification logic

**Rationale**: FR-004's four section counts (Stale, P1 — Watch Closely,
Waiting for Client, Learning Priorities) are *exactly* what 004's
`SupportOpsTodayClassifier`/`SupportOpsStaleness` already compute, scoped
to a user's accessible projects — the daily summary is that same
classification, run for a given user, with the four bucket sizes counted
instead of returned as full item lists. Reusing it directly avoids a third
implementation of the same precedence rules 004 already built and
unit-tested; it does not need its own new service.

**Alternatives considered**: A separate, summary-specific classification
pass — rejected, would immediately reintroduce the exact "two independent
implementations of the same algorithm" risk 004's own architecture review
already flagged and deliberately isolated into one reusable service pair
for.

## Decision: "Resolved during the week" is read from the existing `task.status_changed` audit trail; no new tracking

**Rationale**: `DetailedActivityController::update()` already writes a
`task.status_changed` entry to `audit_logs` (via `AuditLogger::record`)
every time a task's `status` field changes, with `old_status`/`new_status`
in `metadata` and the transition's timestamp as `created_at` — this fires
for every save through `updateDetailedActivity`, including 002/003/004's
existing Support Ops save paths. A transition where `new_status ===
'completed'`, within the target week, for an entity that is (currently) a
support/learning-work-type issue in an accessible project, is exactly
"resolved during that week." No new column, table, or tracking is
introduced — `SupportOpsWeeklyReportBuilder` (new service) simply reads
this existing history.

**Alternatives considered**: Adding a `resolved_at` timestamp column to
`detailed_activities` — rejected, the same fact is already recorded via
the audit trail; a redundant column would be a second, independently-
maintained source of truth for the same fact, which this app's existing
architecture doesn't do anywhere else. Computing "resolved" from the
issue's current `updated_at` — rejected and explicitly called out in
FR-011: `updated_at` changes on *any* field edit, not specifically a
resolution, and would misclassify an unrelated edit to an already-resolved
issue as a new resolution.

## Decision: Single application-wide timezone; ISO (Monday-start) week boundaries

**Rationale**: No per-user timezone field exists anywhere in `User` today,
and introducing one is explicitly out of scope (FR-010). Carbon (already a
Laravel dependency, used by 004 for staleness math) provides `isoWeek`/
`isoWeekYear` and `startOfWeek(Carbon::MONDAY)`/`endOfWeek(Carbon::SUNDAY)`
directly, removing any ambiguity between an ISO week and a Sunday-start
week without introducing a new dependency.

**Alternatives considered**: Per-user timezone support — rejected as
out-of-scope infrastructure this feature doesn't need to introduce (no
existing feature in this app has it either). A Sunday-start week — rejected
in favor of the unambiguous, internationally-standard ISO convention,
per FR-010.

## Decision: Introduce `NotificationResource`, replacing the raw-model response

**Rationale**: `NotificationController`'s endpoints currently return raw
`Notification` Eloquent models — pre-constitution code, the same pattern
`SupportIssueResource`'s own docblock calls out for `DetailedActivityController`.
Since this feature already touches the same query path (to add the
recipient-aware filtering above), it's a low-risk, in-scope moment to wrap
the response in a proper API Resource per Constitution Principle II,
without a wholesale rewrite of every existing field.

**Alternatives considered**: Leaving the raw-model return as-is — rejected;
touching the query without correcting the response shape would leave new,
constitution-covered code returning raw models, which principle II
specifically says new code must not do.

## Decision: An overdue entry's urgency is derived at read time from the issue's current state, never permanently fixed at creation and never deleted

**Rationale**: FR-002 requires an overdue entry to stop being "active/
urgent" once cleared, without deleting it (preserving history, matching
this app's audit-trail posture) and without a second, independently-
drifting copy of "is this still stale" living on the notification row
itself. Deriving current urgency by re-checking `SupportOpsStaleness::state()`
against the linked issue at read time means the single existing source of
truth (the issue) decides — the notification row's own `is_read`/`read_at`
continue to mean exactly what they already mean for every other
notification type (has the user seen it), a separate concern from whether
it's still urgent right now.

**Alternatives considered**: Deleting the entry once cleared — rejected,
inconsistent with the audit-log/no-silent-history-loss posture found
elsewhere in this app. Storing a fixed "still urgent" flag on the row,
updated by a background process — rejected, requires exactly the kind of
scheduled/background infrastructure FR-008 rules out for this phase, and
would create a second, staleness-checking implementation living on the
notification row in addition to `SupportOpsStaleness` itself.

**Output**: All Technical Context unknowns resolved via direct inspection
of existing code; no `NEEDS CLARIFICATION` markers remain. Proceeding to
Phase 1.
