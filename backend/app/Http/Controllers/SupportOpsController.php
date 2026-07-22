<?php

namespace App\Http\Controllers;

use App\Http\Resources\SupportIssueResource;
use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Project;
use App\Models\SubActivity;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class SupportOpsController extends Controller
{
    // Sentinel code identifying the auto-provisioned "Support Requests"
    // Module/Activity/SubActivity chain per project. Matching on `code`
    // (not `name`) avoids collisions with a real module that happens to
    // share the name, and survives renames.
    private const SUPPORT_CHAIN_CODE = 'SUPPORT-OPS';

    // ─── Role Helpers ────────────────────────────────────────────────────────
    // View access is inclusion-based (grant only recognized internal roles) —
    // never a deny-list. A deny-list ("block only if Client") silently grants
    // access to any null/unrecognized role, which is exactly the fail-open
    // mistake this codebase's own KanbanGuard had before 001-real-auth-cutover
    // fixed it. Do not reintroduce that shape here.

    private function user(Request $request): User
    {
        return $request->user();
    }

    private function canView(User $user): bool
    {
        return $user->isAdmin()
            || $user->isProjectManager()
            || $user->isTeamMember()
            || $user->isDepartmentHead();
    }

    // ─── GET /support-ops ──────────────────────────────────────────────────

    public function index(Request $request)
    {
        $user = $this->user($request);

        if (!$this->canView($user)) {
            return response()->json(['message' => 'Unauthorized: Support Ops is restricted to internal team members.'], 403);
        }

        $validated = $request->validate([
            'project_id' => 'required|integer|exists:projects,id',
            'work_types' => 'nullable|string',
        ]);

        $project = Project::findOrFail($validated['project_id']);

        $workTypes = isset($validated['work_types']) && $validated['work_types'] !== ''
            ? array_map('trim', explode(',', $validated['work_types']))
            : ['support'];

        $issues = DetailedActivity::whereHas('subActivity.activity.module', function ($query) use ($project) {
            $query->where('project_id', $project->id);
        })
            ->whereIn('work_type', $workTypes)
            ->orderBy('created_at', 'desc')
            ->get();

        return SupportIssueResource::collection($issues);
    }

    // ─── POST /support-ops ──────────────────────────────────────────────────

    public function store(Request $request)
    {
        $user = $this->user($request);

        // Write access (create) is further restricted to canWrite() —
        // Department Head can view the board (canView() above) but not
        // create or edit issues on it, matching their read-only relationship
        // to tasks everywhere else in iTrack.
        if (!$user->canWrite()) {
            AuditLogger::denied($request, 'support_issue.create', 'detailed_activity');
            return response()->json(['message' => 'Unauthorized: Only Admin, Project Manager, and Team Member roles can create tasks.'], 403);
        }

        $validated = $request->validate([
            'project_id'        => 'required|integer|exists:projects,id',
            'name'              => 'required|string|max:255',
            'client_name'       => 'required|string|max:255',
            'client_priority'   => 'required|in:P1,P2,P3',
            'tenant_name'       => 'nullable|string|max:255',
            'channel'           => 'nullable|string|max:255',
            'timestamp'         => 'nullable|date',
            'affected_area'     => 'nullable|string',
            'expected_behavior' => 'nullable|string',
            'actual_behavior'   => 'nullable|string',
            'evidence'          => 'nullable|string',
            'next_action'       => 'nullable|string',
        ]);

        $project = Project::findOrFail($validated['project_id']);
        $subActivity = $this->resolveSupportRequestsSubActivity($project);

        $issue = $subActivity->detailedActivities()->create([
            'name'             => $validated['name'],
            'work_type'        => 'support',
            'status'           => 'backlog',
            'progress'         => 0,
            'client_visible'   => false,
            'client_name'      => $validated['client_name'],
            'tenant_name'      => $validated['tenant_name'] ?? null,
            'channel'          => $validated['channel'] ?? null,
            'client_priority'  => $validated['client_priority'],
            'next_action'      => $validated['next_action'] ?? null,
            'evidence'         => $validated['evidence'] ?? null,
            'description'      => $this->composeDescription($validated),
        ]);

        AuditLogger::record(
            $request,
            'support_issue.created',
            'detailed_activity',
            $issue->id,
            "Support issue \"{$issue->name}\" created.",
            ['client_name' => $issue->client_name, 'client_priority' => $issue->client_priority]
        );

        return (new SupportIssueResource($issue))->response()->setStatusCode(201);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Find-or-create the per-project "Support Requests" Module→Activity→
     * SubActivity chain that every Support Ops intake attaches under, keyed
     * on a stable `code` rather than `name` (see SUPPORT_CHAIN_CODE).
     */
    private function resolveSupportRequestsSubActivity(Project $project): SubActivity
    {
        $module = Module::firstOrCreate(
            ['project_id' => $project->id, 'code' => self::SUPPORT_CHAIN_CODE],
            ['name' => 'Support Requests', 'sort_order' => 9999]
        );

        $activity = Activity::firstOrCreate(
            ['module_id' => $module->id, 'code' => self::SUPPORT_CHAIN_CODE],
            ['name' => 'Support Requests', 'sort_order' => 9999]
        );

        return SubActivity::firstOrCreate(
            ['activity_id' => $activity->id, 'code' => self::SUPPORT_CHAIN_CODE],
            ['name' => 'Support Requests', 'sort_order' => 9999]
        );
    }

    /**
     * Compose the intake-form-only fields (timestamp/affected_area/expected/
     * actual — not separate columns, see contracts/support-ops-api.md) into
     * a structured `description` block.
     */
    private function composeDescription(array $validated): ?string
    {
        $lines = [];
        if (!empty($validated['timestamp'])) {
            $lines[] = "Timestamp: {$validated['timestamp']}";
        }
        if (!empty($validated['affected_area'])) {
            $lines[] = "Area/workflow affected: {$validated['affected_area']}";
        }
        if (!empty($validated['expected_behavior'])) {
            $lines[] = "Expected: {$validated['expected_behavior']}";
        }
        if (!empty($validated['actual_behavior'])) {
            $lines[] = "Actual: {$validated['actual_behavior']}";
        }

        return $lines === [] ? null : implode("\n", $lines);
    }
}
