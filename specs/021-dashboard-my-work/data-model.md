# Data Model — 021 Dashboard Restructure with My Work List

**No schema changes.** This feature introduces no migrations, no new tables, no new
columns (Constitution V satisfied vacuously). Everything below is a mapping of spec
concepts onto existing storage plus two derived, non-persisted view models.

## Entity: Task (existing — `detailed_activities`)

| Spec concept | Storage reality | Notes |
|---|---|---|
| Task | `DetailedActivity` model / `detailed_activities` table | The "task" everywhere in the spec |
| Due date | **`plan_end_date`** (cast `date`, nullable) | There is **no** `due_date` column; all bucket math uses `plan_end_date` |
| Assignee | `assignee_user_id` (FK → `users`, indexed) | Clients can never be assignees (`internalUserExistsRule()`); TMs cannot set assignees (018 policy) |
| Status | `status` string, NOT NULL, default `not_started` | Full set: `backlog, not_started, in_progress, for_review, completed, blocked, delayed` |
| Open task | `status != 'completed'` | Encapsulated as new `DetailedActivity::scopeOpen()` — the only model change |
| Parent context | `subActivity → activity → module → project` chain | Eager-loaded `subActivity.activity.module.project`; project scoping via `Project::accessibleTo` through this chain |
| Client visibility | `client_visible` boolean | Filtered when the effective user `isClient()` (defense-in-depth in My Work; defect fix in `recent_activities`) |

### State transitions (existing, unchanged)

Status transitions are unrestricted string updates through the existing
`DetailedActivityController::update()` validation set. This feature adds **no** new
transitions; it only surfaces the existing control on dashboard rows. Completing
(`status = 'completed'`) removes a task from the My Work open set by definition of
`scopeOpen()`. Kanban's auto-progress coupling applies on inline change:
`completed → progress 100`, `not_started|backlog → progress 0`.

## Derived view: My Work (not persisted)

Computed per request in `MyWorkController::index()`:

```
scope   = assignee_user_id = AccessContext::user(request).id
        ∩ task.project ∈ Project::accessibleTo(effective user)
        ∩ scopeOpen()
        ∩ (client_visible = true  — only when effective user isClient())
```

### Bucket rules (server-side, from validated client anchors)

Inputs: `today` (Y-m-d), `week_end` (Y-m-d, `after_or_equal:today`) — client-computed
local dates (week ends Sunday per spec assumption), accepted **only as a pair**: if
either is absent the server computes both defaults (never a mixed state — mixed anchors
would make the bucket predicates overlap and break count integrity). Invariant: the
four bucket counts always sum to the total open count.

| Bucket | Predicate on `plan_end_date` | Ordering | Quick-add |
|---|---|---|---|
| `overdue` | `< today` | `plan_end_date asc, id asc` | never (FR-007) |
| `this_week` | `>= today AND <= week_end` | same | yes — prefill = `week_end` |
| `later` | `> week_end` | same | yes — no prefill |
| `no_due_date` | `IS NULL` | `created_at desc` | yes — no prefill |

Boundary pins (spec edge cases, test-enforced): due **today** → `this_week`, never
`overdue`; on a Sunday, due-that-Sunday → `this_week`, due-Monday → `later`.

Caps: `per_bucket` (default 10) rows per bucket; `count` always the true total;
`?bucket=X&all=1` returns one bucket uncapped.

### Serialized row — `MyWorkTaskResource` (new, lean by design)

`id, name, code, status, progress, plan_end_date, priority, sub_activity_id,
project {id, name}, module {id, name}`

Banned from this payload (test-enforced): `root_cause`, `resolution`, `evidence`,
`client_name`, `tenant_name`, `notes` — Support-Ops/detail fields never rendered by a
list row. Full task detail comes from the existing
`GET /api/detailed-activities/{id}` (`DetailedActivityResource`) on row open.

### Envelope (fixed shape — all four buckets always present)

```json
{
  "buckets": {
    "overdue":     { "count": 0, "tasks": [] },
    "this_week":   { "count": 3, "tasks": [ MyWorkTaskResource, ... ] },
    "later":       { "count": 1, "tasks": [ ... ] },
    "no_due_date": { "count": 0, "tasks": [] }
  },
  "meta": { "today": "2026-08-26", "week_end": "2026-08-30",
            "per_bucket": 10, "can_write": true }
}
```

Empty-bucket omission is a **rendering** rule (FR-011), not a payload rule.
`meta.can_write` = effective user's `HasRole::canWrite()` — the frontend's single
source for mutation-affordance gating (preview-correct by construction).

## Derived view: Summary metrics (existing payload + one additive key)

`GET /api/dashboard` `stats` gains **`completed_recent`**: count of accessible tasks
with `status = 'completed'` and `updated_at >= now() - 7 days` (documented proxy;
`actual_end_date` too sparse), `client_visible`-filtered for Client effective users.
No keys removed (sidebar `App.jsx:154` + two `ProjectScopingTest` assertions depend on
the existing shape). Rendered metric row: `completed_recent`, `overall_progress`,
`in_progress`, `delayed`.

## Quick-add write path (existing table, forced invariants)

`POST /api/my-work/tasks` creates one `DetailedActivity` row with an **explicit**
create-array (never request passthrough):

| Column | Source |
|---|---|
| `name` | validated payload |
| `plan_end_date` | validated payload (nullable; client computed the bucket prefill) |
| `sub_activity_id` | resolved server-side via `App\Support\TaskboardPlacement` (reserved `Taskboard` → `Unclassified Tasks` chain under the validated accessible `module_id`) |
| `assignee_user_id` | **forced** `$request->user()->id` (real user; client value ignored) |
| `status` | `'not_started'` |
| `client_visible` | `false` (forced for all roles on quick-add) |

Wrapped in `DB::transaction`; audited `task.created` via `AuditLogger` (real user).
