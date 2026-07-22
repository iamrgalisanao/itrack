<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DepartmentGrant extends Model
{
    protected $fillable = [
        'grantee_role',
        'grantee_department',
        'granted_department',
        'granted_by_role',
        'granted_by_user_id',
    ];

    /**
     * Return all departments granted to a specific role+dept persona.
     * In mock mode this applies to any user matching that persona.
     */
    public static function grantedDepartments(string $granteeRole, string $granteeDept): array
    {
        return static::where('grantee_role', $granteeRole)
            ->where('grantee_department', $granteeDept)
            ->pluck('granted_department')
            ->toArray();
    }

    /**
     * Return the full set of departments a user can see projects in.
     * Always includes the user's own department; adds any granted departments.
     *
     * @return string[]
     */
    public static function departmentsFor(User $user): array
    {
        $own = $user->department ? [$user->department] : [];

        if (! $user->role) {
            return $own;
        }

        $granted = static::grantedDepartments($user->role, $user->department ?? '');

        return array_values(array_unique(array_merge($own, $granted)));
    }
}
