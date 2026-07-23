<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Global disabled-account gate (006-real-user-management, FR-005/SC-002).
 * Applied alongside `auth:sanctum` on the entire authenticated route group
 * in bootstrap/app.php — not scoped to this feature's own endpoints — so a
 * disabled account loses access on its very next request, including
 * `/api/me`, not just future login attempts.
 *
 * Returns 401, not 403 (research.md): `frontend/src/lib/api.js` already has
 * a response interceptor whose own comment names "disabled account" as a
 * reason it exists — any 401 clears the signed-in user client-side and
 * `RequireAuth` redirects to `/login`. Reusing that means zero new
 * frontend error-handling code for this feature.
 */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && !$user->is_active) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        return $next($request);
    }
}
