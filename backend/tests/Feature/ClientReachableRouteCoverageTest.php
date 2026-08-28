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
 * So this guards the failure that has actually happened, four times.
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
        'api/projects/{project}/invitations'                   => 'Admin/PM only',
        'api/projects/{project}/memberships'                   => 'Admin/PM only',

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
        'api/team-members'                                     => 'internal directory',
        'api/team-members/{team_member}'                       => 'internal directory',
    ];

    /**
     * Reachable and read by ClientVisibilityBoundaryTest, but its sentinel
     * cannot currently reach them, so those rows prove nothing yet.
     *
     * Listed separately rather than folded into the exemptions because the two
     * are different claims: "a Client cannot get here" versus "a Client can get
     * here and we are not really checking". Collapsing them is how #14's
     * `reports` row sat green while vacuous.
     */
    private const REACHABLE_BUT_NOT_YET_PROVEN = [
        'api/detailed-activities/{detailed_activity}/comments'    => 'needs a comment seeded on a hidden task -- audit finding M1',
        'api/detailed-activities/{detailed_activity}/attachments' => 'needs an attachment seeded on a hidden task -- audit finding M1',
        'api/attachments/{attachment}/download'                   => 'needs an attachment on a hidden task -- audit finding C2',
        'api/bugs/{bug}'                                          => 'bug visibility is its own boundary; no sentinel yet',
        'api/glossary-terms/{glossary_term}'                      => 'global reference data, no project scope',
        'api/notifications'                                       => 'reachable, returns own notifications only',
        'api/me'                                                  => 'reachable, returns own user only',
        'api/glossary-terms'                                      => 'global reference data',
        'api/my-work'                                             => 'reachable; Clients cannot be assignees today',
        'api/dashboard'                                           => 'covered by the provider',
        'api/reports'                                             => 'covered by the provider',
        'api/projects/{project}/bugs'                             => 'reachable, bug visibility filtered separately',
        'api/detailed-activities/{detailed_activity}'             => 'reachable, verified clean',
    ];

    public function test_every_authenticated_get_route_is_classified(): void
    {
        $covered = $this->routesReadByTheBoundaryTest();
        $unclassified = [];
        $seen = 0;

        foreach (Route::getRoutes() as $route) {
            if (! in_array('GET', $route->methods(), true)) {
                continue;
            }
            // Match the ALIAS, not the resolved class. `route:list` prints
            // `Illuminate\Auth\Middleware\Authenticate:sanctum` because artisan
            // resolves aliases for display; `gatherMiddleware()` returns the raw
            // `auth:sanctum`. Matching only the resolved form enumerated zero
            // routes and this test passed while measuring nothing -- caught by
            // the tamper below, which is the only reason it is not still doing so.
            $authenticated = false;
            foreach ($route->gatherMiddleware() as $m) {
                if (is_string($m) && (str_starts_with($m, 'auth:sanctum')
                    || str_contains($m, 'Authenticate:sanctum'))) {
                    $authenticated = true;
                }
            }
            if (! $authenticated) {
                continue;
            }
            $seen++;

            $uri = $route->uri();
            if (isset(self::NOT_CLIENT_REACHABLE[$uri])
                || isset(self::REACHABLE_BUT_NOT_YET_PROVEN[$uri])
                || in_array($uri, $covered, true)) {
                continue;
            }
            $unclassified[] = $uri;
        }

        sort($unclassified);

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
            . "two lists with a reason. Four disclosure defects have been closed on this boundary "
            . "and every one was a route nobody had listed.",
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
