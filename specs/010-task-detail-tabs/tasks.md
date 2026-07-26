# Tasks: Task Detail Tabs & Completion Indicators

**Input**: Design documents from `/specs/010-task-detail-tabs/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/task-detail-modal-contract.md, quickstart.md (all present, all reviewed and revised as of this generation)

**Tests**: Not included. This feature touches no backend file (plan.md's Technical Context) and this codebase has no automated frontend test suite (established practice across 001-009) — plan.md's own Testing section already commits to manual verification via quickstart.md, and spec.md's SC-003/SC-004 were revised in review specifically to stop claiming automated-test coverage that doesn't exist. Every user story below ends in an explicit manual-verification task instead of a test-writing task.

**Organization**: Tasks are grouped by user story (US1 = P1, US2 = P2, US3 = P3) per spec.md's priority order.

## Path Conventions

Frontend-only feature (`frontend/`, React/Vite) — no `backend/` file is touched anywhere in this task list.

## Phase 1: Setup

- [x] T001 Confirm the `010-task-detail-tabs` branch is checked out and the frontend dev server (`cd frontend && npm run dev`) starts cleanly — environment check only; no migration, no backend restart needed (this feature changes no backend file)

---

## Phase 2: User Story 1 - A Support Ops issue's fields are organized into focused tabs (Priority: P1) 🎯 MVP

**Goal**: A Support Ops issue's detail view shows five focused tabs instead of one long-scroll Details tab; a Kanban board task's detail view is completely unaffected.

**Independent Test**: Open a Support Ops issue and confirm five tabs (Details, Support, Resolution, Comments, Files), each showing only its own fields; open a Kanban board task and confirm it still shows exactly three tabs (Details, Comments, Files), unchanged.

- [x] T002 [US1] Extract the shared generator chrome out of `frontend/src/components/SupportIssueExtraFields.jsx` into a new `frontend/src/components/SupportGeneratorPanel.jsx`, exporting both `GeneratorPanel` (the presentational panel component used by all three generators — Client Message Templates, Freeform Client Update, Troubleshooting Packet) and `hasUnsavedFieldChange(form, issue, fields)` (the "unsaved edit" warning helper, also used by all three). Update `SupportIssueExtraFields.jsx` to import both from the new file instead of defining them locally. This is a pure move — zero behavior or rendering change — and must land before T003/T004, since the Troubleshooting Packet code T003 moves and the narrowed component T004 leaves behind both need to reference these two functions from a shared location rather than one file privately owning something the other now needs too
- [x] T003 [US1] Create `frontend/src/components/ResolutionExtraFields.jsx` — new component accepting `form`, `setForm`, `selectedIssue`, `showToast`, `readOnly`; renders Evidence, Root Cause, Resolution, and the Troubleshooting Packet generator, moved from `SupportIssueExtraFields.jsx` along with its own local generator state (`packetText`/`packetCopyStatus`/`packetGeneratedAt`/`handleGeneratePacket`/`handleCopyPacket`), importing `GeneratorPanel`/`hasUnsavedFieldChange` from `SupportGeneratorPanel.jsx` (T002) rather than duplicating either (contracts/task-detail-modal-contract.md)
- [x] T004 [US1] Narrow `frontend/src/components/SupportIssueExtraFields.jsx` — remove Evidence, Root Cause, Resolution, and the Troubleshooting Packet generator (moved to T003); keep Client, Tenant, Channel, Client Priority, Last Client Update (+ record action), Next Action, the Client Message Templates generator, and the Freeform Client Update generator, with their existing local state unchanged, now importing `GeneratorPanel`/`hasUnsavedFieldChange` from `SupportGeneratorPanel.jsx` (T002)
- [x] T005 [US1] Modify `frontend/src/components/TaskDetailModal.jsx` — replace the `extraFields` prop with two optional render props, `supportFields` and `resolutionFields` (same `(form, setForm, readOnly) => JSX` shape); add the `showSupportResolutionTabs` decision (`['support', 'learning'].includes(task.work_type) && typeof supportFields === 'function' && typeof resolutionFields === 'function'`); add a dev-only `console.warn` guarded by `import.meta.env.DEV` naming the task and which render prop is missing when `task.work_type` qualifies but the props don't; render Support and Resolution tab buttons and bodies, positioned between Details and Comments, only when `showSupportResolutionTabs` is true; when false, render exactly today's 3-tab layout with zero change (data-model.md)
- [x] T006 [US1] Update `frontend/src/pages/SupportOps.jsx` — split its `extraFields` prop into `supportFields={(form, setForm, readOnly) => <SupportIssueExtraFields .../>}` and `resolutionFields={(form, setForm, readOnly) => <ResolutionExtraFields .../>}`, passing each component exactly the props it still needs after T003/T004 (contracts/task-detail-modal-contract.md)
- [x] T007 [US1] Update `frontend/src/pages/TodayDashboard.jsx` — same split as T006
- [x] T008 [US1] Update `frontend/src/pages/SupportOpsKnowledgeBase.jsx` — same split as T006; `readOnly` stays hardcoded `true`; `onRecordClientUpdate`/`showToast` stay as the existing no-op stand-ins (009's Assumption: neither is ever actually invoked in read-only mode)
- [x] T009 [US1] Manual verification: `specs/010-task-detail-tabs/quickstart.md` Scenarios 1-2 — five tabs with the exact field sets specified for each on a Support Ops issue; a Kanban board task unaffected, still exactly three tabs

**Checkpoint**: A Support Ops issue's fields are organized into focused tabs; Kanban is provably untouched. This alone is a deployable improvement — the actual complaint this feature exists to fix.

---

## Phase 3: User Story 2 - A tab's label shows whether its information is complete (Priority: P2)

**Goal**: The Support and Resolution tab labels show a live `x/y` completion count, and each currently-blank required field is visibly marked — without needing to open the tab or save first.

**Independent Test**: Open a Support Ops issue missing its root cause and resolution; confirm the Resolution tab's label reads "0/2"; fill in both fields without saving; confirm the label updates to "2/2" immediately.

- [x] T010 [US2] In `frontend/src/components/SupportIssueExtraFields.jsx`: add a shared `isFilled(value)` helper (`typeof value === 'string' && value.trim() !== ''` — trim-based, matching 009-support-ops-knowledge-base's exact blankness rule, not a plain truthiness check) and export `getSupportCompletion(form)`, checking `client_name`/`client_priority` via `isFilled`; add a required-field marker (`*`) to the Client and Client Priority labels, using the same `isFilled` check, shown only when `!readOnly` (data-model.md)
- [x] T011 [US2] In `frontend/src/components/ResolutionExtraFields.jsx`: export `getResolutionCompletion(form)` using the same `isFilled` helper (duplicated locally or imported — either way, the same trim-based check, never a second definition of "blank"), checking `root_cause`/`resolution`; add a required-field marker to the Root Cause and Resolution labels, shown only when `!readOnly`
- [x] T012 [US2] Modify `frontend/src/components/TaskDetailModal.jsx` — import both completion functions; compute `supportCompletion`/`resolutionCompletion` from the current `form` state on every render when `showSupportResolutionTabs` is true; render each as an `x/y` pill on the Support/Resolution tab buttons, reusing the pill markup already established for Comments/Files' activity-count badges, but always as a fraction — never a bare count — so it cannot be confused with an activity-count badge (FR-009)
- [x] T013 [US2] Manual verification: quickstart.md Scenarios 3-4 — completion counts update live without saving; Support/Resolution's `x/y` pills are visually distinguishable from Comments/Files' bare-count activity badges

**Checkpoint**: A team member can tell whether an issue's Support or Resolution information is complete from the tab bar alone, without opening either tab.

---

## Phase 4: User Story 3 - A save-time summary catches anything still missing (Priority: P3)

**Goal**: Saving an issue with missing required fields still succeeds, but shows a one-time, non-blocking summary of what's still missing, grouped by tab.

**Independent Test**: Save a Support Ops issue missing one or more required fields; confirm the save succeeds and a summary lists exactly what's missing; save an issue with nothing missing and confirm no summary appears.

- [x] T014 [US3] Add a `computeMissing(form)` helper (in `TaskDetailModal.jsx` or a small shared util) reusing the exact same field lists and `isFilled` check `getSupportCompletion`/`getResolutionCompletion` already use (not a third or fourth definition of "blank") — returns `{ support: [...], resolution: [...] }` naming which specific fields are missing, omitting any group with nothing missing (data-model.md)
- [x] T015 [US3] Add `missingSummary` state (`null | { support: [...], resolution: [...] }`) to `TaskDetailModal.jsx`; reset it to `null` in the same effect that already resets `form`/`modalTab`/counts whenever a different task is opened, so it never leaks from one issue into the next
- [x] T016 [US3] Modify `handleSubmit` in `TaskDetailModal.jsx` — after `onSave(form)` succeeds, when `showSupportResolutionTabs` is true, call `computeMissing(form)`; if anything is missing, call `setMissingSummary(...)` instead of `onClose()` (the modal stays open, the save has already completed); if nothing is missing, `onClose()` exactly as today. A task that never qualifies for the 5-tab layout (every Kanban task) always takes the unchanged, immediate `onClose()` path — this change is invisible to it.
- [x] T017 [US3] Render the missing-fields summary banner in `TaskDetailModal.jsx` when `missingSummary` is set — grouped by tab (e.g., "Support is missing: Client Priority"), dismissed via the modal's existing Close/X control, never a separate blocking confirmation step (FR-012); gate both this banner and T010/T011's per-field markers on `!readOnly` (FR-014) — 009's Knowledge Base view shows tabs and completion counts, never markers or this summary
- [x] T018 [US3] Manual verification: quickstart.md Scenario 5 (save succeeds with fields missing, summary appears grouped by tab, modal stays open, reopening the issue confirms an unrelated edit made in the same save actually persisted — proving the summary isn't masking a silent save failure) and Scenario 6 (009's read-only view: tabs and completion counts still show, no markers, no summary)

**Checkpoint**: All three user stories are independently functional. Nothing introduced by this feature can ever block, delay, or require confirmation before a save completes.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T019 [P] Run `npm run lint` and `npm run build` in `frontend/` — clean, no leftover unused imports (in particular, confirm nothing still imports the removed `extraFields` prop name, references fields moved out of `SupportIssueExtraFields.jsx`, or leaves a stray duplicate copy of `GeneratorPanel`/`hasUnsavedFieldChange`) or reference errors
- [x] T020 Run the complete `php artisan test` suite — 100% pass, zero regressions across 001-010 (this feature touches no backend file, so this is a pure regression confirmation, not new coverage)
- [x] T021 Execute `specs/010-task-detail-tabs/quickstart.md`'s full Regression check — Kanban task creation/edit/comment/upload behaves exactly as before this feature shipped; 009's Knowledge Base read-only view remains fully read-only (no save/comment/upload/delete affordance anywhere) with the new tab structure layered on top

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: No dependencies.
- **User Story 1 (T002-T009)**: Depends on Setup. Must complete before US2/US3 — both extend the tab structure and the two extracted components US1 creates; neither introduces a new file or a new tab. T002 (the `SupportGeneratorPanel.jsx` extraction) specifically must land before T003/T004, since both depend on it existing rather than each privately owning (or duplicating) `GeneratorPanel`/`hasUnsavedFieldChange`.
- **User Story 2 (T010-T013)**: Depends on US1's `ResolutionExtraFields.jsx` and narrowed `SupportIssueExtraFields.jsx` existing, and on `TaskDetailModal.jsx`'s `showSupportResolutionTabs` decision (T005) already being in place.
- **User Story 3 (T014-T018)**: Depends on US2's `isFilled`/`getSupportCompletion`/`getResolutionCompletion` existing — `computeMissing` reuses them directly, not a fresh definition. Otherwise independent of US2's UI work (tab-label pills) — the two could be staffed in parallel once US1 is done, since T010-T013 touch tab labels while T014-T018 touch `handleSubmit`/save flow, but both need the same underlying `isFilled`/completion functions to exist first, so in practice US2's T010/T011 (which create those functions) should land before US3 starts.
- **Polish (T019-T021)**: Depends on all three user stories being complete.

### Within Each User Story

- Component/prop changes (T002-T005, T010-T012, T014-T017) before their corresponding page updates or manual verification.
- Each story ends in an explicit manual-verification task (T009, T013, T018) rather than a test-writing task, per this feature's no-automated-frontend-test-suite reality.

### Parallel Opportunities

- T003 (new `ResolutionExtraFields.jsx`) and T004 (narrowing `SupportIssueExtraFields.jsx`) touch different files and can be done in parallel once T002 (the shared-panel extraction) lands, though both must land before T005 can wire them in.
- T006, T007, T008 (the three caller updates) are the same mechanical change applied to three different files — safe to do in parallel.
- T010 and T011 touch different files (`SupportIssueExtraFields.jsx` vs. `ResolutionExtraFields.jsx`) and can be done in parallel.

---

## Parallel Example: User Story 1's caller updates

```bash
# T006-T008 are the identical extraFields → supportFields/resolutionFields
# split applied to three different, independent files:
Task: T006 Update SupportOps.jsx
Task: T007 Update TodayDashboard.jsx
Task: T008 Update SupportOpsKnowledgeBase.jsx
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (User Story 1).
3. **Stop and validate**: a Support Ops issue shows five focused tabs; Kanban is untouched. This alone fixes the actual "single long-scroll Details tab" complaint this feature exists to address — ship it before adding completion indicators or the save-time summary.

### Incremental Delivery

1. Setup → User Story 1 → test independently → deploy/demo (MVP: organized tabs).
2. User Story 2 → test independently → deploy/demo (live completion visibility).
3. User Story 3 → test independently → deploy/demo (save-time safety net).
4. Polish → full regression + manual quickstart pass → ship.

### Parallel Team Strategy

With two developers, after User Story 1 is done: Developer A takes User Story 2's tab-label pill rendering (T012-T013), Developer B takes User Story 3's save-flow changes (T014-T018) once T010/T011's `isFilled`/completion functions exist — both depend on US1, not on each other's UI work.

---

## Notes

- [P] tasks touch different files with no dependency on an incomplete task.
- [Story] labels map every user-story-phase task back to spec.md's US1/US2/US3 for traceability.
- No test-writing tasks anywhere in this list — deliberate, not an oversight (see Tests note above).
- Commit after each task or logical group, per this project's established per-story commit convention.
- Stop at any checkpoint to validate a story independently before moving to the next.
