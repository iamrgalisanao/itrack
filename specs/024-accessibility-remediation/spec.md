# Feature Specification: Accessibility Remediation — Timeline, Status Colour, and Chart Honesty

**Feature Branch**: `024-accessibility-remediation`

**Created**: 2026-08-28

**Status**: Draft

**Input**: Issue #8 (accessibility batch) and issue #12, scoped and sequenced by the Software Architect after the #14–#25 run. Findings originate in `specs/023-gantt-reports-tokens/accessibility-review.md` (Section 508 specialist, Brettel–Viénot–Mollon dichromacy simulation + CIEDE2000) and the Data Visualization Engineer review recorded in `docs/outstanding-work.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operate the project timeline without a mouse (Priority: P1)

A project manager who navigates by keyboard, and a team member using a screen reader, both need to move along the Work Program timeline, learn a task's dates and progress, and open it for editing. Today the timeline bar responds only to hover and click. There is no way to reach it with a keyboard, and its detail card is announced in full on every row as undifferentiated text — including an instruction to click, addressed to people who cannot.

**Why this priority**: It is the only story here where a class of user cannot perform the task at all, rather than performing it with difficulty. The timeline is the primary view of the product's core hierarchy. It is also the only story with a confidentiality dimension (see FR-007), which is why it must not be split.

**Independent Test**: Navigate the Work Program timeline using only a keyboard, then again with a screen reader, and confirm every task's dates, duration, progress and status can be reached and understood, and that the task can be opened for editing. Delivers a usable timeline on its own, with no other story implemented.

**Acceptance Scenarios**:

1. **Given** the Work Program timeline is displayed, **When** a user presses Tab repeatedly, **Then** each task's timeline bar receives focus in the same order the rows are displayed, and the focused bar shows a visible focus indicator.
2. **Given** a timeline bar has keyboard focus, **When** the user presses Enter or Space, **Then** the same task editor opens that a mouse click opens.
3. **Given** a timeline bar has keyboard focus, **When** a screen reader announces it, **Then** the announcement identifies the task by name and conveys its status and schedule — not merely "button" or the bar's visual position.
4. **Given** a task's detail card is displayed on focus or hover, **When** the user presses Escape, **Then** the card closes and focus remains on the bar.
5. **Given** a screen reader is reading the timeline row by row, **When** it reaches a task, **Then** it announces the task's information exactly once, and does not read a duplicate copy of the detail card or any instruction that is actionable only with a mouse.
6. **Given** a task detail includes fields not shown in the row summary (level, planned versus actual dates, duration, progress), **When** a screen reader user reaches that task, **Then** those fields are available to them.

---

### User Story 2 - Tell one status from another without relying on hue (Priority: P2)

A user with red–green colour blindness — roughly 1 in 12 men — reads a group summary bar and a project status chart. Today several statuses are distinguishable only by hue, two of them are two shades of a single hue even in ordinary vision, and in one chart three different statuses render as the same colour.

**Why this priority**: Affects a large, permanent, and silent population. Unlike Story 1 the information is reachable, but two different states can be indistinguishable — which produces confident wrong readings rather than obvious failure. Ranked below Story 1 because a user can still complete tasks, and because Story 1 carries a data-exposure risk this one does not.

**Independent Test**: View the group summary bar and the project status chart under simulated protanopia and deuteranopia, and confirm every status can be told apart from every other, and that each segment can be identified without reference to colour.

**Acceptance Scenarios**:

1. **Given** a group summary bar showing several statuses, **When** it is viewed under simulated protanopia or deuteranopia, **Then** each segment is distinguishable from every adjacent segment.
2. **Given** any status indicator in the feature's scope, **When** colour is removed entirely, **Then** the status remains identifiable from text, pattern, position, or shape.
3. **Given** the project status chart, **When** a project contains tasks that are not started, completed, and delayed, **Then** those three statuses render as three visibly different treatments rather than one.
4. **Given** the corrected status colour vocabulary, **When** the same status appears in the chart and in the summary figures above it on the same page, **Then** it is represented the same way in both.

---

### User Story 3 - Read actual numbers from the project status chart (Priority: P3)

A department head reviewing project reports needs to know how many tasks sit in each status. Today the chart's bars are scaled to each card's own maximum with no axis, no ticks and no printed figures; the count appears only in a tooltip on hover. A keyboard or touch user sees no numbers at all, and a status holding a single task next to one holding several hundred renders indistinguishably from empty.

**Why this priority**: A chart that cannot be read by a keyboard or touch user is an accessibility defect, but a chart that misrepresents quantity misleads *every* user, including the ones it appears to serve. Ranked below Story 2 only because the reader can seek the numbers elsewhere.

**Independent Test**: Open the project status chart with a keyboard and with touch only, and confirm the count for every status can be determined without hovering, and that a status with a very small non-zero count is visibly distinct from one with none.

**Acceptance Scenarios**:

1. **Given** the project status chart, **When** a user views it without a pointing device, **Then** the count for each status is available without hover.
2. **Given** a status with a count of one alongside a status with a count in the hundreds, **When** the chart renders, **Then** the small count is visibly distinguishable from a count of zero.
3. **Given** a project containing every status the system defines, **When** the chart renders, **Then** every status is displayed without wrapping or truncation.
4. **Given** two project cards with different totals, **When** a user compares them, **Then** the basis of the bar heights is evident and the reader is not led to believe two differently-scaled bars represent the same quantity.

---

### User Story 4 - See the edges of form controls (Priority: P4)

A user with low vision fills in a form. Today the boundary of every input, textarea and select in the application is drawn in a colour that sits at 1.27:1 against its background — below the 3:1 required for the visual boundary of a user interface component — so the control's extent is difficult to perceive.

**Why this priority**: Application-wide and affects a core interaction, but the controls remain operable and their labels are legible. It is the lowest-risk item to change and the highest in blast radius, which is why it is sequenced last rather than first.

**Independent Test**: Measure the contrast of every form control boundary against its adjacent background in both themes and confirm each meets the non-text threshold, then confirm no control's appearance regressed elsewhere.

**Acceptance Scenarios**:

1. **Given** any text input, textarea or select, **When** its boundary is measured against the surface behind it, **Then** the ratio is at least 3:1 in both light and dark themes.
2. **Given** the change to the control boundary, **When** the rest of the application is reviewed, **Then** no surface that legitimately shares that boundary colour has become visually heavier than intended.

---

### User Story 5 - Read labels that describe what the system actually does (Priority: P5)

An administrator opens the admin panel and sees the production authorization mechanism described as "Mock Auth Mode", implying the permission system is prototype scaffolding. Separately, a Client opens the schedule and finds a filter control whose only option is empty, because it is built from a field Clients are correctly not given.

**Why this priority**: Neither blocks a task. The first risks a serious misreading of the system's security posture by exactly the audience empowered to change it; the second presents a control that cannot work. Both are small and included because leaving them is a larger cost than fixing them.

**Independent Test**: Read the admin panel as an administrator and confirm no production mechanism is described as mock or prototype; open the schedule as a Client and confirm no filter is offered with nothing to filter by.

**Acceptance Scenarios**:

1. **Given** the admin panel, **When** an administrator reads the section describing departmental permissions, **Then** it describes the mechanism the system actually uses in production.
2. **Given** a Client viewing the schedule, **When** filter controls are displayed, **Then** no filter is presented whose options are empty for that role.

---

### Edge Cases

- A task whose detail card would announce a field the viewer's role is not permitted to see — the screen-reader rendering must withhold it on exactly the same condition as the visual one, and must withhold it when the role cannot be determined.
- A project whose tasks are all in a single status — the chart must not imply comparison against an absent maximum.
- A project with zero tasks — the chart and summary bar must render an explicit empty state rather than an ambiguous flat bar.
- A very long task name in the accessible name of a timeline bar — the announcement must remain usable rather than reciting an unbounded string.
- A timeline bar narrow enough that its label is suppressed visually — the information must still reach a screen reader.
- A user operating with a screen reader in browse mode rather than by tabbing — information must not depend on an element receiving focus.
- Windows High Contrast — status treatments must remain distinguishable when the system replaces the palette.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every timeline bar MUST be reachable by keyboard, in the visual order of the rows, and MUST show a visible focus indicator when focused.
- **FR-002**: A focused timeline bar MUST expose an accessible name identifying its task, and MUST support the same primary action from the keyboard that a pointer click performs.
- **FR-003**: The task detail presentation MUST open on keyboard focus as well as pointer hover, and MUST be dismissible without moving focus.
- **FR-004**: The system MUST NOT announce the task detail card as duplicate inline content on every row.
- **FR-005**: Any instruction that can only be carried out with a pointing device MUST NOT be presented to users who cannot use one.
- **FR-006**: Task information available only in the detail card — level, planned versus actual dates, duration and progress — MUST remain available to screen-reader users after FR-004 is satisfied.
- **FR-007**: Any screen-reader-only rendering of task data MUST apply the same role-based field restrictions as the visible rendering, MUST derive those restrictions from a single shared definition rather than a duplicate, and MUST withhold a restricted field when the viewer's role cannot be determined.
- **FR-008**: The system MUST NOT convey any status solely by colour; every status indicator MUST also be identifiable by text, pattern, position or shape.
- **FR-009**: Adjacent status treatments MUST remain distinguishable from one another under protanopia and deuteranopia simulation.
- **FR-010**: Every status the system defines MUST have an explicit representation in the project status chart; no two distinct statuses may share one representation by falling through to a default.
- **FR-011**: Status representation MUST be consistent between the chart and the summary figures presented alongside it on the same page.
- **FR-012**: The project status chart MUST make each status's count available without hover or pointer interaction.
- **FR-013**: A non-zero count in the project status chart MUST be visually distinguishable from a zero count regardless of the largest count present.
- **FR-014**: The project status chart MUST accommodate every status the system defines without wrapping or truncating.
- **FR-015**: The visual boundary of every form control **drawn with the input token** MUST meet the
  non-text contrast threshold against its adjacent background in both themes, and the count of native
  controls not drawn with that token MUST NOT increase.
  *(Amended after planning, with the residue stated rather than implied: of 127 native controls, 41
  take their boundary from the input token and are covered here; **81 take it from the general-purpose
  border token, which cannot move without changing every hairline in the application**; 5 are
  unclassified. Migrating those 81 is 81 judgments — on a muted toolbar strip a hairline is sometimes
  deliberate — and doing it here would destroy the one property that makes this story's regressions
  attributable to a single token move. Filed as feature 025. The ratchet in the second clause is what
  stops the residue growing meanwhile.)*
- **FR-016**: The administrative interface MUST NOT describe a production mechanism as mock, prototype, or scaffolding.
- **FR-017**: A filter control MUST NOT be presented when it has no options to offer, and when hidden
  its active selection MUST reset so no invisible filter keeps narrowing the view.
  *(Amended after planning: the original wording said "to a role", which invites a role check. A role
  check here reproduces the fail-open shape this feature exists to remove — the role is null until
  auth resolves. Emptiness is the observable the requirement is actually about, fails closed through
  that window, and self-corrects if the field policy changes.)*
- **FR-018**: Changes made for this feature MUST NOT reduce the contrast or distinguishability of any element that currently meets its threshold.

### Key Entities

- **Task detail presentation**: the set of fields describing one task beyond its row summary — level, planned and actual dates, duration, progress, status, and contributor. Its defining property for this feature is that it is currently the sole source of four of those fields, and that one of them is role-restricted.
- **Status vocabulary**: the set of task states the system recognises, and the visual treatment assigned to each. Its defining property is that it must be complete — every state the system can produce must have an assigned treatment — and consistent across every surface that renders it.
- **Status count**: the number of tasks in a given state on a given project, and the quantity a reader is entitled to determine from any chart that displays it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete the full timeline workflow — locate a task, read its schedule and progress, and open it for editing — using only a keyboard, with no step requiring a pointing device.
- **SC-002**: A screen reader announces each timeline task once, and the announcement contains the task's identity, status and schedule.
- **SC-003**: Zero fields restricted from a role by the visible interface are exposed to that role through any assistive-technology rendering, verified by an automated test that inspects the assistive text rather than the visible text.
- **SC-004**: Every pair of status treatments that can appear adjacent is distinguishable under protanopia and deuteranopia simulation, verified by measurement rather than inspection.
- **SC-005**: No status reaches its treatment through a default branch, and no two statuses are
  distinguishable by fill alone. Where two statuses deliberately share a fill, each carries a distinct
  row position, full text label, and printed count. **Sanctioned sharing is recorded in
  `GANTT_STATUS_TOKENS`** — that file is the register of which pairs may share, so "deliberate" is a
  checkable property rather than two entries that happen to match.
  *(Amended after planning: the original wording — "no two statuses share one representation" —
  asserted the opposite of the design's own CI contract, which pins `blocked`/`delayed` to one fill
  on purpose. Splitting fill from treatment is what makes both halves machine-checkable.)*
- **SC-006**: Every status count in the project status chart can be determined without a pointing device.
- **SC-007**: A status with a count of one is visibly distinguishable from a status with a count of zero on a chart whose largest count is at least one hundred.
- **SC-008**: Every form control boundary **drawn with the input token** measures at least 3:1 against
  its adjacent background in both themes — 41 of 127 native controls — and the number drawn with the
  general-purpose border token does not rise above 81. The conformance claim for 1.4.11 after this
  feature is **Partially Supports**, with two named residues: those 81 controls, and the progress
  overlay edge.
- **SC-009**: No element that met a contrast or distinguishability threshold before this feature falls below it after, verified by the existing automated gates.
- **SC-010**: No interface text describes a production mechanism as mock or prototype.

## Assumptions

- **The timeline bar's primary keyboard action is opening the task editor**, matching what a pointer click already does and what the adjacent Edit control already offers. No new capability is introduced by making it reachable.
- **The role restriction to reproduce is the one already applied to the contributor field** in the visible timeline pane. This feature does not decide policy; it prevents a new rendering from diverging from the existing decision. The broader question of when row-scoping versus field-scoping applies is recorded separately in `docs/outstanding-work.md` and is not resolved here.
- **The status vocabulary is the one the backend defines**, plus the parent rollup state the interface synthesises. Correcting a chart to match it is a fix, not a redefinition.
- **Non-text contrast is assessed against 3:1**, the established threshold for the visual boundary of a user interface component.
- **The form-control boundary and the general-purpose border currently share one value.** Raising the former to meet FR-015 may require separating them; FR-018 and SC-009 exist to bound the consequences of that. The precise values are a design decision for planning, not a scope decision.
- **Colourblind distinguishability is assessed by simulation and perceptual colour difference**, consistent with the method already used in the 023 accessibility review, rather than by unaided judgement.
- **Verification uses the automated contrast and cascade gates already in the repository** where they apply, extended where they do not, rather than a new parallel mechanism.
- **Out of scope, and already resolved**: transparent floating surfaces, the border-colour cascade defect, focus indication under forced colours, and the floating-surface contract for menus and selects.
- **Out of scope, and recorded elsewhere**: the dark-theme dialog boundary, and the architectural decision record on row-scoping versus field-scoping.
