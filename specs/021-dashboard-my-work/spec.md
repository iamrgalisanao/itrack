# Feature Specification: Dashboard Restructure with My Work List

**Feature Branch**: `021-dashboard-my-work`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Dashboard restructure with My Work list: reduce the Dashboard's ~10 stat cards to a single accomplishment-first four-metric row, remove duplicated status counts and decorative-only elements, add a 'My Work' panel showing the signed-in user's open tasks grouped by due date buckets (Overdue / This Week / Later) with inline status change and bucket-context quick-add (due date inferred from bucket), retain the module heatmap as a primary panel, keep Recent Activities. Reuses GroupSummaryBar and TaskDetailModal; respects role-based access (tasks scoped via Project::accessibleTo) and the existing shadcn design system."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Act on my own work from the dashboard (Priority: P1)

As a signed-in team member, when I open the dashboard I see a "My Work" panel listing my open tasks grouped into due-date buckets — Overdue, This Week, Later, and No Due Date — so I immediately know what needs attention and can act on a task (change its status, open its details) without navigating to another screen.

**Why this priority**: This is the core gap the restructure addresses. Today the dashboard is a statistics report with no actionable work on it; every path forward requires leaving the page. A personal, actionable work list turns the dashboard from a report into a workspace and delivers value even if nothing else in this feature ships.

**Independent Test**: Sign in as a user assigned to tasks with due dates in the past, this week, and beyond. Confirm the dashboard shows those tasks in the correct buckets, that changing a task's status from the list updates it (and removes it from the list when completed), and that opening a task shows its full details in place.

**Acceptance Scenarios**:

1. **Given** a signed-in user with open tasks due yesterday, in 3 days, and in 3 weeks, **When** they open the dashboard, **Then** the My Work panel shows three groups — Overdue (1), This Week (1), Later (1) — each labeled with its count.
2. **Given** the My Work panel is displayed, **When** the user changes a task's status to a completed state from the row's status control, **Then** the task is saved and leaves the open-work list without a full page reload.
3. **Given** the My Work panel is displayed, **When** the user selects a task row, **Then** the task's full details open in the existing task detail view, and any edits made there are reflected in the list when it closes.
4. **Given** a user whose open tasks all have no due date, **When** they open the dashboard, **Then** those tasks appear under a "No due date" group rather than being hidden.
5. **Given** a user with no open tasks at all, **When** they open the dashboard, **Then** the My Work panel shows a positive, encouraging empty state (not an error or a bare blank area).
6. **Given** a user with the Client role (or any role without write permission on a task's project), **When** they view the My Work panel, **Then** task rows are visible but inline mutation controls (status change, quick-add) are not offered for those tasks.
7. **Given** an Admin previewing the app as another user, **When** they view the My Work panel, **Then** they see the previewed user's work list, and any attempted mutation is rejected as it is for all writes during preview.

---

### User Story 2 - A calmer, non-redundant overview (Priority: P2)

As any dashboard user, I see a single row of at most four summary metrics — leading with what has been accomplished — instead of today's ten-plus stat cards, with no number repeated in two places and no purely decorative visual elements, so I can absorb project state at a glance.

**Why this priority**: The duplication (status counts appear twice) and card sprawl are the measurable clutter problems. Fixing them makes every other panel more findable, but on its own it delivers less new capability than User Story 1.

**Independent Test**: Open the dashboard and count distinct summary metrics and repeated values. Verify at most four metrics appear in the summary row, no count is displayed twice on the page, and the module heatmap and Recent Activities remain present and functional.

**Acceptance Scenarios**:

1. **Given** the restructured dashboard, **When** a user views the page, **Then** the summary area shows at most four metrics, ordered so that completed/accomplishment metrics precede remaining/backlog metrics.
2. **Given** the restructured dashboard, **When** the page is scanned end to end, **Then** no status count (completed, in progress, not started, delayed) appears in more than one component.
3. **Given** the restructured dashboard, **When** a user views the page, **Then** the module heatmap remains available as a primary panel with its existing drill-down behavior, and Recent Activities remains available with its existing filtering.
4. **Given** structure counts (projects, modules, activities, team members, glossary terms), **When** the user views the summary area, **Then** these are either absent or presented as a single compact secondary strip — not as individual metric cards.

---

### User Story 3 - Quick-add a task in context (Priority: P3)

As a user with write permission, I can add a new task directly from a due-date bucket in the My Work panel: the bucket determines the pre-filled due date (This Week → end of the current week; Later → no pre-filled date or a date beyond this week; Overdue offers no quick-add), so capturing a task takes a title and a placement, not a form.

**Why this priority**: A convenience layered on User Story 1's panel. Valuable for keeping the dashboard a true workspace, but the panel is fully useful without it.

**Independent Test**: From the This Week bucket, quick-add a task with only a title and a placement selection; confirm it is created assigned to the current user with a due date within the current week and appears in the bucket immediately.

**Acceptance Scenarios**:

1. **Given** the My Work panel, **When** the user activates quick-add in the This Week bucket, enters a title, and confirms a placement (defaulting to their most recently used location), **Then** a task is created assigned to them, due within the current week, and appears in that bucket without a page reload.
2. **Given** the quick-add control, **When** the user has no write permission in any accessible project, **Then** the quick-add affordance is not shown.
3. **Given** a quick-add in progress, **When** creation fails (e.g., permission or validation error), **Then** the entered title is preserved and a clear, actionable error message is shown inline.

---

### Edge Cases

- Tasks with a due date of today belong to This Week, not Overdue (overdue means due before today in the user's timezone).
- A task deleted or made inaccessible while the user views the panel: acting on the stale row produces a clear error, not silent failure, and the list refreshes. Concurrent status edits by two users resolve last-write-wins (every change is audited); the list reflects the latest state on next refresh.
- A user with access to many projects and hundreds of open tasks: buckets cap visible rows with an explicit "show all N" affordance rather than rendering unbounded lists.
- During Admin preview-as-user, all mutation affordances follow the previewed user's role for visibility, and the platform's preview write-block rejects any mutation regardless.
- A user whose accessible-project set changes (revoked mid-session): the panel never shows tasks from projects the acting user can no longer access on refresh.
- Week boundary: "This Week" is computed in the user's local timezone; a task due Sunday 23:59 local time is This Week on Sunday morning.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The dashboard MUST display a My Work panel listing all open (not completed) tasks assigned to the acting user across all projects that user can access, and no tasks from inaccessible projects.
- **FR-002**: The My Work panel MUST group tasks into exactly four buckets — Overdue (due before today), This Week (due today through the end of the current week), Later (due after this week), No Due Date — each showing its task count, using the existing collapsed-group summary presentation.
- **FR-003**: Each task row MUST show at minimum the task title, its parent context (project or module), its due date (or "no due date"), and its current status.
- **FR-004**: Users with write permission on a task MUST be able to change that task's status directly from the row; completing a task MUST remove it from the open-work list without a full page reload.
- **FR-005**: Selecting a task row MUST open the existing task detail view for that task; changes made there MUST be reflected in the panel when it closes.
- **FR-006**: Users with write permission MUST be able to quick-add a task from the This Week, Later, and No Due Date buckets; the bucket MUST pre-fill the new task's due date (This Week → end of current week; Later/No Due Date → none pre-filled), and the task MUST be assigned to the acting user.
- **FR-007**: Quick-add MUST require only a title and a placement (target location in the project hierarchy), defaulting placement to the user's most recently used location, and MUST be unavailable in the Overdue bucket.
- **FR-008**: Inline mutation affordances (status change, quick-add) MUST be hidden or disabled for users without write permission, and all mutations MUST be rejected server-side during an admin preview session, consistent with platform-wide preview write-blocking.
- **FR-009**: The dashboard summary area MUST present at most four metrics, ordered accomplishment-first, and no status count may appear in more than one place on the page.
- **FR-010**: The dashboard MUST retain the module heatmap (with existing drill-down) and Recent Activities (with existing status filtering) as panels; structure counts (projects, modules, activities, team members, glossary terms) MUST NOT appear as individual metric cards.
- **FR-011**: The My Work panel MUST render a deliberate, positive empty state when the user has no open tasks, and per-bucket behavior MUST omit empty buckets rather than showing empty groups (except immediately after a quick-add interaction begins).
- **FR-012**: All My Work data MUST reflect the acting user (the previewed user during admin preview) for reads, while attributing any writes to the real authenticated user, consistent with existing platform behavior.
- **FR-013**: Buckets MUST cap initially visible rows (default 10 per bucket) with an explicit control to reveal the remainder; counts MUST always reflect the true total.
- **FR-014**: Decorative-only visual elements with no informational purpose (e.g., background blur ornaments) MUST be removed from the dashboard.

### Key Entities

- **Task (existing)**: The unit of work shown in My Work; relevant attributes: title, assignee, due date, status, parent context (its position in the project hierarchy), and the project that scopes access to it.
- **My Work view (derived)**: A per-user aggregation of open tasks bucketed by due date relative to the current date in the user's timezone. Not stored — always derived from live task data and the acting user's access scope.
- **Summary metrics (derived)**: At most four page-level numbers derived from tasks visible to the acting user (e.g., completed recently, in progress, delayed, overall progress).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user can change the status of one of their tasks from the dashboard in 2 interactions or fewer, without leaving the page.
- **SC-002**: The dashboard's summary area contains at most 4 metrics, and an audit of the rendered page finds zero status counts displayed in more than one component (today: 4 counts duplicated across two components).
- **SC-003**: A user with overdue work sees the Overdue group (with correct count) within the first screenful of the dashboard on a standard desktop viewport.
- **SC-004**: Quick-adding a task requires at most 2 required inputs (title, placement) and completes without a page reload.
- **SC-005**: A user with no access to a project never sees that project's tasks in My Work — verified by role-based tests covering all five roles and admin preview.
- **SC-006**: The restructured dashboard presents at most 6 top-level content regions (down from 8+ today), with heatmap and Recent Activities retained and functional.

## Assumptions

- "Open task" means any task whose status is not a completed/done state; delayed and in-progress tasks are open.
- "This Week" ends on Sunday (local time) of the current calendar week; the pre-filled quick-add due date for This Week is the last day of the current week. These follow common calendar conventions and can be revisited without affecting scope.
- Quick-add placement uses a compact selector over the user's accessible project hierarchy, defaulting to the most recently used location. A dedicated "inbox" location and full task forms are out of scope.
- The My Work panel shows tasks assigned to the acting user only; unassigned tasks and tasks assigned to others are out of scope for this feature.
- Existing dashboard capabilities not named here (heatmap drill-down behavior, Recent Activities filters) are preserved as-is; visual restyling of those panels beyond layout placement is out of scope.
- Mobile/tablet behavior follows the existing responsive conventions of the app; no new mobile-specific interaction patterns are introduced.
- No new user-facing settings are introduced (bucket definitions and row caps are fixed defaults in this release).
- The existing authentication, role, and preview mechanisms are reused unchanged; this feature adds no new permission concepts.
