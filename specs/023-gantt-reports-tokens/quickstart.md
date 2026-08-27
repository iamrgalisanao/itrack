# Quickstart Validation — 023 Legible Gantt Labels and Tokenised Chart Colours

Contract: [contracts/gantt-palette.md](./contracts/gantt-palette.md). Values and ratios:
[data-model.md](./data-model.md).

## Prerequisites

Gates 1, 2, 4 and 5 need **no running server** — they read files. Start the app only for Gate 3:

```bash
cd g:/Dev/projects/itrack/backend && composer run dev   # blocking; API on :8011 + Vite
```

Run it in its own terminal. **If Vite does not land on 5173**, check the port it reports against
`backend/.env`'s `SANCTUM_STATEFUL_DOMAINS` before debugging anything else — an unlisted origin
401s every request after login instead of failing visibly. 5178 and 5179 are already listed; start
Vite explicitly with `npm run dev -- --port 5178 --strictPort` if 5173 is occupied.

Every command below uses an absolute path so it does not matter where the previous one left the
shell.

## Gate 1 — The contrast gate, demonstrated failing first

The gate is landed **before** the JSX change. Run it on the unmodified component:

```bash
cd g:/Dev/projects/itrack && python scripts/verify-contrast.py; echo "gate exit: $?"
```

**Expected at that point**: the five new assertions fail — enum coverage reports `backlog`,
`for_review` and `blocked` missing, and the bar/label rows fail — `gate exit: 1`.

A gate that has only ever seen the fixed state has not been shown to fail. If it exits 0 before the
component changes, the parse guard is not doing its job: check that `GANTT_STATUS_TOKENS` is being
found at all rather than yielding an empty dict.

**Expected after implementation**: every row `ok`, the `--primary` `xfail` row unchanged from 022,
`CONTRACT HOLDS`, **`gate exit: 0`**.

## Gate 2 — Build, lint, backend

```bash
cd g:/Dev/projects/itrack/frontend && npm run build; echo "build exit: $?"
cd g:/Dev/projects/itrack/frontend && npm run lint;  echo "lint exit: $?"
cd g:/Dev/projects/itrack/backend  && php artisan test
```

**Check the exit code, not the summary text.** ESLint prints `0 errors and N warnings potentially
fixable`, which counts auto-fixable items — not total errors. Misreading that line hid a real error
throughout 021.

Watch specifically for `react-refresh/only-export-components` on the new module. If it fires,
something other than plain data is being exported.

## Gate 3 — Browser, both themes, every status

Open Work Program → Gantt, select a project, and toggle the theme with the sidebar control (not by
editing the class — forcing `.dark` without letting React re-render produces artefacts that look
like real bugs).

| What to check | Why |
|---|---|
| All eight statuses render a bar | `backlog`, `for_review` and `blocked` previously reached red via `default` |
| A `for_review` task with `progress > 0` | **The case that proves the bug was real** — a red bar with a 3.00:1 label today, amber with a legible one after |
| The percentage label on every status that shows one | FR-001; six statuses can show one |
| A bar at 0% and one at 100% | The overlay covers none / all of the bar, so the label's backdrop differs |
| A bar narrower than 50px | Label must stay suppressed (FR-007) |
| A bar at `width <= 16` | Milestone diamond; check its colour, not just the bar's |
| A critical-path bar | Outline must sit *outside* the bar and not clip within the 48px row |
| A `blocked` task's pill | Must read "Blocked", not "Pending" — that is a live bug today |
| The neutral (not-started) pill | `bg-muted text-muted-foreground`, **not** `bg-muted-foreground/10` (4.23:1) |
| Print preview (Ctrl+P) | Inline styles survive the print rules; bars keep light-theme values |

Light mode **changes visibly**: the completed portion of a bar now reads darker than the remainder
rather than lighter. That is expected (research.md R2) and is the source of the monotonicity
property. Confirm it reads as "more done = more ink" and not as a rendering error.

Three statuses **change colour** by design: awaiting-review red→amber, delayed amber→red,
not-started red→neutral. A status that no longer reads as its intended state is a Critical finding;
a status that merely looks different from yesterday is not.

## Gate 4 — No colour literals survive

```bash
cd g:/Dev/projects/itrack/frontend

# The two files must contain no status hex literals at all
grep -nE "#[0-9a-fA-F]{6}|rgba\(" src/pages/WorkProgram.jsx src/pages/Reports.jsx
# expected: no matches in getGanttBarStyles or at Reports.jsx:239

# The retired accent must be gone from the whole app
grep -rn "aa3bff" src
# expected: no matches

# The module must hold names, not colours
grep -nE "#[0-9a-fA-F]{3,8}" src/lib/ganttPalette.js
# expected: no matches
```

## Gate 5 — The gate cannot pass vacuously

Prove the parse guard works, because every other assertion depends on it:

```bash
cd g:/Dev/projects/itrack
cp frontend/src/lib/ganttPalette.js /tmp/gp.bak
python - <<'EOF'
import io
p='frontend/src/lib/ganttPalette.js'
s=io.open(p,encoding='utf-8').read().replace('GANTT_STATUS_TOKENS','GANTT_STATUS_TOKENS_RENAMED',1)
io.open(p,'w',encoding='utf-8',newline='\n').write(s)
EOF
python scripts/verify-contrast.py; echo "should be 1: $?"
cp /tmp/gp.bak frontend/src/lib/ganttPalette.js
python scripts/verify-contrast.py >/dev/null; echo "should be 0: $?"
```

Then prove the enum-coverage assertion works by deleting one status key from the module and
confirming the gate names it. Restore afterwards.

## Definition-of-Done gates (Constitution VIII)

1. **Tests green** — Gate 2. Backend is a regression check; there is no frontend suite.
2. **Authorization review** — **N/A**, justified: no endpoint, no role check, no data access. The
   backend file is read as text by a build-time script and is not modified.
3. **Tenant-isolation review** — **N/A**, justified: no query, no scoping surface.
4. **OWASP review** — **N/A**, justified: no endpoint, auth, upload or data-exposure surface; the
   diff contains no PHP. Recorded as N/A rather than skipped.
5. **code-slop review** — applies. Check: no comment left behind explaining a removed gradient; the
   ratio comment sits with the tokens rather than at call sites; the diff touches only the files in
   plan.md §Project Structure; no defensive fallback added that silently substitutes a colour.

## Frontend review pass (Constitution Completion Gate, 1.3.0)

```bash
/impeccable audit frontend/src/pages/WorkProgram.jsx
/impeccable critique frontend/src/lib/ganttPalette.js
```

Compare against spec.md, the constitution, plan.md, and the sibling status surfaces (Taskboard, List
view, Bug Tracker). Pre-registered blocking criteria:

**Critical** — any label or diamond still failing AA in either theme (Gate 1 exits non-zero); a
status reaching a colour or label through a fallback (FR-008); a status that no longer reads as its
intended state; the critical-path outline clipping or colliding with the bar.

**Major** — a colour literal surviving in either page (SC-002); the gate able to pass vacuously
(Gate 5); the neutral pill using the 4.23:1 self-tint; `DESIGN.md` not updated with the canonical
map; the ratios not recorded with the tokens.

**Minor / Suggestion** — record; non-blocking.

Critical and Major findings block completion unless explicitly documented and accepted in this
folder.
