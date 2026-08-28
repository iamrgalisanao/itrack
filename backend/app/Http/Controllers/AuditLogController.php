<?php

namespace App\Http\Controllers;

use App\Support\AccessContext;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /**
     * GET /api/audit-logs
     * Admin-only. Returns paginated audit log entries, newest first.
     *
     * Query params:
     *   action, entity_type, actor_role, actor_dept, date_from, date_to
     *   page, per_page (default 50)
     */
    public function index(Request $request)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            return response()->json(['message' => 'Unauthorized: Audit logs are restricted to Admin users.'], 403);
        }

        $validated = $request->validate([
            'action' => ['sometimes', 'string', 'max:255'],
            'entity_type' => ['sometimes', 'string', 'max:255'],
            'actor_role' => ['sometimes', 'string', 'max:255'],
            'actor_dept' => ['sometimes', 'nullable', 'string', 'max:255'],
            'client_organization_id' => ['sometimes', 'integer'],
            'project_id' => ['sometimes', 'integer'],
            'membership_user_id' => ['sometimes', 'integer'],
            'date_from' => ['sometimes', 'date'],
            'date_to' => ['sometimes', 'date'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        $query = AuditLog::orderByDesc('created_at');

        if (isset($validated['action'])) {
            $query->where('action', $validated['action']);
        }
        if (isset($validated['entity_type'])) {
            $query->where('entity_type', $validated['entity_type']);
        }
        if (isset($validated['actor_role'])) {
            $query->where('actor_role', $validated['actor_role']);
        }
        if (array_key_exists('actor_dept', $validated)) {
            $query->where('actor_dept', $validated['actor_dept']);
        }
        if (isset($validated['client_organization_id'])) {
            $this->whereMetadataValue($query, 'client_organization_id', $validated['client_organization_id']);
        }
        if (isset($validated['project_id'])) {
            $this->whereMetadataValue($query, 'project_id', $validated['project_id']);
        }
        if (isset($validated['membership_user_id'])) {
            $this->whereMetadataValue($query, 'membership_user_id', $validated['membership_user_id']);
        }
        if (isset($validated['date_from'])) {
            $query->whereDate('created_at', '>=', $validated['date_from']);
        }
        if (isset($validated['date_to'])) {
            $query->whereDate('created_at', '<=', $validated['date_to']);
        }

        $perPage = $validated['per_page'] ?? 50;

        return response()->json($query->paginate($perPage));
    }

    /**
     * Preview-aware, deliberately.
     *
     * This returned `$request->user()`, so an Admin previewing as a Client
     * passed every role gate below as the Admin -- preview answering "what does
     * this client see" in the PERMISSIVE direction, which is the one direction
     * that makes it worse than useless. Eleven routes diverged; this was one.
     *
     * Safe for writes without a second helper: `BlockWritesDuringPreview`
     * rejects every non-GET while a preview session is attached, so no write
     * ever runs with a preview target in scope and `AccessContext::user()`
     * returns `$request->user()` identically there. Audit identity is unaffected
     * either way -- `AuditLogger::record` reads `$request->user()` off the
     * request itself (AuditLogger.php:47), never this helper.
     */
    private function user(Request $request): User
    {
        return AccessContext::user($request);
    }

    private function whereMetadataValue($query, string $key, int $value): void
    {
        if ($query->getConnection()->getDriverName() === 'sqlite') {
            $query->whereRaw("json_extract(metadata, '$.{$key}') = ?", [$value]);
            return;
        }

        $query->where("metadata->{$key}", $value);
    }
}
