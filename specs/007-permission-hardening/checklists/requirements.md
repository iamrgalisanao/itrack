# Specification Quality Checklist: Permission Hardening

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-25
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

- 16/16 pass on first draft. No [NEEDS CLARIFICATION] markers were needed —
  the one genuinely ambiguous question (whether to also convert
  `DepartmentGrant` from its current role+department persona model to a
  per-user model) was resolved via an explicit Assumptions entry rather than
  a clarification prompt, deliberately scoping it out to its own future spec
  rather than expanding this feature's already-Large PRD-estimated
  complexity further.
- **Round 2 (architect review)**: caught real spec-level gaps — a Story
  2/FR-006 mismatch (story mentioned role/department preview, no FR backed
  it), vague "every page and entry point" wording, an unstated
  non-enumeration requirement for 403s on inaccessible vs. nonexistent
  projects, and an ambiguous interaction with the existing per-task
  `client_visible` gate that could have read as a scope contradiction with
  the PRD's client-visibility requirements. All fixed directly in spec.md
  (what are now FR-010 through FR-012, new Edge Cases, sharpened
  Assumptions).
- **Round 3 (architect review)**: tightened FR-005/FR-011 into a single
  explicit non-enumeration statement, strengthened FR-003 to require
  identical enforcement across every project-scoped surface (addressing the
  "no single authorization primitive mandated" concern at the outcome level
  without naming an implementation mechanism — that remains `/speckit-plan`'s
  call), and added FR-016 through FR-020 plus four Edge Cases covering
  assignment-target validation, assignment idempotency, preview audit on
  start/end, preview resilience to mid-session role/disable changes, and a
  bounded max preview lifetime. Added SC-006 as a technology-agnostic
  performance criterion. This checklist validates spec *quality* — testable requirements, no
  implementation leakage, bounded scope — not the existence of `plan.md`,
  `data-model.md`, `contracts/`, or `tasks.md`; those are `/speckit-plan`'s
  and `/speckit-tasks`'s deliverables, not gaps in this spec. The review's
  architecture concerns (a single shared authorization primitive so nested
  controllers can't bypass project scoping, preview-session storage/expiry
  mechanics, the assignment data model, and the migration backfill decision
  now required by the strengthened rollout Assumption) are real and are
  carried forward as required inputs to `/speckit-plan`, not spec defects.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`.
