<?php

namespace App\Support;

use App\Models\Project;
use App\Models\ProjectMembership;
use App\Models\User;

class ProjectClientAccess
{
    public function canReadProject(User $user, Project $project): bool
    {
        if ($user->isAdmin() || $user->isProjectManager()) {
            return true;
        }

        if ($user->isDepartmentHead() || $user->isTeamMember()) {
            return Project::query()->accessibleTo($user)->whereKey($project->id)->exists();
        }

        if (!$user->isClient()) {
            return false;
        }

        if ($project->client_organization_id === null) {
            return Project::query()->accessibleTo($user)->whereKey($project->id)->exists();
        }

        return $this->approvedMembership($user, $project) !== null;
    }

    public function canContribute(User $user, Project $project): bool
    {
        if ($user->canWrite()) {
            return $this->canReadProject($user, $project);
        }

        $membership = $this->approvedMembership($user, $project);

        return $membership !== null && in_array($membership->role, [
            ProjectMembership::ROLE_CLIENT_CONTRIBUTOR,
            ProjectMembership::ROLE_CLIENT_ADMIN,
        ], true);
    }

    public function canManageClientMembers(User $user, Project $project): bool
    {
        if ($user->isAdmin()) {
            return true;
        }

        if ($user->isProjectManager()) {
            return $this->canReadProject($user, $project);
        }

        $membership = $this->approvedMembership($user, $project);

        return $membership !== null && $membership->role === ProjectMembership::ROLE_CLIENT_ADMIN;
    }

    public function approvedMembership(User $user, Project $project): ?ProjectMembership
    {
        if ($project->client_organization_id === null) {
            return null;
        }

        return ProjectMembership::query()
            ->where('client_organization_id', $project->client_organization_id)
            ->where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->where('state', ProjectMembership::STATE_APPROVED)
            ->first();
    }
}
