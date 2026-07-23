<?php

namespace App\Services;

use App\Models\DetailedActivity;
use Carbon\Carbon;

/**
 * Applies FR-009/FR-009a's precedence to a set of Support-Ops-eligible
 * DetailedActivity records, sorting each into exactly one of four buckets
 * (or excluding it) per data-model.md's algorithm. Encoded as sequential
 * exclusive checks — see research.md's "sequential exclusive checks, not a
 * scoring system" decision — so exactly-one-bucket is guaranteed by
 * construction, no post-hoc deduplication needed.
 */
class SupportOpsTodayClassifier
{
    /**
     * @param iterable<DetailedActivity> $issues
     * @return array{stale: array<DetailedActivity>, watch_closely: array<DetailedActivity>, waiting_for_client: array<DetailedActivity>, learning_priorities: array<DetailedActivity>}
     */
    public static function classify(iterable $issues, ?Carbon $now = null): array
    {
        $now = $now ?? Carbon::now();

        $buckets = [
            'stale' => [],
            'watch_closely' => [],
            'waiting_for_client' => [],
            'learning_priorities' => [],
        ];

        foreach ($issues as $issue) {
            // Learning is a wholly separate track (FR-009a) — never
            // evaluated against the three support-issue criteria below,
            // even if it happens to carry a `status`/`client_priority`.
            if ($issue->work_type === 'learning') {
                $buckets['learning_priorities'][] = $issue;
                continue;
            }

            if (in_array($issue->status, ['blocked', 'delayed'], true)) {
                $buckets['waiting_for_client'][] = $issue;
                continue;
            }

            if (SupportOpsStaleness::state($issue, $now) === 'stale') {
                $buckets['stale'][] = $issue;
                continue;
            }

            if ($issue->client_priority === 'P1') {
                $buckets['watch_closely'][] = $issue;
            }
        }

        return $buckets;
    }
}
