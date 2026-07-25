<?php

namespace App\Http\Middleware;

use App\Services\AuditLogger;
use Closure;
use Illuminate\Http\Request;

/**
 * 007-permission-hardening (FR-007): rejects every non-GET request while a
 * valid preview session is active (i.e. ResolvePreviewSession — which runs
 * before this — has attached a preview_target to the request), before any
 * controller runs. Exempted: starting a replacement preview and ending the
 * current one aren't "writes" in this sense (research.md), and logout must
 * always work.
 */
class BlockWritesDuringPreview
{
    public function handle(Request $request, Closure $next)
    {
        $previewTarget = $request->attributes->get('preview_target');

        if ($previewTarget === null || $request->isMethod('get') || $this->isExempt($request)) {
            return $next($request);
        }

        AuditLogger::record(
            $request,
            'preview.write_blocked',
            'preview_session',
            null,
            null,
            [
                'target_user_id'   => $previewTarget->id,
                'attempted_method' => $request->method(),
                'attempted_path'   => $request->path(),
            ]
        );

        return response()->json(['message' => 'Write operations are disabled while previewing.'], 403);
    }

    private function isExempt(Request $request): bool
    {
        if ($request->is('api/logout')) {
            return true;
        }
        if ($request->is('api/preview-sessions') && $request->isMethod('post')) {
            return true;
        }
        if ($request->is('api/preview-sessions/current') && $request->isMethod('delete')) {
            return true;
        }

        return false;
    }
}
