# Phase 0 Research: Support Ops Tracker (Phase 1)

No `NEEDS CLARIFICATION` markers exist in the Technical Context. Every
decision below came from reading the actual existing backend code
(`DetailedActivityController`, `Module`/`Activity`/`SubActivity` models,
`HasRole` trait) rather than new research, since this feature builds
directly on infrastructure already in the codebase.

## Decision: Auto-provision a per-project "Support Requests" hierarchy chain via a stable `code`

**Rationale**: Every task in iTrack (`DetailedActivity`) must belong to a
`SubActivity` → `Activity` → `Module` → `Project` chain — there's no way to
create one without the others. To keep quick-intake feeling like a single
form (spec Assumption + SC-001), `SupportOpsController@store` does a
`findOrCreate` on `Module`/`Activity`/`SubActivity` scoped to the target
project, keyed on `code = 'SUPPORT-OPS'` at each level (Module, Activity,
Sub-Activity all use this same sentinel code) — cheap to look up, safe to
call on every request (idempotent), and immune to collisions with a real
project module that happens to be named "Support Requests."

**Alternatives considered**: Matching by `name` string instead of `code` —
rejected, fragile (a real module could coincidentally share the name, and
renaming would break the lookup). Requiring the user to pick an existing
module/activity/sub-activity on the intake form — rejected, defeats the
purpose of "quick" intake (spec SC-001) and doesn't match how a client issue
naturally maps to the existing planning hierarchy at all.

## Decision: Editing an existing issue reuses `PUT /detailed-activities/{id}`, not a new endpoint

**Rationale**: A support issue is a `DetailedActivity` with `work_type =
support` — it isn't a different kind of record. `DetailedActivityController
::update()` already has the validation, Team-Member field restriction,
audit logging (`task.updated`/`task.status_changed`/
`task.client_visibility_changed`), and assignment/blocked notifications this
feature needs. Forking a parallel update path in `SupportOpsController`
would duplicate all of that and create two places that can drift out of
sync for the same underlying model.

**Alternatives considered**: A dedicated `PUT /support-ops/{id}` on the new
controller — rejected per above. Also rejected: leaving the Team Member
allow-list unmodified and requiring PM/Admin to fill in `next_action`/
`root_cause`/etc. on Team Members' behalf — rejected because Team Members
are the primary people expected to actually work these tickets day to day
(per the source plan's framing of the user as doing hands-on TSMS
troubleshooting themselves).

## Decision: `SupportOpsController` returns a proper API Resource; `DetailedActivityController` is left as-is

**Rationale**: Constitution Principle II requires API Resources for new
endpoints. `DetailedActivityController` (pre-dates the constitution)
returns raw Eloquent models directly — a pre-existing gap this feature does
not need to close. But `SupportOpsController@index`/`@store` are *new*
code, so they get a `SupportIssueResource` from the start rather than
copying the older controller's non-compliant shape forward into new code.

**Alternatives considered**: Matching the sibling controller's raw-model
return for "consistency" — rejected; the constitution's own Principle II
exists specifically to stop this pattern from spreading further, and
retrofitting `DetailedActivityController` itself is out of scope for this
feature (no functional need, real risk of an unrelated regression).

## Decision: Status→column mapping includes `delayed` as equivalent to `blocked`

**Rationale**: `frontend/src/pages/Kanban.jsx` already treats
`status === 'blocked' || status === 'delayed'` as the same visual column
("Blocked / Delayed"). The Support Ops board's "Needs Info" column (backed
by `blocked`) must apply the same equivalence, or an issue with
`status = delayed` would silently disappear from the Support Ops board
entirely while still showing up on the Kanban Board — a direct violation of
FR-010 (no behavior change / no inconsistency between the two views for the
same task).

**Alternatives considered**: Treating `delayed` as its own, uncolumned
state — rejected, contradicts FR-010 and would surprise a user who sees a
task on Kanban but not on Support Ops.

## Decision: No new frontend dependencies

**Rationale**: `frontend/src/components/ui/` already has Card, Badge,
Dialog, Select, Input, Checkbox, Tabs — everything the board, intake form,
and detail modal need. `frontend/src/lib/api.js` already has the shared
Axios instance with session-cookie auth and the 401 interceptor from
`001-real-auth-cutover` wired in — new client functions are added there, not
a new HTTP client.

**Alternatives considered**: N/A — no gap exists that would justify a new
dependency.

**Output**: All Technical Context unknowns resolved via direct inspection of
existing code; no `NEEDS CLARIFICATION` markers remain. Proceeding to
Phase 1.
