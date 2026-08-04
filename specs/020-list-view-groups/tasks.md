# Tasks: List View Groups

**Input**: Design documents from `/specs/020-list-view-groups/`
**Prerequisites**: plan.md, research.md, quickstart.md (no data-model.md/contracts — no data or API surface)

**Tests**: No automated frontend test runner exists in this repo (research.md, consistent with 019-taskboard-scannability's D5). Verification is via quickstart.md's live-browser scenarios, referenced from task descriptions below — no test-file tasks are generated.

**Organization**: Single file (`frontend/src/pages/WorkProgram.jsx`), two independently-testable user stories per spec.md, both dependent on a shared Foundational data-layer change.

## Phase 1: Foundational

**Purpose**: The data-fetching and refresh-helper changes both user stories depend on. Must complete first — neither story's UI can be meaningfully built or tested against the old per-Sub-Activity-lazy-fetch model.

- [X] T001 Inspect current state in `frontend/src/pages/WorkProgram.jsx`: `toggleActivity`/`toggleSubActivity` (lines ~1014–1049), `reloadModules`/`handleSubmit`/`handleDelete`/`saveEdit` (lines ~773–946, 1067–1076), and the List view render branch (~1366–1796); confirm current line numbers and behavior still match research.md D1/D2's description before editing (guards against drift since this plan was written).
- [X] T002 Add new `activityTasks` and `activityTasksLoading` state dictionaries (keyed `${moduleId}-${activityId}`) alongside the existing `modules`/`activities`/`subActivities`/`detailedActivities` state declarations.
- [X] T003 Add a `refreshActivityTasks(moduleId, activityId)` helper (not a modification of `toggleActivity`) that fetches that Activity's Sub-Activities fresh, then immediately fetches every Sub-Activity's tasks in parallel via `Promise.all(...)`, flattens and merges them (each task annotated with its source Sub-Activity's `id`/`name`) into `activityTasks[key]`, replacing any existing cached entry (research.md D1/D2 — merged into one task per the corrected D1: `toggleActivity` is shared with Gantt view, per grep at line 744, and must not be touched). Preserve the existing 403 → `setAccessDenied` error handling.
- [X] T004 Add a new `expandActivityGroup(activityId, moduleId)` function, used only by the List view's Activity-group header (not `toggleActivity`, not used by Gantt): toggles the shared `expandedActivities[key]` flag, and on first expand (when `!activityTasks[key]`), calls T003's `refreshActivityTasks`.

**Checkpoint**: Expanding an Activity now populates one flat, merged task array with Sub-Activity identity retained per task — ready for both stories to render/mutate against.

---

## Phase 2: User Story 1 - Scan and manage tasks without drilling through extra levels (Priority: P1) 🎯 MVP

**Goal**: Replace the nested Activity→SubActivity→Task rendering with a flat, color-grouped table per Activity, without losing any existing edit/delete/Sub-Activity-management capability.

**Independent Test**: Expand a Module with 2+ Activities (one having tasks across 2+ Sub-Activities); confirm all tasks are visible after only two expand actions (Module, Activity), each group is color-distinguished, and every existing edit/delete action still works, per quickstart.md Scenario 1 and 3.

- [X] T005 [US1] Component reuse analysis: confirm `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent` (`@radix-ui/react-collapsible`, via `@/components/ui/collapsible`) and the `GROUP_ACCENT_CLASSES` palette shape from `frontend/src/components/TaskboardView.jsx` are importable/duplicable into `WorkProgram.jsx` per research.md D6's decision (import vs. duplicate — pick one and note why, matching this codebase's small-duplication-over-coupling precedent).
- [X] T006 [US1] In `frontend/src/pages/WorkProgram.jsx`, add the `GROUP_ACCENT_CLASSES` constant (or import it) and replace the Activity-level nested `Card` (lines ~1498–1554) with a `Collapsible` group using the same `bg-*` accent-bar + `pointer-events-none`/`aria-hidden` pattern established in `TaskboardView.jsx` (research.md D6, and the pointer-events fix from 019-taskboard-scannability).
- [X] T007 [US1] Remove the Sub-Activity nesting level's `Card`/`CardHeader` rendering (lines ~1556–1621) from the main flow; replace with a single flat `Table` per Activity group, sourced from `activityTasks[key]` (T003) instead of per-Sub-Activity `detailedActivities`. **Resolves /speckit-analyze finding C1**: the original "Add Sub-Activity" button is dropped from the main flow (relocated into T010's Manage Sub-Activities dialog), but the original "Add Task" button (full-dialog creation, previously nested inside this same Sub-Activity `CardContent`, lines ~1623–1632) is explicitly **relocated to the Activity group header**, alongside T010's Manage Sub-Activities affordance — so a full-field task creation path (status/notes/client-visible at creation time) remains available as a secondary action next to the new inline "+ Add item" row (T016), not silently dropped.
- [X] T008 [US1] Add a Sub-Activity column to the flat task table, using each task's annotated Sub-Activity name (from T003); apply the same dense-table classNames (`h-8 py-1.5 px-3 text-xs`/`py-1.5 px-3`) established in `TaskboardView.jsx` for visual consistency.
- [X] T009 [US1] Preserve the existing Quick Status Edit (inline status/progress/actual-dates, `editingId`/`editForm`/`startEdit`/`saveEdit`/`cancelEdit`), Full Edit (`openFormModal('task', 'edit', ...)`), **and Delete** (`setDeleteTarget({ level: 'task', id, context: {...} })`) icon buttons per row, updating **all three's** context (`moduleId`/`activityId`/`subActivityId`) to read the Sub-Activity id from the task's own annotation (T003) rather than a Sub-Activity-row closure variable that no longer exists. **Resolves /speckit-analyze finding C2**: the Delete button has the identical closure-variable dependency as the two edit buttons and was previously missed — without this, Delete would reference an undefined `subActivity` variable once the Sub-Activity-level closure is removed in T007.
- [X] T010 [US1] Add the "Manage Sub-Activities" affordance to each Activity group header (Admin/Project Manager only, matching the existing per-level edit/delete role gate) — a small dialog listing that Activity's Sub-Activities with the existing Edit/Delete actions and "Add Sub-Activity" creation, reusing `openFormModal('sub-activity', ...)`/`handleDelete` verbatim (research.md D3).
- [X] T011 [US1] Add a **read-only** Sub-Activity display (plain text, not an editable field) to the shared modal's task-specific fields (rendered only for `modalLevel === 'task'`, ~lines 2588–2674), sourced from the task's own annotation. **Corrected during implementation** (research.md D4): reassignment via an editable `<select>` was originally planned but found to require a backend change (`sub_activity_id` isn't validated/updatable in `DetailedActivityController::update()`), which is outside this plan's frontend-only scope — descoped to display-only, still satisfying FR-003/FR-007 in full.
- [X] T012 [US1] Interface states: add a lightweight loading indicator for the Activity group body while T003's parallel fetch is in flight (new state, since today's Sub-Activity level had no equivalent — a single small fetch); add an empty-state row/message for an Activity with zero tasks; confirm the existing 403 → AccessDenied error state still triggers correctly from the new fetch call sites.
- [X] T013 [US1] Responsive behavior: confirm the flat per-Activity `Table` inherits the same `overflow-auto` wrapping behavior from `ui/table.jsx` as every other table in the app — no new breakpoints needed (plan.md).
- [X] T014 [US1] Accessibility: confirm the new `Collapsible` groups use the same keyboard-operable button/`aria-expanded` convention already established both in this exact file (`toggleModule`/`toggleActivity`'s `role="button"`/`onKeyDown`) and in `TaskboardView.jsx`; confirm the accent bar has `aria-hidden="true"` and `pointer-events-none`.
- [X] T015 [US1] Run quickstart.md Scenario 1 (flattened, color-grouped Activities) and Scenario 3 (Sub-Activity management relocation) live in the browser, including exercising the accent-color cycling case with 6+ Activities (don't skip for lack of test data, per 019-taskboard-scannability's T010 precedent).

**Checkpoint**: User Story 1 is independently complete and verifiable — List view is flattened, color-grouped, and every pre-existing capability (quick/full edit, delete, Sub-Activity CRUD) still works.

---

## Phase 3: User Story 2 - Add a task without leaving the group (Priority: P2)

**Goal**: A per-Activity inline "+ Add item" entry point that creates a task by name only, transparently handling the case where the Activity has no Sub-Activity yet.

**Independent Test**: Use the inline add row on an Activity with an existing Sub-Activity, and separately on one with none; confirm both succeed and the task appears in the flat list without opening the full create dialog, per quickstart.md Scenario 2.

- [X] T016 [US2] In `frontend/src/pages/WorkProgram.jsx`, add an inline add row (name `<input>` + submit) at the bottom of each Activity group's `TableBody`, gated `userRole !== 'Client'` (matching today's existing "Add Task" button gate at line ~1627).
- [X] T017 [US2] Implement the submit handler per research.md D5: read the Activity's cached Sub-Activity list; if non-empty, use the first entry's id; if empty, call `createSubActivity(activityId, { name: 'General', type: 'A' })` first to obtain one (reusing the existing default `type` value from `openFormModal`'s create-mode defaults). **Resolves /speckit-analyze finding L1**: use `'General'` (not `activity.name`) so the auto-provisioned Sub-Activity is visually distinguishable from its parent Activity when listed in T010's Manage Sub-Activities dialog.
- [X] T018 [US2] Call `createDetailedActivity(subActivityId, { name })` with the typed name (all other fields left to backend defaults), then call T003's `refreshActivityTasks(moduleId, activityId)` and clear the input.
- [X] T019 [US2] Validation state: empty/whitespace-only name submission is a no-op (mirrors `TaskboardView.jsx`'s `handleCreate` guard, `if (!name.trim()) return`).
- [X] T020 [US2] Permission-denied state: confirm the inline add row does not render at all for Client role (T016's gate), and confirm it DOES render for other internal roles (e.g. Team Member) per today's existing "Add Task" gate being role-inclusive beyond just Admin/PM.
- [X] T021 [US2] Run quickstart.md Scenario 2 (inline add) live in the browser: an Activity with an existing Sub-Activity, an Activity with zero Sub-Activities (confirm exactly one gets auto-provisioned, verified via T010's Manage Sub-Activities dialog), and the Client/non-Client visibility checks.

**Checkpoint**: User Story 2 is independently complete and verifiable — inline task creation works with or without a pre-existing Sub-Activity, and stays correctly permission-gated.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Regression verification and the constitution-mandated frontend review pass.

- [X] T022 Run `npx vite build` from `frontend/` and confirm it succeeds with no new errors/warnings.
- [X] T023 Run quickstart.md Scenario 4 (no regression): Module-level rendering/CRUD/rollups unchanged, Gantt and Taskboard views unchanged, Client-role restrictions fully preserved within the new layout.
- [X] T024 Run `git diff`/`git status` and confirm only `frontend/src/pages/WorkProgram.jsx` was modified.
- [X] T025 Perform the frontend review pass described in quickstart.md (constitution: Frontend Design and Review Governance) — compare against spec.md, the constitution, plan.md, and comparable existing patterns (`TaskboardView.jsx`); classify findings as Critical/Major/Minor/Suggestion.
- [X] T026 Resolve or explicitly document-and-accept any Critical or Major findings from T025 before considering this feature complete (Constitution Completion Gate).

---

## Dependencies & Execution Order

- **Phase 1 (Foundational)**: No dependencies — must complete first; both stories render/mutate against `activityTasks`, which doesn't exist until T001–T004 are done.
- **User Story 1 (Phase 2)**: Depends on Phase 1. This is the MVP — flattens and re-colors the view and preserves all existing capability, independently shippable and testable without the inline-add feature.
- **User Story 2 (Phase 3)**: Depends on Phase 1 (needs `activityTasks`/`refreshActivityTasks`) AND on User Story 1's flat table markup existing (the inline row is appended to the `TableBody` T007/T008 create) — implement after Phase 2 completes.
- **Polish (Phase 4)**: Depends on both Phase 2 and Phase 3 being complete.

## Parallel Execution Notes

All tasks touch the same single file (`WorkProgram.jsx`) or are manual verification steps performed against it — no meaningful `[P]` parallelization opportunity; tasks are listed in recommended sequential order.

## Implementation Strategy

**MVP = User Story 1 only** (Phase 1 + Phase 2): ship the flattened,
color-grouped view with all existing capability preserved — independently
valuable (SC-001, SC-002, SC-004) without the inline-add workflow.

**Incremental delivery**: Phase 1 → Phase 2 (US1, MVP checkpoint) →
Phase 3 (US2) → Phase 4 (Polish, required before calling the full feature
complete).
