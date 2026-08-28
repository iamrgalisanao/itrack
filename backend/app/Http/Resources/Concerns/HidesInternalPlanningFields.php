<?php

namespace App\Http\Resources\Concerns;

use App\Support\AccessContext;
use Illuminate\Http\Request;

/**
 * The Client field boundary for the three planning levels above a task.
 *
 * `Module`, `Activity` and `SubActivity` carry an identical set of internal
 * planning columns, and `DetailedActivityResource` already withholds the same
 * four from Clients one level below. Before this, all three levels were
 * serialised with `attributesToArray()` and nothing withheld anything -- so a
 * Client received `responsible` and `support` for every module, activity and
 * sub-activity on three separate endpoints.
 *
 * The list lives here, once, rather than in three near-identical resources.
 * Three copies of a rule is how the row-axis boundary came to be forgotten in
 * seven places; a shared definition is greppable and cannot drift between the
 * levels it governs.
 */
trait HidesInternalPlanningFields
{
    /**
     * Internal-only columns, matching DetailedActivityResource's Client branch.
     *
     * `responsible` and `support` name internal staff. `output` is internal
     * planning prose. `sort_order` is ordering metadata with no frontend
     * consumer at all -- withheld for consistency rather than sensitivity.
     */
    private const INTERNAL_PLANNING_FIELDS = [
        'output',
        'responsible',
        'support',
        'sort_order',
    ];

    /**
     * Audience is resolved through AccessContext, never `$request->user()`:
     * a preview-as-Client session must render the fields a Client would see,
     * not the fields the real Admin may see. Getting that backwards is what
     * made preview answer "what does this client see" in the permissive
     * direction until PR #14.
     */
    private function withoutInternalPlanningFields(Request $request, array $fields): array
    {
        if (! AccessContext::user($request)->isClient()) {
            return $fields;
        }

        return array_diff_key($fields, array_flip(self::INTERNAL_PLANNING_FIELDS));
    }
}
