<?php

namespace App\Http\Controllers;

use App\Models\DetailedActivity;
use App\Models\Project;
use App\Models\User;
use App\Support\AccessContext;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function index(Request $request)
    {
        $user = $this->user($request);
        $projects = $this->projectsFor($user);

        if ($user->isClient()) {
            return response()->json($this->buildClientReport($projects));
        }

        return response()->json($this->buildInternalReport($projects));
    }

    public function exportCsv(Request $request): StreamedResponse
    {
        $user = $this->user($request);

        if ($user->isClient()) {
            abort(403, 'Clients are not permitted to export reports.');
        }

        $projects = $this->projectsFor($user);

        return response()->streamDownload(function () use ($projects) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Project', 'Department', 'Task', 'Assignee', 'Status', 'Progress', 'Plan End Date']);

            foreach ($projects as $project) {
                foreach ($this->tasksForProject($project) as $task) {
                    fputcsv($out, [
                        $project->name,
                        $project->department,
                        $task->name,
                        $task->responsible,
                        $task->status,
                        $task->progress,
                        optional($task->plan_end_date)->toDateString(),
                    ]);
                }
            }

            fclose($out);
        }, 'project-report.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    private function projectsFor(User $user): Collection
    {
        return Project::query()
            ->accessibleTo($user)
            ->with('modules.activities.subActivities.detailedActivities.predecessors')
            ->orderBy('id')
            ->get();
    }

    private function buildClientReport(Collection $projects): array
    {
        return [
            'summary' => [
                'project_count' => $projects->count(),
                'overall_progress' => $this->overallProgress($projects),
            ],
            'projects' => $projects->map(fn (Project $project) => [
                'id' => $project->id,
                'name' => $project->name,
                'department' => $project->department,
                'health' => $project->health,
                'health_label' => $this->healthLabel($project->health),
                'progress' => $this->projectProgress($project),
                'milestones' => $this->milestonesForProject($project)->values(),
            ])->values(),
            'generated_at' => now()->toISOString(),
        ];
    }

    private function buildInternalReport(Collection $projects): array
    {
        $tasks = $projects->flatMap(fn (Project $project) => $this->tasksForProject($project));

        return [
            'summary' => [
                'project_count' => $projects->count(),
                'task_count' => $tasks->count(),
                'overall_progress' => $this->overallProgress($projects),
                'overdue_count' => $tasks->filter(fn (DetailedActivity $task) => $this->isOverdue($task))->count(),
                'blocked_count' => $tasks->where('status', 'blocked')->count(),
                'dependency_risk_count' => $tasks->filter(fn (DetailedActivity $task) => $this->hasDependencyRisk($task))->count(),
            ],
            'projects' => $projects->map(function (Project $project) {
                $tasks = $this->tasksForProject($project);

                return [
                    'id' => $project->id,
                    'name' => $project->name,
                    'department' => $project->department,
                    'health' => $project->health,
                    'health_label' => $this->healthLabel($project->health),
                    'progress' => $this->projectProgress($project),
                    'overdue_count' => $tasks->filter(fn (DetailedActivity $task) => $this->isOverdue($task))->count(),
                    'blocked_count' => $tasks->where('status', 'blocked')->count(),
                    'dependency_risk_count' => $tasks->filter(fn (DetailedActivity $task) => $this->hasDependencyRisk($task))->count(),
                    'milestones' => $this->milestonesForProject($project)->values(),
                    'status_breakdown' => $tasks->countBy('status'),
                ];
            })->values(),
            'generated_at' => now()->toISOString(),
        ];
    }

    private function tasksForProject(Project $project): Collection
    {
        return $project->modules
            ->flatMap(fn ($module) => $module->activities)
            ->flatMap(fn ($activity) => $activity->subActivities)
            ->flatMap(fn ($subActivity) => $subActivity->detailedActivities)
            ->values();
    }

    private function milestonesForProject(Project $project): Collection
    {
        return $this->tasksForProject($project)
            ->filter(fn (DetailedActivity $task) => (int) $task->duration_months === 0 && (int) $task->duration_days === 0)
            ->map(fn (DetailedActivity $task) => [
                'id' => $task->id,
                'name' => $task->name,
                'status' => $task->status,
                'plan_end_date' => optional($task->plan_end_date)->toDateString(),
                'progress' => $task->progress,
            ]);
    }

    private function overallProgress(Collection $projects): int
    {
        $tasks = $projects->flatMap(fn (Project $project) => $this->tasksForProject($project));

        return (int) round($tasks->avg('progress') ?? 0);
    }

    private function projectProgress(Project $project): int
    {
        return (int) round($this->tasksForProject($project)->avg('progress') ?? 0);
    }

    private function isOverdue(DetailedActivity $task): bool
    {
        return $task->status !== 'completed'
            && $task->plan_end_date !== null
            && $task->plan_end_date->lt(today());
    }

    private function hasDependencyRisk(DetailedActivity $task): bool
    {
        if ($task->status === 'completed') {
            return false;
        }

        return $task->predecessors->contains(fn (DetailedActivity $predecessor) => $this->isOverdue($predecessor));
    }

    private function healthLabel(?string $health): string
    {
        return match ($health) {
            'on_track' => 'On Track',
            'at_risk' => 'At Risk',
            'off_track' => 'Off Track',
            'on_hold' => 'On Hold',
            'completed' => 'Completed',
            default => 'Unknown',
        };
    }

    // Resolves the acting user via AccessContext (007-permission-hardening)
    // so the Client export-denial check above is preview-aware, not just
    // $request->user()'s real Sanctum identity.
    private function user(Request $request): User
    {
        return AccessContext::user($request);
    }
}
