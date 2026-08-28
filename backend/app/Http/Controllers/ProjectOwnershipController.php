<?php

namespace App\Http\Controllers;

use App\Support\AccessContext;
use App\Http\Resources\ProjectOwnershipResource;
use App\Models\ProjectOwnership;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ProjectOwnershipController extends Controller
{
    /**
     * GET /api/project-ownerships
     * Admin-only list, optionally filtered by project_id/user_id — unlike
     * project-assignments, ownership reads are not PM-shared (research.md:
     * no PM-facing need for this list exists in this feature's scope).
     */
    public function index(Request $request)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'manage_project_ownerships', 'project_ownership');
            return response()->json(['message' => 'Unauthorized: Only Admins can manage project ownership.'], 403);
        }

        $query = ProjectOwnership::with(['user', 'project', 'assignedBy']);

        if ($request->filled('project_id')) {
            $query->where('project_id', $request->input('project_id'));
        }
        if ($request->filled('user_id')) {
            $query->where('user_id', $request->input('user_id'));
        }

        return ProjectOwnershipResource::collection($query->get());
    }

    /**
     * POST /api/project-ownerships
     * Admin designates a Project Manager as a project's owner. Idempotent —
     * re-assigning an existing pair returns 200 with no duplicate row or
     * audit entry, matching 007's project_assignments idempotency decision.
     */
    public function store(Request $request)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'manage_project_ownerships', 'project_ownership');
            return response()->json(['message' => 'Unauthorized: Only Admins can manage project ownership.'], 403);
        }

        $validated = $request->validate([
            'user_id'    => ['required', 'integer', Rule::exists('users', 'id')],
            'project_id' => ['required', 'integer', Rule::exists('projects', 'id')],
        ]);

        $target = User::findOrFail($validated['user_id']);

        // FR-005 — only active Project Manager accounts may be ownership targets.
        if (!$target->is_active || !$target->isProjectManager()) {
            return response()->json([
                'message' => 'Only active Project Manager accounts can own a project.',
            ], 422);
        }

        $existing = ProjectOwnership::where('user_id', $validated['user_id'])
            ->where('project_id', $validated['project_id'])
            ->first();

        if ($existing) {
            return ProjectOwnershipResource::make($existing->load(['user', 'project', 'assignedBy']))
                ->response()
                ->setStatusCode(200);
        }

        $ownership = ProjectOwnership::create([
            'user_id'             => $validated['user_id'],
            'project_id'          => $validated['project_id'],
            'assigned_by_user_id' => $user->id,
        ]);

        AuditLogger::record(
            $request,
            'project_ownership.created',
            'project_ownership',
            $ownership->id,
            null,
            ['user_id' => $ownership->user_id, 'project_id' => $ownership->project_id]
        );

        return ProjectOwnershipResource::make($ownership->load(['user', 'project', 'assignedBy']))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * DELETE /api/project-ownerships/{projectOwnership}
     * Admin removes an owner — takes effect on the target PM's very next
     * request (scopeOwnedBy is re-evaluated fresh every time). Leaving a
     * project with zero owners is valid, not an error (FR-002/FR-003).
     */
    public function destroy(Request $request, ProjectOwnership $projectOwnership)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'manage_project_ownerships', 'project_ownership', $projectOwnership->id);
            return response()->json(['message' => 'Unauthorized: Only Admins can manage project ownership.'], 403);
        }

        AuditLogger::record(
            $request,
            'project_ownership.deleted',
            'project_ownership',
            $projectOwnership->id,
            null,
            ['user_id' => $projectOwnership->user_id, 'project_id' => $projectOwnership->project_id]
        );

        $projectOwnership->delete();

        return response()->noContent();
    }

    /**
     * POST /api/project-ownerships/{id}/transfer
     * Admin transfers ownership atomically to a different PM. FR-010/FR-015 —
     * one audit entry, safe under concurrency (data-model.md).
     *
     * Deliberately takes a raw int $id, NOT an implicitly route-model-bound
     * ProjectOwnership — Laravel resolves implicit bindings via a plain,
     * unlocked query BEFORE the controller method body runs at all, which
     * would 404 (not the documented 409) for a row that vanished before this
     * request even started, and would tempt a future edit to read fields off
     * that stale bound instance instead of the fresh locked re-query below.
     * Taking only the id removes that stale instance from existence entirely.
     */
    public function transfer(Request $request, int $id)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'manage_project_ownerships', 'project_ownership', $id);
            return response()->json(['message' => 'Unauthorized: Only Admins can manage project ownership.'], 403);
        }

        // "Must be an active PM" only — this depends solely on the target
        // user, not on the current ownership row's state, so it's safe to
        // validate before the transaction. The "not the current owner"
        // check is NOT here: it depends on the row's live state, so it's
        // checked only inside the transaction, against the locked re-query
        // (below) — never against a pre-transaction read, which could be
        // stale by the time it's evaluated (e.g. a concurrent transfer moves
        // this row away from and back to a given user between the two).
        $validated = $request->validate([
            'new_owner_user_id' => ['required', 'integer', Rule::exists('users', 'id')],
        ]);

        $newOwner = User::findOrFail($validated['new_owner_user_id']);
        if (!$newOwner->is_active || !$newOwner->isProjectManager()) {
            return response()->json([
                'message' => 'Only active Project Manager accounts can own a project.',
            ], 422);
        }

        $ownershipId = $id;
        $newOwnerId = $newOwner->id;

        $result = DB::transaction(function () use ($ownershipId, $newOwnerId, $user, $request) {
            // The FIRST statement inside the transaction: a fresh, locked
            // re-query by id — never reuse the route-bound instance's other
            // fields, which may already be stale (FR-015).
            $ownership = ProjectOwnership::where('id', $ownershipId)->lockForUpdate()->first();

            if (!$ownership) {
                abort(409, 'This ownership record no longer exists — it may have already been transferred or removed.');
            }

            // Checked here, against the locked row's live user_id — not
            // against a pre-transaction read, which could be stale.
            if ((int) $ownership->user_id === (int) $newOwnerId) {
                abort(422, 'Cannot transfer ownership to the current owner.');
            }

            $projectId = $ownership->project_id;
            $oldOwnerId = $ownership->user_id;

            $ownership->delete();

            // Edge case: new owner already co-owns this project — consolidate
            // rather than attempt a duplicate (user_id, project_id) row.
            $newOwnership = ProjectOwnership::where('project_id', $projectId)
                ->where('user_id', $newOwnerId)
                ->lockForUpdate()
                ->first();

            if (!$newOwnership) {
                $newOwnership = ProjectOwnership::create([
                    'user_id'             => $newOwnerId,
                    'project_id'          => $projectId,
                    'assigned_by_user_id' => $user->id,
                ]);
            }

            AuditLogger::record(
                $request,
                'project_ownership.transferred',
                'project_ownership',
                $newOwnership->id,
                null,
                [
                    'project_id'         => $projectId,
                    'from_user_id'       => $oldOwnerId,
                    'to_user_id'         => $newOwnerId,
                    'from_ownership_id'  => $ownershipId,
                    'to_ownership_id'    => $newOwnership->id,
                ]
            );

            return $newOwnership;
        });

        // Explicit 200, always — not Laravel's default resource-response
        // status, which would otherwise silently vary (201 vs. 200) based on
        // whether the new owner's row was freshly created or an existing
        // co-owner row was reused (Model::wasRecentlyCreated). The contract
        // is one consistent status regardless of that internal detail.
        return ProjectOwnershipResource::make($result->load(['user', 'project', 'assignedBy']))
            ->response()
            ->setStatusCode(200);
    }

    /**
     * Preview-aware, deliberately.
     *
     * This returned `$request->user()`, so an Admin previewing as a Client
     * passed every role gate below as the Admin -- preview answering "what does
     * this client see" in the PERMISSIVE direction, which is the one direction
     * that makes it worse than useless. Eleven routes diverged; this was one.
     *
     * Safe for writes without a second helper: `BlockWritesDuringPreview`
     * rejects every non-GET while a preview session is attached, so no write
     * ever runs with a preview target in scope and `AccessContext::user()`
     * returns `$request->user()` identically there. Audit identity is unaffected
     * either way -- `AuditLogger::record` reads `$request->user()` off the
     * request itself (AuditLogger.php:47), never this helper.
     */
    private function user(Request $request): User
    {
        return AccessContext::user($request);
    }
}
