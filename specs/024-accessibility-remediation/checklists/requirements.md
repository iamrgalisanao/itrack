# Specification Quality Checklist: Accessibility Remediation — Timeline, Status Colour, and Chart Honesty

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-28
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### Validation pass 1 — three failures found and fixed

1. **Implementation details leaked into the requirements.** The first draft named
   `tabIndex`, `aria-hidden`, `sr-only`, `matchStatusColor` and specific token names in the
   functional requirements. Those are the *diagnosis*, not the requirement — and naming them
   pre-commits planning to one solution. FR-001 through FR-017 now state the user-facing
   obligation; the file and mechanism names remain in **Input** and in `docs/outstanding-work.md`,
   where a planner can find them without the spec asserting them.

2. **Success criteria were not verifiable without reading the code.** "The Gantt bar is focusable"
   describes an attribute, not an outcome. Rewritten as workflows a person can attempt
   (SC-001) and as measurements a gate can take (SC-004, SC-007, SC-008).

3. **The scope boundary omitted what was deliberately left out.** A reader could not tell whether
   the dialog boundary and the row-versus-field ADR had been forgotten or excluded. Both are now
   named in Assumptions as recorded elsewhere.

### Two decisions worth flagging to planning

- **FR-007 is a confidentiality requirement, not an accessibility one.** It is in this spec because
  the surface that creates the risk is created by this feature: a screen-reader-only rendering is a
  new rendering of row data, and if it diverges from the visible one's role gate it discloses a
  restricted field on a surface nobody inspects. SC-003 requires the test to assert the assistive
  text specifically — asserting the visible column would pass while the defect shipped. This is the
  same defect class as PR #15, on an invisible surface.

- **User Story 1 must not be split.** The two halves are contradictory patterns for one element:
  marking the bar decorative and relocating its data, versus making the bar focusable with an
  accessible name. A focusable element must not be hidden from assistive technology. Shipping either
  alone means removing it when the other lands, after users have seen the intermediate state.

### Deliberately not marked NEEDS CLARIFICATION

The form-control boundary (User Story 4) shares its value with the general-purpose border, so
raising one may require separating them — a change with application-wide reach. This is recorded as
an assumption with FR-018 and SC-009 bounding the consequences, rather than as a blocking question,
because the *requirement* is unambiguous (meet 3:1) and only the *values* are open. Values are a
planning decision. If planning finds the separation cannot be made without regressions, that is the
point to escalate.
