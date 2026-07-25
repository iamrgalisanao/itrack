<?php

namespace App\Http\Controllers;

use App\Http\Resources\PreviewSessionResource;
use App\Models\PreviewSession;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PreviewSessionController extends Controller
{
    /**
     * POST /api/preview-sessions
     * Admin-only. Starts a read-only preview session as a specific user.
     * Ends any prior active session for this Admin first (data-model.md —
     * at most one active preview per Admin). Exempt from
     * BlockWritesDuringPreview so this replace-in-place works even while a
     * preview is already active (research.md, round-3 review point 1).
     */
    public function store(Request $request)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'preview.start', 'preview_session');
            return response()->json(['message' => 'Unauthorized: Only Admins can start a preview session.'], 403);
        }

        $validated = $request->validate([
            'target_user_id' => ['required', 'integer', Rule::exists('users', 'id')],
        ]);

        $target = User::findOrFail($validated['target_user_id']);

        if ($target->isAdmin()) {
            return response()->json(['message' => 'Cannot preview as another Admin.'], 422);
        }
        if (!$target->is_active) {
            return response()->json(['message' => 'Cannot preview as a disabled account.'], 422);
        }

        $existing = PreviewSession::where('admin_user_id', $user->id)->whereNull('ended_at')->first();
        if ($existing) {
            $existing->update(['ended_at' => now()]);
            AuditLogger::record(
                $request,
                'preview.ended',
                'preview_session',
                $existing->id,
                null,
                ['target_user_id' => $existing->target_user_id, 'reason' => 'manual']
            );
        }

        $session = PreviewSession::create([
            'admin_user_id'        => $user->id,
            'target_user_id'       => $target->id,
            'target_role_at_start' => $target->role,
            'token'                => Str::random(64),
            'started_at'           => now(),
            'expires_at'           => now()->addHours(2),
        ]);

        AuditLogger::record(
            $request,
            'preview.started',
            'preview_session',
            $session->id,
            null,
            ['target_user_id' => $target->id]
        );

        return (new PreviewSessionResource($session->load('target')))->response()->setStatusCode(201);
    }

    /**
     * DELETE /api/preview-sessions/current
     * Ends the preview session identified by the presented X-Preview-Session
     * header. By the time this runs, ResolvePreviewSession has already
     * validated the token (an invalid one would have short-circuited with
     * 409 before reaching here), so a lookup failure here means no header
     * was presented at all.
     */
    public function destroy(Request $request)
    {
        $user = $this->user($request);
        $token = $request->header('X-Preview-Session');

        $session = $token
            ? PreviewSession::where('token', $token)->where('admin_user_id', $user->id)->whereNull('ended_at')->first()
            : null;

        if (!$session) {
            return response()->json(['message' => 'No active preview session found.'], 404);
        }

        $session->update(['ended_at' => now()]);

        AuditLogger::record(
            $request,
            'preview.ended',
            'preview_session',
            $session->id,
            null,
            ['target_user_id' => $session->target_user_id, 'reason' => 'manual']
        );

        return response()->noContent();
    }

    private function user(Request $request): User
    {
        return $request->user();
    }
}
