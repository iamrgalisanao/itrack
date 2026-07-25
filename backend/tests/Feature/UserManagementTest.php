<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\AuditLog;
use App\Models\Comment;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Project;
use App\Models\SubActivity;
use App\Models\TeamMember;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * Real User Management (006) — Admin-only CRUD for User accounts, the
 * global disabled-account gate, and the last-enabled-Admin invariant.
 */
class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    private function createUser(string $role = 'Team Member', string $dept = 'IT', bool $active = true): User
    {
        return User::factory()->create([
            'role' => $role,
            'department' => $dept,
            'is_active' => $active,
        ]);
    }

    // ─── Foundational: global disabled-account gate (T004-T005) ────────────

    public function test_active_user_unaffected_by_global_gate_on_arbitrary_endpoint(): void
    {
        $user = $this->createUser('Project Manager');

        $res = $this->actingAs($user, 'sanctum')->getJson('/api/projects');

        $res->assertOk();
    }

    public function test_disabled_user_denied_on_arbitrary_endpoint(): void
    {
        $user = $this->createUser('Project Manager', 'IT', active: false);

        $res = $this->actingAs($user, 'sanctum')->getJson('/api/projects');

        $res->assertStatus(401);
    }

    public function test_disabled_user_login_fails_with_generic_message(): void
    {
        // Deliberately no actingAs() here — actingAs(..., 'sanctum') calls
        // Auth::shouldUse('sanctum'), which would make the plain
        // Auth::attempt() call inside login() resolve the wrong guard for
        // the rest of this test method.
        $user = $this->createUser('Project Manager', 'IT', active: false);

        $loginRes = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $loginRes->assertStatus(422);
        $this->assertEquals(
            'The provided credentials are incorrect.',
            $loginRes->json('errors.email.0')
        );
    }

    // ─── Foundational: role gate on every new endpoint (T006) ───────────────

    private function userManagementEndpoints(int $targetId): array
    {
        return [
            ['GET', '/api/users'],
            ['POST', '/api/users'],
            ['PATCH', "/api/users/{$targetId}"],
            ['POST', "/api/users/{$targetId}/disable"],
            ['POST', "/api/users/{$targetId}/reactivate"],
            ['POST', "/api/users/{$targetId}/reset-password"],
        ];
    }

    public function test_every_endpoint_denies_non_admin_roles(): void
    {
        $target = $this->createUser('Team Member');

        foreach (['Project Manager', 'Team Member', 'Department Head', 'Client'] as $role) {
            $nonAdmin = $this->createUser($role);
            foreach ($this->userManagementEndpoints($target->id) as [$method, $uri]) {
                $res = $this->actingAs($nonAdmin, 'sanctum')->json($method, $uri, []);
                $res->assertStatus(403);
            }
        }
    }

    public function test_every_endpoint_denies_unauthenticated_requests(): void
    {
        $target = $this->createUser('Team Member');

        foreach ($this->userManagementEndpoints($target->id) as [$method, $uri]) {
            $res = $this->json($method, $uri, []);
            $res->assertStatus(401);
        }
    }

    // ─── Foundational: UserResource never exposes sensitive fields (T007) ──

    public function test_user_resource_never_exposes_password_or_remember_token(): void
    {
        $admin = $this->createUser('Admin');

        $res = $this->actingAs($admin, 'sanctum')->getJson('/api/users');

        $res->assertOk();
        $res->assertJsonMissingPath('data.0.password');
        $res->assertJsonMissingPath('data.0.remember_token');
        $body = json_encode($res->json());
        $this->assertStringNotContainsString('remember_token', $body);
    }

    // ─── US1: Admin views and creates user accounts (T013-T016) ────────────

    public function test_admin_creates_a_user_and_it_appears_in_the_list_with_an_audit_entry(): void
    {
        $admin = $this->createUser('Admin');

        $res = $this->actingAs($admin, 'sanctum')->postJson('/api/users', [
            'name' => 'New Hire',
            'email' => 'new.hire@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'role' => 'Team Member',
            'department' => 'IT',
        ]);

        $res->assertStatus(201);
        $userId = $res->json('data.id') ?? $res->json('id');

        $listRes = $this->actingAs($admin, 'sanctum')->getJson('/api/users?search=New Hire');
        $listRes->assertOk();
        $listRes->assertJsonFragment(['email' => 'new.hire@example.com']);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'user.created',
            'entity_type' => 'user',
            'entity_id' => $userId,
        ]);

        $log = AuditLog::where('action', 'user.created')->where('entity_id', $userId)->first();
        $this->assertNotNull($log);
        $this->assertEquals('Team Member', $log->metadata['role']);
        $this->assertEquals('IT', $log->metadata['department']);
        $this->assertStringNotContainsString('password123', json_encode($log));
    }

    public function test_creating_a_user_with_a_duplicate_email_is_rejected(): void
    {
        $admin = $this->createUser('Admin');
        $existing = $this->createUser('Team Member', 'IT');

        $res = $this->actingAs($admin, 'sanctum')->postJson('/api/users', [
            'name' => 'Duplicate',
            'email' => $existing->email,
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'role' => 'Team Member',
            'department' => 'IT',
        ]);

        $res->assertStatus(422);
        $this->assertEquals(1, User::where('email', $existing->email)->count());
    }

    public function test_department_required_for_team_member_department_head_and_client_but_not_admin_or_pm(): void
    {
        $admin = $this->createUser('Admin');

        foreach (['Team Member', 'Department Head', 'Client'] as $role) {
            $res = $this->actingAs($admin, 'sanctum')->postJson('/api/users', [
                'name' => "No Dept {$role}",
                'email' => strtolower(str_replace(' ', '.', $role)) . '.nodept@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
                'role' => $role,
            ]);
            $res->assertStatus(422);
        }

        foreach (['Admin', 'Project Manager'] as $role) {
            $res = $this->actingAs($admin, 'sanctum')->postJson('/api/users', [
                'name' => "No Dept {$role}",
                'email' => strtolower(str_replace(' ', '.', $role)) . '.nodept@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
                'role' => $role,
            ]);
            $res->assertStatus(201);
        }
    }

    public function test_index_supports_search_filters_and_pagination_with_a_capped_per_page(): void
    {
        $admin = $this->createUser('Admin');
        $this->createUser('Team Member', 'Finance', active: true);
        $this->createUser('Team Member', 'IT', active: false);

        $byDept = $this->actingAs($admin, 'sanctum')->getJson('/api/users?department=Finance');
        $byDept->assertOk();
        foreach ($byDept->json('data') as $row) {
            $this->assertEquals('Finance', $row['department']);
        }

        $byStatus = $this->actingAs($admin, 'sanctum')->getJson('/api/users?status=disabled');
        $byStatus->assertOk();
        foreach ($byStatus->json('data') as $row) {
            $this->assertFalse($row['is_active']);
        }

        $byRole = $this->actingAs($admin, 'sanctum')->getJson('/api/users?role=Team Member');
        $byRole->assertOk();
        foreach ($byRole->json('data') as $row) {
            $this->assertEquals('Team Member', $row['role']);
        }

        $tooMany = $this->actingAs($admin, 'sanctum')->getJson('/api/users?per_page=101');
        $tooMany->assertStatus(422);

        $capped = $this->actingAs($admin, 'sanctum')->getJson('/api/users?per_page=100');
        $capped->assertOk();
    }

    // ─── US2: Admin edits an existing user (T020-T025) ─────────────────────

    public function test_editing_a_users_department_takes_effect_on_their_very_next_request(): void
    {
        // 007-permission-hardening: Team Member/Client project visibility is
        // now scoped to explicit project_assignments, not department — a
        // department edit no longer changes what they see at all, by
        // design (FR-001-FR-003). Department Head is used here instead,
        // since its department-based scoping (department + DepartmentGrant)
        // is explicitly unchanged by that feature (FR-004) — this keeps
        // testing 006's actual concern (an edit takes effect on the very
        // next request, no re-login) on a role where department still
        // governs visibility.
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Department Head', 'IT');
        Project::factory()->create(['department' => 'Finance']);

        $before = $this->actingAs($target, 'sanctum')->getJson('/api/projects');
        $before->assertOk();
        $this->assertCount(0, $before->json());

        $this->actingAs($admin, 'sanctum')->patchJson("/api/users/{$target->id}", [
            'department' => 'Finance',
        ])->assertOk();

        $after = $this->actingAs($target->fresh(), 'sanctum')->getJson('/api/projects');
        $after->assertOk();
        $this->assertCount(1, $after->json());
    }

    public function test_editing_a_users_email_to_one_already_in_use_is_rejected(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member', 'IT');
        $other = $this->createUser('Team Member', 'IT');

        $res = $this->actingAs($admin, 'sanctum')->patchJson("/api/users/{$target->id}", [
            'email' => $other->email,
        ]);

        $res->assertStatus(422);
    }

    public function test_safe_demotion_succeeds_but_the_resulting_sole_admin_cannot_then_be_demoted(): void
    {
        // Exactly two enabled Admins: adminA and adminB.
        $adminA = $this->createUser('Admin');
        $adminB = $this->createUser('Admin');

        // Step 1: adminA demotes adminB. One enabled Admin (adminA) remains
        // afterward — safe, must succeed.
        $step1 = $this->actingAs($adminA, 'sanctum')->patchJson("/api/users/{$adminB->id}", [
            'role' => 'Team Member',
        ]);
        $step1->assertOk();
        $this->assertEquals('Team Member', $adminB->fresh()->role);

        // Step 2: adminA is now the sole enabled Admin. Any attempt to demote
        // adminA — including by adminA themself — must be rejected.
        $step2 = $this->actingAs($adminA, 'sanctum')->patchJson("/api/users/{$adminA->id}", [
            'role' => 'Team Member',
        ]);
        $step2->assertStatus(422);
        $this->assertEquals('Admin', $adminA->fresh()->role);
    }

    public function test_user_updated_audit_entry_contains_only_changed_fields_never_password_or_is_active(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member', 'IT');

        $this->actingAs($admin, 'sanctum')->patchJson("/api/users/{$target->id}", [
            'department' => 'Finance',
        ])->assertOk();

        $log = AuditLog::where('action', 'user.updated')->where('entity_id', $target->id)->first();
        $this->assertNotNull($log);
        $this->assertEquals(['department'], $log->metadata['changed_fields']);
        $this->assertArrayNotHasKey('password', $log->metadata['old']);
        $this->assertArrayNotHasKey('password', $log->metadata['new']);
        $this->assertArrayNotHasKey('is_active', $log->metadata['old']);
        $this->assertArrayNotHasKey('is_active', $log->metadata['new']);
    }

    public function test_editing_a_users_role_never_touches_team_member_rows(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member', 'IT');
        $teamMemberCountBefore = TeamMember::count();
        $teamMembersBefore = TeamMember::all()->toArray();

        $this->actingAs($admin, 'sanctum')->patchJson("/api/users/{$target->id}", [
            'role' => 'Department Head',
        ])->assertOk();

        $this->assertEquals($teamMemberCountBefore, TeamMember::count());
        $this->assertEquals($teamMembersBefore, TeamMember::all()->toArray());
    }

    public function test_is_active_and_password_in_update_request_body_have_no_effect(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member', 'IT', active: true);
        $originalPasswordHash = $target->password;

        $res = $this->actingAs($admin, 'sanctum')->patchJson("/api/users/{$target->id}", [
            'name' => 'Still Same Person',
            'is_active' => false,
            'password' => 'maliciously-injected-password',
        ]);

        $res->assertOk();
        $fresh = $target->fresh();
        $this->assertTrue($fresh->is_active);
        $this->assertEquals($originalPasswordHash, $fresh->password);
    }

    // ─── US3: Admin disables or reactivates a user account (T028-T033) ────

    private function createDetailedActivity(): DetailedActivity
    {
        $project = Project::factory()->create(['department' => 'IT']);
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        return DetailedActivity::factory()->create(['sub_activity_id' => $subActivity->id]);
    }

    public function test_disabling_denies_the_targets_existing_session(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Project Manager', 'IT');

        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$target->id}/disable")->assertOk();

        $sessionRes = $this->actingAs($target->fresh(), 'sanctum')->getJson('/api/projects');
        $sessionRes->assertStatus(401);
    }

    public function test_disabling_denies_a_fresh_login_attempt(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Project Manager', 'IT');
        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$target->id}/disable")->assertOk();

        // actingAs(..., 'sanctum') switched the default guard for the rest
        // of this test method — restore it before login() runs a bare
        // Auth::attempt(), which resolves via the default guard (see the
        // guard-switching note on test_disabled_user_login_fails_with_generic_message).
        \Illuminate\Support\Facades\Auth::shouldUse('web');

        $loginRes = $this->postJson('/api/login', [
            'email' => $target->email,
            'password' => 'password',
        ]);
        $loginRes->assertStatus(422);
        $this->assertEquals(
            'The provided credentials are incorrect.',
            $loginRes->json('errors.email.0')
        );
    }

    public function test_reactivating_restores_existing_session_access(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Project Manager', 'IT', active: false);

        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$target->id}/reactivate")->assertOk();

        $sessionRes = $this->actingAs($target->fresh(), 'sanctum')->getJson('/api/projects');
        $sessionRes->assertOk();
    }

    public function test_reactivating_restores_login(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Project Manager', 'IT', active: false);
        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$target->id}/reactivate")->assertOk();

        // actingAs(..., 'sanctum') switched the default guard for the rest
        // of this test method — restore it before login() runs a bare
        // Auth::attempt() (see the guard-switching note above).
        \Illuminate\Support\Facades\Auth::shouldUse('web');

        $loginRes = $this->postJson('/api/login', [
            'email' => $target->email,
            'password' => 'password',
        ]);
        $loginRes->assertOk();
    }

    public function test_safe_disable_succeeds_but_the_resulting_sole_admin_cannot_then_disable_themselves(): void
    {
        // Exactly two enabled Admins: adminA and adminB.
        $adminA = $this->createUser('Admin');
        $adminB = $this->createUser('Admin');

        // Step 1: adminA disables adminB. One enabled Admin (adminA) remains
        // afterward — safe, must succeed.
        $step1 = $this->actingAs($adminA, 'sanctum')->postJson("/api/users/{$adminB->id}/disable");
        $step1->assertOk();
        $this->assertFalse($adminB->fresh()->is_active);

        // Step 2: adminA is now the sole enabled Admin. Disabling adminA —
        // including by adminA themself — must be rejected.
        $step2 = $this->actingAs($adminA, 'sanctum')->postJson("/api/users/{$adminA->id}/disable");
        $step2->assertStatus(422);
        $this->assertTrue($adminA->fresh()->is_active);
    }

    public function test_disabling_a_user_never_touches_their_historical_audit_entries_or_comments(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member', 'IT');

        $detailedActivity = $this->createDetailedActivity();
        $comment = Comment::create([
            'detailed_activity_id' => $detailedActivity->id,
            'author' => $target->name,
            'author_role' => $target->role,
            'body' => 'Historical comment from before disabling.',
        ]);

        AuditLogger::record(
            new Request(),
            'task.status_changed',
            'detailed_activity',
            $detailedActivity->id,
            'Pre-existing historical entry.',
            []
        );

        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$target->id}/disable")->assertOk();

        $comment->refresh();
        $this->assertEquals($target->name, $comment->author);
        $this->assertEquals($target->role, $comment->author_role);
        $this->assertEquals('Historical comment from before disabling.', $comment->body);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'task.status_changed',
            'entity_id' => $detailedActivity->id,
            'description' => 'Pre-existing historical entry.',
        ]);
    }

    public function test_disable_and_reactivate_create_audit_entries_identifying_actor_and_target(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member', 'IT');

        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$target->id}/disable")->assertOk();
        $disableLog = AuditLog::where('action', 'user.disabled')->where('entity_id', $target->id)->first();
        $this->assertNotNull($disableLog);
        $this->assertEquals($admin->id, $disableLog->actor_user_id);

        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$target->id}/reactivate")->assertOk();
        $reactivateLog = AuditLog::where('action', 'user.reactivated')->where('entity_id', $target->id)->first();
        $this->assertNotNull($reactivateLog);
        $this->assertEquals($admin->id, $reactivateLog->actor_user_id);
    }

    /**
     * Sequential proxy for the true concurrent case (PHPUnit's runner is
     * synchronous — this cannot exercise real concurrent requests). The
     * invariant holds across two sequential disable attempts targeting two
     * different remaining-enabled Admins.
     *
     * The deeper claim this task requires — that update()'s demotion path
     * and disable()'s path call the exact same wouldLeaveNoEnabledAdmins()
     * helper, not two independently-drifting implementations — was verified
     * by direct code inspection of UserManagementController::update() and
     * ::disable(), both of which call $user->wouldLeaveNoEnabledAdmins(...)
     * from App\Models\User.
     */
    public function test_last_admin_invariant_holds_across_sequential_disable_attempts(): void
    {
        $adminA = $this->createUser('Admin');
        $adminB = $this->createUser('Admin');
        $adminC = $this->createUser('Admin');

        $this->actingAs($adminA, 'sanctum')->postJson("/api/users/{$adminB->id}/disable")->assertOk();
        $this->assertFalse($adminB->fresh()->is_active);

        // adminA and adminC are still enabled — disabling adminC is still safe.
        $this->actingAs($adminA, 'sanctum')->postJson("/api/users/{$adminC->id}/disable")->assertOk();
        $this->assertFalse($adminC->fresh()->is_active);

        // Only adminA remains enabled now — disabling adminA must be rejected.
        $this->actingAs($adminA, 'sanctum')->postJson("/api/users/{$adminA->id}/disable")->assertStatus(422);
        $this->assertTrue($adminA->fresh()->is_active);
    }

    // ─── US4: Admin resets a user's password (T036-T038) ───────────────────

    public function test_after_reset_the_user_can_sign_in_with_the_new_password_and_not_the_old_one(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member', 'IT');

        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$target->id}/reset-password", [
            'password' => 'brand-new-password',
            'password_confirmation' => 'brand-new-password',
        ])->assertOk();

        // actingAs(..., 'sanctum') switched the default guard for the rest
        // of this test method — restore it before login() runs a bare
        // Auth::attempt() (see the guard-switching note above).
        \Illuminate\Support\Facades\Auth::shouldUse('web');

        $oldPasswordRes = $this->postJson('/api/login', [
            'email' => $target->email,
            'password' => 'password',
        ]);
        $oldPasswordRes->assertStatus(422);

        $newPasswordRes = $this->postJson('/api/login', [
            'email' => $target->email,
            'password' => 'brand-new-password',
        ]);
        $newPasswordRes->assertOk();
    }

    public function test_reset_rejects_a_short_password_or_a_mismatched_confirmation(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member', 'IT');

        $tooShort = $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$target->id}/reset-password", [
            'password' => 'short1',
            'password_confirmation' => 'short1',
        ]);
        $tooShort->assertStatus(422);

        $mismatched = $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$target->id}/reset-password", [
            'password' => 'a-long-enough-password',
            'password_confirmation' => 'does-not-match',
        ]);
        $mismatched->assertStatus(422);
    }

    public function test_password_reset_audit_entry_identifies_actor_and_target_with_no_password_value(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member', 'IT');

        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$target->id}/reset-password", [
            'password' => 'brand-new-password',
            'password_confirmation' => 'brand-new-password',
        ])->assertOk();

        $log = AuditLog::where('action', 'user.password_reset')->where('entity_id', $target->id)->first();
        $this->assertNotNull($log);
        $this->assertEquals($admin->id, $log->actor_user_id);
        $this->assertStringNotContainsString('brand-new-password', json_encode($log));
    }
}
