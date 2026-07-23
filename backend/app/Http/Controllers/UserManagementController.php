<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * Admin-only CRUD for real User accounts (006-real-user-management).
 * AuthController owns the acting user's own session lifecycle
 * (login/me/logout); this controller manages *other* users' accounts.
 */
class UserManagementController extends Controller
{
    private const DEPARTMENT_REQUIRED_ROLES = [
        User::ROLE_TEAM_MEMBER,
        User::ROLE_DEPARTMENT_HEAD,
        User::ROLE_CLIENT,
    ];

    private function user(Request $request): User
    {
        return $request->user();
    }

    private function denyUnlessAdmin(Request $request)
    {
        $user = $this->user($request);
        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'user.manage', 'user');
            return response()->json(['message' => 'Unauthorized: Only Admins can manage users.'], 403);
        }
        return null;
    }

    // ─── GET /api/users ──────────────────────────────────────────────────────
    public function index(Request $request)
    {
        if ($denied = $this->denyUnlessAdmin($request)) {
            return $denied;
        }

        $validated = $request->validate([
            'search' => 'nullable|string',
            'role' => 'nullable|in:' . implode(',', User::validRoles()),
            'department' => 'nullable|string',
            'status' => 'nullable|in:active,disabled',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $query = User::query();

        if (!empty($validated['search'])) {
            $search = $validated['search'];
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }
        if (!empty($validated['role'])) {
            $query->where('role', $validated['role']);
        }
        if (!empty($validated['department'])) {
            $query->where('department', $validated['department']);
        }
        if (!empty($validated['status'])) {
            $query->where('is_active', $validated['status'] === 'active');
        }

        $perPage = $validated['per_page'] ?? 15;

        return UserResource::collection($query->orderBy('name')->paginate($perPage));
    }

    // ─── POST /api/users ─────────────────────────────────────────────────────
    public function store(Request $request)
    {
        if ($denied = $this->denyUnlessAdmin($request)) {
            return $denied;
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
            'role' => 'required|in:' . implode(',', User::validRoles()),
            'department' => [
                Rule::requiredIf(in_array($request->input('role'), self::DEPARTMENT_REQUIRED_ROLES, true)),
                'nullable',
                'string',
                'max:255',
            ],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($validated['password']),
            'role' => $validated['role'],
            'department' => $validated['department'] ?? null,
            'is_active' => true,
        ]);

        AuditLogger::record(
            $request,
            'user.created',
            'user',
            $user->id,
            "User \"{$user->name}\" created with role \"{$user->role}\".",
            ['role' => $user->role, 'department' => $user->department]
        );

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    // ─── PATCH /api/users/{user} ─────────────────────────────────────────────
    public function update(Request $request, User $user)
    {
        if ($denied = $this->denyUnlessAdmin($request)) {
            return $denied;
        }

        // is_active and password are never validated/accepted here — silently
        // ignored even if present in the raw request body (research.md).
        // Status changes go through disable()/reactivate(); password
        // changes through resetPassword().
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => ['sometimes', 'required', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'role' => 'sometimes|required|in:' . implode(',', User::validRoles()),
            'department' => 'sometimes|nullable|string|max:255',
        ]);

        $changedFields = [];
        $oldValues = [];
        $newValues = [];
        foreach ($validated as $field => $newValue) {
            if ($user->{$field} != $newValue) {
                $changedFields[] = $field;
                $oldValues[$field] = $user->{$field};
                $newValues[$field] = $newValue;
            }
        }

        // The last-Admin check and the write happen inside the same
        // transaction — the lock wouldLeaveNoEnabledAdmins() takes must
        // still be held when update() runs, or a concurrent request could
        // slip through between the check and the write (research.md).
        $blocked = false;
        DB::transaction(function () use ($user, $validated, &$blocked) {
            if (isset($validated['role']) && $user->wouldLeaveNoEnabledAdmins(['role' => $validated['role']])) {
                $blocked = true;
                return;
            }
            $user->update($validated);
        });

        if ($blocked) {
            return response()->json(['message' => 'At least one enabled Admin must remain.'], 422);
        }

        if (!empty($changedFields)) {
            AuditLogger::record(
                $request,
                'user.updated',
                'user',
                $user->id,
                "User \"{$user->name}\" updated.",
                ['changed_fields' => $changedFields, 'old' => $oldValues, 'new' => $newValues]
            );
        }

        return new UserResource($user->fresh());
    }

    // ─── POST /api/users/{user}/disable ──────────────────────────────────────
    public function disable(Request $request, User $user)
    {
        if ($denied = $this->denyUnlessAdmin($request)) {
            return $denied;
        }

        // Same locked-transaction shape as update() above — check and
        // write must share one lock (research.md).
        $blocked = false;
        DB::transaction(function () use ($user, &$blocked) {
            if ($user->wouldLeaveNoEnabledAdmins(['is_active' => false])) {
                $blocked = true;
                return;
            }
            $user->update(['is_active' => false]);
        });

        if ($blocked) {
            return response()->json(['message' => 'At least one enabled Admin must remain.'], 422);
        }

        AuditLogger::record(
            $request,
            'user.disabled',
            'user',
            $user->id,
            "User \"{$user->name}\" disabled.",
            []
        );

        return new UserResource($user->fresh());
    }

    // ─── POST /api/users/{user}/reactivate ───────────────────────────────────
    public function reactivate(Request $request, User $user)
    {
        if ($denied = $this->denyUnlessAdmin($request)) {
            return $denied;
        }

        $user->update(['is_active' => true]);

        AuditLogger::record(
            $request,
            'user.reactivated',
            'user',
            $user->id,
            "User \"{$user->name}\" reactivated.",
            []
        );

        return new UserResource($user->fresh());
    }

    // ─── POST /api/users/{user}/reset-password ───────────────────────────────
    public function resetPassword(Request $request, User $user)
    {
        if ($denied = $this->denyUnlessAdmin($request)) {
            return $denied;
        }

        $validated = $request->validate([
            'password' => 'required|string|min:8|confirmed',
        ]);

        $user->update(['password' => Hash::make($validated['password'])]);

        AuditLogger::record(
            $request,
            'user.password_reset',
            'user',
            $user->id,
            "Password reset for user \"{$user->name}\".",
            []
        );

        return response()->json(['message' => 'Password reset.']);
    }
}
