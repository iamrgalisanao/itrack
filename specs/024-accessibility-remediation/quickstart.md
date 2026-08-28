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
  **This requires generalising the existing loop first.** The 3.0-tier loop at
  `verify-contrast.py:423-439` iterates `(name, need)` and **hardcodes the surface** as
  `t[popover]`, prints "on --popover", and files failures under "THE POPOVER SURFACE IS NOT
  LEGIBLE". Adding `(input, 3.0)` to it would measure `--input` against `--popover` only, under a
  false heading, and could not express `--background` or `--card` at all. Generalise it to
  `(token, surface, need)` triples and move the popover rows onto it.
- **The counted ratchet** (FR-015), run as its own command:

```bash
python scripts/count-control-borders.py      # expect exit 0, "RATCHET HOLDS (81 <= 81)"
```

  **It is not a grep, and that matters.** Three plausible one-liners disagree about this number:
  `<(input|select|textarea)\b[^>]*?border-border` returns **0** — it terminates on the `>` inside
  `onChange={(e) => …}`, the identical failure that produced a confident "2 of 127" during planning;
  the multiline variant returns **499**; a plain `border-border` count returns **228**. The scanner
  tracks brace depth and returns **81**. Story 4 is the first PR, so it would otherwise install a gate
  on a baseline nobody could recompute — the same lesson R11a records, one level down.
- The **five** `STATUS_FILL_TOKENS` contracts from [data-model.md](./data-model.md#the-contracts).
  *(Five, not four: the fifth is treatment distinctness, and it is SC-004's only mechanism —
  building "the four" from this line drops it and SC-004 loses its gate again.)*

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

1. **Repoint assertion 0's canary — but not simply at `bg-background`.** *Required, not optional.*
   `bg-background` depends on `@theme` emitting `--color-background` **and** the `bg-*` utility
   winning, which is the PR #17 `bg-popover` defect class — so it re-creates the same conflation of
   "did not load" with "did not win", one surface over. Make the load canary
   **emission-independent**: read the custom property off the root element and assert it is
   non-empty. Keep `bg-background` as a *separate* emission assertion. Add `background` to the
   required-token list at `verify-cascade.py:74`, or the repoint can crash on a missing key.
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
node --test frontend/src/lib/ganttA11y.test.js     # expect pass  (from the repo root)
```

**This must run in CI, and does not today.** `.github/workflows/ci.yml` has four jobs and none runs
`node --test` — so as originally planned, the *only* automated protection for FR-007 and SC-003,
this feature's single confidentiality requirement, ran on a laptop.

**Give it its own job, and mind the path.** `frontend-build` sets
`defaults: run: working-directory: frontend`, so the documented command pasted into that job resolves
to `frontend/frontend/src/…` and fails; inside that job it must be `node --test src/lib/…`. Its own
job avoids the trap and follows the reasoning already written into `ci.yml`: *a different verdict
deserves a different red X*. A confidentiality-test failure and a compile error are different
verdicts.

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
cd backend && php artisan test     # expect 0 failures
```

**A pass, not a count, is the criterion.** "Expect 463 passing" was the number the *failing* run
produced (463 passed, 5 failed), so a count stated as a criterion reads green on a red suite.

This feature ships no PHP, so this is a regression check only. It is listed because
`ClientVisibilityBoundaryTest` now covers the three planning levels (PR #26) and this feature's
frontend role predicate is the client-side half of that same boundary.

## Reading test output — a discipline, not a step

**Count `errors` alongside `failed`.** Three fixtures in the run-up to this feature were vacuous, and
**twice a row that ERRORED was read as green** because the summary parser counted only `failed`. An
accessibility suite has the identical shape: an assertion against an element that never rendered
passes quietly, and a query that throws is not a failure unless something looks for it.

Nothing here is exempt from that. A green row is not evidence until it has been watched to go red.

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
| **Protanopia and deuteranopia simulation** of every status treatment | SC-004 says "verified by measurement rather than inspection"; the gate measures *treatments* (R15), but pairwise perceptual judgement still needs an eye |
| **A count of 1 beside a count of 100+** in the status chart (SC-007) | The gate asserts the floor renders at least 4px; that it reads as *distinguishable from zero* is a different claim |
| A **20-project** report, not one card | R6 accepts +76px per card; on 20 stacked cards that is +1500px of scroll, and the cost was weighed against a single card |
| Grep for `mock`, `prototype`, `scaffold` in JSX string literals (SC-010) | SC-010 says "no interface text"; FR-016 fixes one known site. The sweep is the difference between fixing an instance and satisfying the criterion |

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
