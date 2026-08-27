<!--
Sync Impact Report
- Version change: 1.4.0 → 1.5.0
- Modified principles: none renamed or removed
- Modified sections:
  - Specialist Agent Routing: adds **Git Workflow Master** as the owner of version-control
    decisions, supervised by the **Software Architect** for irreversible or shared-history actions.
    Adds a "Version Control Authority" subsection defining precisely which actions are routine
    (decide and execute) and which require architect sign-off before execution, so "supervision"
    is a checkable condition rather than a sentiment.
- Rationale: git decisions in this repo have been made ad hoc by the orchestrating session
  throughout 021-023 — branch naming, commit granularity, merge vs squash, when to push, when to
  delete a branch. Those came out reasonable, but they were never anybody's discipline, and the
  irreversible ones (merging to main, deleting branches, enabling branch protection) were decided
  in the same breath as the reversible ones.
- Templates/skills requiring updates: CLAUDE.md (done in this change)
- Follow-up TODOs: none

Previous report (1.3.0 → 1.4.0) retained below.
- Version change: 1.3.0 → 1.4.0
- Modified principles: none renamed or removed
- Added sections:
  - Specialist Agent Routing (new top-level section, after Development Workflow) — names the
    subagent types that MUST be dispatched for specific work surfaces, and routes by SURFACE rather
    than by task description. Prompted by a concrete miss: features 021-023 did WCAG contrast work
    across three consecutive features without ever dispatching the Section 508 Accessibility
    Specialist, because "fix the contrast tokens" reads as design-system work rather than
    accessibility work. Colourblind distinguishability was consequently never checked at all, on a
    red/amber/green status system where `delayed` and `blocked` now share red.
- Modified sections:
  - Frontend Design and Review Governance → Frontend Review Workflow: the review pass now also
    dispatches the accessibility specialist when the feature touches an accessibility surface.
  - Development Workflow: adds the routing table as a step, so it fires outside Spec Kit too.
- Templates/skills requiring updates:
  - .claude/skills/speckit-plan/SKILL.md — dispatch routing at planning time (done in this change)
  - .claude/skills/speckit-implement/SKILL.md — routing folded into the step 10 review (done)
  - CLAUDE.md — points at the routing table (done)
- Follow-up TODOs: none

Previous report (1.2.0 → 1.3.0) retained below.
- Version change: 1.2.0 → 1.3.0
- Modified principles: none renamed or removed
- Added sections: none (existing Frontend Design and Review Governance section extended in place)
- Modified sections:
  - Frontend Design and Review Governance → Mandatory Skill Usage: the installed `impeccable` skill
    (`.claude/skills/impeccable/`) is now mandatory alongside `frontend-design` for all frontend-related
    work, scoped to Impeccable's **Operate** mode (iTrack's surfaces are internal task-completion tools —
    Work Program, Kanban, Taskboard, Bug Tracker, Retrospectives, Support Ops — not marketing/Persuade
    surfaces), so its "go bold" instinct never overrides Existing Design System First.
  - Frontend Design and Review Governance → Frontend Creation Workflow: implementation must run
    Impeccable's `shape` guidance during planning and `polish`/`harden` during implementation, alongside
    `frontend-design`'s existing inspection steps.
  - Frontend Design and Review Governance → Frontend Review Workflow: the review pass must additionally
    run `/impeccable audit <target>` (deterministic a11y/perf/responsive checks) and `/impeccable critique
    <target>` (UX heuristic review) against the implemented surface, with their findings folded into the
    existing Critical/Major/Minor/Suggestion classification rather than kept as a separate report.
  - Priority of Authority: item 6 now reads "installed `frontend-design` and `impeccable` skill
    recommendations" — both rank below the existing product design system and this constitution, neither
    may override approved requirements, accessibility obligations, or feature scope.
- Removed sections: none
- Templates requiring updates:
  - .claude/skills/speckit-plan/SKILL.md ✅ updated — step 5 (Frontend Design Constraints) now also invokes
    Impeccable's `shape` heuristics during planning and requires the quickstart.md frontend review pass to
    include `/impeccable audit` and `/impeccable critique`.
  - .claude/skills/speckit-implement/SKILL.md ✅ updated — step 10's Code Reviewer gate now requires
    Impeccable's audit/critique findings as part of the frontend review criteria for any frontend-interface
    surface.
  - .claude/agents/engineering-frontend-developer.md ✅ updated — added an explicit instruction to run
    Impeccable's `context.mjs` setup once per session and apply its commands (`shape`, `polish`, `harden`,
    `audit`, `critique`) alongside `frontend-design`, scoped to Operate mode.
  - CLAUDE.md ✅ updated — "Installed skills that govern implementation" now names `impeccable` alongside
    `frontend-design`.
  - other .claude/skills/speckit-*/SKILL.md and templates: reviewed, no edit needed — they reference
    "Frontend Design and Review Governance" by name, not by skill name, so this amendment does not require
    touching them.
- Follow-up TODOs:
  - TODO(TYPESCRIPT_ADOPTION): unchanged from 1.2.0, still pending.
  - The `impeccable` skill (installed via `npx impeccable install`, at `.claude/skills/impeccable/`) needs
    `/impeccable init` run once to write PRODUCT.md, and ideally `/impeccable document` to generate
    DESIGN.md from the existing shadcn/Radix system rather than a fresh brief — until then, its commands
    fall back to reading the incumbent implementation directly (per its own routing rules) rather than
    blocking on missing context.
  - If `impeccable` is ever uninstalled or renamed, this section's mandatory-usage clauses need a
    follow-up amendment, same as the existing `frontend-design` TODO it extends.
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

## Frontend Design and Review Governance

### Mandatory Skill Usage

The installed `frontend-design` skill (`.claude/skills/frontend-design/`) MUST be
applied automatically to all frontend-related work. The user does not need to
explicitly request or mention the skill.

The installed `impeccable` skill (`.claude/skills/impeccable/`) MUST be applied
alongside `frontend-design` for the same scope of work, also without the user
needing to ask. The two are complementary, not redundant: `frontend-design` and
this constitution's Existing Design System First rule set the non-negotiable
floor (reuse the incumbent shadcn/Radix system, no parallel visual language);
`impeccable`'s commands (`shape`, `polish`, `harden`, `audit`, `critique`, and
the others in its Commands table) are the concrete tools layered on top for
planning, refining, and reviewing within that floor.

**Mode scoping is mandatory.** iTrack's surfaces (Work Program, Kanban,
Taskboard, Bug Tracker, Retrospectives, Support Ops, Reports, Schedule) are all
task-completion tools for internal users — they fall under Impeccable's
**Operate** mode, never **Persuade**. Impeccable's own "go all out, dream big
and bold" instinct is written for greenfield/marketing surfaces; on iTrack it
is constrained by Priority of Authority below and MUST NOT be used to justify
decoration, boldness, or a new visual language that this constitution's Design
Quality Standards or Existing Design System First rule would otherwise reject.

Frontend-related work includes:

- creating new pages, dashboards, layouts, forms, dialogs, navigation, and reusable
  components
- modifying or extending existing frontend interfaces
- redesigning or visually improving existing screens
- reviewing frontend code or pull requests
- validating responsive behavior, accessibility, interaction design, and visual
  consistency
- planning frontend architecture, component structure, and user experience

The agent MUST recognize frontend-related tasks from their scope and automatically
apply the workflow defined below.

### Frontend Creation Workflow

For any task that creates or substantially changes a frontend interface, the agent
MUST use the `frontend-design` skill as part of planning and implementation.

Before implementation, the agent MUST run Impeccable's session setup
(`node .claude/skills/impeccable/scripts/context.mjs`, per that skill's own
Setup step) and load its `shape` reference for UX/UI planning, in addition to:

1. Inspect the existing application before proposing a new design.
2. Review comparable pages, layouts, shared components, design tokens, typography,
   icons, spacing, and responsive conventions.
3. Identify reusable components before creating new ones.
4. Define the page purpose, intended users, primary workflow, and principal action.
5. Establish a deliberate visual direction appropriate to the product and feature.
6. Define the page hierarchy and component structure.
7. Define responsive behavior for desktop, tablet, and mobile.
8. Account for loading, empty, error, validation, disabled, success, and
   permission-denied states.
9. Define accessibility and keyboard interaction requirements.
10. Confirm the proposed design does not introduce a separate or conflicting design
    system.

During implementation, the agent MUST:

- follow the approved specification and implementation plan
- preserve existing product branding and design conventions
- use existing shared components where appropriate
- create reusable components only when justified
- use semantic HTML and accessible interaction patterns
- implement responsive behavior
- implement all relevant interface states
- use real application content and working interactions where possible
- avoid placeholder-only interfaces
- avoid redesigning unrelated screens
- avoid introducing dependencies solely for decorative purposes
- apply Impeccable's `polish` command before considering the surface shipping-ready, and its `harden`
  command wherever error handling, i18n-sensitive text, or edge-case states apply to the surface

### Frontend Review Workflow

When the reviewed surface touches an accessibility surface as defined in **Specialist Agent
Routing**, the review pass MUST also dispatch the **Section 508 Accessibility Specialist**, and its
findings are classified into the same Critical/Major/Minor/Suggestion scheme rather than kept
separate. `/impeccable audit`'s deterministic checks do not substitute for it: they test what can be
computed from the markup, not whether the encoding is discriminable or the interaction is operable.


The `frontend-design` skill MUST automatically be used when reviewing:

- completed frontend implementation
- frontend pull requests
- modified pages or components
- responsive behavior
- accessibility behavior
- visual consistency
- frontend code quality
- design-system adherence

The review MUST compare the implementation against:

1. The approved feature specification.
2. This constitution.
3. The approved implementation plan.
4. Existing application design conventions.
5. Comparable pages and components in the repository.
6. Responsive requirements.
7. Accessibility requirements.
8. Functional and interaction requirements.

The review MUST evaluate:

- clarity of visual hierarchy
- discoverability of primary and secondary actions
- typography and spacing consistency
- component reuse and duplication
- layout consistency
- responsive behavior
- keyboard navigation
- semantic HTML
- accessible labels and names
- contrast and readability
- form validation and feedback
- loading, empty, error, disabled, success, and permission states
- interaction feedback
- unnecessary visual decoration
- unintended changes outside the approved scope

The review MUST also run Impeccable's `/impeccable audit <target>`
(deterministic accessibility/performance/responsive checks) and `/impeccable
critique <target>` (UX heuristic review) against the implemented surface.
Their output is not a separate report — fold each finding into the same
classification and resolution flow as every other frontend finding below,
scoped by Operate mode per Mandatory Skill Usage above.

Review findings MUST be classified as **Critical**, **Major**, **Minor**, or
**Suggestion**. Each finding MUST identify the affected page/component/file, the
observed problem, the expected behavior or design standard, and the recommended
correction.

Frontend work MUST NOT be considered complete while unresolved Critical or Major
findings remain, unless they are explicitly documented and accepted.

**Rationale**: Frontend defects (broken responsive layouts, missing states,
inaccessible controls) are as much a correctness problem as a backend authorization
bug — they just surface as a worse experience instead of a 403. Naming the review as
a required, classified gate (not an optional polish pass) keeps it from being the
first thing skipped under time pressure.

### Design Quality Standards

Frontend implementations MUST avoid generic or low-quality AI-generated design
patterns, including:

- excessive use of cards for unrelated content
- excessive rounded containers
- arbitrary gradients
- unnecessary shadows and glow effects
- decorative elements without a functional purpose
- inconsistent typography
- inconsistent spacing
- repeated layouts without regard to information hierarchy
- excessive explanatory text inside the interface
- unnecessary abstraction or component fragmentation
- introducing a new visual language without justification

The `frontend-design` skill MUST improve the quality of the approved interface
without changing the approved feature scope.

### Existing Design System First

The existing application is the primary design reference. Before creating new
frontend patterns, the agent MUST inspect and prefer: existing layouts, shared React
components, existing Tailwind utilities or CSS conventions, theme and design tokens,
typography rules, form patterns, navigation patterns, modal and dialog patterns,
table and data-display patterns, notification and feedback patterns, responsive
breakpoints, icon libraries, and accessibility utilities.

A new pattern may be introduced only when existing patterns do not satisfy the
approved requirements. The reason MUST be documented in the implementation plan. The
agent MUST NOT create a parallel design system.

**Rationale**: iTrack already has one coherent shadcn/Radix-based visual language
across Work Program, Kanban, Support Ops, Retrospectives, and Bug Tracker. A second,
locally-invented pattern for one new feature is exactly the kind of drift this
constitution's "no parallel systems" instinct (see Principle VI on the mock/real
auth split) already exists to prevent — the failure mode is the same shape, just in
CSS instead of an identity model.

### Spec Kit Integration

For frontend-related features, the following requirements apply automatically
across the Spec Kit workflow.

**During Specification**: the spec MUST define, where applicable, intended users,
primary user goals, principal user journeys, important interactions, required
interface states, responsive expectations, accessibility expectations, and
measurable usability acceptance criteria. The spec SHOULD describe required behavior
and outcomes rather than prescribe arbitrary styling details, unless those details
are actual business or branding requirements.

**During Planning**: the implementation plan MUST include existing frontend
patterns to reuse, proposed visual direction, page and component hierarchy, shared
vs. feature-specific components, responsive strategy, accessibility approach,
interaction and feedback behavior, the loading/empty/error/disabled/success/
permission states that apply, the visual/browser verification approach, and any
justified design-system additions.

**During Task Generation**: frontend tasks MUST be separated into traceable work
items covering inspection of existing conventions, design direction, component
reuse analysis, layout implementation, component implementation, interface states,
responsive behavior, accessibility, visual verification, frontend review, and
resolution of Critical/Major findings. A single generic task such as "implement
frontend" is not sufficient for substantial frontend work.

**During Implementation**: the agent MUST automatically apply the `frontend-design`
skill to all frontend tasks without a separate instruction from the user.

**During Analysis and Convergence**: the agent MUST verify that frontend
requirements from the spec are represented in the plan, frontend requirements from
the plan are represented in tasks, all required interface states are implemented,
responsive and accessibility requirements are covered, frontend review has been
completed, and Critical/Major frontend findings have been resolved or accepted.

### Priority of Authority

When frontend guidance conflicts, this priority applies:

1. Approved feature specification
2. This constitution
3. Existing product design system and repository conventions
4. Accessibility, security, and functional requirements
5. Approved implementation plan
6. Installed `frontend-design` and `impeccable` skill recommendations

The `frontend-design` and `impeccable` skills may improve presentation,
usability, hierarchy, interaction quality, and visual coherence, but neither
MUST override approved requirements, accessibility obligations, established
product conventions, or feature scope. Where the two skills' recommendations
conflict with each other, `frontend-design`'s reuse-first guidance and this
constitution's Existing Design System First rule win — `impeccable` supplies
additional commands and detectors within that boundary, not a competing
design authority.

### Completion Gate

A frontend-related feature or task is complete only when: the required interface
has been implemented; relevant interface states have been implemented; responsive
behavior has been verified; accessibility has been reviewed; the implementation
follows the existing design system; the `frontend-design` skill has been applied
during creation; the `frontend-design` skill has been applied during final review;
all Critical and Major findings have been resolved or explicitly accepted; and
unrelated pages and components have not been unintentionally changed.

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

Before starting work of any size, check **Specialist Agent Routing** below against the surface the
change will touch, and dispatch what it names. This applies to ad-hoc work as much as to Spec Kit
features — the routing miss it was written for happened inside a fully-compliant Spec Kit run.


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
   considered done. For any feature with a frontend-interface surface, the
   Frontend Design and Review Governance section's Completion Gate applies
   in addition to Principle VIII — both must pass, not one in place of the
   other.

## Specialist Agent Routing

Some work has a specialist whose whole discipline is that work. Dispatching them is not optional
politeness — it is the difference between a competent answer and a correct one.

**Route by surface, not by how the task was worded.** This section exists because of a specific
miss: features 021 through 023 performed WCAG contrast work across three consecutive features and
never once dispatched the accessibility specialist, because each task presented itself as
"fix the design tokens". The contrast maths came out right; the questions nobody thought to ask did
not get asked. Colourblind distinguishability was never checked on a red/amber/green status system
in which two states now share red. A gate that measures contrast ratios is structurally blind to hue
discrimination, so no amount of running it would have surfaced this.

| If the change touches… | MUST dispatch | Because |
|---|---|---|
| Colour contrast, ARIA, keyboard interaction, screen-reader behaviour, focus order, colour as a carrier of meaning | **Section 508 Accessibility Specialist** | Contrast ratios are one axis of accessibility. Hue discrimination, focus order and assistive-tech behaviour are others, and a contrast gate cannot see them |
| Charts, timelines, heatmaps, any encoding of data into colour/position/size | **Data Visualization Engineer** | "Is red the right colour for this state" is an encoding question with an established discipline, not a taste question |
| Plan artifacts before `/speckit-tasks` or `/speckit-implement` | **Software Architect** | Already mandated by Principle VIII and the Spec Kit skills |
| Implemented code before completion is reported | **Code Reviewer** | Already mandated by `/speckit-implement` step 10 |
| Branch protection, required checks, CI workflow, release gating | **DevOps Automator** | Repo-settings changes are outward-facing and easy to get subtly wrong |
| Authentication, session handling, roles, permission boundaries | **Identity & Access Engineer** | Principle I is fail-closed; a specialist reads these differently than a generalist |
| Query plans, indexes, N+1, migration performance | **Database Optimizer** | |
| **Any version-control decision** — branching strategy, commit granularity and sequencing, merge vs squash vs rebase, when to push, tagging, history rewrites, branch cleanup | **Git Workflow Master**, supervised by **Software Architect** for the irreversible subset below | These decisions were made ad hoc throughout 021-023. They came out reasonable, but reversible and irreversible choices were being made in the same breath |

Rules that make the table bite:

1. **The trigger is the surface the diff touches, not the words in the request.** "Adjust the token
   values" touches an accessibility surface. So does "make the badge readable". If a reasonable
   person would call the affected surface accessibility, data visualisation, auth, or CI, the
   corresponding specialist is mandatory regardless of how the work was described.
2. **Dispatch during planning, not only at review.** A specialist consulted after implementation can
   only find defects; consulted during `/speckit-plan` they can change the approach.
3. **Not dispatching is an exception and is recorded like one.** If a routed specialist is skipped,
   plan.md says which and why — the same mechanism as a Constitution Check violation. Silence is not
   an acceptable record.
4. **The specialist advises; this constitution and the existing design system still outrank them**
   (see Priority of Authority). Routing adds a voice, it does not transfer authority.
5. **Generalist agents remain fine for generalist work.** This is not a rule that everything needs a
   specialist — it is a rule that these eight surfaces do.

### Version Control Authority

**Git Workflow Master owns version-control decisions. The Software Architect supervises the
irreversible ones.** "Supervision" here is a checkable condition, not a sentiment: for the actions
in the second list, the architect's assessment must exist *before* the action runs, and the outcome
is recorded with the action.

**Routing the decision does not mean routing every keystroke.** Once the branching and commit
strategy for a piece of work is decided, executing it is mechanical and proceeds directly. The gate
is on decisions and on the irreversible list below — never on each `git add`. A gate that makes
ordinary work slow is a gate people learn to route around, and a bypassed gate is worse than none.

**Decide and execute — Git Workflow Master alone, no architect gate:**
staging and commit granularity · commit message content · creating and naming branches · pushing a
feature branch · opening a PR and writing its body · non-force updates to a PR · rebasing a branch
that has **not been pushed** · reverting a commit (itself additive and reversible).

**Architect sign-off required before execution:**
merging into `main` · **enabling auto-merge** · deleting any branch · force-pushing anything,
including `--force-with-lease` · rewriting history on a pushed branch · tagging a release · changing
branch protection, required checks, or any other repository setting · resetting, discarding or
overwriting committed work · anything that makes another person's clone wrong.

The dividing line is not "important" versus "unimportant" — it is **whether the action can be undone
by someone who did not run it.** A bad commit message is fixable by anyone; a force-push over a
colleague's work is not.

Three entries need their edges stated, because each is where the lists rub:

- **A force-push is never a "normal PR update."** It is on the gated list whatever the intent behind
  it and whatever `--force-with-lease` implies about safety.
- **Enabling auto-merge is a merge decision**, not a PR decision. With zero required approvals it
  collapses "open a PR" and "merge into `main`" into one act, which is rule 1 in its exact form.
- **Branch deletion is gated for confirmation, not recovery.** A merged branch's commits survive in
  `main`, so by the test above deleting it *is* undoable. The gate exists to confirm it really was
  merged. Stating the real reason matters: a rule whose stated logic does not fit its own list
  teaches people to stop trusting the list.

Five rules keep this honest:

1. **The routine list is not a licence to batch.** A sequence of individually-routine actions that
   adds up to an irreversible one (branch, force-push, delete) is irreversible and needs the gate.
2. **The user's explicit instruction outranks both agents.** If the user says merge it, merge it —
   the gate exists to stop *unsupervised* irreversibility, not to override the person who owns the
   repository. Two conditions keep that from hollowing the gate out: the instruction must be
   **specific to the action being taken** (a prior general authorisation is not an instruction for a
   later particular act), and any concern the gate would have raised is put to the user **before**
   the question is asked, not after they answer. Record that the instruction was the authority.
3. **A skipped gate is recorded, not silent.** Same mechanism as any other routing exception.
4. **Sign-off is advice on the record, not a warranty.** The agent that *executes* an action owns its
   outcome. An architect's approval never makes a bad action someone else's fault. This is stated
   because routing introduces a failure the ad-hoc approach did not have: three parties now touch a
   git decision — one proposes, one signs off, one executes — and each can assume another checked.
5. **Name where the record goes, because "recorded with the action" has no referent for some
   actions.** A merge, delete or tag is recorded in the merge commit or PR body. A **repository
   settings change has no commit to attach to**, so it is recorded in `docs/repo-settings.md` in its
   own commit: what changed, who decided, when, and the sign-off. This rule exists because branch
   protection on `main` was enabled during this project as a side effect of a commit whose tree
   contained one unrelated file — the decision left **zero trace in the repository**, and a version
   of this section without this rule would have flagged that decision and still left no artifact.


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

**Version**: 1.5.0 | **Ratified**: 2026-07-22 | **Last Amended**: 2026-08-27
