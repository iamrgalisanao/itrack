<?php

namespace Tests\Unit;

use App\Models\DetailedActivity;
use App\Services\SupportOpsTodayClassifier;
use Carbon\Carbon;
use Tests\TestCase;

/**
 * Pure logic tests for FR-009/FR-009a's precedence, in isolation from the
 * controller/query layer (see data-model.md's classification algorithm and
 * research.md's "sequential exclusive checks" decision).
 */
class SupportOpsTodayClassifierTest extends TestCase
{
    private function issue(array $attributes): DetailedActivity
    {
        $issue = new DetailedActivity();
        foreach ($attributes as $key => $value) {
            $issue->{$key} = $value;
        }

        return $issue;
    }

    public function test_stale_and_p1_lands_only_in_stale(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'in_progress',
            'client_priority' => 'P1',
            'last_client_update_at' => $now->copy()->subHours(2),
        ]);

        $buckets = SupportOpsTodayClassifier::classify([$issue], $now);

        $this->assertSame([$issue], $buckets['stale']);
        $this->assertSame([], $buckets['watch_closely']);
        $this->assertSame([], $buckets['waiting_for_client']);
        $this->assertSame([], $buckets['learning_priorities']);
    }

    public function test_not_yet_stale_p1_lands_in_watch_closely(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'in_progress',
            'client_priority' => 'P1',
            'last_client_update_at' => $now->copy()->subMinutes(30),
        ]);

        $buckets = SupportOpsTodayClassifier::classify([$issue], $now);

        $this->assertSame([], $buckets['stale']);
        $this->assertSame([$issue], $buckets['watch_closely']);
    }

    public function test_blocked_and_stale_lands_only_in_waiting_for_client(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'blocked',
            'client_priority' => 'P1',
            'last_client_update_at' => $now->copy()->subHours(2),
        ]);

        $buckets = SupportOpsTodayClassifier::classify([$issue], $now);

        $this->assertSame([$issue], $buckets['waiting_for_client']);
        $this->assertSame([], $buckets['stale']);
        $this->assertSame([], $buckets['watch_closely']);
    }

    public function test_delayed_status_also_lands_in_waiting_for_client(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'delayed',
            'client_priority' => 'P2',
            'last_client_update_at' => $now,
        ]);

        $buckets = SupportOpsTodayClassifier::classify([$issue], $now);

        $this->assertSame([$issue], $buckets['waiting_for_client']);
    }

    public function test_open_learning_entry_lands_in_learning_priorities(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'learning',
            'status' => 'in_progress',
            'client_priority' => null,
        ]);

        $buckets = SupportOpsTodayClassifier::classify([$issue], $now);

        $this->assertSame([$issue], $buckets['learning_priorities']);
        $this->assertSame([], $buckets['stale']);
        $this->assertSame([], $buckets['watch_closely']);
        $this->assertSame([], $buckets['waiting_for_client']);
    }

    public function test_learning_entry_with_blocked_status_and_client_priority_stays_in_learning_only(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'learning',
            'status' => 'blocked',
            'client_priority' => 'P1',
            'last_client_update_at' => $now->copy()->subDays(10),
        ]);

        $buckets = SupportOpsTodayClassifier::classify([$issue], $now);

        $this->assertSame([$issue], $buckets['learning_priorities']);
        $this->assertSame([], $buckets['stale']);
        $this->assertSame([], $buckets['watch_closely']);
        $this->assertSame([], $buckets['waiting_for_client']);
    }

    public function test_unqualified_support_issue_is_excluded_from_all_buckets(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'in_progress',
            'client_priority' => 'P2',
            'last_client_update_at' => $now->copy()->subMinutes(10),
        ]);

        $buckets = SupportOpsTodayClassifier::classify([$issue], $now);

        $this->assertSame([], $buckets['stale']);
        $this->assertSame([], $buckets['watch_closely']);
        $this->assertSame([], $buckets['waiting_for_client']);
        $this->assertSame([], $buckets['learning_priorities']);
    }
}
