# Quickstart: Taskboard Scannability

Validation guide for the row-density and group-accent changes to
`frontend/src/components/TaskboardView.jsx`. No backend changes, no new
API calls, no database seeding beyond what 018-taskboard's verification
already used.

## Prerequisites

- Frontend dev server running (`npm run dev` in `frontend/`).
- Logged in as a Project Manager or Admin (required to see/create
  Taskboard tasks; Team Member/Department Head can view but not create).
- A project with 3+ Taskboard tasks spread across at least 2 distinct
  `sprint_label` values plus at least one unlabeled ("Backlog") task —
  reuse the seed data from 018-taskboard's own verification if still
  present, or create a few tasks via the Taskboard "New Task" dialog.

## Build check

```bash
cd frontend
npx vite build
```

Expected: build succeeds with no new errors/warnings attributable to
`TaskboardView.jsx`.

## Scenario 1: Row density (User Story 1 / FR-001, FR-003, SC-001)

1. Open Work Program → select the project → switch to the **Taskboard**
   view.
2. Note how many task rows are visible in a single sprint-label group
   without scrolling, at a normal browser window height (~900px).
3. Confirm rows are visibly more compact than the pre-change baseline —
   roughly 30%+ more rows visible in the same space (SC-001).
4. Confirm every cell's content (task title, epic name, status, priority
   badge, points, assignee) is still fully readable — no clipped or
   overlapping text (FR-003).

## Scenario 2: Group color accents (User Story 2 / FR-004-FR-006, SC-002)

1. On the same Taskboard view, with 3+ sprint-label groups visible,
   confirm each group's header/left-edge shows a distinct color, and the
   group label text is tinted to match.
2. Reload the page. Confirm each group shows the *same* color as before
   the reload (FR-005).
3. Ensure the test project has 6+ sprint-label groups (more than the
   5-color palette) — create additional tasks with new `sprint_label`
   values if the current test data doesn't already have this many.
   Confirm colors repeat/cycle (the 6th group matches the 1st group's
   color) rather than any group rendering unstyled or the page erroring
   (FR-006). Do not skip this check for lack of test data.
4. Glance at the page without reading text — confirm groups are
   distinguishable by color alone (SC-002).

## Scenario 3: Dark mode verification (FR-008, SC-004)

1. Toggle the app's existing Light/Dark control (sidebar) to Dark.
2. Re-view the Taskboard with the same groups from Scenario 2.
3. Confirm every group accent color and label remains legible (sufficient
   contrast) against the dark background, and no text becomes unreadable.
4. Toggle back to Light and confirm no regression there either.

## Scenario 4: No regression on other pages (FR-002, FR-009, FR-010, SC-003)

1. Open Work Program's **List** view for the same project — confirm row
   spacing looks exactly as it did before this feature.
2. Open Work Program's **Gantt** view — confirm no visual change.
3. Open **Bug Tracker** and **Retrospectives** (both use the shared
   `Table` component and the outlined/tinted badge convention) — confirm
   their row spacing and badge styling are unchanged.
4. Open the **Kanban** board — confirm no visual change.
5. Confirm the Taskboard's own status/priority badges are still rendered
   in the existing outlined/tinted style (not solid fill) — this feature
   does not touch `PRIORITY_BADGE_CLASSES` or badge rendering (FR-009).

## Frontend review pass (Constitution: Frontend Design and Review
Governance — required before this feature is considered complete)

After implementation, compare the result against: this spec, the project
constitution, this plan, and comparable existing pages/components
(Bug Tracker, Retrospectives). Classify any findings as
Critical/Major/Minor/Suggestion. Specifically check:

- Visual hierarchy: does the new accent color compete with or overpower
  the existing priority badges, task title, or status text?
- Component reuse/duplication: did the change avoid introducing a new
  component, new styling abstraction, or a new color not already used
  elsewhere in the app?
- Layout consistency: do the denser rows still align cleanly within the
  existing `Collapsible`/`Table` structure (no overlapping borders, no
  broken hover states)?
- Accessibility: is group identity still conveyed by text (not color
  alone)? Is the existing keyboard-operable collapse/expand trigger
  unaffected?
- Unintended changes: does `git diff` touch anything outside
  `frontend/src/components/TaskboardView.jsx`?

Any Critical or Major finding must be resolved or explicitly documented
and accepted before this feature is reported complete (Constitution
Completion Gate).
