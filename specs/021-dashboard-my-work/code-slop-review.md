# Code-Slop Review — 021 Dashboard Restructure with My Work List

**Gate**: Constitution Principle VIII, gate 5 (quickstart.md §Definition-of-Done #5) · task T039
**Date**: 2026-08-26 · **Skill**: `.claude/skills/code-slop` v1.0.0 (24 rules / 6 categories)
**Diff under review**: `git diff c00debe..HEAD`

## Verdict

**Slop density: CLEAN** (< 5% of changed source lines flagged) — **gate 5 does not pass yet: 3 Major findings.**

There is **no Critical finding.** The feature's own anti-slop budget was largely spent
well: the comments cite specs rather than narrate, no `MyWorkService` / `BucketHelper` /
`DashboardManager` / one-implementation interface was invented, there is no defensive
try/catch around non-throwing Eloquent, no `console.log`/`dd()`/`dump()` anywhere, and the
tests use literal dates rather than re-implementing bucket math. The three Major findings
are a **derived-total defect the research explicitly told the implementer not to
reproduce**, a **state leak that permanently disables a control**, and **a block of tests
marked complete in `tasks.md` that does not exist**.

Per T041, each Major must be fixed or explicitly accepted in this file before the feature
is complete.

### Scope note — the review base is wider than the feature

`c00debe..HEAD` contains three commits that plan.md §Pre-flight outcome documents as
**prerequisites landed on `main` before branching**, not 021 work:

| Commit | Content | In-scope? |
|---|---|---|
| `7f4d4dd` | `widthPx` → `width` percentage alignment in `GroupSummaryBar` + its four callers | No — declared prerequisite |
| `2197a8a` | `.claude/` agents, skills, `AGENTS.md`, `CLAUDE.md`, `.mcp.json` | No — tooling config, declared |
| `91779de` | Repair of 4 lint errors that had been failing CI on `main` | No — declared, deliberately kept out of the feature diff |

Attributing every changed file to its commit confirms the **021 implementation commits
(`4fe1ca8..HEAD`) touch only the files listed in plan.md §Project Structure.**
`BugTracker.jsx`, `Retrospectives.jsx`, `WorkProgram.jsx` and `GroupSummaryBar.jsx` appear
in the diff **only** from the pre-flight commits. **No drive-by edits. Scope discipline: PASS.**

---

## Critical

None.

---

## Major

### MAJ-1 — `total` is recomputed from 4 of the 7 statuses, reproducing the exact defect research.md flagged

**File**: `frontend/src/pages/Dashboard.jsx:406-412` (rendered at `:425` and `:443`)

**Observed**
```js
const completed  = stats.completed    || 0
const inProgress = stats.in_progress  || 0
const notStarted = stats.not_started  || 0
const delayed    = stats.delayed      || 0
const total      = completed + inProgress + notStarted + delayed
const remaining  = total - completed
```
Rendered as `"Overview of your project progress · {total} total tasks tracked"` (`:425`)
and as the Overall Progress card's description `"{remaining} of {total} tasks remaining"`
(`:443`). Meanwhile the structure strip on the same page renders
`{stats.detailed_activities} tasks` (`:593`).

**Why it's slop**
research.md §Verified ground truths states outright: *"Today's dashboard counts recognize
only 4 of the 7 statuses — `backlog`/`for_review`/`blocked` tasks vanish from the current
stat cards (**defect the new metric row must not reproduce**)."* The new summary row
reproduces it. Any task in `backlog`, `for_review` or `blocked` is silently excluded from
`total`, so the page displays **two mutually contradictory task totals** — the derived
`total` in the title and progress card, and the authoritative `stats.detailed_activities`
in the strip below. This is derived-value slop in its textbook form: recomputing a value
from partial parts when the authoritative figure is already in the same payload object.
It also brushes SC-002's spirit (the same quantity, two different numbers, two components).

**Recommended fix**
Use the payload's own total, and derive `remaining` from it:
```js
const total     = stats.detailed_activities || 0
const remaining = total - completed
```
Delete `notStarted` if nothing else consumes it (it is currently used only to build
`total` — `not_started` was deliberately dropped from the page metrics per R7).

---

### MAJ-2 — `expanded` is never cleared, so "Show all N" becomes permanently disabled with a spinner

**File**: `frontend/src/components/MyWorkPanel.jsx:221, 570-585`

**Observed**
```js
const [expanded, setExpanded] = useState(() => new Set())
...
onClick={() => {
  setExpanded((prev) => new Set(prev).add(bucket.key))
  load({ silent: true, expandBucket: bucket.key })
}}
disabled={expanded.has(bucket.key)}
...
{expanded.has(bucket.key) && <Loader2 className="h-3 w-3 animate-spin" />}
```
`expanded` is written on click and **never** removed — not on response, not on refetch.
research.md R8 §Refetch semantics is explicit that *"a panel refetch … resets 'Show all'
expansions to capped views"*, and `load()` is called with default (capped) params from
`submitQuickAdd` (`:362`), `handleTaskSave` (`:385`) and the status-change failure path
(`:290`).

**Why it's slop / what breaks**
One `Set` is doing two jobs — "this bucket was expanded" and "an expansion request is in
flight" — with no owner for the second. Concrete repro: expand *Later* → add a task via
quick-add → the silent refetch returns *Later* capped again → `hidden > 0` so the button
re-renders, but `expanded.has('later')` is still `true`, so it renders **disabled with a
permanently spinning `Loader2`** and the bucket can never be re-expanded for the rest of
the session. Same for expanding two buckets in sequence.

**Recommended fix**
Make the flag mean "in flight" only, and clear it in `finally`:
```js
const [expandingBucket, setExpandingBucket] = useState(null)
...
onClick={async () => {
  setExpandingBucket(bucket.key)
  try { await load({ silent: true, expandBucket: bucket.key }) }
  finally { setExpandingBucket(null) }
}}
disabled={expandingBucket === bucket.key}
```
(`hidden > 0` already hides the button once a bucket is genuinely expanded, so no
separate "already expanded" memory is needed.)

---

### MAJ-3 — T008's status-change tests do not exist, but T008 is marked `[x]` and quickstart gate 1 claims the coverage

**Files**: `backend/tests/Feature/MyWorkTest.php` (absent), `specs/021-dashboard-my-work/tasks.md:52`

**Observed**
`tasks.md` T008 is checked complete and specifies four tests: (a) completing a task via
`PUT /api/detailed-activities/{id}` removes it from the next `GET /api/my-work`;
(b) IDOR — TM status-PUT on a task in an inaccessible project → 403 with a body
`assertSame`-identical to the nonexistent-id case; (c) status change during preview → 403,
DB unchanged, `preview.write_blocked` audit row; (d) deleted task → 403 (TM) / 404 (Admin).
`grep -n "detailed-activities" tests/Feature/MyWorkTest.php` returns **nothing** — none of
the four exist. quickstart.md's automated-gates section nonetheless states MyWorkTest
covers the feature matrix, and research.md §Test-requirements lists these as required.

Two further claims in T005 are also unmet: **"Department Head scope"** has no test (DH
appears only in the reachability loop and the two role-matrix maps), and **"Client → 200
with valid empty shape"** is asserted as `assertOk()` only, never as a shape.

**Why it's slop**
A checklist marked done ahead of the work is the highest-cost form of slop: it converts a
coverage gap into a *false* coverage claim, and the next reader has no signal to look.
Mitigating: the byte-identical 403-parity property for detailed-activities is already
covered elsewhere (`ProjectClientAccessControlTest.php:466`, `ProjectScopingTest.php:213`),
so (b) is partly redundant. **(a) is not redundant and has zero coverage anywhere** — it is
the server-side premise the panel's optimistic row-removal (`MyWorkPanel.jsx:274-276`)
depends on.

**Recommended fix**
Add at minimum test (a) and the Client empty-shape assertion; add (c) for the
`preview.write_blocked` audit row (the quick-add preview test at `:625` covers `store`, not
`update`). If (b) and (d) are considered covered by the existing parity tests, record that
as an explicit acceptance here rather than leaving T008 checked.

---

## Minor

### MIN-1 — dead `previous` kept alive by a `void` statement
**File**: `frontend/src/components/MyWorkPanel.jsx:262, 291`
```js
const previous = task.status          // :262 — never read
...
await load({ silent: true })
void previous                          // :291
```
The rollback approach was replaced by a server refetch (correctly — the comment at
`:288-289` explains why), but the variable survived and `void previous` was added to stop
the linter complaining. `grep -rn "^\s*void "` over `frontend/src` returns **this one line
in the entire codebase** — it is not an idiom here, it is an escape hatch hiding dead code.
**Fix**: delete both lines.

### MIN-2 — unused imports left by the `TaskboardPlacement` extraction
**File**: `backend/app/Http/Controllers/TaskboardController.php:7, 10`
`use App\Models\Module;` and `use App\Models\SubActivity;` were the extracted method's only
consumers; after `resolveDefaultSubActivity()` moved out, both are unreferenced
(`grep` confirms the only remaining mention is `TaskboardPlacement::resolveDefaultSubActivity`
at `:130`). Dead code the extraction should have taken with it. **Fix**: remove both `use` lines.

### MIN-3 — stale section numbering after the restructure
**File**: `frontend/src/pages/Dashboard.jsx:421, 471, 499`
The page now reads `{/* ── 1. Page title ── */}` → unnumbered summary row → unnumbered
My Work → `{/* ── 6. Task Status by Module Heatmap ── */}` → `{/* ── 7. Recent Activities ── */}`.
Regions 2–5 were deleted (T025) and the numbers were not renumbered, so the labels now
assert a structure the file does not have — a stale comment actively misleads about what
was removed. **Fix**: drop the ordinals; the region names alone are the useful part.

### MIN-4 — `whenLoaded()` used as a scalar, so the `?->` guards guard nothing
**File**: `backend/app/Http/Resources/MyWorkTaskResource.php:22-25`
```php
$subActivity = $this->whenLoaded('subActivity');
$activity = $subActivity?->activity;
```
`whenLoaded()` returns a `MissingValue` **object** when the relation is absent, not `null`.
`?->` only short-circuits on `null`, so on the unloaded path this performs property access
on `MissingValue` (undefined-property warning, then `null`) rather than skipping. The chain
happens to produce the right answer, but the guard does not do what it reads as doing —
and both call sites (`MyWorkController::index` `->with(...)`, `store` `->load(...)`) always
eager-load, so the branch is unreachable anyway. **Fix**: `$subActivity = $this->subActivity;`
and keep the `?->` chain, or use `$this->relationLoaded('subActivity')` if a real guard is
wanted. (The `$project ? [...] : null` ternaries at `:36-37` are then the only guard needed.)

### MIN-5 — tests hedge on the shape of the endpoint's own response
**File**: `backend/tests/Feature/MyWorkTest.php:428, 530`
```php
return $response->json('data.token') ?? $response->json('token');
$this->assertSame('2026-08-28', $created['data']['plan_end_date'] ?? $created['plan_end_date']);
```
`MyWorkController::store` returns `response()->json(new MyWorkTaskResource($task), 201)` —
a `JsonResource` serialized directly, so the shape is deterministically **un**wrapped. The
`??` means the 201 contract in `contracts/my-work-api.md` is never actually pinned: the
test would still pass if the envelope changed. **Fix**: assert the real shape
(`$created['plan_end_date']`) and let it fail if the contract moves.

### MIN-6 — frozen time is reset inline, not in `tearDown()`
**Files**: `MyWorkTest.php:650-658`, `DashboardSummaryTest.php:108/144, 149/173`
`Carbon::setTestNow()` is reset as the last statement of each test. A failing assertion
above it aborts the method and leaks frozen time into every subsequent test in the process
— turning one red test into a cascade whose cause is invisible. **Fix**: `protected function
tearDown(): void { Carbon::setTestNow(); parent::tearDown(); }` on both classes.

### MIN-7 — audit assertions unscoped to actor or subject
**File**: `backend/tests/Feature/MyWorkTest.php:488-489`
```php
$this->assertDatabaseHas('audit_logs', ['action' => 'task.created']);
$this->assertDatabaseHas('audit_logs', ['action' => 'permission.denied']);
```
Placed after a 5-role loop, these pass if *any* row of each action exists from *any*
iteration — they cannot distinguish "the DH denial was audited" from "some other denial
was". Given Principle IV makes the audit trail load-bearing, the assertion should name the
actor. **Fix**: assert `['action' => 'permission.denied', 'user_id' => $deptHead->id]`
inside the loop, keyed on the expected status.

### MIN-8 — two states share one prop
**File**: `frontend/src/components/MyWorkPanel.jsx:541`
`savingId={savingId ?? openingTaskId}` — "a status write is in flight" and "the detail
fetch is in flight" are different conditions merged into one name. The behaviour is
defensible (both should disable the select), but the prop now lies about why.
**Fix**: pass `busyId` (or both, named), so the receiving component isn't told a fetch is a save.

---

## Suggestions (non-blocking)

- **SUG-1** — `MyWorkPanel.jsx:448`: `openQuickAdd(BUCKETS[1])` uses a positional index to
  mean "This Week". Reordering `BUCKETS` silently retargets the header button. Prefer
  `BUCKETS.find(b => b.key === 'this_week')` or a named `DEFAULT_QUICK_ADD_BUCKET`.
- **SUG-2** — `MyWorkPanel.jsx:497`: `next.has(k) ? next.delete(k) : next.add(k)` is a
  ternary used as a statement for its side effects. An `if/else` reads as what it is.
- **SUG-3** — `QuickAddForm` (`:141`) cancels on Escape but does not restore focus to the
  trigger. T034 claims "Escape cancels **and restores focus to the trigger**" and
  quickstart step 12 re-states it. Accessibility gap, not slop — flagged for the T040
  frontend-design pass.
- **SUG-4** — **Referred to T038 (OWASP), outside this gate's remit**: quick-add leaks
  module existence. A **nonexistent** `module_id` fails `exists:modules,id` → 422 with
  `errors.module_id`; an **inaccessible** one → 403 (`MyWorkController.php:106` vs
  `:115-119`). research.md R6 asked for "repo denial parity", and the house convention
  (`ProjectScopingTest:213`) is byte-identical bodies for inaccessible vs nonexistent.
  `test_quick_add_into_inaccessible_module_is_denied` (`:548`) asserts only 403, so the
  divergence is untested. Worth a decision in the OWASP review.

---

## What the diff does well (calibration)

Recorded so the good patterns are not accidentally "cleaned up" later.

- **Comments are the house standard, not narration.** Every non-obvious comment in the new
  code cites its constraint and its source: `MyWorkController.php:34-37` (why anchors are
  all-or-nothing), `:57-59` (why the Client `client_visible` filter exists even though
  Clients cannot currently be assignees), `:123-127` (why the create array is explicit),
  `:158-160` (why the invariant is re-asserted after validation),
  `TaskboardPlacement.php:15-17` (why this is the documented exception to the
  small-duplication preference), `MyWorkPanel.jsx:16-22` (why the accents are **not**
  drawn from `GROUP_ACCENT_CLASSES`), `:72-74` (why the row title is a real `<button>`),
  `:298-300` (why focus is restored by hand rather than left to Radix),
  `Dashboard.jsx:26-29` (why there is deliberately no accent stripe),
  `:328-330` (why the heatmap has no totals footer). I found **zero** narration comments,
  zero empty docblocks, zero closing-brace labels, zero `TODO`/placeholder comments.
- **No over-engineering.** No `MyWorkService`, `BucketHelper`, `DashboardManager`, or
  interface-with-one-implementation was created; `git diff --name-only` over the backend
  returns no `*Service`/`*Manager`/`*Helper` file. Bucketing lives as two private methods
  on the controller that owns it — and research.md §Anti-slop even pre-empted the temptation
  to invent a support class purely to make it unit-testable. plan.md proposed page-local
  `SummaryMetricsRow`/`StructureStrip` components; the implementation inlined both as JSX,
  which is **less** structure than planned and correct at this size.
- **`TaskboardPlacement`'s extraction is justified, not premature.** It is a single-static-method
  class, which the skill flags by default — but the justification is specific and correct:
  the reserved *names* (`Taskboard` / `Unclassified Tasks`) are correctness-coupled across
  two create paths, and drift would silently produce a second parallel "Unclassified Tasks"
  bucket per module. `TaskboardPlacement.php:15-17` states exactly this, and
  `test_quick_add_reuses_the_reserved_placement_chain` (`:598`) pins it. This is the right
  call, and correctly distinguished from the accepted `internalUserExistsRule()` duplication.
- **No defensive overdose.** No try/catch around Eloquent, no null check after
  `AccessContext::user()`. The two guards that *are* present are real: `$row->overdue ?? 0`
  (`MyWorkController.php:194`) handles `SUM()` returning `NULL` over an empty set, and the
  `localStorage` try/catch (`MyWorkPanel.jsx:208, 360`) handles private-browsing throws —
  both matching the established WorkProgram MRU precedent.
- **Tests assert behaviour, and do not re-implement the implementation.** Bucket expectations
  are literal dates against a literal anchor pair (`ANCHORS = 2026-08-26 / 2026-08-30`), never
  recomputed with the controller's own predicates. No mocks of the controller's own
  collaborators anywhere. No assertStatus-only tests except where the status *is* the
  behaviour (401/422 validation). `test_bucket_counts_always_sum_to_total_open_tasks` (`:269`)
  tests the partition property rather than four separate numbers, and
  `test_assigned_task_in_inaccessible_project_is_excluded` (`:165`) is exactly the
  assignee-alone-is-not-authorization case research.md called the most important in the feature.
- **Real scars present.** `test_disabled_user_is_rejected` (`:96-101`) asserts **401**, not
  the 403 research.md predicted, with a comment explaining that `EnsureUserIsActive`
  actually answers 401 and why the frontend depends on that. A codebase with no such
  corrections is the suspicious one.
- **Frontend conventions honoured.** `GroupSegmentBar` + `buildSegments` are **reused**, not
  reinvented (`MyWorkPanel.jsx:7-8`); `GROUP_ACCENT_CLASSES` is untouched, with the reason
  documented at both ends; role gating reads `useEffectiveUser()` (`:216`) and, better,
  write affordances gate on server-derived `meta.can_write` rather than any client role list;
  every API call goes through `lib/api.js`; sub-components stay file-local and unexported.
- **The `eslint-disable` at `MyWorkPanel.jsx:255` and `Dashboard.jsx:373` is not a finding.**
  The identical justified-disable comment appears in 17 other files
  (`TaskboardView.jsx:86`, `Kanban.jsx:86`, `BugTracker.jsx:152`, …) with verbatim wording.
  Likewise `res.data.data || res.data || []` (`:306, 323, 329, 342`) appears in 12+ existing
  files — house idiom, not defensive slop. `console.error` in catch blocks is used in 22
  existing files; there is **no** `console.log` anywhere in `frontend/src`.

---

## Code Slop Ledger

| File | Verdict | Top findings | Suggested action |
|---|---|---|---|
| `backend/app/Http/Controllers/MyWorkController.php` | CLEAN | — | Ship |
| `backend/app/Support/TaskboardPlacement.php` | CLEAN | extraction justified & documented | Ship |
| `backend/app/Http/Resources/MyWorkTaskResource.php` | SUSPICIOUS | MIN-4 `whenLoaded` misuse | 2-line fix |
| `backend/app/Models/DetailedActivity.php` | CLEAN | — | Ship |
| `backend/app/Http/Controllers/ProjectController.php` | CLEAN | — | Ship |
| `backend/app/Http/Controllers/TaskboardController.php` | SUSPICIOUS | MIN-2 two unused imports | Remove imports |
| `backend/tests/Feature/MyWorkTest.php` | SUSPICIOUS | **MAJ-3** missing T008 block; MIN-5/6/7 | Add tests (a)+(c); tearDown; scope audits |
| `backend/tests/Feature/DashboardSummaryTest.php` | SUSPICIOUS | MIN-6 inline time reset | tearDown |
| `frontend/src/components/MyWorkPanel.jsx` | SUSPICIOUS | **MAJ-2** `expanded` leak; MIN-1 `void previous`; MIN-8 | Fix expansion state; delete dead lines |
| `frontend/src/pages/Dashboard.jsx` | SUSPICIOUS | **MAJ-1** 4-of-7-status `total`; MIN-3 stale numbering | Use `stats.detailed_activities` |
| `frontend/src/lib/taskStatus.js` | CLEAN | — | Ship |
| `frontend/src/lib/api.js` | CLEAN | — | Ship |

**Summary** — CLEAN: 6 files · SUSPICIOUS: 6 files · INFLATED: 0 · CRITICAL: 0
**Blocking**: MAJ-1, MAJ-2, MAJ-3 (T041 — fix or document acceptance in this file)

## Acceptances

*(none recorded — no Major has been accepted; all three are open)*
