# Contract: Daily Operating Dashboard API (new)

Source of truth once implemented: `backend/routes/api.php`,
`backend/app/Http/Controllers/SupportOpsController.php` (new action added
to the existing controller — same rationale as `003-templates-prompt-
generator`'s `generationLog()`: a Support-Ops-specific action belongs on
the controller that already owns this feature area, not a new controller),
`backend/app/Http/Resources/TodaySupportIssueResource.php` (new).

## `GET /api/support-ops/today`

- **Auth**: `auth:sanctum` + the identical inclusion-based view check
  already used by `SupportOpsController::index()`/`generationLog()`
  (`isAdmin() || isProjectManager() || isTeamMember() || isDepartmentHead()`)
  — fail-closed, Client and null/unrecognized roles denied. No `project_id`
  parameter — unlike `index()`, this endpoint is intentionally cross-project
  (FR-002).

- **Query params**: none required. (No pagination in this first version —
  matching this app's existing low-traffic-internal-tool scale; see plan.md.)

- **Server-side behavior**:
  1. Re-run the view-access check — fail-closed, `403` for Client/null role.
  2. Resolve accessible project ids: `Project::query()->accessibleTo($user)->pluck('id')`
     (identical mechanism to `ReportController::projectsFor()`).
  3. Load every `DetailedActivity` with `work_type` in `['support', 'learning']`
     and `status != 'completed'` (query-level narrowing — data-model.md;
     completed issues can never qualify for any of the four sections, so
     they're excluded at the database level rather than loaded and discarded
     in PHP) whose hierarchy chain (`subActivity.activity.module`) resolves
     to one of those project ids, eager-loading `subActivity.activity.module.project`
     for the project label.
  4. Classify each into exactly one of four buckets (or exclude it) by
     delegating to `App\Services\SupportOpsTodayClassifier`, which applies
     FR-009/FR-009a's precedence per issue and internally calls
     `App\Services\SupportOpsStaleness` for the staleness check — this logic
     does not live inline in the controller action (data-model.md, research.md).
  5. Sort the `stale` bucket by overdue duration, descending (data-model.md).
  6. Return all four buckets through `TodaySupportIssueResource::collection()`,
     plus a `generated_at` timestamp.

- **Success (200)**:
  ```json
  {
    "stale": [ TodaySupportIssueResource, ... ],
    "watch_closely": [ TodaySupportIssueResource, ... ],
    "waiting_for_client": [ TodaySupportIssueResource, ... ],
    "learning_priorities": [ TodaySupportIssueResource, ... ],
    "generated_at": "2026-07-23T09:00:00+00:00"
  }
  ```
  A user with access to zero projects, or whose accessible projects have no
  qualifying issues, still gets `200` with all four arrays empty — FR-010's
  "clear empty state, not silently hidden" is a frontend rendering concern
  for this exact shape, not a different response shape.

- **Failure (403)**: `{ "message": "..." }` for Client role or
  unrecognized/null role — same message style as `index()`'s existing
  denial.

- **Failure (401)**: standard Sanctum unauthenticated response.

## `TodaySupportIssueResource` shape

Same field list as the existing `SupportIssueResource`
(`id`, `name`, `work_type`, `status`, `client_name`, `tenant_name`,
`channel`, `client_priority`, `last_client_update_at`, `next_action`,
`evidence`, `root_cause`, `resolution`, `description`, `progress`,
`responsible`, `client_visible`, `created_at`, `updated_at`), plus:

```json
{
  "project": { "id": 1, "name": "Acme Rollout" }
}
```

`overdue_since` (an ISO 8601 timestamp — the moment this issue crossed its
staleness threshold) is included **only** on items in the `stale` array,
supporting the "most overdue first" sort and letting the frontend show
"overdue by X" without recomputing the threshold math client-side.

## Frontend call site

`frontend/src/lib/api.js` gains `fetchTodayDashboard = () => api.get('/support-ops/today')`,
called once on mount by the new `TodayDashboard.jsx` page (no `project_id`
selector — this view has none, per FR-002). Selecting any item opens the
existing shared `TaskDetailModal` (FR-008), reusing whatever fetch/update
plumbing `SupportOps.jsx` already has for that, not a new detail-fetch path.
