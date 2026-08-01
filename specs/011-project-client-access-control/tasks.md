# Tasks: Project Client Access Control

**Input**: Design documents from `/specs/011-project-client-access-control/`

**Prerequisites**: feature.json, constitution.md, spec.md, plan.md, research.md, data-model.md, quickstart.md, project-client-access-control.openapi.yaml, requirements.md.

**Tests**: Required. This feature adds backend endpoints, schema, model relationships, authorization rules, and audit-sensitive mutations. Backend feature tests are release blockers; frontend validation remains manual/browser-based unless this repository gains a frontend test harness.

**Organization**: Tasks are grouped by user story priority. Schema and authorization foundations land first because every story depends on them.

## Path Conventions

Backend-first feature with a focused frontend management surface.

```text
backend/app/Models/
backend/app/Http/Controllers/
backend/app/Http/Resources/
backend/app/Services/
backend/app/Support/ or backend/app/Policies/
backend/database/migrations/
backend/tests/Feature/
frontend/src/
```

## Phase 1: Setup

- [x] T001 Confirm the current branch is `011-project-client-access-control` and the working tree contains no unrelated changes.
- [x] T002 Review existing `User`, `HasRole`, `Project`, `ProjectAssignment`, `ProjectOwnership`, `AuditLogger`, authenticated route middleware, and current project/access Feature tests before coding.
- [x] T003 Confirm the implemented route names will match the 16 paths in `specs/011-project-client-access-control/project-client-access-control.openapi.yaml`.

---

## Phase 2: Foundations - Schema, Models, Constants, and Shared Authorization

**Goal**: Add the data structures and shared helpers needed by every story without changing unrelated behavior.

- [x] T004 Create additive migrations for `client_organizations`, nullable `projects.client_organization_id`, `client_domains`, `project_memberships`, and `project_invitations`.
- [x] T005 Add indexes and uniqueness constraints from data-model.md: unique domain, unique `(client_organization_id, project_id, user_id)` membership identity, `(user_id, project_id, state)`, and `(client_organization_id, state)`.
- [x] T006 Update `Project` with nullable client organization relationship while preserving existing assignment/ownership relationships and `scopeAccessibleTo()` behavior for non-client-organization projects.
- [x] T007 Add `ClientOrganization`, `ClientDomain`, `ProjectMembership`, and `ProjectInvitation` Eloquent models with fillable fields, casts, and relationships.
- [x] T008 Add string constants or backed enums for trusted-domain policy modes, invitation states, membership states, project membership roles, client domain statuses (`verified`, `removed`), and client organization statuses.
- [x] T009 Add API Resources for client organizations, domains, invitations, memberships, and audit-log responses that never serialize token hashes or raw Eloquent models.
- [x] T010 Add a shared project/client access service or policy that composes `HasRole`, project ownership, existing project access, `projects.client_organization_id`, `ProjectMembership.state`, and project membership role permissions.
- [x] T011 Add unit or Feature-level coverage for the shared access service: internal roles preserve existing behavior, legacy client projects preserve existing assignment behavior, and client-organization projects require approved `ProjectMembership`.
- [x] T012 Add backend Resource/query scoping helpers for client-safe serialization so Client-role responses omit internal-only tasks, comments, files, support notes, audit metadata, and user-management data.
- [x] T013 Add Feature tests proving client-safe serialization is enforced by backend responses, not frontend filtering.

---

## Phase 3: User Story 1 - Project-scoped invitation and membership (Priority: P1)

**Goal**: A Project Manager/Admin can invite a client contact to exactly one project and grant access only after policy-approved membership exists.

**Independent Test**: Invite `alex@clientco.example` to Project A, accept it, and verify Project A access only.

- [x] T014 Add invitation token service that generates plaintext once, stores only `token_hash`, validates expiration, and rejects invalid/expired/revoked tokens.
- [x] T015 Add project invitation create/list routes and controller actions for `/projects/{project}/invitations`.
- [x] T016 Add invitation acceptance route and controller action for `/project-invitations/accept`, creating or updating one `ProjectMembership`.
- [x] T017 Ensure invitation creation is authorized for Admins, owning Project Managers, and allowed `client_admin` members only where policy permits.
- [x] T018 Add Feature tests for invitation creation, plaintext-token one-time exposure, hashed token storage, expiration rejection, acceptance, and same-client different-project denial.

---

## Phase 4: User Story 2 - Verified domains and public providers (Priority: P1)

**Goal**: Corporate domains can be trusted by policy, while Gmail/Yahoo/Outlook-style domains require explicit invitation or approval.

**Independent Test**: `clientco.example` can auto-approve under policy; `gmail.com` cannot be verified and never auto-approves.

- [x] T019 Add normalized email/domain parsing and case-insensitive matching.
- [x] T020 Add public-provider detection for at least Gmail, Yahoo, Outlook, Hotmail, and Live.
- [x] T021 Add client organization create/list and trusted-domain policy update routes/controllers.
- [x] T022 Add project client organization association route/controller for `/projects/{project}/client-organization`.
- [x] T023 Add client domain list/create/remove routes/controllers with public-provider rejection and audit logging. Valid domains are created as `verified`; rejected domains are validation failures, not stored rows.
- [x] T024 Add trusted-domain policy evaluation for `domain_auto_approve`, `invitation_only`, and `manual_approval`.
- [x] T025 Add Feature tests for project client organization association, verified corporate auto-approval, manual approval remaining pending, invitation-only behavior, public-provider domain validation failure, and public-provider invite/manual approval success.

---

## Phase 5: User Story 3 - State-based authorization (Priority: P2)

**Goal**: Only `approved` memberships grant access; every other state fails closed.

**Independent Test**: Suspend and remove an approved member; their next project request is denied.

- [x] T026 Add project membership list route/controller for `/projects/{project}/memberships`.
- [x] T027 Add approve, reject, suspend, restore, remove, and expire membership routes/controllers, updating the same membership row in place and relying on audit logs for transition history.
- [x] T028 Wire Client-role project, nested task, comment, attachment, support, report, and notification access paths through the shared project/client access helper.
- [x] T029 Enforce project membership role permissions: `client_viewer` read-only, `client_contributor` read plus allowed client-visible contribution, `client_admin` member-management within project and policy.
- [x] T030 Add Feature tests proving `pending`, `rejected`, `expired`, `suspended`, and `removed` deny reads and writes on project and nested resources.
- [x] T031 Add Feature tests for `client_viewer`, `client_contributor`, and `client_admin` permission boundaries.

---

## Phase 6: User Story 4 - Review queues and audit logging (Priority: P2)

**Goal**: Admins and authorized Project Managers can review pending access and every sensitive mutation is audited.

**Independent Test**: Change policy, accept a public-provider invite, approve/reject/suspend/remove membership, and verify audit entries.

- [x] T032 Add `/client-membership-review` endpoint with filters for client organization, project, domain type, state, and age.
- [x] T033 Add `AuditLogger` calls for organization creation, project client organization association/clear, domain verification/removal, policy update, invitation create/accept/expire/revoke, membership approve/reject/suspend/restore/remove/expire, and denied writes.
- [x] T034 Extend audit log filtering for `client_organization_id`, `project_id`, `membership_user_id`, `action`, `date_from`, and `date_to`, matching OpenAPI.
- [x] T035 Add Feature tests asserting audit entries include actor, action, target, project, client organization, and useful context for every sensitive transition and one denied write.
- [x] T036 Add Feature tests for review queue filtering and authorization.

---

## Phase 7: User Story 5 - Multi-client isolation (Priority: P3)

**Goal**: A client can never discover another client organization's projects, invitations, memberships, files, comments, support issues, reports, notifications, or audit details.

**Independent Test**: ClientCo and VendorCo each have two projects; each client account sees only its approved project.

- [x] T037 Add isolation Feature tests for project index/show and direct ID access across two organizations and multiple projects.
- [x] T038 Add isolation Feature tests for detailed activities, comments, attachments, support ops endpoints, reports, and notifications.
- [x] T039 Add tests that clients cannot access audit logs or organization-level review queues.
- [x] T040 Confirm inaccessible direct-ID responses follow the repository's existing non-enumerating inaccessible-resource behavior where applicable.

---

## Phase 8: Frontend management surfaces (Priority: P3)

**Goal**: Internal users can manage organizations, domains, invitations, memberships, and approvals without weakening backend enforcement.

- [x] T041 Add frontend API helpers matching all relevant OpenAPI paths.
- [x] T042 Add Admin UI for client organization create/list, project association/clear, policy update, and domain management.
- [x] T043 Add project-level invitation and membership panels for Admins and owning Project Managers.
- [x] T044 Add review queue UI for pending/manual/public-provider approvals.
- [x] T045 Add membership transition controls for approve, reject, suspend, restore, remove, and expire with clear state labels.
- [x] T046 Ensure client-facing views do not display fields omitted by backend client-safe Resources.
- [x] T047 Manually verify quickstart.md scenarios 1-6 in the browser.

---

## Phase 9: Polish & Cross-Cutting Verification

- [x] T048 Run `php artisan test` and fix regressions.
- [x] T049 Run frontend lint/build if frontend files changed.
- [x] T050 Validate OpenAPI syntax and compare implemented routes with `project-client-access-control.openapi.yaml`.
- [x] T051 Run `git status` and confirm only intended files changed.
- [x] T052 Update quickstart.md only if implementation details materially changed during build.

## Dependencies & Execution Order

- T001-T003 before any implementation.
- T004-T013 before endpoint work.
- T014-T018 and T019-T025 are both P1 and may proceed after foundations; policy evaluation from T024 must land before final invitation acceptance behavior is complete.
- T026-T031 depends on T010 and P1 membership creation.
- T032-T036 depends on membership/domain/invitation routes existing.
- T037-T040 depends on the shared access helper being wired through client-facing resource paths.
- Frontend work starts after backend contract and route behavior stabilize.
- T048-T051 are release blockers.

## Parallel Opportunities

- T007 model work and T009 resource work can be split after migrations are sketched.
- T019/T020 domain parsing can proceed in parallel with T014 token service.
- T035 audit tests and T036 review queue tests can be written alongside their endpoints once expected event names are stable.
- T041 frontend API helpers can begin once OpenAPI route names settle.

## Implementation Strategy

1. Ship foundations with tests first: schema, models, constants, resources, shared access helper.
2. Deliver P1 backend behavior: project invitations plus verified-domain/public-provider policy.
3. Add state transitions and full authorization wiring.
4. Add audit/review surfaces.
5. Prove isolation across every client-facing path.
6. Build frontend management UI and run quickstart/manual regression.
