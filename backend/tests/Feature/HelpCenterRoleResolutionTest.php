<?php

namespace Tests\Feature;

use App\Models\ClientOrganization;
use App\Models\Project;
use App\Models\ProjectMembership;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 012-help-center: `client_role` is exposed at two independent response
 * shapes — AuthController::curatedUser() (GET /api/me, POST /api/login)
 * and PreviewSessionResource's `target` (POST /api/preview-sessions) —
 * because useEffectiveUser() reads from whichever one is currently active.
 * See data-model.md "Two response shapes need this field, not one."
 */
class HelpCenterRoleResolutionTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, string $dept = 'IT'): User
    {
        return User::factory()->create([
            'role'       => $role,
            'department' => $dept,
            'is_active'  => true,
        ]);
    }

    private function organization(): ClientOrganization
    {
        return ClientOrganization::create([
            'name'                  => 'Clientco',
            'slug'                  => 'clientco',
            'trusted_domain_policy' => ClientOrganization::POLICY_MANUAL_APPROVAL,
            'status'                => ClientOrganization::STATUS_ACTIVE,
            'created_by_user_id'    => $this->user('Admin')->id,
        ]);
    }

    private function approveMembership(User $client, Project $project, ClientOrganization $organization, string $role): ProjectMembership
    {
        return ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id'             => $project->id,
            'user_id'                => $client->id,
            'role'                   => $role,
            'state'                  => ProjectMembership::STATE_APPROVED,
            'approved_at'            => now(),
            'approved_by_user_id'    => $this->user('Admin')->id,
        ]);
    }

    private function withStatefulHeaders(): static
    {
        return $this->withHeaders([
            'Referer' => 'http://localhost:5173',
            'Origin'  => 'http://localhost:5173',
        ]);
    }

    // ─── GET /api/me ─────────────────────────────────────────────────────────

    public function test_client_with_approved_admin_membership_sees_client_role_on_me(): void
    {
        $client = $this->user('Client');
        $organization = $this->organization();
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $this->approveMembership($client, $project, $organization, ProjectMembership::ROLE_CLIENT_ADMIN);

        $response = $this->actingAs($client, 'sanctum')->getJson('/api/me');

        $response->assertStatus(200);
        $response->assertJsonPath('user.client_role', 'client_admin');
    }

    public function test_client_with_no_approved_membership_sees_null_client_role(): void
    {
        $client = $this->user('Client');

        $response = $this->actingAs($client, 'sanctum')->getJson('/api/me');

        $response->assertStatus(200);
        $response->assertJsonPath('user.client_role', null);
    }

    public function test_non_client_role_always_sees_null_client_role(): void
    {
        $admin = $this->user('Admin');

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/me');

        $response->assertStatus(200);
        $response->assertJsonPath('user.client_role', null);
    }

    public function test_unauthenticated_request_to_me_still_returns_401(): void
    {
        $response = $this->getJson('/api/me');

        $response->assertStatus(401);
    }

    public function test_client_role_reflects_highest_access_across_multiple_memberships(): void
    {
        $client = $this->user('Client');
        $organization = $this->organization();
        $projectA = Project::factory()->create(['client_organization_id' => $organization->id]);
        $projectB = Project::factory()->create(['client_organization_id' => $organization->id]);
        $this->approveMembership($client, $projectA, $organization, ProjectMembership::ROLE_CLIENT_VIEWER);
        $this->approveMembership($client, $projectB, $organization, ProjectMembership::ROLE_CLIENT_ADMIN);

        $response = $this->actingAs($client, 'sanctum')->getJson('/api/me');

        $response->assertJsonPath('user.client_role', 'client_admin');
    }

    // ─── POST /api/preview-sessions ─────────────────────────────────────────

    public function test_previewed_client_admin_membership_appears_on_preview_target(): void
    {
        $admin = $this->user('Admin');
        $client = $this->user('Client');
        $organization = $this->organization();
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $this->approveMembership($client, $project, $organization, ProjectMembership::ROLE_CLIENT_CONTRIBUTOR);

        $response = $this->actingAs($admin, 'sanctum')
            ->withStatefulHeaders()
            ->postJson('/api/preview-sessions', ['target_user_id' => $client->id]);

        $response->assertStatus(201);
        $target = $response->json('data.target') ?? $response->json('target');
        $this->assertSame('client_contributor', $target['client_role']);
    }

    public function test_previewed_non_client_target_has_null_client_role(): void
    {
        $admin = $this->user('Admin');
        $teamMember = $this->user('Team Member');

        $response = $this->actingAs($admin, 'sanctum')
            ->withStatefulHeaders()
            ->postJson('/api/preview-sessions', ['target_user_id' => $teamMember->id]);

        $response->assertStatus(201);
        $target = $response->json('data.target') ?? $response->json('target');
        $this->assertNull($target['client_role']);
    }
}
