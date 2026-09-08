---

description: "Task list for 024 — accessibility remediation of the timeline, status colour and charts"
---

# Tasks: Accessibility Remediation — Timeline, Status Colour, and Chart Honesty

**Input**: `specs/024-accessibility-remediation/` — plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Plan gate**: `PASSED (clean)` — five iterations, 24 findings, no accepted exceptions. Verified before any task below was written.

**Tests**: Included. The spec's SC-003 requires an automated assertion, and three of this project's last four disclosure defects were closed by a test written *before* the fix.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelisable: different files, no dependency on an incomplete task
- **[Story]** — US1..US5 from spec.md

---

## Delivery: three PRs, not one

The plan is one coherent artifact; the delivery is not one merge unit. **Do not collapse these.**

| PR | Contents | Why separate |
|---|---|---|
| **A** | Phase 1 + US4 | Shares nothing with the rest, widest regression surface, and SC-009 is only bisectable if the token move is its own commit. No dependency on `b61a484`. |
| **B** | US2 + US3 | **Never apart.** Splitting them creates research.md R9's trap exactly: two workstreams converge on "every status needs a distinct fill", which fixes the segment bar and breaks the chart's FR-011 agreement with the Gantt. |
| **C** | US1 + US5 | Gated on PR #26 (`b61a484`) being in history — it is, on this branch. |

---

## Phase 1: Setup — PR A

- [x] T001 Read `research.md` R11a, R15, R16 and `quickstart.md` Gates 2–3 before touching a token; the `--input` values, the ratchet's provenance and the canary's failure mode are all recorded there and each was wrong in an earlier draft
- [x] T002 Run all four gates on a clean tree and record the output as the "before" baseline: `python scripts/verify-contrast.py`, `npm run build`, `CASCADE_REQUIRED=1 python scripts/verify-cascade.py`, `python scripts/count-control-borders.py`
- [x] T003 Record the cascade gate's current assertion 0 and assertion 2 readings — both print `rgb(229, 228, 231)` today. That is the empirical evidence the canary and the bare-border check are measuring the same value, i.e. that repointing the canary is required rather than tidy. Paste into the T006 commit message

---

## Phase 2: Foundational — none

No blocking prerequisite spans the three PRs. Each is independently landable in the order above.

---

## Phase 3: US4 — See the edges of form controls (P4) — PR A

**Goal**: every form control drawn with the input token clears 3:1, and the 81-control residue cannot grow.

**Independent test**: measure each control boundary in both themes; confirm no other surface moved.

### Gate work first — the canary must be correct before the token moves under it

- [x] T004 [US4] In `scripts/verify-cascade.py`, make assertion 0's canary **emission-independent**: read `--background` off the root element via `getComputedStyle(document.documentElement).getPropertyValue('--background')` and assert non-empty. Do **not** repoint it at `bg-background` alone — that depends on `@theme` emitting *and* the utility winning, which re-creates PR #17's `bg-popover` defect class one surface over (research.md R11a)
- [x] T005 [US4] Add `background` to the required-token list at `scripts/verify-cascade.py:74`, or T004 crashes on a missing key
- [x] T006 [US4] Rewrite assertion 0's comment: its current premise is *"`--input` and `--border` are identical"*, which T008 makes false. State what the canary now proves and why the old form would have reported `ABORT: the stylesheet did not load` on a **cascade** regression
- [x] T007 [US4] Add a `border-input` fixture to `scripts/verify-cascade.py` asserting computed `borderTopColor` equals the new `--input` **and differs from** `--border`. This is the only thing that proves the 41 sites moved

### The token move

- [x] T008 [US4] In `frontend/src/index.css`, set `--input: #86868e` (`:root`) and `#737a88` (`.dark`) — the existing `--popover-border` values, chosen in 023 for this exact 3:1 job. Comment why `#949494` was rejected: it clears 3.03 against white with no headroom and **fails at 2.71 against `--secondary`/`--muted`**
- [x] T009 [US4] Comment at the declaration that `--border` must **not** follow: it is applied by `* { border-color }` to every element, so moving it darkens all 223 hairline sites — SC-009 failing at maximum blast radius

### Gate the residue

- [x] T010 [US4] In `scripts/verify-contrast.py`, generalise the 3.0-tier loop at `:423-439` to `(token, surface, need)` triples and move the popover rows onto it. It currently hardcodes `t['popover']` and prints "on --popover", so adding an `--input` row to it as-is measures the wrong surface under a false heading
- [x] T011 [US4] Add `--input` rows against `--background`, `--card` and `--popover`, both themes. Expect 3.61/3.61/3.61 light, 4.15/3.89/3.49 dark
- [x] T012 [US4] Wire `python scripts/count-control-borders.py` into `quickstart.md` Gate 2 as its own command. The ratchet already exists and holds at 81; this makes it a documented gate rather than a script nobody runs
- [x] T013 [P] [US4] Add a `count-control-borders` step to `.github/workflows/ci.yml` in the `design-tokens` job — stdlib-only, no browser, same shape as the existing contrast step

### Verification

- [x] T014 [US4] Tamper: revert `--input` to `#e5e4e7`. Assertion T007 must fail naming the token, and the contrast rows must fail at 1.27. Restore
- [x] T015 [US4] Tamper: break the canary's property read. It must fail with the load-failure message, **not** silently pass — this is the assertion the whole file's credibility rests on
- [x] T016 [US4] Confirm the 81-control residue is unchanged and `count-control-borders.py` still exits 0 at `RATCHET HOLDS (81 <= 81)`
- [x] T017 [US4] **DONE — manual visual pass completed 2026-08-28 before PR B merged.** Visual pass in both themes.

  SC-009 hides two claims and only one needs an eye. *"Nothing unintended moved"* is a **closure** property and is now machine-checked: `count-control-borders.py` fails if any utility other than plain `border-input` consumes `--input` or if the site count leaves 45, and `verify-cascade.py` renders all three non-control shapes in both themes. So that half is true by construction.

  What remains is the judgment: **did anything that legitimately shares the boundary become visually heavier than intended?** That is four elements, not four screens:

  - `ui/button.jsx:13` — the `outline` Button variant, **56 usages**, the largest visual change in this PR
  - `ui/select.jsx:14` — `SelectTrigger`, 29 usages
  - `MyWorkPanel.jsx:483` — the "Add task" chip (verified numerically in T018; confirm visually)
  - `WorkProgram.jsx:3133` — a **read-only `<p>`** in the task modal. It was already styled as a read-only field (Label + border + `bg-muted/30`), so the question is not "is it now a field" but **does it now read as an *editable* one**, sitting beside real inputs at the same edge weight. **Decide whether to drop `border-input` here.**

    The measurements, so this is decided on evidence rather than on either prediction that was recorded before them. `bg-muted/30` over `--card` resolves to `#fcfbf9` light / `#1d1e25` dark. Against a live input's `--background` fill that is **1.03:1 light, 1.08:1 dark**; against the modal's own `--card`, **1.01:1** in dark. The fill is not a differentiator at those ratios. Both borders are now pixel-identical at `--input`.

    So this feature *strengthened* the signal the two elements share and left the one that separates them untouched. Before, both carried a 1.27:1 hairline — two weak signals, neither claiming "editable"; now both carry the same 3.61:1 edge. An earlier draft of this bullet predicted "the expected answer is no", which the arithmetic above does not support and which would have primed whoever ran the pass to confirm it. **No expected answer is recorded here on purpose.**

  **The deadline is not decoration.** PR B retokenises the status vocabulary across `GroupSummaryBar`, `taskStatus.js` and `Reports.jsx`. Once B lands, a visual regression reported afterwards cannot be attributed to A or B — which destroys the bisectability the three-PR split exists to create.

- **T017 result**: PASS. Verified live at `http://127.0.0.1:5178/` as `admin@itrack.test` in the seeded project, in both light and dark themes, with Laravel on `127.0.0.1:8011` and Vite on `127.0.0.1:5178`.

  - `frontend/src/components/ui/button.jsx:13` (`outline` Button): checked the Work Program toolbar/manage buttons, `Add Activity`, and modal `Cancel`. The stronger `--input` edge reads as an intentional control boundary, not as an unrelated hairline darkening; focus still has a separate ring signal.
  - `frontend/src/components/ui/select.jsx:14` (`SelectTrigger`): checked the project picker, status filter, and task modal status select. The trigger remains visually balanced against adjacent inputs and outline buttons; the chevron/text/combobox affordance, not the border alone, communicates interactivity.
  - `frontend/src/components/MyWorkPanel.jsx:483` ("Add task" chip): checked on the Dashboard My Work panel. The border is visible but not heavy; icon + label + hover/focus treatment make it read as an action chip rather than a form field.
  - `frontend/src/pages/WorkProgram.jsx:3133` (read-only Sub-Activity `<p>`): checked in the edit-task modal beside real inputs. Kept `border-input`: muted text, muted fill, no caret, no trigger icon and non-text cursor distinguish it from editable controls even though the border is now pixel-identical to `--input`.

  Supporting gates run after the visual pass: `python scripts/verify-contrast.py` exited 0 with `CONTRACT HOLDS`; `$env:CASCADE_REQUIRED='1'; python scripts/verify-cascade.py` exited 0 with `CASCADE CONTRACT HOLDS`; `python scripts/count-control-borders.py` exited 0 with `RATCHET HOLDS (residue 81 == 81, neither 4 <= 4)`.

- [x] **PR B PRECONDITIONS — both hold before PR B merges. Neither is a PR A blocker.**
  1. **T017 closed** (above).
  2. ~~**`Design tokens (cascade)` added to the required-checks list on `main`**~~ — **DONE**, applied 2026-08-28 immediately after PR A merged and verified by reading the protection back. See `docs/repo-settings.md`.

  PR B now has no open preconditions from PR A.

  They are paired deliberately. Requiring the cascade job protects *future* merges from reverting `--input`; it does nothing for PR A, whose cascade run is already green. The hole first becomes *exercisable* at PR B, which is the first PR to edit `verify-cascade.py` itself (T041) and the token vocabulary that job measures — a PR modifying a gate while that gate is advisory is the actual failure mode. Coupling PR A to a settings approval would only manufacture pressure to approve it unread, which is how branch protection got enabled as a side effect of an unrelated commit in the first place.
- [x] T018 [US4] Check `MyWorkPanel.jsx:483` (the "Add task" chip) individually: it has no fill of its own, so its inner edge is the container rather than `--background` (research.md R11a). Worst measured 3.25 against `--muted` on hover — clears 3:1. **The line number matters:** the file has six `border-input` sites (113, 166, 178, 188, 200, 483) and the other five are native controls with their own fill; only 483 has this property

---

## Phase 4: US2 + US3 — Status colour and chart honesty (P2, P3) — PR B

**Goal**: no status conveyed by colour alone; the chart tells the truth about quantity.

**Independent test**: view the summary bar and chart under dichromacy simulation; read every count without a pointing device.

### Tokenise first — this is a prerequisite, not cleanup

- [x] T019 [US2] Retokenise `STATUS_SEGMENT_CLASSES` in `frontend/src/lib/taskStatus.js` onto the `GANTT_STATUS_TOKENS` vocabulary. **Until this lands, SC-004 has no gate at all**: the current fills are raw Tailwind palette in oklch, and `verify-contrast.py` parses `#[0-9a-fA-F]{6}` only, so it cannot see a single one of them
- [x] T020 [US2] Retokenise `STATUS_BADGE_CLASSES` in the same file, in this task and not later. The segment and badge render one row apart in the same view (`MyWorkPanel.jsx:565`/`:120`, `TaskboardView.jsx:245`/`:294`) — that is the same-page adjacency FR-011 governs. Left undone the change is **net-negative**: it trades "segment disagrees with the Gantt" for "segment disagrees with the badge beside it"
- [x] T021 [US2] Express the badge as token utilities (`border-warning/40 bg-warning/10 text-warning`), never literals, or `verify-contrast.py`'s existing `on_tint` assertion — which already measures exactly that construction at α 0.10/0.15 — cannot see it
- [x] T022 [US2] Retokenise `LIST_STATUS_SEGMENT_CLASSES` at `frontend/src/pages/WorkProgram.jsx:126`. **Retokenised only — NOT widened.** The map still covers four of seven statuses, so the List view silently drops `backlog`/`for_review`/`blocked`; widening it changes which rows appear, a behaviour change no 024 requirement asks for. Filed in `docs/outstanding-work.md`. (An amendment note briefly said US2 owned this; it does not.) **Out of scope and must stay raw**: BugTracker's local map at `:38`, Retrospectives' sentiment, priority segments (research.md R17)

### The non-colour channel

- [x] T023 [US2] Extend `buildSegments` in `frontend/src/lib/groupSummary.js` with an optional glyph/ink source keyed like `className`, **defaulting to no glyph** so sentiment and priority callers are untouched. It currently returns `{key, count, pct, className}` with no ink and no glyph source
- [x] T024 [US2] Render a 1–2 character abbreviation centred in each segment of `frontend/src/components/GroupSummaryBar.jsx`, in the segment's `ink` token — `ganttPalette.js` already pairs fill/ink at a measured 4.5:1 for exactly this
- [x] T025 [US2] Suppress the glyph below a measured px width, mirroring the gate at `WorkProgram.jsx:2681`. Verify against the narrowest **real** column, and confirm `overflow-hidden` on the container is not clipping silently — that is the failure that looks fine in a wide reviewer browser
- [x] T026 [US2] Add `outline-1 -outline-offset-1` as the adjacency separator, **not `border`**: a border adds layout width inside the flex row and shifts the percentage widths the component's own header comment spends 20 lines protecting
- [x] T027 [US2] Add a text legend beneath the bar **printing the per-status count**. The count is a condition of shipping the glyph, not a nicety: `buildSegments` gives every present status an equal share regardless of count, so without printed numbers the glyph makes a misleading width *more* legible (research.md R18)

### The chart — rotate it

- [x] T028 [US3] Add `STATUS_FILL_TOKENS` to `frontend/src/lib/taskStatus.js` — **seven entries**, token names not values. Do **not** rename or generalise `ganttPalette.js`: `verify-contrast.py` anchors its parse to the literal export `GANTT_STATUS_TOKENS` and two tamper proofs were built on that anchor
- [x] T029 [US3] Exclude `pending`. It is synthesised by `getRollupStatus` for parent rows and never reaches `/api/reports`, whose `status_breakdown` is `countBy('status')` over leaf rows — including it would encode a false claim about the endpoint
- [x] T030 [US3] Replace the vertical `grid-cols-3 sm:grid-cols-6` chart at `frontend/src/pages/Reports.jsx:667` with a horizontal aligned-bar list: one row per status, label | track+bar | count. The current grid wraps at **four** statuses on mobile, and because the container is `h-16 items-end` a wrapped row does not extend the box — both rows compress and the baseline sits under only the bottom one.

  **Build the rows with `grid-cols-[6rem_1fr_3rem]`, not flex — FR-021/SC-012.** `index.css`'s print block sets `.flex { display: block !important; width: 100% !important; padding: 0 !important }`, so a flex row **stacks vertically when printed**, on a page whose primary action is the Print / Save as PDF button at `:283`. Grid is also the honest expression of "bars sharing one length scale" and is immune to that reset
- [x] T031 [US3] Compute `total` **once outside the map** and bar length as share of project total; print the total in the panel header (`Task Breakdown · 412 tasks`). `maxVal` is currently recomputed inside the map callback, and per-card max normalisation makes a 40/30/30 split render identically to a 90/5/5
- [x] T032 [US3] Render all seven rows always, driven by `STATUS_ORDER` and indexed `breakdown[status] ?? 0` — not `Object.entries`. This also makes the chart immune to `countBy`'s empty-collection serialisation
- [x] T033 [US3] **THREE mark types, not two — FR-019/SC-011, amended 2026-08-29.** Zero renders an empty track and a printed `0`; a count **below the scale's resolution** renders a *pip* — a fixed small mark that is visibly **not** a bar; anything above renders a proportional bar.

  The original `max(0.25rem, share)` clamp trades one indistinguishability for another. Every count below the clamp's threshold renders at identical length, so a reader cannot tell 1 from 7 — while the mark still *looks* proportional and therefore still makes a quantitative claim it cannot support. The current chart shows how bad this gets: it is **max-scaled**, `height: (count / max) × 100%` in a 64px box, so a count of 1 against a largest count of 900 is **0.07px**.

  The pip extends the rule already adopted for zero rather than inventing a precedent — and it turns the replacement for the deleted T041 into a real assertion (*"a sub-resolution row renders the pip and no bar"*) rather than one certifying that CSS `max()` works.

- [x] T033a [US3] Set `print-color-adjust: exact` on the track and fill — FR-021/SC-012. `print-color-adjust` appears **nowhere** in `index.css` today, so browsers drop background fills from the printed copy and the chart prints as empty tracks
- [x] T034 [US3] Print counts in a right-aligned `tabular-nums` column and **delete the hover tooltip**. `scale-0` is a transform and does not remove the node from the accessibility tree, so "N tasks" is currently live text on every bar — FR-004's defect class on a second surface
- [x] T035 [US3] Delete `matchStatusColor` at `Reports.jsx:732-749` entirely. Its `todo`/`done` branches are dead against the backend enum and `not_started`/`completed`/`delayed` all fall through `default` to one violet
- [x] T036 [US3] Replace the `project.status_breakdown &&` truthiness guard at `:664` with `total > 0` and render an explicit "No tasks yet" panel. An empty collection JSON-encodes as `[]`, which is truthy, so a zero-task project currently renders a bare bordered rail
- [x] T037 [US3] Retokenise the risk tiles to stop encoding by hue: `--destructive` when count > 0, `--muted-foreground` when 0. Two of the three are **not statuses at all** — overdue and dependency-risk are derived metrics borrowing the status palette's hues. This is deliberate scope beyond FR-011's letter, recorded rather than ridden in implicitly.

  **Line-number correction:** the cited `:502-509` is the **Blocked tile alone**. The three page-level tiles span roughly `:485-527`. Following the original range lands only one of them.

- [x] T037a [US3] **Remove the Blocked count from the risk tiles — FR-020/SC-013, amended 2026-08-29.** It is printed twice on the same page in two visual languages: once as a tile and, ~16px away, once as a chart row computed from a second code path (`ReportController.php:127` vs `:130`).

  The chart is a **partition** — mutually exclusive, summing to a denominator. The tiles are **overlapping predicates**: a task can be overdue *and* blocked *and* counted in a status row. Nothing on the panel says so, so a reader seeing "Overdue: 47" beside a chart whose largest bar is 30 will try to place 47 on that scale. `Blocked` is the only one of the three tiles that is *also* a status, so removing it makes the tiles purely derived and the chart purely partition — the vocabularies stop overlapping rather than needing reconciliation.

- [x] T037b [US3] Retitle the tile group to name what it is (e.g. "Risk Flags") and state that a task may appear in more than one. One line, and it is what stops the partition/predicate confusion the amendment describes

### Gates

- [x] T038a [US3] **Assert no status reaches its treatment through a default branch — FR-022, amended 2026-08-29.** This is a **distinct regression class** from B1's palette-literal ratchet and needs its own assertion.

  B1 shipped the literal half and recorded the boundary rather than implying coverage: **a token utility is not a palette literal, and the live bug is a token utility.** `matchStatusColor`'s `default: return 'bg-primary/70'` is what collapses `not_started`, `completed` and `delayed` into one violet today, and it would pass a palette-literal ban unchanged. T035 deletes that function; this assertion is what stops the shape returning. Anchor it to structure (no `default:` in a status→treatment map, and every `STATUS_ORDER` key present as an explicit key), not to the function name — a name grep fires on a comment and passes if the function is renamed

- [x] T038 [US3] Add the five `STATUS_FILL_TOKENS` contracts to `scripts/verify-contrast.py` per `contracts/ui-contracts.md`. **Five, not four** — the fifth is treatment distinctness and is SC-004's only mechanism; building "the four" drops it
- [x] T039 [US2] **DONE in B1 — and the contract it names was the wrong one.** ΔE00 threshold **stated: 11.0**, and the assertion is not what this task described.

  Every artifact said the fills must clear "a stated ΔE00" and none of them stated the number, which leaves the implementer to measure first and then pick a threshold the measurement clears. So it is fixed in the gate, before any fill is chosen.

  **The palette does not clear 11.0 and cannot be made to.** Measured (Viénot–Brettel–Mollon 1999 + CIEDE2000) over the current fills, 6 of 40 theme/deficiency/pair combinations fall below it — and *every one* lies inside the red/amber/green triad. `muted-foreground` and `info` separate cleanly in all four conditions.

  | theme | deficiency | pair | ΔE00 |
  |---|---|---|---|
  | light | deutan | `for_review` vs `blocked`/`delayed` | **3.98** |
  | light | protan | `for_review` vs `blocked`/`delayed` | 4.85 |
  | light | protan | `completed` vs `for_review` | 7.28 |
  | light | protan | `blocked`/`delayed` vs `completed` | 8.18 |
  | dark | deutan | `blocked`/`delayed` vs `completed` | 7.07 |
  | dark | protan | `completed` vs `for_review` | 9.37 |

  The worst pair **abuts** in the summary bar. Tuning tokens does not fix it: driving every token to clear a similar ratio against the same shared surfaces pushes them toward equal luminance relative to one another, which is the mechanism `verify-contrast.py`'s own header describes — running the 4.5:1 gate harder makes dichromatic collapse worse.

  So the shipped contract is **not** "fills clear 11". It is: **every pair below 11 must be separated by a channel that is not colour** — WCAG 1.4.1 as an arithmetic precondition rather than an intention. That makes US2's glyph load-bearing by construction. The set is frozen at exact equality, so a pair crossing the line in *either* direction must be recorded
- [x] T040 [US3] **DONE in B1, scoped differently, and with a hole named rather than papered over.**

  As written this asserted over `Reports.jsx` only. Two problems: the identical defect class lives in `taskStatus.js` (which **US2 rewrites**) and `WorkProgram.jsx`'s `LIST_STATUS_SEGMENT_CLASSES`, neither of which was covered; and a flat ban would be **red on day one**, since ten raw literals survive Phase 4 in `Reports.jsx` that no task touches — at which point the implementer expands scope or weakens the regex, and weakening it removes the risk-tile coverage the contract claims.

  Shipped as a **ratchet over the named maps** (`STATUS_SEGMENT_CLASSES` 7, `STATUS_BADGE_CLASSES` 28, `LIST_STATUS_SEGMENT_CLASSES` 4), two-sided, so the count cannot grow and a reduction must be recorded. Scoped to maps, not files, because `WorkProgram.jsx` carries 18 literals of which only 4 are status vocabulary.

  **The hole, stated plainly: a token utility is not a palette literal, and the live bug is a token utility.** `Reports.jsx`'s `matchStatusColor` ends `default: return 'bg-primary/70'`, which is what collapses `not_started`, `completed` and `delayed` into one violet *today*. A palette-literal ban would not have caught the defect it was written to prevent. That half belongs to the fail-open-default work, not to this ratchet
- [ ] ~~T041~~ **DELETED — it could not have been built, and would have gone green.**

  `verify-cascade.py` never loads the app. It copies the built stylesheet into a temp dir and constructs its **own fixture HTML** from a hand-written `CASES` list; it never executes React. The chart's bar length is a JS-computed inline style, so it is *structurally unreachable* by this gate.

  The only way to satisfy T041 as written is to hand-write a fixture whose width the author also writes — `<div style="width: max(0.25rem, 0.2%)">` computes to 4px because the CSS spec says so, in a document containing no application code. It would be green, it would be correct, and it would say nothing whatsoever about `Reports.jsx`. That is not a *risk* of vacuity; it is vacuity by construction, and it is the same shape as the reports row whose fixture made the sentinel structurally ineligible.

- [x] T041a [US3] Extract the chart's arithmetic to a pure `barWidth(count, total)` (and `buildStatusChartRows(breakdown)`) in `frontend/src/lib/reportChart.js`, and test it with `node --test`. Assert: `barWidth(1, 900)` clamps to the floor; `barWidth(0, 900)` is `0px`; the denominator is the **sum of all response values**, not of the seven known keys; rows sum to the printed header total; a status key absent from `STATUS_ORDER` surfaces rather than vanishing. This is testable because it is arithmetic — the same reasoning already applied to `ganttA11y.js` in Story 1 and not applied here
- [x] T041b [US3] Assert in `verify-contrast.py` that `Reports.jsx` imports `barWidth` from that module and contains no inline width arithmetic, so the function under test is the one that ships
- [x] T042 [US2] Tamper: give `delayed` its own hue. Contract 2 must fail. This is the assertion that stops a future contributor "fixing" the sanctioned sharing and reopening what 023 closed
- [x] T043 [US2] Manual protanopia and deuteranopia simulation of every status treatment, both themes. SC-004 says "verified by measurement rather than inspection" — the gate measures treatments, but pairwise perceptual judgement still needs an eye

- **T043 result: PASS.** Re-run 2026-08-29 after seeding all seven statuses, in **light and dark × protanopia and deuteranopia** (Viénot–Brettel–Mollon `feColorMatrix` over the whole document), Taskboard collapsed group header, `admin@itrack.test`.

  The first run was recorded PARTIAL and was right to be: the seed data held only `not_started`/`in_progress`/`completed`, so the ΔE00 sub-threshold pairs — the ones FR-009 exists for — never rendered. 14 tasks were reassigned across all seven statuses in the local dev database (snapshot taken first; see the restore note below). `STATUS_ORDER` then renders the bar as `BL NS IP RV BK DL OK`, which places **every** pair that matters in direct adjacency.

  **What the eye saw that the arithmetic understated.** The measured worst pair is `for_review` vs `blocked`/`delayed` at ΔE00 3.98 in light deuteranopia. Rendered, it is worse than one number suggests — the collapse is not pairwise, it is a **run**:

  | theme | deficiency | observed |
  |---|---|---|
  | light | deutan | `RV` `BK` `DL` `OK` all render one olive — **four statuses, one colour** |
  | light | protan | same four-way collapse |
  | dark | deutan | `BK` `DL` `OK` one tan — *blocked*, *delayed* and *done* indistinguishable |
  | dark | protan | `BK` `DL` olive, `OK` pale yellow — closest separation of the four conditions, still slight |

  So in light theme a deuteranope cannot tell *for review*, *blocked*, *delayed* and *done* apart **at all**. Failure and success are the same colour. The glyph is not a supplement to the colour channel there; it is the entire channel. That is the case for FR-009's inverted contract, demonstrated rather than argued.

  **Measured at real Taskboard widths** after the 2026-08-29 re-run: at `1280x900`, the Status column is `131.17px` and each seven-status segment is `18.73px`; at `1920x1000`, the column is `222.63px` and each segment is `31.8px`. Both widths now render `BL NS IP RV BK DL OK` above the suppression floor, with `RV BK DL OK` directly adjacent in light/dark protanopia and deuteranopia. Ink-on-fill remains **6.46-10.71:1** at 9px/700 against a 4.5:1 threshold. `BL`/`NS` share a fill and `BK`/`DL` share a fill -- the two sanctioned fill-sharing pairs are pixel-identical in fill and separated **only** by glyph, in every theme and every deficiency. Counts aligned beneath their own segments, one line, all four conditions.

  **Four defects found and fixed before this pass**, all invisible to the automated gates: the legend broke the collapsed-header footprint (wrapped to three lines in the real status column, lifting the segment bar 7px off the Priority bar); every status name was announced twice; the `20px` glyph floor suppressed all seven glyphs at `1280x900` even though the bad pairs rendered; and the visual glyph bar still exposed status names through `title` while the `sr-only` list carried the canonical accessible status list. The final pass measured Status/Priority bar top offset at `0`, one `sr-only` list item per status, `aria-hidden="true"` on the glyph-bearing visual bar and count row, and zero focusable controls inside the summary.

  **Dev-data note.** The final re-run temporarily reassigned task IDs `23-36` from `not_started` across two `STATUS_ORDER` runs, then restored those same 14 rows to `not_started` after the browser pass. No seeded DB state is required to remain in place for B2.

---

### PR B3 result — Story 3 delivered 2026-09-07

All gates green on the final tree: `verify-contrast.py` HOLDS, `count-control-borders.py`
RATCHET HOLDS (81 == 81), `verify-cascade.py` CASCADE CONTRACT HOLDS with `CASCADE_REQUIRED=1`,
`npm run build` clean, `npm run lint` 0 errors, `npm test` 67 pass / 0 fail (13 new in
`reportChart.test.js`).

**Ten tampers, each failing by name** (harness re-run after every change, tree restored between):
assertion 1 by adding `pending`; assertion 2 by giving `delayed` its own hue, and again by drifting
`STATUS_SEGMENT_CLASSES` from the token map; assertion 3 by driving `--success` onto the panel
colour; assertion 4 by giving two statuses one label; assertion 5 four ways — inline width
arithmetic, `barWidth` off the render path, a `?? 'bg-primary/70'` fallback, a raw palette literal;
and map completeness by deleting a glyph.

**Decisions taken as architect, recorded because they are not in the task text:**

- **`STATUS_FILL_TOKENS` is the token-name form of `STATUS_SEGMENT_CLASSES`, not a new vocabulary.**
  The gate pins them (`STATUS_SEGMENT_CLASSES[s] === 'bg-' + STATUS_FILL_TOKENS[s]`), which is what
  makes the chain assertable end to end: css value <- token name <- utility class <- component.
  Tailwind cannot build a class at runtime, so the component must use the utility form; without the
  pin both maps could pass individually while the chart drifted from the Gantt.
- **The scale's resolution is stated at 1% of the total** (`SCALE_RESOLUTION_PCT`), and the pip is a
  6px **dot**, not a short bar — different shape *and* height, so it makes no length claim.
- **No glyph in the chart.** Every row prints its full label, which is a stronger non-colour channel
  than a two-character abbreviation and avoids minting a second treatment vocabulary. Assertion 4 is
  therefore anchored to label distinctness on this surface, and the existing glyph block continues
  to hold the summary bar. Confirmed under simulation: in light deuteranopia `Delayed` and `Done`
  render as one olive, and the rows stay unambiguous by label, position and printed count.
- **An unknown status key renders in `bg-foreground` with its raw key as the label** — a treatment
  belonging to no status, so it reads as "the backend grew a value this chart has never heard of"
  rather than impersonating one of the seven.
- **T037a extended to the page-level Blocked tile as well**, which the task scoped to the
  per-project one. The screenshot settled it: the tile read "Blocked Tasks 2" while the chart row
  one card below read "Blocked 2" — the same count, twice, on one screen, in two visual languages,
  from two code paths. SC-013 is page-scoped. The summary grid moved from `lg:grid-cols-4` to
  `lg:grid-cols-3`.
- **T041a's `barWidth(1, 900)` returns `'0%'`, not a clamped floor.** The task predates Amendment B;
  a clamp is still a length, and FR-019 replaced it with the third mark type. The test asserts the
  amended behaviour and says so at the assertion.

**Two defects found by measurement that no gate could see, both fixed:**

1. **`rounded-sm` computes to 6px in this theme**, so a narrow bar rendered as a rounded blob
   visually identical to the pip — collapsing the exact distinction the third mark type exists to
   make. Found by reading the rendered box (`markRadius: "6px"`), not by reading the class. Bars now
   use `rounded-[2px]`, an arbitrary value so a future `--radius` change cannot reopen it.
2. **The chart printed as seven empty rails.** Under `@media print`, `index.css` flattens `.flex` to
   `display: block !important`; the mark `<span>`s lost the blockification the flex track was giving
   them, reverted to `display: inline`, and a percentage width does nothing on an inline box. Every
   bar measured **0.00px** under emulated print media, with `print-color-adjust` faithfully
   preserving the colour of nothing. FR-021 is about layout as much as palette, and making only the
   *row* a grid was not enough. Marks now carry `block` explicitly.

   **The first diagnosis was wrong and the tamper caught it.** Attributing the fix to the track's
   `block` failed to reproduce: tampering the track back to `flex` still printed correctly, because
   by then the marks declared their own display. The in-code comment was corrected to match the
   evidence.

**And the verification itself failed twice before it worked**, which is the part worth keeping:

- Draft 1 of the print check measured layout and colour only, and reported **PASSES** with every
  printed bar at 0.00px.
- Draft 2 compared print against screen (`screen > 0 and print == 0`) and went green again the
  moment a tamper broke *both* media at once — the defect became invisible because its own
  reference moved with it. Same defect class as the `!= 2 * len(...)` guard recorded in
  `verify-contrast.py`, and the same as the max-normalised chart this story replaces.
- Draft 3 derives the expectation from the **data** — a count at or above the scale's resolution
  must draw a mark with width, in both media — and fails by name on the tamper.

  The script is `scratchpad/print_check.py` and is deliberately **not** a committed gate: it needs
  the app running and a login, which `verify-cascade.py` structurally does not do. Recorded here
  rather than implied, per Contract 4.

**`--input` was misused and an existing gate caught it.** The track's boundary was first drawn in
`outline-input` to clear 3:1, and `count-control-borders.py` failed: *"`--input` has a consumer
other than plain `border-input`"*. It was right — `--input` means "the boundary of a form control",
a chart track is not one, and borrowing a token for its **value** rather than its **meaning** is
exactly what invalidates the blast-radius set PR A recorded when it moved that token. The fix was
to the cause, not the allowlist: the track is now `bg-muted-foreground/30`, a tint of the chart's
own vocabulary, and its ratio (1.52 light / 1.76 dark) is **printed by the gate rather than
asserted** — 1.4.11 governs the parts of a graphic required to understand the content, which here
are the bars (5.62–9.95, asserted) and the printed counts, not the backdrop.

**Not covered, stated rather than implied:** `getHealthStyle` in `Reports.jsx` is a second status
vocabulary with its own enum and a `default:` returning **'On Track' in emerald** — an unknown or
null health renders as healthy. FR-022 covers it in principle; this gate is anchored to
`STATUS_ORDER` and does not. Filed in `docs/outstanding-work.md`.

---

## Phase 5: US1 + US5 — Keyboard timeline and honest labels (P1, P5) — PR C

**Goal**: the timeline is operable without a mouse and announced once per row; no interface text misdescribes the system.

**Independent test**: complete the full timeline workflow by keyboard, then by screen reader in **both** focus and browse mode.

### The failing test comes first — this ordering is the point

- [x] T046 [US1] Create `frontend/src/lib/ganttA11y.test.js` **before the formatter exists**, seeding `responsible: 'SENTINEL-CONTRIBUTOR'` and asserting the Client-role string does not contain it, for `'Client'`, `null`, `undefined`, `''` and an unknown role — and that an internal role **does** receive it. Both directions: a formatter withholding from everyone satisfies the first assertion and breaks the product
- [x] T047 [US1] Confirm it fails for the right reason (module absent), not a passing no-op. Snapshot-testing a rendered span would pass when the field is missing *for the wrong reason* — the fixture simply had no `responsible`. That is the trap that made #14's `reports` row vacuous
- [x] T048 [P] [US1] **DONE in B1, pulled forward, and as a STEP rather than its own job — deliberately against this task's instruction.**

  The path hazard this task names is real for the *documented repo-root command*, but not for an npm script: `npm test` runs with `frontend/` as its cwd, and `node --test "src/**/*.test.js"` resolves correctly there. Verified, 55 tests passing.

  The verdict-separation argument loses to a stronger one. A **new job is advisory** until someone adds it to the required-checks list — which is exactly the hole 024 spent PR #33 closing for the cascade gate. A step inside `Frontend (build)`, already required, blocks a merge the moment it lands and needs no settings change. Splitting it later is cheap; shipping an advisory test gate is not.

  Also closed a standing defect: `frontend/src/lib/supportTemplates.test.js` has existed since Support Ops shipped and **nothing ever ran it** — no `test` script, no CI step. 55 assertions reporting nothing, which is the purest form of the defect this feature keeps finding

### The pure module

- [x] T049 [US1] Extract `getGanttStatusLabel` from `WorkProgram.jsx:644` into `frontend/src/lib/ganttA11y.js`. It is a component-scoped arrow, so a pure module can neither import it nor duplicate it without minting a fifth status vocabulary. The **Gantt** set is authoritative for the announcement, not `taskStatus.js`'s competing `completed → "Done"`
- [x] T050 [US1] Implement `canSeeContributor(role)` as a **positive allowlist** over the four non-Client roles. The current `role === 'Client'` fails **open** — `useEffectiveUser()` returns null before auth resolves, so `isClient === false` and the contributor renders
- [x] T051 [US1] Implement `buildGanttBarLabel(row)`: code, name truncated at ~80 chars on a word boundary, status via T049, dates via `formatDate`. **Never** append "button" (the role supplies it) and **never** append "Click timeline bar to edit"
- [x] T052 [US1] *(function delivered and tested in C1; **consumed** in C4)* Implement `buildGanttBarDescription(row, { includeContributor })` — level, planned-vs-actual, duration, progress. It takes the **decision**, never the role
- [x] T053 [US1] Confirm T046 now passes, and re-run the sentinel tamper: force `includeContributor` true for a Client and watch it fail by name

### The timeline

- [x] T054 [US1] Convert `WorkProgram.jsx:2662` to a **non-focusable wrapper** carrying `group` and the inline `left`/`width`/`top`; put a `<button className="h-full w-full">` inside it with the visual classes, `getGanttBarStyles` and the click handler; make the card a **sibling of the button**, still inside the wrapper. The card at `:2733` is a *descendant* of that div today, so converting in place nests a field grid inside a button
- [x] T055 [US1] Move progress fill, percentage label and milestone diamond inside the button as `<span>`s. The wrapper takes **no `tabIndex` and no `onClick`** — both on the button, or the element ships two activation paths
- [x] T056 [US1] Focus style `focus-visible:outline-2 focus-visible:outline-offset-2`. **Not `ring-2`** — Tailwind v4 ring is box-shadow, lost over a busy grid and erased by forced-colors. Do **not** add `outline-none`; the file already carries 122
- [x] T057 [US1] Reveal the card with `group-hover:opacity-100 group-has-[:focus-visible]:opacity-100`. **Not `group-focus-visible`** — after T054 the `group` is the non-focusable wrapper and that selector can never match. **Not `group-focus-within`** — it fires on mouse focus and pins the card open behind the modal it just launched
- [x] T058 [US1] Mark the card `aria-hidden="true"`, and cite the in-file comment at `:2730` in the diff: it forbids exactly this, and is right about `aria-hidden` **alone** — T059 is what makes it safe
- [x] T059 [US1] Render `buildGanttBarDescription` into an `sr-only` span at the end of the **left-pane** row (after the Edit button, ~`:2538`) with a stable id, and point the bar's `aria-describedby` at it. Left pane, not right: browse mode reads all N left rows then all N bars, so a right-pane description lands N rows away from its summary
- [x] T060 [US1] Delete the "Click timeline bar to edit" string at `:2781` — do not rephrase it (FR-005)
- [ ] T061 [US1] Implement `dismissedRowId` as **one** state on the timeline pane: Escape sets it and stops propagation, focus change clears it, and the reveal class is one ternary inside the map. Never one hook per row. Session-sticky dismissal is worse than the defect 1.4.13 asks you to fix
- [x] T062 [US1] Flip the card from `bottom-full` to `top-full` for row 0 — it currently renders over the sticky header
- [ ] T063 [US1] Give the chevron button at `:2456` an `aria-label` and `aria-expanded`. It is icon-only and announces as "button" — **4.1.2 and 1.3.1, both level A, inside the 508 legal floor**, unlike most of this feature
- [x] T064 [US1] Wrap the timeline in `<section aria-label="Project timeline">`. Three tab stops per row is ~150 before a user escapes a 50-row timeline — 2.4.1 in practice
- [ ] T065 [US1] Consume `canSeeContributor` at the three **visible** sites (`:2441`, `:2476`, `:2774`), not only in the formatter. Using it in one and leaving `!isClient` in the other recreates precisely the divergence FR-007's single-definition clause forbids
- [ ] T066 [US1] Add the forced-colors rule giving critical-path bars `outline-style: dashed`. `getGanttBarStyles` sets colours **inline**, which HCM overrides wholesale, so today every bar reads as critical-path — and a solid focus outline makes that worse
- [x] T067 [US1] Verify `scroll-margin-top` on the button so tabbing to an off-screen bar is not obscured by the sticky `h-20` header (2.4.11)

### US5

### C3 result — the bar is a focusable, named button (2026-09-08)

Delivered as its own increment, ahead of the description work, and **named as well as focusable**
deliberately: a focusable bar with no accessible name would add one tab stop per row announcing
only *"button"*. On a fifty-row timeline that is fifty unnamed stops — worse for the exact user
Story 1 exists for than the mouse-only bar it replaces. "Independently verifiable" was the wrong
test for an increment; **independently shippable** is the right one.

**Line references re-baselined first.** `tasks.md` had drifted ~28 lines from the file; the bar is
at `:2690`, the card at `:2760`, the chevron at `:2483`, the left-pane Edit button at `:2542`.
Every anchor in T054–T067 was located before anything was edited.

**Structure.** The clickable div became a non-focusable positioning wrapper carrying `group`, with a
real `<button type="button">` inside holding the visuals, `getGanttBarStyles` and the click handler.
The hover card is now a **sibling** of the button inside that wrapper — it was a *descendant* of the
old div, so converting in place would have put a field grid inside a button and folded the whole
card into the element's accessible name. Progress fill, percentage label and milestone diamond moved
inside as `<span>`s (a button's content model is phrasing content). The wrapper takes no `tabIndex`
and no `onClick`.

**T049 closed a duplication this feature created.** C1 put `getGanttStatusLabel` in
`lib/ganttA11y.js` and `WorkProgram.jsx` kept its own copy — for one increment there were genuinely
two copies of the vocabulary, which is the fifth-vocabulary outcome the extraction existed to
prevent. The visible badge and the bar's accessible name now read the same function.

**Verification.** 101 frontend tests (7 new structural assertions in
`WorkProgram.ganttBar.test.js`), build clean, lint 0 errors, contrast/cascade/ratchet gates hold.
A new runtime check, `scripts/uichecks/gantt_keyboard.py`, confirms against a real session: every
bar is a `<button type="button">` with a non-empty name, Tab reaches them in row order, focus is
indicated, and **both Enter and Space open the same editor a click opens**.

**Three things went wrong that are worth keeping:**

1. **A check that could not attribute its own failure.** `gantt_keyboard.py` first selected bars by
   the `focus-visible:outline-2` class — so *deleting the focus outline* made it report **"no bars
   found"** instead of "no focus indicator". The right verdict for the wrong reason. It now selects
   `[data-gantt-bar]`, a structural hook, and the component carries a comment saying why a test hook
   is in production code.

2. **An assertion that matched its own prose.** The structural test's "no `ring-2`" check read the
   whole button tag — including the comment explaining why a ring is wrong — and failed on the text
   describing the correct decision. Exactly what `verify-contrast.py`'s header already warns about
   ("a name grep fires on a comment"). It now reads the `className` value only.

3. **An afternoon spent fixing something that was never broken.** Headless Chromium reports
   `outline-width`, `outline-color` and `outline-offset` pinned at their initial values regardless of
   what is set — *including inline*, which nothing can override. `outline: 4px dashed red` set inline
   computes as `dashed 3px currentColor offset 0`: only `outline-style` responds. On that evidence
   the Tailwind focus utilities were declared broken, replaced with an unlayered `index.css` rule,
   and that "did not work either". Headed, the original utilities report
   `solid 2px rgb(180,83,255) offset 1.33px` — correct all along. The rule was removed, the utilities
   restored, and every comment claiming they failed was deleted rather than shipped. The check now
   asserts `outline-style` only and carries the reason at the assertion; width and colour belong to
   the manual pass, which is what T073 already says about trusting emulation.

**Not done here, deliberately:** the accessible *description* (`aria-describedby` into the left
pane), the card's `aria-hidden`, Escape dismissal, the chevron's name, and forced-colors — C4 and
C5. The card is still read inline by a screen reader, exactly as before this change; that is
unchanged status quo, not a new defect.

**Specialist routing:** the constitution routes an accessibility surface to the Section 508
Specialist during planning. Not dispatched — recorded as an exception, per the constitution's own
instruction to record rather than skip silently. `/impeccable audit` and `code-slop` remain scheduled
at T075–T077 and are not skipped, only sequenced.

---

### C4 result — the announcement (2026-09-08)

The card is `aria-hidden` **and** revealed by keyboard focus. Both halves had to land together: the
comment that stood there was right that `aria-hidden` alone would be worse, deleting the information
for screen-reader users while leaving it mouse-only for everyone else. Nothing is deleted — it is
relocated to an `sr-only` node the bar points at with `aria-describedby`.

**The description lives in the LEFT pane.** The panes are separate subtrees, so browse mode reads all
N left rows and then all N bars; a description in the right pane would be met N rows from the summary
it belongs to.

**It sits outside the 12-column grid, and that is load-bearing.** Those cells already sum to 12
(5+2+2+2+1), so a thirteenth child wraps to a second line and makes every left row taller than the bar
it must stay level with. `gantt_announcement.py` asserts left rows are still 48px so it cannot
regress quietly.

Row ids are prefixed by level (`module-1`, `task-1`), so the `aria-describedby` targets are unique —
a collision would have had two rows described by each other's task, silently.

`group-has-[:focus-visible]`, not `group-focus-visible` (the `group` is the non-focusable wrapper, so
it can never match) and not `group-focus-within` (fires on mouse focus and pins the card open behind
the modal the click just opened). Row 0's card flips to `top-full`; verified `['down','up','up','up']`.

**Verification.** 106 frontend tests (6 new structural), build clean, lint 0 errors, all three
design-token gates hold. `gantt_announcement.py` confirms against a real session: every bar points at
a description node that exists and is non-empty, the card is inside an `aria-hidden` subtree, nothing
outside a description exposes the detail fields, the click-only instruction is gone, and the card
reveals on keyboard focus. **Six tampers, each failing by name.**

**Three reported failures this increment were the check's construction, not the app's** — bars
selected by their focus-outline class; exposed-node count compared against *bar* count when rows
without dates render a row and no bar; card opacity read mid-transition. Each was caught by asking
why a red looked odd rather than by changing the app to satisfy it. On this surface a surprising red
is more often the instrument than the subject.

**And one assertion turned out to be vacuous.** The description is a new rendering path for
role-restricted data, so FR-007 applies — but measured against the API, a Client's
`/projects/{id}/modules` omits `responsible` **entirely**, so there is nothing for the description to
leak. Tampering `includeContributor` to a hard `true` left the check green: correct, and useless.
FR-007 is enforced **server-side**; the frontend gate is defence in depth. The check now asserts the
API response — which is non-vacuous and is where the control lives — and keeps the rendered-text
assertion with its vacuity stated at the assertion, because it stops being vacuous the day the
resource starts sending the field. That also discharges T078's substance for this surface.

**Still open for C5:** Escape dismissal (T061), the chevron's name and expanded state (T063), and
forced-colors (T066).

---

- [ ] T068 [P] [US5] Rewrite the "Mock Auth Mode" copy at `frontend/src/pages/Admin.jsx:1455` to describe the production mechanism (issue #12)
- [ ] T069 [P] [US5] Grep JSX string literals for `mock`, `prototype`, `scaffold`. SC-010 says "no interface text"; T068 fixes one known site, and the sweep is the difference between fixing an instance and satisfying the criterion
- [ ] T070 [US5] Hide the Schedule assignee filter on **emptiness, never role**: the test is `assignees.length <= 1` (the array is seeded with `'all'`, so `=== 0` never fires and the feature ships looking done), and force `assigneeFilter` back to `'all'` when hidden or the predicate at `:344` keeps filtering by an invisible value

### Verification

- [ ] T071 [US1] Keyboard-only pass of the full flow: locate a task, read its schedule, open the editor (SC-001)
- [ ] T072 [US1] **NVDA + Firefox in both focus and browse mode**; JAWS + Chrome; VoiceOver + Safari — the last is the one that exposes a cross-pane `aria-describedby` problem if there is one
- [ ] T073 [US1] **Real** Windows High Contrast, not Chromium emulation: emulation does not faithfully reproduce the inline-style override on the Gantt bars, which is the mechanism T066 addresses
- [ ] T074 [US1] Confirm each task is announced **once** — no duplicate card content inline (FR-004, SC-002)

---

## Phase 6: Polish

- [ ] T075 Run `/impeccable audit frontend/src/pages/WorkProgram.jsx` and `/impeccable critique frontend/src/components/GroupSummaryBar.jsx`; classify findings Critical/Major/Minor/Suggestion
- [ ] T076 Resolve every Critical and Major, or document acceptance in plan.md (Constitution Completion Gate)
- [ ] T077 Run `code-slop` on the diff: no per-row `useState` in the timeline map, no defensive wrapper around values the caller guarantees, and every comment either records a rejected alternative or is deleted
- [ ] T078 Run `laravel-owasp-security` scoped to FR-007's surface — a new rendering path for role-restricted data, not an endpoint
- [ ] T079 Write `verification-record.md` with each gate's **actual output**, every manual result, and every Critical/Major with its resolution. **Regenerate figures, never retype them** — three drafts of 023's artifacts carried hand-transcribed ratios and two were wrong
> **If the ratchet goes red in PR B, read the failure — do not bump the baseline reflexively.**
>
> An earlier version of this note claimed "PR B and PR C will legitimately trip the ratchet" and
> told the implementer to update the baselines. **That was wrong on its facts, and wrong in the
> dangerous direction**: it pre-authorised a baseline bump for a red the work will not produce, so
> a genuine failure would have been silenced by a note that looked like permission.
>
> Verified against the tree: `count-control-borders.py` counts **literal `<input|select|textarea>`
> tags only**. `Reports.jsx`'s 10 residue controls are all in the filter bar (lines 306, 323, 340,
> 358, 377, 388, 401, 419, 547, 563). T030's chart is at `:667` and T037's tiles at `:504`/`:650` —
> every element in both regions is a `<div>` or `<span>`, and `Reports.jsx` contains **zero**
> `border-input` sites. So `BASELINE_BORDER = 81` and `BASELINE_INPUT_SITES = 45` are untouched by
> Stories 2 and 3 as planned.
>
> The three things that *can* trip it, and the correct response to each:
>
> | Trip | Response |
> |---|---|
> | The new chart's **empty track** is given `border-input` — a plausible choice, since `--border` measures only 1.24:1 against the panel while `--input` clears 3:1. Sites 45 → 46 | **Bump `BASELINE_INPUT_SITES`, same commit.** Legitimate, and the one expected bump in this PR |
> | A separator or ring written `outline-input` / `ring-input` / `bg-input` instead of a plain utility | **Hard FAIL — never a bump.** The closure check reports "`--input` has a consumer other than plain `border-input`". Fix the class |
> | Any count *falls* | Lower that baseline in the commit that lowered it |
>
> **Never loosen the gate back to `>`.** A one-sided ceiling let the baseline drift away from the
> floor until it constrained nothing, which is the defect the equality replaced.

- [ ] T080 Update the ACR to **Partially Supports** on 1.4.11 with both residues named: the 81 hand-rolled controls (feature 025) and the progress-overlay edge.

  **Name the edition, and check the denominator before publishing.** "Partially Supports on 1.4.11" is only a valid cell in a **WCAG 2.1/2.2 or INT edition** ACR — a VPAT 2.x *508 edition* carries WCAG 2.0 tables, and 1.4.11 does not exist in WCAG 2.0, so adding a row for it there is a category error. Section 508's legal baseline is WCAG 2.0 AA, under which the 81 residual controls are **not** a non-conformance at all. If any iTrack client is a US state or local government body, ADA Title II binds WCAG 2.1 AA independently and 1.4.11 becomes binding through *that* statute — at which point the Remarks carry legal weight and must state the population correctly: 41 hand-rolled controls **plus 72 shared-primitive usages** fixed, against a residue of 81. Not "41 of 127" 

---

## Dependencies

```
Phase 1 (T001-T003)
   └─> PR A: US4 (T004-T018)          gates before token, token, ratchet, verify
   └─> PR B: US2+US3 (T019-T045)      tokenise -> channel -> chart -> gates
   └─> PR C: US1+US5 (T046-T074)      failing test -> module -> timeline -> verify
                └─> Phase 6 (T075-T080)
```

**Within PR B**: T019–T022 block everything else — until the classes are tokenised, SC-004 has no gate.
**Within PR C**: T046–T047 block T049–T053. The test must exist and fail first.

## Parallel opportunities

- T013, T048, T068, T069 are `[P]` — separate files, no shared dependency
- T019–T022 are sequential (same file), T023–T027 then follow
- T028–T037 (chart) and T023–T027 (segment bar) are different files and can run concurrently **within PR B** — but must ship together

## MVP

**PR A (US4)** is the smallest shippable increment: one token, two gate changes, a ratchet. It delivers measurable non-text contrast on 41 controls and cannot regress the other 81.

## Format validation

All 80 tasks carry a checkbox, sequential ID, story label where required, and an exact file path. Setup and Polish phases carry no story label by design.
