# API Contracts — 021 Dashboard Restructure with My Work List

All routes live inside the existing middleware group
(`auth:sanctum → EnsureUserIsActive → ResolvePreviewSession → BlockWritesDuringPreview`,
`backend/routes/api.php:50`). Reads resolve the acting user via
`AccessContext::user($request)` (preview-aware); writes and audit use the real
`$request->user()`. Envelope/row shapes are specified in [data-model.md](../data-model.md).

## New

### `GET /api/my-work` — `MyWorkController::index`

The acting user's open assigned tasks, server-bucketed.

Query params (all optional, all validated):

| Param | Rule | Default | Meaning |
|---|---|---|---|
| `today` | `date_format:Y-m-d`, `required_with:week_end` | see anchor pairing | local "today" anchor |
| `week_end` | `date_format:Y-m-d`, `after_or_equal:today`, `required_with:today` | see anchor pairing | local end-of-week anchor |
| `per_bucket` | `integer, min:1, max:100` | `10` | row cap per bucket (counts stay true totals) |
| `bucket` | `in:overdue,this_week,later,no_due_date`, `required_with:all` | — | with `all=1`: expand this bucket |
| `all` | boolean, `required_with:bucket` | — | uncap the named `bucket` only |

**Anchor pairing (all-or-nothing)**: `today` and `week_end` are accepted only as a
pair — if either is absent the request must carry neither, and the server computes
**both** defaults (server-tz today / server-tz Sunday end-of-week). A lone anchor is a
`422`. After validation the controller asserts `today <= week_end` before building
predicates — the bucket ranges must partition the open set (the four counts always sum
to the total open count). `bucket` and `all` likewise appear together or not at all.

Responses: `200` fixed-shape envelope (all four buckets + `meta.can_write`);
`422` on malformed/lone anchors, unknown bucket, `per_bucket` out of range, or
`bucket`/`all` supplied alone; `401` unauthenticated; `403` disabled user;
`409` + `X-Preview-Ended: 1` expired preview token.

Scope invariant: `assignee = effective user` **∩** `project ∈ Project::accessibleTo(effective user)`
**∩** open (`status != 'completed'`) **∩** `client_visible` when effective user is a Client.
Every role gets 200 (read endpoint); scoping does the gating.

### `POST /api/my-work/tasks` — `MyWorkController::store`

Quick-add, self-assigned by construction.

Body: `name` (required, string, max:255), `module_id` (required, must exist and belong
to an accessible project), `plan_end_date` (nullable, date).

Behavior: `canWrite()` gate on effective user (denial audited via `AuditLogger::denied`);
placement resolved server-side to the reserved `Taskboard` / `Unclassified Tasks`
sub-activity chain (`App\Support\TaskboardPlacement`); `assignee_user_id` forced to the
real authenticated user — any client-supplied value is ignored; audited `task.created`.

Responses: `201` + `MyWorkTaskResource`; `422` validation (`errors.name` shape — the
frontend renders inline with preserved title); `403` role denial / inaccessible module
(repo denial-parity rules) / preview write-block (middleware).

## Reused unchanged

| Route | Used for |
|---|---|
| `PUT /api/detailed-activities/{id}` (`DetailedActivityController::update`) | Inline row status change (`{status, progress}`); already tenant-checked, role-gated, audited, preview-blocked |
| `GET /api/detailed-activities/{id}` (`::show`) | Full task fetch on row click, feeds `TaskDetailModal` |
| `GET /api/projects`, `GET /api/projects/{id}/modules` | Quick-add placement selects (already `accessibleTo`-scoped) |

## Modified (additive only)

### `GET /api/dashboard` — `ProjectController::dashboard`

- **Adds** `stats.completed_recent` (7-day completed count, `client_visible`-filtered for Client effective users).
- **Fixes** `recent_activities` to filter `client_visible=false` rows for Client effective users (pre-existing leak).
- **Removes nothing** — `App.jsx:154` sidebar and the two `ProjectScopingTest` `stats.projects` assertions stay valid.

## Frontend API helpers (`frontend/src/lib/api.js`)

```
fetchMyWork(params)                     → GET  /my-work        (params: today, week_end, per_bucket?, bucket?, all?)
createMyWorkTask({ module_id, name, plan_end_date }) → POST /my-work/tasks
```

The quick-add project select is UI-only state for filtering the module list — the
project id is not part of the create payload (`module_id` implies it).
