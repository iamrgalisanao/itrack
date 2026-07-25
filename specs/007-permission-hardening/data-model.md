# Phase 1 Data Model: Permission Hardening

**Two new tables.** No existing table's columns change meaning. `projects.project_owner` is untouched (spec.md's Assumptions explain why "PM owns project" scoping is explicitly deferred to a future spec).

## `project_assignments` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint, PK | |
| `user_id` | `foreignId('user_id')->constrained()->cascadeOnDelete()` | The Team Member/Client granted access. FR-016 restricts *which* users may be inserted here at the application-validation layer (role + `is_active`) — the FK itself doesn't encode role. |
| `project_id` | `foreignId('project_id')->constrained()->cascadeOnDelete()` | FR-014 — deleting a project cascades to remove its assignment rows automatically (research.md). |
| `assigned_by_user_id` | `foreignId('assigned_by_user_id')->constrained('users')` | The Admin/PM who created the grant. Real FK, unlike `department_grants.granted_by_user_id`'s unconstrained precedent (research.md). |
| `created_at`, `updated_at` | timestamps | `created_at` is also "assigned at" for audit/UI display purposes — no separate column needed. |

**Unique index**: `unique(['user_id', 'project_id'])` — backs both FR-017's idempotency and the fast lookup `Project::scopeAccessibleTo`'s `whereHas` and `BelongsToProject::isAccessibleTo` both perform on every project-scoped request (SC-006).

### `ProjectAssignment` model

```php
class ProjectAssignment extends Model
{
    protected $fillable = ['user_id', 'project_id', 'assigned_by_user_id'];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function project(): BelongsTo { return $this->belongsTo(Project::class); }
    public function assignedBy(): BelongsTo { return $this->belongsTo(User::class, 'assigned_by_user_id'); }
}
```

### `Project` model — one new relation, one modified scope

```php
public function assignments(): HasMany
{
    return $this->hasMany(ProjectAssignment::class);
}

public function scopeAccessibleTo(Builder $query, User $user): Builder
{
    if ($user->isAdmin() || $user->isProjectManager()) {
        return $query;
    }
    if ($user->isDepartmentHead()) {
        $departments = DepartmentGrant::departmentsFor($user);
        return $query->whereIn('department', $departments);
    }
    if ($user->isTeamMember() || $user->isClient()) {
        // was: return $query->where('department', $user->department);
        return $query->whereHas('assignments', fn ($q) => $q->where('user_id', $user->id));
    }
    return $query->whereRaw('1 = 0');
}
```

Only the Team Member/Client branch changes — Admin/PM/Department Head branches are byte-for-byte unchanged (FR-004, structurally guaranteed).

## `app/Models/Concerns/BelongsToProject.php` (new trait)

Applied to `Module`, `Activity`, `SubActivity`, `DetailedActivity`, `Comment`, `Attachment`. Each using model implements `resolveProjectId(): int` for its own relationship depth; the trait provides the one shared check.

```php
trait BelongsToProject
{
    abstract public function resolveProjectId(): int;

    public function isAccessibleTo(User $user): bool
    {
        return Project::query()
            ->accessibleTo($user)
            ->whereKey($this->resolveProjectId())
            ->exists();
    }
}
```

| Model | `resolveProjectId()` implementation |
|---|---|
| `Module` | `return $this->project_id;` (direct FK, already exists) |
| `Activity` | `return $this->module->project_id;` |
| `SubActivity` | `return $this->activity->module->project_id;` |
| `DetailedActivity` | `return $this->subActivity->activity->module->project_id;` |
| `Comment` | `return $this->detailedActivity->subActivity->activity->module->project_id;` |
| `Attachment` | same chain as `Comment` |

Controllers call `abort_unless($model->isAccessibleTo(AccessContext::user($request)), 403)` at the top of every method that currently has no project-level check (`index`/`show`/`store`/`update`/`destroy` on all six). For `index`/`store`, the parent resource resolved by the shallow route (e.g. `$project` for `ModuleController::index`) is checked the same way before any child rows are queried/created.

**Pre-existing role checks in these controllers also become preview-aware, via the same accessor** — not just this new `isAccessibleTo` check. `Module`/`Activity`/`SubActivity`/`DetailedActivity`/`Comment`/`Attachment`/`Project`/`Report` controllers already each define an identical `private function user(Request $request): User { return $request->user(); }` helper that every check in the controller (new and pre-existing alike) calls instead of `$request->user()` directly. Repointing that one helper to `return AccessContext::user($request);`, in exactly these eight controllers, makes `DetailedActivityController`'s existing `client_visible` filter and `ReportController::exportCsv`'s existing Client-role denial resolve against the previewed target too (research.md) — required for FR-006, since preview promises the target's *whole* access, not only the parts this feature added.

## `preview_sessions` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint, PK | |
| `admin_user_id` | `foreignId('admin_user_id')->constrained('users')->cascadeOnDelete()` | The Admin who started the preview. |
| `target_user_id` | `foreignId('target_user_id')->constrained('users')->cascadeOnDelete()` | Who is being previewed. |
| `target_role_at_start` | `string` | Snapshot of `target.role` at the moment the session started (FR-019) — compared against the target's *current* role on every use so a mid-session role change is detected, not just a disable. |
| `token` | `string(64)->unique()` | Opaque, `Str::random(64)`. Never exposed after the `store` (start) response (data-model's Response shapes, below). |
| `started_at` | timestamp | |
| `ended_at` | timestamp, nullable | Set on explicit end, or on the request where expiry/target-invalidity is first detected (research.md — detected lazily on next use, not via a background job). |
| `expires_at` | timestamp | `started_at + 2 hours`, fixed at creation (FR-020; research.md). |

**No unique constraint on `admin_user_id`** — an Admin ending one preview and starting another within the same session is fine; `PreviewSessionController::store` explicitly ends any prior still-active session for that Admin before creating a new one, so at most one is ever active per Admin, without needing a DB constraint to enforce it (a business rule, not a data-integrity one — starting a second preview is a deliberate replace, not a conflict).

### `PreviewSession` model

```php
class PreviewSession extends Model
{
    protected $fillable = ['admin_user_id', 'target_user_id', 'target_role_at_start', 'token', 'started_at', 'expires_at'];
    protected $casts = ['started_at' => 'datetime', 'ended_at' => 'datetime', 'expires_at' => 'datetime'];

    public function admin(): BelongsTo { return $this->belongsTo(User::class, 'admin_user_id'); }
    public function target(): BelongsTo { return $this->belongsTo(User::class, 'target_user_id'); }

    // Returns the specific invalidity reason, or null if still active — the caller
    // (ResolvePreviewSession middleware) uses this both to decide validity and to
    // audit why (FR-019, and the target_role_changed reason below).
    public function invalidReason(): ?string
    {
        if ($this->ended_at !== null) {
            return 'manual';
        }
        if ($this->expires_at->isPast()) {
            return 'expired';
        }
        $target = $this->target()->first();
        if ($target === null || !$target->is_active) {
            return 'target_disabled';
        }
        if ($target->role !== $this->target_role_at_start) {
            return 'target_role_changed';
        }
        return null; // still active
    }
}
```

## `app/Http/Middleware/ResolvePreviewSession.php` (new) + `app/Support/AccessContext.php` (new)

Round 3 of review correctly flagged that resolving preview validity *inside* `AccessContext::user()` — called deep within individual controller/trait checks, after a response may already be partly assembled — makes it impossible to guarantee an invalid/expired preview token never returns a mix of "preview ended" signaling and real domain data. The fix moves validation to a dedicated middleware that runs **before any controller**, in the same authenticated group as `EnsureUserIsActive`/`BlockWritesDuringPreview`: it either resolves a valid target and attaches it to the request, or short-circuits the entire request with a 409 and no domain data at all. `AccessContext` is left as a simple, safe accessor with no lookup logic or side effects of its own.

```php
class ResolvePreviewSession
{
    public function handle(Request $request, Closure $next)
    {
        $token = $request->header('X-Preview-Session');
        if (!$token) {
            return $next($request); // no preview attempted — proceed as the real user
        }

        $session = PreviewSession::where('token', $token)
            ->where('admin_user_id', $request->user()->id)
            ->first();
        $reason = $session?->invalidReason();

        if ($session === null || $reason !== null) {
            if ($session !== null && $session->ended_at === null) {
                $session->update(['ended_at' => now()]);
                AuditLogger::record($request, 'preview.ended', 'PreviewSession', $session->id,
                    metadata: ['target_user_id' => $session->target_user_id, 'reason' => $reason]);
            }
            // Short-circuit here — no controller runs, no domain data in this response
            // (round-3 review's point 3). The frontend clears local state and refetches
            // as a separate, subsequent request.
            return response()->json(['message' => 'Preview session ended.', 'reason' => $reason ?? 'not_found'], 409)
                ->header('X-Preview-Ended', '1');
        }

        $request->attributes->set('preview_target', $session->target);
        return $next($request);
    }
}
```

```php
class AccessContext
{
    // The ONE call site every read-scoping check uses in place of $request->user().
    // Safe to call anywhere — ResolvePreviewSession has already guaranteed that if
    // execution reached a controller, any presented preview token was valid.
    public static function user(Request $request): User
    {
        return $request->attributes->get('preview_target') ?? $request->user();
    }
}
```

## State transitions — Preview Session

```text
   start (POST /api/preview-sessions)
             │
             ▼
        [ active ] ──explicit end (DELETE /api/preview-sessions/current)──▶ [ ended ]
             │                                                                  ▲
             ├──expires_at reached (detected by ResolvePreviewSession, next request)──┤
             ├──target.is_active becomes false (detected the same way)───────────────┤
             └──target.role differs from target_role_at_start (detected the same way)─┘
```

All four end paths write `ended_at` and one `preview.ended` audit entry (differing only in `metadata.reason`: `manual` | `expired` | `target_disabled` | `target_role_changed`) — the middleware sketch above makes this an explicit, direct side effect at the point of detection, not an implied consequence of a getter. There is no path back from `ended` — a new preview is always a new row.

## Audit actions (FR-013, FR-018), extending `AuditLogger`'s action list

| Action | `entity_id` | `metadata` |
|---|---|---|
| `project_assignment.created` | new assignment's id | `{ user_id, project_id }` |
| `project_assignment.deleted` | deleted assignment's id | `{ user_id, project_id }` |
| `preview.started` | new preview session's id | `{ target_user_id }` |
| `preview.ended` | preview session's id | `{ target_user_id, reason: 'manual'\|'expired'\|'target_disabled'\|'target_role_changed' }` |
| `preview.write_blocked` | n/a (no entity created) | `{ target_user_id, attempted_method, attempted_path }` — written by `BlockWritesDuringPreview` (FR-007) |

`AuditLogger`'s docblock action list is extended with these five entries alongside its existing ones (research.md notes the docblock was already slightly stale for pre-existing `module.*`/`activity.*`/`sub_activity.*` actions — out of scope to backfill here, not touched).

## Response shapes

### `ProjectAssignmentResource`

```json
{
  "id": 5,
  "user": { "id": 12, "name": "Jane Doe", "role": "Team Member", "department": "IT" },
  "project": { "id": 3, "name": "Riverside Renovation" },
  "assigned_by": { "id": 1, "name": "Admin User" },
  "created_at": "2026-07-25T09:00:00+00:00"
}
```

### `PreviewSessionResource`

Start (`POST /api/preview-sessions`) response only — the one time `token` is ever returned:

```json
{
  "token": "a1b2c3...(64 chars)",
  "target": { "id": 12, "name": "Jane Doe", "role": "Team Member", "department": "IT" },
  "expires_at": "2026-07-25T11:00:00+00:00"
}
```

No `GET` endpoint ever re-exposes `token` — the frontend captures it once at start and holds it only in `sessionStorage` (research.md).

## Non-enumeration mapping (FR-005/FR-011)

Applies only when `AccessContext::user($request)` is Team Member or Client (research.md):

| Case | Response |
|---|---|
| Project/nested resource ID exists, `isAccessibleTo()` is `false` | `403`, body `{ "message": "You do not have access to this resource." }` |
| Project/nested resource ID does not exist at all (would otherwise be a 404) | Same `403`, same body — via the exception-handler rule (research.md), not a controller-level check |

Admin/PM/Department Head: unchanged — a genuinely missing ID is Laravel's normal `404`.
