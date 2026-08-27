<?php

namespace App\Http\Controllers;

use App\Http\Resources\DetailedActivityResource;
use App\Models\DetailedActivity;
use App\Models\Notification;
use App\Models\Project;
use App\Models\SubActivity;
use App\Services\AuditLogger;
use App\Models\User;
use App\Support\AccessContext;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class DetailedActivityController extends Controller
{
    // ─── Role Helpers ────────────────────────────────────────────────────────
    // Resolves the acting user via AccessContext (007-permission-hardening)
    // so every check below — including the client_visible filter — is
    // preview-aware, not just $request->user()'s real Sanctum identity.
    // Null role → fail-safe unauthorized (see HasRole trait).

    private function user(Request $request): User
    {
        return AccessContext::user($request);
    }

    /**
     * 018-taskboard data-model.md: assignee_user_id must reference a real,
     * non-Client user — duplicated from TaskboardController rather than
     * extracted, matching this codebase's established preference for small
     * duplication over premature abstraction at two call sites.
     */
    private function internalUserExistsRule(): Exists
    {
        return Rule::exists('users', 'id')->where(fn ($query) => $query->where('role', '!=', User::ROLE_CLIENT));
    }

    private function assigneeHasProjectAccess(?int $assigneeUserId, int $projectId): bool
    {
        if ($assigneeUserId === null) {
            return true;
        }

        $candidate = User::find($assigneeUserId);

        return $candidate !== null
            && Project::query()->accessibleTo($candidate)->whereKey($projectId)->exists();
    }

    private function normalizeSprintLabel(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    // ─── GET /sub-activities/{subActivity}/detailed-activities ───────────────

    public function index(Request $request, SubActivity $subActivity)
    {
        $user = $this->user($request);

        if (!($subActivity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $query = $subActivity->detailedActivities();

        // Client sees only explicitly shared tasks (role scope applied first)
        $query->visibleTo($user);

        return response()->json(
            $query->get()
                ->map(fn (DetailedActivity $task) => DetailedActivityResource::make($task)->resolve($request))
                ->values()
        );
    }

    // ─── POST /sub-activities/{subActivity}/detailed-activities ─────────────

    public function store(Request $request, SubActivity $subActivity)
    {
        $user = $this->user($request);

        if (!($subActivity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

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

        return response()->json(DetailedActivityResource::make($task)->resolve($request), 201);
    }

    // ─── GET /detailed-activities/{detailedActivity} ─────────────────────────

    public function show(Request $request, DetailedActivity $detailedActivity)
    {
        $user = $this->user($request);

        if (!($detailedActivity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        // Client can only see client_visible tasks
        if ($user->isClient() && !$detailedActivity->client_visible) {
            return response()->json(['message' => 'Access denied.'], 403);
        }

        return response()->json(DetailedActivityResource::make($detailedActivity)->resolve($request));
    }

    // ─── PUT /detailed-activities/{detailedActivity} ─────────────────────────

    public function update(Request $request, DetailedActivity $detailedActivity)
    {
        $user = $this->user($request);

        if (!($detailedActivity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

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
            // 018-taskboard: not in $allowedForTeamMember above, so a Team
            // Member's request never reaches this validation with these keys
            // present at all (research.md D3 — stripped before validation,
            // not merely hidden from the response afterward).
            'priority'                => ['nullable', Rule::in(DetailedActivity::PRIORITIES)],
            'estimated_story_points'  => 'nullable|integer|min:0|max:100',
            'sprint_label'            => 'nullable|string|max:100',
            'assignee_user_id'        => ['nullable', 'integer', $this->internalUserExistsRule()],
        ]);

        // Only PM/Admin can change client_visible
        if (isset($validated['client_visible']) && !$user->isPmOrAdmin()) {
            unset($validated['client_visible']);
        }

        if (array_key_exists('assignee_user_id', $validated)) {
            $projectId = $detailedActivity->resolveProjectId();
            if (!$this->assigneeHasProjectAccess($validated['assignee_user_id'], $projectId)) {
                return response()->json(['message' => 'The selected assignee does not have access to this project.'], 422);
            }
        }

        if (array_key_exists('sprint_label', $validated)) {
            $validated['sprint_label'] = $this->normalizeSprintLabel($validated['sprint_label']);
        }

        $oldStatus      = $detailedActivity->status;
        $oldResponsible = $detailedActivity->responsible;
        $oldClientVisible = $detailedActivity->client_visible;
        $oldAssigneeUserId = $detailedActivity->assignee_user_id;

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

        // Notification: Taskboard assignee changed (018-taskboard research.md D5)
        // — distinct from the "responsible" string-based notification above.
        // Fires only when assignee_user_id actually changes to a new non-null
        // value; the event_key is keyed off a persisted AuditLog row id, not
        // a permanent task+recipient pair or a timestamp, so reassigning back
        // to a previous assignee correctly notifies them again.
        if (array_key_exists('assignee_user_id', $validated)
            && $detailedActivity->assignee_user_id !== null
            && $detailedActivity->assignee_user_id !== $oldAssigneeUserId) {
            $auditEntry = AuditLogger::record($request, 'task.assigned', 'detailed_activity', $detailedActivity->id, null, [
                'from' => $oldAssigneeUserId,
                'to' => $detailedActivity->assignee_user_id,
            ]);

            DB::afterCommit(function () use ($detailedActivity, $auditEntry) {
                $recipient = $detailedActivity->assignee;
                if ($recipient) {
                    Notification::sendNotification(
                        $recipient->role,
                        Notification::TYPE_ASSIGNMENT,
                        Notification::SEVERITY_INFO,
                        'Task Assignment Updated',
                        "You have been assigned to task: \"{$detailedActivity->name}\".",
                        $detailedActivity->id,
                        "/work-program?view=taskboard&task={$detailedActivity->id}",
                        "assignment:event:{$auditEntry->id}",
                        null,
                        null,
                        $recipient->id
                    );
                }
            });
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

        return response()->json(DetailedActivityResource::make($detailedActivity)->resolve($request));
    }

    // ─── DELETE /detailed-activities/{detailedActivity} ──────────────────────

    public function destroy(Request $request, DetailedActivity $detailedActivity)
    {
        $user = $this->user($request);

        if (!($detailedActivity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

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
