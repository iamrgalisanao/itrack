# Feature Specification: Legible Gantt Labels and Tokenised Chart Colours

**Feature Branch**: `023-gantt-reports-tokens`

**Created**: 2026-08-27

**Status**: Draft

**Input**: Follow-up 4 from `specs/022-dark-status-contrast/research.md`, plus the live AA failure
recorded in that feature's `verification-record.md`.

## Why this exists

Two problems that live in the same two files, one urgent and one cosmetic.

**The urgent one**: the Gantt chart's percentage label is unreadable. It is small white text drawn
on top of a translucent white progress fill, so its real backdrop is the bar lightened by about a
fifth — much paler than the bar itself. Measured, it sits between 1.86:1 and 2.78:1 where the
accessibility floor for text this size is 4.5:1. This is the last confirmed contrast failure left
in the product.

**The cosmetic one**: the colours in the Gantt bars and the Reports progress ring are written
directly into the page code rather than drawn from the product's shared colour set. When feature
022 corrected every status colour in the design system, these two surfaces did not move with them,
so they now sit visibly out of step with every other status indicator in the app. One of them still
uses a brand accent that was replaced some time ago.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the progress figure on a Gantt bar (Priority: P1)

As anyone reading a project timeline, I can read the percentage printed on a task bar at a glance,
in either theme, without leaning in or selecting the text to make it out.

**Why this priority**: It is the only remaining place in the product where text fails the
accessibility floor, and it fails badly — less than half the required contrast on some bars. The
number is the entire point of printing it on the bar; if it cannot be read, the bar is decoration.

**Independent Test**: Open the Gantt view in both themes and look at bars in each status that shows
a percentage. Measure the label against the surface actually behind it — the progress fill, not the
bar — and confirm each meets the accessibility floor for its size.

**Acceptance Scenarios**:

1. **Given** a task bar wide enough to show its percentage, **When** it renders in either theme,
   **Then** the percentage meets the contrast floor against the surface directly behind it.
2. **Given** a bar in any status that displays a percentage, **When** the label is measured over the
   translucent progress fill rather than over the bar, **Then** it still meets the floor — the fill
   is the real backdrop and is what made the current text unreadable.
3. **Given** a bar too narrow to show a percentage, **When** it renders, **Then** nothing regresses:
   the label is already suppressed below a width threshold and stays suppressed.

---

### User Story 2 - Status colours agree across the whole product (Priority: P2)

As someone scanning the app, a task that is delayed looks the same shade of "delayed" on the Gantt
chart as it does on the Taskboard, the Work Program list and the Bug Tracker.

**Why this priority**: Real but not urgent. Nothing is unreadable; the colours simply disagree with
the rest of the product because they were left behind by the last colour correction. The cost of
leaving it is that the disagreement widens every time the shared colours are touched again.

**Independent Test**: Put the Gantt view beside any other status-bearing screen in the same theme
and compare the same status. The two should read as the same colour. Then change a shared status
colour and confirm the Gantt bar follows it.

**Acceptance Scenarios**:

1. **Given** the shared status colours, **When** a Gantt bar renders for a given status, **Then**
   its colour comes from the shared set rather than from a value written into the page.
2. **Given** a future change to a shared status colour, **When** it is changed in one place, **Then**
   the Gantt bars and the Reports ring follow it without further edits.
3. **Given** the retired brand accent still used by the Reports ring, **When** the ring renders,
   **Then** it uses the current accent instead.

---

### Edge Cases

- A bar whose status has no percentage to show (not started) — the label is already suppressed for
  these, so it is not part of the legibility problem despite sharing the same styling.
- Very narrow bars, where the label is suppressed and a milestone marker is drawn instead.
- The printed report view, which forces its own light colours and must not be broken by this change.
- Bars at 0% and at 100%, where the translucent fill covers none or all of the bar and the label's
  backdrop differs accordingly.
- Users with a high-contrast or forced-colours setting — the fix must not fight the platform.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The percentage label on a Gantt bar MUST meet the accessibility contrast floor for its
  size, in both themes, measured against the surface **actually behind it** — including any
  translucent overlay drawn between the label and the bar.
- **FR-002**: Status colours used by the Gantt bars and the Reports progress ring MUST come from the
  product's shared colour set, so that changing a colour once changes it everywhere.
- **FR-003**: The timeline's status→colour map MUST be re-derived from the product's semantic
  colours rather than preserved. **Three colour changes, across five status keys**: work awaiting
  review moves red→amber, delayed work moves amber→red (agreeing with the Taskboard and list
  views), and backlog, not-yet-started and the roll-up value all move red→neutral. Backlog is one
  of the keys that both renders a percentage label today *and* changes colour, so it must not be
  overlooked. Preserving the current map is not an option,
  because a mechanical re-sourcing would turn "not started is an error" from an accident of a
  hard-coded value into a named assertion in the source.
- **FR-004**: The retired brand accent MUST be replaced with the current one.
- **FR-005**: The label's legibility MUST be established by measurement, not by eye — and the
  measurement MUST account for the translucent overlay, which is precisely what an eye-check and a
  naive calculation both missed.
- **FR-006**: The contrast of the bar-and-label pairing MUST be covered by the project's automated
  contrast gate, so this cannot silently regress the way it silently arrived.
- **FR-007**: Bars that currently show no percentage MUST continue to show none; the width threshold
  and status exclusions that govern this are not changed.
- **FR-008**: Every status the system accepts, plus the roll-up value used for parent rows, MUST
  have an explicit colour **and** an explicit label. No status may arrive at either through a
  fallback branch. Today three statuses reach their colour that way and are consequently mislabelled
  in the interface — a blocked task is shown as "Pending".

### Key Entities

- **Task bar (existing)**: A horizontal bar on the timeline representing one task, coloured by
  status, optionally overlaid with a translucent fill showing percent complete, optionally labelled
  with that percentage.
- **Progress fill (existing)**: The translucent overlay covering the completed portion of a bar. It
  is the surface the label actually sits on, and therefore the surface that determines whether the
  label is readable.
- **Progress ring (existing)**: The circular indicator on the Reports page, coloured by how far
  along a project is. Decorative — it carries no text.
- **Critical-path highlight (existing)**: A red border and glow applied to a bar *on top of* its
  status colour. It is an emphasis marker rather than a status, and it cannot simply adopt the
  product's alert colour: once delayed and blocked work is itself red, a red ring on a red bar is
  invisible. Its treatment has to move off the bar entirely.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every timeline percentage label that renders meets the contrast floor for its size in
  both themes. Today **six** statuses can render a label and **all six fail**, across four colours:
  3.00:1 (backlog, awaiting-review and blocked, which all reach red through the fallback branch),
  2.78:1 (in progress), 2.13:1 (completed) and 1.86:1 (delayed) — against 4.5:1 required. Only
  not-started and the roll-up value suppress the label; percent-complete is recorded independently
  of status, so every other status can carry one.
- **SC-002**: Zero status colours remain written directly into the two affected pages; every one is
  drawn from the shared set. Today there are **forty-four** such values: fourteen in the timeline's
  bar styling, twenty-four in the status pill beside it, three fixed whites on the bar itself (the
  progress overlay, the percentage label, and the milestone marker), and three in the Reports ring.
- **SC-003**: Changing a shared status colour in one place visibly changes the Gantt bars, with no
  edit to the chart code.
- **SC-004**: The bar-and-label contrast is checked automatically on every change, and the check
  fails if the pairing drops below the floor.
- **SC-005**: Every status resolves through a named semantic colour. **Three colour changes across
  five status keys** are deliberate, each recorded with its reason — this is a correction of the
  map, not only of where the map's values come from.
- **SC-006**: The retired accent no longer appears as a **rendered** value anywhere in the product.
  It remains named in two provenance comments explaining why it was retired; those are deliberate
  and must not be removed to satisfy this criterion.

## Assumptions

- The accessibility target is the same one the product already uses for text (4.5:1 for normal-size
  text), consistent with the design system's stated floor and with feature 022.
- The current mapping of status to colour is **not** preserved. Re-sourcing it mechanically would
  name "not started" as an error, and the timeline's map already disagrees with the rest of the
  product in both directions — the list views show delayed work in red and not-started work in grey,
  while the timeline does the opposite. Re-deriving the map is what makes User Story 2 achievable at
  all; preserving it would leave that story unsatisfiable. The re-derivation is bounded to the
  timeline's own colour and label logic and does not touch the shared status maps used by the list
  and board views.
- The Reports progress ring is decorative and carries no text, so only its colour source changes,
  not its contrast.
- Fixing the label may require changing the label's colour, the overlay's opacity, or both. Which
  one is a measurement outcome and is deliberately not pre-decided here.
- No backend involvement: this is a presentation-layer change with no API, data or permission
  surface.

## Out of Scope

- Re-deciding what each status colour *means* (see Assumptions).
- The remaining hard-coded light/dark palette pairs elsewhere in the app, and the shared status maps
  used by the list and board views. These were measured during feature 022's review at 4.51:1 to
  8.44:1 — they all pass, so they are consistency debt rather than an accessibility problem.
  Aligning them with the timeline's corrected map is a worthwhile follow-up but is a separate,
  product-wide change.
- The known `--primary` contrast exception recorded in `DESIGN.md`, which needs its own feature.
- High-contrast and forced-colours support, which the product does not implement anywhere yet.
