# Feature Specification: Real Authentication Cutover

**Feature Branch**: `001-real-auth-cutover`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Replace the mock localStorage role-switcher in App.jsx with the real Sanctum session-based authentication that already exists on the backend (AuthController, User roles) and partially on the frontend (AuthContext, RequireAuth, Login.jsx), so that the role and department driving navigation, RBAC guards, and API-scoped data is the actual logged-in user's identity instead of a client-side dropdown."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in to reach the workspace (Priority: P1)

Any of the five persona users (Admin, Project Manager, Department Head, Team
Member, Client) must sign in with real credentials before they can see any
project, task, or report data. Today the app opens directly into the
workspace with a role picked from a dropdown — there is no gate at all.

**Why this priority**: Without this, every other access control in the app
is cosmetic — a client-side dropdown, not a login. This is the prerequisite
for every other guard in the system to mean anything.

**Independent Test**: Open the app with no active session. Confirm the only
reachable screen is the login form, and that submitting valid credentials for
any of the five seeded persona accounts lands on the workspace with that
account's real role and department.

**Acceptance Scenarios**:

1. **Given** no active session, **When** a user opens any workspace URL
   (e.g. `/`, `/reports`, `/admin`), **Then** they are shown the login screen
   instead of workspace content.
2. **Given** a user submits correct email/password for a persona account,
   **When** authentication succeeds, **Then** they land in the workspace
   with navigation and data scoped to that account's actual role and
   department.
3. **Given** a user submits incorrect credentials, **When** they submit the
   login form, **Then** they see a clear error and remain on the login
   screen.

---

### User Story 2 - Access reflects the real signed-in identity (Priority: P1)

Once signed in, every role-gated behavior already built into iTrack (Admin
Panel visibility, Kanban Board internal-only restriction, department-scoped
data, client-visible field filtering, write-permission gating) is driven
entirely by the authenticated user's actual `role`/`department` — not by any
value a user can change from the UI.

**Why this priority**: This is the actual point of the cutover. If sign-in
works but the app still lets a signed-in user flip their own effective role
via a leftover control, nothing has been fixed.

**Independent Test**: Sign in as each of the five persona accounts in turn
and confirm navigation items, the Admin Panel guard, the Kanban Board guard,
and department-scoped data match that account's real role/department, with
no on-screen control able to change it.

**Acceptance Scenarios**:

1. **Given** a signed-in Client user, **When** they view the sidebar,
   **Then** the Kanban Board and Admin Panel entries are not shown (as
   today), and there is no role/department picker anywhere in the UI.
2. **Given** a signed-in Department Head for "Finance", **When** they load
   any department-scoped view, **Then** they see only Finance-scoped data,
   determined by their account record, not by a dropdown selection.
3. **Given** a signed-in Admin, **When** they navigate to `/admin`,
   **Then** the Admin Panel loads normally.

---

### User Story 3 - Sign out ends access (Priority: P2)

A signed-in user can sign out, immediately losing access to protected
screens and data until they sign in again.

**Why this priority**: Completes the session lifecycle; without it, a user
on a shared machine has no way to end their session and the "logged in"
state is effectively permanent once reached.

**Independent Test**: While signed in, trigger sign-out and confirm the app
returns to the login screen and no protected data remains reachable without
signing in again.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they choose to sign out, **Then**
   they are returned to the login screen and the previously visible
   workspace content is no longer shown.
2. **Given** a user has just signed out, **When** they attempt to navigate
   back to a protected URL, **Then** they are sent to the login screen
   rather than seeing cached or stale workspace content.

---

### User Story 4 - Session expiry is handled gracefully (Priority: P3)

If a signed-in user's session ends server-side (expired, invalidated, or
their account is disabled) while they're using the app, they are treated as
signed out rather than the app silently continuing to show stale data or
failing with unhandled errors.

**Why this priority**: Lower priority than the core cutover, but necessary
so the new real-auth flow degrades safely instead of getting the app into a
confusing half-authenticated state.

**Independent Test**: Invalidate a session server-side (e.g. session
expiry) while the app is open, then trigger any data-fetching action and
confirm the user is prompted to sign in again rather than seeing an error
screen or stale data.

**Acceptance Scenarios**:

1. **Given** a user's session has expired server-side, **When** the app
   makes its next API call, **Then** the user is redirected to the login
   screen instead of seeing a raw error or frozen UI.

---

### Edge Cases

- What happens when a signed-in user's account role is changed by an Admin
  while they still have an active session? **Resolved for v1**: the frontend
  does not re-fetch or reconcile this in real time — see the corresponding
  Assumption below. This is an accepted UX staleness gap, not a security gap:
  the backend independently re-validates the user's role from the database on
  every request, so a demoted user's stale frontend session cannot actually
  perform a newly-disallowed action even if the UI hasn't caught up yet.
- What happens when a user directly opens a deep link (e.g. a shared link to
  a specific task) while signed out? They should reach that same destination
  automatically after signing in, not just land on the dashboard.
- How does the system handle a user whose role fails validation entirely
  (null or unrecognized role, matching the backend's existing fail-closed
  `hasValidRole()` behavior)? They should be treated as unauthorized for
  every gated action, not defaulted to any particular access level.
- What happens if the login request fails due to a network/server error
  (not bad credentials)? The user should see a distinct, actionable message
  rather than being told their credentials are wrong.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST require a successful sign-in before granting
  access to any workspace screen; the login screen MUST be the only
  reachable screen for an unauthenticated visitor.
- **FR-002**: System MUST authenticate users with the existing email/password
  credentials already provisioned for the five persona accounts (and any
  future accounts created the same way).
- **FR-003**: System MUST derive the current user's role and department
  exclusively from the authenticated session (the backend's curated user
  profile) — no client-side state (dropdown, localStorage, or otherwise)
  may influence which role or department is used for access decisions or
  data scoping.
- **FR-004**: System MUST remove the existing role/department selector UI
  from the sidebar and mobile drawer; no on-screen control may let a user
  choose or change their own effective role or department.
- **FR-005**: System MUST let a signed-in user sign out on demand, ending
  their access to protected screens and data immediately.
- **FR-006**: System MUST redirect an unauthenticated visitor who requests a
  protected URL to the login screen, and after successful sign-in return
  them to that originally requested URL.
- **FR-007**: System MUST treat any 401 (unauthenticated) response from the
  API during normal use as an expired/ended session — the user is returned
  to the login screen rather than shown stale content or a raw error.
- **FR-008**: System MUST apply every existing role-gated behavior (Admin
  Panel guard, Kanban Board internal-only guard, department-scoped views,
  client-visible field filtering, write-permission gating) using the real
  authenticated identity, with no code path left reading the old mock role
  state.
- **FR-009**: System MUST deny access to any gated action for a user whose
  role does not match one of the five recognized system roles, consistent
  with the backend's existing fail-closed validation.
- **FR-010**: System MUST show a clear, distinguishable error message when
  sign-in fails due to bad credentials versus a network/server failure.

### Key Entities *(include if feature involves data)*

- **User (existing)**: A person with an email, password, name, `role`
  (one of the five fixed system roles), and `department`. Already modeled
  and seeded on the backend; this feature changes how the frontend consumes
  it, not the entity itself.
- **Session**: The authenticated state tying a browser to a signed-in User,
  established at sign-in and ended at sign-out or expiry. Already
  implemented via Sanctum on the backend; this feature is about the
  frontend fully relying on it as the single source of identity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of workspace pages are unreachable without a successful
  sign-in — verified by attempting direct navigation to every existing
  route while signed out.
- **SC-002**: Zero on-screen controls exist anywhere in the app that let a
  user change their own effective role or department.
- **SC-003**: For each of the five persona accounts, signing in produces
  access and visible data identical to what that role/department combination
  produced under the old mock switcher (no regression in who can see or do
  what).
- **SC-004**: Signing out and attempting to reload any previously visited
  protected page returns the user to the login screen 100% of the time.
- **SC-005**: All existing backend RBAC-related tests continue to pass
  unmodified, and the frontend's role-gated behaviors are covered by at
  least one verification pass per persona account.

## Assumptions

- Five persona accounts already exist in the seeded database
  (`admin@itrack.test`, `pm@itrack.test`, `depthead@itrack.test`,
  `team@itrack.test`, `client@itrack.test`, each password `password`),
  covering all five roles for verification — no new accounts need to be
  created for this feature to be testable.
- The backend authentication endpoints (`/api/login`, `/api/me`,
  `/api/logout`) are already correct and complete; this feature is a
  frontend integration and cleanup effort, not a backend change.
- Session-based (cookie) authentication via Sanctum remains the mechanism;
  moving to token-based auth is out of scope.
- Self-service password reset and account self-registration are out of
  scope for this feature (accounts remain Admin-provisioned, matching the
  existing v2 User Management epic, tracked separately).
- The mock role/department switcher is removed outright rather than kept
  behind a hidden dev-only flag, per the constitution's stance that the two
  identity systems should not coexist.
- Mid-session role changes (an Admin edits another user's role while that
  user has an active browser session) are **not** reconciled in real time by
  this feature. The frontend's cached `user.role`/`user.department` only
  refreshes on the next sign-in or full page reload. This is deliberately
  deferred rather than implemented now, because the backend already
  re-validates `$user->role` fresh from the database on every request via
  the `HasRole` trait (per Constitution Principle I) — a demoted user cannot
  actually perform a newly-disallowed backend action, they would just see a
  stale nav item or guard state client-side until their next reload.
  Real-time role propagation (e.g. periodic `/api/me` re-fetching) is left
  for a future iteration if it proves to matter in practice.
