# Feature Specification: Task Detail Tabs & Completion Indicators

**Feature Branch**: `010-task-detail-tabs`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Split the shared TaskDetailModal's single long-scroll Details tab into Details/Support/Resolution/Comments/Files tabs when viewing a Support Ops issue, with per-tab completion indicators (e.g. 'Support 2/2') and a non-blocking save-time summary of missing fields. Deferred out of 003-templates-prompt-generator, where it was scoped out because it needed the modal's tab system generalized, a 'required field' concept that doesn't exist in the data model today, and care to avoid leaking into Kanban's plain task modal."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Support Ops issue's fields are organized into focused tabs (Priority: P1)

Today, opening a Support Ops issue's detail view shows one long Details tab: the task's base fields (title, status, progress, assignee, priority, dates, description, notes) followed immediately by every Support Ops field (client, tenant, channel, priority, next action, evidence, root cause, resolution) and three copy-generator tools, all in one continuous scroll. A team member investigating an issue has to scroll past unrelated sections to find the one field they need. Splitting this into Details / Support / Resolution / Comments / Files tabs lets them jump straight to the section they came for.

**Why this priority**: This is the actual complaint the redesign exists to fix — an unwieldy single-scroll form. Every other story in this feature is a refinement layered on top of this reorganization.

**Independent Test**: As an internal team member, open a Support Ops issue; confirm five tabs are shown (Details, Support, Resolution, Comments, Files), each showing only the fields described for it below; open a Kanban board task (not a Support Ops issue) and confirm it still shows exactly the three tabs it shows today (Details, Comments, Files), with no Support or Resolution tab.

**Acceptance Scenarios**:

1. **Given** a Support Ops issue, **When** its detail view opens, **Then** five tabs are shown: Details, Support, Resolution, Comments, Files.
2. **Given** the Support tab, **When** it is opened, **Then** it shows exactly: Client, Tenant, Channel, Client Priority, Last Client Update (and the action to record one), Next Action, and the Client Message Templates and Freeform Client Update tools.
3. **Given** the Resolution tab, **When** it is opened, **Then** it shows exactly: Evidence, Root Cause, Resolution, and the Troubleshooting Packet tool.
4. **Given** the Details tab on a Support Ops issue, **When** it is opened, **Then** it shows only the same base fields it already shows today for any task (title, status, progress, assignee, priority, planned dates, description, notes) — none of the Support Ops fields moved in Acceptance Scenarios 2-3 appear there anymore.
5. **Given** a Kanban board task that is not a Support Ops issue, **When** its detail view opens, **Then** it shows exactly the three tabs it already shows today (Details, Comments, Files) — no Support or Resolution tab appears, and its Details tab is completely unchanged.

---

### User Story 2 - A tab's label shows whether its information is complete (Priority: P2)

Having found the right tab, a team member still has to read every field on it to notice something's missing. A completion indicator on the Support and Resolution tab labels — the same kind of at-a-glance count the Comments and Files tabs already show — lets them tell whether an issue's client information or its root cause and resolution are fully recorded without opening the tab at all.

**Why this priority**: Organizing fields into tabs (Story 1) only helps once someone opens the right one; a completion indicator is what makes an incomplete issue visible from outside the tab, which is what actually prompts someone to go fill in the gap.

**Independent Test**: As an internal team member, open a Support Ops issue missing its root cause and resolution; confirm the Resolution tab's label shows it is missing information (e.g. "0/2"); fill in both fields; confirm the label updates to show it is now complete, without needing to save or close the modal first.

**Acceptance Scenarios**:

1. **Given** a Support Ops issue with neither Client nor Client Priority recorded, **When** its detail view opens, **Then** the Support tab's label indicates 0 of 2 required fields are filled in.
2. **Given** a Support Ops issue with both Root Cause and Resolution recorded, **When** its detail view opens, **Then** the Resolution tab's label indicates both of its 2 required fields are filled in.
3. **Given** an open issue, **When** a team member fills in a previously-empty required field, **Then** the relevant tab's completion indicator updates immediately, without requiring a save.
4. **Given** the Comments and Files tabs, **When** a completion indicator appears elsewhere on Support/Resolution, **Then** Comments' and Files' own existing count badges (number of comments, number of files) are visually distinguishable from a completion indicator — the two represent different things (activity volume vs. required-field completeness) and must not be confused for one another.

---

### User Story 3 - A save-time summary catches anything still missing (Priority: P3)

Even with tab labels showing completion state, someone moving quickly between tabs can still save without noticing a gap. A one-time summary shown when saving — "Resolution is missing: Root Cause" — catches this without stopping them: the save still succeeds either way, this is a reminder, not a gate.

**Why this priority**: This is a safety net on top of Stories 1 and 2, not a replacement for either — most gaps will already be visible from the tab labels alone by the time someone gets here.

**Independent Test**: As an internal team member, save a Support Ops issue that is still missing one or more required fields; confirm a summary lists exactly which fields are missing, grouped by tab; confirm the save completes successfully regardless.

**Acceptance Scenarios**:

1. **Given** an issue missing its Client Priority and its Resolution, **When** it is saved, **Then** a summary appears listing both, identifying which tab each belongs to.
2. **Given** the same save, **When** the summary appears, **Then** the save has already succeeded (or succeeds regardless) — the summary is informational, never a blocking confirmation the user must dismiss to proceed.
3. **Given** an issue with every required field already filled in, **When** it is saved, **Then** no summary appears at all.

---

### Edge Cases

- **Does this apply to a task that isn't a Support Ops issue?** No. A Kanban board task never shows a Support or Resolution tab, never shows a completion indicator, and never shows a save-time summary — its detail view is completely unaffected by this feature, exactly preserving the concern raised when this redesign was first deferred.
- **Can a required field ever block saving?** No, never. Every indicator introduced by this feature — tab-label counts, field markers, the save-time summary — is informational only. This app has no required-field concept for these columns today, and this feature does not introduce one at the data or validation level; it only surfaces completeness as a visual signal.
- **What happens when the detail view is opened read-only (e.g., from the Support Ops Knowledge Base)?** Tab labels and their completion indicators still show — they reflect this issue's already-recorded data either way, so they're still useful reference information while browsing history. Individual field markers and the save-time summary do not apply, since there is nothing to act on and no save action exists in that view.
- **What happens to an issue with all required fields already filled in when it's first opened?** Its tab labels show full completion immediately, and no save-time summary ever appears for it, regardless of how many times it's saved.
- **What happens if a field is filled in and then cleared again before saving?** The tab's completion indicator reflects the field's current, in-progress value at every moment — it is not a one-time check performed only at open or only at save.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show five tabs — Details, Support, Resolution, Comments, Files — when the detail view opens for a Support Ops issue.
- **FR-002**: System MUST continue to show exactly three tabs — Details, Comments, Files — unchanged, when the detail view opens for a task that is not a Support Ops issue.
- **FR-003**: The Details tab MUST show only the fields it already shows today for any task (title, status, progress, assignee, priority, planned start/end dates, description, notes) — no Support Ops-specific field may appear there once this feature ships.
- **FR-004**: The Support tab MUST show exactly: Client, Tenant, Channel, Client Priority, Last Client Update (and the action to record one now), Next Action, and the Client Message Templates and Freeform Client Update tools.
- **FR-005**: The Resolution tab MUST show exactly: Evidence, Root Cause, Resolution, and the Troubleshooting Packet tool.
- **FR-006**: System MUST treat Client and Client Priority as the Support tab's required fields for completion-counting purposes.
- **FR-007**: System MUST treat Root Cause and Resolution as the Resolution tab's required fields for completion-counting purposes.
- **FR-008**: System MUST show a completion count on the Support and Resolution tab labels (how many of that tab's required fields currently have a value), updated immediately as fields are edited, without requiring a save.
- **FR-009**: System MUST visually distinguish a completion indicator (Support/Resolution) from an activity-count badge (Comments/Files) — they represent different things and MUST NOT be presented in a way that could be mistaken for one another.
- **FR-010**: System MUST mark an individual required field that currently has no value with a visible indicator next to its label, while the detail view is open and editable.
- **FR-011**: System MUST show a summary of every currently-missing required field, grouped by tab, at the point of saving, whenever at least one required field is missing — and MUST show nothing extra when none are missing.
- **FR-012**: System MUST NOT prevent, delay, or require confirmation before a save completes on account of any missing required field — every indicator this feature introduces is informational only.
- **FR-013**: System MUST NOT introduce any required-field enforcement at the API or data-storage level — this feature is a frontend reorganization and completeness signal only, not a new validation rule.
- **FR-014**: When the detail view is opened in a read-only mode (no save action available), System MUST still show the Support/Resolution tab split and their completion counts, but MUST NOT show individual missing-field markers or a save-time summary, since neither describes an action available in that view.

### Key Entities

None — no new data is introduced. This feature reorganizes and annotates the presentation of fields that already exist on a Support Ops issue (`DetailedActivity` with an eligible `work_type`); it does not add, rename, or store anything new.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team member can locate any Support Ops field (e.g., Root Cause) within one tab selection, without scrolling past unrelated sections, where today it requires scrolling through a single combined form.
- **SC-002**: A team member can tell whether a given issue's Support or Resolution information is fully recorded by reading its tab labels alone, without opening either tab.
- **SC-003**: Zero Kanban board tasks (non-Support-Ops) ever display a Support or Resolution tab, a completion indicator, or a save-time summary — verified by manual walkthrough, matching this app's established practice for its frontend-only changes (no automated frontend test suite exists in this codebase).
- **SC-004**: Zero saves are ever blocked, delayed, or require an extra confirmation step because of a missing required field — verified by manual walkthrough covering an issue missing every required field.

## Assumptions

- **Required fields are defined by reusing rules this app already has, not by inventing new ones.** Client and Client Priority are already the two fields this app requires at Support Ops intake time (`SupportOpsController::store()`'s existing validation); Root Cause and Resolution are already the two fields 009-support-ops-knowledge-base already requires for an issue to be discoverable in that feature's search. This feature reuses both existing definitions verbatim as its "required" sets, rather than introducing a third, independent notion of what's required.
- **"Required" here means "worth flagging as missing," not "must be present to save."** This app has no backend/schema-level required-field concept for any of these columns today (confirmed: `DetailedActivityController::update()` accepts every Support Ops field as optional), and this feature does not add one. Every indicator this feature introduces is a frontend completeness signal only.
- **The tab split is a task-content distinction, not a caller distinction — but a future caller still has to supply the two Support Ops render props.** Whether a task's detail view shows three or five tabs follows from whether that task is a Support Ops issue, not from which page opened the view — so Kanban board tasks are unaffected automatically, without needing page-by-page special-casing to keep them that way. A *future* page that opens a Support Ops issue's detail view does not get the five-tab layout automatically just because the task qualifies, though: it still needs to supply both Support Ops render props, exactly as the three existing Support Ops-facing pages do. A caller that shows a Support Ops issue but forgets one or both props falls back to the plain three-tab layout rather than erroring or showing a half-built tab (see data-model.md's `showSupportResolutionTabs` check) — a safe default, not a silent feature gap, but not "automatic" either.
- **Any future Support Ops field must be assigned to exactly one of Details, Support, or Resolution when it's added.** This spec enumerates the fields that exist today (FR-003/FR-004/FR-005); it does not define a rule for classifying a field that doesn't exist yet. Whoever adds a new Support Ops column should extend the relevant tab's field list explicitly, not leave a new field unassigned or split across tabs implicitly.
- **This feature is compatible with the existing read-only viewing mode** (009-support-ops-knowledge-base's use of the same shared detail view) — tab structure and completion counts remain useful reference information there; only the action-oriented indicators (field markers, save-time summary) are specific to an editable session and don't apply.
- **No new backend endpoint, migration, or field.** Every field referenced here already exists on `DetailedActivity` and is already returned by the resources already in use; this is a presentation-layer feature only.
- **This feature depends on the shared detail view already used across Kanban, Support Ops, Today, and the Knowledge Base** (`TaskDetailModal` and its `extraFields`-supplied Support Ops fields) continuing to exist in its current caller-controlled shape; it extends that shape, it does not replace it.
