<?php

namespace App\Http\Controllers;

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

        $query = AuditLog::orderByDesc('created_at');

        if ($request->filled('action')) {
            $query->where('action', $request->input('action'));
        }
        if ($request->filled('entity_type')) {
            $query->where('entity_type', $request->input('entity_type'));
        }
        if ($request->filled('actor_role')) {
            $query->where('actor_role', $request->input('actor_role'));
        }
        if ($request->filled('actor_dept')) {
            $query->where('actor_dept', $request->input('actor_dept'));
        }
        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->input('date_to'));
        }

        $perPage = min((int) $request->input('per_page', 50), 200);

        return response()->json($query->paginate($perPage));
    }

    private function user(Request $request): User
    {
        return $request->user();
    }
}
