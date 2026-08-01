<?php

namespace App\Support;

use Carbon\Carbon;

/**
 * Derives duration_months/duration_days from a planned date range, server
 * side, for modules/activities/sub-activities/tasks. Duration used to be a
 * client-supplied pair of integers that could silently drift out of sync
 * with plan_start_date/plan_end_date — the frontend now derives it too
 * (WorkProgram.jsx deriveDuration()), but that only closes the gap for
 * requests that go through the UI. This is the same calculation applied at
 * the controller layer so a direct API call can't reintroduce the drift.
 *
 * The end date is treated as inclusive (+1 day) so a same-day range yields
 * 1 day, not 0 — matching the Gantt bar width convention (calculateBarPosition
 * in WorkProgram.jsx) and the frontend's deriveDuration().
 */
class DurationCalculator
{
    public static function fromDates(string|\DateTimeInterface|null $start, string|\DateTimeInterface|null $end): array
    {
        if (!$start || !$end) {
            return ['duration_months' => 0, 'duration_days' => 0];
        }

        $startDate = Carbon::parse($start)->startOfDay();
        $endDate = Carbon::parse($end)->startOfDay();

        if ($endDate->lt($startDate)) {
            return ['duration_months' => 0, 'duration_days' => 0];
        }

        $diff = $startDate->diff($endDate->addDay());

        return [
            'duration_months' => ($diff->y * 12) + $diff->m,
            'duration_days' => $diff->d,
        ];
    }
}
