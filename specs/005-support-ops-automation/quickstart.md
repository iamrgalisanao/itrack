# Quickstart: Validating Support Ops Automation (Support Ops Phase 4)

## Prerequisites

- Backend running: `cd backend && php artisan serve` (http://localhost:8000)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- **No migration to run** — this feature adds zero columns/tables.
- Signed in as persona accounts from `001-real-auth-cutover`'s quickstart
  (all password `password`): `pm@itrack.test` (Project Manager, sees all
  projects), `team@itrack.test` (Team Member, IT department), and a second
  Team Member account in a **different** department than `team@itrack.test`
  — create one via `php artisan tinker` if one doesn't already exist, e.g.
  `App\Models\User::factory()->create(['role' => 'Team Member', 'department' => 'Finance', 'email' => 'team-finance@itrack.test', 'password' => Hash::make('password')])`.
- At least one support issue in an IT-department project with
  `client_priority` and `last_client_update_at` set far enough in the past
  to already be stale, and `responsible` naming a role Team Members resolve
  to (e.g. `PFC`).

## Scenario 1 — Overdue entry reaches the right individual, not everyone sharing their role (US1, FR-001, FR-006)

1. Sign in as `team@itrack.test` (IT department) and open notifications.
2. **Expected**: a new entry appears identifying the stale issue, its
   client, and how overdue it is.
3. Sign in as the Finance-department Team Member created above and open
   notifications.
4. **Expected**: no entry for that issue appears — same role as
   `team@itrack.test`, but no access to the IT project it belongs to.
5. Sign in as `pm@itrack.test` and open notifications.
6. **Expected**: the entry also appears here (Project Manager is always
   eligible per FR-001), confirming two different individual recipients
   can both correctly have their own copy without either seeing the
   other's notification list.

## Scenario 2 — Overdue entry clears without deleting history (US1, FR-002)

1. As `team@itrack.test`, with the overdue entry from Scenario 1 visible,
   open the issue (via Support Ops or Today) and record a client update.
2. Reload notifications.
3. **Expected**: the entry is still present in the response (never
   omitted), but its `severity` is now `info` (rather than whatever the
   issue's priority previously mapped to) and its `metadata.is_currently_urgent`
   is `false` — visually, `NotificationBell.jsx`'s existing severity-based
   icon no longer shows it as urgent.
4. Confirm via `php artisan tinker` that the underlying `notifications` row
   still exists (`App\Models\Notification::where('type', 'support_overdue')->count()`
   unchanged) — it was not deleted, only downgraded.

## Scenario 3 — No duplicate entry for the same crossing (US1, FR-003)

1. As `team@itrack.test`, view notifications twice in a row without the
   underlying issue changing.
2. **Expected**: exactly one `support_overdue` entry for that issue, not
   two.

## Scenario 4 — Daily summary is per-user, not per-role (US2, FR-004, FR-006)

1. Sign in as `team@itrack.test` and view notifications.
2. **Expected**: a dated summary appears with counts for Stale / P1 —
   Watch Closely / Waiting for Client / Learning Priorities, matching what
   the Today view (`/support-ops/today`) shows for that same user.
3. Sign in as the Finance-department Team Member and view notifications.
4. **Expected**: their own summary shows counts reflecting only Finance
   projects — never IT's counts, even though both share the Team Member
   role.
5. View notifications again later the same day as either user.
6. **Expected**: no second, duplicate summary for that day.

## Scenario 5 — Weekly report counts opened/resolved/still-stale correctly (US3, FR-005, FR-011)

1. Ensure at least one support issue was created this week, and at least
   one was transitioned to `completed` this week (via the existing detail
   modal, so a `task.status_changed` audit entry is recorded).
2. Sign in as `pm@itrack.test` and view notifications.
3. **Expected**: a weekly report appears with `opened` including the newly
   created issue and `resolved` including the one just completed.
4. View notifications again later the same week.
5. **Expected**: no second, duplicate report for that week.

## Scenario 6 — Legacy notification types are unaffected (regression)

1. Trigger an existing notification type (e.g. an `@mention` in a comment,
   or a task past its `plan_end_date`).
2. Sign in as any other user sharing that same role.
3. **Expected**: they see the same legacy notification too — role-wide
   behavior for pre-existing types is unchanged; only this feature's three
   new types are individually scoped.

## Regression check

- Run backend tests: `cd backend && php artisan test` — all existing tests
  plus the new Unit/Feature tests for this feature must pass, including the
  same-role/different-access leakage matrix (SC-005) for all three entry
  types.
- Manually confirm the existing Support Ops board, Today dashboard, Kanban
  Board, and Reports views are unchanged.
- Confirm `npm run build` and `npm run lint` remain clean (no new frontend
  dependency was introduced, and `NotificationBell.jsx` needed no changes).
