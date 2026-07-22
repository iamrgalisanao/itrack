<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * POST /api/login
     *
     * Authenticates a user via email + password. On success the session is
     * regenerated (anti-fixation) and a curated user payload is returned.
     * The SPA must call GET /sanctum/csrf-cookie before this endpoint so
     * that the CSRF token is set in the cookie.
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($request->only('email', 'password'))) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return response()->json([
            'user' => $this->curatedUser(Auth::user()),
        ]);
    }

    /**
     * GET /api/me
     *
     * Returns the authenticated user's curated profile.
     * Protected by auth:sanctum — returns 401 when unauthenticated.
     */
    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $this->curatedUser($request->user()),
        ]);
    }

    /**
     * POST /api/logout
     *
     * Invalidates the session and regenerates the CSRF token.
     * Protected by auth:sanctum.
     */
    public function logout(Request $request): Response
    {
        if ($request->hasSession()) {
            Auth::guard('web')->logout();

            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->noContent();
    }

    /**
     * Return only the safe subset of user fields to the frontend.
     * Never expose password, remember_token, or internal metadata.
     */
    private function curatedUser(User $user): array
    {
        return [
            'id'         => $user->id,
            'name'       => $user->name,
            'email'      => $user->email,
            'role'       => $user->role,
            'department' => $user->department,
        ];
    }
}
