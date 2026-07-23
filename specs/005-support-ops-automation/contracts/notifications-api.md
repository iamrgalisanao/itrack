# Contract: Notification endpoints (existing — corrected, not new)

Source of truth once implemented: `backend/app/Http/Controllers/NotificationController.php`
(modified, no new controller), `backend/app/Http/Resources/NotificationResource.php`
(new), `backend/app/Services/SupportOpsWeeklyReportBuilder.php` (new). No new
routes — `backend/routes/api.php`'s existing `notifications`/`notifications/{id}/read`/
`notifications/read-all` entries are unchanged.

## `GET /api/notifications`

- **Auth**: `auth:sanctum`, no additional role gate beyond being an
  authenticated user — every role receives *some* notifications today
  (including Client, for existing types); this feature's three new types
  are simply never generated for a Client (not in FR-001's eligible-role
  list, and Clients have no Support Ops access to summarize per FR-004/005's
  internal-role scope).

- **Behavior change**: In addition to the existing
  `generateOverdueNotifications()`/`generateDueSoonNotifications()` calls
  (unchanged), three new private methods run, each scoped to the
  authenticated user only (research.md):
  1. Generate any missing `support_overdue` entries this user is currently
     eligible for (FR-001) — no-op per issue+recipient if already generated
     for that exact threshold-crossing (`event_key`).
  2. Generate today's `support_daily_summary` for this user, if not already
     generated today (FR-004).
  3. Generate this week's `support_weekly_report` for this user, if not
     already generated this ISO week (FR-005).

- **Retrieval query correction** (FR-006): rows are now selected by
  `recipient_user_id = current_user.id OR (recipient_user_id IS NULL AND
  user_role = current_user.role)` — previously `user_role = current_user.role`
  alone. Every existing notification type has `recipient_user_id = null`
  and is retrieved exactly as it is today via the second branch.

- **Response shape change**: notifications are now returned through a new
  `NotificationResource` (Constitution Principle II) instead of raw
  Eloquent models. Field set is unchanged from what the raw model already
  exposed (`id`, `type`, `severity`, `title`, `message`, `detailed_activity_id`,
  `link_url`, `event_key`, `event_date`, `metadata`, `is_read`, `read_at`,
  `created_at`) — this is a response-shape correction, not a new contract
  for existing consumers (`NotificationBell.jsx` reads the same field
  names).

- **Overdue-entry urgency at read time** (FR-002 — resolved, not optional):
  for any `support_overdue` row, the current staleness of its linked issue
  (`detailed_activity_id`) is re-checked before every response. The row is
  **always included** (never omitted, never deleted). If the issue is no
  longer stale, the row's `severity` is downgraded to `'info'` (reusing
  `NotificationBell.jsx`'s existing severity-based icon styling — zero
  frontend changes needed) and `metadata.is_currently_urgent` is set to
  `false`. While still stale, `severity` reflects the issue's priority and
  `metadata.is_currently_urgent` is `true`.

- **Success (200)**: same envelope shape as today —
  ```json
  { "unread_count": 3, "notifications": [ NotificationResource, ... ] }
  ```

## `PUT /api/notifications/{id}/read`

- **Ownership check correction** (FR-006): currently `$notification->user_role
  !== $user->role` → 403. Becomes: 403 unless `notification.recipient_user_id
  === current_user.id` OR (`notification.recipient_user_id` is null AND
  `notification.user_role === current_user.role`) — otherwise a same-role
  user could mark another individual's personal notification as read today,
  even though they can no longer see it in their own list once the
  retrieval query above is corrected.

- **Response**: unchanged shape (`unread_count`, `notification`) — the
  latter now via `NotificationResource`.

## `POST /api/notifications/read-all`

- **Query correction** (FR-006): same two-branch condition as `GET
  /api/notifications`'s retrieval query, replacing the current role-only
  `where('user_role', $user->role)` — so this only marks the current user's
  own individually-scoped rows and their shared role-wide rows as read,
  never another user's personal entries.

- **Response**: unchanged (`{ "unread_count": 0 }`).

## New notification content types (via existing `type`/`title`/`message`/`metadata` fields — no new fields)

**Link target — resolved, not left open**: all three types link to
`/support-ops/today`. `Kanban.jsx` supports a `?task={id}` deep link that
opens a specific issue's detail modal directly; `SupportOps.jsx` and
`TodayDashboard.jsx` do not have that capability today (confirmed by
inspection — only `Kanban.jsx` reads `window.location.search` for a `task`
param). Linking to a specific issue would require building that capability
first, which is out of scope for this feature; `/support-ops/today` is
where every one of these entries' underlying issues is already reachable.

| `type` | `title` (example) | `metadata` shape | `detailed_activity_id` | `link_url` |
|---|---|---|---|---|
| `support_overdue` | "Client update overdue: {client_name}" | `{ client_priority, overdue_since, is_currently_urgent }` | the issue's id (kept for reference/testing even though the link target doesn't deep-link to it) | `/support-ops/today` |
| `support_daily_summary` | "Today's Support Ops summary" | `{ stale, watch_closely, waiting_for_client, learning_priorities }` (counts) | null | `/support-ops/today` |
| `support_weekly_report` | "This week's Support Ops report" | `{ opened, resolved, still_stale }` (counts) | null | `/support-ops/today` |
