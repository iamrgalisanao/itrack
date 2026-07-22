# Contract: Support Ops API (new + extended)

Source of truth once implemented: `backend/routes/api.php`,
`backend/app/Http/Controllers/SupportOpsController.php`,
`backend/app/Http/Resources/SupportIssueResource.php`. Documented here
during planning so `/speckit-tasks` has a concrete contract to build
against.

## `GET /api/support-ops`

- **Auth**: `auth:sanctum` + internal-only view check (Admin, Project
  Manager, Team Member, Department Head — same as `KanbanGuard`'s intended
  audience; Client denied, invalid/null role denied — fail-closed, per
  Constitution Principle I)
- **Query params**:
  - `project_id` (required) — scopes the board to one project, per spec
    Assumption ("not a cross-project inbox in Phase 1")
  - `work_types` (optional, comma-separated, default `support`) — e.g.
    `support,learning` when the "Learning" filter (FR-012) is enabled
- **Success (200)**: array of `SupportIssueResource` objects (see shape
  below), one per matching `DetailedActivity`, across every Sub-Activity
  under the project (not just the auto-provisioned "Support Requests"
  chain — a task could have its `work_type` changed to `support` from
  anywhere, per spec FR-002, and must still show up here)
- **Failure (403)**: `{ "message": "..." }` for Client role or unrecognized
  role

## `POST /api/support-ops`

- **Auth**: `auth:sanctum` + `canWrite()` (Admin, Project Manager, Team
  Member only — Department Head denied even though they can view, per
  spec FR-001/FR-011)
- **Body**:
  ```text
  project_id        required, integer, must reference an existing project
  name              required, string, max:255      — issue title
  client_name       required, string, max:255
  client_priority   required, in:P1,P2,P3
  tenant_name       nullable, string, max:255
  channel           nullable, string, max:255
  timestamp         nullable, date                 — composed into `description`, see below
  affected_area     nullable, string                — composed into `description`; generic
                                                        "area or workflow affected" (not assumed to
                                                        be an API endpoint — could be a screen, a
                                                        physical process, a document, anything)
  expected_behavior nullable, string                — composed into `description`
  actual_behavior   nullable, string                — composed into `description`
  evidence          nullable, string                — stored as-is in the `evidence` column
  next_action       nullable, string
  ```
  **Field composition note**: `timestamp`, `affected_area`, `expected_behavior`,
  and `actual_behavior` are intake-form-only inputs — they are not separate
  database columns (the migration only adds the 10 fields in data-model.md,
  matching the source plan's intent to "keep the first version small").
  `SupportOpsController@store` composes them into the existing `description`
  field as a structured block, e.g.:
  ```text
  Timestamp: 2026-07-22 14:30
  Area/workflow affected: Checkout screen
  Expected: Order confirms and prints a receipt
  Actual: Screen freezes, no confirmation shown
  ```
- **Server-side behavior**:
  1. `Module`/`Activity`/`SubActivity` find-or-create on `code = 'SUPPORT-OPS'`
     scoped to `project_id` (see data-model.md)
  2. Create the `DetailedActivity` under the resulting Sub-Activity with
     `work_type = support`, `status = backlog`, `progress = 0`,
     `client_visible = false` (matches the existing default behavior in
     `DetailedActivityController::store()` for non-PM/Admin creators, and
     the source plan's stated default)
  3. `AuditLogger::record()` call, following the existing
     `task.created`-style convention (e.g. `support_issue.created`)
- **Success (201)**: the created issue as a `SupportIssueResource`
- **Failure (403)**: Department Head or Client attempting to create —
  `{ "message": "Unauthorized: Only Admin, Project Manager, and Team Member roles can create tasks." }` (reuses the exact existing message style from `DetailedActivityController`)
- **Failure (422)**: validation errors, standard Laravel shape

## `PUT /api/detailed-activities/{id}` (extended, not new)

Existing endpoint (`DetailedActivityController::update()`). Extended for
this feature:

- Validation array gains the 10 new fields (see data-model.md for the
  exact rules)
- The Team-Member field allow-list (`$allowedForTeamMember`) gains all 10
  new fields, so a Team Member can update `next_action`, `evidence`,
  `root_cause`, `resolution`, `client_priority`, `last_client_update_at`,
  `client_name`, `tenant_name`, `channel`, and `work_type` on a support
  issue — Department Head still cannot write at all (`canWrite()` gate
  upstream of the allow-list, unchanged)
- No response shape change — this feature does not retrofit
  `DetailedActivityController` onto `SupportIssueResource` (see
  research.md's decision on this)

## `SupportIssueResource` shape (new)

```json
{
  "id": 123,
  "name": "Checkout screen freezing for a client",
  "work_type": "support",
  "status": "in_progress",
  "client_name": "Acme Corp",
  "tenant_name": "Branch 3",
  "channel": "Viber — Acme Ops group",
  "client_priority": "P1",
  "last_client_update_at": "2026-07-22T13:00:00Z",
  "next_action": "Confirm with the client whether this happens on all devices",
  "evidence": "Log excerpt attached in comment #4",
  "root_cause": null,
  "resolution": null,
  "description": "Timestamp: ...\nArea/workflow affected: ...\nExpected: ...\nActual: ...",
  "progress": 40,
  "responsible": "Team Member",
  "client_visible": false,
  "created_at": "2026-07-22T10:00:00Z",
  "updated_at": "2026-07-22T13:00:00Z"
}
```

Notably absent by design: no computed `is_stale` boolean in the resource —
staleness (data-model.md) is derived from `client_priority` +
`last_client_update_at` + `status`, and is cheap enough to compute
client-side from those three fields already present. Keeping it derived
avoids a second source of truth that could drift (e.g. if the frontend
computes it at render time vs. a stale server-computed snapshot from
`GET` time).
