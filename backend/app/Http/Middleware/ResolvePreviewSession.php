<?php

namespace App\Http\Middleware;

use App\Models\PreviewSession;
use App\Services\AuditLogger;
use Closure;
use Illuminate\Http\Request;

/**
 * 007-permission-hardening: validates a presented X-Preview-Session token
 * before any controller runs. A valid token attaches its target user to
 * the request (read by AccessContext); an invalid one short-circuits with
 * 409 and NO domain data at all — this is what guarantees a "preview just
 * ended" response can never be mixed with real data from either identity
 * (research.md's decision on why validation lives here, not in
 * AccessContext).
 */
class ResolvePreviewSession
{
    public function handle(Request $request, Closure $next)
    {
        $token = $request->header('X-Preview-Session');
        if (!$token) {
            return $next($request);
        }

        $session = PreviewSession::where('token', $token)
            ->where('admin_user_id', $request->user()->id)
            ->first();
        $reason = $session?->invalidReason();

        if ($session === null || $reason !== null) {
            if ($session !== null && $session->ended_at === null) {
                $session->update(['ended_at' => now()]);
                AuditLogger::record(
                    $request,
                    'preview.ended',
                    'preview_session',
                    $session->id,
                    null,
                    ['target_user_id' => $session->target_user_id, 'reason' => $reason]
                );
            }

            return response()->json([
                'message' => 'Preview session ended.',
                'reason'  => $reason ?? 'not_found',
            ], 409)->header('X-Preview-Ended', '1');
        }

        $request->attributes->set('preview_target', $session->target);

        return $next($request);
    }
}
