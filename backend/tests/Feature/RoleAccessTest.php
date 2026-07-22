<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Module;
use App\Models\SubActivity;
use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\TeamMember;
use App\Models\DepartmentGrant;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleAccessTest extends TestCase
{
    use RefreshDatabase;

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function createUser(string $role = 'Team Member', string $dept = 'IT'): User
    {
        return User::factory()->create([
            'role'       => $role,
            'department' => $dept,
        ]);
    }

    private function makeTask(array $overrides = []): DetailedActivity
    {
        $project     = Project::factory()->create(['department' => 'IT']);
        $module      = Module::factory()->create(['project_id' => $project->id]);
        $activity    = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        return DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible'  => false,
            ...$overrides,
        ]);
    }

    // ─── Project Write Guards ─────────────────────────────────────────────────

    public function test_client_cannot_create_project(): void
    {
        $res = $this->actingAs($this->createUser('Client'), 'sanctum')
            ->postJson('/api/projects', ['name' => 'Test']);
        $res->assertStatus(403);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'project.created']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'permission.denied', 'entity_type' => 'project']);
    }

    public function test_team_member_cannot_create_project(): void
    {
        $res = $this->actingAs($this->createUser('Team Member'), 'sanctum')
            ->postJson('/api/projects', ['name' => 'Test']);
        $res->assertStatus(403);
    }

    public function test_department_head_cannot_create_project(): void
    {
        $res = $this->actingAs($this->createUser('Department Head'), 'sanctum')
            ->postJson('/api/projects', ['name' => 'Test']);
        $res->assertStatus(403);
    }

    public function test_project_manager_can_create_project(): void
    {
        $res = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->postJson('/api/projects', ['name' => 'My Project']);
        $res->assertStatus(201)->assertJsonPath('name', 'My Project');
        $this->assertDatabaseHas('audit_logs', ['action' => 'project.created', 'actor_role' => 'Project Manager']);
    }

    public function test_admin_can_create_project(): void
    {
        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson('/api/projects', ['name' => 'Admin Project']);
        $res->assertStatus(201);
        $this->assertDatabaseHas('audit_logs', ['action' => 'project.created', 'actor_role' => 'Admin']);
    }

    public function test_client_cannot_delete_project(): void
    {
        $project = Project::factory()->create();
        $res = $this->actingAs($this->createUser('Client'), 'sanctum')
            ->deleteJson("/api/projects/{$project->id}");
        $res->assertStatus(403);
        $this->assertDatabaseHas('projects', ['id' => $project->id]);
    }

    // ─── Task Write Guards ────────────────────────────────────────────────────

    public function test_client_cannot_create_task(): void
    {
        $project     = Project::factory()->create(['department' => 'IT']);
        $module      = Module::factory()->create(['project_id' => $project->id]);
        $activity    = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        $res = $this->actingAs($this->createUser('Client'), 'sanctum')
            ->postJson("/api/sub-activities/{$subActivity->id}/detailed-activities", ['name' => 'Client Task']);
        $res->assertStatus(403);
        $this->assertDatabaseHas('audit_logs', ['action' => 'permission.denied', 'entity_type' => 'detailed_activity']);
    }

    public function test_department_head_cannot_create_task(): void
    {
        $project     = Project::factory()->create(['department' => 'IT']);
        $module      = Module::factory()->create(['project_id' => $project->id]);
        $activity    = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        $res = $this->actingAs($this->createUser('Department Head'), 'sanctum')
            ->postJson("/api/sub-activities/{$subActivity->id}/detailed-activities", ['name' => 'DH Task']);
        $res->assertStatus(403);
    }

    public function test_team_member_can_create_task(): void
    {
        $project     = Project::factory()->create(['department' => 'IT']);
        $module      = Module::factory()->create(['project_id' => $project->id]);
        $activity    = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        $res = $this->actingAs($this->createUser('Team Member'), 'sanctum')
            ->postJson("/api/sub-activities/{$subActivity->id}/detailed-activities", [
                'name' => 'TM Task', 'status' => 'not_started', 'progress' => 0,
            ]);
        $res->assertStatus(201);
        $this->assertDatabaseHas('audit_logs', ['action' => 'task.created', 'actor_role' => 'Team Member']);
    }

    public function test_client_cannot_update_task(): void
    {
        $task = $this->makeTask();
        $res  = $this->actingAs($this->createUser('Client'), 'sanctum')
            ->putJson("/api/detailed-activities/{$task->id}", ['status' => 'in_progress']);
        $res->assertStatus(403);
    }

    public function test_department_head_cannot_update_task(): void
    {
        $task = $this->makeTask();
        $res  = $this->actingAs($this->createUser('Department Head'), 'sanctum')
            ->putJson("/api/detailed-activities/{$task->id}", ['status' => 'in_progress']);
        $res->assertStatus(403);
    }

    public function test_team_member_can_update_allowed_fields(): void
    {
        $task = $this->makeTask(['status' => 'not_started']);
        $res  = $this->actingAs($this->createUser('Team Member'), 'sanctum')
            ->putJson("/api/detailed-activities/{$task->id}", ['status' => 'in_progress']);
        $res->assertStatus(200)->assertJsonPath('status', 'in_progress');
        $this->assertDatabaseHas('audit_logs', ['action' => 'task.status_changed', 'entity_id' => $task->id]);
    }

    public function test_team_member_cannot_set_client_visible(): void
    {
        $task = $this->makeTask(['client_visible' => false]);
        $this->actingAs($this->createUser('Team Member'), 'sanctum')
            ->putJson("/api/detailed-activities/{$task->id}", ['client_visible' => true]);
        $task->refresh();
        $this->assertFalse($task->client_visible, 'Team Member should not be able to set client_visible');
    }

    public function test_pm_can_set_client_visible_and_audit_is_logged(): void
    {
        $task = $this->makeTask(['client_visible' => false]);
        $res  = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->putJson("/api/detailed-activities/{$task->id}", ['client_visible' => true]);
        $res->assertStatus(200)->assertJsonPath('client_visible', true);
        $this->assertDatabaseHas('audit_logs', ['action' => 'task.client_visibility_changed', 'entity_id' => $task->id]);
    }

    public function test_client_sees_only_client_visible_tasks(): void
    {
        $project     = Project::factory()->create();
        $module      = Module::factory()->create(['project_id' => $project->id]);
        $activity    = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        DetailedActivity::factory()->create(['sub_activity_id' => $subActivity->id, 'client_visible' => false, 'name' => 'Internal Task']);
        DetailedActivity::factory()->create(['sub_activity_id' => $subActivity->id, 'client_visible' => true,  'name' => 'Shared Task']);

        $res = $this->actingAs($this->createUser('Client'), 'sanctum')
            ->getJson("/api/sub-activities/{$subActivity->id}/detailed-activities");
        $res->assertStatus(200);
        $data = $res->json();
        $this->assertCount(1, $data);
        $this->assertEquals('Shared Task', $data[0]['name']);
    }

    public function test_task_delete_requires_pm_or_admin(): void
    {
        $task = $this->makeTask();
        $res  = $this->actingAs($this->createUser('Team Member'), 'sanctum')
            ->deleteJson("/api/detailed-activities/{$task->id}");
        $res->assertStatus(403);
        $this->assertDatabaseHas('detailed_activities', ['id' => $task->id]);
    }

    // ─── Team Member Controller Guards ────────────────────────────────────────

    public function test_non_admin_cannot_add_team_member(): void
    {
        foreach (['Project Manager', 'Team Member', 'Client', 'Department Head'] as $role) {
            $res = $this->actingAs($this->createUser($role), 'sanctum')
                ->postJson('/api/team-members', ['role' => 'Tester']);
            $res->assertStatus(403);
        }
    }

    public function test_admin_can_add_team_member(): void
    {
        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson('/api/team-members', ['role' => 'Developer']);
        $res->assertStatus(201);
        $this->assertDatabaseHas('audit_logs', ['action' => 'member.created', 'actor_role' => 'Admin']);
    }

    public function test_non_admin_cannot_delete_team_member(): void
    {
        $member = TeamMember::factory()->create();
        $res    = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->deleteJson("/api/team-members/{$member->id}");
        $res->assertStatus(403);
    }

    // ─── Audit Log Access ─────────────────────────────────────────────────────

    public function test_audit_log_requires_admin(): void
    {
        foreach (['Project Manager', 'Team Member', 'Client', 'Department Head'] as $role) {
            $res = $this->actingAs($this->createUser($role), 'sanctum')
                ->getJson('/api/audit-logs');
            $res->assertStatus(403);
        }
    }

    public function test_admin_can_view_audit_logs(): void
    {
        $admin = $this->createUser('Admin');

        // Create some audit entries
        Project::factory()->create();
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/projects', ['name' => 'Audited Project']);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/audit-logs');
        $res->assertStatus(200)->assertJsonStructure(['data', 'total', 'per_page', 'current_page']);
    }

    public function test_audit_log_filters_by_action(): void
    {
        $admin = $this->createUser('Admin');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/projects', ['name' => 'Filtered Project']);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/audit-logs?action=project.created');
        $res->assertStatus(200);
        collect($res->json('data'))->each(fn($log) => $this->assertEquals('project.created', $log['action']));
    }

    // ─── Department Grant Guards ──────────────────────────────────────────────

    public function test_non_admin_cannot_manage_department_grants(): void
    {
        foreach (['Project Manager', 'Team Member', 'Client', 'Department Head'] as $role) {
            $res = $this->actingAs($this->createUser($role), 'sanctum')
                ->getJson('/api/department-grants');
            $res->assertStatus(403);
        }
    }

    public function test_admin_can_create_department_grant(): void
    {
        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson('/api/department-grants', [
                'grantee_role'       => 'Department Head',
                'grantee_department' => 'Operations',
                'granted_department' => 'IT',
            ]);

        $res->assertStatus(201);
        $this->assertDatabaseHas('department_grants', [
            'grantee_role'       => 'Department Head',
            'grantee_department' => 'Operations',
            'granted_department' => 'IT',
        ]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'department_grant.created']);
    }

    public function test_duplicate_department_grant_rejected(): void
    {
        $admin   = $this->createUser('Admin');
        $payload = [
            'grantee_role'       => 'Department Head',
            'grantee_department' => 'Operations',
            'granted_department' => 'IT',
        ];
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/department-grants', $payload)->assertStatus(201);
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/department-grants', $payload)->assertStatus(422);
    }

    public function test_admin_can_revoke_department_grant(): void
    {
        $admin = $this->createUser('Admin');

        $grant = DepartmentGrant::create([
            'grantee_role'       => 'Department Head',
            'grantee_department' => 'Finance',
            'granted_department' => 'IT',
            'granted_by_role'    => 'Admin',
        ]);

        $res = $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/department-grants/{$grant->id}");
        $res->assertStatus(204);
        $this->assertDatabaseMissing('department_grants', ['id' => $grant->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'department_grant.deleted']);
    }

    // ─── Department Head Scoping with Grants ─────────────────────────────────

    public function test_department_head_sees_own_dept_projects(): void
    {
        Project::factory()->create(['department' => 'IT', 'name' => 'IT Project']);
        Project::factory()->create(['department' => 'Finance', 'name' => 'Finance Project']);

        $res = $this->actingAs($this->createUser('Department Head', 'IT'), 'sanctum')
            ->getJson('/api/projects');
        $res->assertStatus(200);
        $names = collect($res->json())->pluck('name');
        $this->assertTrue($names->contains('IT Project'));
        $this->assertFalse($names->contains('Finance Project'));
    }

    public function test_department_head_sees_granted_dept_projects(): void
    {
        Project::factory()->create(['department' => 'IT',      'name' => 'IT Project']);
        Project::factory()->create(['department' => 'Finance',  'name' => 'Finance Project']);
        Project::factory()->create(['department' => 'Marketing','name' => 'Marketing Project']);

        // Grant Finance Dept Head access to IT dept
        DepartmentGrant::create([
            'grantee_role'       => 'Department Head',
            'grantee_department' => 'Finance',
            'granted_department' => 'IT',
            'granted_by_role'    => 'Admin',
        ]);

        $res = $this->actingAs($this->createUser('Department Head', 'Finance'), 'sanctum')
            ->getJson('/api/projects');
        $res->assertStatus(200);
        $names = collect($res->json())->pluck('name');
        $this->assertTrue($names->contains('Finance Project'));
        $this->assertTrue($names->contains('IT Project'));       // via grant
        $this->assertFalse($names->contains('Marketing Project')); // not granted
    }

    public function test_admin_can_revoke_grant_and_dept_head_loses_access(): void
    {
        Project::factory()->create(['department' => 'IT', 'name' => 'IT Project']);

        $grant = DepartmentGrant::create([
            'grantee_role'       => 'Department Head',
            'grantee_department' => 'Operations',
            'granted_department' => 'IT',
            'granted_by_role'    => 'Admin',
        ]);

        $deptHead = $this->createUser('Department Head', 'Operations');
        $admin    = $this->createUser('Admin');

        // Before revoke: can see IT
        $res = $this->actingAs($deptHead, 'sanctum')->getJson('/api/projects');
        $this->assertTrue(collect($res->json())->pluck('name')->contains('IT Project'));

        // Revoke
        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/department-grants/{$grant->id}");

        // After revoke: cannot see IT
        $res = $this->actingAs($deptHead, 'sanctum')->getJson('/api/projects');
        $this->assertFalse(collect($res->json())->pluck('name')->contains('IT Project'));
    }
}
