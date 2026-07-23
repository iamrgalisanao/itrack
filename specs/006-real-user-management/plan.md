# Implementation Plan: Real User Management

**Branch**: `006-real-user-management` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-real-user-management/spec.md`

## Summary

Add Admin-only CRUD for real `User` accounts (create, edit, disable/
reactivate, password reset) to the existing Admin Control Center (a new
"Users" tab alongside its existing Members/Grants/Logs tabs), backed by one
new, additive `is_active` column and a **global authenticated-request
gate** — not just a login-time check — so a disabled account loses access
on its very next request even if its session cookie is still technically
valid (FR-005/SC-002). A single "last enabled Admin" invariant guard
(FR-007/SC-005) blocks any update — self-directed or not — that would
leave the system with zero active Admins. Reuses this app's existing
curated-response, audit-logging, and role-constant conventions throughout;
introduces no new access-control concept, no email infrastructure, and no
change to the existing five system roles.

## Technical Context

**Language/Version**: PHP 8.4 (Laravel 13, unchanged) / JavaScript
(ES2022+), React 19 (unchanged) — same stack as 001-005.

**Primary Dependencies**: None new. Reuses `User::validRoles()`/the
`HasRole` trait's predicates (never a handwritten role-string list in a
second place), `AuditLogger::record()` (new `user.*` actions, extending its
existing docblock's action list), `Project::scopeAccessibleTo` (unaffected,
but immediately reflects any role/department edit this feature makes since
it reads the same columns), and Laravel's own `Hash::make()` + the
`confirmed` validation rule (already implicitly available, no new package)
for password handling.

**Storage**: MySQL. **One small, additive migration** — `is_active`
boolean on `users`, `default(true)`, so every existing seeded/factory user
is active with no backfill migration needed. No other schema change.

**Testing**: PHPUnit Feature tests covering: (1) the full CRUD surface,
Admin-only (403 for every other role, 401 unauthenticated); (2) email
uniqueness on create/edit; (3) role/department validation (department
required for Team Member/Department Head/Client, optional for Admin/
Project Manager); (4) a role/department edit takes effect on the very next
request with no re-login (verified by asserting a *second, separate*
request under the edited user's existing session sees the new access
scope); (5) **the disabled-account global gate** — a disabled user's very
next request (both a fresh login attempt and an existing session's next API
call to an arbitrary authenticated endpoint, not just user-management ones)
is denied; reactivation restores it; (6) **the last-enabled-Admin
invariant**, tested directly and generally, not just as self-protection: a
single remaining active Admin cannot be demoted by anyone (including
themselves), cannot be disabled by anyone (including themselves), no
sequence of edits can reduce active Admins to zero, and — as close to a
genuine concurrency test as PHPUnit's synchronous test runner allows —
that the guard's query is wrapped in a locked transaction (asserted by
inspecting the implementation/query log for `lockForUpdate`, since two
truly concurrent HTTP requests can't be simulated in a single-process test
run); (7) password reset changes the usable password and never appears in
audit metadata; (8) every action produces the correct `user.*` audit log
entry with non-sensitive before/after values; (9) `per_page` above the cap
is clamped/rejected, never returning an unbounded result set. Frontend:
manual verification via quickstart.md (no test runner in this repo,
unchanged from 001-005).

**Target Platform**: Same dev/prod web app as prior features — Laravel API
at `localhost:8000`, Vite dev server at `localhost:5173`.

**Project Type**: Web application (backend/ + frontend/, existing structure)

**Performance Goals**: N/A at this app's current scale — matches every
prior feature's own assessment; a paginated user list is the only
scale-sensitive part (FR-010), using Laravel's standard offset pagination,
no new infrastructure.

**Constraints**: Per FR-005, disabled-account enforcement MUST be a
**global** authenticated-request gate applied to the entire existing
`auth:sanctum` route group (including `/api/me` — a disabled user's session
must not keep hydrating the SPA) — not an isolated check inside
`AuthController::login()` alone, which would leave every other endpoint
reachable by an already-issued session cookie. The gate returns **401**,
not 403 — this app's frontend already has a response interceptor
(`frontend/src/lib/api.js`) whose own comment names "disabled account" as
one of the reasons it exists: any 401 from any request clears the
signed-in user client-side and `RequireAuth` redirects to `/login`. Reusing
401 means this feature needs **zero new frontend error-handling code** —
the existing mechanism already does exactly what's needed. Per
FR-007/SC-005, the last-enabled-Admin guard MUST be a single, general check
applied to every path that could set `role != Admin` or `is_active = false`
on a currently-active Admin — not merely a check that the acting Admin
isn't editing their own row, since two Admins could otherwise demote/
disable each other down to zero — **and** that check-then-act sequence
MUST run inside a database transaction with the relevant enabled-Admin
rows locked (`lockForUpdate()`), so two concurrent requests can never both
read "still ≥ 1 other enabled Admin" and both proceed (data-model.md).
Per FR-008, a reset/created password is validated
(`required|string|min:8|confirmed`) and never appears in any audit log
`metadata` value. Per FR-010, the user list's `per_page` parameter MUST be
capped (e.g. `max:100`) so it cannot become an unbounded export path.

**Scale/Scope**: 1 new migration (`is_active` on `users`), 1 modified
model (`User` — fillable/casts/self-lockout helper), 1 new middleware
(`EnsureUserIsActive`, applied to the whole existing `auth:sanctum` group),
1 new controller (`UserManagementController`), 1 new API Resource
(`UserResource`), 1 new frontend "Users" tab inside the existing
`Admin.jsx` (no new page/route), 1 new `lib/api.js` client section, new
PHPUnit Feature tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Fail-Closed Access Control | Yes | Every user-management endpoint reuses `isAdmin()` — never a new ad-hoc check. The disabled-account gate is itself a fail-closed control: absence of `is_active` (impossible given the migration's `default(true)`, but defensively) or `is_active === false` denies, never defaults to allow. **PASS**. |
| II. Consistent API Contracts | Yes | New `UserResource` — never a raw `User` model/array, never exposes `password`/`remember_token` (already hidden via the model's `#[Hidden]` attribute, but the Resource is the enforced contract regardless of that). **PASS**. |
| III. Test Coverage Grows With the Feature | Yes | New Admin-only endpoints, a new global middleware, and a new invariant guard — all three are exactly the kind of surface this principle targets. Full role matrix + the two hardest cases (disabled-session enforcement, last-Admin invariant) required in tasks.md. **PASS**. |
| IV. Audit Sensitive Mutations | Yes | This is the principle's core scenario — role/permission changes. Every action (`user.created`, `user.updated`, `user.disabled`, `user.reactivated`, `user.password_reset`) audit logged via the existing `AuditLogger::record()`, extending its docblock's action list (matching the existing `member.*`/`department_grant.*` precedent). **PASS**. |
| V. Small, Additive, Reversible Migrations | Yes | One boolean column, `default(true)` — no backfill, no data loss on rollback. **PASS**. |
| VI. Real Auth Is the Only Forward Path | Yes | This feature is the direct continuation of 001-real-auth-cutover — it's the reason that cutover was necessary in the first place (`docs/prd_v2.md`'s own framing). Reads/writes via Sanctum-authenticated `$request->user()`, no mock-role dependency anywhere. **PASS**. |

No unjustified violations. Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: Design artifacts (data-model.md, contracts/,
quickstart.md) confirm the architecture above — one column, one new
middleware applied globally (not per-controller), one new controller/
Resource, and the last-Admin invariant expressed as a single reusable guard
rather than duplicated per-action logic. Gate re-evaluation: **PASS**,
unchanged from pre-design.

## Project Structure

### Documentation (this feature)

```text
specs/006-real-user-management/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
# Option 2: Web application (frontend/ + backend/, matches existing repo layout)

backend/
├── database/migrations/
│   └── xxxx_xx_xx_add_is_active_to_users_table.php  # new — boolean,
│                                                       #   default(true)
├── app/Models/
│   └── User.php                      # modified — is_active fillable/cast;
│                                       #   new isLastEnabledAdmin()-style
│                                       #   helper backing the invariant guard
├── app/Http/Middleware/
│   └── EnsureUserIsActive.php        # new — applied to the whole
│                                       #   auth:sanctum group (bootstrap/app.php),
│                                       #   not just login or user-management routes
├── app/Http/Controllers/
│   ├── AuthController.php            # modified — login's Auth::attempt()
│   │                                   #   credentials include is_active,
│   │                                   #   so a disabled account gets the
│   │                                   #   same generic "incorrect
│   │                                   #   credentials" response as a wrong
│   │                                   #   password (never a distinct
│   │                                   #   "your account is disabled"
│   │                                   #   message that would leak
│   │                                   #   account existence)
│   └── UserManagementController.php  # new — index/store/update/
│                                       #   disable/reactivate/resetPassword
├── app/Http/Resources/
│   └── UserResource.php              # new — id/name/email/role/department/
│                                       #   is_active/timestamps only
└── routes/api.php                    # modified — add
                                       #   GET/POST/PATCH /api/users,
                                       #   POST /api/users/{id}/disable,
                                       #   POST /api/users/{id}/reactivate,
                                       #   POST /api/users/{id}/reset-password

backend/bootstrap/app.php             # modified — register the 'active'
                                       #   middleware alias and apply it
                                       #   alongside auth:sanctum on the
                                       #   existing authenticated route group

frontend/
├── src/
│   ├── pages/
│   │   └── Admin.jsx                 # modified — new "Users" tab (4th tab
│   │                                 #   alongside Members/Grants/Logs),
│   │                                 #   reusing that page's existing
│   │                                 #   Tabs/Table/Card conventions
│   └── lib/
│       └── api.js                    # modified — fetchUsers/createUser/
│                                       #   updateUser/disableUser/
│                                       #   reactivateUser/resetUserPassword

backend/tests/Feature/
└── UserManagementTest.php            # new — full role matrix, email
                                       #   uniqueness, role/department
                                       #   validation, immediate-effect
                                       #   edits, the global disabled-
                                       #   account gate (login + arbitrary
                                       #   authenticated endpoint), the
                                       #   last-enabled-Admin invariant
                                       #   (direct + general, not just
                                       #   self-protection), password reset,
                                       #   and audit log correctness
```

**Structure Decision**: One new controller (`UserManagementController`),
not folded into `AuthController` — `AuthController` owns the acting user's
own session lifecycle (login/me/logout), while this feature manages *other*
users' accounts, an Admin-only concern with a different shape (CRUD +
list + pagination). The disabled-account check is deliberately a
**middleware applied to the shared route group**, not a per-controller
check, so it protects every existing and future authenticated endpoint
uniformly — the one piece of this feature that must not be scoped
narrowly. No new frontend page — the existing Admin Control Center's
tabbed structure is extended, matching how that page already groups every
other admin-only tool.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
