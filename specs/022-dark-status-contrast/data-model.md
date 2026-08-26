# Data Model — 022 Dark-Mode Contrast for Semantic Status Colours

**No persisted data, no schema, no migrations.** The only "model" here is the design-token pair
and the contract it holds with the surfaces it renders against.

## Entity: Semantic status colour pair (existing)

Each of the four states is a **pair** of CSS custom properties, defined once per theme in
`frontend/src/index.css`:

| Property | Role |
|---|---|
| `--{state}` | the colour itself — used as text, border, or fill |
| `--{state}-foreground` | the colour of text placed **on top of** `--{state}` when it is a fill |

States: `destructive`, `success`, `warning`, `info`.

The pair is the unit. Changing one without the other is what produces the class of bug this
feature fixes: a value can be correct as text and wrong as a background simultaneously.

## Entity: Surface (existing)

A background a status colour renders against. Contrast is a property of the **pairing**, never of
a colour alone — which is why the worst-case surface, not the typical one, sets the requirement.

| Token | Light | Dark |
|---|---|---|
| `--background` | `#ffffff` | `#16171d` |
| `--card` | `#ffffff` | `#1c1d24` |
| `--muted` / `--secondary` | `#f4f3ec` (**darkest light surface — binding**) | `#1f2028` (**lightest dark surface — binding**) |

Plus **composited tints**: at least 10 call sites render `text-{state}` directly on
`bg-{state}/10` or `/15`, which is a surface in none of the three rows above. These are part of
the contract (research.md R6) and are measured by blending the state colour at 10% and 15% over
each base surface.

## The contract

Two invariants, both of which must hold in **both** themes:

1. **As text** — `contrast(--{state}, S) ≥ 4.5:1` for every surface `S` the state renders on.
   The binding surface is the lightest dark one (`#1f2028`) in dark mode and the darkest light one
   (`#f4f3ec`) in light mode.
2. **As a fill** — `contrast(--{state}-foreground, --{state}) ≥ 4.5:1`.

4.5:1 is the normal-text threshold. Status labels in this product are frequently rendered below
body size, so the large-text allowance of 3:1 deliberately does not apply.

## Values

### Light mode — all four move one palette step darker

| State | `--{state}` | as text | on tint | `--{state}-foreground` | as fill |
|---|---|---|---|---|---|
| destructive | `#dc2626` → **`#b91c1c`** | 4.34 → **5.82** | 3.45 → **4.54** | `#ffffff` (unchanged) | 4.83 → **6.47** |
| success | `#15803d` → **`#166534`** | 4.51 → **6.41** | 3.72 → **5.14** | `#ffffff` (unchanged) | 5.02 → **7.13** |
| warning | `#b45309` → **`#92400e`** | 4.51 → **6.37** | 3.70 → **5.07** | `#ffffff` (unchanged) | 5.02 → **7.09** |
| info | `#2563eb` → **`#1d4ed8`** | 4.65 → **6.02** | 3.79 → **4.79** | `#ffffff` (unchanged) | 5.17 → **6.70** |

"As text" is worst-case against `--muted` `#f4f3ec`; "on tint" is worst-case on a 10–15% tint of
the state over any light surface. The foregrounds stay white — darkening the fill only improves
white-on-fill.

Every light value fails today on at least one count, which is why all four move rather than just
destructive. The thinnest result afterwards is destructive on its own tint at 4.54:1.

### Dark mode — all eight values change

| State | `--{state}` | as text | on tint | `--{state}-foreground` | as fill |
|---|---|---|---|---|---|
| destructive | `#dc2626` → **`#f87171`** | 3.36 → **5.86** | 2.75 → **4.67** | `#ffffff` → **`#16171d`** | 4.83 → **6.46** |
| success | `#15803d` → **`#4ade80`** | 3.23 → **9.30** | 3.26 → **6.78** | `#ffffff` → **`#16171d`** | 5.02 → **10.26** |
| warning | `#b45309` → **`#fbbf24`** | 3.23 → **9.71** | 3.24 → **6.94** | `#ffffff` → **`#16171d`** | 5.02 → **10.71** |
| info | `#2563eb` → **`#60a5fa`** | 3.14 → **6.38** | 2.94 → **4.92** | `#ffffff` → **`#16171d`** | 5.17 → **7.03** |

"As text" is worst-case against `#1f2028`; "on tint" is worst-case on a 10–15% tint of the state
over any base surface. Every value to the right of an arrow clears 4.5:1.

Read the fill column carefully: today's dark fills **pass** (4.83–5.17, white on the dark values).
They are not part of the problem — they become the problem the moment the fill is lightened and
the foreground is not moved with it, at which point white-on-fill would drop to 1.67–2.77. That is
why both halves change together, and why "just lighten the four colours" is the wrong fix.

## State transitions

None. These are static values; there is no runtime state, no user-configurable theme colour, and
no persistence. Theme selection itself (the `.dark` class on the root element) is pre-existing and
untouched.

## Consumers

- **28 files** read these tokens through Tailwind's semantic utilities (`text-destructive`,
  `bg-success`, `border-warning`, …). None reads the custom property directly.
- **8 call sites** pair a solid fill with a foreground and therefore depend on invariant 2 — all
  variant definitions in `components/ui/badge.jsx` and `components/ui/button.jsx`. (A raw grep for
  `bg-{state}` returns 47, but 37 are opacity tints and 2 are bare bars with no text.)
- **~10 call sites** render status text on a composited tint of the same colour; see the Surface
  section.
- **4 call sites** (all `frontend/src/components/MyWorkPanel.jsx`) currently override the token in
  dark mode and are removed by this change; see research.md R3 for why the other 16 superficially
  similar occurrences are **not** in scope.
