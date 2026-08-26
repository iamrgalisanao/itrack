# Frontend Design Review — 021 Dashboard Restructure with My Work List

**Gate**: Constitution v1.2.0 §Frontend Design and Review Governance → Completion Gate
**Reviewer pass**: `frontend-design` skill applied to the merged implementation on `main`
**Scope reviewed**: `frontend/src/components/MyWorkPanel.jsx`, `frontend/src/pages/Dashboard.jsx`,
`frontend/src/lib/taskStatus.js`, `frontend/src/lib/groupSummary.js`, plus the mechanical
`TaskboardView.jsx` / `api.js` edits, compared against `spec.md` (FR-001..FR-014, SC-001..SC-006),
`plan.md` §Frontend Design Constraints, `quickstart.md`'s pre-registered criteria, and the sibling
implementations (`TaskboardView.jsx`, `GroupSummaryBar.jsx`, `BugTracker.jsx`, `index.css`).

---

## Verdict

**BLOCKED — 0 Critical, 7 Major, 7 Minor, 5 Suggestion.**

There are **no Critical findings**: every pre-registered Critical criterion passes. Access gating is
server-derived and preview-correct, no task can render outside `Project::accessibleTo`, the row title
is a real `<button>`, modal focus return works, `aria-expanded` is present via Radix, quick-add
preserves the typed title on failure, and no gating reads raw `useAuth()` or the legacy localStorage
switcher.

Seven **Major** findings block completion per the constitution ("Frontend work MUST NOT be considered
complete while unresolved Critical or Major findings remain, unless they are explicitly documented and
accepted"). Two of them (MAJ-1, MAJ-2) are functional dead-ends in the feature's own primary
affordances; three (MAJ-3, MAJ-4, MAJ-5) are accessibility/AA failures; MAJ-6 and MAJ-7 are binding
plan constraints that were specified but not implemented.

The design-system verdict is otherwise strongly positive: the panel is built inside the existing
shadcn/Radix language, reuses `GroupSegmentBar` + `buildSegments` + the shared status maps, uses
background-span accents (correctly avoiding the inert `border-l-*` trap), matches Taskboard's
column-percentage discipline exactly (46+24+14+16 = 100), and the Dashboard deletions specified in
plan.md §Frontend Design Constraints are all verifiably gone from the diff. No parallel design system
was introduced and no file outside plan.md §Project Structure was touched.

---

## Critical

**None.** All nine pre-registered Critical criteria pass — see the checklist table below.

---

## Major (blocking)

### MAJ-1 — Panel-header "+ Add task" is a dead click whenever *This Week* is empty or collapsed, and leaves the entry point permanently unreachable

- **File**: `frontend/src/components/MyWorkPanel.jsx:445-453` (header button), `:458-472`
  (empty-account branch), `:482-489` (empty buckets skipped), `:546-558` (form render site)
- **Observed**: the header button calls `openQuickAdd(BUCKETS[1])`, which sets
  `quickAddBucket = this_week`. The `QuickAddForm` is rendered in exactly two places: the
  `totalOpen === 0` branch, and inside a bucket's `CollapsibleContent` when
  `quickAddBucket?.key === bucket.key`. When the user has open work but **zero This Week tasks**, that
  bucket returns `null` at `:485` (`if (!group || group.count === 0) return null`) — so no form is
  rendered anywhere. The same happens when This Week exists but is collapsed, since Radix
  `CollapsibleContent` unmounts its children when closed. Meanwhile the header button itself is gated
  on `canWrite && !quickAddBucket` (`:445`), so it disappears the moment it is clicked. There is no
  rendered Cancel control to clear `quickAddBucket`, so the quick-add entry point is gone for the rest
  of the session (until the panel remounts).
- **Expected**: FR-011 — "per-bucket behavior MUST omit empty buckets rather than showing empty groups
  (**except immediately after a quick-add interaction begins**)". plan.md §Frontend Design Constraints
  — "Panel-header '+ Add task' is the quick-add entry point when target buckets are empty."
  quickstart.md step 4 — "Panel-header '+ Add task' works when target buckets are empty."
  The FR-011 parenthetical exception is the exact mechanism this needs, and it is unimplemented.
- **Correction**: render the targeted bucket's shell (header + form) when
  `quickAddBucket?.key === bucket.key`, even at `count === 0` — i.e. change the skip at `:485` to
  `if ((!group || group.count === 0) && quickAddBucket?.key !== bucket.key) return null`. Additionally
  force the bucket open when quick-add targets it (add `bucket.key` removal from `closedBuckets` inside
  `openQuickAdd`), so a collapsed target still shows the form. Both are needed; either alone leaves one
  of the two failure paths.

### MAJ-2 — "Show all N" becomes permanently disabled with a stuck spinner after any subsequent refetch

- **File**: `frontend/src/components/MyWorkPanel.jsx:570-585` (control), `:220`/`:575` (`expanded`
  state), `:236-253` (`load`), `:290`, `:362`, `:385` (silent refetch call sites)
- **Observed**: expanding a bucket adds its key to `expanded` and refetches with
  `bucket=<key>&all=1`. `expanded` is **never cleared**. Every other refetch path —
  `load({ silent: true })` after a quick-add (`:362`), after a modal save (`:385`), after a failed
  status change (`:290`), and expanding a *second* bucket (which sends `bucket=<other>` and therefore
  re-caps the first) — returns the previously expanded bucket to its 10-row cap. `hidden > 0` becomes
  true again, so the control re-renders, but it is `disabled={expanded.has(bucket.key)}` (`:578`) and
  renders `<Loader2 className="animate-spin" />` unconditionally while `expanded` holds the key
  (`:581`). The user is left with a permanently disabled button showing a spinner that never resolves,
  and cannot re-expand that bucket. Two buckets can never be expanded at once.
- **Expected**: FR-013 — "Buckets MUST cap initially visible rows (default 10 per bucket) **with an
  explicit control to reveal the remainder**". plan.md notes "refetch resets 'Show all' expansions —
  specified, not accidental", but a *reset* means the control must become usable again, not disabled
  forever. This fires on the most common flows in the feature (quick-add is User Story 3; modal save is
  User Story 1 scenario 3).
- **Correction**: treat `expanded` as in-flight state, not permanent state — clear the key in `load`'s
  `finally` (or drive the spinner from a dedicated `expandingBucket` value cleared when the request
  settles), and drop the `disabled` binding so the control is re-armed after any reset. If multiple
  simultaneous expansions are wanted, carry the whole `expanded` set into the request instead of a
  single `bucket` param.

### MAJ-3 — `text-destructive` fails WCAG AA in dark mode on three new surfaces

- **File**: `frontend/src/components/MyWorkPanel.jsx:84` (row error), `:92` (overdue due date),
  `:159` (quick-add error); root cause `frontend/src/index.css:61` (`.dark { --destructive: #dc2626 }`,
  identical to the light value)
- **Observed**: `--destructive` is `#dc2626` in **both** themes. Against the dark card background
  `--card: #1c1d24`, that is **3.48:1**. All three usages are normal-size text (`text-xs` / 11px), so
  the AA threshold is 4.5:1. In light mode the same colour is 4.53:1 — passing, but with no margin.
- **Expected**: quickstart.md pre-registered **Major** — "hardcoded colors without `dark:` pairs / AA
  failures in either theme". plan.md §Frontend Design Constraints — "All color through `index.css`
  tokens **with `dark:` pairs**". Note the token file itself documents this discipline for
  `--success`/`--warning`/`--info` (`index.css:31-34`) — `--destructive` was the one that never got the
  treatment.
- **Correction**: scoped fix inside the feature's own files — pair each of the three usages, e.g.
  `text-destructive dark:text-red-400` (`#f87171` on `#1c1d24` = 6.36:1). Do **not** change
  `--destructive` in `index.css` as part of 021: that token is used app-wide and a global change is an
  out-of-scope edit (code-slop no-drive-by rule). Record the token repair as a follow-up so every other
  `text-destructive` in the app gets fixed properly.

### MAJ-4 — Task rows have no responsive behaviour; the status control collapses to ~45px at 360px

- **File**: `frontend/src/components/MyWorkPanel.jsx:51-119` (`BucketRows`), `:33-38`
  (`COLUMN_WIDTHS`)
- **Observed**: `BucketRows` renders one `table-fixed` table with a fixed percentage `<colgroup>`
  (46/24/14/16) and **no responsive class anywhere** — no `hidden sm:table-cell`, no stacked layout.
  At a 360px viewport the row area is roughly 280px after page and `CardContent` padding, giving
  Task ≈ 129px, Where ≈ 67px, Due ≈ 39px, Status ≈ 45px. The `w-full` status `<select>` (`:97-108`)
  has `px-2` padding plus borders, leaving under 30px of visible label — the current status is
  unreadable, and it is the panel's primary action (SC-001). The Due cell has no `truncate`, so
  "No due date" wraps to three lines in a 39px column. (The shadcn `Table` wrapper is
  `overflow-auto`, so the *page* does not scroll horizontally — the pre-registered criterion passes —
  but the content is squeezed rather than adapted.)
- **Expected**: Constitution §Frontend Creation Workflow — "implement responsive behavior"; §Frontend
  Review Workflow evaluates "responsive behavior". quickstart.md step 11 — "360px (no horizontal page
  scroll; **rows degrade to two-line**)". The two-line degradation was specified and is absent.
- **Correction**: below `sm`, drop the Where and Due columns from the table
  (`hidden sm:table-cell` on both `<th>` and `<td>`) and fold context + due date into a second line
  under the task title, giving Task/Status a ~65/35 split — matching the "degrade to two-line" the
  plan calls for. Add `truncate` to the Due cell regardless.

### MAJ-5 — A failed status change is shown visually but never announced to assistive technology

- **File**: `frontend/src/components/MyWorkPanel.jsx:83-85` (error paragraph), `:96-108` (the select
  it belongs to), `:287-290` (error path)
- **Observed**: on failure the panel writes `rowError` into a plain `<p className="text-[11px]
  text-destructive">` under the task title. It has no `role="status"` / `role="alert"`, no
  `aria-live`, and no `aria-describedby` association with the `<select>` that failed. Focus stays on
  the select, whose value silently reverts when the subsequent `load({ silent: true })` resolves. A
  screen-reader user changes the status, hears nothing, and is left with a control whose value has
  quietly reverted.
- **Expected**: WCAG 2.1 **4.1.3 Status Messages (Level AA)** — a message added to the page reporting
  the result of an action, without a focus change, must be programmatically determinable via a live
  region. Constitution §Frontend Review Workflow evaluates "form validation and feedback",
  "interaction feedback", and "accessible labels and names". quickstart.md pre-registers
  "status-change failure silent" as Critical — the visible message satisfies the sighted-user reading
  of that criterion, but not the AT reading.
- **Correction**: give the row error `role="status"` (polite) — or hoist a single panel-level
  `aria-live="polite"` region — and add `aria-describedby={rowError?.id === task.id ? errorId :
  undefined}` plus `aria-invalid` to the select, mirroring the pattern `QuickAddForm` already uses
  correctly at `:154-160`.

### MAJ-6 — Quick-add is offered to writable-role users with no accessible projects, producing an unresolvable form

- **File**: `frontend/src/components/MyWorkPanel.jsx:258` (`canWrite` from `meta.can_write`),
  `:445-453` (header affordance), `:317-335` (`openQuickAdd`), `:559-569` (per-bucket affordance);
  backend `backend/app/Http/Controllers/MyWorkController.php:89` (`'can_write' => $user->canWrite()`)
- **Observed**: `meta.can_write` is purely role-derived (`HasRole::canWrite()` → Admin / PM / Team
  Member). Every quick-add affordance is gated on that single boolean. A Team Member with **zero**
  project assignments therefore sees "+ Add task", opens the form, gets an empty Project `<select>`
  ("Project…" only), a permanently disabled Module select and a permanently disabled Add button — with
  no message explaining why. The accessible-project list is only fetched lazily *after* the form opens
  (`:322-325`), so the affordance can never reflect it.
- **Expected**: plan.md §Frontend Design Constraints (binding) — "quick-add **additionally requires a
  non-empty accessible project/module list**". quickstart.md step 8 — "Verify a Team Member with no
  project assignments sees no quick-add (empty accessible set)." FR-007/US3 scenario 2 — "When the user
  has no write permission in any accessible project, Then the quick-add affordance is not shown."
- **Correction**: either (a) extend the `meta` envelope with `can_quick_add` (server-side:
  `canWrite() && Project::accessibleTo($user)->exists()`) and gate the affordances on that — the
  cleaner fix, one extra `exists()` on an already-computed `$projectIds`; or (b) fetch the project list
  when the panel loads and gate on `projects.length > 0`. If neither is acceptable in this release, at
  minimum render an inline explanation in the form when the project list comes back empty, rather than
  a silently dead form.

### MAJ-7 — Cancelling or escaping quick-add drops keyboard focus to `<body>`

- **File**: `frontend/src/components/MyWorkPanel.jsx:141` (Escape handler), `:467` and `:554`
  (`onCancel={() => setQuickAddBucket(null)}`), `:194-200` (Cancel button)
- **Observed**: both cancel paths only clear `quickAddBucket`. The form unmounts with focus inside it,
  so focus falls back to `<body>`. The keyboard user must re-tab from the top of the document to reach
  the "Add a task" trigger that just reappeared. The panel demonstrably knows how to do this correctly —
  `closeTask()` at `:372-378` captures and restores the modal's originating trigger.
- **Expected**: plan.md §Frontend Design Constraints — "quick-add is a real `<form>` (Enter submits,
  Escape cancels, **focus management specified**)". quickstart.md step 12 — "quick-add: Enter submits,
  **Escape cancels and restores focus to the trigger**." This is the same class of defect as the
  pre-registered Critical "focus not returned from modal", which was fixed for the modal path but not
  for quick-add.
- **Correction**: hold the opening trigger element in a ref (as `triggerRef` already does for the
  modal) inside `openQuickAdd`, and restore focus to it in `onCancel` — and after a successful submit,
  return focus to the title input (which stays mounted) or the trigger, whichever the flow implies.

---

## Minor (record, non-blocking)

### MIN-1 — Collapsed segment bar is computed from the capped rows, not the whole bucket
`MyWorkPanel.jsx:529` passes `group.tasks` (server-capped at 10) to `buildSegments`, while the header
next to it shows `group.count` (the true total). A status held only by hidden rows is absent from the
bar, and the segment tooltips report subset counts beside a "25 tasks" label. Because `buildSegments`
is equal-share rather than proportional (see `lib/groupSummary.js:22-26`), the bar only ever conveys
*which* statuses are present, so impact is limited — but it can be wrong about that. Either return a
per-bucket status histogram in the envelope, or label the bar as reflecting the visible rows.

### MIN-2 — Each bucket's `<table>` has no accessible name
`MyWorkPanel.jsx:53` — up to four tables render with identical `Task / Where / Due / Status` headers
and nothing distinguishing them in the accessibility tree. Add `aria-label={bucket.label}` (or a
visually-hidden `<caption>`) so table navigation announces which bucket is being read.

### MIN-3 — A failed *background* refresh discards the entire rendered panel
`MyWorkPanel.jsx:247-251` sets `error` from `load({ silent: true })` too, and the render guard at
`:408` replaces the whole card with the error state. A transient failure during the post-status-change
refetch therefore wipes the list the user was working in — and takes the `rowError` message with it.
Correctly panel-scoped (the heatmap and Recent Activities survive, per plan), but a silent refresh
should degrade to a non-destructive inline notice, not a full-panel replacement.

### MIN-4 — Dead rollback capture
`MyWorkPanel.jsx:262` (`const previous = task.status`) and `:292` (`void previous`) — a rollback that
was never implemented, left behind with a `void` to silence lint. Delete both lines; the server refetch
at `:290` is the actual recovery mechanism.

### MIN-5 — No feedback while a row's detail is being fetched
`MyWorkPanel.jsx:297-313` fetches the full task before mounting the modal; `:541` passes
`savingId ?? openingTaskId` so only the *select* dims. The clicked title button gives no indication
anything is happening, so on a slow connection the row reads as unresponsive. Add `aria-busy` plus a
spinner or subtle opacity change on the title button while `openingTaskId === task.id`.

### MIN-6 — Two different "total tasks" figures on one page
`Dashboard.jsx:411` computes `total` as `completed + in_progress + not_started + delayed` and renders
it as "{total} total tasks tracked" (`:425`), while the structure strip renders
`stats.detailed_activities` as "{n} tasks" (`:593`). Since the app has a **seven**-status vocabulary
(`lib/taskStatus.js:12`), any task in `backlog`, `for_review` or `blocked` makes these two numbers
disagree. Not an SC-002 violation (neither is a status count), but it reads as a bug to a user who
notices. Derive the header figure from `stats.detailed_activities`, or drop it.

### MIN-7 — Structure-strip separators are announced as content
`Dashboard.jsx:586-598` — the `·` separators are plain `<span>` text and will be read out by screen
readers between every figure. Mark them `aria-hidden="true"`, or model the strip as a `<ul>` with
CSS-generated separators.

---

## Suggestion

- **SUG-1** — `MyWorkPanel.jsx:448` targets the This Week bucket via the positional literal
  `BUCKETS[1]`. Reference it by key (`BUCKETS.find(b => b.key === 'this_week')`) so reordering the
  array can't silently retarget the header action — the same positional-coupling hazard
  `lib/groupSummary.js:8-13` documents for `GROUP_ACCENT_CLASSES`.
- **SUG-2** — The collapsed-group *shell* (relative rounded-xl bordered container + absolutely
  positioned accent span + `flex items-center py-3 border-b bg-muted/30` header + colgroup table) is
  now duplicated verbatim across `TaskboardView.jsx:222-277`, `BugTracker.jsx`, `Retrospectives.jsx`
  and `MyWorkPanel.jsx:502-534`. `GroupSummaryBar.jsx` currently shares only the bars. Extracting a
  `GroupShell` / `GroupHeaderRow` there would remove ~25 duplicated lines per caller and give the
  column-alignment invariant one enforcement point. Out of scope for 021 — worth a follow-up spec.
- **SUG-3** — `MyWorkPanel.jsx:141` handles Escape via `onKeyDown` on the `<form>`. When focus is
  inside a native `<select>`, some browsers consume Escape to close the dropdown and the handler never
  fires. Consider also binding Escape at the bucket container, or documenting the limitation.
- **SUG-4** — Select styling parity: quick-add and the row status select use
  `border-input bg-background px-2 py-1(.5) text-xs`, while `BugTracker.jsx:431` uses
  `border-border bg-background px-1.5 py-1 text-xs`. Both read as the same control; converging on one
  set of classes (the My Work one is the better of the two — it has a visible focus ring and a
  per-row `aria-label`, which BugTracker's lacks) would tighten consistency.
- **SUG-5** — `readPlacement` / `localStorage.setItem` (`MyWorkPanel.jsx:207-213`, `:360`) are
  correctly try/catch-guarded per the WorkProgram MRU pattern, but a remembered placement pointing at a
  project the user has since lost access to will silently produce an empty module list. Validating the
  stored `projectId` against the fetched project list on open would make the MRU self-healing.

---

## Pre-registered criteria checklist (quickstart.md §Frontend review pass)

### Critical — all pass

| # | Pre-registered Critical criterion | Result | Evidence |
|---|---|---|---|
| C1 | Mutation affordances visible to non-writable roles | **PASS** | `canWrite` comes from server `meta.can_write` (`MyWorkPanel.jsx:258`; `MyWorkController.php:89` → `HasRole::canWrite()` = Admin/PM/TM). Department Head and Client render read-only `<Badge>` (`:110-113`) and no quick-add. See MAJ-6 for the *empty accessible set* sub-case, which is a plan violation rather than a role-gating failure. |
| C2 | Any task rendered from outside `accessibleTo` scope (any role, incl. preview) | **PASS** | `MyWorkController::index` filters assignee ∩ `Project::accessibleTo($user)` (`:51-60`) with a Client `client_visible` defence-in-depth clause; the panel renders only what the envelope returns. |
| C3 | Preview reads not reflecting the previewed user, or writes failing silently | **PASS** | Reads use `AccessContext::user($request)`; the panel reads role via `useEffectiveUser()` (`:216`). Write rejection surfaces as an inline row/quick-add error (`:287`, `:365-366`) — visually. AT announcement gap recorded as MAJ-5. |
| C4 | Row detail / status change unreachable by keyboard | **PASS** | Row title is a real `<button>` with a visible focus ring (`:75-82`); status is a native `<select>` with `aria-label` (`:97-103`). The Taskboard mouse-only `TableRow onClick` (`TaskboardView.jsx:290`) was correctly not copied. |
| C5 | Focus not returned from modal | **PASS** | `closeTask()` holds the originating element and restores focus on the next frame (`:296-300`, `:372-378`); verified live. |
| C6 | Missing `aria-expanded` on triggers | **PASS** | `CollapsibleTrigger asChild` (`:505`) is Radix `Collapsible.Trigger` (`ui/collapsible.jsx:4`), which sets `aria-expanded` / `aria-controls` on the button. |
| C7 | Quick-add failure losing the typed title | **PASS** | `clearTitle()` is only invoked on success (`:361`); the failure path sets `quickAddError` and leaves state untouched (`:364-367`). Verified live. |
| C8 | Status-change failure silent | **PASS** (visual) | Inline `rowError` under the row (`:83-85`). AT-silence recorded as MAJ-5. |
| C9 | Gating via raw `useAuth()` user or the legacy localStorage switcher | **PASS** | Only `useEffectiveUser()` (`:216`) and server `meta.can_write`; no `useAuth` import, no mock switcher reference (Constitution VI). |

### Major — 2 of 11 fail

| # | Pre-registered Major criterion | Result | Evidence |
|---|---|---|---|
| M1 | Any status count in two components (SC-002), or >4 summary metrics | **PASS** | Exactly four `StatCard`s (`Dashboard.jsx:431-464`); progress description carries no completed count; heatmap `<tfoot>` totals deleted (diff-confirmed); Recent Activities tabs are label-only. Live audit found zero duplicated counts. |
| M2 | Surviving blur ornaments / glass hero / structure-count cards | **PASS** | Diff `91779de..79247d5` removes the `blur-3xl` ornaments, the `backdrop-blur-xl` hero with its ring/chips/duplicate bar, the Needs Attention banner, the Task Status card grid and both structure grids. Structure counts are a single text strip (`Dashboard.jsx:586-598`). FR-010/FR-014 satisfied. |
| M3 | My Work built outside the `GroupSummaryBar` pattern, or accents via inert `border-l-*` | **PASS** | Reuses `GroupSegmentBar` (`:527-532`) + `buildSegments` + shared `taskStatus` maps; accents are absolutely positioned `bg-*` spans (`:503`) with the constraint documented at `:16-22`; `GROUP_ACCENT_CLASSES` correctly left unmodified (architect finding M1 honoured). `StatCard`'s inert `accent` prop was dropped, not left dead. |
| M4 | Missing empty-positive state | **PASS** | Success-toned "You're all caught up" with a Work Program link (`:472-480`). |
| M5 | Empty buckets rendered | **PASS** | Skipped at `:485`. *Note*: the FR-011 exception for an in-progress quick-add is missing — see MAJ-1. |
| M6 | Missing row cap / "Show all N" | **FAIL** | Present (`:570-585`) but non-functional after any refetch — MAJ-2. |
| M7 | Overdue offering quick-add | **PASS** | `canQuickAdd: false` on the overdue bucket (`:24`), enforced at `:546` and `:559`. |
| M8 | Horizontal scroll at 360px | **PASS** | The shadcn `Table` wrapper is `overflow-auto` (`ui/table.jsx:5`) and the panel uses `flex-wrap` elsewhere, so the page body does not scroll. Content *squeeze* is a separate finding — MAJ-4. |
| M9 | Overdue below the first screenful at 1366×768 | **PASS** | Verified live at y=426 within 768px; `MyWorkPanel` is mounted directly under the four-metric row (`Dashboard.jsx:469`). |
| M10 | Hardcoded colors without `dark:` pairs / AA failures in either theme | **FAIL** | `text-destructive` = 3.48:1 on the dark card — MAJ-3. All other new colours carry `dark:` pairs and pass AA (rose 6.28/✓, amber 5.02/✓, primary 4.66, muted-foreground 5.6/6.6). |
| M11 | Behavior changes to heatmap drill-down, Recent Activities filters, or unrelated pages | **PASS** | Diff touches only the files listed in plan.md §Project Structure. `HeatmapCell`/`DrilldownBanner` and the `STATUS_TABS` filter logic are byte-unchanged; the only heatmap edit is the specified `<tfoot>` removal. `TaskboardView.jsx` change is a pure import swap. |

### Minor/Suggestion items pre-registered as non-blocking

Row-removal animation polish (global `prefers-reduced-motion` in `index.css:133-140` already covers the
panel; no bespoke animation added), skeleton fidelity (`:394-406` — panel-scoped, retained panels not
blanked), strip link affordances (MIN-7), select styling parity (SUG-4), localStorage MRU resilience
(SUG-5). All recorded above; none blocking.

---

## Path to a clean gate

Fix MAJ-1 through MAJ-7 (all are contained within `MyWorkPanel.jsx` except MAJ-6, which is one extra
`exists()` in `MyWorkController::index`'s `meta`), then re-verify quickstart.md steps 4, 8, 11 and 12 —
the four manual checks that would currently fail. Alternatively, per the constitution, any of these may
be **explicitly documented and accepted** in this folder with a stated rationale; MAJ-3 in particular
has a legitimate acceptance argument (the failing token predates 021 and affects the whole app), but
the scoped `dark:` pairing is a three-line change and closes it now.
