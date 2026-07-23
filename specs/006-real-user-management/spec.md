# Feature Specification: Real User Management

**Feature Branch**: `006-real-user-management`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Real User Management (docs/prd_v2.md, P2 item #1): allow Admins to create, edit, disable/reactivate, and manage real user accounts — role, department, and status — from the application UI, now that the platform runs on real Sanctum session authentication instead of seeded mock personas."

**Scope note**: This spec covers user-account management only — creating, editing, disabling/reactivating accounts, assigning system roles/departments, and password reset — matching `docs/prd_v2.md`'s "Real User Management" item exactly. Broader permission-model changes are `docs/prd_v2.md`'s separate "Permission Hardening" item and are out of scope here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin views and creates user accounts (Priority: P1)

An Admin needs to onboard a new employee or client without asking a developer to insert a database row. They open a Users list, search/filter it to confirm the person doesn't already have an account, and create one — supplying name, email, system role, and department where applicable.

**Why this priority**: This is the acute, named pain point this feature exists to fix — today, every new user requires backend/database intervention. Nothing else in this feature matters if an Admin still can't get a new person into the system without a developer.

**Independent Test**: Can be fully tested by signing in as an Admin, creating a user with a specific role and department, and confirming that user can then sign in with the credentials the Admin set and lands with exactly that role/department — delivers value even if User Stories 2-4 are never built.

**Acceptance Scenarios**:

1. **Given** an Admin viewing the Users list, **When** they create a user with a name, email, a system role, and (for roles that need one) a department, **Then** the new user appears in the list and can sign in with the assigned role/department.
2. **Given** an Admin creating a user, **When** they submit an email that already belongs to an existing account, **Then** the system rejects it with a clear error — no duplicate accounts are ever created for the same email.
3. **Given** a non-Admin user (any of the other four system roles), **When** they attempt to reach user-management functionality, **Then** they are denied — this is Admin-only, matching every other admin-only surface already in this app (e.g. the existing Admin Control Center's other tabs).
4. **Given** an Admin searching/filtering the Users list, **When** they filter by role, department, or status, **Then** only matching users are shown, and large lists remain usable via pagination.

---

### User Story 2 - Admin edits an existing user's role, department, or details (Priority: P2)

An Admin needs to correct a user's name/email, move them to a different department, or change their system role (e.g. promoting a Team Member to Department Head) without backend intervention.

**Why this priority**: Role/department changes are named as a recurring, currently-manual pain point — but it's secondary to User Story 1, since it only matters for users who already exist (which requires US1 or legacy/seeded accounts).

**Independent Test**: Can be fully tested by editing an existing user's role and department as an Admin, then confirming that user's access (e.g. which projects they can see) changes to match the new role/department on their next request — delivers value independently of User Stories 3-4.

**Acceptance Scenarios**:

1. **Given** an existing user, **When** an Admin changes their role and/or department and saves, **Then** the user's access reflects the new role/department immediately on their next authenticated request — no re-login or manual cache-clear required.
2. **Given** an Admin editing a user, **When** they change the email to one already used by a different account, **Then** the system rejects it with a clear error.
3. **Given** an Admin editing their own account, **When** they attempt to change their own role away from Admin, **Then** the system prevents it — an Admin can never accidentally demote themselves out of Admin access with no other Admin able to reverse it (see Edge Cases).

---

### User Story 3 - Admin disables or reactivates a user account (Priority: P2)

An Admin needs to immediately cut off access for a former employee or a client engagement that has ended, and be able to restore it later if the person returns, without deleting their historical data (audit logs, comments, attachments, assigned tasks all still reference this user).

**Why this priority**: This is a real, named security/access-control risk (an ex-employee retaining access) — as important as editing, and independent of it once an account already exists.

**Independent Test**: Can be fully tested by disabling an active user's account, confirming they can no longer sign in or use an existing session, then reactivating the account and confirming access returns — delivers value independently of User Stories 2 and 4.

**Acceptance Scenarios**:

1. **Given** an active user with a valid signed-in session, **When** an Admin disables their account, **Then** that user's very next request (whether a fresh login attempt or an existing session's next API call) is denied — a disabled account never retains functional access just because its session cookie hasn't expired yet.
2. **Given** a disabled user, **When** an Admin reactivates their account, **Then** they can sign in normally again with their existing credentials.
3. **Given** an Admin viewing their own account, **When** they attempt to disable it, **Then** the system prevents it — an Admin can never lock themselves out with no other Admin able to re-enable them (see Edge Cases).
4. **Given** a disabled user's historical activity (audit log entries, comments, attachments, assigned tasks), **When** anyone views that history, **Then** it still correctly shows that user's name/role — disabling never deletes or anonymizes historical records.

---

### User Story 4 - Admin resets a user's password (Priority: P3)

An Admin needs to help a user who's forgotten their password, or set an initial password for a newly created account, without any self-service "forgot password" flow (out of scope — see Assumptions).

**Why this priority**: Necessary for account recovery, but the least time-sensitive of the four — a new account can be created with a working password on day one (US1), and this only matters when someone later gets locked out.

**Independent Test**: Can be fully tested by having an Admin reset a user's password to a new value and confirming the user can sign in with the new password (and not the old one) — delivers value independently of User Stories 1-3.

**Acceptance Scenarios**:

1. **Given** an existing user, **When** an Admin resets their password, **Then** the user can sign in with the new password and can no longer sign in with the old one.
2. **Given** a password reset, **When** the action completes, **Then** it is audit logged the same way every other sensitive user-management action is (FR-009) — but the new password value itself is never written to the audit log.

---

### Edge Cases

- What stops an Admin from locking every Admin out of the system (demoting or disabling the last remaining Admin account, including their own)? The system MUST prevent an Admin from changing their own role away from Admin or disabling their own account (User Stories 2 and 3's acceptance scenario 3) — this is the simplest rule that can't be bypassed by "just don't do that," since it's enforced regardless of intent.
- What happens to a disabled user's already-assigned tasks, comments, and audit trail? All of it remains exactly as-is and still displays that user's name/role — disabling changes future access only, never historical data (User Story 3, acceptance scenario 4).
- What happens if an Admin tries to create a user with a role that requires a department (Team Member, Department Head, Client) but leaves department blank? The system MUST reject it with a clear error — this app's existing cross-project access scoping (`Project::accessibleTo`) depends on department being set for exactly these roles; an ungoverned null would silently and unpredictably affect what that user can see.
- What happens if a disabled user is mentioned in a comment or assigned as a task's responsible party after being disabled? Unaffected by this feature — those are independent, pre-existing capabilities this feature does not change; a disabled user simply can no longer act, but can still be referenced.
- What happens to a Client-role user specifically — does disabling them differ from disabling an internal role? No — disabling/reactivating is uniform across all five system roles; Client-specific data visibility is governed by the existing, separate `client_visible` mechanism, unaffected by this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST restrict all user-management functionality (viewing the user list, creating, editing, disabling/reactivating, resetting passwords) to the Admin role only — fail-closed, matching this app's existing inclusion-based access pattern (every other role, including a null/unrecognized one, is denied).
- **FR-002**: Admin MUST be able to create a user with a name, a unique email, a password, one of the five existing system roles (Admin, Project Manager, Department Head, Team Member, Client), and a department — department is required for Team Member, Department Head, and Client (this app's existing project-access scoping depends on it for these roles), and optional for Admin/Project Manager (who already see everything regardless of department).
- **FR-003**: System MUST reject creating or editing a user with an email already used by a different account, with a clear error — no duplicate accounts for the same email are ever created.
- **FR-004**: Admin MUST be able to edit an existing user's name, email, role, and department. A role/department change MUST take effect on that user's very next authenticated request — no re-login or manual step required of the affected user.
- **FR-005**: Admin MUST be able to disable and later reactivate a user account. A disabled account MUST be denied on its very next request after being disabled — whether that's a fresh login attempt or an already-signed-in session's next API call — not merely blocked from future logins while an existing session keeps working.
- **FR-006**: Disabling a user MUST NOT delete, hide, or anonymize that user's historical data (audit log entries, comments, attachments, assigned tasks) — it only removes their ability to act going forward.
- **FR-007**: System MUST prevent an Admin from removing their own Admin role or disabling their own account, under any circumstance — there must always be a way for at least one Admin to undo any user-management action, including one an Admin might attempt against themselves.
- **FR-008**: Admin MUST be able to reset another user's password to a new value the Admin sets, communicated to that user outside this system (no email-sending capability is assumed — see Assumptions). The new password is never logged in plaintext anywhere, including in audit log entries.
- **FR-009**: Every user-management action (create, edit, disable, reactivate, password reset) MUST be audit logged via this app's existing audit mechanism, identifying the acting Admin, the affected user, and what changed — never reconstructed after the fact from other tables.
- **FR-010**: The user list MUST support search (by name/email) and filtering (by role, department, and status), and MUST remain usable at scale via pagination — never a single unpaginated dump of every user.
- **FR-011**: Every user-management response MUST expose only safe fields — password hashes, remember tokens, and any other internal auth metadata are never returned to the frontend, matching this app's existing curated-response pattern.
- **FR-012**: A user's system role (Admin, Project Manager, Department Head, Team Member, Client — governs access) MUST remain a clearly distinct concept from the existing, separate project/job-title roster this app already has (e.g. "PPM", "PFC" abbreviations used for task assignment) — this feature never conflates or merges the two; a system-role change never touches that separate roster.

### Key Entities

- **User** *(existing)*: The account this entire feature manages. Existing fields (`name`, `email`, `role`, `department`) are unchanged in meaning; this feature adds the ability to manage them through the UI and introduces an active/disabled status concept.
- **Project** *(existing)*: Indirectly affected — a user's role/department change immediately changes which projects `Project::accessibleTo` resolves for them, since this feature edits the exact fields that mechanism already reads.
- **Audit Log** *(existing)*: Every action this feature performs is recorded here, following the same pattern already established for every other sensitive mutation in this app.
- **Team/Project Role Roster** *(existing, distinct from User)*: The separate, non-authenticating "job title" concept (e.g. "PPM", "PFC") used elsewhere for task assignment — explicitly not the same thing as a User's system role (FR-012), and not modified by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Admin can onboard a new user (any of the five roles) entirely through the application UI, with no developer or direct-database step, in under two minutes.
- **SC-002**: 100% of disabled accounts are denied on their very next request after being disabled, regardless of whether that request is a new login or an existing session's continued use.
- **SC-003**: 100% of user-management actions (create, edit, disable, reactivate, password reset) produce a corresponding audit log entry identifying who did what to whom.
- **SC-004**: Zero user-management responses ever expose a password hash, remember token, or other internal auth metadata to the frontend.
- **SC-005**: It is never possible, through any sequence of user-management actions, to leave the system with zero enabled Admin accounts.

## Assumptions

- **No email-sending infrastructure exists or is introduced by this feature**: This app currently only has mock-notification logging (written to the application log, never a real outbound email), and `docs/prd_v2.md` explicitly excludes email verification and self-service password reset from this feature's scope. Password reset (User Story 4) is therefore an Admin-driven, in-app action — the Admin sets a new password value and communicates it to the user through whatever out-of-band channel this organization already uses (the same assumption a "temporary password" flow requires), not an automated reset-link email.
- **A new, additive `is_active` (or equivalently-named) column is the simplest way to represent account status**: Nullable-with-a-default, following Constitution Principle V's small/additive/reversible migration pattern — no existing column already represents this.
- **Disabled-account enforcement reuses the existing Sanctum session-cookie request cycle**: Every authenticated request already re-validates the session against the database; adding an active-status check to that same existing cycle is sufficient to satisfy FR-005/SC-002 without needing to forcibly invalidate already-issued session cookies out of band.
- **The existing five system roles are unchanged**: This feature manages assignment of the existing Admin/Project Manager/Department Head/Team Member/Client roles — it does not add, remove, or redefine any of them (that would be a "Permission Hardening"-scope change, per the PRD's own separation).
- **Reuses the existing Admin Control Center**: The existing `Admin.jsx` page already has a tabbed structure (Members/Grants/Logs) for admin-only functionality — this feature is assumed to add a new "Users" tab there rather than a new standalone page, consistent with how that page already groups admin-only tools.
