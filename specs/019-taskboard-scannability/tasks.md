# Tasks: Taskboard Scannability

**Input**: Design documents from `/specs/019-taskboard-scannability/`
**Prerequisites**: plan.md, research.md, quickstart.md (no data-model.md/contracts — no data or API surface)

**Tests**: No automated frontend test runner exists in this repo (research.md D5). Verification is via quickstart.md's live-browser scenarios, referenced from task descriptions below — no test-file tasks are generated.

**Organization**: Single file (`frontend/src/components/TaskboardView.jsx`), two independently-testable user stories per spec.md.

## Phase 1: Foundational

**Purpose**: Inspection/analysis that both user stories depend on — must complete first.

- [X] T001 Inspect existing conventions in `frontend/src/components/ui/table.jsx`, `frontend/src/components/TaskboardView.jsx` (current `PRIORITY_BADGE_CLASSES`, group header markup), and `frontend/src/pages/Retrospectives.jsx` (`SENTIMENT_BADGE_CLASSES`); confirm the component-reuse decisions already recorded in plan.md's Frontend Design Constraints and research.md D1-D3 (shared `Table` primitives reused via className override, no new component, palette drawn from existing color families) still match the current file contents before editing.

**Checkpoint**: Confirmed target file structure and reuse plan match research.md — ready to implement both stories.

---

## Phase 2: User Story 1 - Scan more tasks per screen (Priority: P1) 🎯 MVP

**Goal**: Reduce row height/padding in the Taskboard table so more rows are visible per screen, without touching the shared `Table` component or any other page.

**Independent Test**: Load a project with 15+ tasks across 3+ sprint-label groups on the Taskboard view; confirm visibly more rows fit without scrolling than before, per quickstart.md Scenario 1.

- [X] T002 [US1] In `frontend/src/components/TaskboardView.jsx`, add compact `className` overrides (reduced padding, smaller text size) to the `TableHead`, `TableCell`, and `TableRow` usages inside the group table (research.md D1) — do not modify `frontend/src/components/ui/table.jsx`.
- [X] T003 [US1] Verify all six columns' content (Task, Epic, Status, Priority badge, Points, Assignee) remains fully readable at the new density with representative long values (long task title, long assignee name) — no clipped or overlapping text (FR-003).
- [X] T004 [US1] Confirm existing interface states (loading spinner, empty-state placeholder, error message) render correctly unaffected by the density change — these live outside the table markup and are not expected to need edits, but must be visually re-checked.
- [X] T005 [US1] Run quickstart.md Scenario 1 (row density) live in the browser against a project with 15+ tasks; confirm the ~30%+ more-rows-visible outcome from spec.md SC-001.

**Checkpoint**: User Story 1 is independently complete and verifiable — Taskboard rows are denser, nothing else changed.

---

## Phase 3: User Story 2 - Tell groups apart at a glance (Priority: P2)

**Goal**: Give each sprint-label group a distinct, deterministic color accent (left-edge bar + label color) drawn from the app's existing badge-color palette.

**Independent Test**: Load a project with 3+ sprint-label groups; confirm each group's header/left edge renders a different color from a small fixed set, stable across reloads, per quickstart.md Scenario 2.

- [X] T006 [US2] In `frontend/src/components/TaskboardView.jsx`, add a `GROUP_ACCENT_CLASSES` static array constant (5 entries: emerald, amber, primary, rose, orange — research.md D2), each entry providing a `bg-*` class and a matching `text-*`/`dark:text-*` class, placed alongside the existing `PRIORITY_BADGE_CLASSES` constant. **Correction made during implementation**: the originally-planned `border-l-*` class was found non-functional — see research.md D2b.
- [X] T007 [US2] In the `groups` `useMemo` (or at render time), assign each group a color via `GROUP_ACCENT_CLASSES[index % GROUP_ACCENT_CLASSES.length]`, using the group's position in the already-ordered (Backlog-first, then alpha) list so assignment is deterministic across reloads (FR-005, FR-006).
- [X] T008 [US2] Apply the assigned accent as an absolutely-positioned `bg-*` bar (`<span className="absolute inset-y-0 left-0 w-1 {bar}" aria-hidden="true" />`) inside the group's `relative` outer container, and the assigned label-color class to the group's label `<span>` inside `CollapsibleTrigger`, without altering the existing count/point-sum badges or the `ChevronDown` icon (research.md D2b/D3).
- [X] T009 [US2] Confirm group identity is still conveyed by the text label, not color alone (existing label text is untouched), and the existing keyboard-operable `CollapsibleTrigger` button remains unaffected — no new ARIA attributes needed since no new interactive element was added.
- [X] T010 [US2] Run quickstart.md Scenario 2 (group color accents) live in Light mode against a project with 3+ sprint-label groups; confirm SC-002 (groups distinguishable by color alone). To verify FR-006's cycling behavior specifically: if the available test project has fewer than 6 sprint-label groups (more than `GROUP_ACCENT_CLASSES.length`), create enough additional tasks with distinct new `sprint_label` values to reach 6+ groups so the palette wrap-around (`index % GROUP_ACCENT_CLASSES.length`) is actually exercised and observed, rather than skipping this check.
- [X] T011 [US2] Run quickstart.md Scenario 3 (dark mode) live: toggle to Dark mode and confirm every group accent color and label remains legible against the dark background (FR-008, SC-004), then toggle back to Light and confirm no regression.

**Checkpoint**: User Story 2 is independently complete and verifiable — groups are visually distinguishable by color, deterministic, theme-aware.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Regression verification and the constitution-mandated frontend review pass.

- [X] T012 Run `npx vite build` from `frontend/` and confirm it succeeds with no new errors/warnings.
- [X] T013 Run quickstart.md Scenario 4 (no regression): visually verify Work Program's List view, Gantt view, Bug Tracker, Retrospectives, and the Kanban board are all unchanged, and that Taskboard's own status/priority badges remain in their existing outlined/tinted style (FR-002, FR-009, FR-010, SC-003).
- [X] T014 Run `git diff` and confirm only `frontend/src/components/TaskboardView.jsx` was modified — no unintended changes to `frontend/src/components/ui/*` or any other page.
- [X] T015 Perform the frontend review pass described in quickstart.md (constitution: Frontend Design and Review Governance) — compare the implementation against spec.md, the constitution, plan.md, and comparable existing pages (Bug Tracker, Retrospectives); classify any findings as Critical/Major/Minor/Suggestion.
- [X] T016 Resolve or explicitly document-and-accept any Critical or Major findings from T015 before considering this feature complete (Constitution Completion Gate).

---

## Dependencies & Execution Order

- **Phase 1 (Foundational)**: No dependencies — must complete first (confirms the plan still matches reality before any edit).
- **User Story 1 (Phase 2)**: Depends on Phase 1. Independent of User Story 2 — can ship alone as the MVP.
- **User Story 2 (Phase 3)**: Depends on Phase 1. Independent of User Story 1's *content* but touches the same file, so in practice implement sequentially after Phase 2 to avoid merge conflicts within one editing session (not a hard design dependency — order is a file-conflict-avoidance convenience, not a requirement).
- **Polish (Phase 4)**: Depends on both Phase 2 and Phase 3 being complete (regression/review checks need the final combined state of the file).

## Parallel Execution Notes

All tasks touch the same single file (`TaskboardView.jsx`) or are manual verification steps performed against it — there is no meaningful `[P]` parallelization opportunity within this feature; tasks are listed in recommended sequential order.

## Implementation Strategy

**MVP = User Story 1 only** (Phase 1 + Phase 2): ship the row-density improvement alone — it's independently valuable and testable, and delivers the higher-priority (P1) outcome (SC-001) without needing the color-accent work.

**Incremental delivery**: Phase 1 → Phase 2 (US1, MVP checkpoint) → Phase 3 (US2) → Phase 4 (Polish, required before calling the full feature complete).
