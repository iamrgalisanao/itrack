# Phase 1 Data Model: Support Ops Tracker (Phase 1)

No new tables. One additive migration on the existing `detailed_activities`
table; the "auto-provisioned hierarchy" reuses the existing `modules`,
`activities`, and `sub_activities` tables with a sentinel `code`.

## DetailedActivity (extended — `backend/app/Models/DetailedActivity.php`)

New nullable fields added to `$fillable` and the migration:

| Field | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `work_type` | string | no | `'project'` | One of `project`, `support`, `bug`, `feature`, `learning`, `admin`. Every pre-existing and non-Support-Ops-created task keeps `project`. |
| `client_name` | string | yes | — | Free text. |
| `tenant_name` | string | yes | — | Free text. |
| `channel` | string | yes | — | Free text (e.g. "Viber — PITX Ops group"). |
| `client_priority` | string | yes | — | One of `P1`, `P2`, `P3`, or unset. Drives the staleness threshold (see below); unset means no staleness evaluation is possible. |
| `last_client_update_at` | timestamp | yes | — | Set explicitly by a user action (FR-008), not automatically on every edit or status move. |
| `next_action` | text | yes | — | Free text. |
| `evidence` | text | yes | — | Free text (timestamp/payload/screenshot summary/log reference, per the source plan). |
| `root_cause` | text | yes | — | Free text. |
| `resolution` | text | yes | — | Free text. |

**Cast added**: `last_client_update_at => 'datetime'` (matches the existing
cast style already used for `plan_start_date` etc.).

**Validation additions to `DetailedActivityController::update()`** (and to
`SupportOpsController::store()`):

```text
work_type          => nullable|in:project,support,bug,feature,learning,admin
client_name         => nullable|string|max:255
tenant_name         => nullable|string|max:255
channel             => nullable|string|max:255
client_priority     => nullable|in:P1,P2,P3
last_client_update_at => nullable|date
next_action         => nullable|string
evidence            => nullable|string
root_cause          => nullable|string
resolution          => nullable|string
```

**Team Member allow-list extension** (`DetailedActivityController::update()`):
the existing `$allowedForTeamMember` array gains all ten fields above, so a
Team Member editing a support issue isn't silently stripped down to just
`status`/`progress`/`notes`/`output`/`actual_start_date`/`actual_end_date`.

## Status → Support Ops column mapping (no schema change — presentation only)

| Support Ops column | Backing `status` value(s) |
|---|---|
| Intake | `backlog` |
| Needs Info | `blocked`, `delayed` (both — matches Kanban's existing "Blocked / Delayed" equivalence; see research.md) |
| Needs Investigation | `not_started` |
| Investigating | `in_progress` |
| Client Update Due | `for_review` |
| Resolved | `completed` |

Moving a card between Support Ops columns is exactly a `status` update on
the same `DetailedActivity` record via the existing update endpoint — there
is no separate "Support Ops status" field.

## Staleness rule (computed, not stored)

Computed client-side (or server-side in the index response, implementer's
choice — no new column needed) from `client_priority` and
`last_client_update_at`, only for issues where `status != 'completed'`:

| `client_priority` | Threshold |
|---|---|
| `P1` | 1 hour since `last_client_update_at` |
| `P2` | 4 hours since `last_client_update_at` |
| `P3` | 1 business day since `last_client_update_at` |
| unset | Not evaluated — shown as "priority not set," not as stale or fresh |

## "Support Requests" hierarchy chain (reused entities, not new ones)

For a given `project_id`, `SupportOpsController@store` does:

```text
Module::firstOrCreate(['project_id' => $projectId, 'code' => 'SUPPORT-OPS'], ['name' => 'Support Requests', 'sort_order' => 9999])
  → Activity::firstOrCreate(['module_id' => $module->id, 'code' => 'SUPPORT-OPS'], ['name' => 'Support Requests', 'sort_order' => 9999])
    → SubActivity::firstOrCreate(['activity_id' => $activity->id, 'code' => 'SUPPORT-OPS'], ['name' => 'Support Requests', 'sort_order' => 9999])
```

Every support issue for that project attaches under the resulting
`SubActivity`. This chain is otherwise an ordinary Module/Activity/
Sub-Activity — it shows up in Work Program like any other (a deliberate
non-goal to hide it; see spec FR-010, nothing about Support Ops changes what
Work Program shows).

## State transitions

- `work_type` is set once at creation (via Support Ops intake, always
  `support`) and does not change automatically — a user could still edit it
  directly like any other field if they have write access, per FR-002.
- `last_client_update_at` only changes via an explicit user action (FR-008
  scenario 3) — it is not touched by a status/column move, a `next_action`
  edit, or any other field edit. This is intentional: moving a card to
  "Investigating" doesn't mean the client was just told anything.
- Once `status = completed` (Resolved column), stale evaluation stops
  entirely regardless of `last_client_update_at`'s age (spec US3 scenario 3).
