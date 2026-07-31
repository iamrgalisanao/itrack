<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProjectMembershipResource;
use App\Models\Project;
use App\Models\ProjectMembership;
use App\Models\ProjectOwnership;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\ProjectClientAccess;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectMembershipController extends Controller
{
    public function __construct(private readonly ProjectClientAccess $access) {}

    public function index(Request $request, Project $project)
    {
        $user = $request->user();

        if (!$this->canManageMemberships($user, $project)) {
            AuditLogger::denied($request, 'project_membership.list', 'project', $project->id);
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $validated = $request->validate([
            'state' => ['sometimes', 'string', Rule::in(ProjectMembership::validStates())],
        ]);

        $query = $project->memberships()
                ->where('client_organization_id', $project->client_organization_id)
                ->latest();

        if (isset($validated['state'])) {
            $query->where('state', $validated['state']);
        }

        return ProjectMembershipResource::collection($query->get());
    }

    public function approve(Request $request, ProjectMembership $projectMembership)
    {
        return $this->transition(
            $request,
            $projectMembership,
            ProjectMembership::STATE_APPROVED,
            'approved',
            function (ProjectMembership $membership, User $user): array {
                return [
                    'state' => ProjectMembership::STATE_APPROVED,
                    'approved_at' => now(),
                    'approved_by_user_id' => $user->id,
                    'suspended_at' => null,
                    'removed_at' => null,
                ];
            },
            [ProjectMembership::STATE_PENDING]
        );
    }

    public function reject(Request $request, ProjectMembership $projectMembership)
    {
        return $this->transition(
            $request,
            $projectMembership,
            ProjectMembership::STATE_REJECTED,
            'rejected',
            fn () => [
                'state' => ProjectMembership::STATE_REJECTED,
                'approved_at' => null,
                'approved_by_user_id' => null,
                'suspended_at' => null,
                'removed_at' => null,
            ],
            [ProjectMembership::STATE_PENDING]
        );
    }

    public function suspend(Request $request, ProjectMembership $projectMembership)
    {
        return $this->transition(
            $request,
            $projectMembership,
            ProjectMembership::STATE_SUSPENDED,
            'suspended',
            fn () => [
                'state' => ProjectMembership::STATE_SUSPENDED,
                'suspended_at' => now(),
                'removed_at' => null,
            ],
            [ProjectMembership::STATE_APPROVED]
        );
    }

    public function restore(Request $request, ProjectMembership $projectMembership)
    {
        return $this->transition(
            $request,
            $projectMembership,
            ProjectMembership::STATE_APPROVED,
            'restored',
            function (ProjectMembership $membership, User $user): array {
                return [
                    'state' => ProjectMembership::STATE_APPROVED,
                    'approved_at' => $membership->approved_at ?? now(),
                    'approved_by_user_id' => $membership->approved_by_user_id ?? $user->id,
                    'suspended_at' => null,
                    'removed_at' => null,
                ];
            },
            [ProjectMembership::STATE_SUSPENDED]
        );
    }

    public function remove(Request $request, ProjectMembership $projectMembership)
    {
        return $this->transition(
            $request,
            $projectMembership,
            ProjectMembership::STATE_REMOVED,
            'removed',
            fn () => [
                'state' => ProjectMembership::STATE_REMOVED,
                'suspended_at' => null,
                'removed_at' => now(),
            ],
            [ProjectMembership::STATE_APPROVED, ProjectMembership::STATE_SUSPENDED]
        );
    }

    public function expire(Request $request, ProjectMembership $projectMembership)
    {
        return $this->transition(
            $request,
            $projectMembership,
            ProjectMembership::STATE_EXPIRED,
            'expired',
            fn () => [
                'state' => ProjectMembership::STATE_EXPIRED,
                'approved_at' => null,
                'approved_by_user_id' => null,
                'suspended_at' => null,
                'removed_at' => null,
            ],
            [ProjectMembership::STATE_PENDING]
        );
    }

    private function canManageMemberships(User $user, Project $project): bool
    {
        if ($project->client_organization_id === null) {
            return false;
        }

        if ($user->isAdmin()) {
            return true;
        }

        if ($user->isProjectManager()) {
            return $this->pmMayAdminister($user, $project);
        }

        return $this->access->canManageClientMembers($user, $project);
    }

    private function pmMayAdminister(User $user, Project $project): bool
    {
        $hasAnyOwner = ProjectOwnership::where('project_id', $project->id)->exists();

        if (!$hasAnyOwner) {
            return true;
        }

        return Project::query()->ownedBy($user)->whereKey($project->id)->exists();
    }

    private function transition(
        Request $request,
        ProjectMembership $membership,
        string $targetState,
        string $verb,
        callable $attributes,
        ?array $allowedFrom = null
    ) {
        $user = $request->user();
        $project = $membership->project;

        if (!$project || (int) $project->client_organization_id !== (int) $membership->client_organization_id) {
            AuditLogger::denied($request, "project_membership.{$verb}", 'project_membership', $membership->id);
            return response()->json(['message' => 'Membership is no longer valid for this project.'], 422);
        }

        if (!$this->canManageMemberships($user, $project)) {
            AuditLogger::denied($request, "project_membership.{$verb}", 'project_membership', $membership->id);
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if ($user->isClient() && (int) $membership->user_id === (int) $user->id) {
            AuditLogger::denied($request, "project_membership.{$verb}_self", 'project_membership', $membership->id);
            return response()->json(['message' => 'Client members cannot manage their own membership state.'], 403);
        }

        if ($allowedFrom !== null && !in_array($membership->state, $allowedFrom, true)) {
            AuditLogger::denied($request, "project_membership.{$verb}_invalid_state", 'project_membership', $membership->id);
            return response()->json(['message' => "Membership cannot be {$verb} from state {$membership->state}."], 409);
        }

        $oldState = $membership->state;
        $membership->update($attributes($membership, $user));

        AuditLogger::record(
            $request,
            "project_membership.{$verb}",
            'project_membership',
            $membership->id,
            "Project membership {$verb}.",
            [
                'client_organization_id' => $membership->client_organization_id,
                'project_id' => $membership->project_id,
                'membership_user_id' => $membership->user_id,
                'old_state' => $oldState,
                'new_state' => $targetState,
                'role' => $membership->role,
            ]
        );

        return ProjectMembershipResource::make($membership->refresh())
            ->response()
            ->setStatusCode(200);
    }
}
