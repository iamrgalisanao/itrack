# Data Model — 023 Legible Gantt Labels and Tokenised Chart Colours

**No persisted data, no schema, no migrations.** The "model" is a status→colour map and the
contract it holds with the surfaces it renders on.

## Entity: Gantt status entry (new)

One entry per status in `frontend/src/lib/ganttPalette.js`:

| Field | Meaning |
|---|---|
| `fill` | the token name whose value paints the bar |
| `ink` | the token name whose value paints anything drawn *on* the bar — the percentage label and the milestone diamond |

The pair is the unit, exactly as in 022: a fill is only correct in company with the ink that sits on
it. Storing token **names** rather than values keeps the module free of colour literals, which is
the defect this feature removes.

## Entity: Status (existing, authoritative in the backend)

`DetailedActivityController.php:119` — `backlog`, `not_started`, `in_progress`, `for_review`,
`completed`, `blocked`, `delayed`. Plus `pending`, synthesised client-side by `getRollupStatus`
(`WorkProgram.jsx:304`) for parent rows.

**Eight values.** The current switch handles seven names, one of which (`review`) matches nothing,
so three real statuses reach their colour through `default`.

## Entity: Progress overlay (existing)

A translucent fill covering the completed portion of a bar: `left:0`, `width:{progress}%`. It is the
surface the label actually sits on, and therefore what determines legibility. Declared in the module
as a token plus an alpha so the gate measures the value the app actually renders.

## The map

| Status | `fill` | `ink` | Change |
|---|---|---|---|
| `completed` | `success` | `success-foreground` | source only |
| `in_progress` | `info` | `info-foreground` | source only |
| `for_review` | `warning` | `warning-foreground` | **red → amber** |
| `delayed` | `destructive` | `destructive-foreground` | **amber → red** |
| `blocked` | `destructive` | `destructive-foreground` | red, now explicit |
| `backlog` | `muted-foreground` | `background` | **red → neutral** |
| `not_started` | `muted-foreground` | `background` | **red → neutral** |
| `pending` | `muted-foreground` | `background` | **red → neutral** |

Rationale per row: [research.md R1](./research.md).

## The contract

Two invariants, both in **both** themes:

1. **On the bare bar** — `contrast(ink, fill) ≥ 4.5:1`.
2. **On the overlay** — `contrast(ink, blend(--foreground, fill, alpha)) ≥ 4.5:1`.

Plus one structural invariant that makes (2) durable rather than coincidental:

3. **Direction** — `sign(lum(--foreground) − lum(fill))` is opposite to `sign(lum(ink) − lum(fill))`.

With (3) holding, label contrast increases monotonically with alpha, so (1) is the binding case and
(2) can never be the thing that fails first. Losing (3) — for example by reverting the overlay to
white in light mode — silently reintroduces the original bug even at an alpha that happens to pass,
which is why it is asserted rather than assumed.

4.5:1 is the normal-text threshold. The label is 9px; the large-text allowance does not apply.

## Values

### Label ink on the bar, and on the 20% overlay

| Theme | destructive | success | warning | info | neutral |
|---|---|---|---|---|---|
| light | 6.47 / 8.60 | 7.13 / 9.25 | 7.09 / 9.26 | 6.70 / 8.77 | **5.73** / 7.72 |
| dark | 6.46 / 7.69 | 10.26 / 11.04 | 10.71 / 11.57 | 7.03 / 8.39 | 7.04 / 8.48 |

Worst case **5.73:1** (light neutral, bare bar). Every figure is `scripts/verify-contrast.py`
output; regenerate rather than retype.

### Before, for comparison

| Statuses | Bar | Label |
|---|---|---|
| `backlog`/`for_review`/`blocked` | `#ef4444` | 3.00 |
| `in_progress` | `#3b82f6` | 2.78 |
| `completed` | `#10b981` | 2.13 |
| `delayed` | `#f59e0b` | 1.86 |

### Monotonicity in overlay alpha (worst across all statuses, both themes)

| alpha | 0.00 | 0.10 | 0.20 | 0.30 |
|---|---|---|---|---|
| worst | 5.73 | 6.60 | 7.69 | 8.40 |

## Entity: Status pill (existing, `getGanttStatusColor`)

The badge beside each row, currently 24 Tailwind palette classes across four branches. It becomes
eight explicit branches on semantic utilities.

**One measured trap.** The four semantic states are safe as `bg-{state}/10 text-{state}` — that is
the pattern 022 already gates, at 4.54–6.94:1. The neutral states are **not**: the analogous
`bg-muted-foreground/10 text-muted-foreground` measures **4.23:1** on `--muted` in light mode, a
fail. Use `bg-muted text-muted-foreground` instead — **5.15:1 light, 6.38:1 dark**.

This is the same self-tint failure mode 022 found, arriving through a different token. It is
recorded here because the obvious symmetric choice is the wrong one.

## Entity: Critical-path emphasis (existing)

Applied *on top of* a status colour, so it has no fixed contrast partner among the fills — and
under the new map it collides at **1.00:1** with `delayed` and `blocked`. It moves off the bar to
`outline: 2px solid var(--foreground); outline-offset: 2px`, making its partner the row background:
**18.11–20.15:1 light, 14.73–16.25:1 dark**, independent of status.

## State transitions

None. These are static values. A task's status changes at runtime, which changes which entry is
selected — but the entries themselves never change.

## Consumers

- `frontend/src/pages/WorkProgram.jsx` — `getGanttBarStyles` (bar fill, critical-path outline),
  `getGanttStatusColor` (pill), `getGanttStatusLabel` (pill text), the overlay (`:2658`), the label
  (`:2665`), the milestone diamond (`:2672`).
- `scripts/verify-contrast.py` — reads the module as data and joins it to `index.css`'s tokens.
- Nothing else. `taskStatus.js` and `groupSummary.js` keep their own maps by design.
