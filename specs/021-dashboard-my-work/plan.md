# Implementation Plan: Dashboard Restructure with My Work List

**Branch**: `021-dashboard-my-work` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-dashboard-my-work/spec.md`

**Method note**: Phase 0 research and Phase 1 design inputs were produced by a multi-agent
orchestration (four parallel Software Architect perspectives — backend API, frontend
components, design governance, security/testing — followed by an adversarial cross-check).
The cross-check's resolved decisions are binding and recorded in [research.md](./research.md) §Resolutions.

## Summary

Turn the Dashboard from a statistics report into a personal workspace: collapse ~10 stat
cards into one accomplishment-first four-metric row, delete duplicated status counts and
decorative-only elements, and add a **My Work** panel — the acting user's open assigned
tasks, server-bucketed into Overdue / This Week / Later / No Due Date, with inline status
change, row-click task details, and bucket-context quick-add. Heatmap and Recent
Activities are retained. **No schema changes anywhere in this feature.**

Backend: one new controller (`MyWorkController`: `index` + `store`), one new lean API
resource (`MyWorkTaskResource`), one extracted support class (`TaskboardPlacement`), one
model scope (`DetailedActivity::scopeOpen`), and an additive-only change to
`GET /api/dashboard` (`completed_recent` key + a Client `client_visible` fix in
`recent_activities`). Frontend: restructured `Dashboard.jsx`, new self-contained
`MyWorkPanel.jsx`, status constants promoted from `TaskboardView.jsx` into the shared
`GroupSummaryBar.jsx`, two new `api.js` helpers.

## Technical Context

**Language/Version**: PHP 8.3 / Laravel `^13.8` (verified `backend/composer.json`); JavaScript (no TypeScript) / React `^19.2.6`, Vite `^8.0.12`, Tailwind `^4.3.1` (verified `frontend/package.json`)

**Primary Dependencies**: Laravel Sanctum (session SPA auth), shadcn/Radix primitives (`frontend/src/components/ui/`), axios via `frontend/src/lib/api.js`. **No new dependencies.**

**Storage**: MySQL (dev), in-memory SQLite (tests). **No migrations in this feature** — bucket SQL must stay SQLite+MySQL portable (parameter-bound `SUM(CASE WHEN …)` date comparisons, same idiom as the existing heatmap query).

**Testing**: PHPUnit feature tests extending `Tests\TestCase` + `RefreshDatabase` (Pest installed but unused — follow house style). New `backend/tests/Feature/MyWorkTest.php` + additions to dashboard coverage. Frontend: `npm run build && npm run lint` + manual browser verification per project practice.

**Target Platform**: Web SPA against the Laravel API; all new routes inside the existing `auth:sanctum → EnsureUserIsActive → ResolvePreviewSession → BlockWritesDuringPreview` group (`backend/routes/api.php:50`).

**Project Type**: Web application (separate `backend/` + `frontend/` deployables).

**Performance Goals**: My Work initial payload bounded — 6 queries total (1 project pluck, 1 aggregate count, 4 capped row queries), ≤ 40 task rows + true counts regardless of backlog size; dashboard aggregate and My Work fetch in parallel on mount.

**Constraints**: Additive-only API changes (`App.jsx:154` sidebar reads `stats` from `GET /api/dashboard`; two `ProjectScopingTest` assertions pin `stats.projects`). Due date is `plan_end_date` (there is **no** `due_date` column). "Open" = `status != 'completed'` over the full 7-status set (`backlog, not_started, in_progress, for_review, completed, blocked, delayed`). Bucket boundaries computed from **client-supplied local-date anchors** (`today`, `week_end`), validated server-side.

**Scale/Scope**: 2 new endpoints, 1 modified endpoint (additive), 1 new frontend component, 1 restructured page, 1 shared-component extension, ~36 new feature tests. No new roles, settings, or permission concepts.

### Coding-Standard Constraints

Binding rules extracted from the installed skills for **this feature's surface** (full derivations in [research.md](./research.md)):

From `php-best-practices` (PHP 8.3 — property hooks / 8.4+ syntax off-limits):
1. Full parameter + return types on every new method (`MyWorkController` actions, `scopeOpen`, `TaskboardPlacement::resolveDefaultSubActivity(int $moduleId): SubActivity`).
2. Typed constants for the relocated reserved names (`private const string RESERVED_ACTIVITY_NAME = 'Taskboard';`).
3. `match` (not if-chains) for bucket-name → predicate dispatch on the `?bucket=` expansion path.
4. No `@` suppression, no blanket `catch (\Exception)` around the quick-add transaction.
5. Query params (`today`, `week_end`, `per_bucket`, `bucket`, `all`) validated (`date_format:Y-m-d`, `after_or_equal:today`, `integer|min:1`, `in:overdue,this_week,later,no_due_date`) and only ever parameter-bound — never interpolated into `whereRaw`.
6. **Deviation (documented)**: no `declare(strict_types=1)` in new files — existing `app/` files omit it; codebase consistency wins.

From `laravel-best-practices`:
7. `->with(['subActivity.activity.module.project'])` on every My Work row query and on the quick-add response (N+1 guard); do **not** eager-load `assignee` (always the acting user).
8. Open-task predicate as `DetailedActivity::scopeOpen()`; project scoping only via `Project::accessibleTo` / `BelongsToProject::isAccessibleTo` — never re-implemented role branching.
9. All responses through API Resources (`MyWorkTaskResource`) or curated arrays (Constitution II).
10. **Deviation (documented)**: inline `$request->validate()` instead of FormRequests — house style, because authorization must run through the `AccessContext` + `AuditLogger::denied` sequence before validation.
11. Explicit create-array on quick-add (fixed keys incl. forced `assignee_user_id`) — never `create($request->all())`.
12. Any index/denormalization (e.g. composite `(assignee_user_id, status, plan_end_date)`) is a **recorded follow-up**, not part of 021.

From `react-vite-best-practices`:
13. No lazy/code-splitting introduced (My Work is above-the-fold primary content; the app has no lazy boundaries — considered and rejected, not omitted).
14. Sub-components (`MyWorkTaskRow`, `QuickAddRow`) stay file-local and unexported (`react-refresh/only-export-components`); named ESM imports only; no new dependencies.
15. Bucket-view derivations via `useMemo`; no derived state in `useState`; data-load-on-mount uses the codebase's established `useEffect` idiom.
16. All API calls through `frontend/src/lib/api.js`; role reads via `useEffectiveUser()` — never raw `useAuth().user`, never the legacy localStorage switcher (Constitution VI).

From `laravel-testing` / `laravel-owasp-security` / `code-slop`: the test matrix, OWASP checks, and anti-slop review expectations are specified in [research.md](./research.md) §Test-requirements and [quickstart.md](./quickstart.md); headline items — assignee-alone-is-not-authorization (IDOR) tests, 403-parity with byte-identical bodies for TM/Client, preview read/write tests using the `ProjectScopingTest` helper vocabulary, mass-assignment smuggling tests, `Carbon::setTestNow` for every bucket-boundary case, and no mock-heavy or status-only tests.

### Frontend Design Constraints

Full design specification in [research.md](./research.md) §Design; the binding summary:

- **Visual direction**: calm, accomplishment-first, token-driven restraint **within the existing shadcn/Radix language** — no new fonts, no new palette, no parallel design system. All color through `index.css` tokens with `dark:` pairs.
- **Page hierarchy (6 top-level regions, SC-006)**: title block → four-metric summary row → **My Work panel** (Overdue within first desktop screenful, SC-003) → heatmap card → Recent Activities card → compact structure-counts text strip.
- **Reused components (verified)**: `StatCard` (kept; hero/ring/chips/grids deleted), `GroupSummaryBar.jsx` exports (`GROUP_ACCENT_CLASSES`, `buildSegments`, `GroupSegmentBar`), `Collapsible*` primitives, BugTracker's inline row `<select>` status-control pattern, `TaskDetailModal` (unchanged), `getStatusColor/getStatusLabel/formatDate`, `AccessDenied`, `useEffectiveUser()`, WorkProgram's try/catch-guarded localStorage MRU pattern.
- **Shared-constants extraction**: move `STATUS_ORDER` / `STATUS_SEGMENT_LABELS` / `STATUS_SEGMENT_CLASSES` / `STATUS_BADGE_CLASSES` (the **7-status** set) from `TaskboardView.jsx` into a new **`frontend/src/lib/taskStatus.js`** (not into `GroupSummaryBar.jsx`, which is components-only — see pre-flight below). No third copy of the status maps; the 4-status `LIST_STATUS_*` set is **not** used (it would hide `backlog`/`for_review`/`blocked` rows). **`GROUP_ACCENT_CLASSES` is not modified** — three pages index it `[index % length]`, so appending an entry recolors unrelated views (architect review M1).
- **Bucket accents are fixed and semantic** (not index-rotated), via a **panel-local `MY_WORK_BUCKET_ACCENTS` map** in `MyWorkPanel.jsx`: Overdue rose, This Week amber, Later primary, No Due Date slate. Accents render as absolutely-positioned `bg-*` spans — `border-l-*` is inert app-wide (unlayered border reset, `index.css:104-106`; `StatCard`'s existing `accent` prop is inert for the same reason and is fixed or dropped in US2).
- **Removed elements (by line, `Dashboard.jsx`)**: blur ornaments 443–447; hero card incl. ring/chips/duplicate bar 441–513; Needs Attention banner 515–529; Task Status grid 531–548; structure/supporting grids 550–565; heatmap column-totals `<tfoot>` 328–347 (would re-duplicate summary metrics). The summary progress card's description must **not** repeat the completed count.
- **Required states, all specified per surface** in research.md: loading skeletons, empty-positive panel state, panel-scoped error + retry (never blanking retained panels), quick-add validation with preserved title + `aria-describedby`, read-only/permission-hidden affordances, preview behavior, success (row leaves list without reload; `prefers-reduced-motion` honored).
- **Accessibility (binding)**: bucket triggers are label-only buttons with `aria-expanded` + visible focus ring; row title is a real `<button>` (the Taskboard mouse-only `TableRow onClick` must **not** be copied); native `<select>` for status with per-row `aria-label` and `stopPropagation`; quick-add is a real `<form>` (Enter submits, Escape cancels, focus management specified); focus returns from the modal to the originating row button.
- **Write-affordance gating**: server-derived `meta.can_write` from the My Work response (effective-user `canWrite()`, preview-correct) — not a hardcoded role list; quick-add additionally requires a non-empty accessible project/module list. Panel-header "+ Add task" is the quick-add entry point when target buckets are empty/omitted; Overdue never offers quick-add.
- **Completion gate**: the frontend review checklist (Critical/Major/Minor classifications) is enumerated in [quickstart.md](./quickstart.md) and blocks completion per the constitution's Frontend Governance section.

## Constitution Check

*GATE: evaluated before Phase 0 research; re-checked after Phase 1 design.*

| Principle | Pre-research | Post-design |
|---|---|---|
| I — Fail-closed access control | PASS (no new roles; scoping via existing seams) | PASS — all checks via `HasRole` predicates; `Project::accessibleTo` fail-closed branch reused; My Work double-filters assignee ∩ accessible; denial parity (403, byte-identical) preserved on reused endpoints |
| II — Consistent API contracts | PASS (planned) | PASS — new lean `MyWorkTaskResource`; fixed-shape bucket envelope; `GET /api/dashboard` change additive-only; no raw models |
| III — Tests grow with the feature | PASS (planned) | PASS — ~36-test matrix specified (research.md §Test-requirements) incl. happy + denied paths per role for every new/changed endpoint; each implementation task will pair with test tasks in `/speckit-tasks` |
| IV — Audit sensitive mutations | PASS | PASS — quick-add rides `task.created` via `AuditLogger` (real user), denials ride `AuditLogger::denied`; status change reuses the already-audited endpoint; no new audit categories needed |
| V — Additive, reversible migrations | PASS (trivially) | PASS — **zero migrations**; the composite-index scaling lever is explicitly deferred |
| VI — Real auth only | PASS | PASS — `useEffectiveUser()` everywhere; no extension of the legacy mock switcher |
| VII — Installed skills govern | PASS | PASS — Coding-Standard Constraints subsection above; two documented deviations (strict_types, FormRequests) follow house style with rationale |
| VIII — Definition-of-Done gate | PASS (planned) | PASS — quickstart.md carries: test commands, authz review items, tenant-isolation review items, OWASP checklist scoped to this surface, code-slop expectations |
| Frontend Design Governance | Applies (frontend surface) | PASS — Frontend Design Constraints subsection + review checklist with Critical/Major blocking classifications in quickstart.md |

No violations → Complexity Tracking not required.

### Architecture review (independent, post-design)

An independent Software Architect review of all seven artifacts (verifying load-bearing
claims against the code, not the documents) returned **APPROVE WITH CONDITIONS**: no
Blockers, core decisions sound. Five Major findings were raised and **all are resolved**
in the artifacts before implementation:

| # | Finding | Resolution |
|---|---|---|
| M1 | Appending to `GROUP_ACCENT_CLASSES` would recolor Taskboard/BugTracker/Retrospectives (all index it `[i % len]`) on 6+ group views | Array untouched; My Work uses a panel-local `MY_WORK_BUCKET_ACCENTS` map (research.md R8, T002, T015) |
| M2 | `onTaskMutated={load}` would flash the full-page spinner on every inline status change, defeating SC-001 | `load()` split into `load()` + non-blanking `refresh()`; panel wired to `refresh` (research.md R8, T019) |
| M3 | Mixed-presence anchors (`week_end` alone) pass validation and make bucket predicates overlap, breaking count integrity | Anchors are an all-or-nothing pair (`required_with` both ways, both server-defaulted when absent) + post-validation `today <= week_end` assert + bucket-sum invariant test (contracts, research.md R2, T006, T011) |
| M4 | Spec promised a "clear error" on stale rows, but the reused update endpoint has no concurrency precondition (last-write-wins) | Decision recorded: accept last-write-wins for status (audited); spec edge case amended so stale-row *errors* mean delete/revoke only (spec, research.md ground truths) |
| M5 | Team Members cannot edit `plan_end_date` (existing 002/018 policy) — quickstart step 3 unrunnable as TM, FR-005 date re-bucketing inapplicable to the primary persona | Constraint documented; quickstart step 3 annotated "run as PM/Admin"; TM modal date-field affordance is a recorded follow-up (research.md ground truths, quickstart) |

### Pre-flight outcome (executed before branching)

A follow-up execution review found the artifacts had been authored against an
**uncommitted working tree**, not against `main` — branching from `main` literally would
have broken the plan (`GroupSegmentBar`'s prop was `widthPx` at `c00debe`; T015 specifies
percentage strings passed as `width`, which would have rendered zero-width bars with a
green build). The pending work was therefore an undeclared prerequisite, and was landed
first as three commits on `main`:

| Commit | Content |
|---|---|
| `7f4d4dd` | Align group summary bars to table columns with percentage widths (the 021 prerequisite) |
| `2197a8a` | Project agent config, skills, Spec Kit workflow guidance |
| `91779de` | **Fix 4 frontend lint errors that had been failing CI on `main` since `a396a16`** |

The lint repair was not optional: `npm run lint` is a CI gate, the Frontend job was red,
and 021's Definition-of-Done gate ("build and lint green") is unverifiable against an
already-red baseline. Fixing it inside the feature diff would have violated the
code-slop no-drive-by-edits rule, so it landed on `main` first. Two of the four errors
were `react-refresh/only-export-components` in `GroupSummaryBar.jsx` — repaired by
extracting its value exports to `src/lib/groupSummary.js`. **This upgrades architect
finding m1 from Minor to adopted**: T002 now targets `src/lib/taskStatus.js`, since
putting constants back into the component file would reintroduce the just-fixed failure.

Baseline at branch point: 398 backend tests pass; frontend build clean; lint 0 errors
(1 pre-existing non-blocking warning).

Minor findings folded in: `per_bucket` `max:100` and `bucket`⇆`all` pairing (contracts,
T006); no assignment notification on self-assigned quick-add, with a test assertion
(research.md R6, T028); `StatCard`'s already-inert `accent` prop fixed or dropped while
touching the file (T026); refetch resets "Show all" expansions — specified, not accidental
(research.md R8). Observations (scale behavior at 50 projects/500 tasks, third-create-path
justification, fixed-shape envelope consistency, refetch-over-merge, Taskboard placement
visibility in Work Program, `lockForUpdate` being a no-op on SQLite) were reviewed and
require no change.

## Project Structure

### Documentation (this feature)

```text
specs/021-dashboard-my-work/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 — decisions, resolutions, test requirements
├── data-model.md        # Phase 1 — entities, field mapping, bucket rules
├── quickstart.md        # Phase 1 — validation guide + DoD/review gates
├── contracts/
│   └── my-work-api.md   # Phase 1 — endpoint contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 (/speckit-tasks — not created by plan)
```

### Source Code (repository root)

```text
backend/
├── app/Http/Controllers/
│   ├── MyWorkController.php            # NEW — index (bucketed read) + store (quick-add)
│   ├── ProjectController.php           # MODIFIED — dashboard(): + completed_recent,
│   │                                   #   recent_activities client_visible fix (additive)
│   └── TaskboardController.php         # MODIFIED — delegates placement to TaskboardPlacement
├── app/Http/Resources/
│   └── MyWorkTaskResource.php          # NEW — lean list-row resource
├── app/Support/
│   └── TaskboardPlacement.php          # NEW — reserved Taskboard/Unclassified chain resolver
│                                       #   (extracted from TaskboardController; correctness-coupled)
├── app/Models/DetailedActivity.php     # MODIFIED — + scopeOpen()
├── routes/api.php                      # MODIFIED — GET /my-work, POST /my-work/tasks (inside
│                                       #   the existing 4-middleware group)
├── tests/Feature/MyWorkTest.php        # NEW — My Work read/status/quick-add matrix
└── tests/Feature/DashboardSummaryTest.php  # NEW — dashboard payload additions
                                        #   (completed_recent, recent_activities Client fix)

frontend/
├── src/pages/Dashboard.jsx             # RESTRUCTURED — deletions per Design Constraints;
│                                       #   + SummaryMetricsRow, StructureStrip, <MyWorkPanel/>
├── src/components/MyWorkPanel.jsx      # NEW — buckets, rows, inline status, quick-add,
│                                       #   modal wiring, all states; self-fetching
├── src/lib/taskStatus.js               # NEW — 7-status maps moved out of TaskboardView
│                                       #   (GroupSummaryBar.jsx stays components-only)
├── src/components/TaskboardView.jsx    # MECHANICAL — imports the moved constants
└── src/lib/api.js                      # + fetchMyWork(params), createMyWorkTask(payload)
```

**Structure Decision**: Existing two-deployable web layout; every change lands in an
existing directory following an existing naming convention. No new layers, no services,
no new frontend routes (`/` unchanged). `TaskDetailModal.jsx`, contexts, and routing are
untouched.

## Complexity Tracking

No constitution violations to justify.
