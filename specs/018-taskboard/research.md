# Phase 0 Research: Taskboard

No `[NEEDS CLARIFICATION]` markers were left in spec.md — this feature went through
four rounds of user-driven design review during planning, each resolving a real
correctness or authorization gap before implementation. Documented as decisions below.

## D1: Reuse Module/DetailedActivity instead of new Epic/Task entities

**Decision**: "Epic" = existing `Module`. "Task" = existing `DetailedActivity`, extended
with four new nullable columns. No new top-level entities.

**Rationale**: Work Program already has a 4-level hierarchy
(`Module → Activity → SubActivity → DetailedActivity`) where `DetailedActivity` already
covers most of "Task" (status, dates, progress, `client_visible`, Comments,
Attachments), and `Module` already resembles a lightweight Epic (name, description,
dates, responsible). Building a parallel Epic/Task structure would create two
independent systems representing "a chunk of work broken into pieces," with nothing
keeping them in sync — Work Program's Gantt view, dashboard %, and client-visibility
rules would keep working off the old hierarchy while a new board's roll-ups ran on a
separate one nobody's reconciling.

**Alternatives considered**:
- **A new `epics` table above `Module`.** Rejected — bigger schema change, and now two
  things (Module and Epic) both mean "a grouping of work" with no clear reason Module
  alone couldn't serve that role.
- **A fully standalone Taskboard module** (like Bug Tracker), with its own Epic/Task
  entities, zero coupling to Work Program. Rejected — would leave iTrack with two
  separate places tracking "tasks," and the user's framing ("revisit Work Program")
  pointed at extending the existing feature, not building a sibling to it.

## D2: No schema break to the required Module→Activity→SubActivity chain

**Decision**: `DetailedActivity.sub_activity_id` stays `NOT NULL`. Task creation from
Taskboard only requires picking a Module; the backend transparently reuses-or-creates
one reserved Activity (`"Taskboard"`) and SubActivity (`"Unclassified Tasks"`) per
Module, inside a single transaction that locks the Module row first
(`Module::whereKey($id)->lockForUpdate()->firstOrFail()`), so two concurrent creations
against a fresh Module can't both create duplicate containers. The helper does not open
its own nested transaction — the caller (`TaskboardController::store()`) owns the one
transaction for the whole create flow; Laravel supports nested `DB::transaction()` via
savepoints, but there's no reason to pay that complexity for one caller.

Reserved names are deliberately *not* `"General"` — a name a real user might plausibly
give their own Activity — since colliding with a manually-created record would silently
misfile that user's data under Taskboard. `"Taskboard"`/`"Unclassified Tasks"` are
treated as application-owned by convention (no `system_key`/`is_system` marker column
is added in this phase): users must not manually create, rename, or delete an
Activity/SubActivity that happens to share these exact names, and deletion of the real
reserved containers is rejected (409) while they still hold Taskboard-created tasks — an
*empty* Activity/SubActivity sharing the name can still be deleted normally, since the
guard is scoped to "has children," not to the name alone.

**Rationale**: Making `sub_activity_id` nullable to literally match the spec's
"backlog tasks with no epic at all" framing would require auditing every existing query
that assumes a task always has a full chain (List view, Gantt, dashboard progress
roll-up, client-visibility checks) — real risk of breaking shipped functionality for a
UX simplification that can be achieved without it.

**Alternatives considered**:
- **Nullable `sub_activity_id`.** Rejected per above — the risk/reward doesn't favor a
  schema break when a transparent default achieves the same user-facing simplicity.
- **A `system_key`/`is_system` marker column.** Rejected as unnecessary for MVP scope —
  exact-name matching under the right parent is sufficient and matches this codebase's
  existing preference for minimal, additive schema changes; can be added later if the
  name-collision edge case turns out to matter in practice.

## D3: Field-stripping order and permission tiers on the existing update endpoint

**Decision**: `DetailedActivityController::update()` strips the four Taskboard fields
from the **raw request input, before validation runs**, for any non-PM/Admin caller:

```php
$taskboardFields = ['priority', 'estimated_story_points', 'sprint_label', 'assignee_user_id'];
$input = $request->all();
if (! $user->isPmOrAdmin()) {
    $input = Arr::except($input, $taskboardFields);
}
$validated = Validator::make($input, [/* existing rules + Taskboard rules */])->validate();
```

These fields are **not** added to `$allowedForTeamMember` (the existing allowlist that
further restricts a Team Member's payload) — adding them there and then stripping them
elsewhere would be contradictory, implying Team Members can touch them while silently
ignoring that.

**Rationale**: Stripping *after* validation would mean a Team Member submitting a bogus
or cross-project `assignee_user_id` gets a spurious 422 for a field they were never
allowed to touch in the first place — the request should behave as if that part of the
payload was never sent, not as if it was sent and rejected. `DetailedActivityResource`
hiding these fields from Client's response branch is necessary but insufficient on its
own — a crafted request could still set them via `update()` regardless of what the
response later shows, so the strip is a genuine server-side authorization control, not
just an API-shape decision.

**Alternatives considered**:
- **Strip after validation.** Rejected — produces the spurious-422 problem above.
- **Conditional validation rules only (no explicit strip).** Rejected — validation rules
  alone don't prevent a field from being written if it happens to pass; the strip is the
  actual authorization boundary, validation is what runs on top of it for the fields
  that remain.

## D4: Assignee validation — real project access, not just role

**Decision**: `assignee_user_id` validation has two layers: (1) `Rule::exists('users',
'id')->where(fn($q) => $q->where('role', '!=', User::ROLE_CLIENT))` (a real, non-Client
user exists), and (2) a second check that the candidate actually has access to the
target project — `Project::query()->accessibleTo($candidate)->whereKey($project->id)->exists()`,
the same `Project::scopeAccessibleTo()` primitive every other authorization check in
this plan uses — rejecting with 422 if it fails.

**Rationale**: Layer 1 alone only proves the id is a real internal user somewhere in the
system — it says nothing about whether that user can touch *this* project. A real
internal user from an entirely unrelated project would pass layer 1 and shouldn't be
assignable here.

**Alternatives considered**:
- **Layer 1 only.** Rejected — the gap above is exactly the kind of broken-access-control
  case `laravel-owasp-security` calls out; closing it costs one extra query.

## D5: Assignment-notification identity — audit-log id, not a permanent key or a timestamp

**Decision**: Reuse the existing per-user notification path
(`Notification::sendNotification(..., recipientUserId: ...)`), with `$activityId =
$task->id` passed as the real `detailed_activity_id` FK (unlike `Bug`, which is a
separate table and has to leave that FK null — a Taskboard task *is* a
`DetailedActivity` row, so it should use the real FK the way
`generateOverdueNotifications()` already does for ordinary tasks). The dedup key is
`"assignment:event:{$auditEntry->id}"`, where `$auditEntry` is the `AuditLog` row this
action already writes (`AuditLogger::record('task.assigned', ...)`), created
synchronously inside the transaction before the notification send is scheduled via
`DB::afterCommit()`.

`AuditLogger::record()` (`backend/app/Services/AuditLogger.php:39`) currently returns
`void` — extended to `return AuditLog::create([...]);` instead of a bare statement.
Verified safe: every existing call site in the codebase invokes it as a plain statement
and ignores the return value, so this is purely additive.

**Rationale**: A permanent `"assignment:task:{id}:user:{id}"` key would silently suppress
a legitimate future notification if a task is reassigned away from someone and later
reassigned back to them (assign A → assign B → assign A again should notify A twice, not
once — the dedup composite already includes `detailed_activity_id`, so the key only
needs to differentiate *events*, not re-encode the task id). A timestamp-based key
(`updated_at` formatted to microseconds) was considered and rejected — MySQL/Laravel
timestamp column precision isn't guaranteed to actually be microsecond-granular in this
schema, so two assignment events landing in the same stored tick would wrongly collide
and suppress a real notification. The audit-log-row id is genuinely unique per event and
already persisted before the notification fires, satisfying "identity must exist before
the notification is created" without a new UUID column or a separate event table.

**Alternatives considered**:
- **Permanent task+recipient key.** Rejected — see above, breaks the reassign-back case.
- **`updated_at`-microsecond key.** Rejected — unsafe precision assumption.
- **New dedicated `assignment_events` table.** Rejected — `AuditLog` already records
  exactly this event; a second table would duplicate it for no benefit.

## D6: `sprint_label` normalization

**Decision**: Trim and blank-to-`null` normalize before saving:
`$value = trim($value) ?: null`. `"Sprint 1"`, `" Sprint 1"`, `"Sprint 1 "` all resolve
to the stored value `"Sprint 1"`; `""` and `"   "` both resolve to `null` (the Backlog
group). Case normalization (`"sprint 1"` vs `"Sprint 1"`) is explicitly deferred — only
whitespace is handled.

**Rationale**: Without this, `"Sprint 1"`, `"Sprint 1 "`, and `" Sprint 1"` would appear
as three separate groups on the Taskboard, which is a confusing and easily-triggered UX
defect (a trailing space is invisible in most inputs), not an edge case worth ignoring.

**Alternatives considered**:
- **No normalization.** Rejected — the fragmentation bug above is trivial to hit by
  accident and the fix is a single `trim()`.
- **Full case-insensitive normalization too.** Deferred, not rejected — a reasonable
  future enhancement, but out of scope for this MVP; whitespace was the concrete,
  demonstrated failure mode.

## D7: Kanban's mislabeled "Priority" field

**Decision**: Relabel `TaskDetailModal.jsx`'s existing "Priority" UI text to "Type" — no
data migration, the underlying `type` column and its values are untouched.

**Rationale**: That field was already reading/writing `form.type`, not a real priority
concept. Left as-is, it would collide with this feature's new, genuinely separate
`priority` column added to the same modal — a user could reasonably believe editing one
affects the other. Confirmed via direct code read (`TaskDetailModal.jsx` ~line 491) that
the field is bound to `type`, not a `priority` field that doesn't yet exist.

**Alternatives considered**:
- **Leave both as-is, ship the new field alongside the mislabeled one.** Rejected —
  ships a known, confusing inconsistency (two "Priority"-adjacent concepts on the same
  task, one mislabeled) that would be harder to untangle once users start relying on
  both.
- **Migrate `type`'s data into a new `task_type` column as part of this fix.** Rejected —
  `task_type` isn't in this feature's confirmed scope (see spec.md Assumptions); the
  minimal fix is a label change, not a data migration.
