<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\SubActivity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Preview-as-Client must reach the same verdict a Client reaches.
 *
 * THE AXIS THE OTHER TESTS CANNOT SEE
 * -----------------------------------
 * `ClientVisibilityBoundaryTest` checks *which rows* and *which fields* a Client
 * receives. `ClientReachableRouteCoverageTest` checks that every route has been
 * classified. Neither can see a third thing: a resource can be flawless on both
 * axes and still resolve them **for the wrong person**.
 *
 * That is what happened. A controller-level `user()` helper returning
 * `$request->user()` instead of `AccessContext::user($request)` makes every role
 * gate below it evaluate the real Admin, so an Admin previewing as a Client
 * sails through checks the Client is refused. A sweep of the controller layer
 * found **eleven** such routes.
 *
 * It is not a disclosure defect -- the Admin is entitled to the data either way.
 * It is worse in a specific way: preview is the ONLY tool for answering "what
 * does this client actually see", and it was answering in the PERMISSIVE
 * direction. Three of the six disclosure defects closed on this codebase would
 * have been visible in a faithful preview. A preview that over-reports access is
 * worse than no preview, because it is trusted.
 *
 * So this asserts the property directly: for a route a Client cannot reach,
 * previewing as that Client must not reach it either.
 */
class PreviewFidelityTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Routes a Client is refused. Each was verified to diverge under preview
     * before the fix -- these are not hypotheticals.
     *
     * `support-ops` and `retro-sessions` returned 422 rather than 200 under
     * preview: a validation error *past* the role gate, which is still a
     * divergence and still a pass through a check that should have denied.
     */
    public static function routesAClientIsRefused(): array
    {
        return [
            'memberships'             => ['/api/projects/%project%/memberships'],
            'invitations'             => ['/api/projects/%project%/invitations'],
            'team members'            => ['/api/team-members'],
            'audit logs'              => ['/api/audit-logs'],
            'users'                   => ['/api/users'],
            'support ops'             => ['/api/support-ops'],
            'retro sessions'          => ['/api/retro-sessions'],
            'client organizations'    => ['/api/client-organizations'],
            'project assignments'     => ['/api/project-assignments'],
            'project ownerships'      => ['/api/project-ownerships'],
            'client membership review' => ['/api/client-membership-review'],
        ];
    }

    #[DataProvider('routesAClientIsRefused')]
    public function test_previewing_as_a_client_reaches_the_same_verdict(string $template): void
    {
        $project = Project::factory()->create(['department' => 'IT']);
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $sub = SubActivity::factory()->create(['activity_id' => $activity->id]);
        DetailedActivity::factory()->create(['sub_activity_id' => $sub->id, 'client_visible' => true]);

        $admin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
        $client = User::factory()->create(['role' => 'Client', 'is_active' => true]);
        ProjectAssignment::create([
            'user_id' => $client->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $admin->id,
        ]);

        // The project MUST have a client organization, or two of these rows are
        // vacuous. `canManageMemberships:154` and `canManageInvitations:231`
        // both return false when `client_organization_id === null` -- for the
        // Admin too -- so without this the memberships and invitations rows
        // return 403 on both sides and pass whether the fix is present or not.
        //
        // They are the two the ADR calls the most serious, and the two whose
        // `client=403 preview=200` line it prints as measured fact. A test that
        // agrees with a claim by never exercising it is the shape of #14's
        // vacuous `reports` row, in the test written to prove the fix.
        $org = \App\Models\ClientOrganization::create([
            'name' => 'Sentinel Client Org',
            'slug' => 'sentinel-client-org',
            'status' => 'active',
            'created_by_user_id' => $admin->id,
        ]);
        $project->forceFill(['client_organization_id' => $org->id])->save();

        $url = strtr($template, ['%project%' => $project->id]);

        $asClient = $this->actingAs($client, 'sanctum')->getJson($url)->status();

        $token = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/preview-sessions', ['target_user_id' => $client->id])
            ->assertCreated()
            ->json('data.token');
        $this->assertNotNull($token, 'preview session did not return a token');

        $asPreview = $this->actingAs($admin, 'sanctum')
            ->json('GET', $url, [], ['X-Preview-Session' => $token])
            ->status();

        // Same identity on the wire in both preview calls; the header is the
        // only difference. Without it the Admin legitimately sees everything.
        $this->assertSame(
            $asClient,
            $asPreview,
            "{$url}: a Client gets {$asClient}, an Admin previewing as that Client gets {$asPreview}. "
            . 'The role gate is resolving the real user rather than the preview target -- check for '
            . 'a controller helper returning $request->user() instead of AccessContext::user().'
        );
    }

    /**
     * The other direction, so the fix cannot be "deny everything under preview".
     * An Admin previewing as a Client must still reach what that Client reaches.
     */
    public function test_preview_still_reaches_what_the_client_can_reach(): void
    {
        $project = Project::factory()->create(['department' => 'IT']);
        Module::factory()->create(['project_id' => $project->id]);

        $admin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
        $client = User::factory()->create(['role' => 'Client', 'is_active' => true]);
        ProjectAssignment::create([
            'user_id' => $client->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $admin->id,
        ]);

        $url = "/api/projects/{$project->id}/modules";
        $this->actingAs($client, 'sanctum')->getJson($url)->assertOk();

        $token = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/preview-sessions', ['target_user_id' => $client->id])
            ->assertCreated()
            ->json('data.token');

        $this->actingAs($admin, 'sanctum')
            ->json('GET', $url, [], ['X-Preview-Session' => $token])
            ->assertOk();
    }
}
