<?php

namespace App\Http\Controllers;

use App\Models\ClientOrganization;
use App\Models\Project;
use App\Models\ProjectOwnership;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProjectClientOrganizationController extends Controller
{
    public function update(Request $request, Project $project)
    {
        $user = $request->user();

        if (!$user->isAdmin() && !$this->pmMayAdminister($user, $project)) {
            AuditLogger::denied($request, 'project.client_organization.update', 'project', $project->id);
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $validated = $request->validate([
            'client_organization_id' => ['present', 'nullable', 'integer', Rule::exists('client_organizations', 'id')],
        ]);

        $old = $project->client_organization_id;
        $project->update(['client_organization_id' => $validated['client_organization_id']]);

        AuditLogger::record(
            $request,
            'project.client_organization_updated',
            'project',
            $project->id,
            "Project client organization updated.",
            [
                'project_id' => $project->id,
                'old_client_organization_id' => $old,
                'new_client_organization_id' => $project->client_organization_id,
            ]
        );

        return response()->json(['data' => [
            'id' => $project->id,
            'name' => $project->name,
            'client_organization_id' => $project->client_organization_id,
        ]]);
    }

    private function pmMayAdminister($user, Project $project): bool
    {
        if (!$user->isProjectManager()) {
            return false;
        }

        $hasAnyOwner = ProjectOwnership::where('project_id', $project->id)->exists();

        if (!$hasAnyOwner) {
            return true;
        }

        return Project::query()->ownedBy($user)->whereKey($project->id)->exists();
    }
}
