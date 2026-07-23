# Feature Specification: Daily Operating Dashboard

**Feature Branch**: `004-daily-operating-dashboard`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Phase 3 of the Support Ops module (docs/support_ops_module_plan.md): Daily Operating Dashboard. Add a 'Today' view showing urgent client issues, stale updates, waiting-for-client issues, and today's coding/learning priorities — aggregated across every project the signed-in user has access to, not scoped to one project like the existing Support Ops board."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Triage what's urgent without checking every project one by one (Priority: P1)

An internal user starting their day wants to know, at a glance, which support issues need attention right now — across every project they're responsible for, not just the one currently selected on the Support Ops board. They open the Today view and see two things clearly separated: issues that have already crossed their staleness threshold (an update is overdue right now), and P1-priority issues that haven't crossed it yet but are one delay away from becoming an emergency.

**Why this priority**: This is the entire reason a "Today view" exists — replacing "open Support Ops, pick a project, repeat for every project" with one screen. Without this, the rest of the dashboard is just a nice-to-have.

**Independent Test**: Can be fully tested by having stale and non-stale P1 issues spread across two or more projects the signed-in user has access to, opening the Today view, and confirming every one of them appears with the correct project label — delivers value even if User Stories 2 and 3 are never built.

**Acceptance Scenarios**:

1. **Given** a P1 issue in Project A that is currently stale (past its 1-hour threshold) and a P2 issue in Project B that is currently stale (past its 4-hour threshold), **When** the user opens the Today view, **Then** both appear in the stale section, each labeled with its own project.
2. **Given** a P1 issue that has not yet crossed its staleness threshold, **When** the user opens the Today view, **Then** it appears in the "P1 — Watch Closely" section, not the stale section.
3. **Given** an issue that is both P1-priority and currently stale, **When** the user opens the Today view, **Then** it appears exactly once — in the stale section only, never duplicated into the P1 section too.
4. **Given** the user has access to zero projects with any open support issues, **When** they open the Today view, **Then** the stale and P1 sections both show a clear "nothing here" state, not an error or a blank gap.

---

### User Story 2 - See what's waiting on the client, not on us (Priority: P2)

An internal user wants a single list of every issue across their accessible projects that's currently blocked on the client — shown in the UI as "Needs Info" and backed by status `blocked` or `delayed` — so they can distinguish "the client owes us something" from "we owe the client something" without re-deriving that from the stale/P1 lists.

**Why this priority**: Valuable daily-standup information, but secondary to the urgent-triage value of User Story 1 — nothing is actively at risk of breaching in this list by definition (it's blocked on someone else).

**Independent Test**: Can be fully tested by having `blocked`/`delayed` issues across two or more accessible projects, opening the Today view, and confirming all of them appear in this section regardless of which project is "currently selected" anywhere else in the app — delivers value independently of User Stories 1 and 3.

**Acceptance Scenarios**:

1. **Given** a `blocked` issue in Project A and a `delayed` issue in Project B, **When** the user opens the Today view, **Then** both appear in the waiting-for-client section, each labeled with its project.
2. **Given** a `blocked` or `delayed` issue that is also technically stale by the timestamp math, **When** the user opens the Today view, **Then** it appears in the waiting-for-client section — being blocked on the client is the more useful classification than a staleness clock that shouldn't really be running against them.

---

### User Story 3 - See today's learning priorities alongside support triage (Priority: P3)

An internal user wants their open AI-upskilling / learning entries (`work_type = learning`) visible on the same daily screen as their support triage, so upskilling work doesn't become invisible next to firefighting.

**Why this priority**: Genuinely useful but the least time-sensitive of the dashboard's four sections — nothing here has a clock running against it the way stale/P1 issues do.

**Independent Test**: Can be fully tested by having open learning entries across accessible projects, opening the Today view, and confirming they appear in their own section — delivers value independently of the other three stories.

**Acceptance Scenarios**:

1. **Given** an open (not-completed) learning entry in an accessible project, **When** the user opens the Today view, **Then** it appears in the learning-priorities section, labeled with its project.
2. **Given** a completed learning entry, **When** the user opens the Today view, **Then** it does NOT appear — this section is about what's still open, not a historical log.

---

### Edge Cases

- What happens for a role with access to projects that have zero Support Ops activity at all? Every section renders its own empty state; the view itself still loads normally.
- What happens for the Client role? The Today view is unreachable, identical to the existing Support Ops board's restriction — Clients have no Support Ops access at all.
- What happens if a support issue would qualify for more than one of the
  three support-issue sections (e.g., stale AND P1 — see User Story 1
  Acceptance Scenario 3; status `blocked`/`delayed` AND stale — see User
  Story 2 Acceptance Scenario 2)? Each item appears in exactly one section,
  following the precedence in FR-009: Waiting for Client first (it's
  blocked on the client, not a triage failure), then Stale, then
  P1-not-yet-stale. An item is never shown in two of these three sections
  at once.
- What happens if a `work_type = learning` entry happens to carry a
  `status` of `blocked`/`delayed` or a `client_priority` value? Per FR-009a,
  it is still classified only as a Learning Priority (if open) — those two
  fields don't carry their support-triage meaning on a learning entry, so it
  is never pulled into Waiting for Client/Stale/P1 by coincidence.
- What happens if the dashboard's data fails to load entirely (e.g. a
  network error)? The view shows one dashboard-level error, not four
  empty-looking sections that could be mistaken for "nothing's urgent
  today" (FR-010).
- What happens to the existing single-project `/support-ops` board? It is unchanged — the Today view is a new, additional, cross-project screen, not a replacement.
- How does this interact with a project a user loses access to (e.g., a revoked department grant) between page loads? The next load simply reflects current access — same as every other cross-project view in this app (Dashboard, Reports).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a new "Today" dashboard view, accessible only to the same internal roles that can already access Support Ops (Admin, Project Manager, Team Member, Department Head). Clients, who have no Support Ops access at all, MUST NOT be able to reach it.
- **FR-002**: The view MUST aggregate data across every project the signed-in user currently has access to — reusing this app's existing role-based project access rules (Admin/Project Manager: all projects; Department Head: their granted departments; Team Member: their own department) — not scoped to a single "currently selected" project the way the existing Support Ops board is.
- **FR-003**: System MUST show a "Stale" section listing every currently-stale
  support issue across accessible projects, using the same staleness
  computation already established for the Support Ops board (P1: over 1 hour
  since last client update; P2: over 4 hours; P3: over 1 business day),
  sorted with the most overdue first. Because this view aggregates across
  every accessible project rather than one, staleness and section
  classification for the Today endpoint MUST be computed once, consistently,
  in one server-side place — never re-derived independently per project or
  per client render. This endpoint must match the existing Support Ops
  board's current staleness behavior; the existing board's separate
  frontend implementation remains unchanged in this phase.
- **FR-004**: System MUST show a "P1 — Watch Closely" section listing every P1-priority support issue that is NOT currently stale, so the highest-priority items stay visible before they breach.
- **FR-005**: System MUST show a "Waiting for Client" section listing every
  support issue whose `status` is `blocked` **or** `delayed` across accessible
  projects — matching the existing board's "Needs Info" column exactly, which
  already treats these two status values as equivalent
  (`002-support-ops-tracker/data-model.md`'s status→column mapping). Querying
  only `blocked` and missing `delayed` (or vice versa) would silently drop
  issues this dashboard exists to surface.
- **FR-006**: System MUST show a "Learning Priorities" section listing every open (not `completed` status) `work_type = learning` entry across accessible projects.
- **FR-007**: Each item MUST be labeled with the project it belongs to, since — unlike the single-project Support Ops board — items from multiple projects appear together on this view.
- **FR-008**: Selecting an item MUST open the same Support Ops issue detail
  view already used elsewhere in this app (including its existing generators
  from `003-templates-prompt-generator`), with the same role-based edit
  permissions that view already enforces there (e.g. Department Head can
  view but not edit fields, matching every other entry point into this
  modal) — not a separate/duplicated detail experience.
- **FR-009**: An item that would qualify for more than one **support-issue**
  section (Waiting for Client, Stale, P1 — Watch Closely) MUST appear in
  exactly one, following this precedence: Waiting for Client, then Stale,
  then P1 — Watch Closely (see Edge Cases). This precedence applies only
  among these three sections. Learning Priorities (FR-006) is governed
  separately by FR-009a.
- **FR-009a**: Learning Priorities is a wholly separate track from the three
  support-issue sections above. A `work_type = learning` entry is classified
  **only** by whether it's open (FR-006) — it MUST NOT be evaluated against
  the Waiting for Client / Stale / P1 criteria at all, even if it happens to
  carry a `status` of `blocked`/`delayed` or a `client_priority` value (both
  fields exist on the shared `DetailedActivity` table but don't carry their
  usual support-triage meaning on a learning entry). A learning entry never
  appears in more than one section, and never appears in any of the other
  three.
- **FR-010**: A section with no qualifying items MUST show a clear empty
  state, never be silently hidden or left ambiguous about whether it loaded.
  This is distinct from a load failure: if the dashboard's data fails to
  load at all, it MUST show a single dashboard-level error, never silently
  render some sections as empty while others are missing for the same
  underlying reason.
- **FR-011**: The view MUST only ever include Support Ops-eligible work (`work_type` of `support` or `learning`) — never ordinary Kanban/project tasks — matching the existing Support Ops board's scope.
- **FR-012**: The Today view's own page/list MUST be read-only — it has no
  inline editing controls of its own and does not introduce a new way to
  change an issue's data. This does not conflict with FR-008: clicking
  through to the existing shared detail modal (which has always supported
  editing, subject to the same role permissions everywhere else it's used)
  is not "the Today view" editing anything — it's the same, unchanged
  Support Ops detail experience being launched from a new entry point.

### Key Entities

- **Support Issue** *(existing, from 002-support-ops-tracker)*: Source of every item shown. This feature reads existing fields (`client_priority`, `status`, `last_client_update_at`, `work_type`) across multiple projects at once; it does not add fields to it.
- **Project** *(existing)*: Determines which issues are in scope via the existing `accessibleTo` role-based access rule. Each dashboard item is labeled with its Project.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can identify every currently-stale issue across all of their accessible projects from a single screen, without visiting each project's Support Ops board individually.
- **SC-002**: 100% of Support Ops-eligible issues (support/learning work type) that are stale, P1-and-not-stale, Needs Info, or open-learning appear in exactly one dashboard section — none silently dropped, none duplicated.
- **SC-003**: Opening the Today view and locating the single most-overdue issue across all accessible projects takes one screen, down from one screen per project today.

## Assumptions

- **New dedicated page, not folded into the existing Dashboard**: This view gets its own screen (e.g. a "Today" nav entry alongside the existing Support Ops board) rather than being added to `Dashboard.jsx`'s general project-health metrics — mixing support-triage content into that general dashboard would dilute both, and Support Ops already has its own dedicated nav concept to extend.
- **No new backend fields or migration**: Every section is computed from fields `002-support-ops-tracker` already added (`client_priority`, `status`, `last_client_update_at`, `work_type`) — this phase is aggregation and cross-project scoping only, consistent with the module plan's phase-by-phase build order.
- **Reuses existing role-based project access**: `Project::accessibleTo($user)` (already used by the existing Dashboard and Reports views) is the correct, already-fail-closed mechanism for determining which projects' issues appear — no new access-control concept is introduced.
- **Reuses the existing issue detail view**: Selecting any item opens the same Support Ops detail modal (and its Phase 2 generators) already built — this feature does not duplicate that UI.
- **Staleness thresholds are unchanged**: This feature does not redefine or reconfigure the P1/P2/P3 staleness thresholds established in `002-support-ops-tracker` — it only aggregates the existing computation across projects.
- **Classification lives in one server-side place**: FR-003's "computed once, consistently" requirement implies a single backend source of truth for staleness/section classification across every accessible project — the specific endpoint/query shape is a plan.md concern, not a spec-level one, but re-deriving classification independently per project or in the browser is explicitly out of bounds.
