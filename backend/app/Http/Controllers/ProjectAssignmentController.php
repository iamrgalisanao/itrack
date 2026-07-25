<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProjectAssignmentResource;
use App\Models\ProjectAssignment;
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
}
