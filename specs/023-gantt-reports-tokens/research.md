# Research — 023 Legible Gantt Labels and Tokenised Chart Colours

**Date**: 2026-08-27. Every ratio below was computed from the committed hex values using the WCAG
relative-luminance formula and sRGB alpha compositing. Nothing is transcribed from a prior document
— two of this line of work's three previous features shipped a hand-copied ratio that was wrong.

## Verified ground truths

- **The status set is eight, not four.** `backend/app/Http/Controllers/DetailedActivityController.php:119`
  validates `in:backlog,not_started,in_progress,for_review,completed,blocked,delayed`.
  `WorkProgram.jsx:304` (`getRollupStatus`) synthesises a ninth value, `pending`, for parent rows.
- **Three statuses reach red through a fallback.** `getGanttBarStyles` (`:575`) handles
  `completed | in_progress | delayed | review | not_started | pending | default`. `backlog`,
  `for_review` and `blocked` match nothing and fall to `default`, which is red.
- **`case 'review'` is dead code.** The backend value is `for_review`; `'review'` never matches.
- **`getGanttStatusLabel` (`:633`) has the same defect**, so a `blocked` task's pill currently
  reads **"Pending"**. That is a correctness bug, not a colour one.
- **`progress` is independent of `status`** (`:120`, `integer|min:0|max:100`). The label suppression
  at `:2664` excludes only `pending` and `not_started`, so six statuses can render a label.

### Measured failure (today)

The label is `text-white` over `bg-white/20` over the bar's gradient. Measured on the light end of
each gradient, which is where the label sits:

| Statuses | Bar | Label contrast | AA |
|---|---|---|---|
| `backlog`, `for_review`, `blocked` | `#ef4444` | **3.00** | FAIL |
| `in_progress` | `#3b82f6` | **2.78** | FAIL |
| `completed` | `#10b981` | **2.13** | FAIL |
| `delayed` | `#f59e0b` | **1.86** | FAIL |

Six of eight statuses render a label; all six fail. The milestone diamond (`:2672`, `bg-white`) is
the same defect measured against a token rather than a gradient: white on dark `--warning` is
**1.67:1**.

### The naive fix is worse, which is why R1–R3 are one decision

Keeping `text-white` + `bg-white/20` over 022's corrected tokens:

| | destructive | success | warning | info |
|---|---|---|---|---|
| light | 4.69 | **4.46 FAIL** | 4.53 | **4.44 FAIL** |
| dark | **2.28 FAIL** | **1.58 FAIL** | **1.51 FAIL** | **2.08 FAIL** |

Six of eight fail. Tokenising first and fixing the label afterwards would ship a regression in
between, so the label fix must be decided against the *post*-retokenise bars.

## Decisions

### R1 — Re-derive the Gantt status map, bounded to `WorkProgram.jsx`

- **Decision**:

  | status | fill | ink | change |
  |---|---|---|---|
  | `completed` | `--success` | `--success-foreground` | source only |
  | `in_progress` | `--info` | `--info-foreground` | source only |
  | `for_review` | `--warning` | `--warning-foreground` | **red → amber** (was dead code) |
  | `delayed` | `--destructive` | `--destructive-foreground` | **amber → red** |
  | `blocked` | `--destructive` | `--destructive-foreground` | red, now explicit |
  | `backlog`, `not_started`, `pending` | `--muted-foreground` | `--background` | **red → neutral** |

- **Rationale**: preserving the map is not the neutral option it appears to be. Re-sourcing
  mechanically renames `#ef4444` to `--destructive`, so "not started is an error" stops being an
  accident of a hex literal and becomes a named assertion in the source. The switch is being
  rewritten regardless, so correcting it costs nothing extra.

  It also resolves a contradiction inside spec.md. User Story 2 asks that a delayed task look the
  same on the Gantt as on the Taskboard; `taskStatus.js:31` maps `delayed` to `bg-red-600` and
  `:26,39` map `not_started` to slate, while the Gantt did the opposite in both cases. Under
  "preserve", US2 was unsatisfiable. `delayed` and `blocked` sharing red matches
  `taskStatus.js:42-43` — the precedent already exists.
- **Reach, exactly**: `getGanttBarStyles`, `getGanttStatusColor`, `getGanttStatusLabel`, and the new
  module. `taskStatus.js`, `groupSummary.js` and the List view are **not** touched — they are
  Tailwind palette-class maps measured at 4.51–8.44:1 during 022's review, so they are consistency
  debt, not an accessibility defect (spec Out of Scope).
- **Alternatives considered**: (a) preserve the map and fix only the label — rejected: it makes the
  wrong semantics explicit and leaves US2 unsatisfiable. (b) Align the whole product's status
  vocabulary at once — rejected: a product-wide change riding along with a contrast fix, with a
  blast radius that gets reverted wholesale rather than reviewed.

### R2 — Label ink becomes the paired `-foreground`; the overlay flips to `bg-foreground/20`

- **Decision**: `WorkProgram.jsx:2665` `text-white` → `color: var(--{ink})`, `:2658` `bg-white/20` →
  `bg-foreground/20`, `:2672` diamond `bg-white` → `var(--{ink})`. The overlay stays, its alpha
  stays, the label stays inside the bar.
- **Measured** (ink on the bare bar / ink over the 20% overlay):

  | | destructive | success | warning | info | neutral |
  |---|---|---|---|---|---|
  | light | 6.47 / 8.60 | 7.13 / 9.25 | 7.09 / 9.26 | 6.70 / 8.77 | 5.73 / 7.72 |
  | dark | 6.46 / 7.69 | 10.26 / 11.04 | 10.71 / 11.57 | 7.03 / 8.39 | 7.04 / 8.48 |

  **Worst case 5.73:1** against a 4.5 floor. Both columns matter: the overlay starts at `left:0`
  with `width:{progress}%` while the label sits at roughly 8px in, so at low progress on a narrow
  bar the label straddles the boundary and must pass on both.
- **Rationale — the structural property, not the numbers**: `--{state}-foreground` and
  `--foreground` sit on **opposite sides** of every fill in both themes. Verified for all ten
  fill×theme pairs: `sign(lum(overlay) − lum(fill))` is opposite to `sign(lum(ink) − lum(fill))`
  every time. So the overlay always pushes the backdrop *away* from the ink, and label contrast is
  **monotonically increasing in overlay alpha**:

  | alpha | 0.00 | 0.10 | 0.20 | 0.30 |
  |---|---|---|---|---|
  | worst | 5.73 | 6.60 | 7.69 | 8.40 |

  The binding case is therefore alpha = 0 — the bare bar — which is exactly the ink-on-fill pairing
  the gate already checks. The overlay stops being a failure mode *by construction* rather than by a
  lucky number, and its alpha becomes a free visual choice. That is the property none of the
  alternatives provide.
- **Cost, stated plainly**: in light mode the completed portion of a bar now reads *darker* than the
  remainder rather than lighter, inverting the current idiom. "More done reads as more ink" is at
  least as legible, and it is the price of monotonicity.
- **Alternatives considered**: (a) drop the overlay — rejected: it *is* the percent-complete signal.
  (b) A scrim or text-shadow behind the label — rejected: adds a fifth surface to measure and to
  gate. (c) Move the label outside the bar — rejected: breaks at high zoom and on dense timelines.
  (d) Darken the bars enough for white text — rejected: it would abandon the 022 tokens, which is
  the opposite of this feature's point.

### R3 — Flat token fill; critical path moves off the bar

- **Decision**: one flat `background: var(--{fill})` per status. No gradient, no synthesised shades,
  no inline border (the existing `border` className inherits `--border`), no glow. Critical path
  becomes `outline: 2px solid var(--foreground); outline-offset: 2px`.
- **Rationale**: `DESIGN.md` names this surface directly — "flat, thin-bordered surfaces everywhere
  data has to be scanned in volume — tables, Kanban cards, **Gantt bars**". The gradient was always
  out of system. The design system defines **one** value per status per theme, not three, so a
  gradient necessarily invents two colours per status that nothing measures and nothing documents.
- **Why `color-mix()` is rejected even though it is available**: the shipped bundle already contains
  326 `color-mix(in oklab, …)` calls, because Tailwind v4 compiles every `/opacity` modifier to one
  — so browser support is not the objection. Synthesising shades would create eight new colours that
  `DESIGN.md` does not define and the gate would then have to cover. Declining is the cheaper and
  more honest option.
- **Why the critical-path ring cannot simply be red**: under R1, `delayed` and `blocked` bars *are*
  `--destructive`, so a red ring on a red bar is **1.00:1**. No ring colour on the bar works —
  `--primary` against dark `--info` is **1.04:1**, `--foreground` against dark `--warning` is
  **1.52:1**. `outline-offset` moves the ring onto the row background, changing its contrast partner
  to `--background`/`--card`/`--muted`: **18.11–20.15:1 light, 14.73–16.25:1 dark**, independent of
  status. It fits geometrically: the bar is `h-6` at `top: 8px` in an `h-12` row, so 2px at 2px
  offset spans 6–38px inside 48px.
- **Alternatives considered**: (a) keep gradients from `color-mix()` — see above. (b) Keep the glow
  and recolour it — rejected: `DESIGN.md`'s Flat-By-Default Rule explicitly prohibits reaching for a
  heavier shadow. (c) Mark critical path with an icon instead — rejected as a larger UX change than
  this feature warrants, and it would still need a colour.

### R4 — One shared module, parsed by the gate

- **Decision**: `frontend/src/lib/ganttPalette.js` is the single source of truth. `WorkProgram.jsx`
  builds inline styles from it; `scripts/verify-contrast.py` regex-parses it and joins it to the
  tokens in `index.css`. Contract and the five assertions: [contracts/gantt-palette.md](./contracts/gantt-palette.md).
- **Rationale**: the gate must not be able to pass vacuously, which rules out the two obvious
  options. Parsing the JSX fails because `getGanttBarStyles` is a `switch` with fall-through — a
  regex over it would silently stop matching after any refactor and the check would go quiet. A
  hard-coded table inside the Python script fails because it is a second source of truth that drifts
  the first time someone edits the component. A flat object literal in a data module is
  deterministically parseable *and* is the same text the app executes.
- **The parse guard is the load-bearing assertion**: if the regex yields fewer than 8 entries the
  gate fails hard rather than looping over nothing. Every other assertion is only as good as that
  one.
- **Alternatives considered**: (a) a JSON file both sides read — rejected: the app would need a
  fetch or a bundler import of JSON for no benefit over a JS literal. (b) Generate the JSX from the
  module at build time — rejected: a build step is a much larger commitment than this feature needs.

### R5 — `Reports.jsx:239`

- **Decision**: `#22c55e` → `var(--success)`, `#f59e0b` → `var(--warning)`, `#aa3bff` →
  `var(--primary)`.
- **Rationale**: `#aa3bff` is the pre-`#a631ff` accent that `index.css:15-17` documents as
  superseded — it measures **4.39:1** against white and was retired for failing AA. The ring is
  decorative and carries no text, so this is a consistency fix rather than an accessibility one, but
  the value is genuinely stale. Mapping the low-progress case to `--primary` preserves intent: it is
  an accent, not an error state.
- **Alternatives considered**: mapping low progress to `--destructive` — rejected: it would invent a
  meaning ("behind schedule is an error") the current design does not assert.

## Test / verification requirements

No frontend suite exists, so verification is explicit:

1. **The gate** — `python scripts/verify-contrast.py`, exit code. Extended with five assertions
   (contracts/). Landed *before* the JSX change so it is demonstrably red on `main`'s values first;
   a gate that has only ever seen the fixed state has not been shown to fail.
2. **Enum coverage** — adding a status backend-side without a Gantt colour must fail CI. This is the
   assertion that would have caught today's bug.
3. **Browser, both themes, all eight statuses** — including a `for_review` task with `progress > 0`,
   which is the case proving the fallback bug is real and not theoretical.
4. **Build and lint by exit code** — not by reading the summary line. ESLint's "0 errors and N
   warnings potentially fixable" counts auto-fixable items and hid a real error throughout 021.
5. **Backend suite green** — regression only; no PHP is modified.

## Deferred follow-ups (recorded, not 023)

1. Align `taskStatus.js`, `groupSummary.js` and the List view's status maps with the Gantt's
   corrected vocabulary. They pass AA (4.51–8.44:1), so this is consistency debt.
2. `--primary` fails the widened AA Floor Rule in light mode (022 follow-up 6). Unchanged by this
   feature; `Reports.jsx` now *uses* `--primary`, but on a decorative ring with no text.
3. `prefers-contrast: high` and `forced-colors` — the app defines neither.
4. The status pill's palette classes (`getGanttStatusColor`) are tokenised here, but the equivalent
   pills elsewhere in the app are not. Same debt as (1).
