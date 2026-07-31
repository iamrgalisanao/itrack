# Quickstart: Validating Project Client Access Control

## Prerequisites

- Backend running: `cd backend && php artisan serve`.
- Frontend running: `cd frontend && npm run dev`.
- Database migrated with this feature's additive migrations.
- Seed or create two client organizations, each associated with two projects through `projects.client_organization_id`.
- Have one Admin, one Project Manager owning at least one project, and at least two Client-role users.

## Scenario 1 - Project-scoped invitation and approval

1. Sign in as a Project Manager who owns Project A.
2. Create or select ClientCo.
3. Invite `alex@clientco.example` to Project A as `client_viewer`.
4. Accept the invitation as Alex.
5. Expected: Alex receives `approved` membership if policy permits auto-approval; otherwise Alex remains `pending` until Admin approval.
6. Sign in as Alex and list projects.
7. Expected: Project A appears; Project B and all other client projects do not appear.

## Scenario 2 - Verified corporate domain policy

1. Sign in as Admin.
2. Add `clientco.example` as a verified domain for ClientCo.
3. Set ClientCo policy to `domain_auto_approve`.
4. Invite `sam@clientco.example` to Project A and accept it.
5. Expected: Sam is approved for Project A only.

## Scenario 3 - Public provider exception handling

1. Invite `pat@gmail.com` to Project A.
2. Accept the invitation as Pat.
3. Expected: Pat is not auto-approved by domain trust and follows invitation-only or manual approval policy.
4. Try adding `gmail.com`, `yahoo.com`, `outlook.com`, `hotmail.com`, or `live.com` as a verified domain.
5. Expected: validation rejects the domain.

## Scenario 4 - Membership states deny access unless approved

1. Create memberships for the same user/project in each non-approved state: `pending`, `rejected`, `expired`, `suspended`, `removed`.
2. Attempt to show the project and nested project data as that user.
3. Expected: every non-approved state is denied.
4. Approve the membership and retry.
5. Expected: client-visible project data is available according to the project role.

## Scenario 5 - Multi-client and multi-project isolation

1. Create ClientCo Project A/B and VendorCo Project C/D.
2. Approve Alex only for ClientCo Project A.
3. As Alex, request project indexes, direct project IDs, reports, support issue endpoints, comments, files, and notifications for B/C/D.
4. Expected: no unauthorized project data or client organization data is returned or inferable.

## Scenario 6 - Audit logging

1. Create an organization, verify a domain, update policy, create an invitation, accept it, approve it, suspend it, remove it, and attempt one denied write.
2. Sign in as Admin and open audit logs.
3. Expected: every sensitive action has an audit entry with actor, action, target, project, client organization, and useful context.

## Regression Check

- Run `php artisan test`.
- Confirm existing user management, project assignment, project ownership, preview session, support ops, comment, attachment, notification, and report tests still pass.
- Manually confirm existing Admin/Project Manager project administration behavior is unchanged.
