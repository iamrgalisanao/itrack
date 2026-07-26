<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProjectAssignmentResource;
use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\ProjectOwnership;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectAssignmentController extends Controller
{
    /**
     * GET /api/project-assignments
     * Admin/PM-only list, optionally filtered by project_id/user_id.
     */
    public function index(Request $request)
    {
        $user = $this->user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'manage_project_assignments', 'project_assignment');
            return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can manage project assignments.'], 403);
        }

        $query = ProjectAssignment::with(['user', 'project', 'assignedBy']);

        if ($request->filled('project_id')) {
            $query->where('project_id', $request->input('project_id'));
        }
        if ($request->filled('user_id')) {
            $query->where('user_id', $request->input('user_id'));
        }

        return ProjectAssignmentResource::collection($query->get());
    }

    /**
     * POST /api/project-assignments
     * Admin/PM assigns a Team Member/Client to a project. Idempotent
     * (FR-017) — re-assigning an existing pair returns 200 with no
     * duplicate row or audit entry, rather than a 422 constraint error.
     */
    public function store(Request $request)
    {
        $user = $this->user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'manage_project_assignments', 'project_assignment');
            return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can manage project assignments.'], 403);
        }

        $validated = $request->validate([
            'user_id'    => ['required', 'integer', Rule::exists('users', 'id')],
            'project_id' => ['required', 'integer', Rule::exists('projects', 'id')],
        ]);

        // 008-project-ownership (FR-006/FR-007/FR-018): a PM's assignment
        // authority is scoped to projects they own — UNLESS the project has
        // zero owners at all, the deliberate rollout safety net that keeps
        // every PM's pre-008 unrestricted behavior intact until an Admin
        // opts a given project into ownership-scoped administration. Admin
        // is never subject to this check (unchanged from before this feature).
        if ($user->isProjectManager() && !$this->pmMayAdminister($user, $validated['project_id'])) {
            AuditLogger::denied($request, 'manage_project_assignments', 'project_assignment');
            return response()->json(['message' => 'You do not own this project.'], 403);
        }

        $target = User::findOrFail($validated['user_id']);

        // FR-016 — only active Team Member/Client accounts may be assignment targets.
        if (!$target->is_active || !($target->isTeamMember() || $target->isClient())) {
            return response()->json([
                'message' => 'Only active Team Member or Client accounts can be assigned to a project.',
            ], 422);
        }

        $existing = ProjectAssignment::where('user_id', $validated['user_id'])
            ->where('project_id', $validated['project_id'])
            ->first();

        if ($existing) {
            return ProjectAssignmentResource::make($existing->load(['user', 'project', 'assignedBy']))
                ->response()
                ->setStatusCode(200);
        }

        $assignment = ProjectAssignment::create([
            'user_id'             => $validated['user_id'],
            'project_id'          => $validated['project_id'],
            'assigned_by_user_id' => $user->id,
        ]);

        AuditLogger::record(
            $request,
            'project_assignment.created',
            'project_assignment',
            $assignment->id,
            null,
            ['user_id' => $assignment->user_id, 'project_id' => $assignment->project_id]
        );

        return ProjectAssignmentResource::make($assignment->load(['user', 'project', 'assignedBy']))
            ->response()
            ->setStatusCode(201);
    }

    /**
     * DELETE /api/project-assignments/{projectAssignment}
     * Admin/PM revokes an assignment — takes effect on the target's very
     * next request (scopeAccessibleTo is re-evaluated fresh every time).
     */
    public function destroy(Request $request, ProjectAssignment $projectAssignment)
    {
        $user = $this->user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'manage_project_assignments', 'project_assignment', $projectAssignment->id);
            return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can manage project assignments.'], 403);
        }

        // 008-project-ownership — same rule as store(), see the comment there.
        if ($user->isProjectManager() && !$this->pmMayAdminister($user, $projectAssignment->project_id)) {
            AuditLogger::denied($request, 'manage_project_assignments', 'project_assignment', $projectAssignment->id);
            return response()->json(['message' => 'You do not own this project.'], 403);
        }

        AuditLogger::record(
            $request,
            'project_assignment.deleted',
            'project_assignment',
            $projectAssignment->id,
            null,
            ['user_id' => $projectAssignment->user_id, 'project_id' => $projectAssignment->project_id]
        );

        $projectAssignment->delete();

        return response()->noContent();
    }

    private function user(Request $request): User
    {
        return $request->user();
    }

    /**
     * 008-project-ownership enforcement matrix (data-model.md): a PM may
     * administer a project if it has no owners at all (FR-018 rollout
     * safety net) or if they are one of its owners — regardless of how
     * many other owners it also has. $hasAnyOwner must mean "any ownership
     * row exists", including a dormant one (a disabled/role-changed
     * owner's row is not deleted, so the project is NOT ownerless during
     * that dormancy — FR-018 must not incorrectly reapply then).
     */
    private function pmMayAdminister(User $user, int $projectId): bool
    {
        $hasAnyOwner = ProjectOwnership::where('project_id', $projectId)->exists();
        if (!$hasAnyOwner) {
            return true;
        }

        return Project::query()->ownedBy($user)->whereKey($projectId)->exists();
    }
}
