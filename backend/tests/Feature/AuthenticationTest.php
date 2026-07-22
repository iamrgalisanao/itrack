<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function createUser(string $role = 'Team Member', string $dept = 'IT'): User
    {
        return User::factory()->create([
            'role'       => $role,
            'department' => $dept,
            'password'   => Hash::make('secret123'),
        ]);
    }

    /**
     * Sanctum's statefulApi() middleware only applies session middleware
     * when the request appears to come from a first-party SPA (i.e. the
     * Referer/Origin host is in the SANCTUM_STATEFUL_DOMAINS list).
     * In tests, requests lack these headers by default, so we add a
     * Referer pointing at a known stateful domain to trigger the
     * session middleware pipeline.
     */
    private function withStatefulHeaders(): static
    {
        return $this->withHeaders([
            'Referer' => 'http://localhost:5173',
            'Origin'  => 'http://localhost:5173',
        ]);
    }

    // ─── Login ────────────────────────────────────────────────────────────────

    public function test_user_can_login_with_valid_credentials(): void
    {
        $user = $this->createUser();

        $response = $this->withStatefulHeaders()
            ->postJson('/api/login', [
                'email'    => $user->email,
                'password' => 'secret123',
            ]);

        $response->assertStatus(200);
        $response->assertJsonStructure(['user' => ['id', 'name', 'email', 'role', 'department']]);
        $response->assertJsonPath('user.email', $user->email);
    }

    public function test_login_fails_with_wrong_password(): void
    {
        $user = $this->createUser();

        $response = $this->withStatefulHeaders()
            ->postJson('/api/login', [
                'email'    => $user->email,
                'password' => 'wrong-password',
            ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['email']);
    }

    public function test_login_fails_with_nonexistent_email(): void
    {
        $response = $this->withStatefulHeaders()
            ->postJson('/api/login', [
                'email'    => 'nobody@example.com',
                'password' => 'anything',
            ]);

        $response->assertStatus(422);
    }

    public function test_login_requires_email_and_password(): void
    {
        $response = $this->withStatefulHeaders()
            ->postJson('/api/login', []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_login_requires_valid_email_format(): void
    {
        $response = $this->withStatefulHeaders()
            ->postJson('/api/login', [
                'email'    => 'not-an-email',
                'password' => 'secret123',
            ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['email']);
    }

    // ─── Me (authenticated user profile) ──────────────────────────────────────

    public function test_authenticated_user_can_fetch_profile(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/me');

        $response->assertStatus(200);
        $response->assertJsonPath('user.email', $user->email);
        $response->assertJsonPath('user.role', $user->role);
    }

    public function test_unauthenticated_user_cannot_fetch_profile(): void
    {
        $response = $this->getJson('/api/me');
        $response->assertStatus(401);
    }

    public function test_me_does_not_expose_password_or_remember_token(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/me');

        $response->assertStatus(200);
        $json = $response->json('user');
        $this->assertArrayNotHasKey('password', $json);
        $this->assertArrayNotHasKey('remember_token', $json);
    }

    // ─── Logout ──────────────────────────────────────────────────────────────

    public function test_authenticated_user_can_logout(): void
    {
        $user = $this->createUser();

        $response = $this->actingAs($user, 'sanctum')
            ->withStatefulHeaders()
            ->postJson('/api/logout');

        $response->assertStatus(204);
    }

    public function test_unauthenticated_user_cannot_logout(): void
    {
        $response = $this->postJson('/api/logout');
        $response->assertStatus(401);
    }

    // ─── Mock-header rejection ─────────────────────────────────────────────────

    public function test_mock_role_header_is_ignored_by_login(): void
    {
        $admin = $this->createUser('Admin', 'IT');

        // A Team Member tries to impersonate Admin via X-Mock-Role header
        $response = $this->withStatefulHeaders()
            ->postJson('/api/login', [
                'email'    => $admin->email,
                'password' => 'secret123',
            ], ['X-Mock-Role' => 'Team Member']);

        // The real user's role is returned, not the mock header value
        $response->assertJsonPath('user.role', 'Admin');
    }

    public function test_mock_headers_do_not_grant_unauthorized_access(): void
    {
        $client = $this->createUser('Client', 'IT');

        // Client sends mock headers pretending to be Admin
        $response = $this->actingAs($client, 'sanctum')
            ->withHeaders(['X-Mock-Role' => 'Admin', 'X-Mock-Department' => 'Finance'])
            ->postJson('/api/projects', ['name' => 'Sneaky Project']);

        // Should still be denied — controllers read from $request->user(), not headers
        $response->assertStatus(403);
    }

    public function test_mock_headers_do_not_bypass_department_scoping(): void
    {
        $teamMember = $this->createUser('Team Member', 'IT');

        Project::factory()->create(['department' => 'IT', 'name' => 'IT Project']);
        Project::factory()->create(['department' => 'Finance', 'name' => 'Finance Project']);

        // Team Member in IT tries to see Finance projects via mock header
        $response = $this->actingAs($teamMember, 'sanctum')
            ->withHeaders(['X-Mock-Department' => 'Finance'])
            ->getJson('/api/projects');

        $names = collect($response->json())->pluck('name');
        $this->assertTrue($names->contains('IT Project'));
        $this->assertFalse($names->contains('Finance Project'));
    }
}
