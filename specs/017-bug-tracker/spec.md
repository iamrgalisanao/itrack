# Feature Specification: Bug Tracker

**Feature Branch**: `013-sprint-retrospectives` (continues on current branch; no dedicated branch — matches how 014/015/016 were handled)

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Add a "Bug Tracker" module to iTrack, inspired by monday dev's Bugs Queue board (see docs/research/monday-dev-bugs-queue.md and the user-supplied reference screenshot) but scoped and adapted to what iTrack already has. This ships as a standalone view alongside Work Program, Kanban, Support Ops, and Retrospectives — the same way each of those was added as a separate operational layer; it must not require any change to Work Program's Module → Activity → Sub-Activity → Task hierarchy. Bugs are organized within a project into status-based groups matching monday dev's stages: Incoming, Development Work, Resolved (a bug's status drives which group it displays in — status values: Awaiting Review, Ready for Dev, Fixing, Fixed). Each bug has: a title, a description, a Reporter (the internal user who filed it, defaulting to the creator), a Priority (Critical/High/Medium/Low), a Status (the four values above), a Bug ID (auto-generated, sequential, project-scoped, e.g. "BUG-001"), an optional free-text "Sprint/Milestone" label (no real relationship to any entity — just a text tag, since iTrack has no formal Sprint entity, matching the same decision already made for 013-sprint-retrospectives), and an optional due date. Time tracking: each bug with a due date shows a live countdown to that due date, and the system sends a notification (reusing the existing Notification/mention infrastructure already used by Comments) to the bug's Reporter and any assigned owner when a bug's due date passes without the bug reaching Fixed status (an SLA breach alert) — this is a real-time countdown with breach alerting, not just static timestamps. Access: internal team members (Admin, Project Manager, Team Member, Department Head — matching the existing internal-only creation/management pattern used by Kanban/Support Ops/Retrospectives) can create, edit, and triage bugs. Client-role users cannot create or edit bugs, but can view bugs on projects they have access to when a bug is explicitly marked client-visible, reusing the exact `visibility`/`client_visible` convention already used by Work Program's Attachment and Comment models (backend/app/Models/Attachment.php, backend/app/Models/Comment.php) rather than inventing a new visibility mechanism. Explicitly out of scope for this phase: any "Connected to"/cross-board linking or a "Managed in sprints" group tied to a real Sprint entity (the free-text label above is the full extent of sprint association), monday.com-platform-only chrome (AI suggestions, Integrate, Automate, Agents), a separate "Bug Reporting Form" view (bug creation uses iTrack's existing form/modal pattern within the main view), file attachments or a comment thread on bugs (that pattern exists for 015-retro-entry-context and Work Program already; not being extended to Bug Tracker in this phase), and any analytics/trend reporting across bugs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Report and triage a bug (Priority: P1)

An internal team member (Admin, Project Manager, Team Member, or Department
Head) notices a defect and reports it against a project: a title, a
description, a priority, and it starts life in the Incoming group awaiting
review. Any internal team member with access to that project can then pick
it up, change its status as work progresses, reassign priority, and set an
owner responsible for fixing it.

**Why this priority**: This is the entire reason Bug Tracker exists — without
create/triage, there is no board. Every other capability builds on this.

**Independent Test**: As an internal user with project access, create a bug
with a title and priority, confirm it appears in the "Incoming" group with
an auto-generated Bug ID, then change its status through Ready for Dev →
Fixing → Fixed and confirm it moves between the Incoming, Development Work,
and Resolved groups accordingly.

**Acceptance Scenarios**:

1. **Given** an internal user with access to a project, **When** they create
   a bug with a title, description, and priority, **Then** the bug appears
   in the "Incoming" group with Status "Awaiting Review", a unique
   project-scoped Bug ID, and Reporter defaulted to the creating user.
2. **Given** an existing bug in "Awaiting Review", **When** an internal user
   changes its Status to "Ready for Dev" or "Fixing", **Then** the bug moves
   to the "Development Work" group.
3. **Given** an existing bug in "Fixing", **When** an internal user changes
   its Status to "Fixed", **Then** the bug moves to the "Resolved" group.
4. **Given** an internal user without access to a project, **When** they
   attempt to view or create a bug on that project, **Then** they are
   denied, matching the existing per-project access pattern used elsewhere
   in iTrack.

---

### User Story 2 - Track due dates and get notified of overdue bugs (Priority: P2)

An internal user sets a due date on a high-priority bug so the team has a
visible deadline. The Bug Tracker view shows a live countdown to that date.
If the due date passes and the bug still isn't Fixed, the Reporter and the
bug's Owner (if one is assigned) are notified so they know to escalate.

**Why this priority**: Adds real urgency and accountability on top of the
P1 board, but the board is fully usable without it — bugs without a due
date simply show no countdown.

**Independent Test**: Set a due date in the near future on a bug, confirm a
live countdown displays; simulate the due date passing while the bug is
still not Fixed, and confirm exactly one notification reaches the Reporter
and Owner.

**Acceptance Scenarios**:

1. **Given** a bug with a due date set and Status not Fixed, **When** an
   internal user views the Bug Tracker, **Then** they see a live countdown
   to that due date (or an overdue indicator if it has already passed).
2. **Given** a bug with a due date that passes while its Status is still not
   Fixed, **When** the due date passes, **Then** the Reporter and the
   assigned Owner (if any) each receive exactly one SLA breach notification.
3. **Given** a bug is marked Fixed before its due date passes, **When** the
   due date arrives, **Then** no breach notification is sent.
4. **Given** a bug has no due date set, **When** viewed on the board,
   **Then** no countdown or overdue indicator is shown for it.

---

### User Story 3 - Client views their own visible bugs (Priority: P3)

A Client-role user wants visibility into known issues on their project
without being able to see internal triage details the team doesn't want to
expose, or edit anything. An internal user explicitly marks specific bugs as
client-visible; the Client sees only those, read-only.

**Why this priority**: Adds external transparency on top of a fully
functional internal board — valuable, but the internal workflow (US1, US2)
delivers the core value on its own.

**Independent Test**: As an internal user, mark one bug on a project as
client-visible and leave another as internal-only; sign in as a Client user
with access to that project and confirm only the client-visible bug is
shown, with no create/edit controls available.

**Acceptance Scenarios**:

1. **Given** a bug marked client-visible on a project, **When** a Client
   user with access to that project views Bug Tracker, **Then** they see
   that bug in read-only form (no edit, status-change, or delete controls).
2. **Given** a bug NOT marked client-visible, **When** the same Client user
   views Bug Tracker, **Then** that bug does not appear anywhere for them.
3. **Given** a Client user without access to the project at all, **When**
   they attempt to view or navigate to that project's Bug Tracker,
   **Then** they are denied entirely.

### Edge Cases

- What happens when a bug's Status is set directly from "Awaiting Review" to
  "Fixed", skipping the Development Work stages? Allowed — Status is a free
  selection among the four values by any internal user with access, not a
  gated workflow (matches the assumption below).
- What happens when the Owner assigned to a bug loses project access before
  the due date passes? The breach notification still targets that user
  (consistent with how existing notification recipients aren't revoked
  retroactively elsewhere in iTrack); this is not expanded further in this
  phase.
- What happens when a Client user is granted access to a project after a
  bug was already marked client-visible? They see it immediately on their
  next visit — visibility is evaluated at view-time, not capture-time.
- What happens to the Bug ID sequence if a bug is deleted? Bug IDs are never
  reused — the sequence only increments, matching typical ID-generation
  expectations (no renumbering on deletion).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow internal users (Admin, Project Manager,
  Team Member, Department Head) with access to a project to create a bug
  with a title, description, and priority.
- **FR-002**: System MUST auto-generate a unique, sequential, project-scoped
  Bug ID for every new bug (e.g., "BUG-001", "BUG-002", ...), never reused.
- **FR-003**: System MUST default a new bug's Reporter to the creating user;
  internal users MUST be able to change the Reporter and optionally assign
  an Owner responsible for fixing it.
- **FR-004**: System MUST support exactly four Status values — Awaiting
  Review, Ready for Dev, Fixing, Fixed — and MUST group bugs for display as:
  Awaiting Review → "Incoming"; Ready for Dev or Fixing → "Development
  Work"; Fixed → "Resolved".
- **FR-005**: System MUST support exactly four Priority values — Critical,
  High, Medium, Low — settable by any internal user with access to the
  bug's project.
- **FR-006**: System MUST allow internal users to set an optional due date
  and an optional free-text "Sprint/Milestone" label on a bug; neither field
  is required, and the label has no relationship to any other entity.
- **FR-007**: For any bug with a due date set and a Status other than Fixed,
  system MUST display a live countdown (or an overdue indicator once the
  date has passed) wherever that bug is shown on the board.
- **FR-008**: System MUST send exactly one SLA breach notification, to the
  bug's Reporter and its Owner (if assigned), the first time a bug's due
  date passes while its Status is not Fixed.
- **FR-009**: System MUST NOT send a breach notification for a bug that
  reaches Fixed status before its due date passes.
- **FR-010**: System MUST allow internal users to mark each bug as
  internal-only or client-visible, using the same visibility convention
  already implemented for Work Program's Attachment and Comment models.
- **FR-011**: System MUST allow Client-role users to view (read-only) only
  bugs marked client-visible on projects they have access to; Client-role
  users MUST NOT be able to create, edit, delete, or change the status,
  priority, or visibility of any bug.
- **FR-012**: System MUST deny all Bug Tracker access (viewing or creating)
  to any user — internal or Client — without access to the relevant
  project, matching iTrack's existing per-project access control.
- **FR-013**: System MUST NOT provide cross-board/"Connected to" linking or
  a real Sprint entity — the Sprint/Milestone field defined in FR-006 is the
  full extent of any sprint association in this phase.

### Key Entities

- **Bug**: A single defect report, scoped to one project. Attributes:
  title, description, Reporter (internal user), Owner (optional internal
  user), Priority (Critical/High/Medium/Low), Status (Awaiting
  Review/Ready for Dev/Fixing/Fixed), Bug ID (sequential, project-scoped,
  never reused), Sprint/Milestone label (optional free text), due date
  (optional), visibility (internal-only or client-visible), created/updated
  timestamps.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An internal user can report a new bug and see it correctly
  placed in its status group within a few seconds, with no manual
  refresh needed.
- **SC-002**: 100% of bugs whose due date passes while still not Fixed
  produce exactly one breach notification to the Reporter and Owner — no
  duplicates, no misses, in verification testing.
- **SC-003**: Across verification testing, Client-role users never see a
  bug that isn't explicitly marked client-visible, and never see any bug on
  a project they don't have access to — zero exceptions.
- **SC-004**: An internal user can take a bug from creation through to
  Fixed using only status changes within the Bug Tracker view, without
  needing any other part of iTrack.

## Assumptions

- Status changes are a free selection among the four values by any internal
  user with project access — not a gated, sequential workflow requiring
  prior stages to be visited first (matches the "Edge Cases" note above and
  keeps Phase 1 simple, consistent with how Retrospectives' sentiment/Type
  field works today).
- "Owner" is a new, distinct field from "Reporter" (the filer vs. the person
  responsible for fixing it) — the original description referenced "any
  assigned owner" implying this field exists; it is added here as a
  reasonable, named field rather than left implicit.
- Detecting a due date passing (to trigger the SLA breach notification) is
  a background/system-level check, not something that only fires when a
  user happens to load the page — the exact mechanism (e.g., a scheduled
  check) is a planning-phase decision, not a product-level constraint.
- Bug Tracker is scoped per-project, matching every other iTrack feature
  (Work Program, Kanban, Support Ops, Retrospectives) — there is no
  cross-project or organization-wide bug list in this phase.
- No file attachments or comment threads on bugs in this phase (explicitly
  out of scope per the source request) — if needed later, the existing
  015-retro-entry-context pattern is the template to reuse.
