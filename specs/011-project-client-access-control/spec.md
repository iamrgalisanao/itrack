# Feature Specification: Project Client Access Control

**Feature Branch**: `011-project-client-access-control`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "Cover client/organization and project membership, invitations, verified corporate email domains, public providers such as Gmail/Yahoo/Outlook through invitation or approval, configurable trusted-domain policies, membership states, project-scoped roles and authorization, audit logging, multi-project and multi-client data isolation, and alignment with Laravel authorization and RBAC."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A project manager invites a client contact to one project (Priority: P1)

A Project Manager needs to invite a client contact to a project without granting that contact access to every project in the same department, every project for the same client, or internal-only records. The invite should work when the email uses a verified corporate domain and should create a pending membership until the invite is accepted and approved according to policy.

**Why this priority**: This is the access-control core. Without project-scoped client membership, every later domain or approval policy either over-grants or has nowhere safe to land.

**Independent Test**: As a Project Manager who owns Project A, invite `alex@clientco.example` to Project A; accept the invitation; confirm the account can see Project A client-visible data only and cannot see Project B, even when Project B belongs to the same client organization.

**Acceptance Scenarios**:

1. **Given** a Project Manager who owns a project, **When** they invite a client email to that project, **Then** the system creates a project invitation in `pending` state and records who sent it.
2. **Given** the invitee accepts a valid invitation, **When** the domain policy allows automatic approval, **Then** project membership becomes `approved` and the account receives only the invited project-scoped role.
3. **Given** the same user is a member of one project, **When** they request another project for the same organization, **Then** access is denied until a separate invitation or approval exists for that project.

---

### User Story 2 - Corporate domains can be trusted without trusting public providers (Priority: P1)

An Admin needs to mark `clientco.example` as a verified domain for ClientCo so users from that domain can be approved under a configured policy. The same Admin must not accidentally trust broad public providers like Gmail, Yahoo, or Outlook for an entire organization.

**Why this priority**: Domain trust is powerful. Treating public providers as corporate domains would silently expand access far beyond the intended client.

**Independent Test**: Configure `clientco.example` as auto-approve for ClientCo; confirm `person@clientco.example` can be automatically approved for an invited project, while `person@gmail.com` is routed to invitation-only or manual approval.

**Acceptance Scenarios**:

1. **Given** an Admin verifies `clientco.example` for ClientCo, **When** an invited user with that domain accepts, **Then** the trusted-domain policy is applied.
2. **Given** a Gmail, Yahoo, Outlook, Hotmail, or Live address, **When** it is used for access, **Then** the system treats it as a public provider and never as a verified corporate domain.
3. **Given** a public-provider email is invited to a project, **When** the invite is accepted, **Then** membership requires explicit invitation or approval according to policy and never domain auto-approval.

---

### User Story 3 - Membership state controls authorization at every project boundary (Priority: P2)

Client and organization membership changes over time. Pending, rejected, expired, suspended, and removed memberships must not retain access, and approved access must be scoped to a specific project role.

**Why this priority**: State drift is an access-control risk. The system must fail closed whenever membership is not actively approved.

**Independent Test**: Suspend an approved member and confirm their next request to project data returns 403. Remove the membership and confirm no access returns even after re-login.

**Acceptance Scenarios**:

1. **Given** a membership in `pending`, `rejected`, `expired`, `suspended`, or `removed`, **When** the user requests project data, **Then** the response is 403.
2. **Given** an `approved` membership with role `client_viewer`, **When** the user reads client-visible task data for that project, **Then** the response succeeds and hides internal-only fields.
3. **Given** an `approved` membership with a role that cannot edit, **When** the user attempts a write, **Then** the response is 403 and a permission-denied audit entry is recorded.

---

### User Story 4 - Admins can configure client policy and review exceptions (Priority: P2)

An Admin needs a central way to control whether a client organization uses domain auto-approval, invitation-only approval, or manual approval, and to handle exceptions for public-provider addresses.

**Why this priority**: Client organizations differ in security posture. A configurable policy avoids hardcoding one access model for every client.

**Independent Test**: Change a client organization's trusted-domain policy from auto-approve to manual approval and confirm the next accepted invitation remains pending approval until an Admin approves it.

**Acceptance Scenarios**:

1. **Given** an Admin updates a client organization's trusted-domain policy, **When** the policy is saved, **Then** all future invitation acceptance follows the new policy and the change is audited.
2. **Given** a pending public-provider membership, **When** an Admin approves it, **Then** it becomes approved only for the selected project and role.
3. **Given** a pending membership is rejected, **When** the user attempts to use the project, **Then** access is denied and the rejection is visible to Admins/owning Project Managers.

---

### User Story 5 - Multi-client isolation is visible and testable (Priority: P3)

Internal users may administer many projects and clients, while clients must see only what they are approved to see. The system needs explicit isolation guarantees so a client from one organization cannot discover another organization's projects, invitations, memberships, files, comments, support issues, or audit details.

**Why this priority**: Isolation failures are the highest-risk class of client access bugs.

**Independent Test**: Create ClientCo and VendorCo, each with two projects and one approved client member. Confirm each client account can list only its approved project and cannot infer the existence of the other client's projects by index, show, nested resource, search, report, notification, attachment, or support endpoints.

**Acceptance Scenarios**:

1. **Given** two client organizations, **When** a member of one organization requests another organization's project ID directly, **Then** the response is 403 or the repository's existing non-enumerating inaccessible-resource behavior.
2. **Given** one user is approved on Project A and pending on Project B, **When** they list projects, **Then** only Project A appears.
3. **Given** an Admin views audit logs, **When** they filter by client organization, project, user, or membership event, **Then** only matching audit entries are returned.

## Edge Cases

- Expired invitations cannot be accepted; accepting an expired invite moves or reports the invitation as `expired` and creates no approved membership.
- Re-sending an invitation to the same email/project updates or supersedes the old pending invite without creating duplicate active memberships.
- Email domain comparison is case-insensitive and uses the normalized domain after trimming whitespace.
- A user can belong to multiple projects, including projects for different client organizations, but authorization always evaluates the requested project independently.
- Suspending or removing a membership takes effect on the next request without requiring logout.
- Existing Admin and Project Manager access remains governed by current system roles and project ownership rules; this feature narrows client access, not internal admin visibility.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support client organizations as first-class records that can own verified domains, trusted-domain policy, and project membership settings.
- **FR-002**: System MUST associate each client-access-controlled project with exactly one client organization, using an additive project relationship that does not replace existing department, assignment, or ownership fields.
- **FR-003**: Project membership state MUST be one of: `pending`, `approved`, `rejected`, `expired`, `suspended`, `removed`.
- **FR-004**: Only `approved` project memberships may grant project access; every other state MUST deny access.
- **FR-005**: System MUST support project invitations with inviter, email, project, client organization, role, token, expiration, acceptance timestamp, and state.
- **FR-006**: Invitations MUST be scoped to exactly one project and one client organization.
- **FR-007**: System MUST support verified corporate email domains per client organization.
- **FR-008**: Public email providers including Gmail, Yahoo, Outlook, Hotmail, and Live MUST NOT be accepted as verified corporate domains.
- **FR-009**: Public-provider users MAY receive access only through explicit project invitation or explicit approval.
- **FR-010**: System MUST support configurable trusted-domain policies: domain auto-approval, invitation-only approval, and manual approval.
- **FR-011**: System MUST support project-scoped membership roles, at minimum `client_viewer`, `client_contributor`, and `client_admin`.
- **FR-012**: Authorization MUST combine current `HasRole` system role predicates with project membership state and project-scoped role permissions.
- **FR-013**: Client-visible project data MUST remain explicit and must not expose internal-only tasks, comments, files, support notes, audit metadata, or user-management data.
- **FR-014**: Membership, invitation, domain, policy, approval, rejection, suspension, removal, and denied-access events MUST be recorded through `AuditLogger`.
- **FR-015**: Multi-project and multi-client isolation MUST be enforced in backend queries and tests, not by frontend filtering.
- **FR-016**: Existing ProjectAssignment and ProjectOwnership behavior MUST remain valid for internal users and MUST NOT be destructively migrated; Client-role project data access MUST transition to approved ProjectMembership for client-organization controlled projects.
- **FR-017**: API responses MUST use Laravel API Resources or explicit curated arrays and MUST NOT return raw Eloquent models for new membership surfaces.
- **FR-018**: Invitation tokens MUST be stored hashed and shown only at creation/send time.
- **FR-019**: Domain and email matching MUST be case-insensitive and normalized before policy evaluation.
- **FR-020**: Expiration and state-transition checks MUST be performed server-side on every invitation acceptance and membership authorization path.
- **FR-021**: Admins and authorized Project Managers MUST be able to associate or clear a project's client organization through a backend-authorized project update path.

### Key Entities

- **ClientOrganization**: A client/customer organization that owns projects, domains, membership policy, and memberships.
- **ClientDomain**: A verified corporate domain associated with a client organization and trust status.
- **TrustedDomainPolicy**: Configuration controlling auto-approval, invitation-only, or manual approval behavior.
- **ProjectMembership**: A user/client/project access row with state and project-scoped role.
- **ProjectInvitation**: A one-project invitation for an email address, with token, expiration, state, and inviter.
- **MembershipAudit Event**: Audit entries describing access-control changes and denied attempts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client user approved for one project can access that project and zero other projects without separate approved membership.
- **SC-002**: Public-provider addresses are never auto-approved by domain trust in automated and manual tests.
- **SC-003**: Every membership state other than `approved` returns denied access for project data and project writes.
- **SC-004**: Every sensitive membership/domain/invitation mutation creates an audit log entry with actor, target, project, client organization, and action.
- **SC-005**: Existing backend test suite plus new feature tests pass with no regression to Admin, Project Manager, Team Member, Department Head, and Client role behavior.

## Assumptions

- Client organization records are new; current `projects.department` and free-text client/support fields are not sufficient identity boundaries.
- Existing Client-role users remain real `User` accounts authenticated by Sanctum.
- Existing `ProjectAssignment` rows continue to drive Team Member visibility and legacy Client visibility only for projects not yet associated with a client organization. Once a project is associated with a client organization, Client-role access is governed by approved `ProjectMembership`; no destructive cutover of existing rows is assumed.
- Email delivery can be represented by queued notification/mail code or logged dev output in local validation; this spec focuses on access-control behavior.
