# Phase 0 Research: Daily Operating Dashboard (Support Ops Phase 3)

No `NEEDS CLARIFICATION` markers exist in the Technical Context. Every
decision below came from reading existing code (`ReportController`,
`SupportOpsController`, `Project::scopeAccessibleTo`, `App.jsx`'s guard/nav
conventions, `SupportOps.jsx`'s staleness computation) rather than new
research — this feature is a read-only aggregation over infrastructure
`002-support-ops-tracker` already built.

## Decision: Reuse `Project::accessibleTo($user)` exactly as `ReportController` does

**Rationale**: `ReportController::projectsFor()` already does
`Project::query()->accessibleTo($user)->get()` to scope a cross-project view
by role — Admin/PM see everything, Department Head sees granted
departments, Team Member sees their own department, unrecognized role sees
nothing (fail-closed). This is the exact access shape FR-002 needs; no new
access-control concept is justified when this one is already proven,
tested, and used elsewhere for the same "cross-project, role-scoped" need.

**Alternatives considered**: A new query scope specific to this feature —
rejected, would duplicate `accessibleTo`'s role logic in a second place,
risking the two drifting apart over time (constitution Principle I's
concern about scattered ad-hoc role checks applies here too, even though
this is project-scoping rather than a permission check per se).

## Decision: One new backend endpoint, `GET /api/support-ops/today`, returning pre-grouped sections

**Rationale**: The alternative — fetching every accessible project's full
issue list via the existing `GET /support-ops` endpoint (which requires a
single `project_id`) and re-classifying client-side — would mean N requests
for N accessible projects, plus reimplementing the staleness/business-day
math in the browser a second time in a way that could drift from the
backend (exactly the risk FR-003 calls out). A single endpoint that loads
every accessible project's support/learning issues once, classifies them
server-side using the existing staleness rules, and returns four ready-made
arrays (`stale`, `watch_closely`, `waiting_for_client`,
`learning_priorities`) is both simpler for the frontend and the only way to
satisfy FR-003's "computed once, consistently, in one place" requirement.

**Alternatives considered**: Extending `GET /support-ops` with an
"aggregate mode" flag — rejected, conflates two different response shapes
(a flat list for one project vs. four classified sections for many) behind
one endpoint, and the existing endpoint's `project_id` — required
validation rule would need special-casing that muddies its contract.

## Decision: Classification precedence encoded as sequential exclusive checks, not a scoring system

**Rationale**: FR-009/FR-009a's precedence (Waiting for Client → Stale →
P1-watch-closely, with Learning as a wholly separate track) maps directly
onto a simple sequential check per issue: work_type=learning routes to its
own bucket immediately and never falls through to the other three; for
work_type=support, check "Needs Info" status first (continue to next issue
if matched), then staleness (continue if matched), then P1-not-stale. This
guarantees exactly one bucket per issue by construction — no separate
deduplication pass is needed after the fact.

**Alternatives considered**: Computing all applicable categories per issue
and picking the highest-precedence one afterward — rejected as unnecessary
indirection; the sequential-check-with-continue approach is simpler and
makes the precedence rule visually obvious in the code (matching how the
rule reads in spec.md), which matters for a rule three other engineers
already reviewed carefully across FR-009/FR-009a.

## Decision: Port the existing staleness algorithm to PHP using Carbon, verified equivalent to the frontend's JS implementation — as a dedicated, isolated service

**Rationale**: `SupportOps.jsx`'s `getStalenessState()`/`addOneBusinessDay()`
(P1: >1hr, P2: >4hr since `last_client_update_at` or `created_at` if unset;
P3: past "add one business day, skipping Sat/Sun") needs a server-side
equivalent per the "computed once" decision above. Carbon's `addWeekday()`
(skips Saturday/Sunday when advancing) produces the identical "next business
day" result as the frontend's custom loop for every case checked by hand
(a Friday reference lands on the following Monday in both; any weekday
reference simply advances one day in both) — using it instead of
hand-rolling the same loop in PHP avoids a second bespoke date-math
implementation that could subtly diverge from Carbon's own weekend
definition.

A review pass on this plan correctly flagged that "computed once,
consistently" (FR-003) and "a second, independent PHP implementation of an
already-existing JS one" are in tension — two equivalent-at-launch
implementations can still drift apart later if nothing structurally
prevents it. The fix isn't to pretend there's only one implementation (there
still are two — PHP for Today, JS for the existing board — moving the
board's client-side computation to a server round-trip is out of scope for
this phase and not something FR-003 requires); it's to make the *new* one a
dedicated, isolated, independently-testable unit so it has a real seam for
future reuse rather than being inline logic scattered through a controller
action. Concretely: `App\Services\SupportOpsStaleness` (the staleness/
threshold calculation, mirroring `getStalenessState`/`addOneBusinessDay`
field-for-field) and `App\Services\SupportOpsTodayClassifier` (applies
FR-009/FR-009a's precedence using the staleness service, per issue). Both
get `tests/Unit/` coverage — pure PHP, no HTTP/DB setup needed — in addition
to the endpoint's `tests/Feature/` test. This doesn't eliminate the
two-implementation reality, but it means a future change (e.g. adjusting
the P2 threshold) has exactly one obvious, well-tested PHP place to land,
and `SupportOpsController::index()` could adopt `SupportOpsStaleness` later
without this phase needing to touch the frontend at all.

**Alternatives considered**: Reimplementing the exact JS loop inline inside
`SupportOpsController::today()` — rejected per the review above: buries
substantial business logic (precedence, three staleness thresholds,
business-day math, sort keys, the learning bypass) inside a controller
action, making it harder to unit-test and harder to find when it needs to
change later. Moving the *existing* per-project board onto a server
round-trip so there's truly only one implementation — rejected as
out-of-scope scope creep for a phase that's supposed to be a new read-only
aggregation view, not a refactor of already-shipped, working functionality.

**Constraint carried into data-model.md**: the frontend's existing
`getStalenessState`/`addOneBusinessDay` in `SupportOps.jsx` are NOT
modified or removed by this feature — the existing per-project board
continues to compute staleness exactly as it does today, in JS. This
feature adds a second, independent, but properly isolated and unit-tested
PHP implementation for the Today endpoint. Documented here explicitly as an
accepted short-term tradeoff, not an oversight.

## Decision: New nav entry + route reusing the existing `SupportOpsGuard` component, not a new guard

**Rationale**: `SupportOpsGuard` in `App.jsx` already gates on the exact
role set this feature needs (`KANBAN_INTERNAL_ROLES` — Admin, Project
Manager, Department Head, Team Member). Creating a near-identical
`TodayGuard` would just be that same check copy-pasted a second time.

**Alternatives considered**: A new `TodayGuard` component — rejected as
needless duplication of an already-correct, already-tested guard.

## Decision: No new frontend dependencies; a new page component, not folded into `SupportOps.jsx`

**Rationale**: `SupportOps.jsx` is already a large, single-project-scoped
page. The Today view has a different data shape (four pre-grouped sections,
cross-project) and a different purpose (a morning triage summary, not a
drag-and-drop board) — a new `TodayDashboard.jsx` page keeps both files
focused, consistent with how `Kanban.jsx` and `SupportOps.jsx` are already
separate pages sharing only `TaskDetailModal`.

**Alternatives considered**: Adding a "Today" tab inside `SupportOps.jsx` —
rejected, would require threading the single-project board's `selectedProjectId`
state through an entirely different, cross-project data-fetching path,
entangling two views that have no real reason to share state.

**Output**: All Technical Context unknowns resolved via direct inspection of
existing code; no `NEEDS CLARIFICATION` markers remain. Proceeding to
Phase 1.
