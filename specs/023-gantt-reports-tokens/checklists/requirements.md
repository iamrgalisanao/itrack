# Specification Quality Checklist: Legible Gantt Labels and Tokenised Chart Colours

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-27
**Feature**: [spec.md](../spec.md)

## Content Quality

- [X] No implementation details (languages, frameworks, APIs)
- [X] Focused on user value and business needs
- [X] Written for non-technical stakeholders
- [X] All mandatory sections completed

## Requirement Completeness

- [X] No [NEEDS CLARIFICATION] markers remain
- [X] Requirements are testable and unambiguous
- [X] Success criteria are measurable
- [X] Success criteria are technology-agnostic (no implementation details)
- [X] All acceptance scenarios are defined
- [X] Edge cases are identified
- [X] Scope is clearly bounded
- [X] Dependencies and assumptions identified

## Feature Readiness

- [X] All functional requirements have clear acceptance criteria
- [X] User scenarios cover primary flows
- [X] Feature meets measurable outcomes defined in Success Criteria
- [X] No implementation details leak into specification

## Notes

Two corrections were made during validation rather than carried into planning:

- **SC-002 said "eleven" hard-coded values.** Counted: **seventeen** (14 in the timeline's bar
  styling, 3 in the Reports ring). The figure was a guess and is now a count. This is the third
  feature in a row where an asserted count was wrong, which is the argument for counting before
  writing rather than after review.

- **SC-001 originally listed four failing statuses, including one at 3.00:1. I removed it as a
  phantom. That removal was itself the error**, caught by architecture review and verified against
  the source.

  The reasoning was: the code suppresses the percentage for not-started and pending bars, so the
  red 3.00:1 row describes a label that never renders. Both halves of that are true. The mistake was
  assuming red belongs only to not-started. The timeline's colour switch has a fallback branch, and
  the system accepts three further statuses — backlog, awaiting-review and blocked — that reach red
  through it. None of the three is suppressed, and percent-complete is recorded independently of
  status, so all three can and do render a red bar with a failing label.

  Corrected: **six** statuses can render a label and all six fail, across four colours. The 3.00:1
  figure is real; it simply arrives by a route I had not traced. The lesson is narrower than
  "count first" — I verified the suppression list and the not-started mapping, and stopped there,
  without checking what *else* resolved to the same colour. A fallback branch is exactly where that
  kind of assumption hides.

The load-bearing decision, now reversed: the timeline's status→colour map is **re-derived**, not
preserved. The spec originally preserved it, on the reasoning that re-deciding what red means
changes the product's status vocabulary everywhere. Architecture review showed preserving was not
actually available:

- Re-sourcing mechanically would rename `#ef4444` to "the destructive colour", turning "not started
  is an error" from an accident of a hex literal into a named assertion in the source.
- It contradicted User Story 2. The list and board views map delayed to red and not-started to grey;
  the timeline does the opposite. "The same status looks the same everywhere" was unsatisfiable
  while the map was frozen.
- Measured, keeping the white label over the white overlay on the corrected tokens fails 6 of 8
  pairings, so the label fix is only decidable against the re-derived bars.

The re-derivation is bounded to the timeline's own colour and label logic. The shared status maps
used by the list and board views are untouched and recorded in Out of Scope — they were measured at
4.51:1–8.44:1 during feature 022's review, so they are consistency debt, not an accessibility
defect.

No [NEEDS CLARIFICATION] markers were needed. The one genuinely contestable choice — preserve versus
re-derive the map — was resolved by measurement rather than by asking, because measurement showed
only one of the two options actually works.
