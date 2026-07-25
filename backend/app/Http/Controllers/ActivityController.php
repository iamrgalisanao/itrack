<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\Module;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\AccessContext;
use Illuminate\Http\Request;

class ActivityController extends Controller
{
    // ─── Role Helpers ────────────────────────────────────────────────────────
    // Resolves the acting user via AccessContext (007-permission-hardening)
    // so every check below is preview-aware, not just $request->user()'s
    // real Sanctum identity. Null role → fail-safe unauthorized (HasRole trait).

    private function user(Request $request): User
    {
        return AccessContext::user($request);
    }

    // ─── GET /api/modules/{module}/activities ───────────────────────────────

    public function index(Request $request, Module $module)
    {
        if (!($module->isAccessibleTo($this->user($request)))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        return $module->activities()->with('subActivities')->get();
    }

    // ─── POST /api/modules/{module}/activities ──────────────────────────────

    public function store(Request $request, Module $module)
    {
        $user = $this->user($request);

        if (!($module->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if (!$user->canWrite()) {
            AuditLogger::denied($request, 'activity.create', 'activity');
            return response()->json(['message' => 'Unauthorized: Only Admin, Project Manager, and Team Member roles can create activities.'], 403);
        }

        $validated = $request->validate([
            'code' => 'nullable|string|max:50',
            'name' => 'required|string|max:255',
            'type' => 'nullable|string|max:50',
            'description' => 'nullable|string',
            'output' => 'nullable|string',
            'responsible' => 'nullable|string|max:255',
            'support' => 'nullable|string|max:255',
            'duration_months' => 'integer|min:0',
            'duration_days' => 'integer|min:0',
            'plan_start_date' => 'nullable|date',
            'plan_end_date' => 'nullable|date',
            'sort_order' => 'integer|min:0',
        ]);

        $activity = $module->activities()->create($validated);

        AuditLogger::record(
            $request,
            'activity.created',
            'activity',
            $activity->id,
            null,
            $activity->toArray()
        );

        return $activity;
    }

    // ─── GET /api/activities/{activity} ──────────────────────────────────────

    public function show(Request $request, Activity $activity)
    {
        if (!($activity->isAccessibleTo($this->user($request)))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        return $activity->load('subActivities');
    }

    // ─── PATCH /api/activities/{activity} ───────────────────────────────────

    public function update(Request $request, Activity $activity)
    {
        $user = $this->user($request);

        if (!($activity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if (!$user->canWrite()) {
            AuditLogger::denied($request, 'activity.update', 'activity', $activity->id);
            return response()->json(['message' => 'Unauthorized: Only Admin, Project Manager, and Team Member roles can update activities.'], 403);
        }

        $validated = $request->validate([
            'code' => 'nullable|string|max:50',
            'name' => 'sometimes|string|max:255',
            'type' => 'nullable|string|max:50',
            'description' => 'nullable|string',
            'output' => 'nullable|string',
            'responsible' => 'nullable|string|max:255',
            'support' => 'nullable|string|max:255',
            'duration_months' => 'integer|min:0',
            'duration_days' => 'integer|min:0',
            'plan_start_date' => 'nullable|date',
            'plan_end_date' => 'nullable|date',
            'sort_order' => 'integer|min:0',
        ]);

        $activity->update($validated);

        AuditLogger::record(
            $request,
            'activity.updated',
            'activity',
            $activity->id,
            null,
            $activity->getChanges()
        );

        return $activity;
    }

    // ─── DELETE /api/activities/{activity} ──────────────────────────────────

    public function destroy(Request $request, Activity $activity)
    {
        $user = $this->user($request);

        if (!($activity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'activity.delete', 'activity', $activity->id);
            return response()->json(['message' => 'Unauthorized: Only Admin and Project Manager roles can delete activities.'], 403);
        }

        $activityId = $activity->id;
        $activity->delete();

        AuditLogger::record(
            $request,
            'activity.deleted',
            'activity',
            $activityId,
            null,
            ['id' => $activityId]
        );

        return response()->noContent();
    }
}