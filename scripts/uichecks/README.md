# Local UI verification checks

Scripts that answer questions about a **rendered, logged-in application** — the questions no
committed gate in this repo can reach.

## Why these are not CI jobs

`verify-contrast.py` reads source text. `verify-cascade.py` reads a built stylesheet inside a
hand-written fixture and [deliberately never executes React][cascade]. That boundary is real and
recorded in [`contracts/ui-contracts.md`][contracts] Contract 4 — it is why task T041 was **deleted**
rather than implemented, after it became clear the only way to satisfy it was to hand-write a width
and then assert the browser computed it.

These checks need a server, a database and a real session. A CI job needing all three fails for
reasons unrelated to the change under test, and this repo has established more than once that a gate
which goes red for the wrong reason is worse than no gate at all. So they are **developer tools**,
run deliberately by a human who wants an answer.

## What they prove, and what they do not

| | |
|---|---|
| **Prove** | What the browser rendered, for a real logged-in role, under a chosen theme, print media or simulated colour-vision deficiency |
| **Do not prove** | Anything about assistive technology. An accessible name present in the tree is **not** a screen reader announcing it. That belongs to the manual matrix and the distinction must not be blurred |

## Running them

```bash
cd backend && php artisan serve --port=8011     # terminal 1
cd frontend && npm run dev                      # terminal 2
python scripts/uichecks/gantt_contributor_gate.py
```

Each exits `0` on pass and non-zero with a named reason on failure, so the set composes:

```bash
for f in scripts/uichecks/*.py; do python "$f" || echo "FAILED: $f"; done
```

Override the front end's origin with `ITRACK_UI_BASE` if you run Vite on another port. Remember that
the port must also be in `SANCTUM_STATEFUL_DOMAINS` or every request after login silently 401s.

**Check the port Vite actually printed.** If 5173 is already held — by a dev server from an earlier
session that outlived the terminal that started it — Vite silently takes 5174, 5175, … and says so
only in its startup banner. The harness still targets 5173 and still passes, because the stale server
is serving the same working tree over HMR. It stops being harmless the moment the stale server is
running from a *different* checkout or a killed watcher: then the checks measure code you are not
looking at, and pass. If a result surprises you, confirm the port before believing it.

## Prerequisites

`php artisan db:seed` must have been run. The seeder's `seedManualTestingFixtures()` is what makes
the personas exercisable at all — it assigns the Client persona to a project, and spreads tasks
across all seven statuses. Without it:

- **the Client can see nothing**, because `Project::scopeAccessibleTo` requires an explicit
  assignment or an approved membership, so no Client-facing view is reachable; and
- **the status vocabulary is never fully present**, because the Excel import leaves every task
  `not_started`. An accessibility pass over a colour system cannot judge pairs that never render —
  024's first colourblindness pass was recorded PARTIAL for exactly that reason.

Playwright is the same dependency `verify-cascade.py` already needs:

```bash
python -m pip install playwright && python -m playwright install --with-deps chromium
```

## The checks

| Check | Question | Requirement |
|---|---|---|
| `gantt_contributor_gate.py` | Does a Client's Work Program timeline actually withhold the contributor column, and does the layout close the gap rather than leaving one? | FR-007 |
| `gantt_keyboard.py` | Can the timeline be operated without a mouse — every bar a real `<button>`, reachable by Tab in row order, named, visibly focused, and activated by Enter and Space? | FR-001–FR-003, SC-001 |

`gantt_keyboard.py` selects on `[data-gantt-bar]`, a structural hook in the component, and that is
deliberate. Its first version selected on the `focus-visible:outline-2` class — so deleting the focus
outline made it report **"no bars found"** instead of "no focus indicator": the right verdict for the
wrong reason. A check whose target moves with the thing it measures cannot tell you what broke.

### Not yet here

- **The Reports chart's print behaviour** (FR-021/SC-012) needs the rebuilt chart from PR #39 and
  lands with it. It is the check that caught the chart printing as seven empty rails, so it should
  not be lost — it is written and will be ported once its feature is on `main`.
- **The Gantt keyboard and announcement checks** land with the increments that make the timeline
  focusable.

## Writing one

Import the plumbing from [`../uicheck.py`](../uicheck.py) rather than rediscovering it. It already
knows the things that each cost a failed run to learn: the timeline is reachable only via
`?view=gantt`; Work Program restores an *explicit* project choice from `localStorage` and does not
fall back to `projects[0]`; `/api/projects` is not shaped `{data: […]}` everywhere;
`ProjectAssignment.assigned_by_user_id` is not nullable.

```python
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import uicheck

with uicheck.session(role='Client') as page:
    uicheck.open_gantt(page)
    ...
sys.exit(uicheck.report('MY CHECK', failures))
```

State the failure, not the assertion: `"Client sees the contributor column"` tells a reader what is
wrong; `"expected False, got True"` makes them go and read the script.

[cascade]: ../verify-cascade.py
[contracts]: ../../specs/024-accessibility-remediation/contracts/ui-contracts.md
