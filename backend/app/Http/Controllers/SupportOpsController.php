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

    // work_type values eligible for the generation-log endpoint — matches
    // exactly what index() can ever return to the board (the default
    // 'support' scope plus the opt-in 'learning' filter toggle from
    // 002-support-ops-tracker's FR-012). An ordinary Kanban-only task
    // (work_type = project/bug/feature/admin) is never Support-Ops-scoped
    // and must 404 here, per 003-templates-prompt-generator's FR-013.
    private const GENERATION_LOG_ELIGIBLE_WORK_TYPES = ['support', 'learning'];

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

    // ─── POST /support-ops/{id}/generation-log ──────────────────────────────

    /**
     * Records an audit entry when a Support Ops generator (a client-facing
     * message template, the freeform draft, or the troubleshooting packet —
     * see 003-templates-prompt-generator) discloses personal information,
     * for Data Privacy Act (RA 10173) accountability. This endpoint never
     * mutates the issue itself — it is a log-only side channel (FR-009).
     *
     * The server independently derives whether personal information was
     * actually included from the issue's own current field values; it never
     * trusts client-supplied flags for this (see
     * contracts/generation-log-api.md's trust-boundary requirement) — the
     * request body carries no `included_*` fields at all. What counts as
     * "included" is artifact-type specific (FR-013): a template or the
     * freeform draft never puts `tenant_name` in their output, so
     * `included_tenant_name` is hardcoded false for those two regardless of
     * the issue's actual tenant, while the packet is the only artifact type
     * where it's a real check.
     */
    public function generationLog(Request $request, $id)
    {
        $user = $this->user($request);

        if (!$this->canView($user)) {
            return response()->json(['message' => 'Unauthorized: Support Ops is restricted to internal team members.'], 403);
        }

        $issue = DetailedActivity::find($id);
        if (!$issue || !in_array($issue->work_type, self::GENERATION_LOG_ELIGIBLE_WORK_TYPES, true)) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $validated = $request->validate([
            'artifact_type'    => 'required|in:template,draft,packet',
            'template_stage'   => [
                'nullable',
                'string',
                'in:acknowledgement,intake_request,investigation_started,progress_update,waiting_for_client,root_cause_found,resolved',
                'required_if:artifact_type,template',
                'prohibited_if:artifact_type,draft,packet',
            ],
            // Must match Carbon::toIso8601String()'s exact output format
            // (Y-m-d\TH:i:sP) — validated as a format check only, never
            // parsed into a Carbon/DateTime instance here. Parsing-then-
            // reformatting risks silently accepting a value that wouldn't
            // actually match the model's own serialization byte-for-byte,
            // which would defeat the snapshot comparison below.
            'issue_updated_at' => ['required', 'string', 'date_format:Y-m-d\TH:i:sP'],
        ]);

        // Plain string comparison of the untouched request value against the
        // freshly-loaded model's own serialization — no parsing/reformatting
        // of either side (see contracts/generation-log-api.md).
        $currentUpdatedAt = optional($issue->updated_at)->toIso8601String();
        $snapshotStale = $validated['issue_updated_at'] !== $currentUpdatedAt;

        // Artifact-type-specific inclusion check (FR-013) — never a shared
        // issue-level check. A template/draft never discloses tenant_name,
        // so it is hardcoded false for them regardless of the issue's actual
        // tenant_name; only the packet evaluates it for real.
        $includedClientName = trim((string) $issue->client_name) !== '';
        $includedTenantName = $validated['artifact_type'] === 'packet'
            && trim((string) $issue->tenant_name) !== '';

        // Skip the write only when the snapshot is fresh AND nothing was
        // actually included — a stale snapshot always logs regardless of
        // the current field values, erring toward an extra/defensive entry
        // over silently under-logging (RA 10173 accountability).
        if (!$snapshotStale && !$includedClientName && !$includedTenantName) {
            return response()->json(['logged' => true]);
        }

        $actionByArtifactType = [
            'template' => 'support_issue.template_generated',
            'draft'    => 'support_issue.draft_started',
            'packet'   => 'support_issue.packet_generated',
        ];

        AuditLogger::record(
            $request,
            $actionByArtifactType[$validated['artifact_type']],
            'detailed_activity',
            $issue->id,
            null,
            [
                'artifact_type'        => $validated['artifact_type'],
                'template_stage'       => $validated['template_stage'] ?? null,
                'included_client_name' => $includedClientName,
                'included_tenant_name' => $includedTenantName,
                'snapshot_stale'       => $snapshotStale,
            ]
        );

        return response()->json(['logged' => true]);
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
