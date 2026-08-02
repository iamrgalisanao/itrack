<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Modified principles: none renamed or removed
- Added sections:
  - VII. Installed Coding-Standard Skills Govern Implementation
  - VIII. Definition-of-Done Gate (tests, authorization, tenant isolation, OWASP, code-slop)
- Removed sections: none
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ generic, Constitution Check gate reads this file dynamically — no edit needed
  - .specify/templates/spec-template.md ✅ generic, no principle-specific sections referenced — no edit needed
  - .specify/templates/tasks-template.md ✅ generic task categories already cover testing/backend/frontend — no edit needed
  - .claude/skills/speckit-*/SKILL.md ✅ reviewed, no CLAUDE-only or stale agent-specific references found
  - Development Workflow §4 ✅ updated to reference the new Definition-of-Done Gate instead of a bare test-run note
- Follow-up TODOs:
  - TODO(TYPESCRIPT_ADOPTION): frontend is currently JS/JSX (React 19/Vite), not TypeScript. Principle VII's
    TypeScript-conformance clause is written prospectively; it activates automatically if/when the frontend
    adopts TS, requiring no further amendment.
  - laravel-inertia-react skill is installed but not currently applicable (iTrack uses a separate SPA over a
    Sanctum session API, not Inertia); retained for reference, not an active gate.
-->

# iTrack Constitution

## Core Principles

### I. Fail-Closed Access Control
Every privileged check MUST go through the `HasRole` trait's predicate methods
(`isAdmin()`, `isPmOrAdmin()`, `isDepartmentHead()`, `canWrite()`, etc.) — never
by comparing `$user->role` against a raw string inline. A user whose role is
null, unrecognized, or fails `hasValidRole()` MUST be denied (403), not granted
by default. New roles or permission scopes are added to `User::validRoles()`
and the trait first; ad-hoc role checks scattered across controllers are a
constitution violation.

**Rationale**: iTrack has five fixed operational roles gating access to
client-visible and internal data. A single missed or inverted string
comparison silently turns into a data-exposure bug; centralizing the checks
makes the fail-safe behavior auditable in one place.

### II. Consistent API Contracts
Every API endpoint returns data through a Laravel API Resource (or an
explicit curated array, as `AuthController::curatedUser()` does for the user
object) — controllers MUST NOT return raw Eloquent models or
`$model->toArray()` to the client. New resources follow the existing nested
route conventions (`Route::apiResource(...)->shallow()`) already used for
Modules → Activities → SubActivities → DetailedActivities. Fields that are
sensitive (passwords, tokens, internal-only metadata) are never serialized.

**Rationale**: The frontend and any future integrations depend on a stable,
predictable JSON shape. Returning raw models leaks internal columns the
moment someone adds a sensitive field to a migration.

### III. Test Coverage Grows With the Feature, Not After It
A new or changed backend endpoint, model relationship, or authorization rule
MUST ship with a corresponding test under `backend/tests/Feature` in the same
change — covering at minimum the happy path and one denied/unauthorized path
for anything role-gated. Existing thin coverage is not a license to keep
adding untested surface area; it is debt to pay down opportunistically, not a
precedent to extend.

**Rationale**: `backend/tests/Feature` already has the pattern
(`RoleAccessTest`, `AuthenticationTest`) — the gap is in CRUD coverage for
Projects/Modules/Activities/DetailedActivities. Letting that gap grow makes
the eventual real-auth cutover and permission hardening work far riskier to
verify.

### IV. Audit Sensitive Mutations
Role changes, permission/department grants, and destructive operations
(deletes, access revocations) MUST be recorded via `App\Services\AuditLogger`
at the point of mutation, not reconstructed later from other tables. If a new
sensitive action has no obvious audit hook, adding one is part of the task,
not a follow-up.

**Rationale**: `AuditLog` and `DepartmentGrant` already exist for this
purpose; audit trails are only trustworthy if every sensitive write path uses
them consistently.

### V. Small, Additive, Reversible Migrations
Schema changes are additive and nullable by default (matching the existing
pattern in `2026_06_25_014400_add_client_visible_to_detailed_activities_table.php`
and the proposed Support Ops fields). A migration touches one concern.
Destructive changes (dropping/renaming columns in use, changing a column's
meaning) require an explicit call-out in the spec's plan and a stated
rollback path — they are never bundled silently into an unrelated feature
migration.

**Rationale**: iTrack's data model is shared across Dashboard, Kanban,
Reports, and Schedule views simultaneously; an unreviewed destructive
migration breaks multiple screens at once with no easy way back.

### VI. Real Auth Is the Only Forward Path
`AuthContext`, `RequireAuth`, and `Login.jsx` already implement real
Sanctum-session authentication on the frontend; the mock `localStorage`
role-switcher in `App.jsx`/`UserContext` is legacy scaffolding from before
that existed. New frontend feature work MUST build against the real
`useAuth()`/`user.role` model. Extending the mock switcher with new roles,
departments, or gating logic is prohibited — every such extension increases
the cost of the cutover this constitution requires.

**Rationale**: Running two parallel identity systems (mock persona dropdown
vs. real session auth) is the single largest correctness risk in the current
codebase — features built against the mock model have to be redone once auth
is wired up for real.

### VII. Installed Coding-Standard Skills Govern Implementation
Backend PHP/Laravel code MUST conform to the rules in the installed
`php-best-practices` and `laravel-best-practices` skills
(`.claude/skills/php-best-practices`, `.claude/skills/laravel-best-practices`).
Frontend React code MUST conform to the installed `react-vite-best-practices`
skill; if the frontend adopts TypeScript, the corresponding installed
TypeScript skill becomes mandatory from that point forward without requiring
a further constitution amendment. These skills are consulted during
implementation, not left as passive references — when a plan or task touches
PHP/Laravel or React/TypeScript source, its rules take precedence over ad hoc
style choices. The installed `laravel-inertia-react` skill is not currently
enforced: iTrack's frontend is a separate SPA calling a Sanctum session API,
not an Inertia application; it is retained only in case that architecture
changes.

**Rationale**: Skills were installed specifically to give this project a
consistent, checkable style and architecture baseline across PHP and React.
A skill nobody is required to follow is documentation, not a standard —
naming them here makes conformance part of the definition of "done," not an
optional nicety.

### VIII. Definition-of-Done Gate
A task or feature MUST NOT be marked complete until all of the following
pass, in addition to Principle III's per-change test requirement:

1. **Automated tests green** — `php artisan test` (backend) and any
   configured frontend test suite pass for the changed surface.
2. **Authorization check reviewed** — every new or changed endpoint's role
   gate is checked against Principle I (Fail-Closed Access Control); no
   inline role-string comparisons, no default-allow paths.
3. **Tenant/organization-isolation check reviewed** — every new or changed
   query or endpoint is checked to confirm it cannot return or mutate data
   outside the acting user's accessible Projects/ClientOrganizations (e.g.
   via `Project::accessibleTo()` or the equivalent membership/grant scope for
   the resource), not merely role-gated in isolation.
4. **OWASP review run** — the installed `laravel-owasp-security` skill
   (`.claude/skills/laravel-owasp-security`) is applied to the changed
   backend/frontend surface before sign-off.
5. **code-slop review run** — the installed `code-slop` skill
   (`.claude/skills/code-slop`) is applied to the diff before sign-off.

A feature whose plan or task list cannot satisfy one of these gates must
either change its approach or document the exception and why it's necessary,
per the Governance section below — it must not silently skip the gate.

**Rationale**: iTrack's access model spans five roles and multiple
project/client-organization boundaries (Principle I, Fail-Closed Access
Control); the two failure modes that matter most — a missing authz check and
a cross-project/cross-organization data leak — are exactly the ones easy to
miss in code review without a named, mandatory gate. OWASP and code-slop
review close the remaining gap between "it works" and "it's safe and not
AI-slop to maintain."

## Delivery Constraints

- **Stack is fixed for this phase**: Laravel 13 / PHP 8.4 / MySQL backend,
  React 19 / Vite / Tailwind v4 / Shadcn (Radix) frontend, Sanctum session
  auth. Introducing a new framework, state-management library, or ORM
  requires a constitution amendment, not a per-feature decision.
- **Historical planning docs are frozen**: `docs/prd.md`, `docs/prd_v2.md`,
  `docs/epic_backlog_for_v2.md`, and `docs/P2A_implementation_plan.md` remain
  as historical/reference context for scope not yet ported into `specs/`.
  They are not edited going forward — new or changed scope is captured as a
  spec under `specs/`, even when it originated as a v2 epic.
- **Client-visible data stays explicit**: any field or endpoint a Client-role
  user can reach MUST be reasoned about explicitly in the spec (reuse the
  existing `client_visible` flag pattern on `DetailedActivity` rather than
  inventing a parallel visibility mechanism).

## Development Workflow

1. Every feature starts as a spec (`/speckit-specify`) before any code is
   written — this supersedes the old PRD → epic backlog → implementation
   plan pipeline in `docs/`.
2. `/speckit-plan` MUST include a Constitution Check against the principles
   above before Phase 0 research begins, and MUST re-check after Phase 1
   design.
3. `/speckit-tasks` breaks the plan into tasks that include their own test
   tasks per Principle III — a feature's task list is incomplete if it has
   implementation tasks with no matching test task.
4. Backend changes run `php artisan test` (or the project's configured
   PHPUnit invocation), frontend changes are manually verified in the browser
   (per this project's existing UI-testing practice), and every gate in
   Principle VIII (Definition-of-Done Gate) passes before a feature is
   considered done.

## Governance

This constitution supersedes ad-hoc practice and the frozen `docs/` planning
files for anything in conflict. Amendments are made by editing this file
directly, with a Sync Impact Report prepended as an HTML comment describing
the version bump and what changed — the same mechanism used to produce this
version. Versioning follows semver: MAJOR for principle removals/incompatible
redefinitions, MINOR for new principles or materially expanded guidance,
PATCH for wording/clarification only. Every `/speckit-plan` run is the
compliance checkpoint — a plan that cannot satisfy a principle must either
change its approach or document the exception and why it's necessary in that
feature's plan.md, not silently ignore it.

**Version**: 1.1.0 | **Ratified**: 2026-07-22 | **Last Amended**: 2026-08-02
