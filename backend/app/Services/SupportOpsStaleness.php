<?php

namespace App\Services;

use App\Models\DetailedActivity;
use Carbon\Carbon;

/**
 * Server-side port of SupportOps.jsx's getStalenessState()/addOneBusinessDay()
 * (see data-model.md's staleness table, research.md's Carbon addWeekday()
 * equivalence verification). The existing frontend board keeps its own JS
 * implementation unchanged — this is a second, independent, but isolated and
 * unit-tested implementation for the Today endpoint (research.md).
 */
class SupportOpsStaleness
{
    private const THRESHOLD_HOURS = [
        'P1' => 1,
        'P2' => 4,
    ];

    /**
     * The moment this issue crosses its staleness threshold, or null if it
     * has no recognized priority or no reference timestamp to measure from.
     */
    public static function staleAt(DetailedActivity $issue): ?Carbon
    {
        if (!in_array($issue->client_priority, ['P1', 'P2', 'P3'], true)) {
            return null;
        }

        $reference = $issue->last_client_update_at ?? $issue->created_at;
        if (!$reference) {
            return null;
        }

        $reference = $reference instanceof Carbon ? $reference->copy() : Carbon::parse($reference);

        if ($issue->client_priority === 'P3') {
            return $reference->addWeekday();
        }

        return $reference->addHours(self::THRESHOLD_HOURS[$issue->client_priority]);
    }

    /**
     * Returns 'stale' | 'fresh' | 'no-priority' | null. `null` means "this
     * issue is never staleness-checked at all" — matches the frontend's
     * existing "Resolved issues are never flagged" rule.
     */
    public static function state(DetailedActivity $issue, ?Carbon $now = null): ?string
    {
        if ($issue->status === 'completed') {
            return null;
        }

        $staleAt = self::staleAt($issue);
        if ($staleAt === null) {
            return 'no-priority';
        }

        $now = $now ?? Carbon::now();

        return $now->greaterThanOrEqualTo($staleAt) ? 'stale' : 'fresh';
    }
}
