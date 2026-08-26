# Quickstart Validation — 022 Dark-Mode Contrast for Semantic Status Colours

Contract: [contracts/status-tokens.md](./contracts/status-tokens.md). Values and ratios:
[data-model.md](./data-model.md).

## Prerequisites

Gates 1, 2 and 4 need **no running server** — they read files. Start the app only for Gate 3:

```bash
cd g:/Dev/projects/itrack/backend && composer run dev   # blocking; API on :8011 + Vite.
                                                        # Ports must be in SANCTUM_STATEFUL_DOMAINS.
```

Run it in its own terminal. Every gate below uses an absolute path so it does not matter which
directory the previous command left you in — the one shell bug this file already documents at
Gate 2 was introduced exactly that way.

## Gate 1 — Contrast calculation (the objective check)

Recomputes every ratio from the **committed** CSS rather than trusting the plan:

```bash
cd g:/Dev/projects/itrack && python specs/022-dark-status-contrast/contracts/verify-contrast.py; echo "gate exit: $?"
```

**Expected**: every row `ok`, final line `CONTRACT HOLDS`, `gate exit: 0`.

The script strips CSS comments before parsing — this feature adds a ratio comment beside the
tokens, and an unstripped `--foo: #abcdef` inside a comment would parse as a real declaration and
silently shadow the value it documents. It checks three things per state per theme: as text against
each base surface, on a 10–15% tint of its own colour, and foreground-on-fill. **Check the exit
code**, not the printed text.

## Gate 2 — Build and lint

```bash
cd g:/Dev/projects/itrack/frontend && npm run build; echo "build exit: $?"
cd g:/Dev/projects/itrack/frontend && npm run lint;  echo "lint exit: $?"
```

Two separate commands on purpose: chained with `&&`, `$?` reports the **build's** status when the
build fails, so a lint failure can be masked by a green-looking line. Both paths are absolute —
the first command leaves the shell in `frontend/`, where a second bare `cd frontend` resolves
`frontend/frontend` and fails before lint ever runs.

**Check the exit code, not the summary text.** ESLint prints `0 errors and N warnings potentially
fixable`, which counts auto-fixable items — not total errors. Misreading that line hid a real error
throughout feature 021. `lint exit: 0` is the gate.

```bash
cd g:/Dev/projects/itrack/backend && php artisan test   # regression only; expected green
```

Absolute path — the previous block leaves the shell in `frontend/`, where `cd backend` fails.

## Gate 3 — Browser, both themes

Visit each surface in **light and dark**, toggling with the sidebar control:

| Screen | What to look at |
|---|---|
| Bug Tracker | severity/status badges, both text and filled variants |
| Taskboard | status badges, collapsed-group segment bars |
| Work Program (List) | status pills, overdue emphasis |
| Retrospectives | status/label colours |
| Support Ops | SLA and triage colouring |
| Dashboard | Delayed metric card, My Work overdue dates, inline error text |
| Admin, Team, Glossary | inline validation/error callouts on a tint of their own colour |

Confirm for each: status text is comfortably readable in **both** themes; filled badges have
legible text on them; and status text sitting on a tint of its own colour is readable. That last
pattern appears at 26 sites across 15 files — `App`, `AccessDenied`, `PreviewBanner`,
`TaskComments`, `TaskFiles`, `ui/button`, and pages `Admin`, `Glossary`, `Kanban`, `Login`,
`Reports`, `Schedule`, `SupportOps`, `Team`, `TodayDashboard`, `WorkProgram`. An earlier draft of
this list named eight of them and omitted Work Program, which is one of the six screens above.

Light mode **is expected to change**: each status colour is one palette step deeper. Confirm the
shift is uniform and the hues still read as red/green/amber/blue (FR-003) — a colour that now
reads as a different state is a Critical finding.

**Expected drift, not a finding**: Work Program's Gantt bars and the Reports progress bar keep
their pre-change colours in both themes. They are a separate hard-coded palette this feature
deliberately excludes (plan.md Complexity Tracking; research.md follow-up 4). Look at them anyway
and judge whether the drift is tolerable until that follow-up lands — if it is not, say so, because
that is a scope decision rather than a defect.

## Gate 4 — The five deletions

`frontend/src/components/MyWorkPanel.jsx` lines 88, 91, 101, 169 carried
`text-destructive dark:text-red-400`. With the `dark:` half deleted, each must render the same or
better in dark mode.

The fifth is `frontend/src/pages/Schedule.jsx:655` — a dead `text-white` on `bg-destructive` in the
overdue timeline marker. The branch renders `null`, so nothing changes visually; it is deleted
because white would measure 2.77:1 on the new dark fill the moment anyone put a glyph there, and
the gate script cannot see a class attribute.

```bash
cd g:/Dev/projects/itrack/frontend
grep -n "text-white" src/pages/Schedule.jsx    # the bg-destructive branch must not appear
```

Confirm no genuine workaround remains, and that legitimate palette pairs were left alone:

```bash
cd g:/Dev/projects/itrack/frontend

# The four workarounds must be gone (SC-002)
grep -rn "text-destructive dark:text-\|text-success dark:text-\|text-warning dark:text-\|text-info dark:text-" src --include=*.jsx
# expected: no matches

# ...and every legitimate palette pair must survive. Counts the whole class, not one variant:
grep -rho "dark:text-[a-z]*-400" src --include=*.jsx | wc -l
# expected: 50 before the change, 46 after (exactly the 4 removals, nothing else)
```

## Definition-of-Done gates (Constitution VIII)

1. **Tests green** — Gate 2 above. Backend suite is a regression check; there is no frontend suite.
2. **Authorization review** — **N/A**, justified: no endpoint, no role check, no data access. This
   change is twelve CSS values and five class-attribute deletions.
3. **Tenant-isolation review** — **N/A**, justified: no query, no scoping surface.
4. **OWASP review** — **N/A**, justified: no endpoint, auth, upload, or data-exposure surface. The
   diff contains no PHP. Recorded as N/A rather than skipped.
5. **code-slop review** — applies. Check: no comment left behind explaining a removed workaround;
   the ratio comment sits with the tokens, not scattered across call sites; the diff touches only
   the files in plan.md §Project Structure.

## Frontend review pass (Constitution Completion Gate, 1.3.0)

Run against the implemented surface and classify every finding:

```bash
/impeccable audit frontend/src/index.css
/impeccable critique frontend/src/components/MyWorkPanel.jsx
```

Compare the result against spec.md, the constitution, plan.md, and the sibling screens listed in
Gate 3. Pre-registered blocking criteria:

**Critical** — any status colour still failing AA in either theme after the change (Gate 1 exits
non-zero); a filled badge whose foreground is illegible; a hue changed such that a state no longer
reads as its colour (FR-003); a light-mode change beyond the one prescribed palette step.

**Major** — a workaround override left in place (SC-002); a legitimate palette pair deleted by
mistake; the ratios not recorded with the tokens (FR-006/SC-003); `DESIGN.md` not updated, leaving
governing documentation describing only light mode.

**Minor / Suggestion** — record; non-blocking.

Critical and Major findings block completion unless explicitly documented and accepted in this
folder.
