<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Every authenticated GET route must be classified: either a Client can reach
 * it and `ClientVisibilityBoundaryTest` reads it, or it is explicitly exempt.
 *
 * WHY THIS EXISTS
 * ---------------
 * Four disclosure defects have now been closed on this boundary (PRs #14, #15,
 * #24, #26). Every one had the same cause, and it was never a wrong rule: it was
 * a route nobody added to the list. `clientReachableRoutes()` enumerated exactly
 * the routes someone had thought of, so PR #26 fixed three endpoints and left
 * five leaking the identical fields to the identical audience -- found only
 * because a reviewer probed by hand.
 *
 * A guard over *columns* was considered and rejected: it needs a registry of
 * which columns are internal, which is the same list that can drift, and it
 * guards a failure mode that has never occurred -- no new model has been the
 * cause of any of the four.
 *
 * GET ONLY, DELIBERATELY. Writes on this surface return raw models too
 * (`TeamMemberController::store` and `::update` did until this change), but every
 * one is Admin/PM-gated, so the *audience* is wrong for a Client-disclosure
 * guard. Extending to POST/PATCH/DELETE roughly doubles the classification
 * burden -- 44 routes becomes ~90 -- to guard a population whose risk is a
 * role-check bug rather than a serialisation one. Five Client-disclosure defects
 * have been closed on this boundary and zero write-response defects. Guard what
 * has bled; do not "fix" this omission into a 90-row chore.
 *
 * So this guards the failure that has actually happened, five times.
 * Enumeration is the mechanism, not exercise: proving every route is *safe*
 * needs fixtures for each and is not practical, but forcing a one-line
 * reviewable decision about whether a Client can reach it is cheap and cannot
 * be satisfied by accident. Had this existed, `/api/modules/{module}/activities`
 * would have been red the day it was written.
 */
class ClientReachableRouteCoverageTest extends TestCase
{
    /**
     * Authenticated GET routes a Client cannot reach, each with the reason.
     *
     * A route belongs here only if something *server-side* stops a Client --
     * a role check in the controller, or a scope that cannot match. "The UI
     * never links there for a Client" is not a reason; that is the assumption
     * that made `WorkProgram.jsx:2476` the only gate on three of four Gantt
     * row types until PR #26.
     */
    private const NOT_CLIENT_REACHABLE = [
        // Admin-only administration surfaces (role-checked in controller).
        'api/audit-logs'                                       => 'Admin only',
        'api/users'                                            => 'Admin only',
        'api/department-grants'                                => 'Admin only',
        'api/project-ownerships'                               => 'Admin only',
        'api/project-assignments'                              => 'Admin/PM only',
        'api/client-organizations'                             => 'Admin only',
        'api/client-organizations/{clientOrganization}/domains' => 'Admin only',
        'api/client-membership-review'                         => 'Admin/PM only',

        // Internal operational modules -- controller rejects the Client role.
        'api/support-ops'                                      => 'internal roles only',
        'api/support-ops/today'                                => 'internal roles only',
        'api/support-ops/knowledge-base'                       => 'internal roles only',
        'api/retro-sessions'                                   => 'internal roles only',
        'api/retro-sessions/{retroSession}'                    => 'internal roles only',
        'api/retro-entries/{retroEntry}/comments'              => 'internal roles only',
        'api/retro-entries/{retroEntry}/attachments'           => 'internal roles only',
        'api/retro-entry-attachments/{retroEntryAttachment}/download' => 'internal roles only',
        'api/projects/{project}/taskboard/tasks'               => 'internal roles only (verified 403)',
        'api/reports/export-csv'                               => 'Clients are not permitted to export reports (verified 403)',
    ];

    /**
     * Reachable, and safe for a structural reason that cannot decay: the route
     * is scoped to the caller's own records, so there is no other tenant's data
     * for it to disclose.
     *
     * This is a permanent classification, unlike the debt list below.
     */
    private const REACHABLE_SCOPED_TO_SELF = [
        'api/me'                                                  => 'returns the authenticated user only',
        'api/notifications'                                       => 'returns the caller\'s own notifications only',
        'api/my-work'                                             => 'assignee-scoped; Clients cannot be assignees today',
    ];

    /**
     * Reachable, and NOT yet proven safe -- the boundary test's sentinel cannot
     * reach them, so nothing is really being checked.
     *
     * This is a debt list and should shrink to zero. Kept apart from the
     * exemptions because the two claims decay differently: "a Client cannot get
     * here" is invalidated by a change to a gate, "we are not checking" by
     * nobody ever coming back. Collapsing them loses the ability to ask what is
     * still unproven, which is the question that would have caught #14's vacuous
     * `reports` row.
     */
    private const REACHABLE_NOT_YET_PROVEN = [
        'api/bugs/{bug}'                                          => 'BugController re-checks visibility for Clients and returns BugResource; no sentinel yet',
        'api/projects/{project}/bugs'                             => 'visibility-filtered via BugResource; no sentinel yet',
        'api/glossary-terms'                                      => 'global reference data, returned as raw models -- Principle II',
        'api/glossary-terms/{glossary_term}'                      => 'global reference data, returned as raw models -- Principle II',
        'api/detailed-activities/{detailed_activity}'             => 'probed clean on the field axis; no standing assertion',
        'api/projects/{project}/invitations'                      => 'reachable by an approved client_admin (ProjectClientAccess::canManageClientMembers); curated Resource, no internal fields',
        'api/projects/{project}/memberships'                      => 'reachable by an approved client_admin; curated Resource, no internal fields',
    ];

    public function test_every_authenticated_get_route_is_classified(): void
    {
        $covered = $this->routesReadByTheBoundaryTest();
        $unclassified = [];
        $doubleListed = [];
        $seen = 0;

        foreach (Route::getRoutes() as $route) {
            if (! in_array('GET', $route->methods(), true)) {
                continue;
            }
            // Match the ALIAS. `route:list` prints
            // `Illuminate\Auth\Middleware\Authenticate:sanctum` because artisan
            // resolves aliases for display; `gatherMiddleware()` returns the raw
            // `auth:sanctum`. The first draft matched only the resolved form,
            // enumerated zero routes, and passed -- caught by tamper, which is
            // the only reason it is not still doing so. A fallback matching the
            // resolved name was kept for a while and was dead code: it never
            // fires, and it made this comment read as if both forms occur.
            $authenticated = false;
            foreach ($route->gatherMiddleware() as $m) {
                if (is_string($m) && str_starts_with($m, 'auth:sanctum')) {
                    $authenticated = true;
                }
            }
            if (! $authenticated) {
                continue;
            }
            $seen++;

            $uri = $route->uri();
            $buckets = 0;
            $buckets += isset(self::NOT_CLIENT_REACHABLE[$uri]) ? 1 : 0;
            $buckets += isset(self::REACHABLE_SCOPED_TO_SELF[$uri]) ? 1 : 0;
            $buckets += isset(self::REACHABLE_NOT_YET_PROVEN[$uri]) ? 1 : 0;
            $buckets += in_array($uri, $covered, true) ? 1 : 0;

            // Exactly one, not at least one. `api/dashboard` and `api/reports`
            // were listed BOTH in the provider and as exemptions reading
            // "covered by the provider" -- self-refuting, and because the check
            // was an ||, removing either from the provider left the guard green.
            // Those are the #11 heatmap leak and the #14 reports leak: the two
            // routes where coverage silently evaporating has already cost a PR
            // each were the only two the guard could not see it happen to.
            if ($buckets > 1) {
                $doubleListed[] = $uri;
            }
            if ($buckets === 0) {
                $unclassified[] = $uri;
            }
        }

        sort($unclassified);
        sort($doubleListed);

        $this->assertSame([], $doubleListed, sprintf(
            "Route(s) appear in more than one classification bucket:\n  %s\n\n"
            . 'A route in two buckets is satisfied by either, so removing it from the boundary '
            . 'test leaves this guard green. Classification must be exclusive.',
            implode("\n  ", $doubleListed)
        ));

        // The canary. If the middleware match breaks -- as it did on the first
        // draft, where the alias/resolved-name mismatch enumerated nothing --
        // this fails loudly instead of reporting a green guard over zero routes.
        $this->assertGreaterThan(30, $seen,
            "Only {$seen} authenticated GET routes were enumerated. The middleware match is "
            . 'broken and this guard is measuring nothing.');

        $this->assertSame([], $unclassified, sprintf(
            "%d authenticated GET route(s) are neither read by ClientVisibilityBoundaryTest nor "
            . "explicitly classified:\n  %s\n\n"
            . "Add each to that test's provider if a Client can reach it, or to one of this file's "
            . "three lists with a reason. Five disclosure defects have been closed on this boundary "
            . "and every one was a route nobody had listed -- including /api/team-members, which "
            . "this guard first classified WRONGLY as exempt on the strength of its name.",
            count($unclassified),
            implode("\n  ", $unclassified)
        ));
    }

    /**
     * The provider's URI templates, reduced to route-definition shape so they
     * can be compared with `Route::uri()`.
     */
    private function routesReadByTheBoundaryTest(): array
    {
        $map = [
            '/api/projects'                                 => 'api/projects',
            '/api/projects/%project%'                       => 'api/projects/{project}',
            '/api/projects/%project%/modules'               => 'api/projects/{project}/modules',
            '/api/modules/%module%'                         => 'api/modules/{module}',
            '/api/modules/%module%/activities'              => 'api/modules/{module}/activities',
            '/api/activities/%activity%'                    => 'api/activities/{activity}',
            '/api/activities/%activity%/sub-activities'     => 'api/activities/{activity}/sub-activities',
            '/api/sub-activities/%subActivity%'             => 'api/sub-activities/{sub_activity}',
            '/api/sub-activities/%subActivity%/detailed-activities'
                => 'api/sub-activities/{sub_activity}/detailed-activities',
            '/api/detailed-activities/%hiddenTask%/comments' => 'api/detailed-activities/{detailed_activity}/comments',
            '/api/detailed-activities/%hiddenTask%/attachments' => 'api/detailed-activities/{detailed_activity}/attachments',
            '/api/attachments/%hiddenAttachment%/download'   => 'api/attachments/{attachment}/download',
            '/api/team-members'                             => 'api/team-members',
            '/api/team-members/%teamMember%'                => 'api/team-members/{team_member}',
            '/api/dashboard'                                => 'api/dashboard',
            '/api/reports'                                  => 'api/reports',
        ];

        $templates = array_column(ClientVisibilityBoundaryTest::clientReachableRoutes(), 0);
        $unmapped = array_diff($templates, array_keys($map));

        $this->assertSame([], array_values($unmapped), sprintf(
            "The boundary test reads route template(s) this guard cannot map to a route "
            . "definition:\n  %s\nAdd them to the map in %s so the guard keeps seeing them.",
            implode("\n  ", $unmapped),
            basename(__FILE__)
        ));

        return array_values(array_intersect_key($map, array_flip($templates)));
    }
}
