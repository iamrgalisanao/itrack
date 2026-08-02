# Phase 0 Research: Bug Tracker

## D1: Authorization pattern — reuse Attachment/Comment's, not Retrospectives'

**Decision**: `Bug` uses the `BelongsToProject` trait (`resolveProjectId()`
returns `$this->project_id`) plus `AccessContext::user($request)` +
`$bug->isAccessibleTo($user)` + an `isClient()`-conditional visibility
filter — the exact shape of `AttachmentController`/`Attachment`, not
`RetrospectiveController`'s own `canView()`/`hasProjectAccess()`/`deny()`
helpers.

**Rationale**: 015-retro-entry-context's research (D1) explicitly kept
Retrospectives' internal-only pattern separate from `DetailedActivity`'s
Client-reachable pattern specifically because Retrospectives has *zero*
Client-reachable path. Bug Tracker is the opposite case — it has a real,
spec'd Client-reachable path (FR-011) — so it belongs with the
`Attachment`/`Comment` family, matching the same reasoning already
established in this codebase rather than inventing a third variant.

**Alternatives considered**:
- **Copy Retrospectives' `canView()`/`hasProjectAccess()`/`deny()` trio and
  add a Client branch to each.** Rejected — that pattern was deliberately
  designed as *internal-only*; bolting Client read access onto it would
  duplicate logic `BelongsToProject`/`isClient()` already provide cleanly,
  and would diverge from the one existing precedent for a feature with
  mixed internal-write/Client-read access.

## D2: Bug ID generation — concurrency-safe per-project sequence

**Decision**: Generate the next `bug_number` inside a `DB::transaction()`
using `lockForUpdate()` on the max existing `bug_number` for that project
(or 0 if none exist), then insert. Store the numeric sequence as an integer
column (`bug_number`) and compute the display string (`"BUG-" .
str_pad($bug_number, 3, '0', STR_PAD_LEFT)`) at read time via an accessor —
not stored as a formatted string, so it composes cleanly with ordering/
filtering.

**Rationale**: `ProjectOwnershipController` already establishes this
project's convention for concurrency-safe sequential operations:
`DB::transaction()` + `lockForUpdate()` on a fresh re-query, never trusting
a possibly-stale in-memory value. A naive `Bug::where('project_id',
$id)->count() + 1` would race under concurrent creation and could also
collide after a deletion (violating FR-002's "never reused" requirement,
since `count()` shrinks when rows are deleted but `MAX()` does not).

**Alternatives considered**:
- **`count() + 1`.** Rejected — races under concurrency and violates
  "never reused" after any deletion.
- **A separate `project_bug_counters` table.** Rejected — introduces a new
  table and an extra join/lookup for what `MAX(bug_number) FOR UPDATE`
  already solves in one query; over-engineering for the scale involved
  (code-slop `over-eng-premature-interface`).
- **UUID-based Bug ID.** Rejected — spec FR-002 explicitly requires a
  human-readable sequential ID (e.g. "BUG-001"), matching the monday dev
  reference; a UUID doesn't satisfy that requirement at all.

## D3: SLA breach detection — reuse the existing lazy notification-generation pattern

**Decision**: Add a private `generateBugBreachNotifications()` method to
the existing `NotificationController`, called from `index()` alongside
`generateOverdueNotifications()`/`generateDueSoonNotifications()` (which
already run on every `GET /api/notifications` poll). It scans `Bug::where
('status', '!=', Bug::STATUS_FIXED)->whereNotNull('due_date')->where
('due_date', '<', now())`, and for each, calls the existing
`Notification::sendNotification()` twice (once for the Reporter, once for
the Owner if set and different) with `recipientUserId` set and a unique
`event_key` (e.g. `"bug_breach:bug:{$bug->id}:reporter"` /
`"...owner"`), reusing `Notification::TYPE_OVERDUE` — no new notification
type constant.

**Rationale**: This codebase already has a proven, minimal pattern for
exactly this shape of problem ("periodically check a due-date condition,
notify without duplicating") — `generateOverdueNotifications()` for
`DetailedActivity.plan_end_date`. `docker-compose.yaml` does run a real
`schedule:run` loop, but nothing in the codebase actually uses Laravel's
task scheduler for notification generation today; the lazy,
request-triggered approach is the established precedent, and matching it
keeps this feature consistent with the rest of the notification system
rather than introducing a second, inconsistent mechanism. `sendNotification
()`'s dedup key already ignores `recipient_user_id` in its uniqueness
check by design (comment in `Notification::sendNotification()`) — exactly
because the event_key itself is expected to encode the recipient when
individually targeted, which this design follows.

**Alternatives considered**:
- **A real Laravel scheduled command** (`Schedule::command(...)
  ->everyMinute()` in `routes/console.php`, relying on
  `compose.yaml`'s existing `schedule:run` loop). Rejected for this phase —
  while the infrastructure exists, no other feature in this codebase
  currently depends on it firing (the loop currently has nothing
  scheduled), so adopting it here would be the first real dependency on
  scheduler timing accuracy/availability, a bigger operational
  commitment than the spec's Assumptions section calls for ("the exact
  mechanism ... is a planning-phase decision, not a product-level
  constraint" — the lazy approach satisfies the product requirement
  without that added dependency). Revisit if/when this project adopts the
  scheduler more broadly.
- **A new dedicated notification type constant (`TYPE_BUG_BREACH`).**
  Rejected — `TYPE_OVERDUE` already exists and means exactly this ("a
  due-date passed without completion"); adding a parallel constant for the
  same concept is unnecessary proliferation (code-slop
  `naming-generic-placeholders`/duplication concerns).

## D4: Status→group mapping and the "free selection" status model

**Decision**: `Bug::STATUS_*` constants (Awaiting Review, Ready for Dev,
Fixing, Fixed) with a static `GROUP_MAP` (or equivalent accessor) computing
which of the 3 display groups (Incoming/Development Work/Resolved) a
status belongs to. Status changes are validated only against the fixed
4-value enum (`in:...`) — no additional workflow/transition-order
validation, matching spec's documented Assumption.

**Rationale**: Directly implements FR-004 and the spec's explicit Edge
Case/Assumption that status is a free selection, not a gated workflow —
avoids building unrequested workflow-engine complexity.

**Alternatives considered**:
- **A separate `bug_groups` table.** Rejected — the group is a pure
  function of status; persisting it separately would be a derived/
  redundant column inviting drift (a bug could have display group A while
  status implies group B).

## D5: Live countdown — frontend-only, no backend "seconds remaining" field

**Decision**: The backend returns `due_date` as an ISO timestamp (or
`null`); the frontend computes and re-renders the live countdown/overdue
indicator client-side (e.g., a `setInterval`-driven display), matching how
any "live" UI element in this codebase is handled — there is no precedent
for a backend-computed countdown field, and one isn't needed since the due
date itself is the only server-authoritative fact.

**Rationale**: Keeps the API contract simple (one timestamp field) and
avoids clock-skew/staleness issues a server-computed "seconds remaining"
value would have the instant it's rendered.

**Alternatives considered**:
- **Backend-computed `seconds_until_due` field.** Rejected — becomes stale
  immediately after the response is sent; the frontend would need to
  re-derive a live countdown from it anyway, making the field redundant.
