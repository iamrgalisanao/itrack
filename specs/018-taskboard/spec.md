# Feature Specification: Taskboard

**Feature Branch**: `013-sprint-retrospectives` (continues on current branch; no dedicated branch — matches 014/015/016/017)

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Add a "Taskboard" MVP inside Work Program, reusing the existing Module → Activity → SubActivity → DetailedActivity hierarchy rather than introducing a new Epic/Task data model. Module is reused as "Epic" and DetailedActivity is reused as "Task" — no new top-level entities, no schema break to the existing required Module→Activity→SubActivity chain. New view: a third view-mode inside Work Program alongside the existing List/Gantt toggle, showing a flat, project-wide, grouped table of tasks — grouped by a free-text "Sprint Label" field (no real Sprint entity, matching Bug Tracker's precedent), with a literal "Backlog" bucket for tasks with no label. Each group is a collapsible table showing Task, Epic, Status, Priority, Story Points, and Assignee, with a per-group point-sum in the header. New DetailedActivity fields: a real priority enum, estimated story points, sprint label, and a real assignee (user foreign key) — distinct from the existing ad hoc string-based "responsible" field. Task creation from the Taskboard only requires picking an Epic (Module); the system transparently auto-creates a reserved container (an Activity named "Taskboard" and a SubActivity named "Unclassified Tasks") per Module so the existing required hierarchy stays intact, and these reserved containers cannot be deleted while they still hold Taskboard-created tasks. Task creation and editing of Taskboard-specific fields is restricted to Admin/Project Manager; Team Members and Department Heads can view these fields read-only; Client-role users get no access to the Taskboard view at all. The assignee must have actual access to the task's project, not just be any real internal user. Assigning a task sends exactly one notification to the new assignee, and reassigning back to a previous assignee after reassigning away must notify them again each time. A pre-existing UI defect was found during planning: Work Program's Kanban board has a field mislabeled "Priority" that actually reads/writes an unrelated "type" column — relabel it to "Type" (no data change) so it doesn't collide with this feature's new, real Priority field. Out of scope: subtasks, activity-log UI, a real Sprint entity, a task-type field, actual story points, any UI for existing task dependencies, alternate board views beyond the one new grouped table, and story-point roll-up beyond a per-group sum."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Plan and create tasks under an Epic (Priority: P1)

An Admin or Project Manager wants to break a Module (acting as an "Epic" for planning purposes) into concrete pieces of work without leaving Work Program's existing structure. They open a new "Taskboard" view, pick the Epic, and create a task with a title, priority, a story-point estimate, and an optional sprint label — without needing to understand or navigate Work Program's underlying Activity/Sub-Activity levels at all.

**Why this priority**: This is the entire reason Taskboard exists — without task creation grouped by Epic, there's no board.

**Independent Test**: As an Admin or PM, open the Taskboard view, create a task against an Epic with no existing sub-structure, and confirm it appears immediately in the correct sprint-label group (or "Backlog" if none was set) with the values entered.

**Acceptance Scenarios**:

1. **Given** an Admin/PM viewing the Taskboard for a project, **When** they create a task and select an Epic that has never had a Taskboard task before, **Then** the task is created successfully and appears grouped under "Backlog" (if no sprint label was set) without requiring the user to pick anything beyond the Epic.
2. **Given** a task with a sprint label set, **When** the Taskboard is viewed, **Then** the task appears in a collapsible group named for that label, alongside a running total of story points for that group.
3. **Given** two tasks are created in quick succession against the same, previously-untouched Epic, **When** both requests are processed, **Then** both tasks end up correctly organized under that Epic with no duplicate or conflicting internal structure created behind the scenes.
4. **Given** an Admin/PM attempts to remove the underlying container that Taskboard uses to organize tasks under an Epic, **When** that container still holds tasks, **Then** the removal is rejected with a clear reason.

---

### User Story 2 - Assign work and get notified (Priority: P2)

An Admin or Project Manager assigns a created task to a specific team member, who is then notified. If the task is later reassigned to someone else, and then reassigned back to the original person, that person is notified both times — reassignment is never silently swallowed just because they held the assignment once before.

**Why this priority**: Builds directly on User Story 1's board; valuable but the board is already usable (as an unassigned backlog) without it.

**Independent Test**: Assign a task to a team member and confirm they receive a notification; reassign to a second team member and confirm they're notified; reassign back to the first and confirm they're notified again (not silently skipped).

**Acceptance Scenarios**:

1. **Given** a task with no assignee, **When** an Admin/PM assigns it to a team member with access to the project, **Then** that team member receives exactly one notification about the assignment.
2. **Given** a task already assigned to Person A, **When** an Admin/PM reassigns it to Person B, **Then** Person B is notified and Person A is not notified again for this change.
3. **Given** a task was assigned to Person A, then reassigned to Person B, **When** it is reassigned back to Person A, **Then** Person A receives a new notification — reassignment history does not suppress it.
4. **Given** a task currently assigned to someone, **When** an Admin/PM resubmits the same assignee without changing it, **Then** no duplicate notification is sent.
5. **Given** an Admin/PM attempts to assign a task to a real internal user who has no access to the task's project, **When** they submit the assignment, **Then** it is rejected.

---

### User Story 3 - View planning without editing (Priority: P3)

A Team Member or Department Head opens the Taskboard to see what's planned, who's assigned, and what's prioritized — without being able to change any of that planning data themselves.

**Why this priority**: Read access adds transparency but isn't required for Admin/PM to plan and assign work (User Stories 1–2 already deliver full value on their own).

**Independent Test**: As a Team Member, open the Taskboard and confirm every task's priority, points, sprint label, and assignee are visible but none of the controls for changing them are usable.

**Acceptance Scenarios**:

1. **Given** a Team Member or Department Head viewing the Taskboard, **When** they open a task, **Then** they can see its priority, story points, sprint label, and assignee, but cannot change any of them.
2. **Given** a Team Member attempts to change a Taskboard-specific field through any means other than the disabled controls, **When** the change is submitted, **Then** the system silently ignores that part of the request while still applying any other legitimate change in the same request.
3. **Given** a Client-role user, **When** they attempt to view the Taskboard by any means, **Then** they are denied access entirely — this view does not exist for them, unlike the rest of Work Program's per-field visibility rules.

### Edge Cases

- What happens when a sprint label is entered with only leading/trailing whitespace, or is blank? It is treated as no label at all (falls into "Backlog"), not as a distinct group — otherwise "Sprint 1" and " Sprint 1 " would incorrectly appear as two separate groups.
- What happens when an Admin/PM tries to create a task under an Epic that already has a manually-created Activity or Sub-Activity that happens to share a name with Taskboard's reserved containers? The reserved containers are treated as application-owned; this scenario is a naming coincidence the system does not attempt to detect or warn about in this phase — see Assumptions.
- What happens when the only tasks in a reserved container are deleted? The (now-empty) reserved container can be deleted like any other, since the removal restriction only applies while it holds tasks.
- What happens when a Client navigates directly to the Taskboard by URL rather than through navigation? They are denied the same as if they'd tried to open it from a menu — there is no partial or degraded view for this role.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a new Taskboard view within Work Program, alongside the existing List and Gantt views, scoped to a single project at a time.
- **FR-002**: System MUST let an Admin or Project Manager create a task by selecting an existing Epic (Work Program's existing top-level grouping) and providing a title, priority, story-point estimate, and optional sprint label — without requiring them to navigate or select anything below the Epic level.
- **FR-003**: System MUST group tasks on the Taskboard by sprint label, with an explicit "Backlog" group for tasks with no label, and MUST display a running total of story points for each group.
- **FR-004**: System MUST preserve Work Program's existing requirement that every task belongs to a fully-formed structural chain beneath its Epic, by transparently reusing or creating one reserved organizational container per Epic the first time a Taskboard task is created under it.
- **FR-005**: System MUST prevent the reserved container from being removed while it still contains tasks created through the Taskboard, while still allowing removal of an equivalently-named container that holds no such tasks.
- **FR-006**: System MUST restrict task creation and editing of priority, story points, sprint label, and assignee to Admin and Project Manager roles.
- **FR-007**: System MUST allow Team Members and Department Heads to view a task's priority, story points, sprint label, and assignee, but MUST NOT allow them to change any of these values, even if such a change is attempted directly rather than through the normal interface.
- **FR-008**: System MUST deny Client-role users any access to the Taskboard view, regardless of how they attempt to reach it.
- **FR-009**: System MUST validate that an assigned user actually has access to the task's project, not merely that they are a real, non-Client user.
- **FR-010**: System MUST send exactly one notification to a task's assignee each time they are newly assigned to it — including a reassignment back to someone who held the assignment previously — and MUST NOT send a notification when the same assignee is resubmitted unchanged or when the assignment is cleared.
- **FR-011**: System MUST correct Work Program's existing task editor so its "Priority" control accurately reflects what it actually stores (the task's classification/type), and the newly added Priority control introduced by this feature MUST represent a distinct, real priority concept — the two MUST NOT be conflated or allowed to overwrite one another's data.
- **FR-012**: System MUST NOT alter or remove the task-dependency capability that already exists in Work Program; this feature neither exposes nor modifies it.

### Key Entities

- **Task** (Work Program's existing task-level record, extended): the leaf unit of work under an Epic. New attributes introduced by this feature: priority, story-point estimate, sprint label, and a real assignee — in addition to its existing title, status, and other Work Program fields.
- **Epic** (Work Program's existing top-level grouping, reused conceptually): the container tasks are organized under for Taskboard purposes; not a new entity.
- **Reserved organizational container**: an internal, application-owned structural element auto-created once per Epic to hold Taskboard-created tasks, invisible in the Taskboard UI itself.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An Admin/PM can go from "nothing exists under this Epic" to "a task is visible on the Taskboard, correctly grouped" in a single creation action, with no additional structural setup steps.
- **SC-002**: Across verification testing, every assignment notification scenario (new assignment, reassignment to someone new, reassignment back to a prior assignee, unchanged resubmission, clearing) produces exactly the expected notification count — zero missed notifications, zero unexpected duplicates.
- **SC-003**: Across verification testing, Client-role users are unable to view Taskboard content through any access path tried (navigation, direct URL, direct data request).
- **SC-004**: Across verification testing, a Team Member or Department Head attempting to alter a Taskboard-specific field is unable to do so, in 100% of attempts, regardless of whether the attempt goes through the normal UI or bypasses it directly.
- **SC-005**: After this feature ships, Work Program's task editor no longer has two controls that both claim to represent "Priority" while meaning different things.

## Assumptions

- "Epic" is not a new concept — it is Work Program's existing top-level grouping ("Module"), used here for planning purposes; this feature does not rename or restructure that grouping for its non-Taskboard uses.
- The reserved organizational container names are treated as application-owned by convention, not enforced via a dedicated marker in this phase — a coincidental manually-created container sharing one of these exact names is a known, accepted edge case, not actively detected or prevented.
- "Actual story points" (effort actually spent, as distinct from the estimate) is explicitly deferred — its recording workflow (who records it, at what point, and how it feeds reporting) is undefined and out of scope for this phase.
- A "task type" classification is not part of this phase's scope; nothing in this feature depends on it.
- Sprint remains a free-text label with no real scheduling entity behind it (no start/end dates, no capacity, no close workflow) — matching the same deferral already made for a prior feature in this codebase.
- Work Program's existing task-dependency capability is left completely untouched; this feature does not build any interface for it.
- This feature does not introduce any new alternate board view (e.g. a Kanban-style board) beyond the one new grouped table — an existing Kanban board elsewhere in the product is unaffected and unreplaced.
