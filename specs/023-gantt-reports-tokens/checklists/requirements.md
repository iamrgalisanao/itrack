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

One assumption is deliberately load-bearing and worth a planner's attention: the current mapping of
status to colour is **preserved**, including showing not-started tasks in red. That mapping is
arguably wrong — "not started" is not an error — but re-deciding it changes the product's status
vocabulary everywhere, not just these two files. Recorded in Assumptions and Out of Scope so the
decision is visible rather than accidental.

No [NEEDS CLARIFICATION] markers were needed: every open question had a defensible default, and the
one genuinely contestable choice (preserve vs. re-decide the colour mapping) is resolved
conservatively and recorded rather than asked, because re-deciding is plainly a separate feature.
