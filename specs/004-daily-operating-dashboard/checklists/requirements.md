# Specification Quality Checklist: Daily Operating Dashboard

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-23
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

- No [NEEDS CLARIFICATION] markers were needed. The one genuinely open design
  question — cross-project vs. single-project scope for this view — was
  resolved by direct precedent rather than a guess: `ProjectController` and
  `ReportController` already use `Project::accessibleTo($user)` for exactly
  this kind of cross-project, role-scoped aggregation, so this feature reuses
  that established mechanism rather than inventing a new access model.
- One other design point (new dedicated page vs. extending the existing
  `Dashboard.jsx`) has a reasonable default with low reversal cost, documented
  in spec.md's Assumptions rather than raised as a blocking question.
- Zero new schema — every field this view reads was already added by
  `002-support-ops-tracker`; this is purely a new cross-project aggregation
  and read-only view.
- Review pass (2026-07-23): four findings, all resolved directly in
  spec.md. (1) FR-005's "Needs Info" reference didn't spell out that it
  covers both `blocked` and `delayed` status — a naive implementation
  querying only `blocked` would silently drop `delayed` issues; now
  explicit. (2) FR-003 didn't require classification to be computed in one
  server-side place — for a cross-project view this matters more than for
  the single-project board, since inconsistent client-side re-derivation
  (clock drift, duplicated business-day math) could make this view and the
  existing board disagree; added as an explicit requirement. (3) FR-008
  (opens the existing detail modal) and FR-012 (view is read-only)
  read as contradictory — resolved by scoping FR-012 to the Today
  page/list itself, not the shared modal it launches into, which has
  always supported editing subject to existing role permissions.
  (4) FR-009's precedence rule only covered the three support-issue
  sections, leaving Learning Priority's relationship to them undefined;
  added FR-009a stating Learning is a wholly separate track, never
  cross-classified into Waiting for Client/Stale/P1 even if a learning
  entry happens to carry a `status` or `client_priority` value. Also
  added a dashboard-level-error vs. empty-section distinction to FR-010
  per the same review. All 16 checklist items re-verified — no
  regressions. Ready for `/speckit-plan`.
- Architecture review of plan.md (2026-07-23): seven findings (2 High, 3
  Medium, 2 Low), all resolved directly in plan.md/research.md/data-model.md/
  contracts/quickstart.md. (1) High — plan.md's summary implied server-side
  classification could never drift from the existing frontend board's JS
  implementation; this was an overclaim given two independent
  implementations exist. Resolved by softening the language to an explicit,
  documented tradeoff (research.md) rather than a false equivalence claim.
  (2) High — the substantial precedence/staleness logic was described as
  living inline in the controller action, making it hard to unit-test.
  Resolved by extracting two new services, `App\Services\SupportOpsStaleness`
  and `App\Services\SupportOpsTodayClassifier`, each with dedicated
  `tests/Unit/` coverage, addressing (1) and (2) together. (3) Medium —
  data-model.md's "Source data" section listed only the classification-input
  fields as if that were the complete field set, when the actual response
  returns the full `SupportIssueResource` field list plus `project`/
  `overdue_since`; resolved by explicitly splitting classification-input
  fields from response-output fields. (4) Medium — the query loaded
  `completed`-status issues that the classification algorithm would always
  exclude anyway; resolved by adding an explicit DB-level
  `status != 'completed'` narrowing step, documented as correctness-
  preserving (changes nothing about which issues end up where). (5) Medium —
  the plan's Testing section didn't make the cross-project access-control
  matrix an explicit, required test; resolved by spelling out the exact
  four-case leakage matrix (Team Member own-department sees / other-
  department doesn't; Admin/PM sees both; Department Head sees only granted
  departments) as required Feature-test coverage, not optional manual QA.
  (6) Low — several `plan.md` references to the endpoint omitted the `/api`
  prefix (`GET /support-ops/today` instead of `GET /api/support-ops/today`);
  fixed throughout. (7) Low — quickstart.md Scenario 2 step 4 suggested
  backdating a timestamp via "Record client update now," which always sets
  the current moment and cannot backdate; fixed to use `php artisan tinker`
  for a genuinely backdated fixture. All updates cross-checked for
  consistency across plan.md, research.md, data-model.md,
  contracts/today-dashboard-api.md, and quickstart.md. Ready for
  `/speckit-tasks`.
- Follow-up review (2026-07-23): one finding (P2) — FR-003 still claimed a
  P3 business-day calculation "can never drift" between this view and the
  existing per-project board, which overclaimed given plan.md/research.md
  now correctly document two independent implementations (PHP for Today,
  JS for the existing board) as an accepted tradeoff. Reworded FR-003 to
  require single-place server-side computation for the Today endpoint
  itself, and to require it match the existing board's current behavior,
  without claiming future-proof equivalence against a separate JS
  implementation. All 16 checklist items re-verified — no regressions.
  Ready for `/speckit-tasks`.
- `/speckit-analyze` pass over spec.md/plan.md/tasks.md (2026-07-23): three
  findings, all resolved. (C1, HIGH) FR-011 (support/learning `work_type`
  only, never ordinary Kanban tasks) had an implementation task but no
  dedicated test — added `T014a` in tasks.md, seeding real `work_type`
  values (`project`, `bug`, `feature`, `admin` — confirmed against
  `002-support-ops-tracker/data-model.md`'s enum) that otherwise look
  qualifying, asserting they appear in none of the four sections. (I1,
  MEDIUM) User Story 2's narrative/acceptance scenarios still quoted
  `"Needs Info"` as if it were a stored status value, drifting from FR-005's
  already-precise `blocked`/`delayed` definition — reworded to keep
  "Needs Info" only as the UI-label cross-reference, with scenarios now
  stated in terms of `blocked`/`delayed` directly. (S1, LOW) Standardized
  "P1 — Watch Closely" casing across spec.md (previously "watch closely"
  lowercase in four spots), matching tasks.md/quickstart.md/data-model.md.
  Also fixed a minor wording slip ("least time-sensitive of the four" →
  "of the dashboard's four sections", since there are three user stories,
  not four). No CRITICAL issues found; coverage 16/16 requirements ≥1 task,
  zero constitution violations. Ready for `/speckit-implement`.
