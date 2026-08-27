# Contract — Semantic Status Token Pairs

The interface this feature exposes is not an API but a **design-token contract**: the guarantee
components rely on when they write `text-destructive` or `bg-warning` and expect it to be legible.

## The guarantee

> For every semantic state, in every theme: the colour is readable as text on any surface the app
> renders it on, and its paired foreground is readable on top of it as a fill.

Formally, for each state ∈ {destructive, success, warning, info} and each theme:

```
contrast(--{state}, S)                        ≥ 4.5:1   ∀ S ∈ surfaces
contrast(--{state}-foreground, --{state})     ≥ 4.5:1
```

`surfaces` = `--background`, `--card`, `--muted`/`--secondary`, **plus** the state colour
composited at 10% and 15% over each of those (the tints that 26 call sites across 15 files render
status text on). A tint of the colour is a surface like any other; omitting it was a verification
finding, not a design choice.

Two opacity variants sit outside that set deliberately. `bg-{state}/5` needs no separate check —
a lighter tint strictly raises text-on-tint contrast, so 10% is binding. `bg-{state}/90` (4 hover
states in `button.jsx`) is a **fill**, not a tint, and satisfies invariant 2 as measured: dark
ink-on-/90 5.44-8.93, light white-on-/90 5.45-5.68.

Threshold is WCAG AA for **normal** text; the 3:1 large-text allowance does not apply, because
status labels in this product are routinely rendered below body size.

## Consumer-facing surface (unchanged)

Components consume the contract only through the existing Tailwind semantic utilities:

| Utility | Reads | Invariant it depends on |
|---|---|---|
| `text-{state}` | `--{state}` | as text |
| `border-{state}` | `--{state}` | as text (border is decorative; contrast still desirable) |
| `bg-{state}` | `--{state}` | as fill — pairs with `text-{state}-foreground` |
| `text-{state}-foreground` | `--{state}-foreground` | as fill |

**No utility names change, no new utilities are added, and the `@theme inline` mapping is not
restructured.** Every existing call site keeps working untouched; only the values behind them move.

## What callers may and may not assume

**May assume:**
- Using `text-{state}` alone is correct in both themes. No `dark:` companion is needed or wanted.
- Using `bg-{state}` with `text-{state}-foreground` is correct in both themes.

**May not assume:**
- That the hex value is stable — it differs per theme by design and may be re-tuned, provided the
  invariants hold.
- That white is the foreground. In dark mode it is the ink colour; anything hard-coding `#fff` on
  a status fill is a bug.
- That the light and dark values are the same. Restating the light value in `.dark` is exactly the
  defect this feature fixes.

## Verification

The contract is checkable by calculation from the committed values alone — no running app needed.
`scripts/verify-contrast.py` implements it (it lived at `contracts/verify-contrast.py` while 022
was in flight): run it from the repo root, and it exits non-zero if
any pairing falls below 4.5:1.

```
as text = min over base surfaces of contrast(--{state}, S)
on tint = min over surfaces x {10%, 15%} of contrast(--{state}, blend(--{state}, S, a))
as fill = contrast(--{state}-foreground, --{state})
```

All three must be ≥ 4.5, in both themes. The current measured values and the resulting ratios are recorded in
[data-model.md](../data-model.md) and, for the implementer's benefit, as a comment beside the
tokens themselves (FR-006).

## Breaking-change policy

Changing any of the sixteen values (four states × two halves × two themes) is a contract change and
requires re-running the calculation
above. A value that satisfies one invariant but not the other is not acceptable — that is the
failure mode that produced this feature (a fill lightened for text legibility silently breaks
white-on-fill in badge.jsx and button.jsx, the two files that pair a fill with a foreground).
