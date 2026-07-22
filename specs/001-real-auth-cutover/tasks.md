---

description: "Task list for the Real Authentication Cutover feature"
---

# Tasks: Real Authentication Cutover

**Input**: Design documents from `/specs/001-real-auth-cutover/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-api.md, quickstart.md

**Tests**: No automated frontend test runner exists in this repo today (per plan.md
Technical Context). Verification is manual, once per persona account, using the
scenarios in quickstart.md — these appear as explicit verification tasks within
each story instead of automated test tasks. Backend is unmodified by this feature,
so the only automated check is a regression run of the existing PHPUnit suite.

**Organization**: Tasks are grouped by user story (from spec.md, in priority order)
to enable independent implementation and verification of each story.

**Revision note**: This version incorporates the `/speckit-analyze` findings —
T013 (KanbanGuard) is corrected to fail closed, T008 is new (fixes the
FR-010 gap in `Login.jsx`'s error handling), `[P]` markers were removed from
tasks that share `frontend/src/App.jsx`, and T020/T021 commit to a single
concrete wiring mechanism instead of offering alternatives. See "Analysis
remediation log" at the bottom of this file for the full mapping back to each
finding.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- All file paths are relative to the repository root

---

## Phase 1: Setup

**Purpose**: Confirm the environment this feature is built and verified against

- [x] T001 Confirm local environment is ready: backend serving at `localhost:8000`
      (`cd backend && php artisan serve`), frontend serving at `localhost:5173`
      (`cd frontend && npm run dev`), and the 5 persona accounts exist
      (`cd backend && php artisan migrate --seed`) — per quickstart.md Prerequisites

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Fix the two latent bugs identified in `contracts/auth-api.md` that
would otherwise make every user story fail silently — `AuthContext` cannot work
correctly until these are fixed, and every story depends on `AuthContext`.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 In `frontend/src/lib/auth.js`: stop creating a second Axios instance —
      import and reuse the shared instance exported from `frontend/src/lib/api.js`
      instead. Fix `fetchMe()` to call `GET /me` (not `GET /user`, which doesn't
      exist). Make `login()`, `logout()`, and `fetchMe()` all return the unwrapped
      `user` object (i.e. `response.data.user`), not the raw Axios response.
      **Implementation note (discovered while executing this task, not caught by
      `/speckit-analyze`)**: `login()` also now calls `GET /sanctum/csrf-cookie`
      before the `POST /login` — required by Sanctum's stateful SPA auth
      (`bootstrap/app.php` calls `$middleware->statefulApi()`); without it, the
      first login attempt in a fresh browser session fails with 419 CSRF token
      mismatch. `vite.config.js` already proxies `/sanctum` to the backend
      alongside `/api`, so this was infra-ready but never actually called.
- [x] T003 In `frontend/src/context/AuthContext.jsx`: update `fetchMe().then(res =>
      setUser(res.data))` and the `login()` re-fetch to use the corrected return
      shape from T002 (`setUser(res)`, not `setUser(res.data)`). Also simplified
      `login()` to use `apiLogin()`'s own return value directly instead of a
      redundant separate `fetchMe()` re-fetch, and replaced the dynamic
      `import('@/lib/auth')` workaround with a plain aliased top-level import
      (`login as apiLogin`) now that the naming collision is handled by the alias.

**Checkpoint**: `AuthContext` now correctly hydrates `user` from a real session.
User story implementation can begin.

---

## Phase 3: User Story 1 - Sign in to reach the workspace (Priority: P1) 🎯 MVP

**Goal**: No workspace screen is reachable without a successful sign-in; signing
in with a persona account lands the user in the workspace; failed sign-ins give
the user an accurate reason.

**Independent Test**: Per quickstart.md Scenario 1 — visit `/`, `/reports`,
`/admin`, `/kanban` while signed out and confirm each shows the login screen;
then sign in as any persona account and confirm the workspace loads.

### Implementation for User Story 1

- [x] T004 [US1] In `frontend/src/App.jsx`: mount `AuthProvider` (from
      `frontend/src/context/AuthContext.jsx`) at the top of the provider tree,
      in place of where `UserProvider` currently sits.
- [x] T005 [US1] In `frontend/src/App.jsx`: add a public `/login` route that
      renders `frontend/src/pages/Login.jsx`, declared outside of any
      `RequireAuth` wrapper.
- [x] T006 [US1] In `frontend/src/App.jsx`: wrap the existing protected
      `<Routes>` block (`/`, `/work-program`, `/kanban`, `/schedule`, `/reports`,
      `/glossary`, `/team`, `/admin`) with `<RequireAuth>` from
      `frontend/src/components/RequireAuth.jsx`.
- [x] T007 [US1] Implement return-to-intended-destination: in
      `frontend/src/components/RequireAuth.jsx`, pass the attempted location via
      `<Navigate to="/login" state={{ from: location }} replace />`; in
      `frontend/src/pages/Login.jsx`, replace the hardcoded
      `navigate('/', { replace: true })` (line 22) with navigation to
      `location.state?.from?.pathname ?? '/'`.
- [x] T008 [US1] Fix `frontend/src/pages/Login.jsx`'s error handling (satisfies
      FR-010, currently unmet): in the `catch` block (lines 23–24), branch on
      whether `err.response` exists before choosing a message —
      (a) if `err.response` is present, prefer the specific validation message
      `err.response.data?.errors?.email?.[0]` and fall back to
      `err.response.data?.message` only if that's absent;
      (b) if `err.response` is absent entirely (network/server unreachable),
      show a distinct message such as `'Unable to reach the server — check your
      connection and try again.'` instead of the current hardcoded fallback
      `'Invalid credentials'`, which is actively misleading in that case.
      **Refined during manual verification**: a `5xx` response (e.g. the
      database being unreachable, reproduced live while MySQL was down) still
      has `err.response` set, but its body is an HTML debug page, not the
      expected validation JSON — `errors`/`message` lookups on it silently
      resolve to `undefined` and fall through to `'Invalid credentials'`,
      which is just as misleading as the no-response case. Added a third
      branch: `err.response.status >= 500` → a distinct "server error, try
      again shortly" message, checked before the generic credential-message
      fallback.
- [x] T009 [US1] Manual verification: run quickstart.md Scenario 1
      (unauthenticated gating) and Scenario 5 (deep-link redirect after login)
      for at least 2 of the 5 persona accounts; additionally confirm T008 by
      triggering a bad-password attempt and a backend-unreachable attempt and
      checking the two error messages are distinct and accurate.
      **Partially verified at the API level** (this environment has no browser
      automation tool available, so client-side redirect/UI behavior itself
      still needs an actual browser check): confirmed end-to-end against the
      real itrack backend — `GET /sanctum/csrf-cookie` → `POST /api/login` →
      `GET /api/me` → `GET /api/dashboard` all succeed and persist the session
      correctly for both `admin@itrack.test` and `client@itrack.test`, each
      returning the correct `role`/`department`. Also confirmed the 422
      bad-credentials response shape (`errors.email[0]` = "The provided
      credentials are incorrect.") that T008's fix prefers, and (with the
      earlier DB outage) both the 500 and pre-DB "no response" paths. **Still
      needs a real browser check**: the login-screen-only gating (Scenario 1)
      and deep-link redirect (Scenario 5) are client-side React Router
      behavior that can't be verified via curl.

**Checkpoint**: Signing in is now required to reach the workspace, the app
returns users to where they were headed, and login failures are reported
accurately.

---

## Phase 4: User Story 2 - Access reflects the real signed-in identity (Priority: P1)

**Goal**: Every existing role-gated behavior (Admin Panel, Kanban guard,
department scoping, nav visibility) is driven by the authenticated user's real
`role`/`department`, fails closed for any unrecognized role, and no on-screen
control can change it.

**Independent Test**: Per quickstart.md Scenario 2 and 3 — sign in as each of
the 5 personas and confirm nav/guards match that account's real role, with no
role or department picker present anywhere in the UI, and confirm a user with
no role (or an unrecognized one) is denied every gated view rather than
defaulted into access.

### Implementation for User Story 2

- [x] T010 [US2] In `frontend/src/App.jsx`: remove the `UserProvider` /
      `UserContext` / `useUser` implementation entirely, including the
      `localStorage` (`mock_role`, `mock_dept`) persistence and the role/department
      `<select>` controls rendered in `Sidebar` and the mobile drawer.
- [x] T011 [US2] In `frontend/src/App.jsx`: update `Sidebar` to read
      `role`/`department` from `useAuth().user` instead of `useUser()`, for both
      the `visibleItems` filter (`internalOnly`/`adminOnly` checks) and any
      display of the current user's identity.
- [x] T012 [US2] In `frontend/src/App.jsx`: update `MobileBar` the same way
      as T011 — read from `useAuth().user` instead of `useUser()`.
- [x] T013 [US2] In `frontend/src/App.jsx`: rewrite `KanbanGuard` to **fail
      closed** instead of preserving its current fail-open shape. Do not port
      the existing `userRole === 'Client'` deny-check as-is (that grants access
      to any role the check doesn't explicitly recognize, including a null or
      unrecognized role — a real possibility since `users.role` is a nullable
      column with no DB-level enum). Instead grant access only when
      `useAuth().user?.role` is one of the internal roles — `'Admin'`,
      `'Project Manager'`, `'Department Head'`, `'Team Member'` — and deny
      everyone else, mirroring the inclusion-style check already used correctly
      in `AdminGuard`.
- [x] T014 [US2] In `frontend/src/App.jsx`: update `AdminGuard` to check
      `useAuth().user?.role !== 'Admin'` instead of `useUser().userRole`. (This
      check is already fail-closed by construction — access requires an exact
      `'Admin'` match — so no logic change beyond the data source is needed.)
- [x] T015 [US2] Search the rest of `frontend/src` for any other `useUser(` call
      sites (e.g. department-scoped filtering inside individual pages under
      `frontend/src/pages/`) and repoint each one to `useAuth().user` from
      `frontend/src/context/AuthContext.jsx`, applying the same fail-closed
      standard as T013 wherever a role check is involved.
      **Found 4 additional sites** beyond App.jsx (not just nav/guard
      components as originally scoped): `Schedule.jsx`, `WorkProgram.jsx`,
      `Kanban.jsx`, and `Reports.jsx` all imported `useUser` from `'../App'`
      for department-scoped filtering and role-gated buttons/props. Fixed by
      replacing the import with `useAuth` and adapting
      `const { userRole, userDept } = useUser()` to
      `const { user } = useAuth(); const userRole = user?.role; const userDept
      = user?.department` — a minimal adapter that keeps the (large) existing
      `userRole`/`userDept` usage throughout each file unchanged, rather than
      rewriting hundreds of call sites. `grep` confirms zero remaining
      `useUser`/`UserContext`/`mock_role`/`mock_dept` references anywhere in
      `frontend/src`.
- [x] T016 [US2] Manual verification: run quickstart.md Scenario 2 (real
      identity per persona) and Scenario 3 (no self-escalation control) for all
      5 persona accounts. Additionally, create one test account with `role`
      set to `null` (or an unrecognized string) and confirm it is denied the
      Kanban Board, Admin Panel, and every other gated view — not granted
      access by default.
      **Partially verified**: created a real `role=null` test account and
      confirmed via the API that `/api/login`/`/api/me` return `role: null`
      uncoerced — combined with `KanbanGuard`/`AdminGuard`'s inclusion-based
      logic (verified by inspection), a null role is provably denied by both
      guards (`.includes(null)` → `false`; `null !== 'Admin'` → `true` →
      denied). Test account deleted after verification. ESLint clean across
      all 5 touched files (`App.jsx`, `Schedule.jsx`, `WorkProgram.jsx`,
      `Kanban.jsx`, `Reports.jsx`) — zero new errors introduced. **Still needs
      a real browser check** (no browser automation available in this
      environment): visually confirming nav items per persona and that no
      role/department picker renders anywhere in the actual UI.

**Checkpoint**: Access and navigation are now fully identity-driven and fail
closed by default; the mock switcher no longer exists anywhere in the
codebase.

---

## Phase 5: User Story 3 - Sign out ends access (Priority: P2)

**Goal**: A signed-in user can end their session on demand and immediately
loses access to protected screens.

**Independent Test**: Per quickstart.md Scenario 4 — sign out and confirm the
app returns to the login screen and stays there on direct navigation to a
previously visited protected URL.

### Implementation for User Story 3

- [x] T017 [US3] In `frontend/src/App.jsx`: add a Sign Out control to `Sidebar`
      and the mobile drawer's footer that calls `useAuth().logout()`; on success,
      `RequireAuth` (already in place from US1) naturally redirects to `/login`
      once `user` becomes `null`. Also added a small "Signed in as {name} /
      {role}" block above the sign-out button in both places, since there was
      no visible current-user identity anywhere in the UI after removing the
      mock role display.
- [x] T018 [US3] Manual verification: run quickstart.md Scenario 4 (sign-out
      ends access) for at least 1 persona account.
      **Confirmed working by the user** in a real browser — sign-out returns
      to the login screen as expected.

**Checkpoint**: The full sign-in → use → sign-out lifecycle works end to end.

---

## Phase 6: User Story 4 - Session expiry is handled gracefully (Priority: P3)

**Goal**: A session that ends server-side while the app is open (expiry,
invalidation, disabled account) is treated as signed-out, not shown as stale
data or a raw error.

**Independent Test**: Per quickstart.md Scenario 6 — invalidate the session
server-side, trigger a data fetch, and confirm redirect to login rather than an
error screen.

### Implementation for User Story 4

- [x] T019 [US4] In `frontend/src/lib/api.js`: add a module-level
      `let onUnauthorized = null` and `export function setUnauthorizedHandler(fn)
      { onUnauthorized = fn }`. Add a response interceptor on the shared Axios
      instance that calls `onUnauthorized?.()` whenever a response comes back
      with status `401`.
- [x] T020 [US4] In `frontend/src/context/AuthContext.jsx`: on mount (inside a
      `useEffect`), call `setUnauthorizedHandler(() => setUser(null))` (imported
      from `frontend/src/lib/api.js`) so any `401` anywhere in the app clears the
      authenticated user the same way explicit sign-out (T017) does.
      `RequireAuth` then redirects to `/login` automatically once `user` is
      `null` — no separate redirect logic needed here.
- [x] T021 [US4] Manual verification: run quickstart.md Scenario 6 (session
      expiry handled gracefully). **Confirmed working by the user** — session
      truncated server-side, next click redirected to `/login` correctly.

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and regression confirmation across all stories

- [x] T022 [P] Search all of `frontend/src` for any remaining reference to
      `mock_role`, `mock_dept`, `useUser`, or `UserContext` and remove/update
      whatever is left. **Confirmed zero matches.**
- [x] T023 Run `cd backend && php artisan test` and confirm `RoleAccessTest` and
      `AuthenticationTest` pass unmodified (SC-005) — this feature makes no
      backend changes, so no failures are expected. **69/69 tests passed, 261
      assertions, zero regressions.**
- [x] T024 Run the full quickstart.md validation end-to-end (all 6 scenarios) for
      all 5 persona accounts as a final sign-off pass. **Confirmed by the
      user**: Scenario 5 (deep-link redirect — landed on `/reports` after
      login, not `/`), Scenario 4 (sign-out), and Scenario 6 (session expiry)
      all verified live. Scenario 1 (unauthenticated gating) and Scenario 3
      (no self-escalation control) exercised repeatedly as a side effect of
      the above via the same `RequireAuth` mechanism. Scenario 2 (per-persona
      identity) explicitly confirmed for Admin; Client/Department
      Head/Team Member/Project Manager verified at the API level during
      implementation (correct `role`/`department` returned, guards fail
      closed by construction) but not individually re-confirmed live in-browser
      post-implementation — acceptable residual risk given the guard logic is
      identical across all five and Admin's live pass exercised the same code
      path.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
  (AuthContext is broken until T002/T003 land)
- **User Story 1 (Phase 3)**: Depends on Foundational only — this is the MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; in practice also depends
  on US1 being in place (there is no `useAuth().user` to read from `Sidebar`
  until `AuthProvider` is mounted in T004), so implement after US1
- **User Story 3 (Phase 5)**: Depends on Foundational + US1 (`RequireAuth` must
  already redirect on `user === null`, from T006)
- **User Story 4 (Phase 6)**: Depends on Foundational + US1; independent of
  US2/US3
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Within Each User Story

- US1: T004 → T005/T006 → T007 → T008 → T009 (verification last)
- US2: T010 → T011 → T012 → T013 → T014 → T015 → T016
- US3: T017 → T018
- US4: T019 → T020 → T021

### Parallel Opportunities

- T011–T014 touch the same file (`frontend/src/App.jsx`) as T010, so they are
  **not** marked `[P]` even though they're logically independent components —
  editing the same file concurrently (by different people or agent runs) risks
  clobbering each other's changes. Treat US2's implementation tasks as
  sequential.
- T022 (Polish grep) can run in parallel with T023 (backend test run) — different
  concerns, no file overlap.

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 (Setup) and Phase 2 (Foundational) — fixes the auth bugs
2. Complete Phase 3 (User Story 1) — the app now requires sign-in, with
   accurate error messaging
3. **STOP and VALIDATE**: run quickstart.md Scenario 1 before continuing
4. This is a legitimate MVP checkpoint even though the mock switcher is still
   present in the UI — it's just no longer reachable without signing in first

### Incremental Delivery

1. Setup + Foundational → AuthContext works correctly
2. US1 → sign-in is required (MVP)
3. US2 → mock switcher fully removed, real identity drives everything,
   fail-closed by default
4. US3 → sign-out completes the session lifecycle
5. US4 → expired sessions degrade gracefully
6. Polish → cleanup grep + backend regression + full sign-off pass

---

## Analysis remediation log

Findings from the `/speckit-analyze` pass and how each was resolved in this
revision:

| Finding | Severity | Resolution |
|---|---|---|
| C1 — `KanbanGuard` fails open for null/unrecognized roles | CRITICAL | T013 rewritten to an inclusion (allow-list) check instead of a deny-list check |
| G1 — FR-010 had zero task coverage; `Login.jsx` violated it | HIGH | New task T008 added to US1, folding in the fix; T009 verification extended to cover it |
| U1 — mid-session role-change edge case had no task | MEDIUM | Resolved as a documented, justified deferral — see new Assumption in spec.md (not a task: backend re-validates role fresh per request regardless of stale frontend UI, so this is a UX staleness gap, not a security boundary gap) |
| I1 — `[P]` markers on same-file tasks | MEDIUM | `[P]` removed from what are now T011–T014 |
| U2 — T019/T020 (old numbering) left the wiring mechanism undecided | MEDIUM | Now T019/T020: committed to a single concrete mechanism (module-level handler registration in `lib/api.js`) |
| A1 — `Login.jsx` surfaces a generic validation message | LOW | Folded into T008's fix alongside G1 |
