# Tasks: Legible Gantt Labels and Tokenised Chart Colours

**Input**: Design documents from `/specs/023-gantt-reports-tokens/`

**Prerequisites**: [plan.md](./plan.md) (gate: `PASSED (clean)`), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md),
[contracts/gantt-palette.md](./contracts/gantt-palette.md), [quickstart.md](./quickstart.md)

**Tests**: No unit-test tasks — there is no frontend suite and the spec did not request TDD. The
test surface here is the **contrast gate plus three tamper proofs**, and each tamper proof is a
separate task paired to a specific implementation task (T020↔T003, T021↔T006, T022↔T007). That
pairing is what satisfies the constitution's "no implementation task without a matching test task"
for a feature with no suite; one combined "run the tamper proofs" task would let two of three be
skipped silently, which is the exact vacuity this feature exists to prevent.

**Format**: `[ID] [P?] [Story?] Description with file path`

---

## Phase 1: Setup

- [X] T001 Record the before-state: `cd g:/Dev/projects/itrack && python scripts/verify-contrast.py; echo "exit: $?"`. Expected **exit 0** — 022's checks pass on this branch already. This is a baseline, *not* a demonstration of failure: the gate cannot see the old `switch` (research.md R4), so there is no red-on-`main` run to capture. Paste the output into the PR description so the before/after is on record.
- [X] T002 [P] Amend `specs/023-gantt-reports-tokens/spec.md` — **already applied, verify only**: SC-002 is scoped to the four named surfaces; `Reports.jsx:728-745` `matchStatusColor` is listed in Out of Scope with its different-vocabulary reason; the "last confirmed contrast failure" claim at the top is corrected to "worst remaining" (the brand accent still fails at 3.40:1). If any of the three is missing, fix it before proceeding — `/speckit-tasks` read this spec.

---

## Phase 2: Foundational (BLOCKING — no story label)

**Purpose**: the retokenise lives here, not in a story phase. `ganttPalette.js`, `getGanttBarStyles`
and the gate are prerequisites of **both** stories — the label fix is only decidable against the
post-retokenise bars (research.md, "The naive fix is worse"). Putting them here resolves the
P1/P2 inseparability structurally instead of pretending the stories are independent when they are
not.

**Order is module → gate → gate-green → JSX.** Not gate-first: the gate cannot fail against the old
switch, so "watch it fail first" has no diagnostic value here, and writing a parser before its
subject exists is how you get a regex that matches nothing and a vacuous pass.

- [X] T003 Create `frontend/src/lib/ganttPalette.js` exporting `GANTT_STATUS_TOKENS` (8 keys), `GANTT_PROGRESS_OVERLAY` and `GANTT_LABEL_SUPPRESSED` exactly as in [contracts/gantt-palette.md](./contracts/gantt-palette.md). **Plain data only** — no components, no hooks (`react-refresh/only-export-components`, the rule that turned CI red during 021). Values are **token names**, never colours: a hex literal in this file is the defect being removed, reintroduced.
- [X] T004 Rewrite `getGanttBarStyles` in `frontend/src/pages/WorkProgram.jsx:575-615` to read T003's module and return **`{ background: 'var(--<fill>)', color: 'var(--<ink>)' }`**, plus `outline: '2px solid var(--foreground)'` and `outlineOffset: '2px'` when `isCritical`. **No `border` key and no `boxShadow` key** — the global `* { border-color: var(--color-border) }` at `frontend/src/index.css:131-133` keeps the hairline on the surviving `border` className, and the glow is removed per research.md R3. Keep the signature `(status, isCritical)` and the call site at `:2640` unchanged. The `color` set here is what T010 and T011 inherit.
- [X] T005 Add the Gantt ratio block to `frontend/src/index.css` under a `Gantt, <theme>:` sentinel — **10 rows** (5 fill families × 2 themes), **two float columns** (bar / overlay), written **without a `--` prefix and without hex**. That shape cannot match 022's `DOCUMENTED` regex, which requires `--([a-z]+)` plus three floats. **Do not re-scope 022's `len(DOCUMENTED) != 8` check** — simulated, it stays at 8 either way, so that surgery is unnecessary.
- [X] T006 Extend `scripts/verify-contrast.py` with assertions **1–5**: parse guard (the `GANTT_STATUS_TOKENS` export is found and yields entries, `GANTT_PROGRESS_OVERLAY` parses — structural only, not a count, which would duplicate and short-circuit enum coverage), enum coverage against `backend/app/Http/Controllers/DetailedActivityController.php:119` plus `pending`, bare-bar `contrast(ink, fill) ≥ 4.5`, composited-overlay contrast at the alpha **read from the module**, and the direction invariant. One task, not five: they share one parse and one loop, and splitting them produces five edits to the same region with no independent verification between.
- [X] T007 Extend `scripts/verify-contrast.py` with assertion **6** — the `index.css` Gantt ratio drift check. Its **own** regex and sentinel, keyed by `(fill family, theme)` not hex, plus a non-vacuity guard asserting **exactly 10 parsed rows**. Separate task because this is the one F2 showed can silently clobber 022's parser; it earns its own review and its own tamper proof (T022).
- [X] T008 Run the gate: `cd g:/Dev/projects/itrack && python scripts/verify-contrast.py; echo "exit: $?"` — must be **0**, with the `--primary` `xfail` row unchanged from 022. **PHASE EXIT.** Record explicitly that the component is still broken at this point and the gate cannot see that — Gate 4 and the browser pass cover it, not this gate.

**Checkpoint**: the entire colour decision is under test before a single pixel moves.

---

## Phase 3: User Story 1 — Read the progress figure (Priority: P1) 🎯 MVP

**Goal**: the percentage label meets AA on every status that renders one, in both themes.

**Independent Test**: quickstart Gate 3's US1 rows — every rendering status' label legible in both
themes, including a 0% and a 100% bar where the overlay covers none/all of the bar.

- [X] T009 [US1] `frontend/src/pages/WorkProgram.jsx:2658` — progress overlay `bg-white/20` → `bg-foreground/20`. This is the direction change the whole fix rests on (research.md R2): it puts the overlay on the opposite side of the fill from the ink, making contrast monotonically increasing in alpha.
- [X] T010 [US1] `frontend/src/pages/WorkProgram.jsx:2665` — drop `text-white` from the label span. It **inherits** `color` from the bar container set in T004. Do **not** add an inline colour, a second accessor, or a data attribute: verified safe because every other text descendant of the bar sets its own colour explicitly (`:2676`, `:2681`, `:2684`, `:2690`, `:2694`, `:2723`), so nothing else is affected by the inherited value.
- [X] T011 [US1] `frontend/src/pages/WorkProgram.jsx:2672` — milestone diamond `bg-white` → `bg-current`, keeping `border-border/30`. Same inheritance as T010.
- [X] T012 [US1] Browser pass, both themes, US1 rows of quickstart Gate 3: every rendering status' label, a `for_review` task with `progress > 0` (**the case that proves the fallback bug was real**), a 0% bar, a 100% bar, a bar under 50px (label stays suppressed, FR-007), and a `width <= 16` milestone.

**Checkpoint**: US1 is verifiable on its own — the labels are legible before any pill or Reports work.

---

## Phase 4: User Story 2 — Status colours agree product-wide (Priority: P2)

**Goal**: every status resolves through a named semantic colour, in the chart and in the pill.

**Independent Test**: change `--warning` in `index.css`, reload, and confirm the `for_review` bar,
its pill and the Reports ring all follow with no edit to chart code (SC-003).

- [X] T013 [P] [US2] `getGanttStatusColor` in `frontend/src/pages/WorkProgram.jsx:617-631` → 8 explicit branches. **Every branch must name a border colour** — the call site at `:2456` is a shadcn `Badge`, whose `default` variant contributes `border-transparent` (`components/ui/badge.jsx:9`), and `twMerge` only lets the returned string win for properties it *names*. Omit the border and the pill silently loses its ring. Four semantics: `bg-{state}/10 text-{state} border-{state}/30`. Three neutrals: `bg-muted text-muted-foreground border-muted-foreground/30` — **not** `bg-muted-foreground/N`, which fails at /15 (4.23:1).
- [X] T014 [P] [US2] `getGanttStatusLabel` in `frontend/src/pages/WorkProgram.jsx:633-647` → 8 explicit branches. Remove `case 'review'` (dead — the backend sends `for_review`) and give `blocked` its own label. A blocked task currently reads **"Pending"**, which is a live correctness bug, not a colour one.
- [X] T015 [P] [US2] `frontend/src/pages/Reports.jsx:239` — `#22c55e` → `var(--success)`, `#f59e0b` → `var(--warning)`, `#aa3bff` → `var(--primary)`. The last is the pre-`#a631ff` accent that `index.css:15` documents as superseded; it measures 4.39:1 and was retired for failing AA. Leave `matchStatusColor` at `:728-745` alone — Out of Scope, different vocabulary.
- [X] T016 [US2] Update `DESIGN.md`: record the canonical Gantt status map, the flat-bar decision citing the Creative North Star (`:64-65`, which names Gantt bars) and the Flat-By-Default Rule (`:190-192`, elevation) as the **two separate passages** they are, and the offset-outline critical path with the 1.00:1 collision that ruled out a red ring.
- [X] T017 [US2] Browser pass, US2 rows of quickstart Gate 3: all eight statuses render a bar, a `blocked` pill reads "Blocked", the neutral pill keeps its ring, a critical-path bar's outline sits outside the bar, and the **SC-003 proof** — change `--warning`, reload, confirm bar + pill + Reports ring all follow, then revert.

---

## Phase 5: Polish, Verification & Definition-of-Done

- [X] T018 [P] Gate 2, by **exit code** not summary text: `npm run build`, `npm run lint`, `php artisan test`. Watch for `react-refresh/only-export-components` on T003's module — if it fires, something other than plain data is being exported.
- [X] T019 Gate 4 literal sweep, per quickstart: no `#hex`/`rgba(` in either page, no `aa3bff` under `src/pages src/lib src/components`, no hex in `ganttPalette.js`. **This is the check that catches a component ignoring the module** — the contrast gate cannot.
- [X] T020 Tamper proof A → pairs with **T003**: rename `GANTT_STATUS_TOKENS` in the module, run the gate, confirm the parse guard fails it (exit 1), restore, confirm exit 0.
- [X] T021 Tamper proof B → pairs with **T006**: delete one status key from the module, run the gate, confirm enum coverage names the missing status, restore. This is the assertion that would have caught the original `default`-branch bug.
- [X] T022 Tamper proof C → pairs with **T007**: corrupt one figure in `index.css`'s Gantt block, run the gate, confirm assertion 6 reports the drift; then delete the whole block and confirm the 10-row guard fails rather than passing over zero rows. Restore. **Not listed in quickstart Gate 5** — added because assertion 6 otherwise has no non-vacuity proof.
- [X] T023 `code-slop` review of the diff: no comment left behind explaining a removed gradient; the ratio block sits with the tokens; the diff touches only the files in plan.md §Project Structure; no defensive fallback that silently substitutes a colour.
- [X] T024 `/impeccable audit frontend/src/pages/WorkProgram.jsx` and `/impeccable critique frontend/src/lib/ganttPalette.js`; classify findings Critical/Major/Minor/Suggestion against quickstart's pre-registered criteria. **Pre-registered as accepted, do not raise as Major**: `shadow-sm hover:shadow` at `:2635` survives untouched even though R3 cites the Flat-By-Default Rule's elevation clause to remove the glow — `hover:shadow` exceeds `shadow-sm`, and removing it is out of scope. Also accepted: the left-edge outline clip and the baseline overlap (plan.md).
- [X] T025 Resolve or explicitly accept every Critical and Major finding from T012–T024, documenting acceptances in this folder. Record Minor/Suggestion without acting.
- [X] T026 Record the Definition-of-Done gate (Constitution VIII) in this folder: tests green (T018); authorization, tenant-isolation and OWASP reviews **N/A** with the justification that no PHP is modified and the backend file is read as text by a build-time script; `code-slop` **applies** and is T023.

---

## Dependencies & Execution Order

- **Setup (T001–T002)**: T001 before any edit.
- **Foundational (T003–T008)**: T003 → T004 and T006. T005 → T007. T006, T007 → T008.
- **US1 (T009–T012)**: after T008. **T004 → T010 and T011** — the container's `color` must exist before its children can inherit it. This edge is invisible in the file diff and is the one most likely to be missed.
- **US2 (T013–T017)**: after T008. T013/T014/T015 are `[P]` with each other **and** with all of Phase 3 — different files or different functions.
- **Polish (T018–T026)**: after both stories. T020/T021/T022 are `[P]`.

### Parallel opportunities

- T013, T014, T015 together, and alongside Phase 3.
- T020, T021, T022 together.
- T018 alongside T019.

Everything inside `getGanttBarStyles` → the label → the diamond is strictly sequential: one inherited
`color` chain.

---

## Implementation Strategy

**MVP is Phase 2 + Phase 3.** That fixes the accessibility failure — the reason this feature exists —
and is shippable alone. Phase 4 is consistency: the pill, the labels, Reports, and the docs.

Phase 2 is genuinely blocking, not conventionally so: attempting Phase 3 first would regress the
labels, because white-on-`bg-white/20` over the *corrected* tokens fails 6 of 8 pairings.

**Suggested commits**: (1) T003–T008 — module, gate, ratio block; (2) T009–T012 — the label fix;
(3) T013–T017 — pill, labels, Reports, docs. Three reviewable commits, each independently verifiable.

---

## Notes

- The gate is the arbiter for the *map*; Gate 4 and the browser pass are the arbiters for whether the
  *component* uses it. Neither substitutes for the other.
- Do not "fix" a failing gate row by editing the script, relaxing 4.5, or dropping a surface. Every
  one of those makes the gate pass while the UI still fails.
- 44 colour values removed, 8 statuses made explicit, 1 module added, 1 script extended, 2 docs
  updated. Anything outside that footprint is scope creep and belongs in a follow-up.
