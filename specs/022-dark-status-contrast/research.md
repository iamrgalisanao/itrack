# Research — 022 Dark-Mode Contrast for Semantic Status Colours

**Date**: 2026-08-27. All ratios below are the output of `contracts/verify-contrast.py` run
against the committed values, not hand-transcribed — an earlier draft mis-copied the dark tint
column and the script caught it. Surfaces read from `frontend/src/index.css`'s `.dark`
block on `main` at `b00ac23`.

## Verified ground truths

- The `.dark` block **redeclares all four semantic status colours with the light-mode values**:
  `--destructive: #dc2626`, `--success: #15803d`, `--warning: #b45309`, `--info: #2563eb`. They are
  not omitted (which would inherit) — they are explicitly restated, so the intent appears to have
  been to theme them and the values were simply never adjusted.
- Dark surfaces the tokens render against: `--background: #16171d`, `--card: #1c1d24`,
  `--muted`/`--secondary: #1f2028`. The **lightest** (`#1f2028`) is the worst case for
  light-on-dark text and is the value to design against — not the card, which is what the 021
  review measured.
- 28 files consume these tokens. Fill usage is narrower than a raw grep suggests: of 47
  `bg-{state}` occurrences, **37 are opacity tints** (`bg-destructive/10`, `/15`) and only **8**
  are solid fills paired with a `-foreground` — all variant definitions in
  `components/ui/badge.jsx` and `components/ui/button.jsx`. Two more are timeline markers in `pages/Schedule.jsx`; one of
  them (line 655) carries a hard-coded `text-white` that is currently inert because the branch
  renders `null`, but would measure 2.77:1 on the new dark fill — it is deleted here rather than
  left armed. The foreground flip itself is contained to two primitive files.
- The design system states an **AA Floor Rule** (`DESIGN.md`): "No status or accent color ships at
  a lightness that fails 4.5:1 against its paired foreground. Where a common default (e.g.
  Tailwind's 500-weight green/amber/blue) fails, use one step darker instead of picking a new hue."
  Read literally it governs **only** fill-vs-foreground and **only** one-step moves — so it covers
  neither the surfaces that actually fail here (text on `--muted`, text on a tint of itself) nor
  the magnitude the dark theme needs (2-3 steps). R5 widens it on both axes; this plan does not
  claim it already prescribed the fix.

### Measured failure (the reason for this change)

| Token | Value | vs `#16171d` | vs `#1c1d24` | vs `#1f2028` | Worst | AA |
|---|---|---|---|---|---|---|
| `--destructive` | `#dc2626` | 3.70 | 3.48 | 3.36 | **3.36** | FAIL |
| `--success` | `#15803d` | 3.57 | 3.35 | 3.23 | **3.23** | FAIL |
| `--warning` | `#b45309` | 3.56 | 3.34 | 3.23 | **3.23** | FAIL |
| `--info` | `#2563eb` | 3.46 | 3.25 | 3.14 | **3.14** | FAIL |

Four of four fail against every dark surface. None is marginal.

### Measured failure in **light** mode (found during verification, originally missed)

| Token | Value | vs `#f4f3ec` (darkest) | on own 10–15% tint | AA |
|---|---|---|---|---|
| `--destructive` | `#dc2626` | **4.34** | **3.45** | FAIL (both) |
| `--success` | `#15803d` | 4.51 (0.01 margin) | **3.72** | FAIL (tint) |
| `--warning` | `#b45309` | 4.51 (0.01 margin) | **3.70** | FAIL (tint) |
| `--info` | `#2563eb` | 4.65 | **3.79** | FAIL (tint) |

The first scoping assumed light mode was correct and froze it. It is not. Destructive fails as
text against `--muted`; success and warning clear that bar by 0.01; and **all four** fail where
status text sits on a tint of its own colour — the `bg-{state}/10`+`text-{state}` pattern used at
26 call sites across 15 files (R6). The tint failures were found by the gate script itself, after the manual
review had already expanded scope once — which is the argument for having a mechanical gate rather
than a checklist.

### R7 — Light mode moves one palette step darker
- **Decision**: `--destructive` `#b91c1c`, `--success` `#166534`, `--warning` `#92400e`,
  `--info` `#1d4ed8`.
- **Measured**: text 5.82 / 6.41 / 6.37 / 6.02; on own tint 4.54 / 5.14 / 5.07 / 4.79. All clear
  4.5:1 on both counts.
- **Rationale**: one step darker is the *magnitude* the AA Floor Rule prescribes, and here one step
  is enough — unlike the dark theme, where measurement forced 2-3 (R1). But the rule's stated
  *scope* is fill-vs-foreground only, and by that test these values already pass; what fails is
  text on `--muted` and text on a tint of itself. So this is the rule's magnitude applied to
  surfaces the rule does not yet cover, which is exactly the gap R5 closes. Calling it "verbatim
  what the rule prescribes" would be overstating it.
- **Cost, stated plainly**: light mode changes perceptibly. Status colours become slightly deeper.
  SC-004 was amended from "no light-mode change" to "exactly one palette step, nothing else".
- **Alternatives considered**: (a) two steps darker (`#991b1b` etc.) — better margin (5.76:1) but a
  larger visual departure than the rule calls for; the thin case is destructive-on-tint at 4.54:1,
  which passes by 0.039. (b) Leaving light tints failing and documenting the exception — rejected:
  they carry body text at 26 call sites, and the fix is one palette step. (c) Lightening the tint
  opacity instead of darkening the colour — rejected: it changes every tinted surface's appearance
  to avoid changing four values.

## Decisions

### R1 — Lighten to the 400-weight of the same hue
- **Decision**: dark-mode values become `--destructive: #f87171`, `--success: #4ade80`,
  `--warning: #fbbf24`, `--info: #60a5fa`.
- **Measured result** (worst case, against `#1f2028`): 5.86 / 9.30 / 9.71 / 6.38 — all clear AA
  with margin.
- **Rationale**: preserves hue identity (FR-003) — same hue family, moved in lightness until
  measurement clears 4.5:1. That took **two** steps for red and blue (600→400) and **three** for
  green and amber (700→400); the AA Floor Rule's "one step" wording does not cover this, which is
  why R5 widens it rather than this decision claiming cover it does not have. These are the same
  families already used by the codebase's legitimate light/dark palette pairs, so the dark theme
  gains no new colours.
- **Alternatives considered**: (a) **500-weight** (`#ef4444`, `#22c55e`, `#f59e0b`, `#3b82f6`) —
  rejected on measurement: red reaches only 4.31:1 and blue 4.41:1 against `#1f2028`, both below
  4.5:1. Tempting because it is a smaller visual jump, but it would leave two of four still
  failing. (b) **Lightening the surfaces instead of the colours** — rejected: changes the entire
  dark theme's character to fix four tokens. (c) **Per-component overrides** — rejected; that is
  the status quo this change removes.

### R2 — The paired foregrounds must flip as well *(the non-obvious part)*
- **Decision**: in dark mode each `--*-foreground` changes from `#ffffff` to the dark theme's
  on-accent ink `#16171d`.
- **Rationale**: lightening a fill to pass as *text* breaks it as a *background*. Measured, white
  on the new fills gives destructive 2.77:1, success 1.74:1, warning 1.67:1, info 2.54:1 — far
  worse than the problem being fixed. Ink (`#16171d`) on the same fills gives 6.46 / 10.26 /
  10.71 / 7.03. **This is why the dark change is eight tokens, not four**, and it is the trap a
  values-only "just lighten them" fix would fall into. Note today's dark fills are *not* broken —
  white on `#dc2626` measures 4.83:1 and passes; the breakage would be introduced by lightening
  the fill without moving its foreground.
- **Ink choice**: `#16171d`, not `#08060d`. Both clear AA (worst case 6.46:1 and 7.28:1
  respectively), but `.dark` already uses `#16171d` for `--primary-foreground`, so the dark theme
  keeps a single on-accent ink instead of gaining a second. Existing Design System First outranks
  `DESIGN.md`'s "the system's black is `#08060d`", which describes the light theme.
- **Alternatives considered**: (a) keeping white foregrounds and choosing mid-weight fills that
  satisfy both directions — no such value exists for red or blue: anything dark enough for white
  text fails as text on the dark surface, and vice versa. The two uses genuinely need opposite
  treatments, which is exactly what a token pair is for. (b) `#08060d` as the ink — see above.

### R3 — Scope of workaround removal: 4 call sites, not 20
- **Decision**: remove only overrides that pair a **semantic token** with a palette override —
  `text-destructive dark:text-red-400`. All four are in `MyWorkPanel.jsx` (lines 88, 91, 101, 169).
  Leave every `text-red-700 dark:text-red-400`-style pair untouched.
- **Rationale**: a first pass counted 50 `dark:text-*-400` occurrences and treated them all as
  workarounds. Reading them showed 46 are deliberate light/dark pairs on **Tailwind palette
  colours** (in `STATUS_BADGE_CLASSES`, `PRIORITY_BADGE_CLASSES` and similar maps) — correct design
  that this change must not disturb. Only the four that pair a semantic token with a palette
  override are compensating for the broken token. The spec's SC-002 was corrected from 20 to 4.
- **Alternatives considered**: treating all `dark:text-*-400` occurrences as workarounds (the
  first reading) — rejected on inspection: 46 of the 50 are deliberate light/dark pairs on palette
  colours in badge and priority class maps. **Scope note**: 50/46 counts `*.jsx` only. Repo-wide the
  figures are 59 → 55; the extra 9 live in `lib/groupSummary.js` and `lib/taskStatus.js`, which the
  original census silently excluded. They were read afterwards and are the same palette-pair
  category — the conclusion holds, but the recorded number described a subset. Deleting them would strip intentional theming and is
  pre-registered as a blocking Major finding.
- **Consequence**: the diff is far smaller than first scoped, and the risk of collateral visual
  change drops accordingly. Anything beyond deleting `dark:text-*` at those four sites means the
  token is still wrong — fix the token, not the call site.

### R4 — Record the ratios in the token file
- **Decision**: a comment above the `.dark` status tokens listing each value's worst-case ratio and
  the surface it was measured against.
- **Rationale**: FR-006/SC-003. These values look arbitrary without it, and the next person to
  adjust one has no way to know the constraint they are working within — which is precisely how the
  current bug survived. This is a constraint the code cannot express, so it earns a comment under
  the project's comment rules.
- **Scope**: the comment covers **both** `:root` and `.dark`, not only the dark block — light
  destructive's 4.34:1 failure survived precisely because no light ratio was written down.
- **Alternatives considered**: a build-time contrast check — better long-term, but it needs a
  dependency and a lint integration; recorded as a follow-up rather than bundled here.

### R6 — Composited tint surfaces are part of the contract
- **Decision**: the contract's surface set includes `--{state}` composited at 10% and 15% over each
  base surface, because **26 call sites across 15 files** render `text-{state}` directly on a
  same-colour tint. Reproduce the list with:

  ```bash
  cd g:/Dev/projects/itrack/frontend
  grep -rEl "text-(destructive|success|warning|info)[^\"']*bg-(destructive|success|warning|info)/(5|10|15|20|25|30)\b|bg-(destructive|success|warning|info)/(5|10|15|20|25|30)\b[^\"']*text-(destructive|success|warning|info)\b" src --include=*.jsx
  ```

  It covers `App.jsx`, `AccessDenied.jsx`, `PreviewBanner.jsx`, `TaskComments.jsx`,
  `TaskFiles.jsx`, and pages `Admin.jsx`, `Glossary.jsx`, `Kanban.jsx`,
  `Login.jsx`, `Reports.jsx`, `Schedule.jsx`, `SupportOps.jsx`, `Team.jsx`, `TodayDashboard.jsx`
  and `WorkProgram.jsx`. An earlier draft listed eight of these and said "~10 call sites", which
  would have left Work Program — one of the six screens spec.md's Independent Test names — out of
  the browser pass.
- **Measured**: with the chosen values these pass — worst case is destructive on a 15% tint over
  `#1f2028` at **4.67:1**; info 4.92, success 6.78, warning 6.94. Today the same dark pairings sit
  at 2.75-3.03:1 (destructive 3.03, success 2.83, warning 2.83, info 2.75 — the gate script's own
  output; an earlier draft transcribed these four wrong in all four cells).
- **Rationale**: spec.md Edge Cases names this case explicitly and FR-001 says "the surfaces they
  are rendered on" without qualification, but the first draft's surface set covered only the three
  base surfaces. The answer is favourable; the defect was that no artifact knew it. At 4.67:1 the
  margin is thin enough that a future re-tune could cross it unnoticed, which is why it belongs in
  the automated gate rather than in anyone's memory.
- **Alternatives considered**: leaving tints out as "decorative" — rejected: they carry body text.
- **Which states actually use tints**: `bg-destructive/N` is essentially all of it (32 occurrences);
  `bg-info/N` has exactly 1 (a decorative `blur-3xl` orb in `Login.jsx` with no text on it); and
  `bg-success/N` and `bg-warning/N` have **zero**. The contract still measures all four, because the
  invariant is what stops the next `bg-success/10 text-success` callout from shipping broken — but
  it is worth being honest that two of the four columns currently guard a pattern with no
  consumers.
- **Deliberately outside the check**: `bg-{state}/5` (6 occurrences) — a lighter tint strictly
  *raises* text-on-tint contrast, so 10% is the binding case and /5 needs no separate measurement.
  `bg-{state}/90` (4 occurrences, `button.jsx` hover) *is* a fill with a foreground and is measured
  here rather than lumped in with the tints: dark ink-on-/90 gives 5.44-8.93, light white-on-/90
  gives 5.45-5.68. All pass, no value moves — recorded so a future re-tune does not find this
  surface unmeasured.

### R5 — Update `DESIGN.md`
- **Decision**: widen the AA Floor Rule on **both** axes it currently falls short on, and record
  the dark-mode values alongside the light ones. Specifically:
  - surface: "against its paired foreground" → "against **every surface it renders on, including a
    tint of itself**, and against its paired foreground";
  - magnitude: "use one step darker" → "move **as many steps as measurement requires**, in the
    direction the theme needs — darker for light themes, lighter for dark — rather than picking a
    new hue".

  Both are required, not cosmetic: without the first the rule does not reach the failure this
  feature fixes, and without the second the 2-3 step dark values violate the rule in the same
  commit that restates it. Three further spots in `DESIGN.md` carry superseded values and are
  updated with it — the front-matter `colors:` block (lines 14-17), line 70's "darkened one step
  from their common defaults", and the Signal Red/Green/Amber/Blue list (lines 87-90).
- **Rationale**: `DESIGN.md` became governing documentation under constitution 1.3.0 and currently
  documents only light-mode reasoning, which is how a reader would conclude the current dark values
  are intentional. It already gained the inert-border warning for the same reason.
- **Alternatives considered**: (a) deferring the doc update to a later docs pass — rejected: the
  gap is what allowed this bug to read as intentional, so fixing the values without the doc leaves
  the trap armed. (b) Promoting the rule into the constitution instead — rejected: the constitution
  states principles and delegates visual specifics to `DESIGN.md`; duplicating it would create two
  sources of truth for one rule.

## Test / verification requirements

No automated frontend suite exists, so verification is explicit:

1. **Calculation** — recompute every ratio from the committed values; all eight pairings clear 4.5:1
   against the worst-case surface. This is the objective gate and is repeatable.
2. **Light-mode check** — the light values change by exactly one palette step each; confirm no
   hue drift and no fifth value touched (SC-004 as amended).
3. **Browser, both themes** — Bug Tracker, Taskboard, Work Program, Retrospectives, Support Ops,
   Dashboard: status text, badges (text and filled), error messages, overdue emphasis.
4. **The four removals** — confirm each `MyWorkPanel.jsx` site renders the same or better in dark
   mode with the override gone.
5. **Backend suite green** — a regression check that nothing unrelated moved; expected untouched.
6. **`npm run build` and `npm run lint`, checked by exit code** — not by reading the summary text.
   ESLint's "0 errors and N warnings potentially fixable" line counts auto-fixable items, not total
   errors; misreading it hid a real error during 021.

## Deferred follow-ups (recorded, not 022)

1. Build-time contrast enforcement (a lint rule or CI check over the token file) so a future value
   cannot regress silently.
2. The remaining `--primary`/`--accent`/`--muted-foreground` pairings were not audited here; worth
   a sweep on the same basis.
3. `prefers-contrast: high` and `forced-colors` handling — the app currently defines neither.
4. Retokenise the Gantt bar palette (`WorkProgram.jsx:580-611`) and the Reports progress bar
   (`Reports.jsx:239`). Seven hard-coded status hex literals plus a stale accent (`#aa3bff`, since
   superseded by `#a631ff`) that this feature deliberately leaves alone — see plan.md Complexity
   Tracking. They will visibly drift from the rest of the app after 022, which is the argument for
   doing this soon rather than eventually.
6. **`--primary` does not satisfy the widened AA Floor Rule in light mode.** Measured, `#a631ff`
   gives 4.19:1 as text on `--muted` and 3.40-4.03:1 on its own 10-15% tints, at 17 live
   `bg-primary/10 text-primary` call sites — the identical pattern this feature fixed for the status
   colours. Dark-mode `#c084fc` passes (worst 4.78:1). Deliberately **not** fixed here: it is not a
   status colour, and it is not a token swap — violet-600 `#9333ea` reaches 4.90:1 on `--muted` but
   still only 4.00:1 on a 15% tint, so the real fix is probably that `text-primary` should stop
   sitting on `bg-primary/15` at small sizes. Recorded in `DESIGN.md` beside the rule as a known
   exception rather than hidden by narrowing the rule to exclude accents.
5. `--destructive` on its own 15% tint clears AA by 0.039 (4.539 vs 4.5) in light mode — the
   tightest margin in the system. Any future change to `--muted` or to the tint opacity breaks it.
   The gate script catches it; this note is so the thinness is not a surprise when it does.
