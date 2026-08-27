# Contract — Gantt Palette Module and Gate Assertions

The interface this feature exposes is a **data module** plus the **six assertions** a build-time
gate makes about it. There is no API surface.

## The module

`frontend/src/lib/ganttPalette.js` — plain data only. No components, no hooks (the
`react-refresh/only-export-components` rule that turned CI red during 021).

```js
export const GANTT_STATUS_TOKENS = {
  backlog:     { fill: 'muted-foreground', ink: 'background' },
  not_started: { fill: 'muted-foreground', ink: 'background' },
  pending:     { fill: 'muted-foreground', ink: 'background' },
  in_progress: { fill: 'info',        ink: 'info-foreground' },
  for_review:  { fill: 'warning',     ink: 'warning-foreground' },
  blocked:     { fill: 'destructive', ink: 'destructive-foreground' },
  delayed:     { fill: 'destructive', ink: 'destructive-foreground' },
  completed:   { fill: 'success',     ink: 'success-foreground' },
}

export const GANTT_PROGRESS_OVERLAY = { token: 'foreground', alpha: 0.20 }

export const GANTT_LABEL_SUPPRESSED = ['not_started', 'pending']
```

Values are **token names**, never colours. A hex literal appearing in this file is the defect the
feature removes, reintroduced.

## The guarantee

> For every status, in every theme: anything drawn on a bar is readable both on the bare bar and on
> the progress overlay — and remains so at any overlay opacity.

```
contrast(ink, fill)                                  >= 4.5   for every status, every theme
contrast(ink, blend(overlay.token, fill, alpha))     >= 4.5   likewise
sign(lum(overlay.token) - lum(fill)) != sign(lum(ink) - lum(fill))
```

The third line is what makes the second durable. With ink and overlay on opposite sides of the
fill, contrast rises monotonically with alpha, so the bare bar is the binding case and the alpha is
a free visual choice. Without it, a passing alpha is a coincidence waiting to be tuned away.

## The assertions

Added to `scripts/verify-contrast.py`, which already reads `frontend/src/index.css` for token
values. Six in total — five about the module, plus assertion 6 about the recorded ratios. None can
pass vacuously.

1. **Parse guard.** The regex must yield **at least 8** entries, and `GANTT_PROGRESS_OVERLAY` must
   parse to a token name and a float. Zero entries is a hard failure, never a quietly skipped loop.
   Every assertion below is only as trustworthy as this one.

2. **Enum coverage.** Parse `in:backlog,not_started,...` from
   `backend/app/Http/Controllers/DetailedActivityController.php` and assert every value has an
   explicit key, plus `pending`. **This is the assertion that would have caught the current bug** —
   `backlog`, `for_review` and `blocked` reaching red through a `default` branch. Adding a status
   backend-side without a Gantt colour fails CI.

3. **Bare bar.** `contrast(ink, fill) >= 4.5` for every status in both themes.

4. **Composited overlay.** `contrast(ink, blend(overlay, fill, alpha)) >= 4.5`, at the alpha
   **read from the module**, not hard-coded in the script. Change the alpha in the module and the
   gate recomputes against the new value.

5. **Direction invariant.** As above. Asserted rather than relied upon, because it fails loudly if
   someone reverts the overlay to white in light mode even at an alpha that happens to squeak
   through.

## Compositing note for the implementer

`bg-foreground/20` compiles to `color-mix(in oklab, var(--foreground) 20%, transparent)` under
Tailwind v4. Interpolating against `transparent` in any space is premultiplied, so the result is
`--foreground` at exactly alpha 0.2; the compositing over the bar then happens in sRGB. The gate's
existing sRGB `blend()` is therefore correct despite the `in oklab` in the compiled output. Worth a
comment in the script, because it looks wrong at a glance.

## Assertion 6 — the recorded Gantt ratios

The Gantt ratios are also written beside the tokens in `frontend/src/index.css` and drift-checked —
but **not** by 022's existing `DOCUMENTED` parser, which cannot be reused. Simulated against the real
script, both obvious shapes fail:

- A **2-column** block (`bar overlay`, the shape data-model.md uses) yields **zero** matches against
  022's 5-group regex, which requires three floats. The block is silently unparsed and never checked
  — a vacuous pass, the exact failure this feature exists to prevent.
- A **3-column** block parses, but `DOCUMENTED` is keyed by **hex**, so a Gantt row for `#b91c1c`
  overwrites 022's `--destructive` row `(5.82, 4.54, 6.47)` with the Gantt figures, producing false
  drift errors. (Simulated: `len(DOCUMENTED)` stays at **8** rather than growing, because the only
  would-be new key is `--muted-foreground` and the hyphen defeats `[a-z]+` — so the count check does
  *not* catch this. The silent clobber is the whole problem.)

Assertion 6 therefore requires its own parser:

- a distinct sentinel — a `Gantt, <theme>:` header line — matched by a **separate** regex with two
  float groups;
- keyed by `(status, theme)`, **not** by hex, because two statuses share `--destructive` and both
  themes reuse the same status names;
- and 022's `len(DOCUMENTED) != 8` check explicitly re-scoped to the text/tint/fill block so the two
  tables cannot interfere.

A `--muted-foreground` row happens not to collide with 022's regex only because the hyphen defeats
`[a-z]+`. That is luck, not design, and is not relied on.

## Breaking-change policy

Changing any entry, the overlay token, or the alpha is a contract change and requires re-running the
gate. A change satisfying one invariant but not another is not acceptable — that is exactly the
failure this feature fixes, where a fill was chosen without regard to what sits on it.
