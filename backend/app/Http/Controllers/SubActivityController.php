<?php

namespace App\Http\Controllers;

use App\Models\SubActivity;
use App\Models\Activity;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class SubActivityController extends Controller
{
    // ─── Role Helpers ────────────────────────────────────────────────────────
    // Reads role/department from the authenticated Sanctum user (real auth).
    // Null role → fail-safe unauthorized (see HasRole trait).

    private function user(Request $request): User
    {
        return $request->user();
    }

    // ─── GET /api/activities/{activity}/sub-activities ────────────────────

    public function index(Activity $activity)
    {
        return $activity->subActivities()->with('detailedActivities')->get();
    }

    // ─── POST /api/activities/{activity}/sub-activities ───────────────────

    public function store(Request $request, Activity $activity)
    {
        $user = $this->user($request);

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
            $subActivity->toArray()
        );

        return $subActivity;
    }

    // ─── GET /api/sub-activities/{subActivity} ──────────────────────────────

    public function show(SubActivity $subActivity)
    {
        return $subActivity->load('detailedActivities');
    }

    // ─── PATCH /api/sub-activities/{subActivity} ───────────────────────────

    public function update(Request $request, SubActivity $subActivity)
    {
        $user = $this->user($request);

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
            $subActivity->getChanges()
        );

        return $subActivity;
    }

    // ─── DELETE /api/sub-activities/{subActivity} ──────────────────────────

    public function destroy(Request $request, SubActivity $subActivity)
    {
        $user = $this->user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'sub_activity.delete', 'sub_activity', $subActivity->id);
            return response()->json(['message' => 'Unauthorized: Only Admin and Project Manager roles can delete sub-activities.'], 403);
        }

        $subActivityId = $subActivity->id;
        $subActivity->delete();

        AuditLogger::record(
            $request,
            'sub_activity.deleted',
            'sub_activity',
            $subActivityId,
            ['id' => $subActivityId]
        );

        return response()->noContent();
    }
}