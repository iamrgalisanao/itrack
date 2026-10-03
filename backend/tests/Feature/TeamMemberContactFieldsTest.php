<?php

namespace Tests\Feature;

use App\Models\TeamMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TeamMemberContactFieldsTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsRole(string $role): self
    {
        return $this->actingAs(User::factory()->create(['role' => $role]), 'sanctum');
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Ana Reyes',
            'role' => 'Client Lead',
            'organization' => 'PITX',
            'email' => 'ana@pitx.example',
            'phone' => '+63 900 000 0000',
        ], $overrides);
    }

    public function test_admin_creates_member_and_contact_fields_are_stored_and_returned(): void
    {
        $this->actingAsRole(User::ROLE_ADMIN)
            ->postJson('/api/team-members', $this->payload())
            ->assertSuccessful()
            ->assertJsonPath('data.name', 'Ana Reyes')
            ->assertJsonPath('data.organization', 'PITX')
            ->assertJsonPath('data.email', 'ana@pitx.example')
            ->assertJsonPath('data.phone', '+63 900 000 0000');

        $this->assertDatabaseHas('team_members', ['name' => 'Ana Reyes', 'organization' => 'PITX']);
    }

    public function test_contact_fields_are_optional(): void
    {
        $this->actingAsRole(User::ROLE_ADMIN)
            ->postJson('/api/team-members', ['role' => 'Client Lead'])
            ->assertSuccessful()
            ->assertJsonPath('data.name', null);
    }

    public function test_invalid_email_is_rejected(): void
    {
        $this->actingAsRole(User::ROLE_ADMIN)
            ->postJson('/api/team-members', $this->payload(['email' => 'not-an-email']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_project_manager_can_update_contact_fields(): void
    {
        $member = TeamMember::factory()->create(['role' => 'Client Lead']);

        $this->actingAsRole(User::ROLE_PROJECT_MANAGER)
            ->putJson("/api/team-members/{$member->id}", ['name' => 'Ben Cruz', 'phone' => '123'])
            ->assertSuccessful()
            ->assertJsonPath('data.name', 'Ben Cruz');

        $this->assertDatabaseHas('team_members', ['id' => $member->id, 'name' => 'Ben Cruz', 'phone' => '123']);
    }

    public function test_listing_returns_contact_fields_to_internal_roles(): void
    {
        TeamMember::factory()->create($this->payload());

        $this->actingAsRole(User::ROLE_TEAM_MEMBER)
            ->getJson('/api/team-members')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'ana@pitx.example');
    }

    public function test_client_cannot_read_or_write_the_directory(): void
    {
        $member = TeamMember::factory()->create($this->payload());

        $this->actingAsRole(User::ROLE_CLIENT)->getJson('/api/team-members')->assertForbidden();
        $this->actingAsRole(User::ROLE_CLIENT)->getJson("/api/team-members/{$member->id}")->assertForbidden();
        $this->actingAsRole(User::ROLE_CLIENT)->postJson('/api/team-members', $this->payload())->assertForbidden();
    }
}
