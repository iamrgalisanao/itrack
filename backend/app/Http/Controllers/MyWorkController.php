<?php

namespace App\Http\Controllers;

use App\Http\Resources\MyWorkTaskResource;
use App\Models\DetailedActivity;
use App\Models\Project;
use App\Support\AccessContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * 021-dashboard-my-work: the dashboard's personal work list.
 *
 * Separate from ProjectController::dashboard() because the two refresh on
 * different cadences — an inline status change must not re-run the dashboard's
 * module heatmap aggregation (research.md R1).
 */
class MyWorkController extends Controller
{
    private const BUCKETS = ['overdue', 'this_week', 'later', 'no_due_date'];

    private const DEFAULT_PER_BUCKET = 10;

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            // Anchors are all-or-nothing: a lone anchor mixed with a server
            // default produces overlapping bucket predicates (a task can be
            // both "before today" and "after week_end"), which silently breaks
            // the count-partition guarantee below.
            'today'      => ['nullable', 'date_format:Y-m-d', 'required_with:week_end'],
            'week_end'   => ['nullable', 'date_format:Y-m-d', 'after_or_equal:today', 'required_with:today'],
            'per_bucket' => ['nullable', 'integer', 'min:1', 'max:100'],
            'bucket'     => ['nullable', 'in:' . implode(',', self::BUCKETS), 'required_with:all'],
            'all'        => ['nullable', 'boolean', 'required_with:bucket'],
        ]);

        [$today, $weekEnd] = $this->resolveAnchors($validated);

        $user = AccessContext::user($request);
        $perBucket = (int) ($validated['per_bucket'] ?? self::DEFAULT_PER_BUCKET);
        $expandedBucket = ($validated['all'] ?? false) ? $validated['bucket'] : null;

        $projectIds = Project::query()->accessibleTo($user)->pluck('id');

        $base = fn (): Builder => DetailedActivity::query()
            ->open()
            ->where('assignee_user_id', $user->id)
            ->whereHas('subActivity.activity.module', fn ($q) => $q->whereIn('project_id', $projectIds))
            // Defence in depth: Clients cannot currently be assignees at all,
            // so this is normally a no-op — but if that policy ever loosens,
            // internal tasks must not surface here.
            ->when($user->isClient(), fn ($q) => $q->where('client_visible', true));

        $counts = $this->bucketCounts($base(), $today, $weekEnd);

        $buckets = [];
        foreach (self::BUCKETS as $bucket) {
            $query = $this->applyBucket($base(), $bucket, $today, $weekEnd)
                ->with(['subActivity.activity.module.project']);

            $query = $bucket === 'no_due_date'
                ? $query->orderByDesc('created_at')->orderByDesc('id')
                : $query->orderBy('plan_end_date')->orderBy('id');

            if ($bucket !== $expandedBucket) {
                $query->limit($perBucket);
            }

            $buckets[$bucket] = [
                'count' => $counts[$bucket],
                'tasks' => MyWorkTaskResource::collection($query->get())->resolve(),
            ];
        }

        return response()->json([
            'buckets' => $buckets,
            'meta'    => [
                'today'      => $today,
                'week_end'   => $weekEnd,
                'per_bucket' => $perBucket,
                'can_write'  => $user->canWrite(),
            ],
        ]);
    }

    /**
     * Bucket boundaries follow the viewer's local dates, supplied by the SPA —
     * iTrack stores no per-user timezone, so the browser is the only authority
     * on "today" (research.md R2). Both anchors default together.
     */
    private function resolveAnchors(array $validated): array
    {
        $today = $validated['today'] ?? now()->toDateString();
        $weekEnd = $validated['week_end'] ?? now()->endOfWeek(\Carbon\CarbonInterface::SUNDAY)->toDateString();

        // The validator's after_or_equal cannot compare a supplied week_end
        // against a defaulted today, so re-assert the invariant here: the four
        // predicates must partition the open set.
        if ($today > $weekEnd) {
            throw ValidationException::withMessages([
                'week_end' => 'The week end must be on or after today.',
            ]);
        }

        return [$today, $weekEnd];
    }

    private function applyBucket(Builder $query, string $bucket, string $today, string $weekEnd): Builder
    {
        return match ($bucket) {
            'overdue'     => $query->whereNotNull('plan_end_date')->whereDate('plan_end_date', '<', $today),
            'this_week'   => $query->whereNotNull('plan_end_date')
                ->whereDate('plan_end_date', '>=', $today)
                ->whereDate('plan_end_date', '<=', $weekEnd),
            'later'       => $query->whereNotNull('plan_end_date')->whereDate('plan_end_date', '>', $weekEnd),
            'no_due_date' => $query->whereNull('plan_end_date'),
        };
    }

    /** One aggregate pass so counts stay true totals even where rows are capped. */
    private function bucketCounts(Builder $base, string $today, string $weekEnd): array
    {
        $row = $base->selectRaw(
            'SUM(CASE WHEN plan_end_date IS NOT NULL AND plan_end_date < ? THEN 1 ELSE 0 END) as overdue,'
            . ' SUM(CASE WHEN plan_end_date IS NOT NULL AND plan_end_date >= ? AND plan_end_date <= ? THEN 1 ELSE 0 END) as this_week,'
            . ' SUM(CASE WHEN plan_end_date IS NOT NULL AND plan_end_date > ? THEN 1 ELSE 0 END) as later,'
            . ' SUM(CASE WHEN plan_end_date IS NULL THEN 1 ELSE 0 END) as no_due_date',
            [$today, $today, $weekEnd, $weekEnd]
        )->first();

        return [
            'overdue'     => (int) ($row->overdue ?? 0),
            'this_week'   => (int) ($row->this_week ?? 0),
            'later'       => (int) ($row->later ?? 0),
            'no_due_date' => (int) ($row->no_due_date ?? 0),
        ];
    }
}
