<?php

namespace Tests\Unit;

use App\Models\DetailedActivity;
use App\Services\SupportOpsWeeklyReportBuilder;
use Carbon\Carbon;
use Tests\TestCase;

/**
 * Pure counting logic for the weekly Support Ops report (005), in isolation
 * from the controller's querying — same rationale as
 * SupportOpsTodayClassifierTest (004): no DB query anywhere in this file.
 */
class SupportOpsWeeklyReportBuilderTest extends TestCase
{
    private function issue(array $attributes): DetailedActivity
    {
        $issue = new DetailedActivity();
        foreach ($attributes as $key => $value) {
            $issue->{$key} = $value;
        }

        return $issue;
    }

    public function test_counts_opened_issues(): void
    {
        $opened = [$this->issue([]), $this->issue([]), $this->issue([])];

        $result = SupportOpsWeeklyReportBuilder::build($opened, [], []);

        $this->assertSame(3, $result['opened']);
    }

    public function test_counts_distinct_resolved_issue_ids(): void
    {
        // Duplicate id (e.g. completed, reopened, completed again within the
        // same week) must count as one resolved issue, not two.
        $result = SupportOpsWeeklyReportBuilder::build([], [42, 42, 7], []);

        $this->assertSame(2, $result['resolved']);
    }

    public function test_counts_currently_stale_issues_via_today_classifier(): void
    {
        $now = Carbon::parse('2026-01-08 12:00:00');
        $current = [
            $this->issue([
                'work_type' => 'support',
                'status' => 'in_progress',
                'client_priority' => 'P1',
                'last_client_update_at' => $now->copy()->subHours(2), // stale
            ]),
            $this->issue([
                'work_type' => 'support',
                'status' => 'in_progress',
                'client_priority' => 'P1',
                'last_client_update_at' => $now->copy()->subMinutes(10), // fresh
            ]),
        ];

        $result = SupportOpsWeeklyReportBuilder::build([], [], $current, $now);

        $this->assertSame(1, $result['still_stale']);
    }

    public function test_blocked_issue_never_counted_as_still_stale_even_if_stale_by_timestamp(): void
    {
        // Same precedence rule as the overdue-entry generator (FR-009,
        // 004): blocked/delayed belongs only in Waiting for Client.
        $now = Carbon::parse('2026-01-08 12:00:00');
        $current = [
            $this->issue([
                'work_type' => 'support',
                'status' => 'blocked',
                'client_priority' => 'P1',
                'last_client_update_at' => $now->copy()->subHours(2), // stale by timestamp math
            ]),
        ];

        $result = SupportOpsWeeklyReportBuilder::build([], [], $current, $now);

        $this->assertSame(0, $result['still_stale']);
    }

    public function test_zero_state_returns_all_zero_counts(): void
    {
        $result = SupportOpsWeeklyReportBuilder::build([], [], []);

        $this->assertSame(['opened' => 0, 'resolved' => 0, 'still_stale' => 0], $result);
    }
}
