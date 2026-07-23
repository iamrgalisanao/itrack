<?php

namespace App\Services;

use App\Models\DetailedActivity;
use Carbon\Carbon;

/**
 * Pure counting logic for the weekly Support Ops report
 * (005-support-ops-automation, FR-005/FR-011) — takes already-fetched
 * collections (the controller owns the querying, matching 004's
 * SupportOpsTodayClassifier pattern) and returns opened/resolved/still-stale
 * counts. "Still stale" reuses SupportOpsTodayClassifier's 'stale' bucket
 * (004) rather than raw SupportOpsStaleness::state() alone — a
 * `blocked`/`delayed` issue belongs only in Waiting for Client, even if
 * also past its priority threshold, so it must never inflate this count
 * either (the same precedence bug this fixed in the overdue-entry
 * generator — see NotificationController::generateSupportOverdueEntries()).
 */
class SupportOpsWeeklyReportBuilder
{
    /**
     * @param iterable<DetailedActivity> $openedIssues Issues created within the target week
     * @param iterable<int> $resolvedIssueIds Distinct issue ids with a task.status_changed
     *   transition into 'completed' within the target week (already deduplicated by the caller)
     * @param iterable<DetailedActivity> $currentIssues Currently non-completed support/learning
     *   issues to check for ongoing staleness as of $now
     * @return array{opened: int, resolved: int, still_stale: int}
     */
    public static function build(iterable $openedIssues, iterable $resolvedIssueIds, iterable $currentIssues, ?Carbon $now = null): array
    {
        $now = $now ?? Carbon::now();

        $openedCount = 0;
        foreach ($openedIssues as $issue) {
            $openedCount++;
        }

        $resolvedIds = [];
        foreach ($resolvedIssueIds as $id) {
            $resolvedIds[$id] = true;
        }

        $stillStaleCount = count(SupportOpsTodayClassifier::classify($currentIssues, $now)['stale']);

        return [
            'opened' => $openedCount,
            'resolved' => count($resolvedIds),
            'still_stale' => $stillStaleCount,
        ];
    }
}
