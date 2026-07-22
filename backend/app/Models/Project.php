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

    /**
     * Scope: projects the given user is allowed to see.
     *
     * - Admin / Project Manager: all projects
     * - Department Head: own department + any department granted via DepartmentGrant
     * - Team Member / Client: only projects in their own department
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
            return $query->where('department', $user->department);
        }

        // Unknown / null role — deny by returning an impossible match
        return $query->whereRaw('1 = 0');
    }
}
