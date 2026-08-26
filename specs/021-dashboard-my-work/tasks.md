# Tasks: Dashboard Restructure with My Work List

**Input**: Design documents from `/specs/021-dashboard-my-work/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/my-work-api.md, quickstart.md

**Tests**: REQUIRED — Constitution Principle III ("a feature's task list is incomplete if it has implementation tasks with no matching test task"). Test tasks precede their implementation tasks and must fail before implementation. The authoritative test matrix is research.md §Test-requirements.

**Organization**: Grouped by user story. US1 (My Work panel) is the MVP; US2 (calmer overview) and US3 (quick-add) layer on independently.

**Constraint reminders**: no migrations anywhere in this feature; additive-only changes to `GET /api/dashboard`; due date = `plan_end_date`; all new routes inside the existing 4-middleware group; two documented skill deviations (no `strict_types`, inline validation) per plan.md.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 traceability label

---

## Phase 1: Setup

- [x] T001 Create branch `021-dashboard-my-work` from `main`; verify clean baseline: `cd backend && php artisan test` green, `cd frontend && npm run build && npm run lint` green

---

## Phase 2: Foundational (shared-component groundwork)

**Purpose**: The one shared-component extension both US1 and US2 render against; done first so no story conflicts on these files.

- [x] T002 Move the 7-status constants `STATUS_ORDER`, `STATUS_SEGMENT_LABELS`, `STATUS_SEGMENT_CLASSES`, `STATUS_BADGE_CLASSES` from `frontend/src/components/TaskboardView.jsx` into a new `frontend/src/lib/taskStatus.js` as named exports — **not** into `GroupSummaryBar.jsx`: that file is components-only, and adding value exports to it reintroduces the `react-refresh/only-export-components` lint errors just repaired on `main` (pre-flight commit `91779de`; sibling precedent `src/lib/groupSummary.js`). Do **NOT** modify `GROUP_ACCENT_CLASSES` — Taskboard/BugTracker/Retrospectives index it `[index % length]`, so appending an entry recolors unrelated pages with 6+ groups (architect review M1); My Work's accents are a panel-local map (T015)
- [x] T003 Update `frontend/src/components/TaskboardView.jsx` to import the moved constants from `@/lib/taskStatus` (mechanical, zero behavior change); verify all four maps carry the full 7 status keys after the move (`npm run build` cannot see a dropped object key — architect risk R2), Taskboard renders identically collapsed **and** expanded in both themes, and `cd frontend && npm run build && npm run lint` stays green with **0 errors**

**Checkpoint**: Shared components ready — user stories can begin.

---

## Phase 3: User Story 1 — Act on my own work from the dashboard (P1) 🎯 MVP

**Goal**: A My Work panel on the Dashboard listing the acting user's open assigned tasks in four due-date buckets, with inline status change and row-click task details. Delivers spec FR-001–FR-005, FR-008, FR-011–FR-013 (read/status surface) and SC-001/SC-003/SC-005.

**Independent Test**: Sign in as a Team Member with tasks due yesterday / in 3 days / in 3 weeks / undated → correct buckets with counts; change a status from the row (2 interactions, no reload); complete a task → it leaves the list; open a row → full details in `TaskDetailModal`; Client sees read-only; Admin preview shows the target's list and writes are rejected.

### Tests for User Story 1 (write first — must fail before implementation)

All in one file ⇒ sequential (no [P]). Copy the helper vocabulary of `backend/tests/Feature/ProjectScopingTest.php` (`startPreview()`, `callJsonPreviewing()` — headers via `json()`'s args, never `withHeaders()`).

- [x] T004 [US1] Scaffold `backend/tests/Feature/MyWorkTest.php` (PHPUnit style extending `Tests\TestCase`, `RefreshDatabase`) with shared helpers: `user(role)`, `assign(user, project)`, `makeChain(project)` → module→activity→subActivity, `taskFor(user, subActivity, attrs)`
- [x] T005 [US1] Add scoping/role tests to `backend/tests/Feature/MyWorkTest.php`: all five roles reach `GET /api/my-work` (200); 401 unauthenticated; 403 disabled user (`EnsureUserIsActive`); TM sees only own **open** assigned tasks (completed / others' / unassigned excluded); all six open statuses included (`backlog, not_started, in_progress, for_review, blocked, delayed`); Admin and PM still assignee-scoped ("My Work ≠ all work I can see"); Department Head scope; Client → 200 with valid empty shape; user B's tasks never in user A's list; **assigned task in an inaccessible project excluded** (assignee-alone-is-not-authorization); revoked assignment excluded on the very next request (no re-login)
- [x] T006 [US1] Add bucketing/anchor/cap tests to `backend/tests/Feature/MyWorkTest.php` under `Carbon::setTestNow` (always reset): boundary matrix (yesterday→`overdue`, +3d→`this_week`, +3w→`later`, null→`no_due_date`, each `count` correct); due **today**→`this_week`; Sunday-morning boundary (due that Sunday→`this_week`, due Monday→`later`); absent anchors → server defaults, 200; **lone anchor (`today` without `week_end`, and the reverse) → 422** (all-or-nothing pair, architect review M3); malformed `today` → 422; `week_end < today` → 422; `bucket=bogus` → 422; **`bucket` without `all` and `all` without `bucket` → 422**; `per_bucket=0` and `per_bucket=101` → 422 (`min:1,max:100`); shifted anchors shift buckets; **bucket-sum invariant: for arbitrary valid anchors the four `count`s sum to the user's total open count**; 15 tasks in one bucket → rows ≤ `per_bucket` AND `count` = 15; `?bucket=this_week&all=1` uncaps that bucket only; empty buckets present as `{count: 0, tasks: []}` (fixed shape)
- [x] T007 [US1] Add payload/preview tests to `backend/tests/Feature/MyWorkTest.php`: `assertArrayNotHasKey` for `root_cause`, `resolution`, `evidence`, `client_name`, `tenant_name`, `notes` on rows; parent-context project/module names only from the accessible chain; `meta.can_write` true for Admin/PM/TM, false for Client and Department Head, **false during Admin-preview-of-Client** (effective role); preview returns the previewed user's list, not the Admin's; expired preview token → 409 + `X-Preview-Ended: 1`, no domain data
- [x] T008 [US1] Add status-change delta tests to `backend/tests/Feature/MyWorkTest.php` (role-gate basics already live in `RoleAccessTest` — do not duplicate): completing a task via `PUT /api/detailed-activities/{id}` removes it from the next `GET /api/my-work`; **IDOR**: TM status-PUT on a task in an inaccessible project → 403 with body byte-identical (`assertSame`) to the nonexistent-id case; status change during preview → 403, DB unchanged, `preview.write_blocked` audit row; deleted task → 403 (TM) / 404 (Admin). Run `php artisan test --filter=MyWorkTest` and confirm all new tests **fail**

### Backend implementation for User Story 1

- [x] T009 [P] [US1] Add `scopeOpen(Builder $query): Builder` (`status != 'completed'`) to `backend/app/Models/DetailedActivity.php`, beside the existing scopes, with full types
- [x] T010 [P] [US1] Create `backend/app/Http/Resources/MyWorkTaskResource.php` — exactly `id, name, code, status, progress, plan_end_date, priority, sub_activity_id, project{id,name}, module{id,name}` via the eager-loaded chain (`whenLoaded` guarded); pattern-match `DetailedActivityResource`
- [x] T011 [US1] Create `backend/app/Http/Controllers/MyWorkController.php` with `index(Request): JsonResponse` per contracts/my-work-api.md: validate `today`/`week_end`/`per_bucket`/`bucket`/`all` per contracts (anchors `required_with` each other — all-or-nothing pair, both server-defaulted when absent; `per_bucket` `min:1,max:100`; `bucket`⇆`all` `required_with`; post-validation assert `today <= week_end`; parameter-bound only, `match` for bucket dispatch); `AccessContext::user()` → `Project::accessibleTo` pluck → base builder (assignee ∩ accessible ∩ `scopeOpen` ∩ `client_visible` when Client) → one `SUM(CASE WHEN …)` aggregate count query (SQLite+MySQL portable) + four capped row queries with `->with(['subActivity.activity.module.project'])`; fixed-shape envelope + `meta.can_write` (depends on T009, T010)
- [x] T012 [US1] Register `Route::get('my-work', [MyWorkController::class, 'index'])` **inside** the existing 4-middleware group in `backend/routes/api.php` (next to the dashboard route)
- [x] T013 [US1] Run `cd backend && php artisan test --filter=MyWorkTest` — T005–T008 read/status tests green; then full `php artisan test` green

### Frontend implementation for User Story 1

Reuse inspection is complete — plan.md §Frontend Design Constraints names every reused component; deviations from it are review findings.

- [x] T014 [P] [US1] Add `fetchMyWork(params)` to `frontend/src/lib/api.js` (GET `/my-work`, passing `today`, `week_end`, optional `per_bucket`/`bucket`/`all`)
- [x] T015 [US1] Create `frontend/src/components/MyWorkPanel.jsx` — self-fetching (client computes local `today` + Sunday `week_end` anchors); four `Collapsible` bucket groups in the `GroupSummaryBar` pattern: absolute `bg-*` accent spans from a **panel-local** `MY_WORK_BUCKET_ACCENTS` map (Overdue rose / This Week amber / Later primary / No Due Date slate; **never** `border-l-*`; **never** indexing `GROUP_ACCENT_CLASSES`), label-only `CollapsibleTrigger` with count, `GroupSegmentBar` (7-status constants from `@/lib/taskStatus`, `buildSegments` from `@/lib/groupSummary`) when collapsed, `table-fixed` + `<colgroup>` from a percentage `MY_WORK_COLUMN_WIDTHS` summing to 100; file-local `MyWorkTaskRow` (title-as-`<button>`, context project·module, due via `formatDate` with `text-destructive` overdue dates, status cell); empty buckets omitted from render
- [x] T016 [US1] Inline status change in `frontend/src/components/MyWorkPanel.jsx` — BugTracker-style row `<select>` (only when `meta.can_write`; else `Badge` via `getStatusColor`/`getStatusLabel`), Kanban-style optimistic patch with rollback incl. auto-progress coupling (`completed→100`, `not_started|backlog→0`) via `updateDetailedActivity`; completion removes the row + decrements count; fire `onTaskMutated()` on every confirmed success (research.md R8 — keeps summary metrics and heatmap fresh after an inline completion); 403/404/409 → inline row error + panel refetch (never silent)
- [x] T017 [US1] Modal wiring in `frontend/src/components/MyWorkPanel.jsx` — row click fetches the full task via `fetchDetailedActivity(id)` with a visible loading treatment (disabled row or modal shell + spinner), opens `TaskDetailModal` (`userRole` from `useEffectiveUser()`, `eyebrowLabel="My Work"`, `projectId`); on save success → panel refetch of `fetchMyWork` (covers due-date re-bucketing, FR-005) + fire `onTaskMutated()`; `onSave` returns `false` on failure
- [x] T018 [US1] Interface states in `frontend/src/components/MyWorkPanel.jsx` — loading skeleton (bucket header + 3 `bg-muted` row bars), empty-positive panel state (`CheckCircle2` success-toned, "You're all caught up", Work Program link), panel-scoped error + retry that never blanks the rest of the page, "Show all N" row (true remainder count; fetch-backed via `?bucket=X&all=1`), row-select disabled while in flight
- [x] T019 [US1] In `frontend/src/pages/Dashboard.jsx`: split `load()` into `load()` (initial mount — keeps the full-page spinner) and `refresh()` (silent refetch — no `setLoading(true)`, stale data stays rendered until the response lands; architect review M2 — passing `load` would flash the whole page to a spinner on every inline status change); mount `<MyWorkPanel onTaskMutated={refresh} />` positioned before the heatmap (SC-003: Overdue in first screenful)
- [x] T020 [US1] Accessibility pass on `frontend/src/components/MyWorkPanel.jsx` — `aria-expanded` triggers with visible `focus-visible` ring; per-row select `aria-label` ("Change status of {title}") + `stopPropagation` so operating it never opens the modal; focus returns from modal to the originating row `<button>` (fallback: bucket header); keyboard walkthrough (tab / Enter / Space) passes; `prefers-reduced-motion` honored on row removal
- [x] T021 [US1] Visual/browser verification for US1 (quickstart.md steps 1–3, 8–10, 12): buckets + boundaries, 2-interaction status change, modal sync, Client read-only + empty-positive, preview-as-user error surfacing, states under throttled/failed network; at 360px / tablet / 1366×768 desktop in light **and** dark; `cd frontend && npm run build && npm run lint` green

**Checkpoint**: US1 is a deployable MVP — the current dashboard plus an actionable My Work panel.

---

## Phase 4: User Story 2 — A calmer, non-redundant overview (P2)

**Goal**: One accomplishment-first four-metric row; duplicated counts, decorative elements, and card sprawl removed; heatmap + Recent Activities retained. Delivers FR-009, FR-010, FR-014 and SC-002/SC-006; fixes the `recent_activities` Client leak.

**Independent Test**: Open the restructured Dashboard → exactly 4 summary metrics, accomplishment-first; zero status counts rendered twice (audit rule: component-level page totals only); no blur ornaments / hero / structure cards; heatmap drill-down and Recent Activities filters behave exactly as before; a Client sees no internal task names in Recent Activities.

### Tests for User Story 2 (write first — must fail)

- [x] T022 [P] [US2] Create `backend/tests/Feature/DashboardSummaryTest.php` (listed in plan.md §Project Structure): `stats.completed_recent` present and correct at the 7-day window boundary under `Carbon::setTestNow`; `completed_recent` excludes `client_visible=false` tasks for a Client effective user; **Client sees no `client_visible=false` rows in `recent_activities`** (the defect-fix test); `stats.projects` and existing keys preserved; counts remain `accessibleTo`-scoped. The dashboard change is additive, so the two `ProjectScopingTest` `stats.projects` assertions should pass untouched — editing `ProjectScopingTest.php` requires justification in the task commit. Confirm failing

### Backend implementation for User Story 2

- [x] T023 [US2] Additive changes to `dashboard()` in `backend/app/Http/Controllers/ProjectController.php`: add `stats.completed_recent` (`status='completed'` ∧ `updated_at >= now()->subDays(7)`, `client_visible`-filtered for Client effective users — documented `updated_at` proxy comment citing `021-dashboard-my-work`); filter `recent_activities` by `client_visible` for Client effective users (mirror `DetailedActivityController::index()`); **remove no keys**
- [x] T024 [US2] Run `cd backend && php artisan test` — `DashboardSummaryTest` green, `ProjectScopingTest` still green

### Frontend implementation for User Story 2

- [x] T025 [P] [US2] Deletions in `frontend/src/pages/Dashboard.jsx`, identified structurally (the line refs below are **pre-T019** numbers — T019 shifts them; anchor on the JSX, not the numbers): the entire "Overall Progress Hero" region (`relative` wrapper containing the `aria-hidden` blur-ornament divs, the `backdrop-blur-xl` Card with the conic-gradient progress ring, the four status-chip grid, and the duplicate full-width progress bar — pre-T019 lines 441–513); the "Needs Attention" banner (515–529); the "Task Status" StatCard grid (531–548); the "Project Structure" + "Supporting stats" StatCard grids (550–565); the heatmap column-totals `<tfoot>` inside `TaskHeatmap`'s table (328–347). Keep `StatCard`, `TaskHeatmap`/`HeatmapCell`/`DrilldownBanner`/`HEATMAP_COLS`/`intensityBucket`, `STATUS_TABS`, Recent Activities, `load()`, `AccessDenied` handling
- [x] T026 [US2] Add page-local `SummaryMetricsRow` in `frontend/src/pages/Dashboard.jsx` — four reused `StatCard`s in `grid-cols-2 lg:grid-cols-4`, ordered **Completed (7d)** (`stats.completed_recent`, emerald) → **Overall Progress** (`{pct}%`, description **without** the completed count) → **In Progress** (blue) → **Delayed** (existing conditional red/slate styling); while touching `StatCard`, fix or drop its `accent` prop — its `border-l-4` classes are inert under the unlayered border reset (`index.css:104-106`), so convert to an absolute `bg-*` span or remove (architect review m2); add compact `StructureStrip` text line (`{projects} projects · {modules} modules · …`, `flex-wrap`, no cards) as the last region; final region order: title → metrics → My Work → heatmap → Recent Activities → strip
- [x] T027 [US2] Verification for US2 (quickstart.md steps 5–7, 11): SC-002 duplicate-count audit over the enumerated surfaces (summary row, heatmap body/legend, Recent Activities tabs, My Work headers); SC-003 at 1366×768; SC-006 ≤ 6 regions; heatmap drill-down + Recent Activities filters unchanged; responsive + both themes; `npm run build && npm run lint` green

**Checkpoint**: US1 + US2 = the fully restructured dashboard.

---

## Phase 5: User Story 3 — Quick-add a task in context (P3)

**Goal**: Bucket-context quick-add — title + placement only, due date inferred from the bucket, self-assigned by server invariant. Delivers FR-006, FR-007 and SC-004.

**Independent Test**: From This Week, quick-add with a title and the defaulted placement → task appears immediately, assigned to me, due end of week; a validation failure preserves my typed title with an inline error; no quick-add appears in Overdue, for read-only roles, or for a writable user with zero accessible modules.

### Tests for User Story 3 (write first — must fail)

- [x] T028 [US3] Add quick-add tests to `backend/tests/Feature/MyWorkTest.php` for `POST /api/my-work/tasks`: role matrix (Admin/PM/TM → 201 + `task.created` audit; Department Head → 403 + `permission.denied` audit; Client → 403); **forced self-assignment** — payload-supplied `assignee_user_id` ignored, persisted row = acting user (`assertDatabaseHas`); `plan_end_date` prefill persists; inaccessible `module_id` → denial per repo parity rules; mass-assignment smuggling (`client_visible`, `priority`, `sprint_label`, `id`, foreign `sub_activity_id` → created row unaffected); missing `name` / bad date → 422 with `errors.name` shape; **reserved-chain reuse** — second quick-add in the same module creates no duplicate Activity/SubActivity; **no assignment notification created for the self-assigned quick-add** (architect review m5 — do not pattern-match Taskboard's notification call); quick-add during preview → blocked + `assertDatabaseMissing`. Confirm failing

### Backend implementation for User Story 3

- [x] T029 [P] [US3] Create `backend/app/Support/TaskboardPlacement.php` — extract `resolveDefaultSubActivity(int $moduleId): SubActivity` + typed reserved-name constants (`private const string`) from `backend/app/Http/Controllers/TaskboardController.php`; caller-owns-transaction docblock; update `TaskboardController` to delegate; `php artisan test --filter=TaskboardTest` stays green
- [x] T030 [US3] Add `store(Request): JsonResponse` to `backend/app/Http/Controllers/MyWorkController.php` per contracts/my-work-api.md: gates in order — `canWrite()` on effective user (denial → `AuditLogger::denied`) then module's project ∈ `accessibleTo`; validate `{name, module_id, plan_end_date?}`; `DB::transaction` create with **explicit array** — `assignee_user_id` forced to real `$request->user()->id`, `status='not_started'`, `client_visible=false`, placement via `TaskboardPlacement`; audit `task.created`; eager-load chain; 201 + `MyWorkTaskResource` (depends on T029)
- [x] T031 [US3] Register `Route::post('my-work/tasks', [MyWorkController::class, 'store'])` inside the middleware group in `backend/routes/api.php`; run `php artisan test --filter=MyWorkTest` — quick-add section green; full suite green

### Frontend implementation for User Story 3

- [x] T032 [P] [US3] Add `createMyWorkTask({ module_id, name, plan_end_date })` to `frontend/src/lib/api.js` (POST `/my-work/tasks`; project id is UI-only filter state, not part of the payload)
- [x] T033 [US3] Quick-add UI in `frontend/src/components/MyWorkPanel.jsx` — file-local `QuickAddRow` in This Week / Later / No Due Date buckets (never Overdue) **plus** panel-header "+ Add task" entry point (targets This Week by default; materializes the omitted empty bucket per FR-011's exception); real `<form>`: title `Input` + two dependent selects (Project via `fetchProjects()` → Module via `fetchModules(projectId)`, lazily loaded once, session-cached); MRU placement in `localStorage` key `itrack.myWork.lastPlacement` (try/catch-guarded, validated against fresh lists); due-date prefill client-side (This Week → local `week_end`; Later / No Due Date → none); gating: render only when `meta.can_write` **and** the accessible project/module list is non-empty
- [x] T034 [US3] Quick-add states & accessibility in `frontend/src/components/MyWorkPanel.jsx` — Enter submits, Escape cancels and restores focus to the trigger; focus moves to title input on open; submit disabled + spinner in flight; failure preserves the typed title with inline `text-destructive` message tied via `aria-describedby` (`errors.name` from the API); success appends the response task (bucket re-derives), clears input, returns focus to title input, fires `onTaskMutated()`
- [x] T035 [US3] Visual/browser verification for US3 (quickstart.md step 4 + keyboard checks): happy path ≤ 2 required inputs, MRU default, empty-bucket entry point, validation failure, role/emptiness gating; both themes; `npm run build && npm run lint` green

**Checkpoint**: All three stories functional.

---

## Phase 6: Polish & Definition-of-Done gates

- [ ] T036 Full automated gates: `cd backend && php artisan test` (entire suite) and `cd frontend && npm run build && npm run lint`
- [ ] T037 Complete manual browser verification — all 12 quickstart.md steps end-to-end, including the preview-as-user scenario and the SC-002 audit rule ("component-level page totals only")
- [ ] T038 [P] OWASP review (`laravel-owasp-security` skill) over the diff, scoped per research.md §OWASP (A01 double-filter + route placement + denial parity; A03 explicit create-array + parameter-bound anchors; exposure ban-list; A09 audit parity; grep `dangerouslySetInnerHTML` → nothing); record results in `specs/021-dashboard-my-work/owasp-review.md`
- [ ] T039 [P] code-slop review (`code-slop` skill) over the diff per quickstart.md gate 5 (spec-citing comments only, no narration; no `MyWorkService`/`BucketHelper`; no defensive overdose; no `console.log`; no drive-by edits outside plan.md §Project Structure's file list); record results in `specs/021-dashboard-my-work/code-slop-review.md`
- [ ] T040 Frontend review pass (`frontend-design` skill) — classify findings Critical/Major/Minor/Suggestion against the pre-registered criteria in quickstart.md (each finding: file / observed / expected / correction); record in `specs/021-dashboard-my-work/frontend-design-review.md`
- [ ] T041 Resolve every Critical and Major finding from `owasp-review.md`, `code-slop-review.md`, and `frontend-design-review.md`, or explicitly document its acceptance in those files; feature is complete only when this and T036–T037 pass (Constitution VIII + Frontend Completion Gate)

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 → Phase 2 → user stories**: T002–T003 block US1's frontend (T015 imports the moved constants) and touch TaskboardView, so they land first.
- **US1 (Phase 3)**: independent MVP. Backend chain: T004→T005→T006→T007→T008 (one test file) → T009/T010 [P] → T011 → T012 → T013. Frontend chain: T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021; frontend (T014+) may start in parallel with backend once T004–T008 pin the contract.
- **US2 (Phase 4)**: independent of US1's code except final region ordering in T026 (mount point exists from T019). Backend chain T022 → T023 → T024 and frontend chain T025 → T026 run as parallel workstreams, **joining before verification**: T026 can be coded against the contract (`stats.completed_recent`) before T023 lands, but T027 requires T024 complete (real values for the summary row and SC-002 audit).
- **US3 (Phase 5)**: depends on US1's `MyWorkController`/`MyWorkPanel` existing. T028 → (T029 [P] with it) → T030 → T031; T032 [P] → T033 → T034 → T035.
- **Polish (Phase 6)**: after all implemented stories. T038/T039 [P]; T040 after T037; T041 last.

### Story completion order

US1 (MVP) → US2 → US3. US2 and US3 are independently shippable increments after US1.

## Parallel opportunities

```text
Phase 3: T009 + T010 (different backend files) | T014 (api.js) alongside backend work
Phase 3↔4: after US1, US2 backend (T022–T024) ∥ US2 frontend (T025–T027)
Phase 5: T029 (Support extraction) ∥ T028 (test authoring); T032 ∥ T030–T031
Phase 6: T038 ∥ T039
```

## Implementation strategy

**MVP first**: T001–T021 delivers the actionable My Work panel on the existing dashboard — deployable and independently valuable. **Increment 2** (T022–T027) completes the visual restructure and ships the Client-leak fix. **Increment 3** (T028–T035) adds quick-add. Stop-and-validate at each checkpoint; the DoD gates (T036–T041) run once over the final surface, but nothing blocks running them early per increment.
