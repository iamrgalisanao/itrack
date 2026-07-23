# Phase 1 Data Model: Support Ops Automation (Support Ops Phase 4)

**No new tables. No new columns. No migration.** This feature populates one
existing, currently-unused column (`notifications.recipient_user_id`) and
reads two other existing data sources (`audit_logs`' `task.status_changed`
entries, and `detailed_activities` via the existing Support Ops/Today
fields) — see research.md for why each needed no new tracking.

## `Notification` (existing entity — new usage, not a new shape)

| Field | Existing? | How this feature uses it |
|---|---|---|
| `recipient_user_id` | Yes, unused until now | Set to the specific individual recipient for all three of this feature's entry types. Every pre-existing type continues to leave this null. |
| `user_role` | Yes | Still set, for consistency with existing types and so the corrected retrieval query's role-only branch keeps working for legacy rows — but for this feature's rows, `recipient_user_id` is the row's real identity, not `user_role`. |
| `type` | Yes | Three new values: `support_overdue`, `support_daily_summary`, `support_weekly_report` (alongside the existing `assignment`/`mention`/`overdue`/`blocked`/`due_soon`). |
| `event_key` | Yes | Encodes both the specific recipient and the specific period/crossing (FR-008) — see the three shapes below. This is what makes the existing unique constraint (`user_role, type, detailed_activity_id, event_key`) correctly dedupe per-recipient: two different recipients sharing a role get two different `event_key` values, so both rows coexist without collision. |
| `detailed_activity_id` | Yes | Set for the overdue-entry type (links to the specific issue). Null for daily/weekly types — they summarize many issues, not one. |
| `metadata` | Yes | Carries the daily/weekly counts and the overdue entry's issue snapshot (client name, priority, how overdue) — same JSON-column usage pattern already established for existing types. |
| `title` / `message` / `severity` / `link_url` | Yes | Populated per FR-009 so a user can distinguish these from each other and from existing types at a glance (e.g. distinct titles like "Client update overdue", "Today's Support Ops summary", "This week's Support Ops report"; `link_url` points at Today for the overdue/daily types, matching FR-008's "not just on the Today board" framing). |

### Event key shapes (FR-008)

```text
support_overdue:{issue_id}:{recipient_user_id}:{overdue_since}
support_daily_summary:{recipient_user_id}:{YYYY-MM-DD}
support_weekly_report:{recipient_user_id}:{ISO_YEAR}-W{ISO_WEEK}
```

`{overdue_since}` is the same threshold-crossing timestamp `SupportOpsStaleness::staleAt()`
(004) already computes — deterministic given the issue's priority and
reference timestamp, so it naturally changes (and correctly produces a
*new* entry) only if the issue goes stale again after a later client
update clears the earlier crossing.

## Recipient resolution (FR-001) — overdue entries

For a given support/learning issue currently in the `stale` state
(`SupportOpsStaleness::state() === 'stale'`, reusing 004 unchanged):

```text
candidates = { Admin, Project Manager }                      # always eligible by role
candidates += resolveRoleFromResponsible(issue.responsible)   # existing precedent,
                                                               # reused as-is
eligible_recipients = every individual user in `candidates`'s
                       role(s) who can access issue.project
                       (Project::accessibleTo-equivalent, per-user)
```

Each `eligible_recipients` member gets their own `Notification` row
(their own `recipient_user_id`, their own `event_key`) — generated only
when *that* user is the one currently loading their own notifications
(research.md's "scoped to the requester" decision), not eagerly for
everyone else in `eligible_recipients` at that same moment.

## Daily summary content (FR-004)

For the requesting user, at most once per calendar day (app timezone,
FR-010):

```text
issues = DetailedActivity in {accessible projects for this user},
         work_type in [support, learning], status != completed
buckets = SupportOpsTodayClassifier::classify(issues)   # 004, unchanged
metadata = {
  stale: count(buckets.stale),
  watch_closely: count(buckets.watch_closely),
  waiting_for_client: count(buckets.waiting_for_client),
  learning_priorities: count(buckets.learning_priorities),
}
```

Generated (with all-zero counts, per FR-007) even when `issues` is empty or
the user has zero accessible projects.

## Weekly report content (FR-005, FR-011) — new `SupportOpsWeeklyReportBuilder` service

For the requesting user, at most once per ISO week (FR-010):

```text
project_ids = accessible projects for this user
week = [Monday 00:00:00, Sunday 23:59:59] in the app timezone (FR-010)

opened   = count(DetailedActivity where work_type in [support, learning],
                  project in project_ids, created_at within week)

resolved = count(distinct DetailedActivity linked to an audit_logs entry
                  where action = 'task.status_changed',
                  metadata.new_status = 'completed',
                  created_at (the audit entry's own timestamp) within week,
                  and the linked issue's work_type is currently
                  support/learning and its project is in project_ids)

still_stale = count(DetailedActivity where work_type in [support, learning],
                     project in project_ids, status != completed,
                     SupportOpsStaleness::state() == 'stale',
                     evaluated as of the end of the week)
```

`resolved` is deliberately sourced from the audit trail (research.md), not
from `updated_at` or a new column — an issue resolved before this feature
existed, with no matching audit entry, is simply not counted (FR-011's
explicit "not miscounted" requirement), not treated as an error.

## Overdue entry lifecycle (FR-002) — resolved decision, not left optional

An overdue entry's row is never deleted **and never omitted from the
response**. Whether it is still urgent is derived at read time by
re-checking `SupportOpsStaleness::state()` against the linked issue (via
`detailed_activity_id`): if it's no longer `'stale'` (client update
recorded, or issue resolved), the row is returned with **`severity`
downgraded to `'info'`** (reusing `NotificationBell.jsx`'s existing
severity-driven icon styling — no new frontend concept needed) **and
`metadata.is_currently_urgent` set to `false`** (an explicit, testable
signal alongside the visual one). While still stale, `severity` reflects
the issue's priority (matching this app's existing severity conventions)
and `metadata.is_currently_urgent` is `true`. `is_read`/`read_at` continue
to mean exactly what they mean for every other notification type — a
separate concern from current urgency, never conflated with it.

## Retrieval / ownership query correction (constraint, not a new entity)

Every one of `NotificationController`'s three existing actions
(`index`, `markAsRead`, `markAllAsRead`) currently scopes purely by
`user_role`. For this feature's three new types to never leak across users
sharing a role (FR-006, SC-005), each of those three queries becomes:

```text
recipient_user_id = current_user.id
  OR (recipient_user_id IS NULL AND user_role = current_user.role)
```

The second branch is exactly today's existing behavior, preserved
unchanged for every notification type that isn't one of this feature's
three — this is additive to the existing query, not a replacement of it.

## State transitions

None new. `is_read`/`read_at` follow the exact same transitions every
existing notification type already has. The only "transition" this feature
introduces is conceptual (an overdue entry's *presented* urgency, derived
live per the lifecycle section above) — nothing about the row itself
transitions state beyond the read/unread flag every type already has.
