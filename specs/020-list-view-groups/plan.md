# Implementation Plan: List View Groups

**Branch**: `020-list-view-groups` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-list-view-groups/spec.md`

## Summary

Flatten Work Program's List view by one full nesting level: inside each
Module, render Activities as Taskboard-styled collapsible, color-accented
groups, each showing a single flat table of that Activity's tasks (merged
across all of its Sub-Activities) instead of requiring a separate
Sub-Activity expand step. Sub-Activity becomes a column on the task row.
Add an inline "+ Add item" row per Activity group for fast task creation,
with automatic Sub-Activity provisioning when none exists yet. Frontend-only
change to `frontend/src/pages/WorkProgram.jsx`; no backend/API changes.

## Technical Context

**Language/Version**: JavaScript (ES2022+), React 19.2.6, no TypeScript
(confirmed in 019-taskboard-scannability's plan; unchanged since).

**Primary Dependencies**: Vite 8, Tailwind CSS v4.3.1, Radix UI primitives
(`@radix-ui/react-collapsible`, already used by `TaskboardView.jsx` and
importable into `WorkProgram.jsx`), `lucide-react` icons.

**Storage**: N/A — no schema, migration, or API contract changes. This
feature reuses existing endpoints (`fetchSubActivities`,
`fetchDetailedActivities`, `createSubActivity`, `createDetailedActivity`,
`updateDetailedActivity`, `deleteSubActivity`, `deleteDetailedActivity`)
exactly as `frontend/src/lib/api.js` already exposes them.

**Testing**: No frontend automated test runner installed in this repo (same
finding as 019-taskboard-scannability's research.md D5). Verification via
quickstart.md's live-browser scenarios.

**Target Platform**: Web (existing app targets).

**Project Type**: Web application (`backend/` + `frontend/`) — this feature
touches `frontend/` only, specifically one file.

**Performance Goals**: Activity expand must remain responsive when eagerly
fetching multiple Sub-Activities' task lists in parallel (see Coding-Standard
Constraints) — no perceptible added latency for the common case of a
handful of Sub-Activities per Activity.

**Constraints**: Must not change Module-level rendering/CRUD/rollups
(FR-004), Gantt view, Taskboard view, or any other page (FR-013). Must not
add row checkboxes or bulk actions (FR-011, Assumptions). Must not weaken
any existing Client-role visibility rule (FR-012).

**Scale/Scope**: Single file (`frontend/src/pages/WorkProgram.jsx`); no new
files, no new dependencies beyond an already-installed one
(`@radix-ui/react-collapsible`, not yet imported in this file today).

### Coding-Standard Constraints

Per `.claude/skills/react-vite-best-practices` /
`.claude/skills/typescript-react-patterns` (applied prospectively, plain-JS
equivalents):

- **Data-fetching change, stated explicitly**: today, `toggleActivity`
  fetches only that Activity's Sub-Activities (`fetchSubActivities`); each
  Sub-Activity's tasks are fetched lazily, one at a time, only when a user
  separately expands that Sub-Activity (`toggleSubActivity`,
  `fetchDetailedActivities`). Since Sub-Activity is no longer a
  user-triggered expand step, `toggleActivity` must, on first expand, fetch
  that Activity's Sub-Activities AND immediately fetch every one of those
  Sub-Activities' tasks in parallel (`Promise.all`), merging the results
  into one flat array for that Activity before rendering its group table.
  This is the one real behavior change beyond styling — call it out in code
  as such, not silently bundled into the render logic.
- **Cache-staleness fix, scoped to this view's own pre-existing pattern**:
  `reloadModules()` (used after every create/edit/delete today) only
  refetches the top-level `modules` array — it does not invalidate the
  `activities`/`subActivities`/`detailedActivities` caches, which is why
  those dictionaries only refresh when a key is entirely absent. This
  feature's new "flattened task list per Activity" needs its own explicit
  refresh call after inline-add success (and should reuse it for
  edit/delete success reached from this flattened view, replacing reliance
  on the stale-until-collapsed cache) — a small `refreshActivityTasks(moduleId, activityId)`
  helper that re-runs the same fetch-and-merge described above and replaces
  that Activity's cached entry.
- No new component extraction beyond what's needed: the flattened
  Activity-group rendering and the inline add row are implemented directly
  in `WorkProgram.jsx`'s existing List view branch, matching how this file
  already implements every other level inline (no per-level sub-components
  exist today) — introducing one now would be an inconsistent pattern for
  a single-file, single-page feature.
- Reuse `TaskboardView.jsx`'s `GROUP_ACCENT_CLASSES` shape exactly
  (including the `bg-*` bar approach, not `border-l-*`, per
  019-taskboard-scannability's research.md D2b finding that `border-l-*`
  color utilities are inert app-wide due to a global `index.css` reset) —
  either import the array from `TaskboardView.jsx` or duplicate the
  5-entry constant (matching this codebase's established preference for
  small duplication over cross-component coupling at two call sites, per
  018-taskboard's own precedent of duplicating small helpers rather than
  extracting shared utilities for two usages).

Per `.claude/skills/code-slop`: no speculative bulk-action scaffolding
(checkboxes, selection state) since none is wired up (FR-011); no
configurable/pluggable column system since columns are fixed (Assumptions).

### Frontend Design Constraints

*(Constitution: Frontend Design and Review Governance — this is a
substantial change to an existing, heavily-used page.)*

**Existing patterns inspected and reused**:
- `TaskboardView.jsx`'s grouped-table pattern (`Collapsible` +
  `CollapsibleTrigger` + `CollapsibleContent` + dense `Table`, plus
  `GROUP_ACCENT_CLASSES`) is the direct visual precedent — reused for the
  Activity-group layer here, in place of `WorkProgram.jsx`'s current nested
  `Card`/`CardHeader`/`CardContent` for Activity and Sub-Activity.
- Module-level `Card` rendering (lines ~1419–1496) is entirely unchanged and
  untouched — it is the outer container this feature nests inside of.
- Existing task-row cell rendering (Status badge/select, Progress bar/input,
  responsible column with Client-hiding, Plan/Actual date formatting,
  "Shared with Client" badge, Quick Status Edit + Full Edit + Delete icon
  buttons) is reused verbatim — only the row's data source changes (merged
  across Sub-Activities instead of one Sub-Activity at a time), plus one
  new Sub-Activity column.
- The existing shared create/edit modal (`openFormModal`/`handleSubmit`,
  lines 841–946, dialog at 2450–2685) is reused and extended with a
  Sub-Activity field for the `task` level (new `<select>` populated from
  that Activity's already-fetched Sub-Activities) — not replaced with a new
  modal.
- Existing role-gating conventions are reused exactly as today:
  `userRole !== 'Client'` gates task-mutating controls (matches today's
  "Add Task" button gate, line 1627); `['Admin','Project Manager'].includes(userRole)`
  gates edit/delete icons (matches today's per-level gates).

**Visual direction**: Denser, color-grouped layout consistent with
Taskboard — not a new aesthetic, a convergence of two existing patterns in
the same app onto one shared visual language.

**Page/component hierarchy**: `WorkProgram` → Module `Card` (unchanged) →
Activity group (`Collapsible`, new) → flat `Table` of that Activity's tasks
(existing `TableRow`/`TableCell` rendering, extended with a Sub-Activity
column) → inline add row (new, bottom of `TableBody`) → existing shared
modal (extended).

**Interface states applicable**:
- *Loading*: the parallel Sub-Activity+task fetch on Activity expand needs
  its own loading indicator (today's Sub-Activity level has no loading
  state of its own since it was a single small fetch — this feature's
  fetch is larger, so a lightweight inline spinner in the group body while
  the merge is in flight is a new, small addition).
- *Empty*: an Activity with zero tasks — group renders with an empty-state
  row/message plus (for permitted roles) the inline add entry point.
- *Error*: fetch failure reuses the existing `err.response?.status === 403`
  → `setAccessDenied` pattern already used by `toggleModule`/`toggleActivity`.
- *Validation*: inline add with an empty name — no-op (mirrors existing
  `handleCreate` guard pattern in `TaskboardView.jsx`).
- *Disabled*: N/A — no new disabled-affordance surface.
- *Success*: new task appears in the flat table immediately after the
  refresh helper re-runs (FR-008/SC-003).
- *Permission-denied*: inline add and the Sub-Activity-management
  affordance are not rendered at all for Client (and, for the latter, for
  any non-Admin/PM role) — matches FR-011 and today's existing gating.

**Responsive behavior**: No new breakpoints — the existing `Table`'s
`overflow-auto` wrapper (from `ui/table.jsx`) continues to handle narrow
viewports, same as it does today and as confirmed for `TaskboardView.jsx`
in 019-taskboard-scannability.

**Accessibility**: `Collapsible`/`CollapsibleTrigger` reused from
`TaskboardView.jsx`'s already-verified keyboard-operable pattern
(button + `ChevronDown`, `aria-expanded` — matching the existing
`toggleModule`/`toggleActivity` `role="button"`/`aria-expanded`/`onKeyDown`
convention already present in this exact file, so no new keyboard-handling
code needs to be invented). Group color accent bar gets `aria-hidden="true"`
and `pointer-events-none`, matching the fix already applied in
019-taskboard-scannability (a decorative absolutely-positioned bar without
`pointer-events-none` was found to intercept clicks on the interactive
content beneath it).

**No parallel design system introduced**: color palette, dense-table
classNames, and the collapsible-group interaction pattern are all reused
directly from `TaskboardView.jsx`, not reinvented.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Fail-Closed Access Control)**: No new access-control
  surface — reuses existing role gates and the existing 403→AccessDenied
  handling verbatim at every new fetch call site. PASS.
- **Principle II (Consistent API Contracts)**: No API changes — reuses
  existing endpoints as-is. PASS.
- **Principle III (Test Coverage Grows With the Feature)**: No frontend
  test runner exists in this repo (established precedent, 019's research.md
  D5); verification via quickstart.md. PASS (no regression — nothing
  testable to regress).
- **Principle IV (Audit Sensitive Mutations)**: No new mutation types —
  inline add calls the same `createSubActivity`/`createDetailedActivity`
  endpoints already covered by existing backend audit logging (if any) for
  those actions; no new audit surface introduced client-side. PASS.
- **Principle V (Small, Additive, Reversible Migrations)**: N/A — no
  migrations. PASS.
- **Principle VI (Real Auth Is the Only Forward Path)**: Not touched. PASS.
- **Principle VII (Installed Coding-Standard Skills Govern
  Implementation)**: Addressed above. PASS.
- **Principle VIII (Definition-of-Done Gate)**: Addressed via
  quickstart.md. PASS.
- **Frontend Design and Review Governance**: Addressed above under
  "Frontend Design Constraints"; quickstart.md includes the required
  frontend review pass. PASS.

No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/020-list-view-groups/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md         # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — not this command)
```

No `data-model.md` or `contracts/` — no new/changed data entities, no new
API surface (spec.md's Key Entities section confirms this explicitly).

### Source Code (repository root)

```text
frontend/
└── src/
    └── pages/
        └── WorkProgram.jsx   # ONLY file modified by this feature
```

**Structure Decision**: Existing web-application structure unchanged. This
feature is scoped to the List view branch of one existing page component;
no new files, no new directories.

## Complexity Tracking

*(Not applicable — no Constitution Check violations.)*
