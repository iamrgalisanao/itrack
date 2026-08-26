<?php

namespace App\Support;

use App\Models\Module;
use App\Models\SubActivity;

/**
 * 018-taskboard / 021-dashboard-my-work: reuses-or-creates one reserved,
 * application-owned Activity/SubActivity pair per Module, so tasks created
 * from surfaces that don't expose those levels (the Taskboard, the dashboard's
 * My Work quick-add) still satisfy the required
 * Module → Activity → SubActivity → DetailedActivity chain.
 *
 * Shared rather than duplicated per caller: the reserved *names* below are
 * correctness-coupled, not stylistic. Two copies that drift would silently
 * create a second parallel "Unclassified Tasks" bucket in the same module.
 */
class TaskboardPlacement
{
    private const string RESERVED_ACTIVITY_NAME = 'Taskboard';

    private const string RESERVED_SUB_ACTIVITY_NAME = 'Unclassified Tasks';

    /**
     * Deliberately does not open its own transaction — the caller owns the
     * single transaction for the whole create flow.
     */
    public static function resolveDefaultSubActivity(int $moduleId): SubActivity
    {
        $module = Module::query()->whereKey($moduleId)->lockForUpdate()->firstOrFail();

        $activity = $module->activities()->where('name', self::RESERVED_ACTIVITY_NAME)->first()
            ?? $module->activities()->create(['name' => self::RESERVED_ACTIVITY_NAME, 'sort_order' => 0]);

        return $activity->subActivities()->where('name', self::RESERVED_SUB_ACTIVITY_NAME)->first()
            ?? $activity->subActivities()->create(['name' => self::RESERVED_SUB_ACTIVITY_NAME, 'sort_order' => 0]);
    }
}
