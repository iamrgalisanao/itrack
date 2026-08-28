# Research — 024 Accessibility Remediation

Every decision here was produced by a specialist dispatched **at planning time**, and several
overturned the premise the feature was scoped on. That is the point of the routing rule: a specialist
consulted at review can only find defects.

**Six of my own premises were wrong.** They are recorded as corrections rather than quietly fixed,
because the pattern in them is the finding.

---

## R1 — What element the timeline bar should be

**Decision**: convert the existing `<div>` at `WorkProgram.jsx:2652` **in place** to a native
`<button type="button">`.

**Rationale**: a native button supplies Enter *and* Space activation, the role, and the focus
semantics for free — that is the hand-rolled `onKeyDown` you otherwise have to write and can get
wrong. It opens a modal editor, so it is a button and not a link (2.4.4 / 4.1.2).

**Alternatives considered**:

- **`role="grid"` with `role="row"`/`gridcell`** — *structurally impossible here*, and this is the
  constraint worth writing down. The left row list (`:2442`) and the bar track (`:2624`) are two
  separate `getVisibleGanttRows().map()` calls under sibling flex containers. **A `role="row"` cannot
  span two DOM subtrees.** `aria-owns` could theoretically reparent but is the worst-supported ARIA
  property, needs stable minted ids across four row levels, and has partial VoiceOver support.
  Rejected for a second, independent reason: `role="grid"` puts the timeline in application mode,
  which removes rows from browse-mode reading — forbidden by the spec's own edge case.
- **Wrapping the div in a button** — adds a layout box over an absolutely-positioned element.
- **`ring-2` for focus** — Tailwind v4 ring is pure `box-shadow`; the bar sits over a busy grid where
  a ring is visually lost, and forced-colors erases it. Use
  `focus-visible:outline-2 focus-visible:outline-offset-2`. Do **not** add `outline-none` — the file
  already carries 122 of those and `index.css` names them by count.
- **Positive `tabIndex`** — moves the element ahead of the document's whole sequence (2.4.3).

**Correction to my premise**: I cited `WorkProgram.jsx:1738-1743` as the correct in-file pattern to
copy. **It is itself a defect**, three ways: ARIA's `button` role is *children-presentational*, so the
`CardTitle as="h2"` inside it is **not exposed as a heading** (heading navigation across the module
list is silently gone, 1.3.1); the Edit/Delete buttons inside it are interactive descendants of
`role="button"`, which is non-conforming (4.1.2); and its focus style is `focus-visible:ring-2`. The
model to cite is the Edit button at `:2513-2523`. Unless `:1738` is also fixed, the file will hold a
*third* pattern — and the reason this keeps regressing is that there is no canonical one.

**Tab order**: the right pane's DOM order already equals visual row order, so bars are visited in row
order. What is *not* achievable without reparenting is interleaving (row 1 name, row 1 bar, row 2
name…) — the entire left pane precedes the entire right pane. Acceptance Scenario 1 only requires bars
to be in row order *among themselves*, so this satisfies it. Recorded explicitly, or someone will
reach for positive tabindex to "fix" it.

**Tab-stop budget**: each row already has a chevron and an Edit button; the bar makes three stops per
row, ~150 before a user escapes a 50-row timeline — 2.4.1 Bypass Blocks in practice. Mitigation:
wrap the timeline in `<section aria-label="Project timeline">` so browse-mode users can skip it.

---

## R2 — Why the Gantt card is **not** a Radix `Tooltip`

**Decision**: do not use `components/ui/tooltip.jsx` for the Gantt detail card.

**Rationale**: Radix would in fact satisfy 1.4.13 — verified: `App.jsx:665` passes only
`delayDuration`, so `disableHoverableContent` is false (hoverable), Radix closes on Escape
(dismissible) and persists until blur (persistent). **That is not the problem.** The problem is that
`role="tooltip"` content is wired as `aria-describedby`, and **an accessible description is flattened
to a single text string**. The card's six `flex justify-between` label/value rows become one run-on
utterance and the structure is unreachable in browse mode. No styling fixes that.

Secondary: `tooltip.jsx:26-33` is `px-3 py-1.5 text-sm overflow-hidden` with no width, sized for the
one-line strings its only two consumers pass. Retrofitting `w-64` and a field grid changes a shared
primitive for one caller.

**Alternatives considered**: a `role="dialog"` disclosure (too heavy — traps focus for what is
supplementary detail); rendering the card inline always (visual regression, and the information is
supplementary by design).

---

## R3 — The three-part disclosure, and why one `aria-label` is not enough

**Decision**: three artifacts — (a) an accessible **name** on the button carrying identity, status and
schedule; (b) one `sr-only` node carrying the full field set, referenced by `aria-describedby`;
(c) the visual card marked `aria-hidden="true"`.

**Rationale**: name is identity, description is detail. Focus-move contexts read the name only, so
"Module," on every one of them is 25% boilerplate. Putting all six fields in `aria-label` produces a
~200-character utterance with no structure, unsearchable in browse mode — which is the failure the
name/description split exists to prevent.

Part (c) is what the in-file comment at `:2723-2726` explicitly forbids — *"aria-hidden alone would be
worse, not better"* — and that comment is **right about `aria-hidden` alone**. Part (b) is what makes
it safe. The diff must cite that comment, or a reviewer will correctly object.

**Why an `sr-only` node at all, having asked whether the name could carry everything**: I asked
specifically whether a well-composed accessible name made a separate rendering unnecessary — it does
not. An accessible *description* is read inconsistently by NVDA/JAWS in browse mode on non-form
elements, and the spec's edge case requires browse mode to work without focus landing. A real DOM
node is read reliably in browse mode *and* serves as the `aria-describedby` target. One node, two
jobs — the minimum rendering, not an extra one.

**Where it goes: the left pane, after the Edit button (`:2531`).** This is the two-pane answer. In
browse mode a screen reader reads the entire left pane (N rows) then the entire right pane (N bars);
put the detail in the right pane and the user hears row K's summary at position K and its detail at
position N+K, separated by every other row. Placed left, the per-row reading order becomes name →
contributor → status → dates → edit → level, planned-vs-actual, duration, progress: one coherent
unit. The bar then references it cross-pane by id — `aria-describedby` across subtrees is universally
supported, unlike `aria-owns`, and restructures nothing.

**Does the card open on focus?** Yes — FR-003. `group-focus-visible:opacity-100`, **not**
`group-focus`, or a mouse click pins the card open behind the modal it just launched. `pointer-events-none`
stays: 1.4.13's hoverable clause binds content that is the *sole* carrier, and once (b) exists the
card is not.

**Open decision carried to tasks.md**: Scenario 4 (Escape dismisses) has nothing to dismiss in a
CSS-only `group-focus-visible` card, and since the card is `aria-hidden` decoration 1.4.13 arguably
no longer binds it. Implementing it literally costs **one** `dismissedRowId` state on the pane —
never one per row inside the map. Decide before implementing; it is the difference between zero
hooks and fifty.

**Also**: the card is `absolute bottom-full`, so on row 0 it renders over the sticky header — flip to
`top-full` for the first rows.

---

## R4 — FR-007 is load-bearing, and the existing gate fails open

**Decision**: a positive allowlist predicate `canSeeContributor(role)` in `ganttA11y.js`, consumed by
**both** the new formatter and the three existing visible sites (`:2434`, `:2469`, `:2767`). The
formatter receives the *decision* (`{ includeContributor }`), never the role.

**Rationale, and the correction that matters most**: I assumed the frontend check was defence-in-depth
over a backend gate. **It was the only gate.** `ModuleController` returned the tree via
`attributesToArray()` at the module, activity and sub-activity levels with no Client branch, and all
three tables carry `responsible` — so for **3 of the 4 Gantt row types** `WorkProgram.jsx:2469` was
the sole thing withholding it.

That was severed into **PR #26** and fixed separately, because a live disclosure must not wait on an
accessibility feature. It does not reduce FR-007's importance: a new rendering of row data still must
not diverge from the visible one.

**Second correction**: the existing gate *fails open*. `:177-178` is
`const isClient = user?.role === 'Client'` — `useEffectiveUser()` returns null before auth resolves,
so `isClient === false` and the contributor renders. The spec's edge case ("withhold when the role
cannot be determined") is violated **today**. A positive allowlist over the four non-Client roles
inverts that.

**Using the predicate only in the formatter and leaving `!isClient` on the visible column would
recreate exactly the divergence FR-007's "single shared definition" clause forbids** — so the visible
sites change too, and that is in scope.

**Test approach (SC-003)**: no frontend test runner exists and this feature does not add Vitest or
jsdom for one assertion. The formatter is pure, so `node --test` on
`frontend/src/lib/ganttA11y.test.js` asserts the assistive string directly — which is precisely what
SC-003 asks for. Seed `responsible: 'SENTINEL'` and assert the Client-role string does not contain
it, the same mechanism as `ClientVisibilityBoundaryTest::FIELD_SENTINEL`.

**Rejected**: snapshot-testing the rendered span. It passes when the field is absent *for the wrong
reason* — the fixture row simply had no `responsible`. The sentinel is what makes the assertion real.
This is the identical trap that made #14's `reports` provider row vacuous.

---

## R5 — The segment bar: glyph + legend + outline, after tokenising

**Decision**: (0) retokenise `STATUS_SEGMENT_CLASSES` onto the `GANTT_STATUS_TOKENS` vocabulary;
(1) a 1–2 character abbreviation centred in each segment in the segment's `ink` token; (2) suppress
the glyph below a measured px width; (3) `outline-1 -outline-offset-1` as the adjacency separator;
(4) a real text legend beneath the bar.

**Three of my premises were wrong**, and they change the design:

- The bar is **`h-7` = 28px**, not the 4–8px I assumed (`GroupSummaryBar.jsx:74`). There is ample
  vertical room for a glyph.
- Segments are **equal-width, not proportional** — `buildSegments` gives every present status
  `100/N`% (`groupSummary.js:31`). With all seven the narrowest is 14.3% of the column. The constraint
  is absolute px narrowness, not 1px adjacency.
- The fills are **raw Tailwind palette in oklch** (`taskStatus.js:26-33`). `verify-contrast.py` parses
  `#[0-9a-fA-F]{6}` only, so **it cannot see a single one of these colours.** Step 0 is therefore not
  cleanup — without it SC-004 has no gate at all and the proposed dichromacy assertion is not
  implementable.

**Rationale for abbreviations over geometric glyphs**: they survive font fallback, carry meaning
without a legend round-trip, and are *text* — which is what satisfies 1.4.1 and 1.1.1 via the legend.

**Alternatives considered**:

- **Hatching / SVG pattern fills** — two independent killers. Forced-colors forces
  `background-image: none` alongside `box-shadow: none`, so the pattern vanishes entirely and you are
  back to one flat system colour; and diagonal hatch at 28px against the table rules below moirés.
- **Borders as the identity channel** — cannot distinguish *deliberately* shared fills, which is the
  actual problem: `backlog`/`not_started` are both `bg-slate-400`, and `blocked`/`delayed` are
  red-500/red-600 at ΔE₀₀ 7.64 **in normal vision**. A border is a boundary signal, not an identity
  signal.
- **Full labels in every segment** — at 14.3% of a narrow column "Not Started" does not fit, and
  `overflow-hidden` on the container clips it **silently**. That is the version that ships and looks
  fine in the reviewer's wide browser.

**Why `outline` and not `border` for the separator**: a border adds layout width inside the flex row
and shifts the percentage widths that `GroupSummaryBar.jsx`'s own header comment spends 20 lines
protecting. Outline costs no layout — the same reasoning already recorded at `tooltip.jsx:19-24`.

---

## R6 — The Reports chart: rotate it 90°

**Decision**: replace the vertical `grid-cols-3 sm:grid-cols-6` bar chart with a **horizontal
aligned-bar list** — one row per status, label | track+bar | count.

**Rationale**: seven categories with multi-word names, in a container whose *height* is fixed at 64px
and whose *width* is two-thirds of a full-width card. Everything scarce is on the axis the bars use;
everything abundant is on the axis the labels need. That single mismatch produces every symptom
simultaneously — the wrap, the truncated 10px labels, the 0.1px bar and the hover-only number. It is
still a bar chart, and a bar chart is right: the question is magnitude comparison across categories
on a common baseline. Only the axis changes.

**Two of my premises were wrong**:

- **`pending` is not in this chart's domain.** `status_breakdown` is `countBy('status')` over leaf
  `DetailedActivity` rows (`ReportController.php:130`); `pending` is synthesised only by
  `getRollupStatus` in `WorkProgram.jsx:305` for parent rows and never reaches this endpoint.
  Requiring it in the gate would encode a false claim about the API.
- **Project cards are never side by side.** They are `space-y-6` stacked full-width
  (`Reports.jsx:590`). A reader compares across a vertical scroll of several hundred pixels. This
  inverts the layout budget *and* makes per-card normalisation more dangerous, not less: nothing on
  screen invites the comparison, so nobody notices they cannot make it.

**And the wrap is worse than recorded** — `grid-cols-3 sm:grid-cols-6` wraps at **four** statuses on
mobile, the common case. Because the container is `h-16 items-end`, a wrapped second row does not
extend the box; both rows compress to 32px and the `border-b` baseline sits under only the bottom
row, so the top row's bars float against nothing.

**Cost, named**: ~140px of card height against the current 64px. If +76px is rejected, the fallback is
`grid-cols-1 lg:grid-cols-2` over the same seven rows (~80px), equal column widths so lengths stay
comparable, at the cost of a longer scan path. Recommend single column.

**Alternatives considered**:

- **100% stacked bar, reusing `GroupSegmentBar`** — the answer the reuse floor pushes toward, and
  wrong for a structural reason rather than a taste one: **segment widths must sum to 100%, so a
  minimum-width floor on one segment necessarily steals width from another**, and the distortion
  propagates across categories. In aligned separate bars a floor distorts only its own row. Since the
  small-count problem *is* SC-007, the form that cannot express a floor honestly is disqualified.
- **Dot plot** — the principled runner-up; it dissolves the zero-versus-small problem entirely, since
  a dot has constant size. Rejected only because the design system has no dot-plot precedent.
  Recorded as the fallback if the floor below proves contentious.
- **Charting library** — no. Seven `div`s, no axis, no scale function, no zoom. 40–100KB gzip, and it
  fights 023: charting libraries want hex values, and the whole point of `ganttPalette.js` is that a
  hex literal in the colour path *is* the defect.

**Ordering**: keep `STATUS_ORDER`, do not sort by count. The statuses are ordinal, so the order shows
where work is piled along the pipeline — and fixed row positions across cards make position a
reliable identifying channel, which is what lets R8's shared-fill decision work at zero cost.

---

## R7 — Scale: share of project total, not card maximum

**Decision**: bar length = count ÷ **project total**, with the total printed in the panel header
(`Task Breakdown · 412 tasks`).

**Rationale**: the denominator becomes a real, stateable number. That one string satisfies US3
acceptance scenario 4 ("the basis of the bar heights is evident") with no axis, no ticks, no
gridlines. Max-normalisation cannot state its denominator meaningfully — "the largest status" is not
a quantity anyone reasons about. It also makes cross-card comparison *legitimate*: share-of-project is
defensible between a 12-task and a 900-task project, where bar length under either of the other
schemes is not.

**Alternatives considered**:

- **Per-card maximum (current)** — the largest status always hits 100%, so a 40/30/30 split and a
  90/5/5 split render identically at the top. Directly violates the spec's single-status edge case:
  one status at 100% against an absent maximum is exactly the false comparison the spec names.
- **Shared linear across all cards** — honest and useless; a 12-task project beside a 900-task one is
  seven empty rails.
- **Log** — readers systematically misread log length as linear quantity, and log(1) = 0, so a count
  of 1 gets *zero* length. It makes SC-007 strictly harder.

**Trade-off, named**: share-of-total *worsens* the sub-pixel arithmetic — on a 900-task project one
blocked task is 0.11% of panel width. R8 is why that is acceptable.

---

## R8 — Zero versus small, and when a minimum bar is a lie

**Decision**: render all seven rows always; zero gets an empty track and a printed `0`; every non-zero
bar gets `max(0.25rem, …)`.

**The rule worth stating in these terms**: *a minimum bar length is a lie when the bar is the only
channel carrying the number, and is not a lie when the number is printed 40px to the right.* The
objection that a floor makes 1 and 5 look similar is correct and is exactly the cost — acceptable
only because the reader who needs to distinguish them reads `1` and `5` as text without hovering. The
bar's remaining job is "which rows have anything in them", scanned peripherally, and a floor makes it
better at that. **The current chart has no printed number, which is precisely why it cannot have a
floor and precisely why it also cannot show a 1. Fix them together or neither.**

Three mechanisms doing three jobs: all seven rows always (driven by `STATUS_ORDER`, not
`Object.entries`, which also makes the chart immune to `countBy`'s array-vs-object serialisation);
zero gets *no fill* against a drawn track, so zero and one are categorically different renderings
rather than two points on a length continuum; and the floor is a detectability aid, not the quantity
channel.

---

## R9 — Deliberately shared fills are correct in the chart and wrong in the segment bar

**Decision**: the chart adopts `ganttPalette.js`'s shared fills **unchanged**; the segment bar gets a
non-colour channel (R5).

**Rationale, and the cross-workstream trap**: in the rotated chart each status has its own row, at a
fixed position, with a full-text label and a printed number — identity is carried by position and
text, and colour is redundant reinforcement. `blocked` and `delayed` sharing red is then a *correct
statement*: both are failure states, distinguished by reading two adjacent labelled rows. The segment
bar has the **opposite geometry** — segments abut, share edges, and carry no inline label (identity
is in a `title` attribute only) — so shared fills genuinely fail there.

**Same tokens, opposite conclusions, because adjacency and labelling differ.** The risk is that the
two workstreams converge on one uniform rule — "every status needs a distinct fill" — which would fix
the segment bar and break FR-011/SC-005 by making the chart disagree with the Gantt, reopening what
023 closed. **The rule that generalises: shared fills are acceptable exactly where another channel
already discriminates; add the channel, never the hue.**

Also noted: `taskStatus.js:26-34` is a *third* vocabulary, disagreeing with both. In scope for FR-011.

---

## R10 — The amber collision: the risk tiles are wrong, not the chart

**Decision**: the three risk tiles (`Reports.jsx:502-509` page-level, `:650-658` per-card) stop
encoding by hue — `--destructive` when the count is > 0, `--muted-foreground` when 0, with icon and
label carrying identity.

**Rationale**: the chart's `for_review → --warning` is correct per `ganttPalette.js:28`, so amber must
mean *for review* and the tiles must change. But looking at the three together — Overdue `red-500`,
Blocked `amber-500`, Dependency Risks `orange-500` — they are three raw untokenised hues, and **two
of the three are not statuses at all**: overdue and dependency-risk are derived risk metrics computed
at `ReportController.php:124-126` from dates and links, not read from the status column. They are a
different vocabulary borrowing the status palette's hues. The only signal a reader takes from a tile
is *is this zero or not*, which the number already gives.

**Alternative considered**: recolour only Blocked to `--destructive`, leaving Overdue red and
Dependency orange. Smaller diff, frees amber, satisfies FR-011 — but leaves two untokenised literals
standing and red shared by overdue+blocked. Acceptable fallback; the first is recommended because it
kills the collision permanently rather than shuffling which hue means what.

---

## R11 — `--input`: reuse `--popover-border`, and repoint the CI canary

**Decision**: `--input: #86868e` light, `#737a88` dark — the existing `--popover-border` values.

| against | light `#86868e` | dark `#737a88` |
|---|---|---|
| `--background` | **3.61** (was 1.27) | **4.15** (was 1.36) |
| `--card` | **3.61** | **3.89** (was 1.28) |
| `--popover` | **3.61** | **3.49** (was 1.15) |
| `--muted` / `--secondary` | **3.25** | **3.76** |

**Rationale**: zero new colour decisions. These values are already in the system, already chosen in
023 for exactly this 3:1 job, already asserted at the 3.0 tier by `verify-contrast.py`, and carry the
same violet cast as the rest of the neutrals — the `frontend-design` existing-system-first answer.
Rejected `#949494`, the lightest neutral clearing 3.0 against white (3.03): no headroom, and it fails
against `--secondary`/`--muted` at 2.71.

**Must `--input` separate from `--border`? Yes, and not for taste.** `--border` is applied by
`index.css`'s `* { border-color }` to **every element in the document**; moving it to 3.61 darkens
every incidental hairline — table rules, card edges, all 223 `border-border` sites. That is SC-009
failing at maximum blast radius. Verified: `border-border` resolves `--color-border` → `--border`,
unchanged; and **`--input` has no non-border consumer anywhere** in `frontend/src` (no `bg-input`,
`text-input`, `ring-input`, `divide-input`, `outline-input`). Blast radius is exactly the 45
`border-input` sites, all form-control boundaries.

**The consequence I had not accounted for, and it is in CI.** `verify-cascade.py`'s **assertion 0**
uses `border-input` as its canary, on the stated premise that *"`--input` and `--border` are
identical … so this must resolve whether or not the utility wins"*. Separating the tokens **destroys
that premise**. It still passes today, but it stops being a stylesheet-load check and becomes a
duplicate of assertion 1 — and if the `* { border-color }` rule ever leaves `@layer base` (the
regression that shipped four times), assertion 0 would fire `ABORT: the stylesheet did not load`
*before* assertion 1 runs, sending the next engineer to debug a build problem that does not exist.
**Repointing the canary at `bg-background` is a required task in this feature**, not a nicety.

**Dialog caveat, recorded rather than left implicit**: controls inside a `Dialog` sit on
`bg-background/82` over a `bg-black/70` scrim, compositing to ≈`#dfdfdf` in light, against which
`#86868e` measures **2.71**. The **inner** edge — the control's own opaque `bg-background` fill — is
3.61. Bind the assertion to the inner edge: it is deterministic, present on every instance, and
sufficient to make the control's extent perceivable, whereas the outer edge is a composite over
blurred arbitrary content and cannot be measured statically. Chasing it needs `#7f7f7f` or darker,
visually heavy for a resting input. One site needs individual checking: `MyWorkPanel.jsx` has
`border-input` with no fill of its own, so its inner edge is the container.

---

## R12 — Forced colors: one new rule, and it is not in the spec

**Decision**: add a `@media (forced-colors: active)` rule giving critical-path Gantt bars
`outline-style: dashed`.

**Rationale**: `getGanttBarStyles` (`WorkProgram.jsx:589-591`) sets `background` and `color` as
**inline styles**, which HCM overrides wholesale, and the critical-path
`outline: 2px solid var(--foreground)` at `:604` becomes `CanvasText`. So in High Contrast **every bar
reads as critical-path** — and adding a solid focus outline makes it worse. Dashed keeps plain
(none) / critical (dashed) / focused (solid) as three distinguishable states.

**For the segment bar: nothing new is needed**, and that is the strongest argument for R5's design.
In HCM every fill collapses to one system colour regardless; text is repainted `CanvasText` and stays
legible, and outline survives. Glyph + outline degrades correctly with zero new CSS. **Do not** reach
for `forced-color-adjust: none` — it opts the element out of the user's setting entirely.

---

## R13 — Items I had mis-scoped

- **`WorkProgram.jsx:2450-2452` — the row expand/collapse chevron is an unnamed button.** No
  `aria-label`, no `aria-expanded`; it announces as "button". **4.1.2 and 1.3.1, both level A, inside
  the 508 legal floor** — unlike most of this feature. It sits three lines from FR-001's target and is
  smaller than anything in Story 1. **Pulled into Story 1.** The prior review missed it because it
  checked the List view's controls, not the Gantt row list.
- **The segment bar's widths are not quantitative.** `buildSegments` gives every present status an
  equal share while `title` reports the true count — a group of 200 tasks with 1 blocked renders
  blocked as half the bar. This is FR-013's defect in a different component, and the **inverse**
  failure from the chart's: the chart hides small counts, this one inflates them. Adding a glyph makes
  the misleading width *more* legible, so encoding and channel want to land together. **Recorded; see
  the open question below.**
- **`--input` is one of four 1.4.11 gaps and this feature scopes one.** The progress-overlay edge
  (1.08–1.35:1) is the sole encoding wherever the % label is suppressed. FR-006 routes progress into
  the accessible description, which fixes it for AT users but not for the low-vision sighted user.
  Legitimate scope line — but the ACR must say **Partially Supports** on 1.4.11 after this ships, not
  Supports.

## R1a — Where the button goes (settled at verification)

**Decision**: today's bar `<div>` (`WorkProgram.jsx:2662`) becomes a **non-focusable positioned
wrapper** carrying `group` and the inline `left`/`width`/`top`. A `<button className="h-full w-full">`
inside it carries the visual classes, `getGanttBarStyles`, and the click handler. **The detail card
becomes a sibling of that button, still inside the wrapper.**

**Why this and not conversion in place**: the card at `:2733` is a **descendant** of the div R1
converts — I read it as a sibling and was wrong; `:2663` is an attribute line of the div opened at
`:2662`, so the card sits at the child indent. Converting in place nests a multi-`div` field grid
inside a `<button>`, outside the content model.

Strictly that is a validator violation rather than an AT defect — the name comes from `aria-label`,
and `aria-hidden` on a non-focusable descendant is permitted. It is rejected anyway because **R1's
entire premise is that this file has no canonical pattern, which is why it regresses.** The pattern
everyone copies should not be the one a validator flags.

**CSS consequences — the part that otherwise gets discovered at implementation:**

- Reveal becomes `group-hover:opacity-100 group-has-[:focus-visible]:opacity-100`.
  **Not `group-focus-within`** — `focus-within` fires on mouse focus too, re-creating exactly the
  "card pinned open behind the modal it just launched" bug R3 identifies. State the `:has()` browser
  floor in the diff.
- The wrapper takes **no `tabIndex` and no `onClick`**; both move to the button, or the element ships
  two activation paths.
- Progress fill, percentage label and milestone diamond move inside the button as `<span>`s.
- The `absolute bottom-full` to `top-full` flip for row 0 applies to the card in its new position,
  logic unchanged.

## R3a — Dismissible: FR-003 is closed, not open

**Decision**: implement it. One `dismissedRowId` on the timeline pane.

**Why the earlier reasoning was wrong**: I argued that because the card is `aria-hidden` decoration,
1.4.13 no longer binds. It does — **1.4.13's dismissible clause governs *visible* content**, and is
excused only where the content does not obscure other content. This card is `absolute bottom-full`
over the timeline.

Specifics, so it cannot grow a second state:

- Escape on the focused bar sets `dismissedRowId = row.id` and stops propagation of the handled key.
- **It clears on focus change.** A session-sticky dismissal silently removes the affordance for the
  rest of the session — a worse outcome than the one 1.4.13 asks you to fix.
- The reveal class becomes conditional on `dismissedRowId !== row.id`: one ternary inside the map,
  **zero hooks inside it**.

## R11a — FR-015 narrowed, with a counted ratchet

**Decision**: move `--input` only. Do **not** migrate the 81 native controls drawn with
`border-border`.

**The number, because a scope cut without one becomes folklore**: 127 native controls — **41**
`border-input`, **81** `border-border`, 5 unclassified. Concentrated in `SupportOps.jsx` (17),
`TaskDetailModal.jsx` (14), `Schedule.jsx` (12), `Reports.jsx` (10).

*(My first count said 37/81 and the attempt before that said 2/2/123. The 2/2/123 run was broken: the
regex `[^>]*?>` terminates on the `>` inside an arrow function in a JSX attribute. Recorded because a
count that looks precise and is wrong is worse than no count, and this feature's spec now quotes these
figures.)*

**Why not migrate**: `border-border` on a native control is *sometimes* an oversight and sometimes a
deliberate hairline on a muted toolbar strip. That is 81 judgments, not one rename — a feature, not a
task inside another feature. It would also destroy the one property required of Story 4: that a
contrast regression be attributable to a single token move.

**Conditions, all landing in 024**: the spec states the residue with its counts; the ACR says
**Partially Supports** on 1.4.11 with **two** named residues (these 81 controls and R13's progress
overlay); and 024 ships a **counted ratchet** — an assertion that the number of native controls
carrying `border-border` does not increase. This repo already reasons in counts ("112 opacity
modifiers", "122 outline-none", "223 border-border sites"); a ratchet is its native idiom, costs one
grep, and is what stops the residue growing while 025 is queued. **025 owns the migration and is filed
now, not "later".**

## R14 — FR-017: hide on emptiness, never on role

**Decision**: hide the Schedule assignee filter when it has no options, not when the viewer is a
Client.

**Rationale**: emptiness is the observable the requirement is about; it fails closed through the
auth-resolution window instead of reproducing the exact shape R4 condemns; it self-corrects in both
directions if the Client field policy changes, with no second place to update; and it does not add a
fourth role branch to a file that already has one.

**Two implementation facts that decide whether it works at all:**

- `assignees` at `Schedule.jsx:372` is `['all', ...new Set(...)]`, so the test is
  **`assignees.length <= 1`**, never `=== 0`. Written as `=== 0` the check never fires and the feature
  ships looking done.
- When the control is hidden, **force `assigneeFilter` back to `'all'`**, or the predicate at `:344`
  keeps filtering by a value the user can no longer see or clear. That is the half that gets missed.

The same rule generalises to the project filter above it. Noted; **not** pulled into 024.

## R15 — What SC-004 actually measures

**Decision**: the measured object is the **treatment** (fill + glyph + label), not the fill.

A naive pairwise fill measurement fails by construction the moment R5's step 0 lands, because
`blocked` equals `delayed` and `backlog` equals `not_started` *on purpose*. Two assertions:

1. Every pair **sharing** a fill has distinct glyph entries.
2. Every pair with **distinct** fills clears a stated ΔE00 under Brettel–Viénot–Mollon simulation.

Plus a manual protanopia/deuteranopia row in the matrix — which the plan previously lacked entirely,
so SC-004's "verified by measurement rather than inspection" had no mechanism at all.

## R16 — Accepted reductions (FR-018 / SC-009)

FR-018 says nothing that meets a threshold may regress. **This feature deliberately reduces two
distinctions**, and naming them is the honest form of that requirement:

| Reduction | Compensating channel |
|---|---|
| Retokenising `STATUS_SEGMENT_CLASSES` collapses two reds (ΔE00 **7.64 in normal vision**) onto one `--destructive` | R5's glyph plus legend; and the pair was never distinguishable under dichromacy, so the loss is in normal vision only |
| `for_review` moves purple to amber while `STATUS_BADGE_CLASSES` beside it (`MyWorkPanel.jsx:120`, `TaskboardView.jsx:294`) stays purple | **Unmitigated.** Either the badge map comes along or the inconsistency is recorded — decided at task generation, not left silent |

SC-009 is scoped to what a gate can hold — the `--input`/`--border` separation fixture — **plus** a
stated before/after visual pass of the three consumer surfaces. The gates cannot see the rest, by
`verify-contrast.py`'s own header admission.

## R17 — GroupSegmentBar's real blast radius

The component has **five call sites over four vocabularies**: `taskStatus.js` (MyWorkPanel,
TaskboardView), `LIST_STATUS_SEGMENT_CLASSES` (`WorkProgram.jsx:126`), BugTracker's local map (`:38`),
Retrospectives' sentiment, plus priority segments.

Two gaps the plan missed: **`buildSegments` (`groupSummary.js:27`) returns `{key, count, pct,
className}` with no ink and no glyph source**, and `groupSummary.js` was not in the file list at all;
and step 0 retokenises only `taskStatus.js`, so BugTracker's and the List view's raw-palette maps would
render glyphs on fills the contrast gate still cannot see.

**Decision**: `buildSegments` gains an optional glyph/ink source keyed like `className`, **defaulting
to no glyph** so non-status callers (sentiment, priority) are untouched. **In scope**: `taskStatus.js`
consumers and `LIST_STATUS_SEGMENT_CLASSES`. **Out**: BugTracker's local map, Retrospectives' sentiment,
priority — filed with the 025 residue.

## R18 — The segment bar's equal-width distortion stays out, with one condition

**Ruling**: out of 024. FR-013 names the project status chart specifically, so pulling the segment bar
in is scope expansion past a stated requirement; it changes what the bar *means* rather than how it is
encoded; and per R17 the shared component already carries more blast radius than the plan accounted
for — compounding a semantics change on it makes any visual regression un-bisectable.

**The condition**: do not ship the glyph without mitigating the harm this plan itself identifies.
**R5's legend must print the per-status count**, so the equal-width distortion stops being the only
quantity channel. That is R8's own rule — *a distorted length is acceptable when the number is printed
beside it* — applied to the other component, and it costs nothing. The proportional-width fix is filed
as a backlog row citing that rule.

---

## Open question carried into tasks.md

One remains: whether `STATUS_BADGE_CLASSES` is retokenised alongside the segment classes, or the
`for_review` purple/amber inconsistency is recorded (R16). Decide at task generation.
