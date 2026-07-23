<?php

namespace Tests\Unit;

use App\Models\DetailedActivity;
use App\Services\SupportOpsStaleness;
use Carbon\Carbon;
use Tests\TestCase;

/**
 * Pure logic tests for the server-side port of SupportOps.jsx's
 * getStalenessState()/addOneBusinessDay() (see data-model.md's staleness
 * table, research.md's Carbon addWeekday() equivalence verification).
 *
 * Extends Tests\TestCase (not bare PHPUnit\Framework\TestCase) solely so
 * Eloquent's datetime casts on an unsaved DetailedActivity instance work —
 * Model::asDateTime() needs a connection resolver registered, which only
 * happens once the framework boots. No database query is made anywhere in
 * this file.
 */
class SupportOpsStalenessTest extends TestCase
{
    private function issue(array $attributes): DetailedActivity
    {
        $issue = new DetailedActivity();
        foreach ($attributes as $key => $value) {
            $issue->{$key} = $value;
        }

        return $issue;
    }

    public function test_p1_is_stale_past_one_hour(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'in_progress',
            'client_priority' => 'P1',
            'last_client_update_at' => $now->copy()->subHours(2),
        ]);

        $this->assertSame('stale', SupportOpsStaleness::state($issue, $now));
    }

    public function test_p1_is_fresh_before_one_hour(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'in_progress',
            'client_priority' => 'P1',
            'last_client_update_at' => $now->copy()->subMinutes(30),
        ]);

        $this->assertSame('fresh', SupportOpsStaleness::state($issue, $now));
    }

    public function test_p2_is_stale_past_four_hours(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'in_progress',
            'client_priority' => 'P2',
            'last_client_update_at' => $now->copy()->subHours(5),
        ]);

        $this->assertSame('stale', SupportOpsStaleness::state($issue, $now));
    }

    public function test_p2_is_fresh_before_four_hours(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'in_progress',
            'client_priority' => 'P2',
            'last_client_update_at' => $now->copy()->subHours(3),
        ]);

        $this->assertSame('fresh', SupportOpsStaleness::state($issue, $now));
    }

    public function test_p3_friday_reference_rolls_to_monday(): void
    {
        $friday = Carbon::parse('2026-01-02 09:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'in_progress',
            'client_priority' => 'P3',
            'last_client_update_at' => $friday,
        ]);

        // Saturday: the very next calendar day is a weekend day, so the
        // business-day threshold has not been reached yet.
        $this->assertSame('fresh', SupportOpsStaleness::state($issue, $friday->copy()->addDay()));
        // Monday, before the threshold moment: still fresh.
        $this->assertSame('fresh', SupportOpsStaleness::state($issue, Carbon::parse('2026-01-05 08:59:59')));
        // Monday, at/after the threshold moment: now stale.
        $this->assertSame('stale', SupportOpsStaleness::state($issue, Carbon::parse('2026-01-05 09:00:00')));
    }

    public function test_p3_weekend_reference_also_rolls_to_monday(): void
    {
        $saturday = Carbon::parse('2026-01-03 09:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'in_progress',
            'client_priority' => 'P3',
            'last_client_update_at' => $saturday,
        ]);

        $this->assertSame('fresh', SupportOpsStaleness::state($issue, Carbon::parse('2026-01-05 08:59:59')));
        $this->assertSame('stale', SupportOpsStaleness::state($issue, Carbon::parse('2026-01-05 09:00:00')));
    }

    public function test_completed_status_is_never_stale(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'completed',
            'client_priority' => 'P1',
            'last_client_update_at' => $now->copy()->subDays(30),
        ]);

        $this->assertNull(SupportOpsStaleness::state($issue, $now));
    }

    public function test_missing_priority_is_no_priority(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'in_progress',
            'client_priority' => null,
            'last_client_update_at' => $now->copy()->subDays(30),
        ]);

        $this->assertSame('no-priority', SupportOpsStaleness::state($issue, $now));
    }

    public function test_falls_back_to_created_at_when_no_client_update_recorded(): void
    {
        $now = Carbon::parse('2026-01-05 12:00:00');
        $issue = $this->issue([
            'work_type' => 'support',
            'status' => 'in_progress',
            'client_priority' => 'P1',
            'last_client_update_at' => null,
            'created_at' => $now->copy()->subHours(2),
        ]);

        $this->assertSame('stale', SupportOpsStaleness::state($issue, $now));
    }
}
