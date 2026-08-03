# Implementation Plan: Taskboard Scannability

**Branch**: `019-taskboard-scannability` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-taskboard-scannability/spec.md`

## Summary

Tighten row density and add per-group color accents to the already-shipped
Taskboard grouped-table view (`frontend/src/components/TaskboardView.jsx`),
so a PM/Admin can scan more tasks per screen and tell sprint-label groups
apart at a glance — a frontend design-quality pass on existing markup, not a
new feature or data model change. No backend, API, or shared-component
changes.

## Technical Context

**Language/Version**: JavaScript (ES2022+), React 19.2.6, no TypeScript in
this repo (confirmed via `frontend/package.json` — `.jsx` files, `@types/*`
present only for editor IntelliSense, no `typescript` dependency).

**Primary Dependencies**: Vite 8, Tailwind CSS v4.3.1 (`@tailwindcss/vite`),
Radix UI primitives (`@radix-ui/react-collapsible` — already used by
`TaskboardView.jsx`), `class-variance-authority`/`clsx`/`tailwind-merge`
(via `cn()` in `frontend/src/lib/utils.js`), `lucide-react` icons.

**Storage**: N/A — no data model, API, or persistence changes.

**Testing**: No frontend automated test runner is installed in this repo
(no Vitest/Jest/RTL in `package.json`); this codebase's established
pattern for frontend feature verification is manual/live-browser
verification (Playwright driven ad hoc via `npx playwright`, as used for
018-taskboard), not committed test files. This feature follows the same
pattern — no new test files, verification via quickstart.md's live steps.

**Target Platform**: Web (desktop-first responsive, existing app targets).

**Project Type**: Web application (existing `backend/` + `frontend/`
structure) — this feature touches `frontend/` only.

**Performance Goals**: N/A beyond "no perceptible regression" — this is a
CSS/markup density change, not a data-volume or rendering-algorithm change.

**Constraints**: Must not modify `frontend/src/components/ui/table.jsx` (or
any other shared `ui/` component) since Bug Tracker, Retrospectives,
Kanban, and other pages depend on its current spacing. Must not modify
List view, Gantt view, or any page other than `TaskboardView.jsx`.

**Scale/Scope**: Single file (`TaskboardView.jsx`); no new files, no new
dependencies.

### Coding-Standard Constraints

Per `.claude/skills/react-vite-best-practices` and
`.claude/skills/typescript-react-patterns` (applied prospectively — repo is
JS, not TS, so these translate to plain-JS equivalents):

- Keep the density/accent logic as plain derived values inside the existing
  functional component — no new component extraction is justified for a
  ~10-line palette lookup + className changes (avoids the "unnecessary
  abstraction / component fragmentation" anti-pattern called out in the
  constitution's Design Quality Standards).
- The group color palette must be a static, top-of-file constant (mirroring
  the existing `PRIORITY_BADGE_CLASSES` pattern in the same file), not
  computed inline per render — consistent with how this file already
  defines `PRIORITY_BADGE_CLASSES`.
- Continue using Tailwind utility classes via the existing `cn()`-free
  direct-className style already used throughout this file (it does not use
  `cn()` for static combinations) — no new styling abstraction introduced.
- No new prop types/interfaces needed — `TaskboardView`'s existing props
  (`project`, `modules`, `userRole`) are untouched; this is an internal
  rendering change only.

Per `.claude/skills/code-slop`: no defensive code for scenarios that can't
occur (e.g., no need to guard against a negative group index — `Array`
index is always ≥0), no speculative configurability (palette size is fixed
at what's actually used, not made externally configurable "for future
flexibility").

### Frontend Design Constraints

*(Constitution: Frontend Design and Review Governance — this is a
substantial visual change to an existing interface, so the workflow applies
even though scope is intentionally narrow.)*

**Existing patterns inspected and reused**:
- `frontend/src/components/ui/table.jsx` — the shared `Table`/`TableRow`/
  `TableCell` primitives are reused as-is; only per-instance `className`
  overrides are added within `TaskboardView.jsx`, not changes to the shared
  component itself (required by FR-002/FR-009 and the constitution's
  "Existing Design System First").
- `frontend/src/components/ui/collapsible.jsx` and the existing group
  header markup (`CollapsibleTrigger` button, `bg-muted/30` bar) — reused;
  only a `border-l-*` accent and label `text-*` color are added, the
  existing structure/interaction (click-to-collapse, `ChevronDown`,
  count/point-sum badges) is untouched.
- Color palette: reuses the exact color families already established for
  the same semantic purpose (status/priority chips) in this codebase —
  `PRIORITY_BADGE_CLASSES` in this same file (red/orange/amber/emerald) and
  `SENTIMENT_BADGE_CLASSES` in `frontend/src/pages/Retrospectives.jsx`
  (emerald/amber/primary). No new colors are introduced; the group-accent
  palette is assembled from this existing set plus the app's `primary`
  token, keeping a single coherent visual language app-wide.
- Dark mode: reuses the existing `.dark` token system in
  `frontend/src/index.css` and the existing dark-variant pattern already
  used by `PRIORITY_BADGE_CLASSES` (`dark:text-*-400`) — no new dark-mode
  infrastructure.

**Visual direction**: No change to the page's overall visual direction —
this is a density/scannability refinement of the existing Taskboard
aesthetic (already dark-mode-aware, already using outlined/tinted badges),
not a new design language.

**Page/component hierarchy**: Unchanged — `TaskboardView` → `Collapsible`
group → `Table` → rows. Only className-level changes within this existing
hierarchy.

**Interface states applicable**: Loading, empty, and error states
(`loading`, `tasks.length === 0`, `error`) already exist in
`TaskboardView.jsx` and are unaffected by this change — no new states are
introduced by a pure density/color change. Permission-denied state (Client
role has no Taskboard access at all) is pre-existing and unaffected.

**Responsive behavior**: The existing `Table`'s wrapping `overflow-auto`
container (from `ui/table.jsx`) already handles horizontal scroll on
narrow viewports; this feature does not change that behavior — row density
reduction, if anything, slightly improves narrow-viewport usability by
showing more rows before requiring scroll. No new responsive breakpoints
needed.

**Accessibility**: No change to semantic structure (`<table>`, `<thead>`,
`<tbody>`, existing `CollapsibleTrigger` button with `ChevronDown` remains
the keyboard-operable expand/collapse control). The new color accent is
supplementary (a `border-l-*` bar + label color) alongside the existing
text label — group identity is never conveyed by color alone, satisfying
color-contrast/color-only-signifier concerns without additional ARIA work.

**No parallel design system introduced**: palette is drawn entirely from
colors already in use for the same semantic role elsewhere in the app (see
above) — this is the documented justification required when a plan touches
color, per "Existing Design System First."

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Fail-Closed Access Control)**: N/A — no access-control
  surface is touched; existing Client-denial behavior for Taskboard is
  unchanged. PASS.
- **Principle II (Consistent API Contracts)**: N/A — no API changes. PASS.
- **Principle III (Test Coverage Grows With the Feature)**: This repo has
  no frontend automated test runner; per established precedent (018-taskboard
  frontend work), verification is via quickstart.md's live-browser steps,
  not new test files. PASS (no test-coverage regression — no testable
  frontend framework exists to regress).
- **Principle IV (Audit Sensitive Mutations)**: N/A — no mutations, this is
  presentation-only. PASS.
- **Principle V (Small, Additive, Reversible Migrations)**: N/A — no
  migrations. PASS.
- **Principle VI (Real Auth Is the Only Forward Path)**: N/A — not touched.
  PASS.
- **Principle VII (Installed Coding-Standard Skills Govern
  Implementation)**: Addressed above under "Coding-Standard Constraints."
  PASS.
- **Principle VIII (Definition-of-Done Gate)**: Addressed via
  quickstart.md's validation steps (build check + live verification in
  both themes + regression check on other pages). PASS.
- **Frontend Design and Review Governance**: Addressed above under
  "Frontend Design Constraints"; quickstart.md includes the required
  frontend review pass with Critical/Major/Minor/Suggestion classification
  before this feature is considered complete. PASS.

No violations requiring justification — Complexity Tracking section is
omitted (not applicable).

## Project Structure

### Documentation (this feature)

```text
specs/019-taskboard-scannability/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `data-model.md` or `contracts/` — this feature introduces no data
entities and no API surface (confirmed in spec.md's Key Entities section).

### Source Code (repository root)

```text
frontend/
└── src/
    └── components/
        └── TaskboardView.jsx   # ONLY file modified by this feature
```

**Structure Decision**: Existing web-application structure
(`backend/` + `frontend/`) is unchanged. This feature is scoped to a single
existing file within `frontend/src/components/`; no new directories, no new
files, no changes anywhere under `backend/`.

## Complexity Tracking

*(Not applicable — no Constitution Check violations.)*
