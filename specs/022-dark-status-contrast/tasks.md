# Tasks: Dark-Mode Contrast for Semantic Status Colours

**Input**: Design documents from `/specs/022-dark-status-contrast/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/status-tokens.md](./contracts/status-tokens.md),
[quickstart.md](./quickstart.md)

**Tests**: No automated test tasks. The spec did not request TDD, there is no frontend test suite in
this repo, and the objective check for this feature is a contrast calculation
(`contracts/verify-contrast.py`), which already exists and is committed. The backend suite appears
once, as a regression check that nothing unrelated moved.

**Format**: `[ID] [P?] [Story?] Description with file path`

---

## Phase 1: Setup

**Purpose**: Record the starting state, so "it got better" is measured rather than remembered.

- [ ] T001 Capture the pre-change gate output as the baseline: run `cd g:/Dev/projects/itrack && python specs/022-dark-status-contrast/contracts/verify-contrast.py` and paste the 8-row table into the implementation PR description. Expected: 8/8 `FAIL`, `CONTRACT VIOLATED`, exit 1. If it exits 0 before any edit, stop — the script is not reading the file you think it is.
- [ ] T002 [P] Record the two counts SC-002 is measured against, from `g:/Dev/projects/itrack/frontend`: `grep -rho "dark:text-[a-z]*-400" src --include=*.jsx | wc -l` (expected **50**) and `grep -rn "text-destructive dark:text-\|text-success dark:text-\|text-warning dark:text-\|text-info dark:text-" src --include=*.jsx | wc -l` (expected **4**).

---

## Phase 2: Foundational

**None.** There is no blocking prerequisite: the token file, the `@theme inline` mapping and the
gate script all already exist. Recorded explicitly rather than padded with invented setup work.

---

## Phase 3: User Story 1 — Read status information in dark mode (Priority: P1) 🎯 MVP

**Goal**: All four semantic status colours meet WCAG AA against every surface they render on, in
both themes — including a tint of themselves and as a fill under their paired foreground.

**Independent Test**: `verify-contrast.py` exits 0 with 8/8 `ok`. Then, in the browser, status text
on the six screens in quickstart Gate 3 is comfortably readable in dark mode and still reads as the
right colour in light mode.

### Implementation

- [ ] T003 [US1] Replace the four light token values in the `:root` block of `frontend/src/index.css` (lines 35, 37, 39, 41): `--destructive` `#dc2626`→`#b91c1c`, `--success` `#15803d`→`#166534`, `--warning` `#b45309`→`#92400e`, `--info` `#2563eb`→`#1d4ed8`. Leave all four `-foreground` values at `#ffffff` — darkening a fill only improves white-on-fill. Values and ratios: [data-model.md](./data-model.md) §Light mode.
- [ ] T004 [US1] Replace all eight dark token values in the `.dark` block of `frontend/src/index.css` (lines 61-68): `--destructive` `#dc2626`→`#f87171`, `--success` `#15803d`→`#4ade80`, `--warning` `#b45309`→`#fbbf24`, `--info` `#2563eb`→`#60a5fa`, and every one of the four `-foreground` values `#ffffff`→`#16171d`. **Both halves of each pair must move together** — lightening a fill without moving its foreground drops white-on-fill to 1.67-2.77:1, which is worse than the bug being fixed (research.md R2).
- [ ] T005 [US1] **Replace** — not append to — the stale comment at `frontend/src/index.css:31-34` ("one Tailwind shade darker than the original 500-weight values"), which this change makes false. The new comment records each token's worst-case ratio and the surface it was measured against, and covers **both** `:root` and `.dark` (research.md R4; FR-006/SC-003). Leaving the old comment beside the new one leaves two adjacent comments, one of them wrong.
- [ ] T006 [US1] Run the gate: `cd g:/Dev/projects/itrack && python specs/022-dark-status-contrast/contracts/verify-contrast.py; echo "gate exit: $?"`. Required: 8/8 `ok`, `CONTRACT HOLDS`, **`gate exit: 0`**. Check the exit code, not the printed text. If any row fails, fix the token — do not adjust the script or the threshold.
- [ ] T007 [US1] Update `DESIGN.md` — four separate edits, all required, because quickstart pre-registers "`DESIGN.md` not updated" as a blocking **Major**: (1) widen the **AA Floor Rule** on both axes — surface, from "against its paired foreground" to "against every surface it renders on, **including a tint of itself**, and against its paired foreground"; and magnitude, from "use one step darker" to "move **as many steps as measurement requires**, in the direction the theme needs — darker for light themes, lighter for dark"; (2) front-matter `colors:` block, lines 14-17, to the new light values; (3) line 70's "darkened one step from their common defaults", which is no longer true; (4) lines 87-90, the Signal Red/Green/Amber/Blue list, which gains its dark-theme counterparts. Rationale: research.md R5.

**Checkpoint**: The token contract holds by calculation in both themes. US1 is independently
verifiable here, before a single call site is touched.

---

## Phase 4: User Story 2 — One place to change a status colour (Priority: P2)

**Goal**: No component-level override exists solely to compensate for a wrong token; the token is
the single source of truth.

**Independent Test**: The SC-002 grep returns no matches, and the `dark:text-*-400` population has
dropped by exactly 4 (50→46) — proving the four workarounds went and nothing legitimate went with
them.

### Implementation

- [ ] T008 [US2] Delete the `dark:text-red-400` half of the class list at `frontend/src/components/MyWorkPanel.jsx` lines 88, 91, 101 and 169, leaving `text-destructive`. **Pure deletions only** — if a site needs anything more than removing `dark:text-*`, the token is still wrong and the fix belongs in T004, not here (plan.md Coding-Standard Constraint 4).
- [ ] T009 [P] [US2] Delete the dead `text-white` from the `bg-destructive border-destructive` branch at `frontend/src/pages/Schedule.jsx:655`. It is inert today (the overdue branch renders `null`), but it would measure **2.77:1** against the new dark fill the moment a glyph landed there, and no calculation gate can see a class attribute. Leave the sibling `text-white` on the `bg-purple-500` and `bg-emerald-500` branches — those are palette colours, correctly paired.
- [ ] T010 [US2] Verify both counts moved as predicted, from `g:/Dev/projects/itrack/frontend`: the SC-002 grep from T002 now returns **0** matches, and `grep -rho "dark:text-[a-z]*-400" src --include=*.jsx | wc -l` returns **46**, down exactly 4 from T002's 50. A count below 46 means a legitimate light/dark palette pair was deleted — a pre-registered blocking **Major** (research.md R3).

**Checkpoint**: Both stories complete. Every remaining `dark:text-*-400` in the repo is deliberate
theming on a palette colour.

---

## Phase 5: Polish, Verification & Definition-of-Done

- [ ] T011 [P] Build: `cd g:/Dev/projects/itrack/frontend && npm run build; echo "build exit: $?"` — required `build exit: 0`.
- [ ] T012 [P] Lint: `cd g:/Dev/projects/itrack/frontend && npm run lint; echo "lint exit: $?"` — required `lint exit: 0`. **Judge by the exit code.** ESLint's "0 errors and N warnings potentially fixable" line counts auto-fixable items, not total errors; misreading that line hid a real error through most of feature 021.
- [ ] T013 [P] Backend regression: `cd g:/Dev/projects/itrack/backend && php artisan test` — expected green and untouched. Absolute path because T011/T012 leave the shell in `frontend/`.
- [ ] T014 Browser pass, **both themes**, per [quickstart.md](./quickstart.md) Gate 3: Bug Tracker, Taskboard, Work Program (List), Retrospectives, Support Ops, Dashboard, plus the Admin/Team/Glossary validation callouts. Confirm status text is readable, filled badges have legible text on them, and text on a same-colour tint is readable — that last pattern is at **26 sites across 15 files**, listed in Gate 3.
- [ ] T015 Confirm the light-mode shift is the intended one: each status colour exactly one palette step deeper, hues still reading as red/green/amber/blue (FR-003). A colour that now reads as a *different state* is a **Critical** finding. A light-mode change beyond the one prescribed step is also Critical (SC-004).
- [ ] T016 Look at the **accepted drift** and judge it: Work Program's Gantt bars (`WorkProgram.jsx:580-611`) and the Reports progress bar (`Reports.jsx:239`) keep their pre-change hard-coded colours in both themes while every other status surface moves. This is a documented exclusion (plan.md Complexity Tracking; research.md follow-up 4), not a defect — but it is a **scope decision**, so if the drift looks wrong beside the corrected tokens, say so and raise it rather than shipping past it silently.
- [ ] T017 [P] Accessibility verification (this feature *is* the accessibility change): confirm the corrected tokens do not fight a `forced-colors` or `prefers-contrast: high` setting. `forced-colors` overrides author colours by design and is left to the platform; the check is that nothing new hard-codes a colour that would survive it.
- [ ] T018 [P] `code-slop` review of the diff: no comment left behind explaining a removed workaround; the ratio comment sits with the tokens rather than scattered across call sites; the diff touches only `frontend/src/index.css`, `frontend/src/components/MyWorkPanel.jsx`, `frontend/src/pages/Schedule.jsx` and `DESIGN.md` (plan.md §Project Structure).
- [ ] T019 Frontend review pass (Constitution 1.3.0 Completion Gate): run `/impeccable audit frontend/src/index.css` and `/impeccable critique frontend/src/components/MyWorkPanel.jsx`, compare the result against spec.md, the constitution, plan.md and the sibling screens in T014, and classify every finding **Critical / Major / Minor / Suggestion** against the criteria pre-registered in quickstart.md.
- [ ] T020 Resolve or explicitly accept every Critical and Major finding from T014-T019, documenting any acceptance in this folder. Critical/Major findings **block completion** unless documented and accepted. Record Minor/Suggestion findings without acting on them.
- [ ] T021 Record the Definition-of-Done gate (Constitution VIII) in this folder: tests green (T011-T013); authorization review **N/A**; tenant-isolation review **N/A**; OWASP review **N/A** — each justified by "no endpoint, no auth, no query, no data-exposure surface; the diff contains no PHP", marked N/A rather than skipped; `code-slop` **applies** and is T018.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001-T002)**: no dependencies; T001 must run *before* any edit or the baseline is lost.
- **Foundational**: none.
- **US1 (T003-T007)**: after Setup. T003→T004→T005 all edit the same file, so they are sequential;
  T006 gates them; T007 is a different file but is kept after T006 so the ratios written into
  `DESIGN.md` are the ones the gate actually confirmed.
- **US2 (T008-T010)**: **depends on US1**, unlike a typical story pair. T008 removes the overrides
  that are currently the only reason those four sites are legible in dark mode — doing it before
  T004 would visibly regress them. T010 verifies both.
- **Polish (T011-T021)**: after both stories.

### Parallel opportunities

- T002 alongside T001.
- T009 alongside T008 (different files, independent deletions).
- T011, T012, T013 together — three separate toolchains.
- T017 and T018 alongside T014-T016.

Everything inside `index.css` (T003-T005) is strictly sequential — one file, overlapping regions.

---

## Implementation Strategy

**MVP is US1 alone.** T003-T007 fix the contrast for every screen in the app at once, because every
consumer reads the token. US2 is cleanup: it removes four overrides that become redundant the moment
US1 lands. Shipping US1 without US2 leaves the app *correct but untidy* — the four MyWorkPanel sites
would render `dark:text-red-400` instead of the corrected token, which is a near-identical colour.

The reverse order does **not** work, which is why the usual story independence does not hold here
and is called out above rather than papered over.

**Suggested commits**: (1) T003-T006 — the token change plus its gate; (2) T007 — `DESIGN.md`;
(3) T008-T010 — the deletions. Three reviewable commits, each independently verifiable.

---

## Notes

- The gate script is the arbiter, not this document. If a number here disagrees with
  `verify-contrast.py`'s output, the script is right — that is exactly how the errors in the first
  two drafts of these artifacts were caught.
- Do not "fix" a failing gate row by editing the script, relaxing 4.5, or dropping a surface from
  the set. Every one of those makes the gate pass while the UI still fails.
- 12 token values, 5 class deletions, 4 documentation edits. Anything outside that footprint is
  scope creep and should be a follow-up (research.md has five).
