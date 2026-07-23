# Contract: User Management API (new endpoints) + global disabled-account gate (affects every existing endpoint)

Source of truth once implemented: `backend/routes/api.php`,
`backend/app/Http/Controllers/UserManagementController.php` (new),
`backend/app/Http/Controllers/AuthController.php` (modified —
`login()` only), `backend/app/Http/Middleware/EnsureUserIsActive.php` (new),
`backend/bootstrap/app.php` (modified — registers and applies the
middleware), `backend/app/Http/Resources/UserResource.php` (new).

## Global: disabled-account gate

**This is not a new endpoint — it changes the contract of every existing
authenticated endpoint**, including ones this feature never touches
directly (`/api/me`, `/api/projects`, etc.). Applied as middleware
alongside `auth:sanctum` on the entire existing authenticated route group.

- A request whose session belongs to a user with `is_active = false`
  receives **`401`** (not 403) instead of reaching the controller action —
  including `/api/me`. This intentionally reuses
  `frontend/src/lib/api.js`'s existing response interceptor (its own
  comment already names "disabled account" as a reason it exists): any 401
  from any request clears the signed-in user client-side and `RequireAuth`
  redirects to `/login`, exactly as it already does for an expired
  session. No new frontend error handling is needed (research.md) —
  including for `POST /api/logout` itself, which is not exempted from this
  gate: if a disabled user's client calls it, the resulting 401 is caught
  by the same interceptor and clears local state regardless of whether the
  server-side session row was formally invalidated, which is moot anyway
  since every subsequent request against it hits this same gate.
- `POST /api/login` for a disabled account fails with the same generic
  `422` "The provided credentials are incorrect." every wrong-password
  attempt already gets (research.md) — never a distinct message.

## `GET /api/users`

- **Auth**: `auth:sanctum` + Admin-only (`isAdmin()`), fail-closed —
  403 for every other role, 401 unauthenticated.
- **Query params**: `search` (matches name or email, optional), `role`
  (optional, one of `User::validRoles()`), `department` (optional),
  `status` (optional: `active` or `disabled`), `page`/`per_page`
  (standard Laravel pagination; `per_page` capped at `max:100` — never an
  unbounded result set usable as a data-export path).
- **Success (200)**: Laravel's standard paginated envelope, `data` being
  `UserResource::collection(...)`.

## `POST /api/users`

- **Auth**: Same as above.
- **Body**: `name`, `email`, `password`, `password_confirmation`, `role`,
  `department` (required for Team Member/Department Head/Client, per
  data-model.md's validation table).
- **Success (201)**: `UserResource`. Audit: `user.created`.
- **Failure (422)**: validation errors (duplicate email, missing
  department for a role that requires one, weak/mismatched password,
  invalid role).

## `PATCH /api/users/{id}`

- **Auth**: Same as above.
- **Body**: any of `name`, `email`, `role`, `department` (all optional,
  `sometimes` validated). **Never** accepts `is_active` or `password` here
  (research.md) — those go through their own dedicated actions below.
- **Last-Admin guard**: if this edit would set `role != 'Admin'` on the
  target and `wouldLeaveNoEnabledAdmins(target, changes)` is true (see
  data-model.md), reject with `422 { "message": "At least one enabled Admin must remain." }`
  — regardless of whether the acting Admin is editing themselves or
  someone else. This check-then-write MUST run inside a locked transaction
  (`lockForUpdate()` on the enabled-Admin rows, data-model.md) so two
  concurrent edits can never both pass the count check before either
  commits.
- **Success (200)**: `UserResource`. Audit: `user.updated` with only the
  changed fields' old/new values in `metadata`.
- **Failure (422)**: validation errors, or the last-Admin guard above.

## `POST /api/users/{id}/disable`

- **Auth**: Same as above.
- **Last-Admin guard**: same check as above (same locked-transaction
  requirement), applied for `is_active = false` instead of a role change —
  reject with `422` if this would leave zero enabled Admins.
- **Success (200)**: `UserResource` with `is_active: false`. Audit:
  `user.disabled`.
- **Effect**: the target user's very next request (any endpoint, including
  one made with an already-open session) is denied by the global gate
  above — not merely blocked from a future login.

## `POST /api/users/{id}/reactivate`

- **Auth**: Same as above.
- **Success (200)**: `UserResource` with `is_active: true`. Audit:
  `user.reactivated`.

## `POST /api/users/{id}/reset-password`

- **Auth**: Same as above.
- **Body**: `password`, `password_confirmation` (`required|string|min:8|confirmed`).
- **Success (200)**: `{ "message": "Password reset." }` — never echoes the
  new password back, even though the Admin themselves just typed it.
- **Audit**: `user.password_reset`, `metadata` contains no password value
  (data-model.md).

## Frontend call sites

`frontend/src/lib/api.js` gains `fetchUsers(params)`, `createUser(data)`,
`updateUser(id, data)`, `disableUser(id)`, `reactivateUser(id)`,
`resetUserPassword(id, data)` — all called from `Admin.jsx`'s new "Users"
tab, following the same fetch/toast/error-handling pattern already used by
that page's existing Members/Grants tabs.
