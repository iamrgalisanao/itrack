# Phase 1 Data Model: Support Ops Knowledge Base

**No new table, no new column, no new migration.** This feature is a new read-only query surface over `detailed_activities` rows that already exist (spec.md's Assumptions). The only "data model" change is one new query scope on the existing `DetailedActivity` model.

## `DetailedActivity` — one new scope, nothing else changed

```php
/**
 * 009-support-ops-knowledge-base — FR-003/FR-004's inclusion rule: an
 * eligible work type, the same status value the board treats as "Resolved"
 * (matched by value, never by display label), and both root_cause and
 * resolution present and non-blank after trimming.
 */
public function scopeResolvedWithRecordedFix(Builder $query): Builder
{
    return $query
        ->whereIn('work_type', ['support', 'learning'])
        ->where('status', 'completed')
        ->whereNotNull('root_cause')
        ->whereRaw("TRIM(root_cause) != ''")
        ->whereNotNull('resolution')
        ->whereRaw("TRIM(resolution) != ''");
}
```

No new relation is needed — `DetailedActivity`'s existing `subActivity` relation (already traversed by `today()` as `subActivity.activity.module.project`) is reused as-is to reach the owning project for cross-project scoping and for `TodaySupportIssueResource`'s nested `project` field.

## The knowledge base query (`SupportOpsController::knowledgeBase()`)

Conceptually — not a new stored entity, just the shape of the one query this endpoint runs:

```php
$projectIds = Project::query()->accessibleTo($user)->pluck('id');   // FR-007, identical to today()

$query = DetailedActivity::whereHas('subActivity.activity.module', function ($q) use ($projectIds) {
        $q->whereIn('project_id', $projectIds);
    })
    ->resolvedWithRecordedFix()                                     // FR-003/FR-004
    ->with('subActivity.activity.module.project');

if ($validated['project_id'] ?? null) {
    $query->whereHas('subActivity.activity.module', fn ($q) => $q->where('project_id', $validated['project_id']));
}
if ($validated['client_name'] ?? null) {
    $query->where('client_name', $validated['client_name']);        // exact match (FR-006)
}
if ($validated['tenant_name'] ?? null) {
    $query->where('tenant_name', $validated['tenant_name']);        // exact match
}
if ($validated['client_priority'] ?? null) {
    $query->where('client_priority', $validated['client_priority']); // exact match
}
if ($validated['q'] ?? null) {
    // FR-001a: explicit LOWER() on both sides — case-insensitivity is a
    // property of the query itself, not an assumption about the database's
    // default column collation. `!` (not backslash) is the LIKE escape
    // character — confirmed during implementation that MySQL (prod/dev) and
    // SQLite (this test suite's driver) disagree on how a literal backslash
    // is written inside a SQL string literal, which made a backslash-based
    // `ESCAPE '\\'` clause correct on one engine and throw "ESCAPE
    // expression must be a single character" on the other. `!` needs no
    // special quoting in either engine's string-literal syntax, so the same
    // clause is correct on both — a more robust fix than picking one engine
    // to match, consistent with the "don't lean on an implicit
    // engine-specific default for a stated requirement" principle already
    // applied to case-insensitivity above.
    $escaped = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], strtolower($validated['q']));
    $query->where(function ($q) use ($escaped) {
        foreach (['name', 'client_name', 'tenant_name', 'root_cause', 'resolution'] as $column) {
            $q->orWhereRaw("LOWER({$column}) LIKE ? ESCAPE '!'", ["%{$escaped}%"]);
        }
    });
}

$results = $query->orderByDesc('updated_at')->paginate($perPage);   // FR-005/FR-006b
```

Every applied filter and the keyword combine as `AND` conditions against the base `resolvedWithRecordedFix()`/project-scoped query — FR-006a's narrow-only guarantee falls out of this structure directly: nothing in this query can ever add matches back in, each `if` only narrows further.

## Response shape (`TodaySupportIssueResource`, reused unchanged)

```json
{
  "id": 42,
  "name": "Checkout page 500 error",
  "work_type": "support",
  "status": "completed",
  "client_name": "Acme Corp",
  "tenant_name": "acme-prod",
  "channel": "email",
  "client_priority": "P2",
  "last_client_update_at": "2026-06-01T09:00:00+00:00",
  "next_action": null,
  "evidence": "...",
  "root_cause": "Connection pool exhausted under peak load.",
  "resolution": "Increased pool size and added a circuit breaker.",
  "description": "...",
  "progress": 100,
  "responsible": "Jane Doe",
  "client_visible": false,
  "created_at": "2026-05-28T03:00:00+00:00",
  "updated_at": "2026-06-02T10:15:00+00:00",
  "project": { "id": 5, "name": "Acme Platform Migration" }
}
```

`overdue_since` (the one field `TodaySupportIssueResource` conditionally includes for `today()`'s stale bucket) never appears here — the knowledge base path never sets it on the model instance, so `$this->when(...)` correctly omits it. No Resource fork needed (research.md).

## "Full original context" (FR-009/FR-009a) — no new data shape, but a new frontend `readOnly` mode

Reached entirely through already-existing endpoints the frontend already calls elsewhere (`GET /api/detailed-activities/{id}`-equivalent fetch already used by `TaskDetailModal`, plus the existing comment/attachment `index()` endpoints) — this feature introduces no new response shape for issue detail, comments, or attachments.

It does require one new frontend contract, not a backend one: `TaskDetailModal` (and, through it, `SupportIssueExtraFields`, `TaskComments`, `TaskFiles`) gains a `readOnly` boolean prop, additive and defaulting to `false` so every existing caller (`Kanban.jsx`, `SupportOps.jsx`, `TodayDashboard.jsx`) is unaffected. The knowledge base page is the only caller that ever passes `readOnly={true}` — see research.md's corrected "full original context" decision for why this is required (FR-010 forbids any mutation through this feature, and the modal is unconditionally editable without it) and `contracts/support-ops-knowledge-base-api.md`'s "Full context" section for the full list of what `readOnly` suppresses.
