# Implementation Plan: Project Client Access Control

**Branch**: `011-project-client-access-control` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-project-client-access-control/spec.md`

## Summary

Adds a first-class client organization and project membership layer for client access, with an additive nullable `projects.client_organization_id` relationship, project invitations, verified corporate domains, public-provider exception handling, configurable trusted-domain policies, membership states, project-scoped roles, and audit logging. The implementation extends the current Laravel/Sanctum authorization model by composing existing `HasRole` predicates, `Project::accessibleTo`, project ownership, and audit logging with new membership-policy checks, rather than replacing the repository's RBAC architecture.

## Technical Context

**Language/Version**: PHP 8.4 / Laravel 13 backend; React 19 / Vite / Tailwind frontend.

**Primary Dependencies**: Existing Laravel Sanctum auth, Eloquent models/resources/controllers, `HasRole`, `Project::accessibleTo`, `AuditLogger`, existing React auth context and project administration pages. No new framework required.

**Storage**: MySQL via additive Laravel migrations for client organizations, nullable `projects.client_organization_id`, client domains, trusted-domain policy fields, project memberships, and project invitations. Membership state changes update the same membership row in place; audit logs retain transition history.

**Testing**: `php artisan test` with new backend Feature tests for invitations, domain policy, membership authorization, isolation, audit logging, and state transitions. Frontend validation remains manual/browser-based per existing practice.

**Target Platform**: Same iTrack web application, authenticated SPA backed by `/api` routes.

**Project Type**: Web application with `backend/` and `frontend/`.

**Performance Goals**: Membership checks must remain index-backed by `user_id`, `project_id`, `client_organization_id`, and `state`; project list filtering should remain comparable to existing project-assignment scoping for normal account sizes.

**Constraints**: Fail closed on unknown role, missing membership, expired invite, unverified domain, public-provider domain, suspended membership, and removed membership. Do not destructively change existing project assignments or ownerships. Existing `ProjectAssignment` behavior remains available for Team Members and legacy projects; Client-role access to projects with `client_organization_id` is governed by approved `ProjectMembership`. Do not expose invitation token hashes or internal audit metadata to clients.

**Scale/Scope**: One backend access-control feature spanning new models, migrations, controllers/resources, policy/service helpers, tests, 16 OpenAPI-described paths, and a focused frontend administration flow for organizations, invitations, memberships, and policy review.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

See [constitution.md](./constitution.md). All six principles apply and pass; no exception is required.

**Post-Phase 1 re-check**: The data model, OpenAPI contract, quickstart, and tasks preserve additive migrations, Laravel Resources, real Sanctum auth, fail-closed membership checks, and required audit logging. Gate remains **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/011-project-client-access-control/
|-- feature.json
|-- constitution.md
|-- spec.md
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- project-client-access-control.openapi.yaml
|-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
backend/
|-- app/Enums/                         # optional string-backed enums for membership/policy states
|-- app/Http/Controllers/              # client organizations, domains, invitations, memberships
|-- app/Http/Resources/                # curated API responses
|-- app/Models/                        # Project update plus ClientOrganization, ClientDomain, ProjectMembership, ProjectInvitation
|-- app/Policies/ or app/Support/      # membership authorization helpers composed with HasRole
|-- app/Services/                      # invitation token, domain policy, membership/audit services
|-- database/migrations/               # additive client tables plus nullable projects.client_organization_id
`-- tests/Feature/

frontend/
`-- src/
    |-- components/                    # policy/membership/invitation panels
    |-- pages/                         # admin/project access management surfaces
    `-- services/ or lib/              # API calls matching the OpenAPI contract
```

**Structure Decision**: The backend owns all authorization, policy, and isolation behavior. The frontend only exposes management workflows and never filters unauthorized data into safety. Project membership is a new access layer for Client-role users on projects associated with a client organization, while internal Admin/Project Manager/Department Head/Team Member flows continue through the existing role and assignment/ownership mechanisms.

## Phase Outputs

### Phase 0: Research

[research.md](./research.md) records the resolved architecture decisions:

- introduce `ClientOrganization` instead of overloading department or assignment rows;
- use approved `ProjectMembership` for Client-role access on client-organization projects;
- treat public providers as allowed invite/approval addresses, never trusted corporate domains;
- store trusted-domain policy on the client organization;
- compose authorization with existing RBAC rather than replacing it;
- audit sensitive transitions and denied writes through `AuditLogger`.

### Phase 1: Design

[data-model.md](./data-model.md), [quickstart.md](./quickstart.md), and [project-client-access-control.openapi.yaml](./project-client-access-control.openapi.yaml) define:

- client organizations and nullable project association;
- verified domains and trusted-domain policy;
- invitations with hashed tokens and accepted-vs-approved behavior;
- single-row project memberships with state transitions;
- project-scoped membership roles;
- project client-organization association, review queue, membership transition, invitation, domain, organization, and audit-log API surfaces.

## Complexity Tracking

*No Constitution Check violations - this section is intentionally empty.*
