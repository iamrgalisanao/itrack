# Implementation Plan: Dark-Mode Contrast for Semantic Status Colours

**Branch**: `022-dark-status-contrast` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-dark-status-contrast/spec.md`

## Summary

`frontend/src/index.css`'s `.dark` block redeclares the four semantic status colours with the
**same hex values as light mode**, so all four fail WCAG AA on every dark surface (measured
3.14:1–3.70:1 against `#16171d`/`#1c1d24`/`#1f2028`; AA needs 4.5:1).

The fix moves **twelve** token values:

- **Eight in dark mode.** Lightening a colour to clear AA as *text* simultaneously breaks
  white-on-fill, so each `--*-foreground` must flip from white to the dark theme's on-accent ink.
  The two halves of each pair move in opposite directions — that is what the pair is for.
- **Four in light mode.** Verification, and then the gate script itself, found light mode was never
  held to the rule either: `--destructive` fails as text (4.34:1 against `--muted`), and **all
  four** fail where status text sits on a tint of its own colour (3.45–3.79:1) — a pattern used at
  26 call sites across 15 files. Each light colour moves one palette step darker.

Four call-site workarounds then come out — all in `MyWorkPanel.jsx`, all added during 021 — leaving
the token as the single source of truth.

No new tokens, no hue changes, no backend surface.

## Technical Context

**Language/Version**: JavaScript (no TypeScript) / React `^19.2.6`, Vite `^8.0.12`, Tailwind `^4.3.1` (verified `frontend/package.json`). No backend involvement — `backend/composer.json` untouched.

**Primary Dependencies**: None added. CSS custom properties in `frontend/src/index.css`, consumed through existing Tailwind semantic utilities (`text-destructive`, `bg-success`, …).

**Storage**: N/A — presentation layer only. **No migrations.**

**Testing**: No automated frontend test suite exists (CI runs build + lint only). Verification is (a) a contrast calculation over the committed token values, and (b) browser inspection in both themes. Backend suite must stay green as a regression check that nothing unrelated moved.

**Target Platform**: Web SPA, light and dark themes. Dark mode is class-toggled (`.dark` on the root element), not `prefers-color-scheme`.

**Project Type**: Frontend-only change to an existing web application.

**Performance Goals**: N/A — no runtime cost; values are static custom properties.

**Constraints**: Light-mode colours move exactly one palette step darker each and nothing else changes (SC-004, as amended). Hues must stay recognisable in both themes (FR-003) — move within the hue family, never reassign. Every status colour must clear AA against the **lightest** dark surface (`#1f2028`) and the **darkest** light surface (`#f4f3ec`), plus a 10-15% tint of itself over either — those are the worst cases, not the card.

**Scale/Scope**: 12 token values in one file; **5** class deletions across **two** files — 4 workaround overrides in `MyWorkPanel.jsx` (lines 88, 91, 101, 169) and 1 dead `text-white` in `Schedule.jsx` (line 655). 28 files consume the tokens. Fill usage is far more contained than first scoped: of 47 `bg-{state}` occurrences, 37 are opacity tints and only **8** are solid fills paired with a `-foreground`, all of them variant definitions in `components/ui/badge.jsx` and `components/ui/button.jsx`.

### Coding-Standard Constraints

From `react-vite-best-practices` and the repo's own conventions — the specific rules binding this change:

1. **No new dependencies** and no `vite.config` change; this is a values-only edit (also a constitution Delivery Constraint).
2. Colour reaches components **only** through the existing Tailwind semantic utilities backed by the tokens. No inline `style={{ color: … }}`, no new hex literals in JSX.
3. The `@theme inline` block that maps CSS variables to Tailwind utilities is **not** restructured — only the values inside `:root` and `.dark` change, so every existing utility keeps working unchanged.
4. Removing an ad-hoc override must be a pure deletion. If a call site needs anything beyond deleting `dark:text-*`, that is a signal the token is still wrong — fix the token, not the call site.

From `code-slop`, for the review pass:
5. No compensating comment left behind explaining a removed workaround; the token change is self-evident in the diff.
6. The recorded contrast ratios belong in the token file as a comment (a constraint the code cannot express), not scattered across call sites.

**Not applicable, explicitly**: `php-best-practices`, `laravel-best-practices`, `laravel-testing`, `laravel-owasp-security` — this change has no PHP, no endpoint, no auth, no data-exposure surface. Recorded here so the Definition-of-Done gate can mark them N/A rather than skipped.

### Frontend Design Constraints

Applying `frontend-design` and `impeccable` (Operate mode — these are internal task-completion
surfaces, not persuasion surfaces), per constitution 1.3.0.

- **Visual direction**: unchanged. This is a correction *within* the existing design system, not a
  redesign. The product's colour language — one violet accent, four semantic status colours, flat
  surfaces — is preserved exactly; only the dark-theme values of four of those colours move.
- **Existing system reused**: the `:root` / `.dark` token pair in `frontend/src/index.css`, the
  `@theme inline` mapping, and the existing semantic Tailwind utilities. Nothing new is introduced;
  no component is restyled.
- **The design-system rule this change amends**: `DESIGN.md`'s **AA Floor Rule** reads "No status
  or accent color ships at a lightness that fails 4.5:1 *against its paired foreground*. Where a
  common default (e.g. Tailwind's 500-weight green/amber/blue) fails, use *one step darker* instead
  of picking a new hue." Verification established that neither clause reaches this bug, so the plan
  does not get to claim the rule already prescribes the fix:
  - **Surface**: the rule constrains only fill-vs-foreground. By that literal test today's light
    values *pass* (white-on-fill 4.83-5.17). What actually fails is text on `--muted` (4.34) and
    text on a tint of itself (3.45-3.79) — surfaces the rule never mentions.
  - **Magnitude**: the dark values are **two steps** (red 600→400, blue 600→400) and **three**
    (green 700→400, amber 700→400), not one. One step was measured and rejected: 500-weight red
    reaches 4.31 and blue 4.41 against `#1f2028` (R1 alternative (a)).

  So R5 widens the rule on both axes — to "against **every surface it renders on, including a tint
  of itself**, and against its paired foreground" and "**as many steps as measurement requires**, in
  the direction the theme needs". Shipping 2-3 step values under a rule that says one step would
  otherwise violate the rule in the same commit that restates it.
- **Chosen values** (400-weight, verified worst-case against `#1f2028`): destructive `#f87171`
  (5.86:1), success `#4ade80` (9.30:1), warning `#fbbf24` (9.71:1), info `#60a5fa` (6.38:1).
  500-weight was rejected: red `#ef4444` (4.31:1) and blue `#3b82f6` (4.41:1) both fail.
- **Paired foregrounds must move too**: with 400-weight fills, white foreground would drop to
  1.67–2.77:1. Each `--*-foreground` flips to **`#16171d`** in dark mode (worst case 6.46:1) —
  the value `.dark` already uses for `--primary-foreground`, so the dark theme keeps one on-accent
  ink rather than gaining a second. `#08060d` (the light theme's `--foreground`, and the value
  `DESIGN.md` calls "the system's black") also clears AA at 7.28:1 and was the first choice;
  Existing Design System First favours the incumbent dark-theme convention. This pairing is why
  the change is eight dark tokens rather than four, and it is contained to `badge.jsx` and
  `button.jsx`, the only two files that pair a fill with a foreground.
- **Light mode is corrected too**, one palette step darker per state: destructive
  `#dc2626` → `#b91c1c`, success `#15803d` → `#166534`, warning `#b45309` → `#92400e`, info
  `#2563eb` → `#1d4ed8`. Worst case afterwards is 4.54:1 (destructive on its own 15% tint over
  `--muted`) — thin but passing; `#991b1b` would give 5.76:1 at the cost of a larger visual jump,
  and the AA Floor Rule says one step. This is a **perceptible** light-mode change: status colours
  get slightly deeper. That is the rule the design system already committed to; the light values
  simply were never measured against `--muted` or against their own tints.
- **Interface states affected**: error/validation text, success confirmations, warning banners,
  informational callouts, status badges (both text and filled variants), and overdue emphasis.
  Loading, empty, disabled and permission-denied states use neutral tokens and are unaffected.
- **Responsive**: no layout change; the fix applies at every breakpoint identically. Small text is
  the binding case — the AA threshold used is the normal-text 4.5:1, not the large-text 3:1.
- **Accessibility**: this *is* the accessibility change. It must not conflict with a user's
  `prefers-contrast` or `forced-colors` setting; forced-colors overrides author colours by design
  and is left to the platform.
- **Removals**: exactly four overrides, all in `MyWorkPanel.jsx` (lines 88, 91, 101, 169), each
  pairing a semantic token with a palette override (`text-destructive dark:text-red-400`). The
  ~46 remaining `dark:text-*-400` occurrences are deliberate light/dark pairs on **palette**
  colours in badge/priority class maps — correct design, explicitly out of scope, and deleting one
  is a pre-registered blocking finding.
- **Impeccable (Operate mode)**: `scripts/context.mjs` was run during planning and its
  `reference/shape.md` consulted; the `shape` pass is what surfaced the composited-tint surfaces
  now covered by the contract. `polish` and `harden` are **N/A** for this change and recorded as
  such in Complexity Tracking rather than claimed — there is no component structure or interaction
  to polish or harden; the diff is twelve CSS values and five class-attribute deletions.

## Constitution Check

*GATE: evaluated before Phase 0 research; re-checked after Phase 1 design.*

| Principle | Pre-research | Post-design |
|---|---|---|
| I — Fail-closed access control | N/A — no authorization surface | N/A |
| II — Consistent API contracts | N/A — no API change | N/A |
| III — Tests grow with the feature | PASS — no backend surface to test; verification is calculation + browser, per the project's stated UI-testing practice | PASS |
| IV — Audit sensitive mutations | N/A — no mutation | N/A |
| V — Additive, reversible migrations | PASS (trivially) | PASS — **zero migrations** |
| VI — Real auth only | N/A | N/A |
| VII — Installed skills govern | PASS | PASS — Coding-Standard Constraints above; backend skills explicitly marked N/A rather than skipped |
| VIII — Definition-of-Done gate | PASS (planned) | PASS — quickstart carries the gate, with OWASP/backend items marked N/A and justified |
| Frontend Design Governance (1.3.0) | Applies | PASS — Frontend Design Constraints above. `impeccable` applied across the full lifecycle, not just review: `context.mjs` run and `shape` consulted during planning; `audit` + `critique` carried into quickstart's review pass; `polish`/`harden` recorded as N/A with justification in Complexity Tracking rather than silently omitted |

No violations → Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/022-dark-status-contrast/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 — measured evidence and value selection
├── data-model.md        # Phase 1 — the token pairs and their contract
├── quickstart.md        # Phase 1 — verification + DoD gate
├── contracts/
│   └── status-tokens.md # Phase 1 — the token contract and ratio table
└── checklists/
    └── requirements.md  # Spec quality checklist (complete)
```

### Source Code (repository root)

```text
frontend/
├── src/index.css                       # MODIFIED — 8 values in .dark and 4 in :root, and the
│                                       #   stale "one Tailwind shade darker" comment at lines
│                                       #   31-34 REPLACED (not appended to) by the ratio table
├── src/components/MyWorkPanel.jsx      # MODIFIED — delete the dark: half at lines 88, 91,
│                                       #   101, 169. Every other dark:text-*-400 in the repo
│                                       #   is a legitimate palette pair and stays.
└── src/pages/Schedule.jsx              # MODIFIED — delete the dead `text-white` at line 655,
                                        #   which sits on bg-destructive and would measure
                                        #   2.77:1 against the new dark fill if it ever rendered

DESIGN.md                               # MODIFIED — four edits, all required:
                                        #   1. AA Floor Rule widened on both axes (see above)
                                        #   2. front-matter colors: block, lines 14-17
                                        #   3. line 70 "darkened one step from their common
                                        #      defaults"
                                        #   4. lines 87-90 Signal Red/Green/Amber/Blue values,
                                        #      which gain their dark-theme counterparts
```

**Structure Decision**: A values-only change to the existing token file plus deletions at call
sites. No new files, no new components, no restructuring. `DESIGN.md` is updated because it is now
governing documentation (constitution 1.3.0), currently records only the light-mode reasoning, and
states the rule this change has to widen — quickstart pre-registers "`DESIGN.md` not updated" as a
blocking Major, so leaving any of its four stale spots would fail the feature's own gate.

## Complexity Tracking

No constitution violations. Two items recorded for transparency rather than as exceptions:

| Item | Why | Alternative rejected |
|---|---|---|
| `impeccable` `polish` and `harden` not run | The diff is twelve CSS values and five class-attribute deletions. There is no component structure, interaction, or motion to polish or harden — both commands operate on a surface this change does not have. `context.mjs`, `shape`, `audit` and `critique` all are applied. | Running them anyway to claim full coverage — rejected as ceremony that would produce findings about components this feature does not touch. |
| **Accepted exclusion**: seven hard-coded status hex literals stay as they are — the Gantt bar palette in `WorkProgram.jsx:580-611` and the progress-bar colour in `Reports.jsx:239` | These are a **separate decorative palette**, not the semantic tokens: two-stop gradients (`linear-gradient(135deg, #ef4444, #dc2626)`) that no single token maps onto, plus a stale accent (`#aa3bff`, superseded by `#a631ff`). Retokenising them is a visual redesign of the Gantt bars, which this feature is explicitly not. They carry no text, so no AA text pairing is at stake. | Swapping them for `var(--destructive)` etc. — rejected: it changes the bars' appearance and would smuggle a redesign into a contrast fix. **Consequence accepted and stated**: after 022 these two files keep the pre-change colours in both themes while every other status surface moves, so Work Program's Gantt and the Reports bar will visibly drift from the rest of the app. Recorded as research.md follow-up 5, not left implicit. |

### Verification outcome

An independent Software Architect pass raised **11 findings** against the first draft of these
artifacts, all resolved above. The three that changed the plan materially:

- **F1** — light `--destructive` fails AA at 4.34:1, so the quickstart gate (which checks both
  themes) could never have passed under the original "light mode must not change" constraint.
  Scope expanded to fix it; SC-004 amended.
- **F3** — "43 fill call sites" was inflated roughly fivefold; the real figure is 8 fill+foreground
  pairings, confined to `badge.jsx` and `button.jsx`. The decision it supported still holds and is
  now better contained.
- **F4** — 37 opacity-tinted surfaces were outside the contract despite the spec naming them as an
  edge case. Now measured (worst case 4.67:1) and added to both the contract and the gate.

**Second pass** (required: the first pass grew scope from 9 token values to 12, so verification was
re-dispatched on the changed surface). It confirmed the arithmetic, the gate script, the Tailwind
palette steps, the call-site counts and that the tokens are defined in exactly two places — then
raised **11 more findings**, all resolved above. The four that changed something real:

- **F1/F2 — the plan's stated justification did not cover its own values.** It claimed the AA Floor
  Rule already prescribed the fix. It does not, on either axis: the rule as written constrains only
  fill-vs-foreground (by which today's light values *pass*), and says "one step", while the dark
  values are two steps for red/blue and three for green/amber — one step having been measured and
  rejected at 4.31/4.41. The values were right; the reasoning was not. R5 now widens the rule on
  both axes, and the plan no longer claims cover it does not have.
- **F3 — four wrong numbers in the one table whose purpose is recorded measurement.** The dark
  "on tint" before-column was scrambled (2.75/3.26/3.24/2.94 vs the true 3.03/2.83/2.83/2.75). The
  feature's own gate script had been printing the correct values the whole time. Both artifacts now
  quote its output instead of hand-transcribing.
- **F8 — the tint call-site list was 8 files, the reality is 15.** The omissions included
  `WorkProgram.jsx` — one of the six screens spec.md's Independent Test names — so four Work Program
  callouts would have gone unlooked-at in the browser pass. No ratio changes; the coverage does.
- **F9/F10 — two surfaces outside the token system.** The Gantt bar palette
  (`WorkProgram.jsx:580-611`) and the Reports progress bar hard-code status hex literals the token
  change cannot reach; they are now an explicit accepted exclusion with the resulting visual drift
  stated, not an unexamined gap behind "no other frontend file changes". `Schedule.jsx:655`'s dead
  `text-white` on `bg-destructive` is deleted, making this five class deletions rather than four.

Both passes are recorded because the pattern matters more than either finding: the parts of this
plan that were wrong were the parts asserted from memory, and the parts that caught them were the
parts computed from the committed file.
