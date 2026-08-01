# Phase 1 Data Model: In-App Help Center

**No new table, no new column, no new migration.** This feature introduces no persisted entity of its own. It reads one already-existing table (`project_memberships`) through one new support-class method, and ships seven already-written static documents. The only "data model" changes are: one new computed method, and one new field on an existing curated API payload.

## `ProjectClientAccess::highestClientRole()` — one new method, nothing else changed

```php
/**
 * 012-help-center — FR-003's tiebreak rule: when a Client-role user holds
 * more than one approved membership across projects, the guide shown is
 * for their highest-access level, never their lowest. Priority order is
 * fixed: client_admin > client_contributor > client_viewer.
 */
public function highestClientRole(User $user): ?string
{
    if (!$user->isClient()) {
        return null;
    }

    $roles = ProjectMembership::query()
        ->where('user_id', $user->id)
        ->where('state', ProjectMembership::STATE_APPROVED)
        ->pluck('role');

    foreach ([ProjectMembership::ROLE_CLIENT_ADMIN, ProjectMembership::ROLE_CLIENT_CONTRIBUTOR, ProjectMembership::ROLE_CLIENT_VIEWER] as $tier) {
        if ($roles->contains($tier)) {
            return $tier;
        }
    }

    return null; // FR-004: no approved membership resolves — frontend defaults to Client Viewer guide.
}
```

No new relation is needed — this reuses `ProjectMembership`'s existing `user_id`/`state`/`role` columns exactly as `ProjectMembershipController` and `ProjectController::canManageClientAccess()` already query them elsewhere.

## Two response shapes need this field, not one

`useEffectiveUser()` (frontend) does not always read from the same backend payload. When no Preview session is active it returns the real signed-in user, sourced from `AuthController::curatedUser()`. When a Preview session **is** active, it returns the previewed `target` object instead, sourced from a completely different resource — `PreviewSessionResource` (backing `POST /api/preview-sessions`). Analysis of the existing code (`backend/app/Http/Resources/PreviewSessionResource.php`) confirmed `target` only carries `id`/`name`/`role`/`department` today. Both call sites MUST be enriched, or FR-006 silently fails the moment someone previews a Client-role user (Help Center would fall back to the Client Viewer guide regardless of the previewed user's real tier).

### `curatedUser()` payload — one new field

`AuthController::curatedUser()` (backing both `POST /api/login` and `GET /api/me`) gains one additional key:

| Field | Type | Present when | Meaning |
|---|---|---|---|
| `client_role` | `string \| null` | Always present in the response; non-null only for `role === 'Client'` users with at least one approved membership | The value `highestClientRole()` resolved for this user, per the tiebreak above. `null` for every non-Client role, and for a Client user with no approved membership (FR-004's default case). |

### `PreviewSessionResource`'s `target` — the same new field

`PreviewSessionResource::toArray()` (backing `POST /api/preview-sessions`) gains the identical key on its `target` object:

```php
'target' => [
    'id' => $this->target->id,
    'name' => $this->target->name,
    'role' => $this->target->role,
    'department' => $this->target->department,
    'client_role' => app(ProjectClientAccess::class)->highestClientRole($this->target), // new
],
```

Same field name, same type, same computation — `highestClientRole()` is called with the *previewed* user, not the real Admin. No other field on either payload changes shape.

## `User Guide` — conceptual entity, not a database record

| Guide | Resolves for |
|---|---|
| Admin Guide | `role === 'Admin'` |
| Project Manager Guide | `role === 'Project Manager'` |
| Department Head Guide | `role === 'Department Head'` |
| Team Member Guide | `role === 'Team Member'` |
| Client Viewer Guide | `role === 'Client'` and (`client_role === 'client_viewer'` or `client_role === null`) |
| Client Contributor Guide | `role === 'Client'` and `client_role === 'client_contributor'` |
| Client Admin Guide | `role === 'Client'` and `client_role === 'client_admin'` |

Resolution always uses the **effective** role/user (FR-006) — during an active Preview session, that's `useEffectiveUser()`'s previewed `target` (carrying `client_role` per the section above), not the real signed-in Admin's own role. Content itself lives as static files under `frontend/src/content/help-guides/` (see `research.md` Decision 1) — this table is the routing rule, not a stored record.
