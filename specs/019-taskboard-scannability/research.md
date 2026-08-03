# Research: Taskboard Scannability

No `[NEEDS CLARIFICATION]` markers exist in spec.md's Technical Context —
this section documents the concrete decisions made while translating the
spec's outcome-focused requirements into an implementation approach, plus
the findings from inspecting the existing codebase per the constitution's
Frontend Design and Review Governance.

## D1: Row density mechanism

**Decision**: Override `TableCell`/`TableRow`/`TableHead` padding and text
size locally via `className` props passed into the shared components from
within `TaskboardView.jsx` (e.g. `<TableCell className="py-1.5 text-xs">`),
rather than modifying `frontend/src/components/ui/table.jsx`'s defaults.

**Rationale**: `ui/table.jsx`'s `TableCell` (`p-4`) and `TableHead`
(`h-12 px-4`) use `cn(...)` internally, which merges caller-supplied
`className` overrides via `tailwind-merge` — the existing shared-component
API already supports per-instance density overrides without any change to
the shared file. This satisfies FR-002 (other pages using the same shared
component must be visually unaffected) for free, since Bug Tracker,
Retrospectives, and Kanban don't pass these override classes.

**Alternatives considered**: Modifying `ui/table.jsx`'s defaults directly —
rejected because it would change every table in the app (Bug Tracker,
Retrospectives, Kanban), violating FR-002/FR-010 and the constitution's
"avoid unintended changes outside approved scope."

## D2: Group accent color palette

**Decision**: A 5-entry static palette object at the top of
`TaskboardView.jsx` (alongside the existing `PRIORITY_BADGE_CLASSES`
constant), each entry providing a `border-l-*` class (for the group
container's left edge) and a matching `text-*`/`dark:text-*` class (for the
group label), assigned via `paletteIndex = groupIndex % palette.length`.
Colors: emerald, amber, primary (blue), rose/red, orange — the same five
color families already in use across `PRIORITY_BADGE_CLASSES` (this file)
and `SENTIMENT_BADGE_CLASSES` (`Retrospectives.jsx`), each already paired
with a `dark:*-400` variant for dark-mode legibility.

**Rationale**: Directly satisfies FR-007 (palette must be drawn from
existing badge-color conventions) and the constitution's "Existing Design
System First" — no new color values enter the codebase. Assigning by
`groupIndex % length` (rather than by hashing the label string) satisfies
FR-005 (deterministic, stable across reloads) simply, since group order is
already deterministic (Backlog first, then alpha) per the existing
`groups` `useMemo` in `TaskboardView.jsx` — same input tasks always produce
the same ordered group list, so the same index always maps to the same
color.

**Alternatives considered**: Hashing the group label string to a color —
rejected as unnecessary complexity (violates `code-slop` guidance against
speculative generality) when the existing array index is already stable
and simpler. A larger, all-new color palette — rejected, would violate
"Existing Design System First" (FR-007).

## D2b: Correction discovered during implementation — border-l-{color}
utilities render inert app-wide

**Finding**: The originally-planned `border-l-{color}` approach (D2/D3's
initial decision) does not render. `frontend/src/index.css` defines a
global, **unlayered** rule:

```css
* {
  border-color: var(--color-border);
}
```

This rule sits outside any `@layer` block. Per the CSS Cascade Layers
specification, unlayered styles always take precedence over any styles
declared inside `@layer` blocks — and Tailwind emits all of its utility
classes (including every `border-*-color` utility) inside `@layer
utilities`. As a result, no Tailwind border-color utility of any kind
(`border-emerald-500`, `border-l-emerald-500`, `border-t-emerald-500`,
etc.) can ever override this app-wide reset, regardless of specificity or
source order — confirmed via live inspection of `document.styleSheets` in
the running app (the `.border-l-emerald-500` rule matched the element and
was present in the stylesheet, yet `getComputedStyle(...).borderLeftColor`
still resolved to the reset's gray, not the intended color).

**Corrected decision**: Render the accent as a `background-color` bar
instead of a `border-left-color`. A `<span>` absolutely positioned inside a
`relative` group container (`absolute inset-y-0 left-0 w-1 bg-*-500`)
achieves the same "colored left-edge accent" visual, using a Tailwind
`background-color` utility — a property the global reset does not touch —
so it renders correctly with no changes needed outside
`TaskboardView.jsx`. `GROUP_ACCENT_CLASSES` entries were changed from
`{ border: 'border-l-*' , label: ... }` to `{ bar: 'bg-*-500', label: ... }`
accordingly.

**Scope impact**: None — this is a within-file implementation correction.
It does not touch `index.css`, does not change any other page (that global
reset is pre-existing and applies app-wide regardless of this feature), and
does not change the plan's constraints (still Tailwind-utility-only, still
no shared-component changes, still scoped to `TaskboardView.jsx`).
Disclosed here rather than silently reconciled, per this project's
established practice (see 018-taskboard's disclosed gate-citation
inaccuracy) of surfacing implementation-time discoveries that differ from
what was approved in planning, even when the end result still satisfies
the same functional requirements.

## D3: Applying the accent without competing with existing badges

**Decision**: The accent is a colored background bar (see D2b) on the
group's outer container div (the one currently styled `rounded-xl border
border-border/60`) plus a `text-*` color on the group label `<span>`
inside `CollapsibleTrigger`. Task-level priority `Badge` components inside
the table rows are untouched.

**Rationale**: Keeps the new color signal spatially and semantically
distinct from the existing per-row priority badges (edge accent identifies
the *group*; the badge identifies a *task's* priority) — addresses the
spec's edge case about the two not being visually confused, and requires
no change to `PRIORITY_BADGE_CLASSES` or badge rendering logic (FR-009).

## D4: Verifying dark mode is not assumed

**Finding**: `TaskboardView.jsx` already uses only semantic Tailwind
tokens (`bg-muted/30`, `border-border/60`, `text-muted-foreground`) with no
hardcoded hex/RGB colors, and `PRIORITY_BADGE_CLASSES` (the direct
precedent for the new palette) already ships `dark:text-*-400` variants
alongside its light-mode `text-*-700`. The new palette follows the exact
same pattern. This is a low-risk area, but per FR-008/SC-004 it is still
verified live in quickstart.md rather than assumed correct — no code
changes are anticipated from this verification step; it exists to catch
the unexpected.

## D5: No test-file changes

**Finding**: `frontend/package.json` has no test runner installed
(`vitest`/`jest`/`@testing-library/*` absent from `devDependencies`). This
codebase's established precedent (018-taskboard's frontend deliverables)
verifies frontend changes via live Playwright-driven browser checks
documented in `quickstart.md`, not committed test files. This feature
follows the same precedent — `laravel-testing`/`laravel-owasp-security`
skill guidance does not apply here since there is no backend/API surface in
this feature.
