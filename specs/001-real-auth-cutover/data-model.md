# Phase 1 Data Model: Real Authentication Cutover

No database schema changes. This feature consumes the existing `User` entity
and the existing session mechanism; the only "model" this feature adds is a
frontend-side shape for how identity is held in memory.

## User (existing — `backend/app/Models/User.php`)

| Field | Type | Notes |
|---|---|---|
| `id` | integer | unchanged |
| `name` | string | unchanged |
| `email` | string | unique, used as login identifier |
| `password` | string (hashed) | never leaves the backend — `curatedUser()` excludes it |
| `role` | string | one of `User::validRoles()`: Admin, Project Manager, Department Head, Team Member, Client |
| `department` | string\|null | null for Client role; populated for internal roles |

No fields are added, removed, or reinterpreted by this feature.

## Session (existing — Sanctum, cookie-based)

Established by `POST /api/login`, validated on every subsequent request via
the `auth:sanctum` middleware, ended by `POST /api/logout`. This feature
does not change how sessions are created or invalidated — it changes which
frontend state is *sourced from* that session.

## Frontend Auth State (new usage, not a new entity — `AuthContext`)

The shape already returned by `/api/me` and `/api/login` and already typed
implicitly by `AuthContext`:

```text
user: {
  id: number
  name: string
  email: string
  role: 'Admin' | 'Project Manager' | 'Department Head' | 'Team Member' | 'Client'
  department: string | null
} | null

loading: boolean   // true only during the initial /api/me hydration on mount
```

**State transitions**:

- `loading=true, user=null` → app mount, before `/api/me` resolves.
- `loading=false, user=null` → unauthenticated; `RequireAuth` redirects to
  `/login`.
- `loading=false, user={...}` → authenticated; `user.role` /
  `user.department` are the only source of truth for every access decision
  downstream (`Sidebar`, `MobileBar`, `KanbanGuard`, `AdminGuard`,
  department-scoped views).
- Any `user={...}` → `user=null` transition (explicit logout, or a global
  401 interceptor firing) MUST result in `RequireAuth` redirecting to
  `/login` on the next render — this is the mechanism satisfying spec FR-005
  and FR-007.

## Removed: mock `UserContext` state

`userRole` (string, freely settable) and `userDept` (string, freely
settable), both persisted to `localStorage` today, are deleted as part of
this feature — not migrated, not aliased. See [research.md](./research.md)
for why no compatibility shim is kept.
