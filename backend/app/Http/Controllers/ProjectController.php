<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Module;
use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\TeamMember;
use App\Models\GlossaryTerm;
use App\Models\DepartmentGrant;
use App\Services\AuditLogger;
use App\Models\User;
use Illuminate\Http\Request;

class ProjectController extends Controller
{
    // ─── Role Helpers ────────────────────────────────────────────────────────
    // Reads role/department from the authenticated Sanctum user (real auth).
    // Null role → fail-safe unauthorized (see HasRole trait).

    private function user(Request $request): User
    {
        return $request->user();
    }

    private function accessibleDepartments(User $user): array
    {
        // Department Head sees own dept + any departments granted via DepartmentGrant.
        $granted = DepartmentGrant::grantedDepartments($user->role, $user->department);

        return array_values(array_unique(array_merge(
            array_filter([$user->department]),
            $granted,
        )));
    }

    // ─── GET /api/projects ───────────────────────────────────────────────────

    public function index(Request $request)
    {
        $user = $this->user($request);

        return Project::with('modules')
            ->accessibleTo($user)
            ->get();
    }

    // ─── POST /api/projects ──────────────────────────────────────────────────

    public function store(Request $request)
    {
        $user = $this->user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'project.create', 'project');
            return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can create projects.'], 403);
        }

        $validated = $request->validate([
            'name'            => 'required|string|max:255',
            'location'        => 'nullable|string|max:255',
            'updated_date'    => 'nullable|date',
            'project_owner'   => 'nullable|string|max:255',
            'department'      => 'nullable|string|max:255',
            'status'          => 'nullable|string|max:255',
            'start_date'      => 'nullable|date',
            'target_end_date' => 'nullable|date',
            'health'          => 'nullable|in:on_track,at_risk,off_track,on_hold,completed',
            'health_note'     => 'nullable|string|max:1000',
        ]);

        $project = Project::create($validated);

        AuditLogger::record(
            $request,
            'project.created',
            'project',
            $project->id,
            "Project \"{$project->name}\" created.",
            ['project_name' => $project->name, 'department' => $project->department]
        );

        return $project;
    }

    // ─── GET /api/projects/{project} ─────────────────────────────────────────

    public function show(Request $request, Project $project)
    {
        $user = $this->user($request);

        if (! Project::whereKey($project->id)->accessibleTo($user)->exists()) {
            AuditLogger::denied($request, 'project.view', 'project', $project->id);
            return response()->json(['message' => 'Unauthorized department access.'], 403);
        }

        return $project->load('modules');
    }

    // ─── PUT /api/projects/{project} ─────────────────────────────────────────

    public function update(Request $request, Project $project)
    {
        $user = $this->user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'project.update', 'project', $project->id);
            return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can update projects.'], 403);
        }

        $validated = $request->validate([
            'name'            => 'sometimes|string|max:255',
            'location'        => 'nullable|string|max:255',
            'updated_date'    => 'nullable|date',
            'project_owner'   => 'nullable|string|max:255',
            'department'      => 'nullable|string|max:255',
            'status'          => 'nullable|string|max:255',
            'start_date'      => 'nullable|date',
            'target_end_date' => 'nullable|date',
            'health'          => 'nullable|in:on_track,at_risk,off_track,on_hold,completed',
            'health_note'     => 'nullable|string|max:1000',
        ]);

        $project->update($validated);

        AuditLogger::record(
            $request,
            'project.updated',
            'project',
            $project->id,
            "Project \"{$project->name}\" updated.",
            ['changed_fields' => array_keys($validated)]
        );

        return $project;
    }

    // ─── DELETE /api/projects/{project} ──────────────────────────────────────

    public function destroy(Request $request, Project $project)
    {
        $user = $this->user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'project.delete', 'project', $project->id);
            return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can delete projects.'], 403);
        }

        AuditLogger::record(
            $request,
            'project.deleted',
            'project',
            $project->id,
            "Project \"{$project->name}\" deleted.",
            ['project_name' => $project->name, 'department' => $project->department]
        );

        $project->delete();
        return response()->noContent();
    }

    // ─── PATCH /api/projects/{project}/health ────────────────────────────────

    public function updateHealth(Request $request, Project $project)
    {
        $user = $this->user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'project.health_update', 'project', $project->id);
            return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can update project health.'], 403);
        }

        $validated = $request->validate([
            'health'      => ['required', 'in:on_track,at_risk,off_track,on_hold,completed'],
            'health_note' => ['nullable', 'string', 'max:1000'],
        ]);

        $oldHealth = $project->health;

        $project->update([
            'health'            => $validated['health'],
            'health_note'       => $validated['health_note'] ?? null,
            'health_updated_at' => now(),
            'health_updated_by' => $user->name ?? $user->role,
        ]);

        AuditLogger::record(
            $request,
            'project.health_updated',
            'project',
            $project->id,
            "Project health changed from \"{$oldHealth}\" to \"{$validated['health']}\".",
            [
                'old_health'  => $oldHealth,
                'new_health'  => $validated['health'],
                'health_note' => $validated['health_note'] ?? null,
            ]
        );

        return response()->json([
            'message' => 'Project health updated successfully.',
            'project' => $project,
        ]);
    }

    // ─── GET /api/dashboard ──────────────────────────────────────────────────

    public function dashboard(Request $request)
    {
        $user = $this->user($request);

        $projectQuery = Project::query()->accessibleTo($user);
        $projectIds = $projectQuery->pluck('id');

        $projects  = $projectIds->count();
        $modules   = Module::whereIn('project_id', $projectIds)->count();
        $moduleIds = Module::whereIn('project_id', $projectIds)->pluck('id');
        $activities = Activity::whereIn('module_id', $moduleIds)->count();
        $activityIds = Activity::whereIn('module_id', $moduleIds)->pluck('id');
        $subActivityIds = \DB::table('sub_activities')->whereIn('activity_id', $activityIds)->pluck('id');

        $detailedActivityQuery = DetailedActivity::whereIn('sub_activity_id', $subActivityIds);

        $detailedActivities = (clone $detailedActivityQuery)->count();
        $completed   = (clone $detailedActivityQuery)->where('status', 'completed')->count();
        $inProgress  = (clone $detailedActivityQuery)->where('status', 'in_progress')->count();
        $notStarted  = (clone $detailedActivityQuery)->where('status', 'not_started')->count();
        $delayed     = (clone $detailedActivityQuery)->where('status', 'delayed')->count();
        $avgProgress = (clone $detailedActivityQuery)->avg('progress') ?? 0;

        $teamMembers   = TeamMember::count();
        $glossaryTerms = GlossaryTerm::count();

        $recentActivities = DetailedActivity::whereIn('sub_activity_id', $subActivityIds)
            ->with(['subActivity.activity.module'])
            ->orderBy('updated_at', 'desc')
            ->limit(5)
            ->get()
            ->map(function ($da) {
                $subActivity = $da->subActivity;
                $activity    = $subActivity ? $subActivity->activity : null;
                $module      = $activity ? $activity->module : null;
                return [
                    'id'            => $da->id,
                    'name'          => $da->name,
                    'module_name'   => $module ? $module->name : 'N/A',
                    'activity_name' => $activity ? $activity->name : 'N/A',
                    'status'        => $da->status,
                    'progress'      => $da->progress,
                ];
            });

        $heatmapRows = \DB::table('modules')
            ->whereIn('modules.project_id', $projectIds)
            ->leftJoin('activities', 'activities.module_id', '=', 'modules.id')
            ->leftJoin('sub_activities', 'sub_activities.activity_id', '=', 'activities.id')
            ->leftJoin('detailed_activities', 'detailed_activities.sub_activity_id', '=', 'sub_activities.id')
            ->select(
                'modules.id as module_id',
                'modules.name as module_name',
                'modules.code as module_code',
                \DB::raw('COUNT(detailed_activities.id) as `total`'),
                \DB::raw("SUM(CASE WHEN detailed_activities.status = 'completed'   THEN 1 ELSE 0 END) as `completed`"),
                \DB::raw("SUM(CASE WHEN detailed_activities.status = 'in_progress' THEN 1 ELSE 0 END) as `in_progress`"),
                \DB::raw("SUM(CASE WHEN detailed_activities.status = 'not_started' THEN 1 ELSE 0 END) as `not_started`"),
                \DB::raw("SUM(CASE WHEN detailed_activities.status = 'delayed'     THEN 1 ELSE 0 END) as `delayed`")
            )
            ->groupBy('modules.id', 'modules.name', 'modules.code')
            ->orderBy('modules.sort_order')
            ->get()
            ->map(fn($row) => [
                'module_id'   => $row->module_id,
                'module_name' => $row->module_name,
                'module_code' => $row->module_code,
                'total'       => (int) $row->total,
                'completed'   => (int) $row->completed,
                'in_progress' => (int) $row->in_progress,
                'not_started' => (int) $row->not_started,
                'delayed'     => (int) $row->delayed,
            ]);

        return response()->json([
            'stats' => [
                'projects'            => $projects,
                'modules'             => $modules,
                'activities'          => $activities,
                'detailed_activities' => $detailedActivities,
                'completed'           => $completed,
                'in_progress'         => $inProgress,
                'not_started'         => $notStarted,
                'delayed'             => $delayed,
                'team_members'        => $teamMembers,
                'glossary_terms'      => $glossaryTerms,
                'overall_progress'    => round($avgProgress, 1),
            ],
            'recent_activities' => $recentActivities,
            'module_heatmap'    => $heatmapRows,
        ]);
    }
}
