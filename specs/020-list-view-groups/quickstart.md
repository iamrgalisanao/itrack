# Quickstart: List View Groups

Validation guide for flattening Work Program's List view
(`frontend/src/pages/WorkProgram.jsx`). No backend changes, no new API
calls beyond existing ones already used elsewhere in this file.

## Prerequisites

- Frontend dev server running (`npm run dev` in `frontend/`).
- Logged in as Admin or Project Manager (needed for inline add, Sub-Activity
  management, and edit/delete visibility).
- A project with a Module that has 3+ Activities, at least one of which has
  tasks spread across 2+ Sub-Activities, and at least one Activity with zero
  Sub-Activities (to exercise the auto-provisioning path).

## Build check

```bash
cd frontend
npx vite build
```

Expected: build succeeds with no new errors/warnings attributable to
`WorkProgram.jsx`.

## Scenario 1: Flattened, color-grouped Activities (User Story 1 / FR-001–FR-003, SC-001, SC-002)

1. Open Work Program → List view → expand a Module.
2. Expand an Activity that has tasks across 2+ Sub-Activities. Confirm every
   task appears in one table immediately (no separate Sub-Activity expand
   step), each row showing its Sub-Activity name as a column.
3. With 3+ Activities visible, confirm each renders a distinct colored
   accent bar + matching label color, cycling if there are more Activities
   than palette colors (5) — create extra Activities if needed to exercise
   cycling, matching 019-taskboard-scannability's T010 remediation
   precedent (don't skip this check for lack of test data).
4. Confirm the existing Quick Status Edit (pencil, inline status/progress/
   actual-dates) and Full Edit (pencil, opens the shared modal — now also
   showing Sub-Activity) both still work exactly as before.
5. Confirm Delete still works at every level (Module, Activity,
   Sub-Activity via the new Manage Sub-Activities dialog, Task).

## Scenario 2: Inline "+ Add item" (User Story 2 / FR-008–FR-011, SC-003)

1. On an Activity that already has a Sub-Activity, use the inline add row
   at the bottom of its task table: type a name, submit. Confirm the task
   appears in the flat list within a couple seconds, attached to an
   existing Sub-Activity (not a newly-created redundant one).
2. On an Activity with zero Sub-Activities, repeat the same inline add.
   Confirm no error is shown to the user and the task appears successfully
   — open the new "Manage Sub-Activities" affordance for that Activity to
   confirm exactly one Sub-Activity now exists (auto-provisioned).
3. Log in (or switch preview) as a Client-role user. Confirm no inline add
   row is rendered on any Activity group.
4. Log in as a role that is not Admin/PM but not Client (e.g. Team Member).
   Confirm the inline add row IS shown (matches today's existing "Add Task"
   gate, `userRole !== 'Client'`) but the "Manage Sub-Activities" affordance
   is NOT shown (matches today's Admin/PM-only edit gate).

## Scenario 3: Sub-Activity management relocation (FR-007)

1. Open the new "Manage Sub-Activities" affordance on an Activity group
   header (Admin/PM only). Confirm it lists that Activity's Sub-Activities
   with working Edit/Delete, and an "Add Sub-Activity" action, all reusing
   the existing shared modal.
2. Open a task's Full Edit dialog. Confirm a Sub-Activity field is present,
   pre-populated with the task's current Sub-Activity, and that changing it
   and saving actually moves the task (reflected in the flat table on
   refresh).

## Scenario 4: No regression (FR-004, FR-006, FR-012, FR-013, SC-004, SC-005)

1. Confirm Module-level rendering, its own Edit/Delete, and rolled-up dates
   are pixel-identical to before this feature.
2. Confirm Gantt view and Taskboard view are visually and functionally
   unchanged.
3. Log in as Client. Confirm: no Responsible column, no inline add row, no
   Manage Sub-Activities affordance, no Edit/Delete icons — every existing
   Client restriction holds, just within the new flattened layout.
4. Run `git diff` / `git status` and confirm only
   `frontend/src/pages/WorkProgram.jsx` was modified.

## Frontend review pass (Constitution: Frontend Design and Review
Governance — required before this feature is considered complete)

Compare the implementation against spec.md, the constitution, plan.md, and
comparable existing pages/patterns (`TaskboardView.jsx`, and List view's own
pre-existing conventions). Classify findings as
Critical/Major/Minor/Suggestion. Specifically check:

- Does the new parallel-fetch-on-expand (D1) introduce a visible loading
  gap or layout jump for Activities with several Sub-Activities?
- Does the inline add row's success/failure feedback match the quality of
  feedback elsewhere in this file (e.g. does a failed inline add silently
  do nothing, or does it need an error state)?
- Is the "Manage Sub-Activities" affordance discoverable without being
  visually heavier than the group header it lives in?
- Does the new Sub-Activity `<select>` in the Full Edit modal follow the
  same field styling as every other field in that same modal?
- Unintended changes: does `git diff` touch anything outside
  `frontend/src/pages/WorkProgram.jsx`?

Any Critical or Major finding must be resolved or explicitly documented and
accepted before this feature is reported complete.
