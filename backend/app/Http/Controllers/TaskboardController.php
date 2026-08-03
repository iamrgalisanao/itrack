<?php

namespace App\Http\Controllers;

use App\Http\Resources\DetailedActivityResource;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Notification;
use App\Models\Project;
use App\Models\SubActivity;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\AccessContext;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class TaskboardController extends Controller
{
    private const RESERVED_ACTIVITY_NAME = 'Taskboard';
    private const RESERVED_SUB_ACTIVITY_NAME = 'Unclassified Tasks';

    private function user(Request $request): User
    {
        return AccessContext::user($request);
    }

    /**
     * data-model.md: assignee_user_id must reference a real, non-Client user
     * who also has actual access to the target project — existence alone
     * (research.md D4) would let a real internal user from an unrelated
     * project be assigned.
     */
    private function internalUserExistsRule(): Exists
    {
        return Rule::exists('users', 'id')->where(fn ($query) => $query->where('role', '!=', User::ROLE_CLIENT));
    }

    private function assigneeHasProjectAccess(?int $assigneeUserId, Project $project): bool
    {
        if ($assigneeUserId === null) {
            return true;
        }

        $candidate = User::find($assigneeUserId);

        return $candidate !== null
            && Project::query()->accessibleTo($candidate)->whereKey($project->id)->exists();
    }

    /**
     * research.md D6: sprint_label is trimmed and blank-normalized to null
     * before saving, so whitespace variants ("Sprint 1 " vs " Sprint 1")
     * don't fragment the Taskboard's client-side grouping into separate
     * buckets.
     */
    private function normalizeSprintLabel(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * data-model.md / research.md D2: reuses-or-creates one reserved,
     * application-owned Activity/SubActivity pair per Module so the
     * existing required Module->Activity->SubActivity->DetailedActivity
     * chain stays intact — the Taskboard UI never exposes these levels.
     * Deliberately does not open its own transaction; the caller
     * (store()) owns the single transaction for the whole create flow.
     */
    private function resolveDefaultSubActivity(int $moduleId): SubActivity
    {
        $module = Module::query()->whereKey($moduleId)->lockForUpdate()->firstOrFail();

        $activity = $module->activities()->where('name', self::RESERVED_ACTIVITY_NAME)->first()
            ?? $module->activities()->create(['name' => self::RESERVED_ACTIVITY_NAME, 'sort_order' => 0]);

        return $activity->subActivities()->where('name', self::RESERVED_SUB_ACTIVITY_NAME)->first()
            ?? $activity->subActivities()->create(['name' => self::RESERVED_SUB_ACTIVITY_NAME, 'sort_order' => 0]);
    }

    // ─── GET /projects/{project}/taskboard/tasks ────────────────────────────

    public function index(Request $request, Project $project)
    {
        $user = $this->user($request);

        // spec FR-008: Client gets no access to the Taskboard view at all —
        // not a filtered response like Bug Tracker's client_visible scoping.
        if ($user->isClient()) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if (!Project::query()->accessibleTo($user)->whereKey($project->id)->exists()) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $tasks = DetailedActivity::query()
            ->whereHas('subActivity.activity.module', fn ($q) => $q->where('project_id', $project->id))
            ->with(['subActivity.activity.module', 'assignee'])
            ->get();

        return DetailedActivityResource::collection($tasks);
    }

    // ─── POST /projects/{project}/taskboard/tasks ───────────────────────────

    public function store(Request $request, Project $project)
    {
        $user = $this->user($request);

        // plan.md: Taskboard task creation is Admin/PM-only — a deliberate
        // policy decision (spec FR-006), gated the same way as every other
        // Taskboard-field write in this feature.
        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'taskboard.task.create', 'detailed_activity');
            return response()->json(['message' => 'Unauthorized: Only Admin and Project Manager roles can create Taskboard tasks.'], 403);
        }

        if (!Project::query()->accessibleTo($user)->whereKey($project->id)->exists()) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $validated = $request->validate([
            'module_id' => [
                'required',
                'integer',
                Rule::exists('modules', 'id')->where(fn ($q) => $q->where('project_id', $project->id)),
            ],
            'name' => 'required|string|max:255',
            'priority' => ['nullable', Rule::in(DetailedActivity::PRIORITIES)],
            'estimated_story_points' => 'nullable|integer|min:0|max:100',
            'sprint_label' => 'nullable|string|max:100',
            'assignee_user_id' => ['nullable', 'integer', $this->internalUserExistsRule()],
            'status' => 'sometimes|in:backlog,not_started,in_progress,for_review,completed,blocked,delayed',
        ]);

        if (!$this->assigneeHasProjectAccess($validated['assignee_user_id'] ?? null, $project)) {
            return response()->json(['message' => 'The selected assignee does not have access to this project.'], 422);
        }

        $validated['sprint_label'] = $this->normalizeSprintLabel($validated['sprint_label'] ?? null);

        $task = DB::transaction(function () use ($validated) {
            $subActivity = $this->resolveDefaultSubActivity($validated['module_id']);

            return $subActivity->detailedActivities()->create([
                'name' => $validated['name'],
                'priority' => $validated['priority'] ?? null,
                'estimated_story_points' => $validated['estimated_story_points'] ?? null,
                'sprint_label' => $validated['sprint_label'],
                'assignee_user_id' => $validated['assignee_user_id'] ?? null,
                'status' => $validated['status'] ?? 'backlog',
            ]);
        });

        AuditLogger::record($request, 'task.created', 'detailed_activity', $task->id, 'Task created via Taskboard.');

        if ($task->assignee_user_id) {
            $auditEntry = AuditLogger::record($request, 'task.assigned', 'detailed_activity', $task->id, null, [
                'from' => null,
                'to' => $task->assignee_user_id,
            ]);

            DB::afterCommit(function () use ($task, $auditEntry) {
                $recipient = $task->assignee;
                if ($recipient) {
                    Notification::sendNotification(
                        $recipient->role,
                        Notification::TYPE_ASSIGNMENT,
                        Notification::SEVERITY_INFO,
                        'New Task Assignment',
                        "You have been assigned to task \"{$task->name}\".",
                        $task->id,
                        "/work-program?view=taskboard&task={$task->id}",
                        "assignment:event:{$auditEntry->id}",
                        null,
                        null,
                        $recipient->id
                    );
                }
            });
        }

        $task->load(['subActivity.activity.module', 'assignee']);

        return (new DetailedActivityResource($task))->response()->setStatusCode(201);
    }
}
