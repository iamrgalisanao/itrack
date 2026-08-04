# Feature Specification: Sprint Retrospectives

**Feature Branch**: `013-sprint-retrospectives`

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "Add a Sprint Retrospectives feature to iTrack, inspired by monday dev's Retrospectives board (see docs/research/monday-dev-sprints.md) but scoped to what iTrack already has: since iTrack has no formal "Sprint" entity yet, retrospectives are organized into named retro sessions that a Project Manager or Admin creates ad hoc within a project (e.g. "Sprint 3", "Q1 Wrap-up", any label they choose) — not tied to a recurring Sprint board. Within a session, internal team members (Admin, Project Manager, Team Member, Department Head — matching the existing internal-only access pattern used by Kanban and Support Ops) can continuously add insight entries at any time during the work period, not only during a single retro meeting. Each entry is tagged with a sentiment category (Keep / Improve / Discuss), can be voted on by other team members to surface priority, and can be assigned an owner responsible for following up. This ships as a standalone view alongside Work Program, the same way Support Ops was added as a separate operational layer on top of the existing task system — it must not require any change to Work Program's Module → Activity → Sub-Activity → Task hierarchy. Client-role users do not get access, matching Kanban/Support Ops's existing internal-only restriction. Phase 1 scope only: sessions, entries, sentiment tags, voting, and owner assignment for follow-up. Explicitly out of scope for this phase: linking retro sessions to a formal Sprint entity (doesn't exist yet), automatically closing/archiving sessions, and any analytics/trend reporting across multiple sessions."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a retro session and capture insights as they happen (Priority: P1)

A Project Manager or Admin creates a named retro session for a project (e.g. "Sprint 3" or "Q1 Wrap-up"). From that point on, any internal team member working on the project can add an insight entry the moment it occurs to them — mid-week, right after a rough deploy, whenever — instead of trying to remember it until a scheduled meeting.

**Why this priority**: This is the entire premise of the feature: capturing insight continuously, not just during a single retro ceremony. Without a session to add entries to, nothing else in this feature has anywhere to live.

**Independent Test**: Create a session, have two different internal users each add an entry on different days, and confirm both entries appear together in that session, attributed to their authors.

**Acceptance Scenarios**:

1. **Given** a Project Manager viewing a project, **When** they create a new retro session with a label of their choosing, **Then** the session appears immediately, empty and ready for entries.
2. **Given** an open retro session, **When** a Team Member adds an insight entry, **Then** it appears in the session attributed to them, without requiring a scheduled meeting to be in progress.
3. **Given** a project with no retro sessions yet, **When** an internal user opens the retrospectives view, **Then** they see a clear empty state, not an error.

---

### User Story 2 - Tag entries by sentiment so the team can see them organized (Priority: P1)

Every insight entry carries exactly one sentiment tag — Keep, Improve, or Discuss — so that when the team does sit down to review a session, the entries are already sorted into the categories that structure a real retro conversation, instead of being one undifferentiated list.

**Why this priority**: Sentiment tagging is what turns a list of comments into a retrospective. It's inseparable from User Story 1's entries and equally foundational.

**Independent Test**: Add entries with each of the three sentiment tags to one session and confirm the session visually distinguishes or groups them by tag.

**Acceptance Scenarios**:

1. **Given** the entry form, **When** a user adds an entry, **Then** they must choose exactly one of Keep, Improve, or Discuss — the entry cannot be saved without a tag.
2. **Given** a session with entries across all three tags, **When** a user views the session, **Then** entries are visibly grouped or distinguished by their tag.

---

### User Story 3 - Vote on entries to surface what matters most (Priority: P2)

Team members vote on entries they think deserve attention, so that when the team's limited discussion time arrives, it goes to what the team actually cares about rather than being spent in entry order.

**Why this priority**: Valuable once a session has more than a handful of entries, but a session with only a few entries is still fully usable without it — ranked just below the foundational capture-and-tag stories.

**Independent Test**: Have multiple users vote on different entries in the same session and confirm vote counts update and are visible to every viewer, and that a user can un-vote an entry they previously voted on.

**Acceptance Scenarios**:

1. **Given** an entry with no votes, **When** a team member votes on it, **Then** its vote count increases and is visible to everyone viewing the session.
2. **Given** an entry a user has already voted on, **When** that same user votes again, **Then** their vote is removed (toggled off) rather than counted twice.
3. **Given** a session with entries carrying different vote counts, **When** a user views the session, **Then** they can tell which entries have more support without counting manually.

---

### User Story 4 - Assign an owner so follow-through actually happens (Priority: P2)

An entry — typically one tagged Improve — can be assigned an owner responsible for acting on it, so the outcome of a retrospective is a tracked commitment rather than a comment that gets forgotten once the meeting ends.

**Why this priority**: This is what closes the loop from "we talked about it" to "someone is doing something about it." Ranked alongside voting — both refine a session that already has entries, neither is needed for the session to exist at all.

**Independent Test**: Assign an owner to an entry, confirm the ownership is visible to anyone viewing the session, then reassign it to someone else and confirm the change is reflected.

**Acceptance Scenarios**:

1. **Given** an entry with no owner, **When** a team member assigns one, **Then** the entry visibly shows who owns it.
2. **Given** an entry with an owner already assigned, **When** a team member reassigns or clears the owner, **Then** the entry reflects the new state immediately.

---

### User Story 5 - Browse and reopen past sessions (Priority: P3)

A team member can see the list of retro sessions that have happened on a project and reopen any of them to review what was discussed, without that history being lost once a new session starts.

**Why this priority**: Day-to-day usage centers on whichever session is currently active; browsing history matters for institutional memory but doesn't block using the feature at all on day one.

**Independent Test**: Create two separate sessions with different entries in each, then confirm both are listed, and that opening either one shows only its own entries.

**Acceptance Scenarios**:

1. **Given** a project with multiple retro sessions, **When** a user opens the retrospectives view, **Then** they see all sessions listed, most recent first.
2. **Given** two sessions with different entries, **When** a user opens one of them, **Then** only that session's entries are shown — never another session's.

---

### Edge Cases

- A retro session and its entries are scoped to the same project-level access rules as everything else in iTrack — if a user's access to the project changes, their access to that project's retro sessions changes the same way, with no separate visibility mechanism to fall out of sync. This applies to editing and deleting, not only viewing: a Team Member who authored an entry but has since lost access to that project MUST NOT retain the ability to edit or delete that entry, even though they were once its author.
- A Client-role user who reaches a retrospectives URL directly (not through navigation) is denied the same as they would be for Kanban or Support Ops — there is no reduced or partial view for that role.
- An entry can be edited or deleted by its original author or by an Admin/Project Manager; other users cannot alter someone else's entry.
- A session, once created, has no scheduled end — it stays open and editable indefinitely in this phase (no auto-close or archive behavior).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let users in the existing `canWrite()` role set (Admin, Project Manager, Team Member) create a new retro session within a project they have access to, with a free-text label of their choosing.
- **FR-002**: System MUST let users in the internal-view role set (Admin, Project Manager, Team Member, Department Head) — the same set already used by Kanban and Support Ops — view any retro session and its entries for a project they have access to.
- **FR-003**: System MUST let `canWrite()` roles add an insight entry to any open session at any time, not restricted to a scheduled meeting window.
- **FR-004**: System MUST require every entry to carry exactly one sentiment tag — Keep, Improve, or Discuss — chosen at creation; an entry cannot be saved without one.
- **FR-005**: System MUST let `canWrite()` roles cast one toggleable vote per entry (voting again removes their vote), and MUST show the current vote count to every viewer regardless of role.
- **FR-006**: System MUST let `canWrite()` roles assign, reassign, or clear an owner on any entry, where the owner MUST be validated as an internal user who currently has access to that project — not merely any user ID supplied in the request.
- **FR-007**: System MUST let an entry's original author, or an Admin/Project Manager, edit or delete that entry, provided that user currently has access to the entry's project; no other user may alter it, and a former author who has lost project access MUST be denied the same as any other non-author (see Edge Cases).
- **FR-008**: System MUST deny the Client role — and any user whose role cannot be validated — from viewing or writing to retrospectives entirely, fail-closed, consistent with Kanban/Support Ops's existing internal-only restriction.
- **FR-009**: System MUST list every retro session for a project, most recent first, and let a user reopen any past session to view only that session's own entries.
- **FR-010**: System MUST NOT require, reference, or depend on a formal Sprint entity anywhere in this feature, since none exists in iTrack today.
- **FR-011**: System MUST NOT alter Work Program's existing Module → Activity → Sub-Activity → Task hierarchy or any of its current behavior — retrospectives is an additive, standalone layer.
- **FR-012**: System MUST NOT automatically close, archive, or expire a retro session in this phase — sessions remain open and editable indefinitely once created.

### Key Entities *(include if feature involves data)*

- **Retro Session**: A named, project-scoped container for a retrospective (e.g. "Sprint 3"). Has a label, the project it belongs to, who created it, and when. Stays open indefinitely in this phase — no status/lifecycle beyond existing.
- **Retro Entry**: A single insight recorded within one Retro Session. Has its author, a body of text, exactly one sentiment tag (Keep / Improve / Discuss), a set of voters (for the toggleable vote count), and an optional owner responsible for follow-up.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An internal team member can record an insight entry into an active session in well under a minute, without navigating anywhere beyond the session itself.
- **SC-002**: 100% of entries display exactly one sentiment category — no entry exists without one.
- **SC-003**: A team member can identify a session's highest-priority discussion points by vote count alone, without reading every entry individually.
- **SC-004**: Every entry with an assigned owner clearly shows who owns it, verified through at least one reassignment.
- **SC-005**: A Client-role account attempting to reach retrospectives, by navigation or direct URL, is denied 100% of the time with zero entry data exposed.
- **SC-006**: A user can locate and reopen any past session for a project on their own, without asking a teammate or administrator where it went.

## Assumptions

- The view/write role split mirrors the existing Kanban/Support Ops pattern exactly: the internal-view set includes Department Head (read-only), while the write set is the existing `canWrite()` role set, which excludes Department Head — per the source request's explicit instruction to match that pattern.
- Entry edit/delete permission (author, or Admin/Project Manager) is a reasonable default consistent with how other collaborative content in iTrack is generally moderated; the source request did not specify this explicitly.
- One toggleable vote per user per entry is a reasonable default; the source request did not specify a voting limit.
- iTrack has no Sprint entity today (confirmed in `docs/research/monday-dev-sprints.md`'s comparison to iTrack) — sessions are this phase's substitute grouping mechanism, explicitly not intended to become a Sprint entity later without a separate decision.
- This feature depends on Work Program's existing per-project access scoping (the same mechanism that already governs Kanban, Support Ops, and Work Program itself) to determine which projects a user may create or view sessions within — no new project-visibility mechanism is introduced.
- Analytics or trend reporting across multiple sessions, and any automatic session closing/archiving, are explicitly deferred past this phase per the source request.
