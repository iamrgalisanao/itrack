# Quickstart: Validating the Real Authentication Cutover

## Prerequisites

- Backend running: `cd backend && php artisan serve` (http://localhost:8000)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- Database seeded: `cd backend && php artisan migrate --seed` (confirms the
  5 persona accounts from `DatabaseSeeder.php` exist)

## Persona accounts (all password `password`)

| Role | Email |
|---|---|
| Admin | `admin@itrack.test` |
| Project Manager | `pm@itrack.test` |
| Department Head (Finance) | `depthead@itrack.test` |
| Team Member | `team@itrack.test` |
| Client | `client@itrack.test` |

## Scenario 1 — Unauthenticated visitor is gated (FR-001, SC-001)

1. Clear cookies / open a private browser window.
2. Visit `http://localhost:5173/` (and separately `/reports`, `/admin`,
   `/kanban`).
3. **Expected**: every one of them shows the login screen, not workspace
   content.

## Scenario 2 — Sign in produces real identity (FR-002, FR-003, SC-003)

1. From the login screen, sign in as `client@itrack.test`.
2. **Expected**: lands in the workspace; sidebar does not show Kanban Board
   or Admin Panel; no role/department dropdown is present anywhere.
3. Repeat for each of the other 4 personas; confirm nav and guarded routes
   match what the old mock switcher produced for that same role/department
   (Admin sees Admin Panel; Department Head sees Finance-scoped data; etc.).

## Scenario 3 — No self-escalation (FR-004, SC-002)

1. While signed in as any non-Admin persona, inspect the full UI (sidebar,
   mobile drawer, any settings surface).
2. **Expected**: no control anywhere lets the current user change their own
   role or department.

## Scenario 4 — Sign out ends access (FR-005, SC-004)

1. While signed in, trigger sign-out.
2. **Expected**: returned to login screen.
3. Attempt to navigate directly to a previously visited protected URL (e.g.
   paste `/reports` into the address bar).
4. **Expected**: redirected to login, not shown cached/stale content.

## Scenario 5 — Deep link redirect after login (edge case)

1. While signed out, navigate directly to a protected deep URL (e.g.
   `/reports`).
2. Sign in.
3. **Expected**: landed on `/reports`, not redirected to `/` regardless of
   original destination.

## Scenario 6 — Session expiry handled gracefully (FR-007)

1. Sign in, then invalidate the session server-side (e.g.
   `php artisan tinker` → `DB::table('sessions')->truncate();` in the local
   dev DB, or wait out session lifetime).
2. Trigger any data-fetching action in the UI (navigate to another page).
3. **Expected**: redirected to login rather than shown an error screen or
   stale data.

## Regression check

- Run backend tests: `cd backend && php artisan test` — `RoleAccessTest` and
  `AuthenticationTest` must still pass unmodified (SC-005).
