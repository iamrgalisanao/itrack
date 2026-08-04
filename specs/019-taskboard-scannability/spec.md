# Feature Specification: Taskboard Scannability

**Feature Branch**: `019-taskboard-scannability`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Improve Work Program's Taskboard view density and scannability, informed by a monday.com-style grouped-board reference, as a frontend design-quality pass (not a new feature) on the already-shipped 018-taskboard view. Two concrete changes to frontend/src/components/TaskboardView.jsx only: (1) tighten table row density — reduce cell padding/text size in the Taskboard table specifically (not the shared ui/table.jsx component used by other pages) so more rows are visible per screen; (2) give each sprint-label group a distinct colored left-edge accent bar plus matching colored group-label text, using a small fixed palette drawn from colors already established in the app's existing badge-class conventions, assigned deterministically by group index so groups are visually distinguishable without reading text. Explicitly excluded: solid-fill badges, inline per-group quick-add row, changes to shared ui/ components, changes to List/Gantt/other pages. Dark mode must be verified, not assumed."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan more tasks per screen (Priority: P1)

A Project Manager or Admin opens the Taskboard view for a project with many
tasks spread across several sprint-label groups. Today, each row takes up
more vertical space than necessary, so only a handful of tasks are visible
without scrolling. After this change, the same screen shows meaningfully
more rows at once, so the user can scan the current workload without
constant scrolling.

**Why this priority**: This is the primary complaint driving the request —
the Taskboard's core job is letting a PM/Admin quickly see what's in flight,
and low information density undermines that on any project with a
non-trivial task count.

**Independent Test**: Load a project with 15+ tasks across 3+ sprint-label
groups on the Taskboard view; count visible rows before and after the
change without scrolling. Can be verified and shipped independently of User
Story 2.

**Acceptance Scenarios**:

1. **Given** a project with multiple tasks in a sprint-label group, **When**
   the Taskboard view renders that group's table, **Then** each row is
   visibly more compact than the previous spacing, without truncating or
   clipping any cell's text content.
2. **Given** the same Taskboard view, **When** compared against the List
   view or any other page using the shared table component, **Then** those
   other views/pages are unaffected — their row spacing is unchanged.

---

### User Story 2 - Tell groups apart at a glance (Priority: P2)

A user viewing the Taskboard with several sprint-label groups (e.g.
"Backlog", "Sprint 12", "Sprint 13") currently sees group headers that all
look identical except for their text label. After this change, each group
has a distinct color accent, so the user can visually locate a specific
group or distinguish "how many groups are there" without reading every
label.

**Why this priority**: A real but secondary improvement over row density —
it helps orientation and visual scanning but isn't blocking the core
"see more tasks" need addressed by User Story 1.

**Independent Test**: Load a project with 3+ sprint-label groups; confirm
each group's header/left edge renders a different color from a small fixed
set, and the same group always renders the same color on reload. Can be
verified and shipped independently of User Story 1.

**Acceptance Scenarios**:

1. **Given** a Taskboard view with multiple sprint-label groups, **When**
   the groups render, **Then** each group displays a distinct colored
   left-edge accent and matching label color drawn from a small fixed
   palette, assigned consistently by the group's position so the same
   group looks the same across reloads.
2. **Given** more groups exist than colors in the palette, **When** the
   palette is exhausted, **Then** colors repeat (cycle) rather than the
   view breaking or falling back to an unstyled group.
3. **Given** the user switches between Light and Dark mode, **When** the
   Taskboard view re-renders, **Then** every group accent color remains
   legible (sufficient contrast against its background) in both modes.

---

### Edge Cases

- What happens when a project has only one sprint-label group (e.g. only
  "Backlog")? The single group still receives its assigned accent color;
  nothing breaks with fewer groups than palette entries.
- What happens when a project has zero tasks (empty Taskboard)? The
  existing empty state is unaffected by this change — no group rows are
  rendered, so there is nothing to accent or densify.
- How does the row-density change interact with long task titles or long
  assignee names? Text must remain readable (no visual overlap or
  unreadable truncation) at the new, more compact row height.
- How do the new group accent colors interact with the existing outlined
  status/priority badges shown in the same row? Badge styling itself is
  unchanged by this feature; the accent color must not visually compete
  with or be confused for a badge/status indicator.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Taskboard view MUST render task rows with reduced vertical
  padding and row height compared to the current implementation, such that
  more rows are visible in the same viewport height without scrolling.
- **FR-002**: The row-density change MUST be scoped to the Taskboard view
  only — the shared table component used by other pages, and the row
  spacing on List view, Gantt view, Bug Tracker, Retrospectives, and Kanban,
  MUST remain visually unchanged.
- **FR-003**: All existing cell content (task title, epic/module, status,
  priority, story points, assignee) MUST remain fully readable at the new
  row density — no clipped, overlapping, or truncated text beyond what
  already occurs today.
- **FR-004**: Each sprint-label group in the Taskboard view MUST display a
  distinct colored visual accent (left-edge bar and matching label color)
  drawn from a small, fixed, pre-defined color palette.
- **FR-005**: Group accent color assignment MUST be deterministic — the same
  group (by its position/order in the rendered list) MUST always receive the
  same color across page reloads and re-fetches, for a given set of groups.
- **FR-006**: When the number of groups exceeds the number of colors in the
  palette, colors MUST cycle (repeat) rather than leaving a group
  unstyled or causing a rendering error.
- **FR-007**: The color palette used for group accents MUST be drawn from
  colors already established in the application's existing badge-color
  conventions (the same color families used by Bug Tracker's priority
  badges and Retrospectives' sentiment badges), not a newly invented palette.
- **FR-008**: Group accent colors MUST render with sufficient contrast to be
  legible in both the application's Light and Dark theme modes, using the
  app's existing theme-aware styling approach (not hardcoded colors that
  ignore the active theme).
- **FR-009**: This feature MUST NOT change the visual style of status or
  priority badges (they remain in their current outlined/tinted style), MUST
  NOT add an inline per-group quick-add row, and MUST NOT modify any shared
  component used by other pages.
- **FR-010**: This feature MUST NOT change the List view, Gantt view, or any
  page outside the Taskboard view.

### Key Entities

*(No new or modified data entities — this is a presentation-only change to
an existing view. No backend, API, or data model changes are involved.)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a project with 15+ tasks in a single sprint-label group, the
  Taskboard view shows at least 30% more task rows within the same
  viewport height, compared to the pre-change layout.
- **SC-002**: A user viewing a Taskboard with 3 or more sprint-label groups
  can visually distinguish each group by color alone (without reading the
  group label text) in a quick glance.
- **SC-003**: Every other page/view that shares the underlying table
  component (List view, Bug Tracker, Retrospectives, Kanban) shows zero
  visible layout change after this feature ships.
- **SC-004**: All Taskboard content remains fully readable (no clipped or
  overlapping text) at the new row density, verified in both Light and Dark
  mode.

## Assumptions

- This is a presentation-only, frontend-only change confined to
  `TaskboardView.jsx`; no backend, API, or data model changes are required
  or in scope.
- The "small fixed palette" is expected to contain roughly 4-6 colors,
  consistent with the size of existing badge-color palettes already used
  elsewhere in the app (e.g. priority/sentiment badges) — exact colors are
  a plan/implementation-level decision, not specified here.
- "Group position/order" for deterministic color assignment refers to the
  existing group ordering already used by the Taskboard (Backlog first,
  then remaining sprint labels alphabetically) — this feature does not
  change that ordering.
- No new user role, permission, or access-control behavior is introduced;
  all existing Taskboard visibility rules (e.g. Client users cannot access
  the Taskboard at all) are unchanged and unaffected by this purely visual
  change.
