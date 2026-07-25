<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;

/**
 * 007-permission-hardening: the single seam every read-scoping check
 * resolves the acting user through, instead of calling $request->user()
 * directly. Deliberately a two-line accessor with no lookup logic or side
 * effects of its own — ResolvePreviewSession middleware (US2) is what
 * validates a presented preview token and attaches its target here, before
 * any controller runs. That split is what guarantees an invalid/expired
 * preview token can never leak into a response mixed with real domain
 * data (research.md).
 *
 * Writes and audit logging never call this — they always use the real
 * $request->user(), so Sanctum's actual authenticated subject (and every
 * audit log's actor_*) stays the real Admin throughout a preview session.
 */
class AccessContext
{
    public static function user(Request $request): User
    {
        return $request->attributes->get('preview_target') ?? $request->user();
    }
}
