<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Module;
use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\TeamMember;
use App\Models\GlossaryTerm;
use App\Models\DepartmentGrant;
use App\Models\ProjectMembership;
use App\Models\ProjectOwnership;
use App\Services\AuditLogger;
use App\Models\User;
use App\Support\AccessContext;
use Illuminate\Http\Request;

class ProjectController extends Controller
{
    // ─── Role Helpers ────────────────────────────────────────────────────────
    // Resolves the acting user via AccessContext (007-permission-hardening)
    // so every check below is preview-aware, not just $request->user()'s
    // real Sanctum identity. Null role → fail-safe unauthorized (HasRole trait).

    private function user(Request $request): User
    {
        return AccessContext::user($request);
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

        // `with('modules')` was here and had no consumer -- nothing in
        // frontend/src reads `project.modules` (Dashboard's `stats.modules` is
        // a count). It shipped every module's `responsible` and `support` to
        // every caller of the app's most-frequently-hit endpoint. Dropping it
        // closes that and removes a per-project query.
        return Project::query()
            ->accessibleTo($user)
            ->get()
            ->each(fn (Project $project) => $project->setAttribute(
                'can_manage_client_access',
                $this->canManageClientAccess($user, $project)
            ));
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
            // 007-permission-hardening: this message must match the
            // exception handler's wording (bootstrap/app.php) byte-for-byte
            // — a Team Member/Client requesting a project ID that exists
            // but isn't theirs (this branch) and one that doesn't exist at
            // all (that handler) must be indistinguishable (FR-005/FR-011).
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        // Same unused eager load as index(); see the note there.
        return $project->setAttribute(
            'can_manage_client_access',
            $this->canManageClientAccess($user, $project)
        );
    }

    private function canManageClientAccess(User $user, Project $project): bool
    {
        if ($project->client_organization_id === null) {
            return false;
        }

        if ($user->isAdmin()) {
            return true;
        }

        if ($user->isProjectManager()) {
            $hasAnyOwner = ProjectOwnership::where('project_id', $project->id)->exists();

            return !$hasAnyOwner || Project::query()->ownedBy($user)->whereKey($project->id)->exists();
        }

        if (!$user->isClient()) {
            return false;
        }

        return ProjectMembership::query()
            ->where('client_organization_id', $project->client_organization_id)
            ->where('project_id', $project->id)
            ->where('user_id', $user->id)
            ->where('state', ProjectMembership::STATE_APPROVED)
            ->where('role', ProjectMembership::ROLE_CLIENT_ADMIN)
            ->exists();
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

        // 021-dashboard-my-work: these counts are rendered as the dashboard's
        // headline metrics, so a Client's copy must not aggregate over tasks
        // they cannot see. Aggregate-only exposure, but the restructure
        // promoted these from a lower-billed card grid to the lead row.
        $detailedActivityQuery = DetailedActivity::whereIn('sub_activity_id', $subActivityIds)
            ->visibleTo($user);

        $detailedActivities = (clone $detailedActivityQuery)->count();
        $completed   = (clone $detailedActivityQuery)->where('status', 'completed')->count();
        $inProgress  = (clone $detailedActivityQuery)->where('status', 'in_progress')->count();
        $notStarted  = (clone $detailedActivityQuery)->where('status', 'not_started')->count();
        $delayed     = (clone $detailedActivityQuery)->where('status', 'delayed')->count();
        $avgProgress = (clone $detailedActivityQuery)->avg('progress') ?? 0;

        // 021-dashboard-my-work (research.md R7): accomplishment-first metric
        // for the restructured summary row. `updated_at` is the completion
        // proxy — `actual_end_date` is too sparsely populated to count on.
        $completedRecentQuery = (clone $detailedActivityQuery)
            ->where('status', 'completed')
            ->where('updated_at', '>=', now()->subDays(7));

        // Redundant — $detailedActivityQuery already carries this filter — but
        // kept because it is load-bearing if that clone is ever reordered.
        //
        // A previous comment here claimed the counts above "pre-date the
        // client_visible flag and are deferred cleanup". That was false: they
        // are filtered at the shared query. It was stale rather than harmless
        // — an audit read it, believed there was an unfiltered leak, and
        // reported one that did not exist. A comment describing a defect that
        // was already fixed manufactures work.
        $completedRecentQuery->visibleTo($user);

        $completedRecent = $completedRecentQuery->count();

        $teamMembers   = TeamMember::count();
        $glossaryTerms = GlossaryTerm::count();

        // 021-dashboard-my-work: mirrors DetailedActivityController::index()'s
        // client_visible filter. Without it a Client saw the names and status
        // of internal tasks in their accessible projects.
        $recentActivitiesQuery = DetailedActivity::whereIn('sub_activity_id', $subActivityIds)
            ->visibleTo($user);

        $recentActivities = $recentActivitiesQuery
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
            // The join predicate, not a where clause: this is a LEFT join, and a
            // WHERE on the joined table would drop modules whose tasks are all
            // internal instead of showing them with a zero count — turning an
            // over-disclosure into a different one, the absence of a module.
            //
            // Sibling of the filters on $detailedActivityQuery above. That one
            // was added during 021; this query was missed because it is raw DB
            // rather than Eloquent and reads as "just counts". Aggregate counts
            // over invisible tasks are still disclosure.
            //
            // The one place `client_visible` is spelt by hand IN A QUERY. Every
            // other read path now goes through DetailedActivity::scopeVisibleTo();
            // a join predicate is a raw query builder, not an Eloquent builder,
            // so the scope cannot reach it. It must stay a join predicate rather
            // than a WHERE: a WHERE on the null side of a LEFT JOIN drops whole
            // modules instead of zeroing their counts, which is the
            // over-disclosure above traded for a different one.
            //
            // Four instance-level checks also spell it by hand, on a loaded
            // model rather than a query, so the scope cannot reach them either:
            // DetailedActivityController:171, AttachmentController:108,
            // CommentController:79, NotificationController:170. They are the
            // `isVisibleTo()` surface, not this one.
            //
            // A gate forbidding `client_visible` outside the scope must allow
            // this line and those four. Naming only this one would have been
            // the same kind of false comment the note fifty lines above warns
            // about.
            ->leftJoin('detailed_activities', function ($join) use ($user) {
                $join->on('detailed_activities.sub_activity_id', '=', 'sub_activities.id');
                if ($user->isClient()) {
                    $join->where('detailed_activities.client_visible', true);
                }
            })
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
                'completed_recent'    => $completedRecent,
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
