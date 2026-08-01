<?php

namespace Tests\Unit;

use App\Support\DurationCalculator;
use Tests\TestCase;

/**
 * Duration is derived from the planned date range, not client-supplied —
 * see DurationCalculator's docblock for why. The end date is treated as
 * inclusive (+1 day), mirroring the frontend's deriveDuration() in
 * WorkProgram.jsx and the Gantt bar width calc (calculateBarPosition).
 */
class DurationCalculatorTest extends TestCase
{
    public function test_returns_zero_when_either_date_is_missing(): void
    {
        $this->assertSame(['duration_months' => 0, 'duration_days' => 0], DurationCalculator::fromDates(null, null));
        $this->assertSame(['duration_months' => 0, 'duration_days' => 0], DurationCalculator::fromDates('2026-01-01', null));
        $this->assertSame(['duration_months' => 0, 'duration_days' => 0], DurationCalculator::fromDates(null, '2026-01-01'));
    }

    public function test_returns_zero_when_end_is_before_start(): void
    {
        $result = DurationCalculator::fromDates('2026-01-10', '2026-01-01');
        $this->assertSame(['duration_months' => 0, 'duration_days' => 0], $result);
    }

    public function test_same_day_range_is_one_day_not_zero(): void
    {
        $result = DurationCalculator::fromDates('2026-01-01', '2026-01-01');
        $this->assertSame(['duration_months' => 0, 'duration_days' => 1], $result);
    }

    public function test_exact_calendar_month_span(): void
    {
        // Jan 1 -> Jan 31 inclusive is exactly one calendar month (Jan 1 to Feb 1).
        $result = DurationCalculator::fromDates('2026-01-01', '2026-01-31');
        $this->assertSame(['duration_months' => 1, 'duration_days' => 0], $result);
    }

    public function test_multi_month_span_with_remainder_days(): void
    {
        // Jan 1 -> Mar 15 inclusive: Jan 1 to Mar 16 is 2 months, 15 days.
        $result = DurationCalculator::fromDates('2026-01-01', '2026-03-15');
        $this->assertSame(['duration_months' => 2, 'duration_days' => 15], $result);
    }

    public function test_span_over_a_year_collapses_years_into_months(): void
    {
        // 14 months 15 days, not "1 year 2 months 15 days" — this schema has no years field.
        $result = DurationCalculator::fromDates('2025-01-01', '2026-03-15');
        $this->assertSame(['duration_months' => 14, 'duration_days' => 15], $result);
    }
}
