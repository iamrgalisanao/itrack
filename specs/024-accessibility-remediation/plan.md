# Implementation Plan: Accessibility Remediation — Timeline, Status Colour, and Chart Honesty

**Branch**: `024-accessibility-remediation` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

## Summary

Five user stories closing issue #8 and issue #12. The work is a frontend change with one
already-shipped backend prerequisite (PR #26). Two specialists were routed at planning time and both
changed the approach materially — the Gantt disclosure is *not* a tooltip, and the Reports chart is
rotated 90° rather than repaired in place.

## Technical Context

**Detected stack** (read, not assumed): Laravel **13.8** / PHP **8.3** (`backend/composer.json`);
React **19.2.6**, Vite **8.0.12**, Tailwind **4.3.1** (`frontend/package.json`). **No TypeScript** —
zero `.ts`/`.tsx` files under `frontend/src`, so `typescript-react-patterns` applies prospectively
only and nothing in this feature introduces TS.

**Backend surface**: none. This feature ships no PHP. The one backend defect it uncovered
(`responsible`/`support` reaching Clients at three planning levels) was severed into **PR #26** and
merged separately, because a live disclosure must not wait on an accessibility feature.

**Testing reality that shapes every decision below**: the frontend has **no test runner**. CI runs
`npm run build` and `npm run lint` only (`.github/workflows/ci.yml`). The automated surface available
to this feature is therefore exactly three things — `scripts/verify-contrast.py` (static token
ratios), `scripts/verify-cascade.py` (browser-backed computed style, Playwright, runs in CI), and
`node --test`, which needs no new dependency. Anything asserted outside those three is a manual step
and must be written into tasks.md as one.

### Standards framing

Most of this feature is **WCAG 2.1 AA**. 1.4.11 (Non-text Contrast) and 1.4.13 (Content on Hover or
Focus) **do not exist in WCAG 2.0**, and Section 508's legal baseline is WCAG 2.0 AA — so **User
Story 4 is not 508-binding**. Inside the 508 floor: 2.1.1 Keyboard (A), 2.4.3 Focus Order (A), 2.4.7
Focus Visible (AA), 4.1.2 Name/Role/Value (A), 1.3.1 (A), 1.4.1 Use of Color (A) — that is Story 1
and Story 2's text-alternative half. If any client is a US state or local government body, ADA
Title II binds WCAG 2.1 AA and Story 4 becomes binding through *that* statute, not 508.

Recorded because this is the sentence that gets copied into an ACR wrong.

### Specialist Routing

| Specialist | Dispatched | What it changed |
|---|---|---|
| **Section 508 Accessibility Specialist** | **At planning**, before any code | Rejected the Radix `Tooltip` approach; rejected `role="grid"`; found the in-file "correct pattern" I intended to copy is itself a defect; found an unnamed button three lines from the target; **found the backend disclosure that became PR #26** |
| **Data Visualization Engineer** | **At planning** | Rotated the chart 90°; replaced max-normalisation with share-of-total; overturned two of my premises about the chart's domain and layout |
| Identity & Access Engineer | **Not dispatched** — recorded as an exception | The one authorization surface this feature touches (FR-007) is a *frontend re-rendering of already-fetched data*, not an endpoint or policy change. The backend half was severed into PR #26 and reviewed by the Software Architect there. If FR-007's implementation grows a server-side component, route one. |
| Database Optimizer, DevOps Automator | Not applicable | No query, index, migration, or CI-gating change beyond adding assertions to two existing gates |

Routing was by **the surface the diff touches**, per constitution. That rule exists because 021–023
each read as design-token work and consequently never routed a 508 specialist; this time routing at
planning is what surfaced PR #26, which review-time routing could not have prevented.

### Coding-Standard Constraints

From `react-vite-best-practices` and `code-slop`, as they bind *this* feature:

- **Pure functions in `frontend/src/lib/`, not JSX, for anything that must be tested.** There is no
  component test runner. `buildGanttBarLabel`, `buildGanttBarDescription` and `canSeeContributor` go
  in `frontend/src/lib/ganttA11y.js` specifically so `node --test` can assert them. A formatter
  embedded in `WorkProgram.jsx` is, in this repository, untestable.
- **No new state per row.** The timeline renders ~50 rows through two `.map()` calls. Scenario 4
  (Escape dismisses) must be one `dismissedRowId` on the pane, never a `useState` inside the map.
- **Token names, never colour literals**, in any module the contrast gate parses — the defect 023
  closed and 022 before it.
- **Reuse the existing primitives**: `frontend/src/components/ui/` Radix wrappers, `ganttPalette.js`'s
  `fill`/`ink` pairs, `taskStatus.js`'s `STATUS_ORDER` and `STATUS_SEGMENT_LABELS`. `frontend-design`'s
  reuse floor applies; where this plan departs from it (the chart's form, and *not* reusing
  `GroupSegmentBar` for the chart) the reason is recorded in research.md, not left implicit.
- **`code-slop`**: no defensive wrapper around a value the type system already guarantees, no
  mock-heavy test, and no comment restating the line beneath it. Comments in this feature earn their
  place by recording *why a rejected alternative was rejected* — that is the pattern the last nine PRs
  established and the reason the `!` escapes and the `ring`→`outline` swap were correctly reverted.

### Frontend Design Constraints

**Reused, not invented**: `ganttPalette.js` (`GANTT_STATUS_TOKENS` fill/ink pairs, already AA-gated),
`taskStatus.js` (`STATUS_ORDER`, `STATUS_SEGMENT_LABELS`), the `--popover-border` token (already at
the 3.0 tier), the `Edit` button at `WorkProgram.jsx:2513` as the in-file model for a named control,
and `index.css`'s forced-colors block.

**Deliberately not reused**: `components/ui/tooltip.jsx` for the Gantt card (see research.md R2), and
`GroupSegmentBar` for the Reports chart (see research.md R6). Both are the answer the reuse floor
pushes toward and both are wrong here for structural reasons, so both are recorded as decisions.

**Visual direction**: unchanged. This feature adds no new visual language. Every colour it uses is an
existing semantic token; the only new *visual* elements are a 1–2 character glyph inside segment
bars, a text legend beneath them, and a printed count column in the chart.

**Interface states this feature must handle**: empty (zero-task project — currently renders an
ambiguous flat rail), single-status project, permission-denied (Client, for the contributor field),
focused, and forced-colors. Loading and error states are unchanged and out of scope.

**Responsive**: the chart's rotation removes a `grid-cols-3 sm:grid-cols-6` that wraps at **four**
statuses on mobile — the common case, not an edge case. The rotated form has no column count to
exceed.

## Constitution Check

| Principle | Status |
|---|---|
| I — Fail-closed access control | **Applies, and is a first-class requirement.** FR-007. The role predicate is a positive allowlist, so an unknown or absent role withholds. The current `isClient = role === 'Client'` fails *open* when `useEffectiveUser()` returns null before auth resolves. |
| II — API resources only | Not applicable to this feature (no PHP). Satisfied by PR #26 for the surface this feature depends on. |
| III — Tests grow with the feature | Satisfied via `node --test` for the formatter, plus new assertions in both existing gates. The absence of a component test runner is a stated constraint, not a waiver — see quickstart.md's manual matrix. |
| IV — Audit sensitive mutations | Not applicable — no mutation. |
| V — Additive migrations | Not applicable — no schema change. |
| VI — Real auth only | Satisfied — the role predicate consumes `useEffectiveUser()`, the preview-aware path, not the legacy mock. |
| VII — Coding-standard skills | Applied above, converted to feature-specific constraints. |
| VIII — Definition of Done | Gate defined in quickstart.md, including `laravel-owasp-security` on FR-007's surface (a re-rendering of already-authorized data) and `code-slop` on the diff. |
| Frontend Design & Review Governance | `frontend-design` + `impeccable` (Operate) applied; departures recorded in research.md. |
| Specialist Agent Routing | Two specialists dispatched at planning; one deliberate exception recorded with reason. |

**No violations.** One deliberate exception (Identity & Access Engineer not dispatched) is recorded
above with its justification, per the same mechanism as a Constitution Check violation.

## Project Structure

```
frontend/src/
  lib/
    ganttA11y.js            NEW — pure formatters + the role predicate (testable)
    ganttA11y.test.js       NEW — node --test, sentinel-based
    taskStatus.js           STATUS_FILL_TOKENS added; segment classes retokenised
    ganttPalette.js         unchanged, referenced as the vocabulary of record
  pages/
    WorkProgram.jsx         Story 1 — bar becomes a button; card becomes decorative
    Reports.jsx             Story 3 — chart rotated; matchStatusColor deleted
    Schedule.jsx            Story 5 — assignee filter hidden for Clients
    Admin.jsx               Story 5 — "Mock Auth Mode" copy
  components/
    GroupSummaryBar.jsx     Story 2 — glyph + legend + outline separator
  index.css                 Story 4 — --input; forced-colors rule for critical path
scripts/
  verify-contrast.py        + --input 3:1 rows, + chart token assertions
  verify-cascade.py         canary repointed (REQUIRED), + border-input, + HCM segment
```

## Complexity Tracking

One departure from "simplest thing that works", recorded because a reviewer will question it:
**three separate artifacts for the Gantt disclosure** (accessible name, `sr-only` description node,
decorative card) where one `aria-label` would be less code. The reason is in research.md R3 — a single
label produces a ~200-character unstructured utterance and is unreachable in browse mode, which fails
the spec's own edge case. The three-part split is the smallest thing that actually works.

## Software Architect Verification

*Pending — dispatched after Phase 1 artifacts complete. This section is what `/speckit-tasks` and
`/speckit-implement` read as their precondition; neither may run while it says Pending.*
