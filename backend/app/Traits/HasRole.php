<?php

namespace App\Traits;

use App\Models\User;

/**
 * Role-checking predicates for the User model.
 *
 * Every predicate returns false when the user's role is null — this is the
 * fail-safe behavior: a user without a recognized system role is never granted
 * privileged access. Use these instead of comparing role strings directly.
 *
 * @property string|null $role
 */
trait HasRole
{
    public function isAdmin(): bool
    {
        return $this->role === User::ROLE_ADMIN;
    }

    public function isProjectManager(): bool
    {
        return $this->role === User::ROLE_PROJECT_MANAGER;
    }

    public function isPmOrAdmin(): bool
    {
        return $this->isAdmin() || $this->isProjectManager();
    }

    public function isClient(): bool
    {
        return $this->role === User::ROLE_CLIENT;
    }

    public function isDepartmentHead(): bool
    {
        return $this->role === User::ROLE_DEPARTMENT_HEAD;
    }

    public function isTeamMember(): bool
    {
        return $this->role === User::ROLE_TEAM_MEMBER;
    }

    /**
     * True when the user can create/update tasks.
     * Admin, Project Manager, Team Member can write tasks;
     * Client and Department Head cannot.
     */
    public function canWrite(): bool
    {
        return $this->isAdmin()
            || $this->isProjectManager()
            || $this->isTeamMember();
    }

    /**
     * True only when the user carries one of the five known system roles.
     * Sensitive controllers should fail-fast (abort 403) when this is false.
     */
    public function hasValidRole(): bool
    {
        return in_array($this->role, User::validRoles(), true);
    }
}
