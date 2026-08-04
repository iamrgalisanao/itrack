# Research: List View Groups

## D1: Eager, parallel fetch on Activity expand (replacing per-Sub-Activity lazy fetch)

**Correction made during implementation**: `toggleActivity` (lines
1014–1030) is **not** the right place for this — it's shared with the
Gantt view (confirmed via `grep`: called at line 744 from Gantt's own
row-click handler). Extending it to eager-fetch every Sub-Activity's tasks
would add new, unwanted network calls and behavior to Gantt view, directly
violating FR-013 ("MUST NOT change Gantt view"). Corrected to a new,
List-view-only function instead, leaving `toggleActivity` completely
untouched for Gantt's continued use.

**Decision**: A new function (e.g. `expandActivityGroup(activityId,
moduleId)`), used only by the List view's new Activity-group header
`onClick` (not by Gantt), toggles the same shared `expandedActivities[key]`
UI-state flag (safe to share across views — only one view renders at a
time, and it's purely "is this row visually expanded") but performs its
own fetch: on first expand, fetch that Activity's Sub-Activities, then
immediately fetch every one of those Sub-Activities' tasks in parallel via
`Promise.all(subActivityList.map(sa => fetchDetailedActivities(sa.id)))`,
flattening and merging the results into a new state dictionary
(`activityTasks[\`${moduleId}-${activityId}\`]`), annotating each task with
its source Sub-Activity's `id`/`name` for the new Sub-Activity column. This
is the same fetch-and-merge logic D2's `refreshActivityTasks` helper
implements — `expandActivityGroup` simply calls `refreshActivityTasks` on
first expand rather than duplicating the fetch logic.

**Rationale**: Sub-Activity is no longer a user-triggered expand action
(FR-001), so there is no later point at which its tasks would naturally get
fetched under the current lazy-per-`toggleSubActivity` model. The fetch has
to move up to the Activity's expand action. Parallelizing with `Promise.all`
(rather than sequential `await` in a loop) keeps this from compounding
latency for Activities with several Sub-Activities.

**Alternatives considered**: Fetching all Sub-Activities' tasks in one
combined backend call — rejected as out of scope; the plan's Technical
Context establishes no backend changes, and the existing per-Sub-Activity
endpoint already returns everything needed with acceptable parallel-fetch
latency for realistic Sub-Activity counts per Activity (typically small,
per the existing UI's own nesting depth).

## D2: Explicit refresh helper (fixing a pre-existing stale-cache gap this feature would otherwise inherit)

**Finding**: `reloadModules()` (used after every create/edit/delete in this
file today, e.g. `handleSubmit`/`handleDelete`/`saveEdit`) only refetches
the top-level `modules` array. The `activities`/`subActivities`/
`detailedActivities` dictionaries are only populated when their key is
absent (`if (newExpanded[key] && !subActivities[key])`), so an edit/create/
delete performed while a level is already expanded does not visibly refresh
that level's cached list until it's collapsed and re-expanded. This is a
pre-existing characteristic of the current nested view, not something
introduced by this feature — but the new flattened per-Activity task list
(D1) is exactly the kind of thing a user will mutate via inline add and
expect to see update immediately (FR-008/SC-003), so this feature cannot
inherit that gap silently.

**Decision**: Add a small `refreshActivityTasks(moduleId, activityId)`
helper that re-runs D1's fetch-and-merge and replaces (not merges-if-absent)
that Activity's cached `activityTasks` entry. Call it after: inline add
success, and after Full Edit / Quick Status Edit / Delete success for a task
reached from this flattened view (replacing those call sites' reliance on
`reloadModules()` alone for this specific dictionary).

**Scope note**: This does not fix the pre-existing gap for the Module/
Activity-list levels themselves (out of scope — FR-004 keeps Module-level
behavior unchanged) — only for the new flattened per-Activity task list this
feature introduces.

## D3: Sub-Activity CRUD relocated to a lightweight "Manage Sub-Activities" affordance

**Decision**: Each Activity group header gains one small ghost icon button
(Admin/Project Manager only, matching today's existing per-level edit/delete
gate), opening a compact dialog listing that Activity's Sub-Activities with
the same Edit/Delete icon actions already used today (reusing
`openFormModal('sub-activity', 'edit'|'create', ...)` and the existing
delete-confirm dialog/`deleteSubActivity` path verbatim) — this replaces
today's inline "Sub-Activities" expandable section and its "Add
Sub-Activity" button (lines 1556–1565), which are removed from the main
flattened flow.

**Rationale**: Directly satisfies FR-007 (Sub-Activity creation/editing
must remain possible) without reintroducing a nesting level in the primary
view. Reuses 100% of the existing Sub-Activity CRUD logic (`handleSubmit`/
`handleDelete` already branch on `modalLevel === 'sub-activity'`) — this is
a relocation of an existing affordance, not new CRUD logic.

**Alternatives considered**: Dropping Sub-Activity management entirely from
List view (forcing users elsewhere) — rejected, violates FR-007 directly.
Keeping the old inline expandable Sub-Activity section as a secondary,
optional expansion — rejected as contrary to the explicit "flatten to
single-level groups" scope decision; it would reintroduce the exact nesting
step being removed.

## D4: Sub-Activity column in the Full Edit modal — read-only, not reassignable

**Correction made during implementation**: the original decision below
(an editable Sub-Activity `<select>`, allowing a task to be moved between
Sub-Activities from the Full Edit modal) was found, while implementing, to
require a backend change that isn't currently possible: `sub_activity_id`
is not among `DetailedActivityController::update()`'s validated/updatable
fields (confirmed by reading `backend/app/Http/Controllers/DetailedActivityController.php`
lines 211–248 — no `sub_activity_id` rule exists). Adding one would be a
real backend endpoint change, which this plan's Technical Context and
Constitution Check explicitly scoped out ("no schema, migration, or API
contract changes"). Since spec.md's actual requirements (FR-003, FR-007)
only require the Sub-Activity to be **displayed** as a column and to remain
**creatable/editable as its own record** (via D3's Manage Sub-Activities
dialog) — neither requires per-task reassignment — the corrected decision
keeps this feature entirely frontend-only as approved:

**Decision**: The existing shared modal's task-specific fields (rendered
only for `modalLevel === 'task'`, lines ~2588–2674) gain one new **read-only**
field: the task's current Sub-Activity name, displayed as plain text (not a
`<select>`), sourced from the task's own annotation (D1). No new field is
sent to `handleSubmit`/`createDetailedActivity`/`updateDetailedActivity` —
this is display-only, changing nothing about what those calls already send.

**Rationale**: Satisfies FR-003 (Sub-Activity shown, here also inside the
Full Edit modal for full context while editing other fields) without any
backend change. Reassigning a task's Sub-Activity remains unavailable in
this feature (out of scope for the reasons above) — if that capability
becomes a real requirement later, it needs its own reviewed backend change,
not a silent expansion of this plan's approved boundary.

**Scope impact**: None to the shipped feature's requirements — FR-003/FR-007
are both still fully satisfied. Disclosed here per this project's
established practice (018-taskboard's gate-citation correction,
019-taskboard-scannability's border-l→background-bar correction) of
surfacing implementation-time discoveries rather than silently reconciling
them against what was approved in planning.

## D5: Inline "+ Add item" orchestration

**Decision**: A row at the bottom of each Activity group's `TableBody`
(role-gated `userRole !== 'Client'`, matching today's "Add Task" gate) with
a single name `<input>`. On submit:
1. Read the Activity's cached Sub-Activity list
   (`subActivities[\`${moduleId}-${activityId}\`]`, guaranteed populated by
   D1's eager fetch).
2. If it has at least one entry, use the first one's id (FR-010).
3. If it is empty, call `createSubActivity(activityId, { name: 'General', type: 'A' })`
   first (reusing today's existing default `type` value already used for
   Activity/Sub-Activity creation, see `openFormModal`'s create-mode
   defaults, line 872) to get a new Sub-Activity id (FR-009). **Amended
   post-`/speckit-analyze` (finding L1)**: originally specified as
   `name: activity.name`, which would render indistinguishable from its
   parent Activity inside D3's Manage Sub-Activities dialog — changed to a
   fixed, clearly-generic `'General'` label instead.
4. Call `createDetailedActivity(subActivityId, { name })` with just the
   typed name — all other Task fields keep the backend's own defaults,
   exactly as an empty-bodied creation would via the existing full dialog.
5. Call D2's `refreshActivityTasks(moduleId, activityId)` and clear the
   input.

**Rationale**: Satisfies FR-008/FR-009/FR-010/SC-003 using only the two
already-existing creation endpoints, client-side orchestrated — no backend
change. Mirrors `TaskboardView.jsx`'s own `handleCreate` guard pattern
(`if (!name.trim()) return`) for the empty-input no-op case.

**Alternatives considered**: A required Sub-Activity picker inside the
inline row itself — rejected, defeats the purpose of a fast, lightweight
"+ Add item" entry point (spec's User Story 2 explicitly frames this as
"type a task name" without extra required fields); a real reserved/
protected container pattern like Taskboard's — rejected, these are ordinary
user-owned Sub-Activities (spec's Key Entities section is explicit that no
new entity type or protection semantics are introduced here), unlike
Taskboard's deliberately-reserved, delete-guarded containers.

## D6: Palette reuse for group accents

**Decision**: Reuse `TaskboardView.jsx`'s exact `GROUP_ACCENT_CLASSES`
5-entry array (emerald/amber/primary/rose/orange, `bg-*` bars +
`text-*`/`dark:text-*` labels) and cycling-by-index assignment logic,
applied to Activities instead of sprint-label groups. Per
019-taskboard-scannability's D2b finding, this must remain a
`background-color` bar (`absolute inset-y-0 left-0 w-1 bg-* pointer-events-none`),
not a `border-l-*` utility, since the latter is inert app-wide due to a
global `index.css` reset.

**Rationale**: Directly satisfies the spec's "consistent with the
convention already used on the Taskboard view" requirement (FR-002) and
"Existing Design System First" — no new color values, no rediscovery of the
`border-l-*` pitfall already solved once this session.
