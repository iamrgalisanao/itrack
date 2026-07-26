<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Project extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'location',
        'updated_date',
        'project_owner',
        'department',
        'status',
        'start_date',
        'target_end_date',
        'health',
        'health_updated_at',
        'health_updated_by',
        'health_note',
    ];

    protected $casts = [
        'updated_date' => 'date',
        'start_date' => 'date',
        'target_end_date' => 'date',
        'health_updated_at' => 'datetime',
    ];

    public function modules()
    {
        return $this->hasMany(Module::class)->orderBy('sort_order');
    }

    public function assignments()
    {
        return $this->hasMany(ProjectAssignment::class);
    }

    public function ownerships()
    {
        return $this->hasMany(ProjectOwnership::class);
    }

    /**
     * Scope: projects the given Project Manager owns.
     *
     * 008-project-ownership — deliberately separate from scopeAccessibleTo:
     * ownership answers "can this PM administer this project's assignments",
     * accessibility answers "can this user see this project at all". A PM's
     * scopeAccessibleTo branch (unrestricted) is untouched by this scope.
     */
    public function scopeOwnedBy(Builder $query, User $user): Builder
    {
        return $query->whereHas('ownerships', fn (Builder $q) => $q->where('user_id', $user->id));
    }

    /**
     * Scope: projects the given user is allowed to see.
     *
     * - Admin / Project Manager: all projects
     * - Department Head: own department + any department granted via DepartmentGrant
     * - Team Member / Client: only projects they are explicitly assigned to
     *   (007-permission-hardening — narrowed from "whole department" to
     *   per-user ProjectAssignment rows; see spec.md FR-001-FR-003)
     * - Unknown role: no projects (fail-safe)
     */
    public function scopeAccessibleTo(Builder $query, User $user): Builder
    {
        if ($user->isAdmin() || $user->isProjectManager()) {
            return $query;
        }

        if ($user->isDepartmentHead()) {
            $departments = DepartmentGrant::departmentsFor($user);
            return $query->whereIn('department', $departments);
        }

        if ($user->isTeamMember() || $user->isClient()) {
            return $query->whereHas('assignments', fn (Builder $q) => $q->where('user_id', $user->id));
        }

        // Unknown / null role — deny by returning an impossible match
        return $query->whereRaw('1 = 0');
    }
}
