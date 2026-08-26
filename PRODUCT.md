# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Five fixed roles, all internal to organizations delivering client project work:

- **Project Manager** — owns project delivery: monitors progress, follows up on blockers, manages
  schedule risk, reviews dependencies, manages team accountability, reports status to stakeholders.
- **Team Member** — completes assigned tasks, updates task status, comments on blockers, uploads
  deliverables.
- **Admin** — manages users, roles, permissions, project settings, workspace access, and
  cross-department visibility.
- **Department Head** — reviews project health, delivery risk, overdue work, blockers, timeline
  status, and team accountability for projects under their department only (expandable by Admin grant).
- **Client** — views approved project-level summaries, selected task details explicitly enabled for
  client visibility, client-visible comments, shared files, and project reports; never sees internal
  team coordination.

## Product Purpose

A centralized project management workspace. Its reason to exist: project managers, team members,
admins, clients, and department heads currently cannot easily see which tasks are delayed, who owns
them, how work is scheduled, which tasks block others, or what needs action next — causing late
follow-ups, unclear accountability, missed deadlines, and reactive management. Success means project
status, ownership, deadlines, blockers, and dependencies are visible in one place without anyone
requesting a manual status update.

## Positioning

Every feature — Dashboard, Kanban, Taskboard, Bug Tracker, Reports, Schedule/Gantt, Retrospectives,
Support Ops — is a different view or aggregation over one shared data hierarchy:
`Project → Module → Activity → SubActivity → DetailedActivity`. A neighboring product built as
separate tools per view (a Kanban tool, a bug tracker, a reporting tool) could not truthfully copy
this: in iTrack, moving a task in one view is the same underlying record everywhere else, so status,
ownership, and schedule risk never drift out of sync between views.

## Operating Context

- Backend: Laravel 13 (PHP 8.4) REST API. Frontend: React 19 SPA (Vite, Tailwind v4, shadcn/Radix),
  calling the API over Sanctum session auth — not an Inertia app.
- Access control is role-based and tenant/project-scoped: Admin/PM see everything; Department Head is
  scoped by department grant; Team Member by project assignment; Client by assignment or an approved
  membership tied to their client organization. A disabled account loses access on its next request.
- An Admin can preview the app as another user (read-only, writes blocked mid-preview) for support and
  QA without impersonating them in audit logs.
- Client-visible data is explicit per record (a `client_visible` flag), never implied by role alone —
  clients see project-level summaries by default; task-level detail is opt-in per task/milestone/section.
- Sensitive mutations (role changes, permission/department grants, deletes, access revocations) are
  audit-logged at the point of mutation.
- Development follows a spec-first workflow (`specs/NNN-feature-name/`, Spec Kit) governed by a
  binding project constitution (`.specify/memory/constitution.md`).

## Capabilities and Constraints

- In-app notifications for all relevant events; email notifications reserved for high-signal events only.
- Schedule visualization via Calendar, Timeline, and Gantt Chart views (v1: task bars, milestones, basic
  dependencies; advanced critical path and resource leveling are deferred).
- File attachments up to 100 MB per file.
- Project health is manually selected by the Project Manager, supported by automated warning signals —
  not a fully automated computation.
- Comments carry an Internal / Client-visible distinction; Internal comments are never client-reachable.
- Only Admins and assigned Project Managers can archive a project.
- Deferred beyond v1: advanced automation, budget tracking, workload capacity planning, complex resource
  forecasting.
- Stack is fixed for the current phase (Laravel/PHP/MySQL + React/Vite/Tailwind/shadcn/Sanctum);
  introducing a new framework, state-management library, or ORM requires a constitution amendment.

## Brand Commitments

Product name: **iTrack**. No logo, documented voice/tone, or other visual brand asset exists yet in
the repository — do not invent one.

## Evidence on Hand

- `docs/prd.md` — v1.2 PRD: problem statement, goals, success metrics, personas, v1 product decisions,
  user stories with acceptance criteria. Historical/frozen per the constitution; new scope is captured
  under `specs/`, not edited into this file.
- `docs/prd_v2.md`, `docs/epic_backlog_for_v2.md`, `docs/P2A_implementation_plan.md` — frozen historical
  planning context for scope not yet ported into `specs/`.
- `specs/NNN-feature-name/` — per-feature spec/plan/tasks/research docs explaining why each shipped
  feature was built the way it was.
- No user research recordings, screenshots, testimonials, or analytics dashboards found in the repo —
  do not fabricate usage numbers beyond the PRD's stated target metrics.

## Product Principles

1. One data hierarchy, many views — a new feature is almost always a new lens on
   Project→Module→Activity→SubActivity→DetailedActivity, not a new data model.
2. Visibility and accountability over automation — v1 prioritizes surfacing status, ownership, and
   risk; heavier automation, budgeting, and forecasting are deliberately deferred.
3. Client-safe by construction — client-reachable data is an explicit, per-record decision, never a
   role-based default that has to be double-checked later.
4. Fail-closed access — an unrecognized role, a disabled account, or an unscoped query is treated as
   denied, not as an edge case to patch afterward.
5. Spec before code — new scope is written down (`specs/`) and checked against the constitution before
   implementation, not reconstructed from the diff afterward.

## Accessibility & Inclusion

WCAG 2.1 AA. Matches the keyboard-navigation, semantic-HTML, and accessible-labeling expectations
already required by the constitution's Frontend Design and Review Governance section; no
product-specific accessibility need beyond that standard has been raised.
