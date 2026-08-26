---
name: iTrack
description: A project management workspace where every view reads the same tracked hierarchy.
colors:
  primary: "#a631ff"
  primary-dark-mode: "#c084fc"
  primary-foreground: "#ffffff"
  neutral-bg: "#ffffff"
  neutral-fg: "#08060d"
  neutral-card: "#ffffff"
  neutral-secondary: "#f4f3ec"
  neutral-muted-fg: "#6b6375"
  neutral-border: "#e5e4e7"
  destructive: "#b91c1c"
  destructive-dark: "#f87171"
  success: "#166534"
  success-dark: "#4ade80"
  warning: "#92400e"
  warning-dark: "#fbbf24"
  info: "#1d4ed8"
  info-dark: "#60a5fa"
typography:
  body:
    fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif"
  mono:
    fontFamily: "ui-monospace, Consolas, monospace"
rounded:
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.neutral-card}"
    textColor: "{colors.neutral-fg}"
    rounded: "{rounded.lg}"
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
---

# Design System: iTrack

## Overview

**Creative North Star: "The Violet Ledger"**

iTrack tracks accountability, not attention — every screen exists so a Project Manager, Department
Head, or Client can find who owns a task, whether it's late, and what's blocking it, faster than
asking someone. The visual system stays out of that job's way: a near-white ground, near-black ink,
one deliberate violet accent (`#a631ff` — a hue no other project-management tool in this space
reaches for; most default to blue) reserved for the actions and states that actually need attention,
and flat, thin-bordered surfaces everywhere data has to be scanned in volume — tables, Kanban cards,
Gantt bars. Nothing here is decorative; the shadcn/Radix foundation is used exactly as shipped, not
reskinned.

**Key Characteristics:**
- One accent color (violet), used sparingly against a near-white/near-black neutral pair
- Flat surfaces with a single shadow tier (`shadow-sm`), not a layered elevation system
- Semantic status colors (destructive/success/warning/info) carry real WCAG AA-checked contrast, not
  swatch-picked defaults
- A true dark mode (class-toggled, not just `prefers-color-scheme`), with the same role structure

## Colors

The palette is a single accent against a warm-neutral/near-black pair, with four semantic status
colors held to the AA Floor Rule below. Each has a **separate value per theme** — deeper than the
common default in light mode, lighter in dark. A status color that is the same hex in both themes
is a bug, not a simplification: that is precisely how all four shipped failing AA in dark mode
until feature 022.

### Primary
- **Violet Ledger** (`#a631ff`; dark mode `#c084fc`): the one accent. Primary actions, active/selected
  states, links, focus rings. Darkened ~2% in lightness from an earlier `#aa3bff` specifically to
  cross 4.5:1 contrast for white text (now 4.66:1) — treat that value as a floor, not a rounding
  target.

### Neutral
- **Paper White** (`#ffffff`): page and card background.
- **Ink** (`#08060d`): primary text, near-black rather than pure black.
- **Parchment** (`#f4f3ec`): secondary surfaces, muted backgrounds, and the default hover/accent fill —
  warm rather than cool-grey.
- **Ash** (`#6b6375`): muted/secondary text.
- **Hairline** (`#e5e4e7`): borders and input outlines.

### Semantic status
Each is a **pair**: the color, and the ink that goes on top of it when it is used as a fill.
Light mode / dark mode:

- **Signal Red** (`#b91c1c` / `#f87171`) — destructive.
- **Signal Green** (`#166534` / `#4ade80`) — success.
- **Signal Amber** (`#92400e` / `#fbbf24`) — warning.
- **Signal Blue** (`#1d4ed8` / `#60a5fa`) — info.

Foreground ink is `#ffffff` in light mode and `#16171d` in dark — the same on-accent ink
`--primary-foreground` already uses, not a second one. The dark fills are light enough to read as
text on a dark surface, which is exactly what makes white illegible on top of them (1.67-2.77:1),
so the two halves of each pair move in opposite directions.

Ratios are recorded beside the tokens in `frontend/src/index.css` and are checkable without running
the app: `python specs/022-dark-status-contrast/contracts/verify-contrast.py`.

### Named Rules
**The AA Floor Rule.** No status or accent color ships at a lightness that fails 4.5:1 against
**every surface it renders on — including a tint of itself** — or against its paired foreground.
Where a common default (e.g. Tailwind's 500-weight green/amber/blue) fails, move **as many steps as
measurement requires**, in the direction the theme needs — darker for light, lighter for dark —
rather than picking a new hue.

Both halves of that were learned the hard way in feature 022. The rule used to say "against its
paired foreground", and by that test the light values passed while failing as *text* on `--muted`
(4.34:1) and on their own 10-15% tints (3.45-3.79:1) at 26 call sites — a surface nobody had
thought to measure. It used to say "one step", which is enough in light mode but not in dark: the
500-weight reaches only 4.31:1 (red) and 4.41:1 (blue) against `#1f2028`, so the dark values are
two steps for red and blue and three for green and amber.

The rule is only as good as the measurement, so measure rather than eyeball — and check the tint
and the fill, not just the text.

**The One Accent Rule.** Violet is the only expressive color in the system. Status colors communicate
state, not brand; they are not substitutes for the primary accent on non-status UI.

## Typography

**Body Font:** system-ui, 'Segoe UI', Roboto, sans-serif
**Mono Font:** ui-monospace, Consolas, monospace

**Character:** Deliberately unbranded — the system leans on the OS's native UI font rather than a
licensed or Google-Fonts display face, because the product is an operating tool, not a marketing
surface. There is no custom type scale: components apply Tailwind's default utility scale directly
(`text-xs` through `text-2xl`) rather than semantic display/headline/title/body size tokens.

### Named Rules
**The Utility-Scale Rule.** Type sizing is Tailwind's default scale used inline, not a bespoke ramp.
Do not introduce a parallel semantic type-token system without a project-wide reason — a component's
"heading" is `text-2xl font-semibold` because `CardTitle` says so, not because a `--font-display`
token exists.

## Layout

No documented grid or container system beyond Tailwind's default breakpoints and utility spacing —
layout is composed per-page with flex/grid utilities rather than a shared container component.
Responsive behavior is handled per-component (see `App.css`/page-level media rules), not through a
single layout primitive.

## Elevation & Depth

Flat by default. The only shadow in use is `shadow-sm` on `Card`, applied at rest — not as a
hover/active response. There is no multi-tier elevation system; surfaces are separated by the
`Hairline` border color, not by shadow depth.

### Named Rules
**The Flat-By-Default Rule.** Don't add elevation beyond `shadow-sm`. If a surface needs to stand out,
reach for the border or the accent color, not a heavier shadow.

## Shapes

Radius scale: `sm` (0.375rem), `md` (0.5rem), `lg` (0.75rem), `xl` (1rem), plus `full` (pill) for
badges. Buttons and inputs use `md`; cards use `lg`; badges use `full`. No sharp-corner (radius `0`)
components exist in the system — everything is at least softly rounded.

## Components

### Buttons
- **Shape:** `rounded-md` (0.5rem)
- **Variants:** `default` (violet fill), `secondary` (parchment fill), `outline` (hairline border,
  transparent fill), `ghost` (no fill until hover), `link` (text-only, underline on hover),
  `destructive`/`success`/`warning`/`info` (semantic fills)
- **Sizes:** `sm` (h-9), `default` (h-10), `lg` (h-11), `icon` (square h-10 w-10)
- **Focus:** 2px ring in the accent color, offset from the button edge — never a border-color change
  alone

### Badges
- **Style:** pill (`rounded-full`), small (`text-xs`), same variant set as buttons minus `outline`'s
  transparent style (badges' `outline` variant keeps a visible border instead)
- **Use:** status/role/count labels inline with text, not standalone UI

### Cards
- **Corner Style:** `rounded-lg` (0.75rem)
- **Background:** Paper White (`neutral-card`)
- **Shadow Strategy:** `shadow-sm` only, at rest (see Elevation & Depth)
- **Border:** 1px Hairline
- **Internal Padding:** `p-6` header/content, content top padding removed (`pt-0`) so header and body
  sit close together

### Inputs / Fields
- **Style:** Hairline border, Paper White background, `rounded-md`, `h-10`
- **Focus:** 2px accent ring with offset, border unchanged (the ring carries the focus signal, not the
  border color)
- **Disabled:** 50% opacity, `cursor-not-allowed`

### Group Summary Bar (signature component)
`GroupSummaryBar.jsx` is the shared collapsed-group-header pattern (an accent bar plus a
segmented/progress summary) reused across Taskboard, Bug Tracker, Retrospectives, and Work Program's
List view whenever grouped rows are collapsed. Any new grouped view extends this component rather than
inventing a parallel collapsed-header treatment.

## Do's and Don'ts

### Do:
- **Do** keep violet as the only expressive accent; introduce color elsewhere only through the four
  semantic status colors.
- **Do** use `shadow-sm` as the single elevation tier; don't reach for `shadow-md`/`lg` to make
  something feel "more important" — use the accent or a heavier border instead.
- **Do** respect `prefers-reduced-motion` globally — the codebase already neutralizes
  animation/transition duration app-wide for it; any new animation must not bypass that.
- **Do** reuse `GroupSummaryBar` for any new collapsed-group UI rather than building a one-off header.

### Don't:
- **Don't** ship a status or accent color that fails 4.5:1 contrast against its paired foreground —
  darken one step rather than using a library's default swatch value.
- **Don't** introduce a second display/heading font or a parallel type-scale token system; the
  Utility-Scale Rule already governs sizing.
- **Don't** use pure black (`#000`) or pure white borders/shadows — the system's black is `#08060d`
  and its border is `#e5e4e7`, both slightly warm/off rather than absolute.
- **Don't** build a new marketing-style hero, gradient, or decorative illustration into any of these
  surfaces — every one of them is Operate mode (see PRODUCT.md and the constitution's Frontend Design
  and Review Governance section), not Persuade.
