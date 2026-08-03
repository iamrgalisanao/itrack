# Feature Specification: List View Groups

**Feature Branch**: `020-list-view-groups`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Flatten Work Program's List view from a 4-level nested hierarchy (Module → Activity → SubActivity → Task, expand/collapse at every level) into a monday.com-style single-level grouped board... Module stays as the outer container... Activities convert into collapsible, color-accented groups... SubActivity is demoted from a nesting level to a column... Add a new inline '+ Add item' row... Explicitly out of scope: row checkboxes/bulk actions, custom columns, changes to Gantt/Taskboard/other pages, changes to Module-level behavior, changes to Client-role visibility rules."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan and manage tasks without drilling through extra levels (Priority: P1)

A Project Manager or Team Member opens Work Program's List view for a
project. Today, seeing any task requires expanding a Module, then an
Activity, then a Sub-Activity, three clicks deep before any task is even
visible. After this change, expanding a Module reveals its Activities as
color-coded groups, and every task within an Activity is immediately
visible in one flat table — no Sub-Activity expansion step required.

**Why this priority**: This is the core complaint driving the request —
removing one full layer of clicking-to-reveal makes the everyday
task-scanning workflow faster and matches a layout the user already finds
effective elsewhere (Taskboard, and the external reference).

**Independent Test**: Open a Module with 2+ Activities, each having tasks
under 2+ different Sub-Activities; confirm every task is visible after
expanding only the Module and Activity levels (no separate Sub-Activity
expansion needed), with each Activity group visually distinguished by
color.

**Acceptance Scenarios**:

1. **Given** a Module with an Activity that has tasks spread across
   multiple Sub-Activities, **When** the user expands that Activity,
   **Then** all of that Activity's tasks appear together in one table,
   each row showing which Sub-Activity it belongs to.
2. **Given** a Module with multiple Activities, **When** the List view
   renders, **Then** each Activity group is visually distinguished by a
   distinct color accent, consistent with the same convention already used
   on the Taskboard view.
3. **Given** an existing task, **When** the user uses either the quick
   inline status editor or the full edit dialog (both already available
   today), **Then** both continue to work exactly as before, with the full
   edit dialog also showing the task's Sub-Activity.

---

### User Story 2 - Add a task without leaving the group (Priority: P2)

A Project Manager viewing an Activity's task group wants to quickly add a
new task without interrupting their scanning flow by opening a separate
dialog. They use a lightweight inline entry point at the bottom of the
group, type a task name, and the task appears in the list immediately.

**Why this priority**: A meaningful workflow speed-up once the flattened
layout exists, but the flattened read/manage experience of User Story 1
already delivers standalone value without it — this can ship as a
follow-on.

**Independent Test**: On an Activity group (with or without existing
Sub-Activities), use the inline add affordance to create a new task by name
only; confirm it appears in the group's task list without opening the
existing full create dialog.

**Acceptance Scenarios**:

1. **Given** an Activity that already has at least one Sub-Activity,
   **When** a user adds a task via the inline entry point, **Then** the
   task is created and attached to that Activity (via an existing
   Sub-Activity) without the user having to pick one.
2. **Given** an Activity that currently has zero Sub-Activities, **When** a
   user adds a task via the inline entry point, **Then** the system
   transparently creates whatever underlying structure is needed and the
   task appears correctly in the group — the user is not shown an error or
   asked to create a Sub-Activity first.
3. **Given** a user without task-creation permission (e.g. Client role),
   **When** they view an Activity group, **Then** no inline add entry point
   is shown to them, consistent with today's rule that only permitted roles
   can create tasks.

---

### Edge Cases

- What happens when an Activity has zero tasks at all? The group still
  renders (collapsed or expanded per existing default), showing an empty
  state and, for permitted roles, the inline add entry point.
- What happens when a Module has zero Activities? Unchanged from today's
  behavior — Module-level rendering is out of scope for this feature.
- How does a task's Sub-Activity column behave for a task whose
  Sub-Activity has since been deleted or renamed? Reflects the current
  Sub-Activity name at time of render, same as any other task field sourced
  from a related record today.
- What happens for a Client-role user? They see the same flattened,
  color-grouped read-only layout (minus the Responsible column and the
  inline add / edit / delete affordances), preserving every existing
  Client-visibility restriction — nothing about what a Client can or cannot
  see changes, only the layout it's presented in.
- What happens when there are more Activity groups in a Module than colors
  in the fixed accent palette? Colors repeat (cycle), matching the existing
  Taskboard behavior for the same situation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: List view MUST render each Module's Activities as
  independently collapsible groups, each showing all of that Activity's
  tasks in a single flat table — without requiring a separate
  Sub-Activity-level expansion step to see any task.
- **FR-002**: Each Activity group MUST display a distinct color accent
  (consistent with the convention already used on the Taskboard view),
  assigned deterministically and cycling when the number of groups exceeds
  the palette size.
- **FR-003**: Each task row MUST display which Sub-Activity it belongs to,
  as a column, in addition to the task's existing fields (name, status,
  progress, responsible — hidden for Client role, plan dates, actual dates,
  "shared with client" indicator).
- **FR-004**: Module-level rendering, CRUD, and rolled-up date behavior
  MUST remain exactly as they are today — this feature does not change
  anything at the Module level.
- **FR-005**: The existing inline quick status editor (status, progress,
  actual dates) and the existing full edit dialog (all task fields,
  including Sub-Activity) MUST both continue to work for every task row,
  unchanged in capability.
- **FR-006**: Delete behavior for Module, Activity, Sub-Activity, and Task
  MUST remain unchanged.
- **FR-007**: Sub-Activity creation and editing MUST remain possible (via
  the existing full edit / management path) even though Sub-Activity is no
  longer shown as its own expandable container in the main List view.
- **FR-008**: For roles permitted to create tasks, each Activity group MUST
  offer an inline entry point to create a new task by name, without
  requiring the user to open the existing full create dialog for the
  common case.
- **FR-009**: When a user creates a task via the inline entry point on an
  Activity that has zero Sub-Activities, the system MUST transparently
  provision whatever underlying structure is required so the task is
  created successfully, without exposing this as an error or an extra step
  to the user.
- **FR-010**: When a user creates a task via the inline entry point on an
  Activity that already has one or more Sub-Activities, the new task MUST
  be attached to an existing Sub-Activity rather than creating a redundant
  new one.
- **FR-011**: The inline task-creation entry point MUST NOT be shown to
  roles that are not permitted to create tasks today (e.g. Client), and
  MUST NOT expose any bulk-selection or bulk-action controls (out of
  scope for this feature).
- **FR-012**: Every existing Client-role visibility restriction in List
  view (e.g. the hidden Responsible column, and any other current Client
  restriction) MUST be preserved exactly within the new flattened layout.
- **FR-013**: This feature MUST NOT change Gantt view, Taskboard view, or
  any other page.

### Key Entities

*(No new or modified data entities. Existing entities — Module, Activity,
Sub-Activity, Task/DetailedActivity — and their existing relationships are
reused as-is. The only structural nuance: when a task is created inline on
an Activity with no Sub-Activity, an existing Sub-Activity record is
created using existing creation rules, exactly as if a user had created one
through today's "Add Sub-Activity" flow — no new entity type or field is
introduced.)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from a collapsed Module to seeing every task
  under a given Activity in two clicks (expand Module, expand Activity)
  instead of three (expand Module, expand Activity, expand Sub-Activity).
- **SC-002**: A user viewing a Module with 3+ Activities can visually
  distinguish each Activity group by color alone, consistent with the
  existing Taskboard experience.
- **SC-003**: A user can create a new task attached to a given Activity
  in under 10 seconds using the inline entry point, without navigating
  through a multi-field dialog, regardless of whether that Activity
  already had a Sub-Activity.
- **SC-004**: Zero regressions: every existing List view capability
  (quick edit, full edit, delete at every level, Client-role visibility
  rules, Module-level rollups) continues to work exactly as before.
- **SC-005**: Gantt view, Taskboard view, and every other page in the
  application show no visible or functional change after this feature
  ships.

## Assumptions

- This is a frontend-only interaction/layout change to List view, backed
  by existing Task/Sub-Activity/Activity/Module creation and update
  capabilities — no new backend endpoints or data model changes are
  required or in scope.
- "Transparently provision whatever underlying structure is required"
  (FR-009) means: reuse today's existing Sub-Activity creation rules and
  defaults (the same ones already used when a user manually creates a
  Sub-Activity), applied automatically rather than requiring manual
  user input for this one case.
- Row checkboxes and bulk actions are explicitly out of scope: no bulk
  action exists anywhere in this application today, and shipping
  checkboxes with nothing wired to them would be non-functional UI.
  This may be revisited as its own, separately-scoped feature in the
  future if a concrete bulk action is wanted.
- A fully custom, user-configurable column system (arbitrary user-defined
  columns) is explicitly out of scope — the task table's columns remain
  the fixed set already used by this application today, plus the new
  Sub-Activity column.
- "Color accent, consistent with the convention already used on the
  Taskboard view" refers to the existing small, fixed color palette
  already established for the same purpose elsewhere in the application —
  this feature does not introduce a new color system.
