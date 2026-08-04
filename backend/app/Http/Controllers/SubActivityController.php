<?php

namespace App\Http\Controllers;

use App\Models\SubActivity;
use App\Models\Activity;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\AccessContext;
use Illuminate\Http\Request;

class SubActivityController extends Controller
{
    // ─── Role Helpers ────────────────────────────────────────────────────────
    // Resolves the acting user via AccessContext (007-permission-hardening)
    // so every check below is preview-aware, not just $request->user()'s
    // real Sanctum identity. Null role → fail-safe unauthorized (HasRole trait).

    private function user(Request $request): User
    {
        return AccessContext::user($request);
    }

    // ─── GET /api/activities/{activity}/sub-activities ────────────────────

    public function index(Request $request, Activity $activity)
    {
        if (!($activity->isAccessibleTo($this->user($request)))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        return $activity->subActivities()->with('detailedActivities')->get();
    }

    // ─── POST /api/activities/{activity}/sub-activities ───────────────────

    public function store(Request $request, Activity $activity)
    {
        $user = $this->user($request);

        if (!($activity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if (!$user->canWrite()) {
            AuditLogger::denied($request, 'sub_activity.create', 'sub_activity');
            return response()->json(['message' => 'Unauthorized: Only Admin, Project Manager, and Team Member roles can create sub-activities.'], 403);
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

        $subActivity = $activity->subActivities()->create($validated);

        AuditLogger::record(
            $request,
            'sub_activity.created',
            'sub_activity',
            $subActivity->id,
            null,
            $subActivity->toArray()
        );

        return $subActivity;
    }

    // ─── GET /api/sub-activities/{subActivity} ──────────────────────────────

    public function show(Request $request, SubActivity $subActivity)
    {
        if (!($subActivity->isAccessibleTo($this->user($request)))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        return $subActivity->load('detailedActivities');
    }

    // ─── PATCH /api/sub-activities/{subActivity} ───────────────────────────

    public function update(Request $request, SubActivity $subActivity)
    {
        $user = $this->user($request);

        if (!($subActivity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if (!$user->canWrite()) {
            AuditLogger::denied($request, 'sub_activity.update', 'sub_activity', $subActivity->id);
            return response()->json(['message' => 'Unauthorized: Only Admin, Project Manager, and Team Member roles can update sub-activities.'], 403);
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

        $subActivity->update($validated);

        AuditLogger::record(
            $request,
            'sub_activity.updated',
            'sub_activity',
            $subActivity->id,
            null,
            $subActivity->getChanges()
        );

        return $subActivity;
    }

    // ─── DELETE /api/sub-activities/{subActivity} ──────────────────────────

    public function destroy(Request $request, SubActivity $subActivity)
    {
        $user = $this->user($request);

        if (!($subActivity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'sub_activity.delete', 'sub_activity', $subActivity->id);
            return response()->json(['message' => 'Unauthorized: Only Admin and Project Manager roles can delete sub-activities.'], 403);
        }

        // 018-taskboard data-model.md: "Unclassified Tasks" is a reserved,
        // application-owned container auto-created per Activity — reject
        // deletion while it still holds any DetailedActivity children. An
        // empty SubActivity sharing this name is unaffected.
        if ($subActivity->name === 'Unclassified Tasks' && $subActivity->detailedActivities()->exists()) {
            return response()->json(['message' => 'This SubActivity is reserved for Taskboard and cannot be deleted while it contains tasks.'], 409);
        }

        $subActivityId = $subActivity->id;
        $subActivity->delete();

        AuditLogger::record(
            $request,
            'sub_activity.deleted',
            'sub_activity',
            $subActivityId,
            null,
            ['id' => $subActivityId]
        );

        return response()->noContent();
    }
}