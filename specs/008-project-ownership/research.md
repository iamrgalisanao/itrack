# Phase 0 Research: Project Ownership and PM-Scoped Administration

No `NEEDS CLARIFICATION` markers exist in the Technical Context — every decision below came from reading existing code (`ProjectAssignmentController`, `Project.php`, `HasRole.php`, `AuditLogger.php`, `routes/api.php`) and 007's own design record (research.md, data-model.md), not new research after the fact.

## Decision: `Project::scopeOwnedBy`, a query scope mirroring `scopeAccessibleTo`, not a new service class

**Rationale**: `Project::scopeAccessibleTo(Builder $query, User $user)` already exists as this app's established pattern for "which projects can this user reach" — a query scope, not a standalone service. Ownership asks a structurally identical question ("which projects does this user own"), so `scopeOwnedBy(Builder $query, User $user): Builder` follows the exact same shape: `return $query->whereHas('ownerships', fn ($q) => $q->where('user_id', $user->id));`. Callers check `Project::query()->ownedBy($user)->whereKey($projectId)->exists()` — identical usage pattern to how `scopeAccessibleTo` is already checked in `ProjectController::show()`.

**Alternatives considered**: A new `ProjectOwnershipService` class with an `isOwner(User, Project): bool` method — rejected; this app has no precedent for a standalone authorization-check service when a query scope already does the job in one line, and introducing one here would be a second pattern for what is, conceptually, the same kind of question `scopeAccessibleTo` already answers.

## Decision: the ownership check is added inline to `ProjectAssignmentController`, not extracted into a trait or middleware

**Rationale**: Exactly one method-pair (`store()`/`destroy()`) needs this rule. 007's `BelongsToProject` trait exists because *six structurally different nested models* (Module/Activity/SubActivity/DetailedActivity/Comment/Attachment) all needed the identical "walk up to my project, then check `scopeAccessibleTo`" logic — a trait paid for itself by avoiding six divergent copies. Here there is one controller, two methods, one check. Adding a trait or middleware for a single call site would be exactly the kind of premature abstraction this project's own conventions warn against (see plan.md's Structure Decision).

**Alternatives considered**: A `BelongsToProjectOwnership`-style trait applied to nothing in particular yet, "for future reuse" — rejected; no second call site exists today, and 007's own `BelongsToProject` was justified by six *existing* call sites, not a hypothetical future one.

## Decision: `ProjectAssignmentController::store()`/`destroy()`'s existing `isPmOrAdmin()` check splits into two branches, Admin unchanged

**Rationale**: Today: `if (!$user->isPmOrAdmin()) { 403 }`. After: Admin passes through exactly as before (zero behavior change, satisfying FR-008/SC-002 structurally, not just by intent); a Project Manager additionally requires either that the target project has **no owners at all** (FR-018, the rollout safety net) or that they are one of its owners (`Project::query()->ownedBy($user)->whereKey($projectId)->exists()`). Any other role continues to hit the existing 403 unchanged.

```php
$user = $this->user($request);
if ($user->isAdmin()) {
    // unrestricted — unchanged from today
} elseif ($user->isProjectManager()) {
    $projectId = $validated['project_id'] ?? $projectAssignment->project_id; // store() vs destroy()
    $hasAnyOwner = ProjectOwnership::where('project_id', $projectId)->exists();
    $isOwner = Project::query()->ownedBy($user)->whereKey($projectId)->exists();
    if ($hasAnyOwner && !$isOwner) {
        AuditLogger::denied($request, 'manage_project_assignments', 'project_assignment');
        return response()->json(['message' => 'You do not own this project.'], 403);
    }
    // $hasAnyOwner === false → FR-018 rollout safety net, any PM passes
} else {
    AuditLogger::denied($request, 'manage_project_assignments', 'project_assignment');
    return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can manage project assignments.'], 403);
}
```

**Alternatives considered**: Rewriting the check as a single combined boolean (`$user->isAdmin() || ($user->isProjectManager() && ...)`) — rejected in favor of the explicit if/elseif/else above; the combined form reads correctly but obscures that Admin's branch is provably untouched, which SC-002 specifically asks to be able to demonstrate. The explicit branch structure makes "Admin's code path did not change" visually verifiable in review, not just true by construction.

## Decision (round-1 architect review, replaces an earlier ambiguity): an ownerless project is unrestricted for any PM — the rollout safety net, not a lockdown

**Rationale**: The original spec/plan draft implemented the PM-scoped restriction unconditionally and immediately, while separately implying (in spec.md's Assumptions) that the old unrestricted rule "continues to apply as an interim behavior... until this feature's PM-scoped rule is deliberately enabled" — language that promised a staged rollout mechanism that was never actually designed anywhere. Traced through concretely: since no backfill exists (FR-016), every project is ownerless the instant this ships. If the restriction applied unconditionally, every PM would lose all project-assignment authority everywhere the moment this deploys, until an Admin manually assigned ownership project-by-project — a real, immediate access regression in production, the exact kind of deploy-day outage 007 went out of its way to avoid for Team Member/Client (via its `permissions:backfill-assignments` seeding).

The fix: make "ownerless" mean "administratively unrestricted for any PM" (FR-018), not "Admin-only." This is simpler than a backfill *or* a feature flag — there's no toggle to build, no seed command to run, and no transition window to reason about. A project's *current* owner count is the only thing that matters, checked fresh on every request (exactly like every other rule in this app): zero owners → any PM passes, matching pre-008 behavior exactly; one or more owners → only those owner(s) among PMs pass. The security narrowing this feature exists to deliver isn't a one-time migration event — it's an ongoing, per-project opt-in that happens naturally as an Admin assigns real owners over time, with zero risk of ever locking out every PM on every project at once.

**Alternatives considered**: (1) A real backfill — assign every existing PM as a co-owner of every project in their department at migration time, so no project is truly ownerless on day one. Rejected: adds a seed/migration script that isn't grounded in any actual ownership signal (unlike 007's backfill, which had a real signal — department membership — to seed from); would need to be manually pruned by an Admin afterward anyway, and doesn't resolve the same problem any project an Admin *later* strips down to zero owners. (2) A feature flag / staged enable step — rejected; this codebase has no feature-flag system, and introducing one for a single rule is far more machinery than the "ownerless == unrestricted" rule above, for no additional benefit.

## Decision: a disabled or non-PM owner's dormant authority needs zero new code — same finding as 007's FR-015

**Rationale**: The ownership check (`Project::ownedBy($user)`) only ever runs against a `$user` who has already passed `$user->isProjectManager()` in the same request — and `isProjectManager()` reads the user's *current* `role` column, not a cached or snapshotted value, on every single request. A disabled account is separately rejected before reaching any controller at all, by 006's existing `EnsureUserIsActive` global middleware. So: an owner who is disabled, or whose role changes away from Project Manager, automatically fails `isProjectManager()` (or never reaches the controller at all if disabled) on their very next request — with the `project_ownerships` row itself untouched, ready to grant authority again automatically the moment the account is re-enabled and/or restored to Project Manager. This is the exact same mechanism 007's research.md already documented for why `project_assignments` didn't need special handling for a demoted-then-promoted-back Team Member.

**Alternatives considered**: A scheduled job or event listener that revokes/restores ownership rows when a user's role or `is_active` status changes — rejected; this would be new, unnecessary machinery duplicating a guarantee the existing per-request role check already provides for free, and would introduce a real bug class (the job/listener could fail to run, leaving stale state) that the current "always re-check on every request" approach cannot have.

## Decision: ownership transfer is one atomic action (a dedicated endpoint), not "call delete then call create" left to the Admin

**Rationale**: FR-010 requires a transfer to never expose an intermediate ownerless state to the Admin performing it, and to produce one audit entry, not two. `POST /api/project-ownerships/{id}/transfer` (body: `new_owner_user_id`) wraps the remove-old/add-new sequence in a single `DB::transaction()` — both succeed or neither does — and logs one `project_ownership.transferred` entry with `{ project_id, from_user_id, to_user_id }`, distinct from the `.created`/`.deleted` actions a standalone add or remove produces.

**Correction (round-1 architect review)**: the original version of this decision claimed "no row locking is needed since there's no scarce-resource invariant being protected." That was wrong — traced through concretely: two Admins concurrently transferring the *same* ownership row to different new owners is a genuine race. Under MySQL's default REPEATABLE READ, transaction 2's `DELETE` on the same row blocks until transaction 1 commits, then affects **zero rows** (already gone) — but Eloquent doesn't treat a zero-row delete as an error, so transaction 2 would still proceed to `create()` a new ownership row for its own target, leaving the project with **two** owners when both Admins intended an exclusive, single-owner transfer. This is exactly the "ambiguously merged" outcome FR-015 forbids, and the unique constraint does nothing to prevent it (it only blocks a duplicate `[user_id, project_id]` pair, not this stale-read-then-write race). Fixed in data-model.md: the transfer transaction now does `ProjectOwnership::where('id', $id)->lockForUpdate()->first()`, and aborts with `409 Conflict` if the row is gone by the time the lock is acquired, rather than silently proceeding on stale assumptions. Plain `store()`/`destroy()` don't need this — a duplicate `store()` is caught by the unique constraint (idempotent, not corrupting) and a `destroy()` racing another `destroy()` on the same row is naturally idempotent (second one just finds nothing to delete). Only the transfer's read-then-act-on-a-specific-row shape has this race, because it's the only operation whose second half depends on an assumption (which row it's replacing) that a concurrent request can invalidate between the read and the write.

**Alternatives considered**: Exposing only `store`/`destroy` and documenting that "a transfer is just delete-then-create" — rejected; this is exactly what FR-010 says not to do (the spec explicitly calls out that a dedicated action must exist so an Admin never has to reason about an intermediate ownerless window themselves), and it would produce two audit entries for what is conceptually one governance action, muddying the audit trail's readability.

## Decision: `project_ownerships` uses real, constrained `foreignId()`s — matching 007's own precedent, not `department_grants`' older unconstrained-column pattern

**Rationale**: Identical reasoning to 007's own `project_assignments` decision (research.md): `department_grants.granted_by_user_id` has no FK constraint at all, a pre-existing gap not worth repeating. `project_ownerships.user_id`/`project_id`/`assigned_by_user_id` all use proper `foreignId(...)->constrained()`, giving `project_id` the `cascadeOnDelete()` FR-014 needs for free — no new observer or controller code, exactly as 007 found for `project_assignments` cascading via the existing Project → Module → ... chain.

**Alternatives considered**: None — this is a direct continuation of 007's own already-justified decision, not a new fork.

## Decision: ownership management itself (`ProjectOwnershipController`) is Admin-only — an owning PM cannot add a co-owner or transfer their own project

**Rationale**: spec.md's User Story 1 ("As an Admin, assign a specific Project Manager as the owner...") and User Story 3 ("As an Admin, replace a project's sole owner...") consistently frame ownership as something an Admin grants, never something a PM self-manages — matching this app's existing precedent that every "who can access what" governance action (Department Grants, User Management, and 007's own Project Assignment CRUD) is Admin-only or Admin/PM-shared only when the PM's own authority is *already* what's being exercised (assigning a Team Member), never when the PM's *own standing* (their ownership, their role) is what's being changed. Letting a PM grant themselves or another PM co-ownership would be a privilege-escalation-shaped feature this spec never asked for.

**Alternatives considered**: Allowing an owning PM to add a co-owner to their own project (delegation) — rejected as unrequested scope; nothing in spec.md's acceptance scenarios describes a PM managing ownership, only Admins.

## Decision: `GET /api/project-ownerships` (read) is Admin-only too, not shared with PM the way `GET /api/project-assignments` is

**Rationale**: `ProjectAssignmentController::index()` is Admin/PM-shared because both roles have a legitimate reason to view assignment lists (a PM needs to see who's currently assigned to plan work). Ownership's *read* side has no equivalent PM-facing need described in spec.md — a PM already knows what they own without needing an admin-tool list view, and per spec.md's Edge Cases, ownership is explicitly framed as narrowing *administrative authority*, never something a PM needs to introspect via a dedicated endpoint. Keeping the whole controller Admin-only (read and write) is simpler and matches the "ownership is an Admin governance concern" framing established in the decision above, rather than splitting read/write authorization within one small controller for no requested benefit.

**Alternatives considered**: PM-readable, Admin-writable (matching `ProjectAssignmentController`'s shape exactly) — reconsidered but rejected; nothing in spec.md asks for PM-facing ownership visibility, and the Admin Control Center UI (where this is managed) isn't reachable by PM anyway today (confirmed: `AdminGuard` denies any non-Admin role), so a PM-readable API with no PM-reachable UI consuming it would be unused surface.

## Finding: the Admin Control Center is not reachable by Project Manager today — this feature does not change that

**What was found**: `AdminGuard` in `frontend/src/App.jsx` denies any role other than Admin outright. This means 007's own "Project Assignments" tab — despite the backend allowing PM to call `POST /api/project-assignments` directly — has no PM-facing UI entry point today; only Admins use that tab. This is a pre-existing gap from 007, not something this feature introduces or is asked to fix. The new "Project Ownership" tab is built with the same Admin-only reachability, consistent with 007's own precedent — a PM-facing UI for either project assignments or ownership would be a separate, future UX feature, not part of this spec's scope.

**Note, not a requirement of this feature — recorded so it isn't rediscovered from scratch**: if a future feature gives PMs their own reachable UI (rather than only direct API access), both 007's Project Assignments tab and this feature's Project Ownership tab would need a PM-facing equivalent view at that point.

**Output**: All Technical Context unknowns resolved via direct inspection of existing code; no `NEEDS CLARIFICATION` markers remain. Proceeding to Phase 1.
