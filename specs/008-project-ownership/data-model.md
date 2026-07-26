# Phase 1 Data Model: Project Ownership and PM-Scoped Administration

**One new table.** No existing table's columns change meaning. `projects.project_owner` (free-text) is untouched — see spec.md's Assumptions for why it's retained, not migrated-and-dropped, in this change.

## `project_ownerships` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint, PK | |
| `user_id` | `foreignId('user_id')->constrained()->cascadeOnDelete()` | The Project Manager who owns this project. Application-validated to be an active PM (FR-005) — the FK itself doesn't encode role. |
| `project_id` | `foreignId('project_id')->constrained()->cascadeOnDelete()` | FR-014 — deleting a project cascades to remove its ownership rows automatically, identical mechanism to 007's `project_assignments`. |
| `assigned_by_user_id` | `foreignId('assigned_by_user_id')->constrained('users')` | The Admin who granted this ownership. Real FK, matching 007's `project_assignments` precedent (not `department_grants`' older unconstrained-column pattern). |
| `created_at`, `updated_at` | timestamps | `created_at` doubles as "owned since" for display purposes — no separate column needed. |

**Unique index**: `unique(['user_id', 'project_id'])` — backs both idempotency (a repeat grant is a no-op, matching 007's `project_assignments` idempotency decision) and the fast lookup `Project::scopeOwnedBy` performs on every project-assignment write request.

**No unique constraint on `project_id` alone** — a project may have more than one owner (FR-004); the composite unique only prevents the *same PM* being recorded as owner of the *same project* twice.

### `ProjectOwnership` model

```php
class ProjectOwnership extends Model
{
    protected $fillable = ['user_id', 'project_id', 'assigned_by_user_id'];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function project(): BelongsTo { return $this->belongsTo(Project::class); }
    public function assignedBy(): BelongsTo { return $this->belongsTo(User::class, 'assigned_by_user_id'); }
}
```

### `Project` model — one new relation, one new scope

```php
public function ownerships(): HasMany
{
    return $this->hasMany(ProjectOwnership::class);
}

public function scopeOwnedBy(Builder $query, User $user): Builder
{
    return $query->whereHas('ownerships', fn ($q) => $q->where('user_id', $user->id));
}
```

Existing `scopeAccessibleTo` is completely unchanged — ownership is a new, separate question ("can this PM administer this project's assignments") from accessibility ("can this user see this project at all"), and the two deliberately don't share a code path. A Project Manager's `scopeAccessibleTo` branch (unrestricted) is untouched by this feature (FR-009).

## Enforcement matrix — the complete decision table `store()`/`destroy()` must implement

| Requester | Project's owner state | Result |
|---|---|---|
| Admin | any (irrelevant) | Allowed — always, unconditionally (FR-008) |
| PM | zero owners | Allowed — FR-018 rollout safety net, legacy behavior |
| PM | owned solely by this PM | Allowed |
| PM | owned solely by a *different* PM | Denied, `403` |
| PM | multiple owners, **including** this PM | Allowed — being *one of several* owners is still ownership |
| PM | multiple owners, **excluding** this PM | Denied, `403` |
| Any other role | any | Denied, `403` (unchanged 007 behavior) |

`$hasAnyOwner`/`$isOwner` (below) already fall out of this table correctly without any extra branching — `$isOwner` is `true` in both "including this PM" rows regardless of how many *other* owners exist, since `scopeOwnedBy`'s `whereHas` only asks "is there a row for *this* user," never "is there exactly one owner." The multi-owner rows are the ones most likely to be missed if this is implemented from the two-owner story (Scenario 3) alone without also testing a project that has ≥2 owners where the acting PM is one of several — see plan.md's Testing list and quickstart.md's Scenario 3a.

## `ProjectAssignmentController::store()`/`destroy()` — the enforcement point (modified, not new)

```php
$user = $this->user($request);

if ($user->isAdmin()) {
    // unrestricted — byte-identical to pre-008 behavior (FR-008, SC-002)
} elseif ($user->isProjectManager()) {
    $projectId = $validated['project_id'] ?? $projectAssignment->project_id; // store() vs destroy()
    $hasAnyOwner = ProjectOwnership::where('project_id', $projectId)->exists();
    $isOwner = Project::query()->ownedBy($user)->whereKey($projectId)->exists();
    if ($hasAnyOwner && !$isOwner) {
        AuditLogger::denied($request, 'manage_project_assignments', 'project_assignment');
        return response()->json(['message' => 'You do not own this project.'], 403);
    }
    // $hasAnyOwner === false: FR-018 rollout safety net — any PM passes,
    // identical to pre-008 behavior, until this project gets its first owner
} else {
    AuditLogger::denied($request, 'manage_project_assignments', 'project_assignment');
    return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can manage project assignments.'], 403);
}
```

`index()` (the read/list endpoint) is unchanged — FR-009 keeps PM read-access unrestricted, and 007's `index()` was already Admin/PM-shared with no project-level filtering; this feature doesn't add any.

## Ownership target validation (FR-005), mirroring 007's FR-016 pattern

`ProjectOwnershipController::store()` rejects (422) unless the target `user_id` resolves to a user who is both `is_active = true` and `isProjectManager()` — the same shape as 007's `ProjectAssignmentController::store()` validating Team Member/Client targets, just a different role.

## Ownership transfer (FR-010) — one atomic action, one audit entry, safe under concurrency (FR-015)

**Critical implementation constraint**: `ProjectOwnershipController::transfer(Request $request, ProjectOwnership $ownership)` uses Laravel route-model binding for `{id}` — but that binding resolves via a plain, **unlocked** query *before* the transaction below ever opens. The bound `$ownership` instance is therefore stale the instant it's fetched and MUST be used for exactly one thing: reading its `->id` to pass into the transaction as `$ownershipId`. Every other field this operation needs (`project_id`, current `user_id`) MUST come from the fresh, locked re-query on the first line inside the transaction, never from the route-bound instance directly — that's the entire point of the lock. (The pre-transaction validation step — rejecting `new_owner_user_id === $ownership->user_id` with a `422` — is a convenience early-exit only, not the authoritative check; if it races and goes stale, the transaction's own re-fetch below still produces a correct `409` or a correct transfer, never a silently wrong one.)

```php
DB::transaction(function () use ($ownershipId, $newOwnerId, $user, $request) {
    $ownership = ProjectOwnership::where('id', $ownershipId)->lockForUpdate()->first();
    if (!$ownership) {
        // Already transferred or removed by a concurrent request — abort
        // rather than proceeding on a stale read (FR-015).
        abort(409, 'This ownership record no longer exists — it may have already been transferred or removed.');
    }

    $projectId = $ownership->project_id;
    $oldOwnerId = $ownership->user_id;

    $ownership->delete();

    // Edge case: new owner already co-owns this project — consolidate
    // rather than attempt a duplicate (user_id, project_id) row.
    $newOwnership = ProjectOwnership::where('project_id', $projectId)
        ->where('user_id', $newOwnerId)
        ->lockForUpdate()
        ->first();

    if (!$newOwnership) {
        $newOwnership = ProjectOwnership::create([
            'user_id' => $newOwnerId,
            'project_id' => $projectId,
            'assigned_by_user_id' => $user->id,
        ]);
    }

    AuditLogger::record(
        $request,
        'project_ownership.transferred',
        'project_ownership',
        $newOwnership->id, // the surviving row's id, not the deleted one's
        null,
        [
            'project_id' => $projectId,
            'from_user_id' => $oldOwnerId,
            'to_user_id' => $newOwnerId,
            'from_ownership_id' => $ownership->id,
            'to_ownership_id' => $newOwnership->id,
        ]
    );

    return $newOwnership;
});
```

`$newOwnerId` is validated identically to `store()` (active PM only) before this transaction runs; it's also rejected at validation (`422`) if it equals the ownership being transferred's own current `user_id` (a no-op transfer). The `lockForUpdate()` on the row being transferred closes the race a prior draft of this document missed: without it, two concurrent transfers of the *same* ownership row could both read it as existing, both proceed to delete-then-create, and leave the project with two unintended owners (a `DELETE` affecting zero already-deleted rows doesn't raise an error in Eloquent, so a stale second transaction would otherwise sail through). With the lock, the second transaction blocks until the first commits, then finds the row gone and aborts with `409` instead of silently corrupting the outcome. The second `lockForUpdate()` (on a possible existing co-owner row) closes the analogous race for the consolidation path.

## State transitions — Project Ownership

```text
   [ zero owners — FR-018: ANY PM unrestricted, byte-identical to pre-008 ]
             │
             │ grant (POST /api/project-ownerships)
             ▼
        [ owned by PM X — only PM X (among PMs) may administer this project ]
             │
             ├──remove (DELETE)──────────▶ [ back to zero owners — FR-018 reapplies immediately ]
             │
             ├──transfer (POST .../transfer)─────────▶ [ owned by PM Y — one row swapped (locked/re-verified,
             │                                            FR-015), one audit entry ]
             │
             └──owner disabled / role changed away from PM──▶ [ row persists, dormant — grants no authority
                                                                 until re-enabled/restored, per FR-011;
                                                                 no state transition in the data itself. Note:
                                                                 the project is NOT ownerless during this —
                                                                 FR-018 does not reapply, since the ownership
                                                                 row still exists, just dormant ]
```

## Audit actions (FR-012), extending `AuditLogger`'s action list

| Action | `entity_id` | `metadata` |
|---|---|---|
| `project_ownership.created` | new ownership row's id | `{ user_id, project_id }` |
| `project_ownership.deleted` | deleted ownership row's id | `{ user_id, project_id }` |
| `project_ownership.transferred` | the surviving (new-owner) ownership row's id — the old row is deleted, so its own id wouldn't remain navigable | `{ project_id, from_user_id, to_user_id, from_ownership_id, to_ownership_id }` |

## Response shape (`ProjectOwnershipResource`)

```json
{
  "id": 7,
  "user": { "id": 3, "name": "Jane Doe", "role": "Project Manager", "department": "IT" },
  "project": { "id": 5, "name": "Riverside Renovation" },
  "assigned_by": { "id": 1, "name": "Admin User" },
  "created_at": "2026-07-26T09:00:00+00:00"
}
```

Byte-for-byte the same shape as 007's `ProjectAssignmentResource` (Consistent API Contracts, Principle II) — never a raw model.
