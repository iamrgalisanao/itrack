# Quickstart: Validating Real User Management

## Prerequisites

- Backend running: `cd backend && php artisan serve` (http://localhost:8000)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- **Migration required**: `cd backend && php artisan migrate` (adds
  `is_active` to `users`, `default(true)` — every existing seeded account
  remains active with no extra step).
- Signed in as `pm@itrack.test`'s Admin equivalent — use whichever seeded
  Admin persona account exists (all password `password`).

## Scenario 1 — Admin creates a user, who can immediately sign in (US1, FR-002)

1. Sign in as an Admin, open the Admin Control Center's new "Users" tab.
2. Create a user: name, a fresh email, a password, role `Team Member`,
   department `IT`.
3. **Expected**: the new user appears in the list.
4. Sign out, sign in as the new user with the password just set.
5. **Expected**: login succeeds; the signed-in user's role/department match
   what the Admin set.

## Scenario 2 — Duplicate email is rejected (US1, FR-003)

1. As Admin, attempt to create a second user with an email already in use.
2. **Expected**: rejected with a clear validation error; no second account
   is created.

## Scenario 3 — Role/department edit takes effect on the very next request, no re-login (US2, FR-004)

1. Sign in as a Team Member in the IT department in one browser session.
2. Confirm via Reports/Dashboard that only IT-department projects are
   visible.
3. In a separate Admin session, edit that user's department to Finance.
4. Back in the Team Member's original, still-open session, reload Reports/
   Dashboard (same session, no re-login).
5. **Expected**: Finance-department projects are now visible, IT ones are
   not — the change took effect without the user needing to sign out and
   back in.

## Scenario 4 — Disabling blocks both login and an already-open session (US3, FR-005, SC-002)

1. Sign in as a Team Member in one browser session; confirm they can load
   the Dashboard normally.
2. In a separate Admin session, disable that user's account.
3. Back in the Team Member's still-open session, reload the Dashboard
   (same session cookie, no new login).
4. **Expected**: denied (401) — and, in the browser, this isn't just a raw
   error: the app's existing "session ended" handling (the same mechanism
   that already fires for an expired session) clears the signed-in state
   and redirects to `/login` automatically. The existing session stops
   working immediately, not just future login attempts, and the user is
   never left staring at a stuck/broken screen.
5. Attempt to log in fresh as that same disabled user.
6. **Expected**: the same generic "incorrect credentials" error a
   wrong-password attempt would get — not a distinct "your account is
   disabled" message.
7. As Admin, reactivate the account.
8. **Expected**: the user can sign in normally again.

## Scenario 5 — An Admin can never leave the system with zero enabled Admins (US2/US3, FR-007, SC-005)

1. Confirm there is exactly one enabled Admin account (or temporarily
   disable/demote all-but-one via `php artisan tinker` for this test).
2. As that one remaining Admin, attempt to change your own role away from
   Admin.
3. **Expected**: rejected.
4. As that same Admin, attempt to disable your own account.
5. **Expected**: rejected.
6. If a second Admin account exists, have it attempt to disable or demote
   the *other* (also-sole-remaining-enabled) Admin.
7. **Expected**: rejected the same way — this isn't just a
   can't-edit-yourself check, it's a general "don't zero out enabled
   Admins" rule (data-model.md's `wouldLeaveNoEnabledAdmins`).

## Scenario 6 — Password reset changes the usable password, never logs it (US4, FR-008)

1. As Admin, reset a user's password to a new value.
2. Sign in as that user with the new password.
3. **Expected**: succeeds; the old password no longer works.
4. Check the Admin Control Center's Logs tab (existing `AuditLog` viewer).
5. **Expected**: a `user.password_reset` entry exists identifying the
   acting Admin and the target user — the new password value itself is
   nowhere in the log entry.

## Regression check

- Run backend tests: `cd backend && php artisan test` — all existing tests
  plus the new `UserManagementTest` must pass, including a check that every
  pre-existing authenticated endpoint (not just this feature's own) still
  works normally for an active user, confirming the new global middleware
  is additive, not a behavior change for accounts that were never disabled.
- Manually confirm the existing Admin Control Center's Members, Grants, and
  Logs tabs are unchanged.
- Confirm `npm run build` and `npm run lint` remain clean.
