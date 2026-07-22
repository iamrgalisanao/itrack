# Implementation Plan: Real Authentication Cutover

**Branch**: `001-real-auth-cutover` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-real-auth-cutover/spec.md`

## Summary

Retire the client-side mock role-switcher (`localStorage` + sidebar dropdown
in `App.jsx`) and make the already-built Sanctum session auth
(`AuthController`, `AuthContext`, `RequireAuth`, `Login.jsx`) the sole source
of the current user's identity. This is an integration + deletion effort, not
new infrastructure: every backend piece (login/me/logout endpoints, `User`
role model, fail-closed RBAC) and most frontend pieces (`AuthContext`,
`RequireAuth`, `Login.jsx`, `lib/auth.js`) already exist but are not wired
into `App.jsx`. The work is (1) mount `AuthProvider` and gate all routes with
`RequireAuth`, (2) add the `/login` route, (3) replace every read of the mock
`UserContext` (`userRole`, `userDept`) with the real `useAuth().user`, (4)
delete the mock switcher UI and its localStorage persistence, (5) handle
401-as-logout globally in the API client, (6) preserve intended-destination
redirect after login.

## Technical Context

**Language/Version**: PHP 8.4 (backend, unchanged) / JavaScript (ES2022+),
React 19 (frontend)

**Primary Dependencies**: Laravel 13 + Laravel Sanctum 4 (backend, already in
place); React Router v7, Axios (frontend, already in place) — no new
dependencies required

**Storage**: MySQL via existing `users` table (`role`, `department` columns
already present) — no schema change

**Testing**: PHPUnit Feature tests (`backend/tests/Feature`) for anything
backend-adjacent (none expected — backend auth is unchanged); manual
browser verification per persona account for the frontend cutover, per this
project's existing UI-testing practice (no frontend test runner is
configured in this repo today)

**Target Platform**: Existing web app — Laravel API served at
`localhost:8000`, Vite dev server at `localhost:5173` in development

**Project Type**: Web application (backend/ + frontend/, existing structure)

**Performance Goals**: N/A — no performance-sensitive path is touched;
sign-in adds one `/api/me` round trip already present in `AuthContext`

**Constraints**: Must not change backend auth behavior or API contracts
(`/api/login`, `/api/me`, `/api/logout` stay as-is per spec Assumptions);
must not regress any existing role-gated behavior for any of the 5 personas

**Scale/Scope**: Single SPA (`frontend/src/App.jsx` and its route tree),
~9 pages, 2 guard components (`KanbanGuard`, `AdminGuard`), 2 nav-rendering
surfaces (desktop `Sidebar`, mobile `MobileBar`/drawer). No backend changes
anticipated.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Fail-Closed Access Control | Yes | This feature's entire point is to stop the frontend from being able to self-select a role. `RequireAuth` + reading `user.role` from `/api/me` naturally fail closed (no `user` → redirected to login). `AdminGuard` is kept as-is (already fail-closed by construction). `KanbanGuard`, however, is **not** just re-pointed — `/speckit-analyze` caught that its existing deny-list check (`role === 'Client'` → block) fails open for a null/unrecognized role, which the `users.role` column explicitly allows. It is corrected to an allow-list check (grant only for recognized internal roles) as part of this feature, per tasks.md T013. **PASS** (post-correction). |
| II. Consistent API Contracts | Yes | No API changes. `AuthController::curatedUser()` already returns a curated shape; frontend consumes it as-is. **PASS**. |
| III. Test Coverage Grows With the Feature | Yes | Backend is unchanged, so no new backend test surface is created by this feature. Frontend has no test runner in this repo currently — verification is manual, once per persona account, as called out in Technical Context. This is a documented gap, not a silent skip: `tasks.md` will include a manual verification task per persona as the substitute for automated coverage. **PASS with documented alternative**. |
| IV. Audit Sensitive Mutations | Yes | Login/logout are already the audited surface via Sanctum's session lifecycle; no new sensitive mutation is introduced by this feature (no role/permission changes happen here). **PASS**. |
| V. Small, Additive, Reversible Migrations | No | No migration in this feature — `role`/`department` columns already exist on `users`. **N/A**. |
| VI. Real Auth Is the Only Forward Path | Yes | This feature *is* the principle being executed. **PASS** (this feature is what makes the principle true going forward). |

No violations. Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: Design artifacts (data-model.md, contracts/,
quickstart.md) introduce no new entities, migrations, or role-check logic —
they formalize reuse of existing backend contracts and correct two latent
bugs in dormant frontend code (`fetchMe()` hitting the wrong endpoint path,
and `AuthContext` not unwrapping the `{ user: {...} }` response shape). Gate
re-evaluation: **PASS**, unchanged from pre-design.

## Project Structure

### Documentation (this feature)

```text
specs/001-real-auth-cutover/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
# Option 2: Web application (frontend/ + backend/, matches existing repo layout)

backend/
├── app/Http/Controllers/AuthController.php   # existing, unchanged
├── app/Models/User.php                       # existing, unchanged
├── app/Traits/HasRole.php                    # existing, unchanged
└── routes/api.php                            # existing /login, /me, /logout — unchanged

frontend/
├── src/
│   ├── context/AuthContext.jsx     # existing — becomes the single identity source
│   ├── components/RequireAuth.jsx  # existing — mounted around all protected routes
│   ├── pages/Login.jsx             # existing — wired to a new /login route
│   ├── lib/auth.js                 # existing — login/me/logout API calls
│   ├── lib/api.js                  # modified — add global 401 handling
│   └── App.jsx                     # modified — remove UserProvider/mock switcher,
│                                    # mount AuthProvider, add /login route,
│                                    # wrap all routes in RequireAuth, read
│                                    # useAuth().user in Sidebar/MobileBar/guards
└── tests/                          # none exist yet; no test infra added by this feature
```

**Structure Decision**: No new directories. This feature is entirely a
rewiring of existing `frontend/src` files plus deletion of the mock
role-switcher code path in `App.jsx`. Backend is read-only for this feature.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
