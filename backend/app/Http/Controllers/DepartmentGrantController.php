<?php

namespace App\Http\Controllers;

use App\Models\DepartmentGrant;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DepartmentGrantController extends Controller
{
    /**
     * GET /api/department-grants
     * Admin-only list of all grants.
     */
    public function index(Request $request)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'manage_department_grants', 'department_grant');
            return response()->json(['message' => 'Unauthorized: Only Admins can manage department grants.'], 403);
        }

        return response()->json(DepartmentGrant::orderBy('grantee_department')->get());
    }

    /**
     * POST /api/department-grants
     * Admin creates a cross-department visibility grant.
     */
    public function store(Request $request)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'manage_department_grants', 'department_grant');
            return response()->json(['message' => 'Unauthorized: Only Admins can manage department grants.'], 403);
        }

        $validated = $request->validate([
            'grantee_role'        => ['required', 'string', 'in:Department Head,Project Manager,Team Member'],
            'grantee_department'  => ['required', 'string', 'max:100'],
            'granted_department'  => [
                'required',
                'string',
                'max:100',
                Rule::unique('department_grants')
                    ->where('grantee_role', $request->input('grantee_role'))
                    ->where('grantee_department', $request->input('grantee_department')),
            ],
        ]);

        $grant = DepartmentGrant::create([
            ...$validated,
            'granted_by_role'    => $user->role,
            'granted_by_user_id' => $user->id,
        ]);

        AuditLogger::record(
            $request,
            'department_grant.created',
            'department_grant',
            $grant->id,
            "Granted {$grant->grantee_role} of {$grant->grantee_department} access to {$grant->granted_department} projects.",
            [
                'grantee_role'       => $grant->grantee_role,
                'grantee_department' => $grant->grantee_department,
                'granted_department' => $grant->granted_department,
            ]
        );

        return response()->json($grant, 201);
    }

    /**
     * DELETE /api/department-grants/{grant}
     * Admin revokes a grant.
     */
    public function destroy(Request $request, DepartmentGrant $departmentGrant)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'manage_department_grants', 'department_grant');
            return response()->json(['message' => 'Unauthorized: Only Admins can manage department grants.'], 403);
        }

        AuditLogger::record(
            $request,
            'department_grant.deleted',
            'department_grant',
            $departmentGrant->id,
            "Revoked {$departmentGrant->grantee_role} of {$departmentGrant->grantee_department} access to {$departmentGrant->granted_department} projects.",
            [
                'grantee_role'       => $departmentGrant->grantee_role,
                'grantee_department' => $departmentGrant->grantee_department,
                'granted_department' => $departmentGrant->granted_department,
            ]
        );

        $departmentGrant->delete();

        return response()->noContent();
    }

    private function user(Request $request): User
    {
        return $request->user();
    }
}
