# Implementation Plan: Daily Operating Dashboard (Support Ops Phase 3)

**Branch**: `004-daily-operating-dashboard` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-daily-operating-dashboard/spec.md`

## Summary

Add a new, cross-project "Today" view that aggregates Support Ops issues
across every project the signed-in user has access to (reusing
`Project::accessibleTo($user)`, the same mechanism `ReportController`
already uses for cross-project aggregation) and classifies each into
exactly one of four sections — Waiting for Client, Stale, P1 — Watch
Closely, and Learning Priorities — computed server-side, in one place, so
this endpoint's own classification is internally consistent across every
project it aggregates (see research.md's discussion of this vs. the
existing board's separate JS implementation — an accepted, isolated
tradeoff, not a claim that the two can never diverge). One new backend
endpoint (`GET /api/support-ops/today`), two new backend services
(`SupportOpsStaleness`, `SupportOpsTodayClassifier`) so this substantial
business logic doesn't live inline in a controller, one new API Resource
(`TodaySupportIssueResource`), one new frontend page
(`TodayDashboard.jsx`), reusing the existing `SupportOpsGuard`,
`TaskDetailModal`, and (for edits) all of `003-templates-prompt-generator`'s
generators unchanged. Zero schema change, zero new dependencies.

## Technical Context

**Language/Version**: PHP 8.4 (Laravel 13, unchanged) / JavaScript
(ES2022+), React 19 (unchanged) — same stack as 001/002/003.

**Primary Dependencies**: None new. Backend reuses `Project::scopeAccessibleTo`
(already used by `ReportController`), `SupportOpsController`'s existing
role-gating pattern, and Carbon's built-in `addWeekday()` for the P3
staleness threshold (already a Laravel dependency, no new package) — wrapped
in a new `App\Services\SupportOpsStaleness` class rather than left inline,
so the substantial precedence/threshold logic (`SupportOpsTodayClassifier`)
has a real, independently unit-testable seam (research.md). Frontend reuses
`SupportOpsGuard`, `TaskDetailModal`, and the existing Support Ops
fetch/update client functions.

**Storage**: MySQL. **Zero schema change** — reads existing
`detailed_activities`/`projects` fields only. No migration.

**Testing**: Two layers, matching the controller/service split above.
(1) PHPUnit **Unit** tests (`tests/Unit/`, no HTTP/DB setup) for
`SupportOpsStaleness` (all three priority thresholds including the P3
business-day edge cases — a Friday reference rolling to Monday, an
already-weekend reference — and the `completed`/no-priority short-circuits)
and `SupportOpsTodayClassifier` (precedence correctness in isolation: an
issue matching multiple criteria lands in exactly one bucket per
FR-009/FR-009a, including the learning-entry-with-a-`blocked`-status edge
case from spec.md — these are pure-function tests, not HTTP round-trips).
(2) PHPUnit **Feature** test for the endpoint itself
(`tests/Feature/SupportOpsTodayTest.php`): the full role matrix (200 for
Admin/PM/Team Member/Department Head, 403 for Client/null role, 401
unauthenticated), and — the highest-risk, non-optional part of this
feature, since every prior Support Ops endpoint was single-project and this
is the first one that must never leak across projects — this **exact**
cross-project access matrix, each as its own test:
  - Team Member sees a support issue from their own department's project.
  - Team Member does **not** see a support issue from a different
    department's project (this is the test that would actually catch a
    scoping bug — the other four sub-cases prove the happy path, this one
    proves the fence).
  - Admin and Project Manager each see issues from both departments' projects.
  - Department Head sees issues only from their granted department(s), not
    an ungranted one.

Also required in the Feature test: the empty-projects/empty-sections case
(200 with all four arrays empty, not an error). Frontend: manual
verification via quickstart.md (no test runner in this repo, unchanged from
001/002/003).

**Target Platform**: Same dev/prod web app as prior features — Laravel API
at `localhost:8000`, Vite dev server at `localhost:5173`.

**Project Type**: Web application (backend/ + frontend/, existing structure)

**Performance Goals**: N/A at this app's current scale — this mirrors
`ReportController`'s existing "load every accessible project's data, do not
paginate" approach, appropriate for an internal tool's current data volume.
If this ever needs pagination/date-windowing, that's a follow-up, not a
day-one requirement (no evidence today's data volume needs it).

**Constraints**: Classification MUST happen server-side, in one place (per
FR-003), delegated to `SupportOpsTodayClassifier` (which internally uses
`SupportOpsStaleness`) — the frontend must not re-derive staleness or
section membership itself, and the controller action must not inline this
logic either. The existing per-project Support Ops board and its staleness
computation are unchanged by this feature (research.md — this adds a
second, independent, but isolated and unit-tested PHP implementation of the
same algorithm, verified equivalent, not a shared refactor of the existing
JS one). The Today page itself has no inline editing (FR-012); all edits
happen through the existing shared detail modal.

**Scale/Scope**: 1 new backend endpoint (`GET /api/support-ops/today`), 2
new backend services (`SupportOpsStaleness`, `SupportOpsTodayClassifier`),
1 new API Resource (`TodaySupportIssueResource`), 1 new frontend page
(`TodayDashboard.jsx`), 1 new nav entry + route (reusing `SupportOpsGuard`),
1 new `lib/api.js` client function, 2 new PHPUnit Unit test files, 1 new
PHPUnit Feature test file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Fail-Closed Access Control | Yes | The new endpoint MUST use the identical inclusion-based check already used by `index()`/`generationLog()` — never a deny-list, never a new parallel role check. Project scoping additionally goes through `Project::accessibleTo($user)`, itself already fail-closed (denies unrecognized roles by returning an impossible match). **PASS**, carried into tasks.md. |
| II. Consistent API Contracts | Yes | New endpoint returns through a new `TodaySupportIssueResource`, following `SupportIssueResource`'s precedent — never a raw model/array. The four-section wrapper is a curated array (matching `AuthController::curatedUser()`'s precedent for a hand-composed response), not itself pretending to be a Resource. **PASS**. |
| III. Test Coverage Grows With the Feature | Yes | New backend endpoint — Feature test covers the full role matrix, cross-project aggregation correctness, classification precedence, and staleness threshold correctness in the same change. **PASS**, required task in tasks.md. |
| IV. Audit Sensitive Mutations | No | This feature has no write path at all — it's a GET endpoint over existing data. Nothing to audit; this principle doesn't apply here the way it did to `003-templates-prompt-generator`'s generation-log write. **N/A**. |
| V. Small, Additive, Reversible Migrations | Yes (trivially) | **No migration at all.** **PASS**. |
| VI. Real Auth Is the Only Forward Path | Yes | Reads `$request->user()->role` via Sanctum session, identically to every other Support Ops endpoint. **PASS**. |

No violations. Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: Design artifacts (data-model.md, contracts/,
quickstart.md) confirm the architecture above — no new entities, no new
columns, and the one new backend endpoint reuses `accessibleTo` and the
existing role-gating convention exactly. Gate re-evaluation: **PASS**,
unchanged from pre-design.

## Project Structure

### Documentation (this feature)

```text
specs/004-daily-operating-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
# Option 2: Web application (frontend/ + backend/, matches existing repo layout)

backend/
├── app/Http/Controllers/
│   └── SupportOpsController.php     # modified — add today() action,
│                                     #   delegating to SupportOpsTodayClassifier
├── app/Http/Resources/
│   └── TodaySupportIssueResource.php  # new — SupportIssueResource's field
│                                       #   set + nested `project` + optional
│                                       #   `overdue_since`
├── app/Services/
│   ├── SupportOpsStaleness.php      # new — staleness/threshold calculation,
│   │                                #   mirrors SupportOps.jsx's
│   │                                #   getStalenessState/addOneBusinessDay
│   └── SupportOpsTodayClassifier.php  # new — FR-009/FR-009a precedence,
│                                       #   using SupportOpsStaleness per issue
└── routes/api.php                   # modified — add GET /api/support-ops/today

frontend/
├── src/
│   ├── pages/
│   │   └── TodayDashboard.jsx       # new — four-section cross-project view;
│   │                                #   opens the existing TaskDetailModal
│   │                                #   for any selected item
│   ├── lib/
│   │   └── api.js                   # modified — add fetchTodayDashboard()
│   └── App.jsx                      # modified — add /support-ops/today
│                                     #   route (reusing SupportOpsGuard) +
│                                     #   a new "Today" nav entry
└── tests/                           # none exist yet; no test infra added

backend/tests/Unit/
├── SupportOpsStalenessTest.php      # new — all three priority thresholds,
│                                     #   P3 business-day edge cases,
│                                     #   completed/no-priority short-circuits
└── SupportOpsTodayClassifierTest.php  # new — precedence correctness in
                                        #   isolation, learning-bypass edge case

backend/tests/Feature/
└── SupportOpsTodayTest.php          # new — role matrix, the exact
                                      #   cross-project leakage matrix (see
                                      #   Testing above), empty case
```

**Structure Decision**: One new backend endpoint on the existing
`SupportOpsController` (not a new controller — same rationale as
`003-templates-prompt-generator`'s `generationLog()` action), one new
frontend page (not folded into `SupportOps.jsx` — research.md). No changes
to the existing single-project Support Ops board, its staleness
computation, `TaskDetailModal`, or any of `003-templates-prompt-generator`'s
generators — this feature only adds a new way to *reach* an issue, never a
new way to edit one.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
