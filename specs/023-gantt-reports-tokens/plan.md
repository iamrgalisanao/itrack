# Implementation Plan: Legible Gantt Labels and Tokenised Chart Colours

**Branch**: `023-gantt-reports-tokens` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-gantt-reports-tokens/spec.md`

## Summary

Two defects in the same two files, and they are not separable.

**The AA failure.** The Gantt bar's percentage label is `text-[9px] font-bold text-white`
(`WorkProgram.jsx:2665`) drawn on a `bg-white/20` progress overlay (`:2658`), so its real backdrop
is the bar lightened 20%. Six of the eight statuses can render that label and **all six fail**:
3.00:1 (`backlog`/`for_review`/`blocked`, which reach red via a `default` branch), 2.78:1
(`in_progress`), 2.13:1 (`completed`), 1.86:1 (`delayed`). The milestone diamond (`:2672`) is the
same defect — `bg-white` on dark `--warning` is 1.67:1.

**The drift.** 44 colour values are written into these two pages instead of coming from the design
system, so none of them moved when 022 corrected every status token.

They are not separable because **the naive fix makes things worse**. Keeping `text-white` +
`bg-white/20` over the 022 tokens fails 6 of 8 pairings — light `--success` 4.46, light `--info`
4.44, and all four dark values between 1.51 and 2.28. "Tokenise now, fix the label later" is not a
valid sequencing.

The fix is a **direction change, not a value change**: label ink becomes each status's paired
`-foreground`, and the overlay flips from `bg-white/20` to `bg-foreground/20`. Ink and overlay then
sit on opposite sides of every fill, which makes label contrast **monotonically increasing in
overlay alpha** — so the binding case becomes alpha = 0, the bare bar, which the gate already
checks. Worst case 5.73:1.

Along the way the status map is **re-derived** rather than preserved (R1), because re-sourcing it
mechanically would rename `#ef4444` to "the destructive colour" and turn "not started is an error"
from an accident into an assertion.

## Technical Context

**Language/Version**: JavaScript (no TypeScript — `typescript` is absent from `frontend/package.json`) / React `^19.2.6`, Vite `^8.0.12`, Tailwind `^4.3.1`. Backend is Laravel `^13.8` / PHP `^8.3` and is **read but not modified** — `DetailedActivityController.php:119` is parsed by the gate as the authoritative status list.

**Primary Dependencies**: None added. One new frontend module (`src/lib/ganttPalette.js`) following the existing `src/lib/taskStatus.js` / `src/lib/groupSummary.js` convention. `scripts/verify-contrast.py` gains assertions; it stays stdlib-only.

**Storage**: N/A — presentation layer only. **No migrations.**

**Testing**: No frontend test suite exists (CI runs build + lint). Verification is (a) the extended contrast gate, now a required-ish CI job, and (b) browser inspection across all eight statuses in both themes. The backend suite is a regression check only.

**Target Platform**: Web SPA, light and dark themes, class-toggled via `.dark`.

**Project Type**: Frontend-only change to an existing web application.

**Performance Goals**: N/A. Removing four gradients for flat fills is marginally cheaper to paint; no measurable target is claimed.

**Constraints**: No new colour values may be invented — every colour resolves to an existing token (R3 rejects `color-mix()` synthesis for exactly this reason). The re-derivation is bounded to `WorkProgram.jsx`; `taskStatus.js`, `groupSummary.js` and the List view keep their own maps (spec Out of Scope). Contrast is judged at the **normal-text** 4.5:1 threshold, not the large-text 3:1 — the label is 9px.

**Scale/Scope**: 2 pages modified, 1 module added, 1 script extended, 1 doc updated. 44 hard-coded colour values removed. 8 statuses gain explicit colour and label branches, replacing 7 branches with a fallback.

### Coding-Standard Constraints

From `react-vite-best-practices` and this repo's own conventions:

1. **No new dependencies, no `vite.config` change.** Values-only plus one module.
2. `ganttPalette.js` exports **plain data only** — no components, no hooks. This is the
   `react-refresh/only-export-components` rule that turned CI red during 021 and forced the
   `groupSummary.js` extraction; the same shape avoids it here by construction.
3. Colour reaches the DOM through `var(--token)` in inline styles or through Tailwind semantic
   utilities. **No new hex literals in JSX** — that is the defect being removed, and reintroducing
   one anywhere in the diff fails the feature's own premise.
4. The status switches become exhaustive over the backend enum plus `pending`. A `default` branch
   may remain only as a defensive fallthrough that is unreachable for known values; it must not be
   how any real status gets its colour (FR-008).
5. Keep `getGanttBarStyles`'s existing signature `(status, isCritical)` and its call site at
   `:2640`. This feature changes what it returns, not how the chart calls it.

From `code-slop`, for the review pass:

6. No comment explaining a removed gradient. The diff is self-evident; the *reasoning* belongs in
   `DESIGN.md` and `research.md`, not scattered at call sites.
7. The ratio table added to `index.css` must be gate-checked, not prose — but under **its own**
   `Gantt, <theme>:` sentinel and parser (contracts/ assertion 6). Reusing 022's `DOCUMENTED` regex
   either ignores the block entirely (2 float columns) or clobbers the 022 rows (3 columns, keyed by
   hex). Both were simulated against the real script.

**Not applicable, explicitly**: `php-best-practices`, `laravel-best-practices`, `laravel-testing`,
`laravel-owasp-security` — no PHP is modified, no endpoint, auth, upload or data-exposure surface is
touched. The backend file is read as data by a build-time script. Recorded as N/A rather than
skipped, so the Definition-of-Done gate can mark them so.

### Frontend Design Constraints

Applying `frontend-design` and `impeccable` (Operate mode — a Gantt chart is a scanning-and-
operating surface, not a persuasion surface), per constitution 1.3.0.

- **Visual direction**: unchanged in intent, corrected in execution. The product's colour language is
  preserved; what changes is that the chart finally *speaks* it.
- **Existing system reused**: the semantic tokens from `index.css`, the `--border` hairline, the
  `src/lib/` data-module convention (`taskStatus.js`, `groupSummary.js`), and the existing
  `scripts/verify-contrast.py` gate. Nothing new is introduced beyond one data module.
- **The design-system rule this enforces**: `DESIGN.md`'s Creative North Star (`:64-65`) names this
  exact surface — "flat, thin-bordered surfaces everywhere data has to be scanned in volume —
  tables, Kanban cards, **Gantt bars**." The **Flat-By-Default Rule** (`:190-192`) is the separate,
  narrower rule quoted below about elevation. Both apply; they are different passages and are cited
  as such. The gradients were always out of system, so R3 applies existing rules rather than
  introducing an opinion.
- **Critical path**: `DESIGN.md`'s Flat-By-Default Rule also says "If a surface needs to stand out,
  reach for the border or the accent color, not a heavier shadow" — so the `0 0 10px` glow goes.
  It becomes `outline: 2px solid var(--foreground); outline-offset: 2px`, which places the ring on
  the **row background** rather than on the bar. That is not a style preference: once `delayed` and
  `blocked` are `--destructive`, a red ring on a red bar is 1.00:1, and no ring colour works
  (`--primary` on dark `--info` is 1.04:1; `--foreground` on dark `--warning` is 1.52:1). Moving off
  the bar changes the contrast partner to `--background`/`--card`/`--muted`: **18.11–20.15:1 light,
  14.73–16.25:1 dark**, independent of status.
- **Interface states affected**: the bar's status colouring, the percentage label, the milestone
  marker, the critical-path emphasis, and the status pill beside the row. Loading, empty, error,
  permission-denied and validation states use neutral tokens and are untouched — this feature adds
  no new state.
- **Responsive**: no layout change. Geometry, measured rather than assumed — the bar is `h-6`
  (24px) inside a 48px row at `top: showBaseline ? '8px' : '12px'` (`:2639`), and `showBaseline`
  defaults to **false** (`:217`), so the default offset is **12px, not 8px**. A 2px outline at 2px
  offset therefore spans **8–40px** by default and **4–36px** with the baseline shown. Both fit
  inside 48px: **no vertical clip**.

  Two horizontal/overlap cases the vertical argument does not cover, both accepted rather than
  designed away:
  - The timeline pane is `overflow-x-auto` (`:2521`), and `calculateBarPosition` yields `left: 0`
    for a bar starting at the timeline origin. Its outline is drawn at x = −4 and **is clipped on
    the left**, rendering as a three-sided ring. Accepted: the ring still reads as emphasis, and
    adding left padding to the track would shift every bar to fix one edge case.
  - With the baseline shown, the outline's lower band (32–36px) overlaps the baseline bar
    (`top: 32px`, `h-2.5` → 32–42px). Accepted: the baseline is a muted 35%-opacity reference and
    the outline reading across it is not a legibility problem.

  Both are pre-registered as Gate 3 checks so they are confirmed by eye rather than asserted here.
  The existing width thresholds (`> 50` for the label, `<= 16` for the milestone diamond) are
  unchanged (FR-007).
- **Accessibility**: this *is* the accessibility change. Colour is not the only status channel — the
  pill beside each row carries a text label, which is what makes the neutral fill safe for
  not-started work. That pill's labels are also corrected here: today a `blocked` task reads
  "Pending".
- **Print**: `index.css:169-233` forces `.bg-card` white and `.text-foreground` black but does not
  touch inline styles, so bars keep their light-theme token values on paper. Verified: `--success`
  7.13:1, `--warning` 7.09:1 against white. Nothing breaks.
- **Impeccable (Operate mode)**: `shape` informed the decision to keep the label *inside* the bar
  rather than moving it out — moving it breaks at high zoom and on dense timelines, and the overlay
  it sits on is the percent-complete signal. `polish` and `harden` are **N/A** and recorded in
  Complexity Tracking rather than claimed: there is no new interaction, motion, or component
  structure. `audit` and `critique` run in the quickstart review pass.

## Constitution Check

*GATE: evaluated before Phase 0 research; re-checked after Phase 1 design.*

| Principle | Pre-research | Post-design |
|---|---|---|
| I — Fail-closed access control | N/A — no authorization surface | N/A |
| II — Consistent API contracts | N/A — no API change | N/A |
| III — Tests grow with the feature | PASS — the gate gains six assertions, and its non-vacuity is demonstrated by the Gate 5 tamper proofs (rename the export, drop a status key, corrupt a ratio — each must turn it red). The gate proves the *map*, not that the component uses it; **Gate 4 + Gate 3** cover that — Gate 4 alone is a literal sweep a component using plain Tailwind classes would pass, so the browser check is load-bearing, not decorative | PASS |
| IV — Audit sensitive mutations | N/A — no mutation | N/A |
| V — Additive, reversible migrations | PASS — **zero migrations** | PASS |
| VI — Real auth only | N/A | N/A |
| VII — Installed skills govern | PASS | PASS — Coding-Standard Constraints above; backend skills marked N/A with reasons |
| VIII — Definition-of-Done gate | PASS (planned) | PASS — quickstart carries it, OWASP/backend items N/A and justified |
| Frontend Design Governance (1.3.0) | Applies | PASS — Frontend Design Constraints above; `polish`/`harden` recorded as N/A in Complexity Tracking rather than silently omitted |

No violations → the Complexity Tracking entries below are transparency notes, not exceptions.

## Project Structure

### Documentation (this feature)

```text
specs/023-gantt-reports-tokens/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 — R1-R4, pre-decided and verified
├── data-model.md        # Phase 1 — the palette map and its contract
├── quickstart.md        # Phase 1 — verification + DoD gate
├── contracts/
│   └── gantt-palette.md # Phase 1 — the module contract and gate assertions
└── checklists/
    └── requirements.md  # Spec quality checklist (complete)
```

### Source Code (repository root)

```text
frontend/
├── src/lib/ganttPalette.js             # NEW — the single source of truth: status → {fill, ink},
│                                       #   the overlay token + alpha, the suppression list
├── src/pages/WorkProgram.jsx           # MODIFIED —
│   │                                   #   :575-615 getGanttBarStyles → flat token fill, no
│   │                                   #     gradient, no inline border, critical path → outline
│   │                                   #   :617-631 getGanttStatusColor → 8 explicit branches
│   │                                   #   :633-647 getGanttStatusLabel → 8 explicit branches
│   │                                   #     (fixes `blocked` rendering as "Pending")
│   │                                   #   :2658 bg-white/20 → bg-foreground/20
│   │                                   #   :2665 text-white → color: var(--{ink})
│   │                                   #   :2672 diamond bg-white → var(--{ink})
├── src/pages/Reports.jsx               # MODIFIED — :239 three literals → var(--success),
│                                       #   var(--warning), var(--primary)
└── src/index.css                       # MODIFIED — add the Gantt ratio comment block under its
                                        #   own `Gantt, <theme>:` sentinel, parsed by assertion 6
                                        #   with a SEPARATE regex. 022's DOCUMENTED parser would
                                        #   either ignore it (2 cols) or clobber the 022 rows (3).

scripts/verify-contrast.py              # MODIFIED — six new assertions (see contracts/), and
                                        #   022's len(DOCUMENTED)!=8 check re-scoped so the two
                                        #   ratio tables cannot interfere
DESIGN.md                               # MODIFIED — record the canonical Gantt status map, the
                                        #   flat-bar decision, and the offset-outline critical
                                        #   path with the 1.00:1 collision that ruled out red
```

**Structure Decision**: One new data module, following the existing `src/lib/` convention exactly.
The gate reads that module rather than the JSX because `getGanttBarStyles` is a `switch` with
fall-through — a regex over it would silently stop matching after any refactor and the check would
pass vacuously, which is the specific failure this feature exists to prevent.

## Complexity Tracking

No constitution violations. Three items recorded for transparency:

| Item | Why | Alternative rejected |
|---|---|---|
| `impeccable` `polish`/`harden` not run | No new interaction, motion, or component structure — both operate on a surface this change does not have. `shape`, `audit` and `critique` are applied. | Running them to claim coverage — ceremony producing findings about components this feature does not touch. |
| The gate parses a **backend PHP file** (`DetailedActivityController.php:119`) from a frontend-only feature | The status list is authoritative there and nowhere else. Duplicating it into JS would create the second source of truth the whole feature is removing, and the drift would be silent. Parsing it means adding a status backend-side without a Gantt colour fails CI. | Hard-coding the enum in `ganttPalette.js` — rejected: it is the same class of defect as the hard-coded hexes. |
| Light mode's completed-portion overlay inverts (darker instead of lighter) | Consequence of the direction change in R2, and the source of the monotonicity property. "More done reads as more ink" is at least as legible as the current lightening. | Keeping a light overlay and darkening only the ink — rejected: it reintroduces a non-monotonic alpha, so a future opacity tweak could silently break the label again. |

## Software Architect Verification

**Status: PASSED (clean).** Two iterations.

| Pass | Outcome |
|---|---|
| 1 | **NOT PASSED** — 10 findings (7 blocking) |
| 2 | **PASSED** — all 10 confirmed landed; 4 residual nits raised, all fixed rather than accepted |

**Accepted exceptions: none outstanding.** Pass 2 returned "PASSED (accepted exceptions)" naming
four cheap residuals; all four were corrected, so nothing is carried:

- The rejected 3-column counterfactual in `contracts/` claimed `len(DOCUMENTED)` would grow to 9.
  Simulated: it stays **8**, because the only would-be new key is `--muted-foreground` and the
  hyphen defeats `[a-z]+`. The count check does *not* catch that case — which strengthens the
  argument, since the silent clobber is the whole problem.
- Constitution row III and research.md item 1 attributed "does the component use the map" coverage
  to Gate 4 alone. Gate 4 is a literal sweep; a component using plain Tailwind classes and importing
  nothing would pass it. Corrected to Gate 4 **+ Gate 3**.
- The Critical blocking criterion did not carve out the two outline cases plan.md explicitly
  accepts, so a strict reader could have blocked on an accepted case.
- A direct `DESIGN.md` quote had been house-style normalised ("colour" for "color").

**The four findings from pass 1 that changed the plan materially:**

- **F1** — the "land the gate first and watch it fail" sequencing was incoherent. The gate reads
  `ganttPalette.js`, `index.css` and the backend enum, and deliberately does not parse
  `getGanttBarStyles` (R4). With a correct module committed it would exit 0 while the component was
  still broken. Replaced with an explicit statement of what the gate does and does not prove.
- **F2** — the `index.css` Gantt ratio block would have been vacuous or destructive. Simulated
  against the real script: a 2-column block yields **zero** matches (silently unchecked); a 3-column
  block **overwrites** 022's `--destructive` row. Now assertion 6, with its own sentinel and parser.
- **F3** — the neutral-pill figure was inverted: `bg-muted-foreground/10` is **4.54:1 and passes**;
  4.23:1 is the /15 case. It was a pre-registered Major blocker, so the wrong number would have had
  a reviewer rejecting correct work.
- **F5** — the geometry was asserted rather than measured. `showBaseline` defaults to false, so the
  default `top` is 12px not 8px; the span is 8–40px not 6–38px; and "cannot clip" was argued only
  vertically, missing a real horizontal clip at `left: 0`.

**What held up under attack**, and matters most: the direction invariant is true for all ten
fill×theme pairs, and monotonicity was verified by a 1000-step sweep across the whole alpha range
rather than the four alphas sampled — so "the binding case is alpha 0" is sound, and the gate design
resting on it is too. 5.73:1 is genuinely the global minimum. The eight-status list is complete and
closed: no undeclared value can reach the switch, so FR-008 is satisfiable without a defensive
branch.
