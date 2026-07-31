# Phase 0 Research: Project Client Access Control

## Repository Findings

- Real identity already exists through Sanctum-authenticated `User` accounts. `User` defines five system roles: Admin, Project Manager, Department Head, Team Member, Client.
- `HasRole` is the required role-checking surface. It deliberately fails closed for null or unrecognized roles.
- `Project::scopeAccessibleTo()` currently grants Admin/Project Manager all projects, Department Head department-granted projects, and Team Member/Client only explicit `ProjectAssignment` rows.
- `ProjectAssignment` and `ProjectOwnership` are existing per-project records and must remain valid. They do not currently model client organization, domain trust, invitation acceptance, or membership state.
- `AuditLogger` is the centralized mutation/denial audit service and is already used for permission-sensitive features.
- Routes live under an authenticated Sanctum group with `EnsureUserIsActive`, preview-session resolution, and write-blocking during preview.

## Decision: introduce ClientOrganization instead of overloading department or project assignment

**Rationale**: A client organization needs verified domains, trusted-domain policy, and multi-project membership behavior. `projects.department` is an internal grouping, and `ProjectAssignment` only joins user/project without client identity, domain policy, invitation state, or membership lifecycle.

**Alternatives considered**: Store client names as strings on projects - rejected because it cannot support verified domains or auditable policy changes. Add columns directly to `ProjectAssignment` - rejected because it would mix internal assignment semantics with client access lifecycle and make rollback harder.

## Decision: client-organization project access is granted only by approved ProjectMembership for Client-role users

**Rationale**: The feature needs states beyond assigned/unassigned. `pending`, `rejected`, `expired`, `suspended`, and `removed` must deny by default. A dedicated membership record keeps that state explicit and testable. Existing `ProjectAssignment` behavior remains available for Team Members and for legacy projects not yet associated with a client organization; once a project has a client organization, Client-role access must be evaluated through `ProjectMembership`.

**Alternatives considered**: Treat invitation acceptance as a `ProjectAssignment` row immediately - rejected because pending/manual approval and suspension need to exist without access.

## Decision: public providers are a deny-list for corporate-domain trust, not a deny-list for all access

**Rationale**: Gmail, Yahoo, Outlook, Hotmail, and Live users may be legitimate client contacts, but the domain cannot prove organization membership. They can be invited or manually approved for a single project, never auto-approved because of domain trust.

**Alternatives considered**: Reject public-provider addresses entirely - rejected because the requested feature explicitly supports them through invitation or approval.

## Decision: trusted-domain policy lives on the client organization

**Rationale**: Policy is organization-specific: one client may allow verified-domain auto-approval while another requires manual approval. Keeping policy near the client organization makes it visible and auditable.

**Policy modes**:

- `domain_auto_approve`: verified corporate domains may become approved after valid invitation acceptance.
- `invitation_only`: a valid invitation is required; public providers are allowed only by direct invite, not domain trust.
- `manual_approval`: acceptance creates or keeps pending membership until an Admin approves.

## Decision: authorization composes with current RBAC instead of replacing it

**Rationale**: The repository already has constitutional requirements around `HasRole`, real auth, project ownership, and project assignments. The new check should answer: "Does this user have system-role authority, or an approved project membership with a role allowing this action?"

**Implementation target**: a policy/support service such as `ProjectAccess` or Laravel policies, called by controllers/resources before returning project-scoped client data.

## Decision: audit every sensitive transition and denied write

**Rationale**: Membership and domain policy changes are access-control mutations. They must be recorded at mutation time through `AuditLogger`, matching existing practice.

**Events**: `client_organization.created`, `client_domain.verified`, `trusted_domain_policy.updated`, `project_invitation.created`, `project_invitation.accepted`, `project_membership.approved`, `project_membership.rejected`, `project_membership.suspended`, `project_membership.removed`, `permission.denied`.

## Open Questions Resolved as Assumptions

- Email sending does not need a new provider decision in the spec; local/dev acceptance can expose or log the invitation URL while production can use Laravel notifications/mail.
- Membership roles are project-scoped and separate from system roles. The initial set is `client_viewer`, `client_contributor`, `client_admin`.
- Existing Client-role accounts may continue to exist; approved project membership becomes the client data access authority for this feature.
