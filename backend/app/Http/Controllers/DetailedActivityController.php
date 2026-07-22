<?php

namespace App\Http\Controllers;

use App\Models\DetailedActivity;
use App\Models\SubActivity;
use App\Services\AuditLogger;
use App\Models\User;
use Illuminate\Http\Request;

class DetailedActivityController extends Controller
{
    // ─── Role Helpers ────────────────────────────────────────────────────────
    // Reads role from the authenticated Sanctum user (real auth).
    // Null role → fail-safe unauthorized (see HasRole trait).

    private function user(Request $request): User
    {
        return $request->user();
    }

    // ─── GET /sub-activities/{subActivity}/detailed-activities ───────────────

    public function index(Request $request, SubActivity $subActivity)
    {
        $user = $this->user($request);
        $query = $subActivity->detailedActivities();

        // Client sees only explicitly shared tasks (role scope applied first)
        if ($user->isClient()) {
            $query->where('client_visible', true);
        }

        return $query->get();
    }

    // ─── POST /sub-activities/{subActivity}/detailed-activities ─────────────

    public function store(Request $request, SubActivity $subActivity)
    {
        $user = $this->user($request);

        if (!$user->canWrite()) {
            AuditLogger::denied($request, 'task.create', 'detailed_activity');
            return response()->json(['message' => 'Unauthorized: Only Admin, Project Manager, and Team Member roles can create tasks.'], 403);
        }

        $validated = $request->validate([
            'code'             => 'nullable|string|max:50',
            'name'             => 'required|string|max:255',
            'type'             => 'nullable|string|max:50',
            'description'      => 'nullable|string',
            'notes'            => 'nullable|string',
            'output'           => 'nullable|string',
            'responsible'      => 'nullable|string|max:255',
            'support'          => 'nullable|string|max:255',
            'duration_months'  => 'integer|min:0',
            'duration_days'    => 'integer|min:0',
            'plan_start_date'  => 'nullable|date',
            'plan_end_date'    => 'nullable|date',
            'actual_start_date'=> 'nullable|date',
            'actual_end_date'  => 'nullable|date',
            'status'           => 'in:backlog,not_started,in_progress,for_review,completed,blocked,delayed',
            'progress'         => 'integer|min:0|max:100',
            'sort_order'       => 'integer|min:0',
            'client_visible'   => 'boolean',
        ]);

        // Only PM/Admin can set client_visible; Team Member always gets false
        if (!$user->isPmOrAdmin()) {
            $validated['client_visible'] = false;
        }

        $task = $subActivity->detailedActivities()->create($validated);

        AuditLogger::record(
            $request,
            'task.created',
            'detailed_activity',
            $task->id,
            "Task \"{$task->name}\" created.",
            ['task_name' => $task->name, 'status' => $task->status, 'client_visible' => $task->client_visible]
        );

        // Assignment notification
        if ($task->responsible) {
            $targetRole = \App\Models\Notification::resolveRoleFromResponsible($task->responsible);
            if ($targetRole) {
                $eventKey = "assignment:task:{$task->id}:{$targetRole}";
                \App\Models\Notification::sendNotification(
                    $targetRole,
                    \App\Models\Notification::TYPE_ASSIGNMENT,
                    \App\Models\Notification::SEVERITY_INFO,
                    "New Task Assignment",
                    "You have been assigned to task: \"{$task->name}\".",
                    $task->id,
                    "/kanban?task={$task->id}",
                    $eventKey
                );
            }
        }

        return $task;
    }

    // ─── GET /detailed-activities/{detailedActivity} ─────────────────────────

    public function show(Request $request, DetailedActivity $detailedActivity)
    {
        $user = $this->user($request);

        // Client can only see client_visible tasks
        if ($user->isClient() && !$detailedActivity->client_visible) {
            return response()->json(['message' => 'Access denied.'], 403);
        }

        return $detailedActivity;
    }

    // ─── PUT /detailed-activities/{detailedActivity} ─────────────────────────

    public function update(Request $request, DetailedActivity $detailedActivity)
    {
        $user = $this->user($request);

        if (!$user->canWrite()) {
            AuditLogger::denied($request, 'task.update', 'detailed_activity', $detailedActivity->id);
            return response()->json(['message' => 'Unauthorized: Only Admin, Project Manager, and Team Member roles can update tasks.'], 403);
        }

        // Team Members cannot touch governance-sensitive fields. The 10
        // Support Ops fields are included here (not just base fields) since
        // Team Members are the primary people expected to actually work
        // support tickets day to day — see specs/002-support-ops-tracker/plan.md.
        $allowedForTeamMember = [
            'status', 'progress', 'notes', 'output',
            'actual_start_date', 'actual_end_date',
            'work_type', 'client_name', 'tenant_name', 'channel',
            'client_priority', 'last_client_update_at', 'next_action',
            'evidence', 'root_cause', 'resolution',
        ];

        if ($user->isTeamMember()) {
            $request->replace($request->only($allowedForTeamMember));
        }

        $validated = $request->validate([
            'code'             => 'nullable|string|max:50',
            'name'             => 'sometimes|string|max:255',
            'type'             => 'nullable|string|max:50',
            'description'      => 'nullable|string',
            'notes'            => 'nullable|string',
            'output'           => 'nullable|string',
            'responsible'      => 'nullable|string|max:255',
            'support'          => 'nullable|string|max:255',
            'duration_months'  => 'integer|min:0',
            'duration_days'    => 'integer|min:0',
            'plan_start_date'  => 'nullable|date',
            'plan_end_date'    => 'nullable|date',
            'actual_start_date'=> 'nullable|date',
            'actual_end_date'  => 'nullable|date',
            'status'           => 'in:backlog,not_started,in_progress,for_review,completed,blocked,delayed',
            'progress'         => 'integer|min:0|max:100',
            'sort_order'       => 'integer|min:0',
            'client_visible'   => 'boolean',
            'work_type'            => 'nullable|in:project,support,bug,feature,learning,admin',
            'client_name'          => 'nullable|string|max:255',
            'tenant_name'          => 'nullable|string|max:255',
            'channel'              => 'nullable|string|max:255',
            'client_priority'      => 'nullable|in:P1,P2,P3',
            'last_client_update_at'=> 'nullable|date',
            'next_action'          => 'nullable|string',
            'evidence'             => 'nullable|string',
            'root_cause'           => 'nullable|string',
            'resolution'           => 'nullable|string',
        ]);

        // Only PM/Admin can change client_visible
        if (isset($validated['client_visible']) && !$user->isPmOrAdmin()) {
            unset($validated['client_visible']);
        }

        $oldStatus      = $detailedActivity->status;
        $oldResponsible = $detailedActivity->responsible;
        $oldClientVisible = $detailedActivity->client_visible;

        $detailedActivity->update($validated);

        // Audit: status changed
        if (isset($validated['status']) && $validated['status'] !== $oldStatus) {
            AuditLogger::record(
                $request,
                'task.status_changed',
                'detailed_activity',
                $detailedActivity->id,
                "Task \"{$detailedActivity->name}\" status changed from \"{$oldStatus}\" to \"{$validated['status']}\".",
                ['old_status' => $oldStatus, 'new_status' => $validated['status'], 'task_name' => $detailedActivity->name]
            );
        }

        // Audit: client visibility changed
        if (isset($validated['client_visible']) && $validated['client_visible'] !== $oldClientVisible) {
            AuditLogger::record(
                $request,
                'task.client_visibility_changed',
                'detailed_activity',
                $detailedActivity->id,
                "Task \"{$detailedActivity->name}\" client visibility changed to " . ($validated['client_visible'] ? 'visible' : 'hidden') . ".",
                [
                    'old_client_visible' => $oldClientVisible,
                    'new_client_visible' => $validated['client_visible'],
                    'task_title'         => $detailedActivity->name,
                ]
            );
        }

        // Audit: general update (if no specific sub-events already fired)
        if (!isset($validated['status']) && !isset($validated['client_visible'])) {
            AuditLogger::record(
                $request,
                'task.updated',
                'detailed_activity',
                $detailedActivity->id,
                "Task \"{$detailedActivity->name}\" updated.",
                ['changed_fields' => array_keys($validated)]
            );
        }

        // Notification: assignment changed
        if ($detailedActivity->responsible && $detailedActivity->responsible !== $oldResponsible) {
            $targetRole = \App\Models\Notification::resolveRoleFromResponsible($detailedActivity->responsible);
            if ($targetRole) {
                $eventKey = "assignment:task:{$detailedActivity->id}:{$targetRole}";
                \App\Models\Notification::sendNotification(
                    $targetRole,
                    \App\Models\Notification::TYPE_ASSIGNMENT,
                    \App\Models\Notification::SEVERITY_INFO,
                    "Task Assignment Updated",
                    "You have been assigned to task: \"{$detailedActivity->name}\".",
                    $detailedActivity->id,
                    "/kanban?task={$detailedActivity->id}",
                    $eventKey
                );
            }
        }

        // Notification: task blocked
        if ($detailedActivity->status === 'blocked' && $oldStatus !== 'blocked') {
            $pmRole   = 'Project Manager';
            $eventKey = "blocked:task:{$detailedActivity->id}:{$pmRole}";
            \App\Models\Notification::sendNotification(
                $pmRole,
                \App\Models\Notification::TYPE_BLOCKED,
                \App\Models\Notification::SEVERITY_CRITICAL,
                "Task Blocked Alert",
                "Task \"{$detailedActivity->name}\" has been marked as BLOCKED.",
                $detailedActivity->id,
                "/kanban?task={$detailedActivity->id}",
                $eventKey
            );
        }

        return $detailedActivity;
    }

    // ─── DELETE /detailed-activities/{detailedActivity} ──────────────────────

    public function destroy(Request $request, DetailedActivity $detailedActivity)
    {
        $user = $this->user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'task.delete', 'detailed_activity', $detailedActivity->id);
            return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can delete tasks.'], 403);
        }

        AuditLogger::record(
            $request,
            'task.deleted',
            'detailed_activity',
            $detailedActivity->id,
            "Task \"{$detailedActivity->name}\" deleted.",
            ['task_name' => $detailedActivity->name]
        );

        $detailedActivity->delete();
        return response()->noContent();
    }
}
