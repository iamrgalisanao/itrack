# Feature Specification: Permission Hardening

**Feature Branch**: `007-permission-hardening`

**Created**: 2026-07-25

**Status**: Draft

**Input**: User description: "Permission Hardening (docs/prd_v2.md item #2) — project-level access rules, client-specific project access, better 403 handling, and Admin preview tools, extending V1's role/department-only access control."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Team Members and Clients see only their assigned projects (Priority: P1)

Today, a Team Member or Client sees every project tagged with their own department — there is no restriction to the specific project(s) they actually work on. An Admin or Project Manager needs to be able to assign a Team Member or Client to one or more specific projects, and from that point on, that user's project lists (Dashboard, Kanban, Work Program, Schedule, Reports) show only their assigned projects, not their whole department's.

**Why this priority**: This is the core, currently-open exposure the PRD calls out directly: "Team Members may see projects beyond their assigned scope" and "Clients need controlled access to specific projects only." It's also the one with no workable mitigation today — Department Heads at least have `DepartmentGrant`; Team Members and Clients have no equivalent boundary narrower than their entire department.

**Independent Test**: As an Admin, assign a Team Member to exactly one of three projects in their department; sign in as that Team Member and confirm only the assigned project appears anywhere in the app, and the other two return a 403 if accessed directly by ID.

**Acceptance Scenarios**:

1. **Given** a Team Member with no project assignments, **When** they sign in, **Then** they see no projects until at least one is assigned (empty state, not an error).
2. **Given** a Team Member assigned to Project A only, **When** they view the Dashboard, Kanban, Work Program, Schedule, or Reports, **Then** only Project A's data appears in every view.
3. **Given** a Team Member assigned to Project A only, **When** they request Project B directly (e.g. by navigating to its URL or calling its API endpoint), **Then** the request is denied with a 403, not a 404 or silent empty result.
4. **Given** a Client assigned to Project A, **When** an Admin later removes that assignment, **Then** the Client loses access to Project A on their very next authenticated request after the removal is committed — no re-login required, matching the immediate-effect precedent set by 006-real-user-management's role/department edits.
5. **Given** an Admin or Project Manager, **When** they view any project, **Then** project-level assignment does not restrict them — they retain full visibility as today.

---

### User Story 2 - Admin can preview the app as a specific user (Priority: P2)

An Admin currently has no way to verify what a Department Head, Team Member, or Client actually sees without either asking them, or creating a throwaway account and logging in as it. Admins need a read-only "preview as" mode: pick a specific user, and see the app exactly as that user would, without being able to make changes while previewing.

**Why this priority**: Directly serves "Admins cannot easily verify what a Client or Department Head can see," and becomes far more valuable once User Story 1 ships — assignment mistakes are otherwise invisible until a user reports them.

**Independent Test**: As an Admin, start a preview session as a specific Team Member; confirm the project list matches that Team Member's real assignments, and confirm every create/edit/delete action is disabled or rejected while previewing.

**Acceptance Scenarios**:

1. **Given** an Admin, **When** they start previewing as a specific user, **Then** every subsequent read reflects exactly that user's access (their assigned projects, their department, their role's visible navigation).
2. **Given** an Admin in preview mode, **When** they attempt any create, update, or delete action, **Then** the action is rejected server-side (not just hidden client-side) and the attempt is audited.
3. **Given** an Admin in preview mode, **When** they end the preview, **Then** they immediately return to their own full Admin access.
4. **Given** a non-Admin user, **When** they attempt to start a preview session via a direct API call, **Then** the request is denied with a 403.

---

### User Story 3 - Consistent access-denied experience and an audit trail for access changes (Priority: P3)

Right now, different pages handle "you don't have access to this" differently — some show a styled access-denied panel (Kanban Board, Support Ops, Admin Panel already do), others may return a raw error or an empty state that looks like "there's just nothing here." Every access-denied case across the app should look and behave the same way, and every change to who can access what (project assignments, department grants) should leave an audit entry — matching how 006 already audits every user-account change.

**Why this priority**: A correctness and support-cost improvement ("30% reduction in support tickets for access confusion" per the PRD), not a security gap — it depends on Stories 1 and 2 existing first, since there's nothing new to audit or explain access-denials for until then.

**Independent Test**: Trigger an access-denied condition from three different entry points (direct URL, API call to a nested resource, an action button that shouldn't be visible); confirm all three produce the same access-denied experience. Separately, assign then revoke a project assignment and confirm both actions appear in the Admin Audit Logs viewer.

**Acceptance Scenarios**:

1. **Given** any authenticated user without access to a given project, **When** they reach an access-denied condition through any entry point (page navigation, direct API call, a nested resource under that project), **Then** the response/experience is consistent with every other access-denied case in the app.
2. **Given** an Admin grants a user access to a project, **When** the grant is saved, **Then** an audit log entry records who granted it, to whom, and for which project.
3. **Given** an Admin revokes a user's project access, **When** the revocation is saved, **Then** an audit log entry records the revocation the same way.

---

### Edge Cases

- What happens when a user's last remaining project assignment is removed? They should see the same "no projects assigned yet" empty state as a brand-new user — not an error.
- What happens to a Client or Team Member's existing assignments if their role changes (e.g., Team Member promoted to Project Manager)? Project-level assignments become irrelevant the moment a role gains department-or-broader visibility (PM/Admin); the assignments themselves are not required to be deleted, just superseded, so demoting the user back down later restores the original narrower access without re-entering it.
- What happens when an Admin tries to preview as another Admin? Preview mode is for verifying restricted views; previewing "as Admin" has no narrower access to demonstrate, so this should be disallowed with a clear message rather than silently permitted or silently a no-op.
- What happens when a project is deleted while users are actively assigned to it? Assignments for that project are removed as part of the existing project-delete cascade (matching how module/activity/task children already cascade); no orphaned assignment rows should remain.
- How does this interact with a Department Head's existing `DepartmentGrant`-based access? Department Heads keep their current department-plus-grants visibility unchanged by this feature — project-level assignment is additive scoping for Team Member and Client roles specifically, not a replacement for how Department Heads already see things (see Assumptions). Story 2's preview mode does give Admins a direct way to verify what a given Department Head sees, which addresses the PRD's "Admins cannot easily verify what a Client or Department Head can see" concern even though the underlying `DepartmentGrant` mechanism itself is unchanged.
- How does this interact with the existing per-task `client_visible` flag Clients are already restricted by? The two gates compose, they don't replace each other: project assignment decides *which projects* a Client can enter at all (the new, outer gate); `client_visible` continues to decide *which tasks within an accessible project* a Client sees (the existing, inner gate, unchanged by this feature). A Client assigned to a project still only sees that project's `client_visible` tasks, comments, and files, exactly as today.
- What happens if a user is disabled (006-real-user-management) while they hold project assignments? Nothing new — a disabled account already fails the global authentication gate before any project-level check would run, so their now-dormant assignments simply take effect again if the account is later reactivated.
- What happens if an Admin assigns a user to a project they're already assigned to? Treated as a no-op — no duplicate assignment record, no duplicate audit entry.
- What happens if someone attempts to assign a Department Head, Project Manager, Admin, or a disabled account to a project? Rejected. Project-level assignment exists only for Team Member and Client roles — broader roles already have access without it, and a disabled account can't authenticate regardless of any assignment it holds.
- What happens if the user being previewed has their role changed or their account disabled while the preview session is active? The preview session ends immediately, reflecting the change, rather than continuing to show the target's now-stale prior access.
- What happens if an Admin starts a preview session and never explicitly ends it (closes the tab, walks away)? The session cannot persist indefinitely — it has a bounded maximum lifetime and ends automatically once reached, the same discipline already applied to real login sessions. The exact duration is a planning decision.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an Admin or Project Manager to assign a specific Team Member or Client user to one or more specific projects.
- **FR-002**: System MUST allow an Admin or Project Manager to remove a user's assignment from a specific project, with the removal taking effect on that user's very next request (no re-login required).
- **FR-003**: For users whose role is Team Member or Client, every project-scoped read — Dashboard, Kanban, Work Program, Schedule, Reports, and any nested resource reached through a project (comments, attachments, exports, and any future addition) — MUST be limited to that user's assigned projects only, enforced identically everywhere a project is the access boundary, with no per-surface exceptions or weaker checks on any single entry point.
- **FR-004**: System MUST NOT change existing access behavior for Admin, Project Manager, or Department Head roles — this feature narrows Team Member/Client visibility only, layered on top of the existing role/department model, never replacing it.
- **FR-005**: System MUST deny with the same 403 response for any project a Team Member or Client cannot access, whether that project exists but is unassigned to them, or does not exist at all — never a 404, and never a response that lets the requester distinguish the two cases (see FR-011).
- **FR-006**: System MUST allow an Admin to start a read-only preview session as a specific user, seeing exactly that user's access.
- **FR-007**: System MUST reject every write operation (create, update, delete) attempted while an Admin is in a preview session, and record the attempt via the audit log.
- **FR-008**: System MUST NOT allow a non-Admin to start or otherwise trigger a preview session for any user.
- **FR-009**: System MUST NOT allow previewing as another Admin (no narrower access exists to preview).
- **FR-010**: System MUST present a consistent access-denied experience across every project-scoped surface named in FR-003 (Dashboard, Kanban, Work Program, Schedule, Reports, and any nested resource under a project), whether reached by direct page navigation, direct API call, or a nested resource under an inaccessible project.
- **FR-011**: A request for a project a user cannot access MUST return the same response whether that project ID does not exist at all or exists but is not assigned to the requester — the response MUST NOT reveal whether an inaccessible project ID is valid.
- **FR-012**: Project assignment is available for any project regardless of department — an Admin or Project Manager assigning a Team Member or Client is not restricted to projects in that user's own department. This follows current Project Manager visibility (PMs already see every project unrestricted today) rather than the narrower "projects they own" language in historical planning docs: `project_owner` is presently a free-text label with no real link to a user account, so PM-scoped-to-owned-projects assignment has no schema to restrict against yet. It is a deliberate, temporary alignment with the current data model, not a statement that PM assignment authority should stay this broad forever — see Assumptions.
- **FR-013**: System MUST record an audit log entry for every project-assignment grant and revocation, identifying the acting Admin/PM, the target user, and the affected project.
- **FR-014**: System MUST remove a user's project assignments when that project is deleted (no orphaned assignment records).
- **FR-015**: System MUST continue to allow a user's assignments to exist unused (not require deletion) when their role changes to one with broader access, so narrower access is restored automatically if their role is later changed back.
- **FR-016**: System MUST only permit Team Member and Client role users, with active (non-disabled) accounts, as targets of project assignment; attempts to assign a Department Head, Project Manager, Admin, or a disabled account MUST be rejected.
- **FR-017**: Assigning a user to a project they are already assigned to MUST be idempotent — no duplicate assignment record and no duplicate audit entry.
- **FR-018**: System MUST record an audit log entry when a preview session starts and when it ends, identifying the previewing Admin and the target user — in addition to the write-attempt audit already required by FR-007.
- **FR-019**: An active preview session MUST end immediately if the previewed user's role changes or their account is disabled during the session, rather than continuing to reflect their prior access.
- **FR-020**: A preview session MUST have a bounded maximum lifetime and end automatically once reached, even if the Admin never explicitly ends it; the exact duration is a planning-level decision.

### Key Entities

- **Project Assignment**: Links one User (Team Member or Client role) to one Project they are explicitly permitted to see. Analogous in spirit to `DepartmentGrant`, but scoped to an individual user and a specific project rather than a role+department persona.
- **Preview Session**: A short-lived, Admin-only, read-only server-side context that causes subsequent requests to be evaluated as a target user's access instead of the Admin's own, without changing who is actually authenticated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero known cases of a Team Member or Client seeing project data outside their explicit assignments, verified by an automated permission test suite covering every project-scoped endpoint.
- **SC-002**: 100% of project-scoped backend endpoints (Dashboard, Kanban, Work Program, Schedule, Reports, comments, attachments, exports) have an automated test proving both the allowed and the denied case for Team Member/Client roles.
- **SC-003**: An Admin can verify what a specific Client or Team Member sees in under 30 seconds using preview mode, without creating a test account or asking the user.
- **SC-004**: Every access-denied experience in the app is visibly and behaviorally identical, regardless of entry point.
- **SC-005**: 100% of project-assignment grants and revocations produce a corresponding audit log entry, verified by automated test.
- **SC-006**: Project-scoped endpoints (Dashboard, Kanban, Work Program, Schedule, Reports) show no material response-time regression after this feature ships, verified by comparing representative before/after request latency.

## Assumptions

- Department Head access continues to work exactly as it does today (own department plus any `DepartmentGrant`-granted departments); this feature does not convert `DepartmentGrant` from its current role+department persona model to a per-user model. That gap — real, and now more visible since 006 introduced real per-user accounts — is a known limitation worth its own future spec, not silently folded into this one.
- "Project-level access" in this feature means Team Member/Client visibility is scoped to specific projects; it does not introduce any *new* per-field or per-task permission mechanism. The existing per-task `client_visible` flag already restricts what Clients see within a project they can access, and continues to apply unchanged, composing with (not replaced by) the new project-level gate — see Edge Cases.
- Preview mode is read-only at the server, not just hidden in the UI — the frontend may additionally disable controls for clarity, but the enforcement that matters is backend-side.
- Existing users with no explicit project assignment yet (immediately after this feature ships) will see no projects until an Admin assigns them. This is an expected one-time rollout step, not a bug — but it is a real access-outage risk if every existing Team Member/Client account starts with zero assignments the moment this ships. Planning MUST produce a concrete backfill decision (e.g., seed one assignment per existing user for every project in their current department at migration time, so nobody's access narrows below today's behavior until an Admin deliberately narrows it) before this feature is considered ready to implement.
- Restricting Project Manager assignment authority to "projects they own" (FR-012) is explicitly out of scope for this feature. Doing it properly requires converting `project_owner` from a free-text label into a real user-linked ownership model (schema change, migration/backfill, ownership-transfer behavior, multi-PM and deleted/disabled-PM handling) — a scope large enough to warrant its own future spec ("Project Ownership and PM-Scoped Administration"), not a clarification folded into this one. Until that ships, PM assignment authority is intentionally as broad as PMs' existing project visibility.
