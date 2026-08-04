# API Contract: Taskboard

All endpoints require Sanctum session auth. All endpoints re-check project access on
the specific project/task (`Project::accessibleTo()` / `DetailedActivity::isAccessibleTo()`)
— role alone is never sufficient (laravel-owasp-security `sec-broken-access-control`,
plan.md).

## GET /api/projects/{project}/taskboard/tasks

**Access**: Any internal role (Admin, PM, Team Member, Department Head) with access to
`project` → all tasks. Client → 403/hidden entirely (spec FR-008 — no partial or
read-only view for Client, unlike the rest of Work Program).

**Response**: `DetailedActivityResource::collection(...)` — flat, project-wide list.
Grouping by `sprint_label` happens client-side (research.md D6/data-model.md), not in
this response shape.

**Test cases**:
- Internal user with project access sees all tasks across every Module/Epic in the
  project.
- Client → 403 (or route unreachable for that role, per FR-008).
- Internal user without access to `project` → 403 (IDOR check).
- Response never includes another project's tasks (tenant isolation).

## POST /api/projects/{project}/taskboard/tasks

**Access**: Admin/PM only (`isPmOrAdmin()` — same gate as
`DetailedActivityController::store()`, not the broader `canWrite()`). Team Member,
Department Head, Client → 403.

**Body**: `module_id` (required, must belong to `project`), `name`/title (required),
`priority` (nullable, enum), `estimated_story_points` (nullable, 0–100),
`sprint_label` (nullable, trimmed/normalized), `assignee_user_id` (nullable, must be a
real non-Client user with access to `project`), `status` (defaults to the existing
default if omitted).

**Behavior**: Resolves-or-creates the reserved `Taskboard`/`Unclassified Tasks`
Activity/SubActivity pair under `module_id` (data-model.md), then creates the
`DetailedActivity` under it. If `assignee_user_id` is set, fires one assignment
notification after the transaction commits (research.md D5).

**Test cases**:
- Admin/PM with project access creates a task → 201, task appears under the resolved
  reserved container.
- Two creations against the same fresh Module produce exactly one `Taskboard` Activity
  and one `Unclassified Tasks` SubActivity (idempotency, data-model.md).
- Team Member/Department Head → 403.
- Client → 403.
- `module_id` belonging to a different project than the URL's `{project}` → 422/403
  (IDOR case — `module_id` is client-supplied).
- Missing required `name` → 422.
- Invalid `priority` → 422.
- `estimated_story_points` negative or > 100 → 422.
- `assignee_user_id` referencing a real, non-Client user without access to `project` →
  422 (research.md D4 — the case a plain `exists:users,id` rule alone would miss).
- `assignee_user_id` set → exactly one `Notification` row created for that user,
  `detailed_activity_id` set to the new task's real id (not null).

## PATCH /api/detailed-activities/{detailedActivity} (existing endpoint, extended)

**Access**: Unchanged base gate (`canWrite()` — Admin/PM/Team Member). Taskboard-specific
fields (`priority`, `estimated_story_points`, `sprint_label`, `assignee_user_id`) are
additionally restricted to `isPmOrAdmin()` — stripped from the request **before**
validation for any other caller (research.md D3), not merely hidden from the response.

**Body**: any subset of existing fields, plus the four Taskboard fields (Admin/PM only).

**Behavior**: If `assignee_user_id` changes to a new non-null value, fires one
assignment notification after commit — reassigning to a different person notifies them;
resubmitting the same assignee fires nothing; clearing the assignee fires nothing;
reassigning back to a previous assignee fires a new notification (research.md D5 — the
dedup key is not permanently keyed to the task+recipient pair).

**Test cases**:
- Admin/PM sets `priority`/`estimated_story_points`/`sprint_label`/`assignee_user_id` →
  200, values persisted.
- Team Member submits the same fields alongside a legitimate field (`status`) → 200,
  `status` applied, Taskboard fields silently unchanged — asserted against the DB row,
  not just the response. A deliberately invalid `assignee_user_id` in the same request
  must NOT cause a 422 (proves the strip happens before validation).
- `assignee_user_id` changed to a user without access to `project` → 422.
- Assignment sequence A → B → A produces three notifications total, not two (the
  reassign-back case).
- Resubmitting the same assignee produces no new notification.
- Clearing the assignee (`null`) produces no notification.
- Client → 403 (unchanged, existing gate).

## DELETE /api/activities/{activity} and DELETE /api/sub-activities/{subActivity} (existing endpoints, extended)

**Access**: Unchanged base gates.

**New behavior**: Deleting an Activity named `"Taskboard"` while it has any
SubActivity/DetailedActivity descendants → 409. Deleting a SubActivity named
`"Unclassified Tasks"` while it has any `DetailedActivity` children → 409. An empty
Activity/SubActivity sharing either reserved name is unaffected — deletes normally.

**Test cases**:
- Reserved-named Activity/SubActivity with Taskboard-created children → 409, not
  deleted.
- Same reserved names, but empty (no children) → deletes successfully, 200/204.
- A non-reserved-named Activity/SubActivity is completely unaffected by this change
  (regression check against existing delete behavior).
