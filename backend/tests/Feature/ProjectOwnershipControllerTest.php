<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Project;
use App\Models\ProjectOwnership;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 008-project-ownership: real ownership CRUD (US1), transfer + audit (US3).
 * US2's enforcement-matrix tests live in ProjectScopingTest.php, since they
 * extend ProjectAssignmentController, not this controller.
 */
class ProjectOwnershipControllerTest extends TestCase
{
    use RefreshDatabase;

    private function createUser(string $role = 'Project Manager', string $dept = 'IT', bool $active = true): User
    {
        return User::factory()->create([
            'role'       => $role,
            'department' => $dept,
            'is_active'  => $active,
        ]);
    }

    private function callJson($actor, string $method, string $url, array $payload = [])
    {
        return $this->actingAs($actor, 'sanctum')->json($method, $url, $payload);
    }

    // ─── T007: Admin assigns a PM as project owner ────────────────────────────

    public function test_admin_assigns_pm_as_project_owner(): void
    {
        $admin = $this->createUser('Admin');
        $pm = $this->createUser('Project Manager');
        $project = Project::factory()->create();

        $response = $this->callJson($admin, 'POST', '/api/project-ownerships', [
            'user_id' => $pm->id, 'project_id' => $project->id,
        ]);
        $response->assertStatus(201);

        $list = $this->callJson($admin, 'GET', '/api/project-ownerships?project_id=' . $project->id);
        $list->assertStatus(200);
        $this->assertCount(1, $list->json('data'));
        $this->assertEquals($pm->id, $list->json('data.0.user.id'));

        $this->assertEquals(1, AuditLog::where('action', 'project_ownership.created')->count());
    }

    // ─── T008: a project can have more than one owner (FR-004) ────────────────

    public function test_project_can_have_more_than_one_owner(): void
    {
        $admin = $this->createUser('Admin');
        $pmA = $this->createUser('Project Manager');
        $pmB = $this->createUser('Project Manager');
        $project = Project::factory()->create();

        $this->callJson($admin, 'POST', '/api/project-ownerships', ['user_id' => $pmA->id, 'project_id' => $project->id])
            ->assertStatus(201);
        $this->callJson($admin, 'POST', '/api/project-ownerships', ['user_id' => $pmB->id, 'project_id' => $project->id])
            ->assertStatus(201);

        $this->assertEquals(2, ProjectOwnership::where('project_id', $project->id)->count());
    }

    // ─── T009: only active PM accounts are valid ownership targets (FR-005) ───

    public function test_only_active_project_manager_accounts_are_valid_ownership_targets(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create();

        foreach (['Team Member', 'Client', 'Department Head', 'Admin'] as $role) {
            $target = $this->createUser($role);
            $this->callJson($admin, 'POST', '/api/project-ownerships', ['user_id' => $target->id, 'project_id' => $project->id])
                ->assertStatus(422);
        }

        $disabledPm = $this->createUser('Project Manager', 'IT', false);
        $this->callJson($admin, 'POST', '/api/project-ownerships', ['user_id' => $disabledPm->id, 'project_id' => $project->id])
            ->assertStatus(422);
    }

    // ─── T010: duplicate grant is idempotent ───────────────────────────────────

    public function test_duplicate_ownership_grant_is_idempotent(): void
    {
        $admin = $this->createUser('Admin');
        $pm = $this->createUser('Project Manager');
        $project = Project::factory()->create();

        $this->callJson($admin, 'POST', '/api/project-ownerships', ['user_id' => $pm->id, 'project_id' => $project->id])
            ->assertStatus(201);
        $this->callJson($admin, 'POST', '/api/project-ownerships', ['user_id' => $pm->id, 'project_id' => $project->id])
            ->assertStatus(200);

        $this->assertEquals(1, ProjectOwnership::where('user_id', $pm->id)->where('project_id', $project->id)->count());
        $this->assertEquals(1, AuditLog::where('action', 'project_ownership.created')->count());
    }

    // ─── T011: non-Admin denied on all three endpoints, including PM reads ────

    public function test_non_admin_denied_on_all_ownership_endpoints(): void
    {
        $project = Project::factory()->create();
        $owner = $this->createUser('Project Manager');
        $ownership = ProjectOwnership::create([
            'user_id' => $owner->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $this->createUser('Admin')->id,
        ]);

        foreach (['Project Manager', 'Department Head', 'Team Member', 'Client'] as $role) {
            $actor = $this->createUser($role);
            $target = $this->createUser('Project Manager');

            $this->callJson($actor, 'GET', '/api/project-ownerships')->assertStatus(403);
            $this->callJson($actor, 'POST', '/api/project-ownerships', ['user_id' => $target->id, 'project_id' => $project->id])
                ->assertStatus(403);
            $this->callJson($actor, 'DELETE', '/api/project-ownerships/' . $ownership->id)->assertStatus(403);
        }
    }

    // ─── T012: removing an owner is allowed; zero-owner state is valid ────────

    public function test_removing_owner_is_allowed_and_zero_owner_state_is_valid(): void
    {
        $admin = $this->createUser('Admin');
        $pm = $this->createUser('Project Manager');
        $project = Project::factory()->create();

        $ownership = ProjectOwnership::create([
            'user_id' => $pm->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $admin->id,
        ]);

        $this->callJson($admin, 'DELETE', '/api/project-ownerships/' . $ownership->id)->assertStatus(204);

        $this->assertEquals(0, ProjectOwnership::where('project_id', $project->id)->count());
        $this->assertEquals(1, AuditLog::where('action', 'project_ownership.deleted')->count());
    }

    // ─── T013: deleting a project cascades its ownership rows (FR-014) ────────

    public function test_deleting_project_cascades_ownership_rows(): void
    {
        $admin = $this->createUser('Admin');
        $pm = $this->createUser('Project Manager');
        $project = Project::factory()->create();

        ProjectOwnership::create([
            'user_id' => $pm->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $admin->id,
        ]);

        $project->delete();

        $this->assertEquals(0, ProjectOwnership::where('project_id', $project->id)->count());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // User Story 3: ownership changes hands cleanly and is fully audited
    // ═══════════════════════════════════════════════════════════════════════

    // ─── T026: transfer is atomic, one audit entry, entity_id = surviving row ─

    public function test_transfer_is_atomic_and_produces_one_audit_entry(): void
    {
        $admin = $this->createUser('Admin');
        $pmA = $this->createUser('Project Manager');
        $pmB = $this->createUser('Project Manager');
        $project = Project::factory()->create();

        $ownership = ProjectOwnership::create([
            'user_id' => $pmA->id, 'project_id' => $project->id, 'assigned_by_user_id' => $admin->id,
        ]);
        $tm = $this->createUser('Team Member', $project->department ?? 'IT');

        $response = $this->callJson($admin, 'POST', "/api/project-ownerships/{$ownership->id}/transfer", [
            'new_owner_user_id' => $pmB->id,
        ]);
        $response->assertStatus(200);

        // Old owner loses authority immediately.
        $this->callJson($pmA, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(403);
        // New owner gains authority immediately — no re-login.
        $this->callJson($pmB, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(201);

        $this->assertEquals(1, AuditLog::where('action', 'project_ownership.transferred')->count());
        $entry = AuditLog::where('action', 'project_ownership.transferred')->first();
        $newOwnership = ProjectOwnership::where('project_id', $project->id)->where('user_id', $pmB->id)->first();
        $this->assertEquals($newOwnership->id, $entry->entity_id);
        $this->assertEquals($pmA->id, $entry->metadata['from_user_id']);
        $this->assertEquals($pmB->id, $entry->metadata['to_user_id']);
    }

    // ─── T027: transferring to an existing co-owner consolidates ──────────────

    public function test_transfer_to_existing_co_owner_consolidates(): void
    {
        $admin = $this->createUser('Admin');
        $pmA = $this->createUser('Project Manager');
        $pmB = $this->createUser('Project Manager');
        $project = Project::factory()->create();

        $ownershipA = ProjectOwnership::create([
            'user_id' => $pmA->id, 'project_id' => $project->id, 'assigned_by_user_id' => $admin->id,
        ]);
        ProjectOwnership::create([
            'user_id' => $pmB->id, 'project_id' => $project->id, 'assigned_by_user_id' => $admin->id,
        ]);

        $response = $this->callJson($admin, 'POST', "/api/project-ownerships/{$ownershipA->id}/transfer", [
            'new_owner_user_id' => $pmB->id,
        ]);
        $response->assertStatus(200);

        $this->assertEquals(1, ProjectOwnership::where('project_id', $project->id)->count());
        $this->assertEquals($pmB->id, ProjectOwnership::where('project_id', $project->id)->first()->user_id);
        $this->assertEquals(1, AuditLog::where('action', 'project_ownership.transferred')->count());
    }

    // ─── T028: a vanished ownership row aborts with 409, no phantom owner ─────

    public function test_transfer_of_already_removed_ownership_returns_409_without_creating_phantom_owner(): void
    {
        $admin = $this->createUser('Admin');
        $pmA = $this->createUser('Project Manager');
        $pmB = $this->createUser('Project Manager');
        $project = Project::factory()->create();

        $ownership = ProjectOwnership::create([
            'user_id' => $pmA->id, 'project_id' => $project->id, 'assigned_by_user_id' => $admin->id,
        ]);
        $ownershipId = $ownership->id;

        // Simulate "a concurrent transfer already won and removed this row"
        // deterministically, without needing real multi-connection races.
        $ownership->delete();

        $response = $this->callJson($admin, 'POST', "/api/project-ownerships/{$ownershipId}/transfer", [
            'new_owner_user_id' => $pmB->id,
        ]);
        $response->assertStatus(409);

        $this->assertEquals(0, ProjectOwnership::where('project_id', $project->id)->where('user_id', $pmB->id)->count());
    }

    // ─── T029: transfer target validation ──────────────────────────────────────

    public function test_transfer_target_validation(): void
    {
        $admin = $this->createUser('Admin');
        $pmA = $this->createUser('Project Manager');
        $project = Project::factory()->create();

        $ownership = ProjectOwnership::create([
            'user_id' => $pmA->id, 'project_id' => $project->id, 'assigned_by_user_id' => $admin->id,
        ]);

        // Not an active PM.
        $tm = $this->createUser('Team Member');
        $this->callJson($admin, 'POST', "/api/project-ownerships/{$ownership->id}/transfer", ['new_owner_user_id' => $tm->id])
            ->assertStatus(422);

        // Same as current owner.
        $this->callJson($admin, 'POST', "/api/project-ownerships/{$ownership->id}/transfer", ['new_owner_user_id' => $pmA->id])
            ->assertStatus(422);
    }

    // ─── T030: dormant owner loses/regains authority; a different PM stays denied

    public function test_dormant_owner_authority_and_other_pm_remains_denied_during_dormancy(): void
    {
        $admin = $this->createUser('Admin');
        $pmA = $this->createUser('Project Manager');
        $pmC = $this->createUser('Project Manager'); // never an owner
        $tm = $this->createUser('Team Member', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);

        ProjectOwnership::create([
            'user_id' => $pmA->id, 'project_id' => $project->id, 'assigned_by_user_id' => $admin->id,
        ]);

        // Role-changed away from PM — authority goes dormant.
        $pmA->update(['role' => 'Team Member']);
        $this->callJson($pmA->fresh(), 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(403);

        // A different PM is NOT let in just because the sole owner is dormant —
        // the project is not ownerless (the row still exists), so FR-018 must
        // not incorrectly reapply here.
        $this->callJson($pmC, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(403);

        // Restore role — authority resumes automatically, zero re-assignment.
        $pmA->update(['role' => 'Project Manager']);
        $this->callJson($pmA->fresh(), 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(201);
    }
}
