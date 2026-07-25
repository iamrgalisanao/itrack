<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\Module;
use App\Models\Activity;
use App\Models\SubActivity;
use App\Models\DetailedActivity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupportOpsControllerTest extends TestCase
{
    use RefreshDatabase;

    private function createUser(?string $role = 'Team Member'): User
    {
        return User::factory()->create(['role' => $role]);
    }

    /**
     * 007-permission-hardening: Team Member/Client Support Ops access is
     * scoped to explicit project_assignments now, not role alone.
     */
    private function assignToProject(User $user, Project $project): ProjectAssignment
    {
        return ProjectAssignment::create([
            'user_id'             => $user->id,
            'project_id'          => $project->id,
            'assigned_by_user_id' => $this->createUser('Admin')->id,
        ]);
    }

    private function makeTask(int $projectId, array $overrides = []): DetailedActivity
    {
        $module      = Module::factory()->create(['project_id' => $projectId]);
        $activity    = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        return DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible'  => false,
            ...$overrides,
        ]);
    }

    // ─── Scoping ─────────────────────────────────────────────────────────────

    public function test_index_returns_only_support_type_tasks_scoped_to_project(): void
    {
        $projectA = Project::factory()->create();
        $projectB = Project::factory()->create();

        $supportInA = $this->makeTask($projectA->id, ['work_type' => 'support', 'name' => 'Support in A']);
        $this->makeTask($projectA->id, ['work_type' => 'project', 'name' => 'Regular project task in A']);
        $this->makeTask($projectB->id, ['work_type' => 'support', 'name' => 'Support in B']);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->getJson("/api/support-ops?project_id={$projectA->id}");

        $res->assertOk();
        $names = collect($res->json('data'))->pluck('name')->all();
        $this->assertEquals(['Support in A'], $names);
        $this->assertNotContains('Regular project task in A', $names);
        $this->assertNotContains('Support in B', $names);
    }

    public function test_index_defaults_to_support_work_type_excluding_learning(): void
    {
        $project = Project::factory()->create();
        $this->makeTask($project->id, ['work_type' => 'support', 'name' => 'A support issue']);
        $this->makeTask($project->id, ['work_type' => 'learning', 'name' => 'A learning entry']);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->getJson("/api/support-ops?project_id={$project->id}");

        $names = collect($res->json('data'))->pluck('name')->all();
        $this->assertEquals(['A support issue'], $names);
    }

    public function test_index_honors_work_types_param_to_include_learning(): void
    {
        $project = Project::factory()->create();
        $this->makeTask($project->id, ['work_type' => 'support', 'name' => 'A support issue']);
        $this->makeTask($project->id, ['work_type' => 'learning', 'name' => 'A learning entry']);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->getJson("/api/support-ops?project_id={$project->id}&work_types=support,learning");

        $names = collect($res->json('data'))->pluck('name')->all();
        $this->assertCount(2, $names);
    }

    // ─── Access control (view) ─────────────────────────────────────────────

    public function test_client_is_denied(): void
    {
        $project = Project::factory()->create();

        $res = $this->actingAs($this->createUser('Client'), 'sanctum')
            ->getJson("/api/support-ops?project_id={$project->id}");

        $res->assertStatus(403);
    }

    public function test_null_role_is_denied(): void
    {
        $project = Project::factory()->create();

        $res = $this->actingAs($this->createUser(null), 'sanctum')
            ->getJson("/api/support-ops?project_id={$project->id}");

        $res->assertStatus(403);
    }

    public function test_department_head_can_view(): void
    {
        $project = Project::factory()->create();

        $res = $this->actingAs($this->createUser('Department Head'), 'sanctum')
            ->getJson("/api/support-ops?project_id={$project->id}");

        $res->assertOk();
    }

    public function test_admin_pm_and_team_member_can_view(): void
    {
        $project = Project::factory()->create();

        foreach (['Admin', 'Project Manager'] as $role) {
            $res = $this->actingAs($this->createUser($role), 'sanctum')
                ->getJson("/api/support-ops?project_id={$project->id}");

            $res->assertOk();
        }

        // Team Member visibility is scoped to explicit assignment (007).
        $teamMember = $this->createUser('Team Member');
        $this->assignToProject($teamMember, $project);
        $this->actingAs($teamMember, 'sanctum')
            ->getJson("/api/support-ops?project_id={$project->id}")
            ->assertOk();
    }

    public function test_unassigned_team_member_is_denied(): void
    {
        $project = Project::factory()->create();

        $res = $this->actingAs($this->createUser('Team Member'), 'sanctum')
            ->getJson("/api/support-ops?project_id={$project->id}");

        $res->assertStatus(403);
    }

    public function test_nonexistent_project_id_produces_identical_403_to_unassigned_existing_project(): void
    {
        $project = Project::factory()->create();
        $teamMember = $this->createUser('Team Member');

        $unassigned = $this->actingAs($teamMember, 'sanctum')
            ->getJson("/api/support-ops?project_id={$project->id}");

        $nonexistent = $this->actingAs($teamMember, 'sanctum')
            ->getJson('/api/support-ops?project_id=999999');

        $unassigned->assertStatus(403);
        $nonexistent->assertStatus(403);
        $this->assertSame($unassigned->getContent(), $nonexistent->getContent());
    }

    // ─── Quick intake (store) ───────────────────────────────────────────────

    private function intakePayload(int $projectId, array $overrides = []): array
    {
        return [
            'project_id'      => $projectId,
            'name'            => 'Checkout screen freezing',
            'client_name'     => 'Acme Corp',
            'client_priority' => 'P1',
            'tenant_name'     => 'Branch 3',
            'channel'         => 'Viber',
            'timestamp'       => '2026-07-22 14:30:00',
            'affected_area'   => 'Checkout screen',
            'expected_behavior' => 'Order confirms and prints a receipt',
            'actual_behavior' => 'Screen freezes, no confirmation shown',
            'evidence'        => 'Log excerpt in comment #1',
            'next_action'     => 'Confirm with the client whether this happens on all devices',
            ...$overrides,
        ];
    }

    public function test_store_creates_issue_with_correct_defaults_and_composed_description(): void
    {
        $project = Project::factory()->create();
        $teamMember = $this->createUser('Team Member');
        $this->assignToProject($teamMember, $project);

        $res = $this->actingAs($teamMember, 'sanctum')
            ->postJson('/api/support-ops', $this->intakePayload($project->id));

        $res->assertCreated();
        $data = $res->json('data');

        $this->assertEquals('support', $data['work_type']);
        $this->assertEquals('backlog', $data['status']);
        $this->assertEquals(0, $data['progress']);
        $this->assertFalse($data['client_visible']);
        $this->assertEquals('Acme Corp', $data['client_name']);
        $this->assertEquals('P1', $data['client_priority']);
        $this->assertStringContainsString('Timestamp: 2026-07-22 14:30:00', $data['description']);
        $this->assertStringContainsString('Area/workflow affected: Checkout screen', $data['description']);
        $this->assertStringContainsString('Expected: Order confirms and prints a receipt', $data['description']);
        $this->assertStringContainsString('Actual: Screen freezes, no confirmation shown', $data['description']);

        $this->assertDatabaseHas('audit_logs', [
            'action'      => 'support_issue.created',
            'entity_type' => 'detailed_activity',
            'entity_id'   => $data['id'],
        ]);
    }

    public function test_store_auto_provisions_hierarchy_idempotently(): void
    {
        $project = Project::factory()->create();
        $user = $this->createUser('Team Member');
        $this->assignToProject($user, $project);

        $this->actingAs($user, 'sanctum')->postJson('/api/support-ops', $this->intakePayload($project->id, ['name' => 'Issue 1']));
        $this->actingAs($user, 'sanctum')->postJson('/api/support-ops', $this->intakePayload($project->id, ['name' => 'Issue 2']));

        $this->assertDatabaseCount('modules', 1);
        $module = \App\Models\Module::first();
        $this->assertEquals('SUPPORT-OPS', $module->code);
        $this->assertEquals($project->id, $module->project_id);

        $this->assertDatabaseCount('activities', 1);
        $this->assertDatabaseCount('sub_activities', 1);
        $this->assertDatabaseCount('detailed_activities', 2);
    }

    public function test_unassigned_team_member_cannot_create_issue(): void
    {
        $project = Project::factory()->create();

        $res = $this->actingAs($this->createUser('Team Member'), 'sanctum')
            ->postJson('/api/support-ops', $this->intakePayload($project->id));

        $res->assertStatus(403);
        $this->assertDatabaseCount('detailed_activities', 0);
    }

    public function test_store_nonexistent_project_id_produces_identical_403_to_unassigned_existing_project(): void
    {
        $project = Project::factory()->create();
        $teamMember = $this->createUser('Team Member');

        $unassigned = $this->actingAs($teamMember, 'sanctum')
            ->postJson('/api/support-ops', $this->intakePayload($project->id));

        $nonexistent = $this->actingAs($teamMember, 'sanctum')
            ->postJson('/api/support-ops', $this->intakePayload(999999));

        $unassigned->assertStatus(403);
        $nonexistent->assertStatus(403);
        $this->assertSame($unassigned->getContent(), $nonexistent->getContent());
    }

    public function test_store_denies_department_head_and_client(): void
    {
        $project = Project::factory()->create();

        foreach (['Department Head', 'Client'] as $role) {
            $res = $this->actingAs($this->createUser($role), 'sanctum')
                ->postJson('/api/support-ops', $this->intakePayload($project->id));

            $res->assertStatus(403);
        }
    }

    public function test_store_denies_null_role(): void
    {
        $project = Project::factory()->create();

        $res = $this->actingAs($this->createUser(null), 'sanctum')
            ->postJson('/api/support-ops', $this->intakePayload($project->id));

        $res->assertStatus(403);
    }

    // ─── Editing an existing issue (T023-T025) ─────────────────────────────

    public function test_team_member_can_update_support_specific_fields(): void
    {
        $project = Project::factory()->create();
        $issue = $this->makeTask($project->id, ['work_type' => 'support']);

        $teamMember = $this->createUser('Team Member');
        \App\Models\ProjectAssignment::create([
            'user_id' => $teamMember->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $this->createUser('Admin')->id,
        ]);

        $res = $this->actingAs($teamMember, 'sanctum')
            ->putJson("/api/detailed-activities/{$issue->id}", [
                'next_action'     => 'Confirm with the client',
                'client_priority' => 'P2',
                'resolution'      => 'Workaround applied',
            ]);

        $res->assertOk();
        $issue->refresh();
        $this->assertEquals('Confirm with the client', $issue->next_action);
        $this->assertEquals('P2', $issue->client_priority);
        $this->assertEquals('Workaround applied', $issue->resolution);
    }

    public function test_department_head_still_denied_on_update(): void
    {
        $project = Project::factory()->create();
        $issue = $this->makeTask($project->id, ['work_type' => 'support']);

        $res = $this->actingAs($this->createUser('Department Head'), 'sanctum')
            ->putJson("/api/detailed-activities/{$issue->id}", [
                'next_action' => 'Should not be allowed',
            ]);

        $res->assertStatus(403);
    }
}
