# Phase 0 Research: Real Authentication Cutover

No unresolved `NEEDS CLARIFICATION` markers exist in the Technical Context —
every unknown was answered by inspecting the existing codebase rather than
requiring new research, since this feature reuses already-built
infrastructure end to end. Findings below are the decisions that came out of
that inspection.

## Decision: Reuse existing `AuthContext` / `RequireAuth` / `Login.jsx` as-is

**Rationale**: All three already implement the required behavior —
`AuthContext` hydrates from `GET /api/me` on mount and exposes
`login`/`logout`; `RequireAuth` redirects to `/login` when `user` is null;
`Login.jsx` exists as a page component. They are simply never mounted in
`App.jsx` today.

**Alternatives considered**: Writing new auth-state plumbing from scratch —
rejected, since it would duplicate working code and violate the constitution's
implicit preference for minimal, additive change over rewrites.

## Decision: Replace `UserContext` reads with `useAuth().user`, don't merge the two contexts

**Rationale**: `UserContext` (`userRole`, `userDept`, backed by
`localStorage`) is purely the mock system being retired. Rather than
teaching `UserContext` to proxy `AuthContext`, every consumer
(`Sidebar`, `MobileBar`, `KanbanGuard`, `AdminGuard`, `ProgressSnapshot` if it
ever needs identity) is repointed directly at `useAuth()`. This avoids a
lingering indirection layer that would need to be removed in a follow-up
anyway.

**Alternatives considered**: Keep `UserContext` as a thin wrapper around
`AuthContext` for backward compatibility with existing component code —
rejected; it just delays full removal of the mock naming/shape
(`userRole`/`userDept` as raw strings vs. `user.role`/`user.department` on a
curated object) and adds a layer with no remaining purpose.

## Decision: Handle session expiry (401) centrally in `lib/api.js`, not per-page

**Rationale**: `lib/api.js` already centralizes the Axios instance every page
uses. Adding a response interceptor that clears `AuthContext`'s user state
and redirects to `/login` on any `401` satisfies FR-007 in one place instead
of requiring every page's data-fetch `catch` block to handle it.

**Alternatives considered**: Per-component 401 handling — rejected as
repetitive and easy to miss on a new page in the future (would silently
violate FR-007 for that page).

## Decision: No backend changes

**Rationale**: `AuthController` already returns a curated, safe user payload
and enforces `auth:sanctum` on every protected route; nothing in the spec
requires new backend behavior. Confirmed by reading
`backend/routes/api.php` and `backend/app/Http/Controllers/AuthController.php`
in full.

**Alternatives considered**: N/A — spec Assumptions explicitly scope backend
auth endpoints as already correct and out of scope for change.

**Output**: All Technical Context unknowns resolved; no `NEEDS
CLARIFICATION` markers remain. Proceeding to Phase 1.
