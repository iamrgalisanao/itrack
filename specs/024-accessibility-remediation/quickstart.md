# Quickstart — Validating 024

Every step below is runnable as written. Where a step **cannot** be automated in this repository, it
says so and appears in the manual matrix rather than being quietly assumed.

## Prerequisites

```bash
cd frontend && npm ci
python -m pip install playwright && python -m playwright install chromium   # cascade gate only
```

## Gate 1 — Build and lint

```bash
cd frontend
npm run build      # the real correctness gate; catches what lint will not
npm run lint       # expect 0 errors; 1 pre-existing warning in BugTracker.jsx:189
```

`npm run build` matters more than usual here: this feature adds an export to `taskStatus.js` consumed
by `Reports.jsx`, so it changes the import graph.

## Gate 2 — Static token contrast

```bash
python scripts/verify-contrast.py     # expect exit 0
```

Must now include:
- `--input` at the **3.0 tier** against `--background`, `--card` and `--popover`, both themes.
  Add to the **existing** 3.0-tier loop, do not write a second one.
- The four `STATUS_FILL_TOKENS` contracts from [data-model.md](./data-model.md#the-contracts).

**Scope discipline**: this is the 023 review's proposed "assertion 9" *narrowed to what 024 changes*.
Do **not** build all of it (focus rings, bar fills, overlay edges). 021–023 shipped by running this
gate harder each time, and the review's structural finding is that doing so makes hue collapse
*worse*, not better.

**What a green run does not prove**: focusability, accessible names, reading order, or High Contrast.
Do not cite Gate 2 for SC-001, SC-002 or SC-003.

## Gate 3 — Render-time cascade

```bash
CASCADE_REQUIRED=1 python scripts/verify-cascade.py     # expect exit 0
```

Three changes:

1. **Repoint assertion 0's canary from `border-input` to `bg-background`.** *Required, not optional.*
   The canary's stated premise is that `--input` and `--border` are identical; this feature separates
   them. Left as-is it silently stops being a stylesheet-load check, and if the `* { border-color }`
   rule ever leaves `@layer base` it would `ABORT: the stylesheet did not load` **before** assertion 1
   runs — sending the next engineer to debug a build problem that does not exist. Rewrite the comment
   with it.
2. **New**: a `border-input` fixture asserting computed `borderTopColor` equals the new `--input`
   **and differs from** `--border`. This is what proves the 45 sites actually moved.
3. **New**: a segment fixture under `forced_colors='active'` asserting `outlineStyle !== 'none'` —
   the only automated proof the High Contrast story holds. The harness already launches a
   forced-colors page.

**Heads-up**: assertion 3 warns that adding a focusable node above it silently moves its measurement.
Adding a bar fixture trips that guard. Update it deliberately.

## Gate 4 — The accessible-text formatter

```bash
node --test frontend/src/lib/ganttA11y.test.js     # expect pass
```

No new test runner, no jsdom. This is the whole of SC-003, and it must assert the **assistive
string**, not a rendered column:

```
seed row.responsible = 'SENTINEL-CONTRIBUTOR'
assert buildGanttBarDescription(row, {includeContributor: canSeeContributor('Client')})
       does NOT contain the sentinel
assert the same for null, undefined, '' and an unknown role
assert an internal role DOES receive it
```

**Both directions are required.** A formatter that withholds from everyone satisfies the first
assertion and breaks the product — the identical trap that made PR #14's `reports` provider row
vacuous, and that PR #26's parent-level test was written to avoid.

**The sentinel is what makes it real.** Snapshot-testing the rendered span passes when the field is
absent *for the wrong reason* — because the fixture row had no `responsible` at all.

## Gate 5 — Backend suite

```bash
cd backend && php artisan test     # expect 463 passing
```

This feature ships no PHP, so this is a regression check only. It is listed because
`ClientVisibilityBoundaryTest` now covers the three planning levels (PR #26) and this feature's
frontend role predicate is the client-side half of that same boundary.

## Manual matrix — what no gate replaces

These are **tasks**, not assumptions. Record the result of each.

| Check | Why no gate covers it |
|---|---|
| Keyboard-only pass of the full timeline flow (SC-001) | No component runner; focus order is emergent |
| **NVDA + Firefox**, both focus mode and **browse mode** | Browse mode is the spec's own edge case and the reason an `sr-only` node exists at all |
| **JAWS + Chrome** | Description handling differs from NVDA |
| **VoiceOver + Safari** | The one that will expose a cross-pane `aria-describedby` problem if there is one |
| **Real Windows High Contrast**, not Chromium emulation | Emulation does not faithfully reproduce the inline-style override on the Gantt bars — the exact mechanism R12 addresses |
| Reports chart at mobile width with all seven statuses | The current grid wraps at four; verify the rotation removed the class of defect |
| Zero-task and single-status projects | Explicit empty state, and one row at 100% with six zeros |
| Segment bar glyph at the narrowest real column width | Verify the suppression threshold, and that `overflow-hidden` is not clipping silently |

## Frontend review pass (Constitution Completion Gate)

Compare the implementation against spec.md, plan.md, the constitution, and comparable existing pages.
Then:

```
/impeccable audit frontend/src/pages/WorkProgram.jsx
/impeccable critique frontend/src/components/GroupSummaryBar.jsx
```

Classify every finding Critical / Major / Minor / Suggestion. **Critical and Major block completion**
unless explicitly documented and accepted in plan.md.

## Definition-of-Done (Constitution VIII)

| Item | How it is satisfied here |
|---|---|
| 1. Tests green | Gates 1–5 |
| 2. Authorization review | **Applies** — FR-007. The `sr-only` rendering is a new rendering of role-restricted data. Verify the predicate is a positive allowlist, that it is consumed by the visible sites *and* the formatter, and that Gate 4 asserts the assistive string. |
| 3. Tenant-isolation review | **Applies** — same surface. The backend half is PR #26; this is the client half. |
| 4. OWASP review | **Applies narrowly** — no endpoint, no auth change, no upload. The relevant class is data exposure through a new rendering path. Run `laravel-owasp-security` against FR-007's surface only. |
| 5. `code-slop` review | Run on the diff. Specifically: no per-row `useState` in the timeline map, no defensive wrapper around values the caller guarantees, and every comment either records a rejected alternative or is deleted. |

## Verification record

Create `verification-record.md` alongside these artifacts on completion, recording each gate's actual
output, every manual check's result, and every Critical/Major finding with its resolution or accepted
rationale. **Regenerate figures rather than retyping them** — three drafts of 023's artifacts carried
hand-transcribed ratios and two of them were wrong.
