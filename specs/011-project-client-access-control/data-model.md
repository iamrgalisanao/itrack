# Phase 1 Data Model: Project Client Access Control

## ClientOrganization

Represents a customer/client boundary.

| Field | Type | Notes |
|---|---|---|
| `id` | bigint | Primary key |
| `name` | string | Required, unique enough for Admin display |
| `slug` | string | Unique, normalized identifier |
| `trusted_domain_policy` | string | `domain_auto_approve`, `invitation_only`, `manual_approval` |
| `status` | string | `active`, `suspended`, `archived` |
| `created_by_user_id` | FK users | Actor who created it |
| timestamps | timestamps | Laravel standard |

## Project Relationship

Client-access-controlled projects are associated with exactly one client organization through an additive nullable field on `projects`.

| Field | Type | Notes |
|---|---|---|
| `projects.client_organization_id` | FK nullable | Null for legacy/internal projects; set when client access is governed by this feature |

**Rules**:

- A null `client_organization_id` preserves existing project assignment behavior.
- A non-null `client_organization_id` means Client-role access is governed by approved `ProjectMembership`.
- Admin and Project Manager visibility remains governed by existing `HasRole`, assignment, and ownership rules.

## ClientDomain

Verified corporate email domain for one client organization.

| Field | Type | Notes |
|---|---|---|
| `id` | bigint | Primary key |
| `client_organization_id` | FK | Required |
| `domain` | string | Lowercase normalized domain, unique globally |
| `status` | string | `verified`, `removed` |
| `verified_at` | datetime nullable | Set when verified |
| `verified_by_user_id` | FK users nullable | Admin actor |
| timestamps | timestamps | Laravel standard |

**Rules**:

- Public provider domains cannot be `verified`.
- Domain comparison is case-insensitive after trimming.
- A domain belongs to exactly one client organization.
- Domains are created directly as `verified` by an authorized Admin action. Rejected public-provider or malformed domains are validation failures, not stored `rejected` rows.

## ProjectMembership

Project-scoped access grant for a user in a client organization.

| Field | Type | Notes |
|---|---|---|
| `id` | bigint | Primary key |
| `client_organization_id` | FK | Required |
| `project_id` | FK projects | Required |
| `user_id` | FK users | Required |
| `role` | string | `client_viewer`, `client_contributor`, `client_admin` |
| `state` | string | `pending`, `approved`, `rejected`, `expired`, `suspended`, `removed` |
| `approved_at` | datetime nullable | Set on approval |
| `approved_by_user_id` | FK users nullable | Admin/authorized approver |
| `suspended_at` | datetime nullable | Set on suspension |
| `removed_at` | datetime nullable | Set on removal |
| timestamps | timestamps | Laravel standard |

**Indexes/constraints**:

- Unique membership identity: `(client_organization_id, project_id, user_id)`. State changes update the same row in place; historical detail is retained in audit logs rather than duplicate membership rows.
- Index `(user_id, project_id, state)` for authorization checks.
- Index `(client_organization_id, state)` for review queues.

## ProjectInvitation

Invitation to join one project for one client organization.

| Field | Type | Notes |
|---|---|---|
| `id` | bigint | Primary key |
| `client_organization_id` | FK | Required |
| `project_id` | FK projects | Required |
| `email` | string | Lowercase normalized address |
| `email_domain` | string | Lowercase normalized domain |
| `role` | string | Requested project membership role |
| `state` | string | `pending`, `accepted`, `expired`, `revoked` |
| `token_hash` | string | Hashed token only |
| `invited_by_user_id` | FK users | Actor |
| `accepted_by_user_id` | FK users nullable | User who accepted |
| `accepted_at` | datetime nullable | Acceptance time |
| `expires_at` | datetime | Required |
| timestamps | timestamps | Laravel standard |

**Rules**:

- Token plaintext is never persisted.
- Acceptance must verify token, email identity, project, state, and expiration.
- Acceptance creates or updates a `ProjectMembership`; it does not bypass membership policy.
- Under `manual_approval`, accepting a valid invitation records the invitation as `accepted` and leaves the membership `pending` until approval.

## Role Permission Matrix

| Project membership role | Read client-visible project data | Comment/upload client-visible artifacts | Invite/manage project client members |
|---|---:|---:|---:|
| `client_viewer` | Yes | No | No |
| `client_contributor` | Yes | Yes | No |
| `client_admin` | Yes | Yes | Yes, within project and organization policy |

System Admin and Project Manager authority remains governed by existing `HasRole` predicates and project ownership rules.

## State Transitions

```text
Invitation: pending -> accepted
Invitation: pending -> expired
Invitation: pending -> revoked

Membership: pending -> approved
Membership: pending -> rejected
Membership: approved -> suspended
Membership: approved -> removed
Membership: suspended -> approved
Membership: suspended -> removed
Membership: pending -> expired
```

Only `approved` grants access.

## Isolation Rules

- All project data queries for client users must constrain by approved membership on the requested project.
- Organization-level administration views must constrain by client organization and authorized internal actor.
- Nested resources under projects, detailed activities, comments, attachments, support issues, reports, and notifications must derive project access from the same authorization service.
- Audit log client/project filters are Admin-visible and must not expose audit logs to client users.
