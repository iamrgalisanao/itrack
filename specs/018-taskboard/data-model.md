# Phase 1 Data Model: Taskboard

## Entity: DetailedActivity (extended — this is "Task")

Table: `detailed_activities` (existing table, four new nullable columns)

| Column | Type | Notes |
|---|---|---|
| `priority` | string, nullable | Enum: `Critical`, `High`, `Medium`, `Low` — reuses `Bug`'s exact vocabulary. Distinct from the existing `client_priority` (P1/P2/P3, Support-Ops-specific) — different concept, different column. |
| `estimated_story_points` | unsigned small int, nullable | `0`–`100`. No `actual_story_points` column in this phase (research.md, spec.md Assumptions — undefined workflow, deferred). |
| `sprint_label` | string, nullable, max 100 | Free text, no relationship to any entity. Trimmed and blank-normalized to `null` before saving (research.md D6). |
| `assignee_user_id` | unsigned bigint FK → `users.id`, nullable, `nullOnDelete()` | Real user reference — distinct from the existing free-text `responsible` string column, which is untouched and continues to serve its existing role-based notification-targeting use outside Taskboard. |

No backfill required — every existing row and every task created outside the Taskboard
flow is simply unaffected (all four columns nullable, no default beyond `null`).

### New relationship

```php
public function assignee(): BelongsTo
{
    return $this->belongsTo(User::class, 'assignee_user_id');
}
```

### New constants

```php
public const PRIORITY_CRITICAL = 'Critical';
public const PRIORITY_HIGH     = 'High';
public const PRIORITY_MEDIUM   = 'Medium';
public const PRIORITY_LOW      = 'Low';
public const PRIORITIES = [self::PRIORITY_CRITICAL, self::PRIORITY_HIGH, self::PRIORITY_MEDIUM, self::PRIORITY_LOW];
```

### Validation rules (enforced in `TaskboardController`/`DetailedActivityController`, not just DB constraints)

- `priority`: nullable, `Rule::in(DetailedActivity::PRIORITIES)`.
- `estimated_story_points`: nullable, integer, `min:0`, `max:100`.
- `sprint_label`: nullable, string, `max:100`; trimmed, blank string becomes `null` before persisting (research.md D6).
- `assignee_user_id`: nullable, integer, must reference a real non-Client user (`Rule::exists`), AND that user must have actual access to the task's project (`Project::scopeAccessibleTo()` check — research.md D4). Both checks required; neither alone is sufficient.
- `module_id` (create-only, not a `DetailedActivity` column — consumed to resolve the reserved container, see below): required, must belong to the project the request targets.

### Who can write which fields

- `priority`, `estimated_story_points`, `sprint_label`, `assignee_user_id`: **Admin/PM only** (`isPmOrAdmin()`). On the existing `update()` endpoint, these are stripped from the raw request *before* validation for any other role (research.md D3) — not merely hidden from the response.
- All other existing `DetailedActivity` fields (`status`, `progress`, etc.): unchanged permission behavior (Team Members retain their existing `$allowedForTeamMember` access).
- **Client**: no access to any of the four new fields, at any layer — validation, resource output, and (per spec FR-008) the Taskboard view itself.

## Derived / computed (not stored)

- **Per-group story-point sum**: computed client-side in `TaskboardView.jsx` — sum of `estimated_story_points` over a sprint-label group's tasks, treating `null` as `0`, displaying `"0 points"` when no task in the group has an estimate. Not persisted, not a new backend field.
- **Group assignment**: a task's display group is purely `sprint_label` (or the literal `"Backlog"` bucket when null) — no new column, computed the same way `BugTracker.jsx` groups its flat list by status today.

## Reserved container mechanism (no new entity)

Not a new entity — a convention over existing `Activity`/`SubActivity` rows:

| Level | Reserved name | Created under |
|---|---|---|
| Activity | `"Taskboard"` | The target Module, once, on first Taskboard task creation for that Module |
| SubActivity | `"Unclassified Tasks"` | The reserved `"Taskboard"` Activity, once |

Resolution logic (`TaskboardController::resolveDefaultSubActivity(int $moduleId): SubActivity`),
running inside the caller's single transaction (research.md D2):

```php
$module = Module::query()->whereKey($moduleId)->lockForUpdate()->firstOrFail();

$activity = $module->activities()->where('name', 'Taskboard')->first()
    ?? $module->activities()->create(['name' => 'Taskboard', 'sort_order' => 0]);

return $activity->subActivities()->where('name', 'Unclassified Tasks')->first()
    ?? $activity->subActivities()->create(['name' => 'Unclassified Tasks', 'sort_order' => 0]);
```

The `lockForUpdate()` on the Module row is what serializes concurrent Taskboard
creation against that Module — the Activity/SubActivity lookups underneath don't need
their own locks, since no other request can reach this code path for the same Module
until the lock releases.

### Deletion guard

- `ActivityController::destroy()`: reject (409) deleting an Activity named `"Taskboard"`
  while it has any SubActivity/DetailedActivity descendants. An empty Activity that
  happens to share the name can still be deleted.
- `SubActivityController::destroy()`: reject (409) deleting a SubActivity named
  `"Unclassified Tasks"` while it has any `DetailedActivity` children. An empty
  SubActivity sharing the name can still be deleted.

## Notification touchpoint (existing table, new event shape)

No new table. Reuses `notifications`. Unlike `Bug` (a separate table, `null`
`detailed_activity_id`), a Taskboard task assignment sets the **real**
`detailed_activity_id` FK to the task's own id. `event_key` is
`"assignment:event:{$auditEntry->id}"`, where `$auditEntry` is a new `AuditLog` row
(`action = 'task.assigned'`) written synchronously before the notification send is
scheduled via `DB::afterCommit()` (research.md D5) — not a permanent task+recipient
pair, not a timestamp.

## AuditLog touchpoint (existing table, extended service return)

`AuditLogger::record()` (`backend/app/Services/AuditLogger.php`) changes from `void` to
returning the created `AuditLog` model — purely additive, every existing call site
ignores the return value already. New action names introduced: `task.assigned` (on
assignment), reusing the existing `task.created` action name for Taskboard-created
tasks (no new action needed there — it's still a `detailed_activity` creation, just via
a different entry point).
