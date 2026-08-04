# API Contract: Bug Tracker

All endpoints require Sanctum session auth. All endpoints re-check project
access on the specific bug/project via `BelongsToProject::isAccessibleTo()`
(laravel-owasp-security `sec-broken-access-control`, plan.md) — role alone
is never sufficient.

## GET /api/projects/{project}/bugs

**Access**: Internal roles (Admin, Project Manager, Team Member, Department
Head) with access to `project` → all bugs. Client role with access to
`project` → only `visibility = client_visible` bugs. Any user without
access to `project` → 403.

**Response**: `BugResource::collection(...)` — array of bugs including
`group` (derived) and `bug_id` (derived display string) and `is_overdue`
(derived).

**Test cases** (feed `/speckit-tasks`):
- Internal user with access sees all bugs on their project, both
  visibilities.
- Client user with access sees only `client_visible` bugs.
- Client user without access to the project → 403, sees nothing.
- Internal user without access to the project (e.g. Team Member not
  assigned) → 403 (IDOR check, laravel-owasp-security).
- Response excludes bugs from a different project entirely (tenant
  isolation).

## POST /api/projects/{project}/bugs

**Access**: Internal roles only, with access to `project`. Client → 403.

**Body**: `title` (required), `description`, `priority` (required, enum),
`status` (defaults to `Awaiting Review` if omitted), `owner_id` (optional),
`sprint_label` (optional), `due_date` (optional), `visibility` (defaults to
`internal` if omitted).

**Behavior**: `bug_number` generated server-side (research.md D2, never
client-settable). `reporter_id` defaults to the authenticated user; not
independently settable on create in this phase (spec allows changing
Reporter later via PATCH, per FR-003, but create always defaults to
creator — simplest correct behavior, avoids letting one user silently
attribute a bug to another on creation).

**Test cases**:
- Internal user with access creates a bug → 201, `bug_number` sequential
  starting at 1 for a fresh project.
- Second bug on the same project → `bug_number` = 2 (sequencing).
- Client attempting to create → 403.
- Internal user without project access attempting to create → 403.
- Missing required `title` → 422.
- Invalid `priority`/`status` value → 422.

## GET /api/bugs/{bug}

**Access**: Same rule as the list endpoint, evaluated against `bug`'s own
project (via `BelongsToProject`), plus the same client_visible filter for
Client role (a Client requesting a specific non-visible bug by ID → 403/404,
not just omitted from a list — this is the IDOR case).

**Test cases**:
- Client requesting a `client_visible` bug on their project → 200.
- Client requesting an `internal`-only bug by ID (even on their own
  project) → 403/404, not silently exposed.
- User without project access requesting by ID → 403/404.

## PATCH /api/bugs/{bug}

**Access**: Internal roles only, with access to `bug`'s project. Client →
403 (FR-011 — Client can never edit anything, including their own visible
bugs).

**Body**: any subset of `title`, `description`, `priority`, `status`,
`reporter_id`, `owner_id`, `sprint_label`, `due_date`, `visibility`.

**Behavior**: Status change to `Fixed` implicitly stops future breach
notifications for this bug (data-model.md — enforced by the generation
query's filter, not a special-cased hook here).

**Test cases**:
- Internal user changes `status` from `Awaiting Review` directly to
  `Fixed` → 200, allowed (free-selection status model, research.md D4).
- Internal user changes `visibility` to `client_visible` → now appears to
  Client users with project access.
- Client attempting any PATCH → 403.
- Internal user without project access attempting PATCH → 403.

## DELETE /api/bugs/{bug}

**Access**: Internal roles only, with access to `bug`'s project. Client →
403.

**Behavior**: `bug_number` is never reused after delete (data-model.md,
FR-002) — no renumbering of remaining bugs.

**Test cases**:
- Internal user with access deletes a bug → 204/200, removed from listing.
- A subsequently created bug on the same project gets the next
  never-before-used `bug_number` (not a reused/gap-filled one).
- Client attempting DELETE → 403.

## Notification touchpoint (existing endpoint, extended behavior)

## GET /api/notifications

**Change**: now also runs `generateBugBreachNotifications()` (research.md
D3) alongside the existing overdue/due-soon checks, before returning the
visible-to-user notification list. No new endpoint, no new response shape
— bug-breach rows use the existing `Notification`/`NotificationResource`
shape, `type = 'overdue'`, `link_url = "/bug-tracker?bug={id}"`.

**Test cases**:
- A bug with a past due date and `status != Fixed` produces exactly one
  notification for its Reporter and one for its Owner (if set and
  different from Reporter) — no duplicates on a second poll.
- A bug reaching `Fixed` before its due date passes produces zero breach
  notifications, ever.
- A bug's Reporter/Owner only sees their own individually-targeted breach
  notification — not visible to other users sharing the same role
  (`recipient_user_id`-scoped, not `user_role`-broadcast).
