# Contract: Project Ownership and PM-Scoped Administration

Source of truth once implemented: `backend/routes/api.php`, `backend/app/Http/Controllers/ProjectOwnershipController.php` (new), `backend/app/Http/Controllers/ProjectAssignmentController.php` (modified — `store()`/`destroy()` only), `backend/app/Models/{Project,ProjectOwnership}.php`.

## Global: `ProjectAssignmentController::store()`/`destroy()`'s contract change

**Not new endpoints — this changes the contract of two existing endpoints** (`POST /api/project-assignments`, `DELETE /api/project-assignments/{id}`) for Project Manager requesters specifically:

- A PM who owns the target project: **no change** — behaves exactly as it does today.
- A PM acting on a project that has **at least one owner assigned, but not them**: now **`403`**, body `{ "message": "You do not own this project." }` — new denial, this feature's core behavior change.
- A PM acting on a project that currently has **zero owners assigned**: **no change** — succeeds exactly as it did before this feature (FR-018, the deploy-day rollout safety net; every project starts here since there's no backfill).
- A PM who owns zero projects, acting on a project that has other owners: denied, same message as above.
- Admin: **no change whatsoever** — every existing Admin request against these two endpoints behaves byte-identically to before this feature (FR-008/SC-002).
- Any other role: **no change** — still the existing `403` "Unauthorized: Only Admins and Project Managers can manage project assignments."

`GET /api/project-assignments` (the list/read endpoint): **no change** — ownership does not restrict what a PM can view here, only what they can write (FR-009, research.md).

## `GET /api/project-ownerships`

- **Auth**: `auth:sanctum` + Admin-only (`isAdmin()`), fail-closed — 403 for every other role including Project Manager (research.md — ownership read access is not PM-shared, unlike project-assignments).
- **Query params**: `project_id` (optional filter), `user_id` (optional filter).
- **Success (200)**: `ProjectOwnershipResource::collection(...)`.

## `POST /api/project-ownerships`

- **Auth**: Same as above (Admin-only).
- **Body**: `user_id`, `project_id`.
- **Validation** (FR-005): `user_id` must reference an existing user who is `is_active = true` and whose role is Project Manager — otherwise `422`, message `{ "message": "Only active Project Manager accounts can own a project." }`. `project_id` must reference an existing project.
- **Idempotency**: if the pair already exists, returns the existing `ProjectOwnershipResource` with `200` and writes **no** audit entry (mirrors 007's `project_assignments` idempotency exactly). If new, returns `201`, writes `project_ownership.created`.

## `DELETE /api/project-ownerships/{id}`

- **Auth**: Same as above.
- **Success (204)**. Audit: `project_ownership.deleted`.
- **Effect**: the target PM's administrative authority over that project ends on their very next request (no re-login) — `scopeOwnedBy` is re-evaluated fresh every time, never cached, identical precedent to 007's `scopeAccessibleTo`.
- Removing the last remaining owner of a project is allowed and produces a valid ownerless project (FR-003) — not an error.

## `POST /api/project-ownerships/{id}/transfer`

- **Auth**: Same as above.
- **Body**: `new_owner_user_id`.
- **Validation**: `new_owner_user_id` must pass the same active-PM check as `POST /api/project-ownerships` (`422` otherwise); must not equal the ownership record's own current `user_id` (`422`, "Cannot transfer ownership to the current owner.").
- **Behavior**: one atomic transaction — the *first* statement inside it re-queries `{id}` with `lockForUpdate()` (never reusing the route-model-bound instance's fields, which were read before the lock and may already be stale); if that re-query comes back empty, abort with `409` before doing anything else. Only then is the existing ownership row removed and a new one created for `new_owner_user_id` on the same project, both-or-neither (data-model.md).
  - **Conflict (409)**: if the ownership row `{id}` no longer exists by the time the lock is acquired (already transferred or removed by a concurrent request), the transfer is aborted rather than proceeding on a stale read — body `{ "message": "This ownership record no longer exists — it may have already been transferred or removed." }`.
  - **Transfer to an existing co-owner**: if `new_owner_user_id` already owns this project, no duplicate row is created — the old owner's row is simply removed and the existing new-owner row is left untouched. Still returns `200` and writes one `project_ownership.transferred` entry (consolidation, not an error).
- **Success (200)**: the (possibly pre-existing) `ProjectOwnershipResource` for the new owner. Audit: **one** `project_ownership.transferred` entry (not separate created/deleted entries) with `{ project_id, from_user_id, to_user_id, from_ownership_id, to_ownership_id }` — `entity_id` is the surviving (new-owner) row's id, not the deleted row's, since the latter wouldn't remain navigable.
- **Effect**: the prior owner's administrative authority over that project ends, and the new owner's begins, on their respective very next requests — no re-login for either.

## Frontend call sites

`frontend/src/lib/api.js` gains `fetchProjectOwnerships(params)`, `createProjectOwnership(data)`, `deleteProjectOwnership(id)`, `transferProjectOwnership(id, newOwnerUserId)` — called from `Admin.jsx`'s new "Project Ownership" tab, following the same fetch/toast/error conventions the "Project Assignments" tab already established in 007.
