<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\SubActivity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskboardTest extends TestCase
{
    use RefreshDatabase;

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function user(string $role, string $dept = 'IT'): User
    {
        return User::factory()->create([
            'role' => $role,
            'department' => $dept,
            'is_active' => true,
        ]);
    }

    private function project(): Project
    {
        return Project::create(['name' => 'Test Project', 'department' => 'IT']);
    }

    private function assign(User $user, Project $project): ProjectAssignment
    {
        return ProjectAssignment::create([
            'user_id' => $user->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $this->user('Admin')->id,
        ]);
    }

    private function module(Project $project): Module
    {
        return $project->modules()->create(['name' => 'Test Module']);
    }

    private function callJson($actor, string $method, string $url, array $payload = [])
    {
        return $this->actingAs($actor, 'sanctum')->json($method, $url, $payload);
    }

    // ─── US1: create, sequencing/idempotency, grouping, validation, deletion guard ──

    public function test_admin_creates_task_under_reserved_container(): void
    {
        $admin = $this->user('Admin');
        $project = $this->project();
        $this->assign($admin, $project);
        $module = $this->module($project);

        $response = $this->callJson($admin, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
            'module_id' => $module->id,
            'name' => 'Design the login flow',
            'priority' => 'High',
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.name', 'Design the login flow');
        $response->assertJsonPath('data.module.name', 'Test Module');

        $activity = Activity::where('module_id', $module->id)->where('name', 'Taskboard')->first();
        $this->assertNotNull($activity);
        $subActivity = SubActivity::where('activity_id', $activity->id)->where('name', 'Unclassified Tasks')->first();
        $this->assertNotNull($subActivity);
        $this->assertEquals(1, DetailedActivity::where('sub_activity_id', $subActivity->id)->count());
    }

    public function test_two_creations_against_fresh_module_produce_one_reserved_container_pair(): void
    {
        $pm = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($pm, $project);
        $module = $this->module($project);

        $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", ['module_id' => $module->id, 'name' => 'First']);
        $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", ['module_id' => $module->id, 'name' => 'Second']);

        $this->assertEquals(1, Activity::where('module_id', $module->id)->where('name', 'Taskboard')->count());
        $activity = Activity::where('module_id', $module->id)->where('name', 'Taskboard')->first();
        $this->assertEquals(1, SubActivity::where('activity_id', $activity->id)->where('name', 'Unclassified Tasks')->count());
    }

    public function test_module_id_from_a_different_project_is_rejected(): void
    {
        $pm = $this->user('Project Manager');
        $projectA = $this->project();
        $projectB = $this->project();
        $this->assign($pm, $projectA);
        $this->assign($pm, $projectB);
        $moduleOnB = $this->module($projectB);

        $response = $this->callJson($pm, 'POST', "/api/projects/{$projectA->id}/taskboard/tasks", [
            'module_id' => $moduleOnB->id,
            'name' => 'Should be rejected',
        ]);

        $response->assertStatus(422);
    }

    public function test_sprint_label_is_trimmed_and_blank_normalized(): void
    {
        $pm = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($pm, $project);
        $module = $this->module($project);

        $variants = ['Sprint 1', ' Sprint 1', 'Sprint 1 '];
        foreach ($variants as $label) {
            $res = $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
                'module_id' => $module->id,
                'name' => 'Task with label',
                'sprint_label' => $label,
            ]);
            $res->assertJsonPath('data.sprint_label', 'Sprint 1');
        }

        foreach (['', '   '] as $blank) {
            $res = $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
                'module_id' => $module->id,
                'name' => 'Task with blank label',
                'sprint_label' => $blank,
            ]);
            $res->assertJsonPath('data.sprint_label', null);
        }
    }

    public function test_validation_rejects_missing_title_and_invalid_enums(): void
    {
        $pm = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($pm, $project);
        $module = $this->module($project);

        $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", ['module_id' => $module->id])
            ->assertStatus(422);

        $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
            'module_id' => $module->id, 'name' => 'X', 'priority' => 'Nonsense',
        ])->assertStatus(422);

        $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
            'module_id' => $module->id, 'name' => 'X', 'estimated_story_points' => -1,
        ])->assertStatus(422);

        $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
            'module_id' => $module->id, 'name' => 'X', 'estimated_story_points' => 101,
        ])->assertStatus(422);
    }

    public function test_non_pm_admin_roles_denied_on_create(): void
    {
        $project = $this->project();
        $module = $this->module($project);

        foreach (['Team Member', 'Department Head', 'Client'] as $role) {
            $actor = $this->user($role);
            $this->assign($actor, $project);
            $this->callJson($actor, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
                'module_id' => $module->id, 'name' => 'Nope',
            ])->assertStatus(403);
        }
    }

    public function test_reserved_container_deletion_guard(): void
    {
        $admin = $this->user('Admin');
        $project = $this->project();
        $this->assign($admin, $project);
        $module = $this->module($project);

        $this->callJson($admin, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
            'module_id' => $module->id, 'name' => 'Occupant',
        ])->assertStatus(201);

        $activity = Activity::where('module_id', $module->id)->where('name', 'Taskboard')->first();
        $subActivity = SubActivity::where('activity_id', $activity->id)->first();

        $this->callJson($admin, 'DELETE', "/api/sub-activities/{$subActivity->id}")->assertStatus(409);
        $this->callJson($admin, 'DELETE', "/api/activities/{$activity->id}")->assertStatus(409);

        // Empty containers sharing the reserved names delete normally.
        $emptyActivity = $module->activities()->create(['name' => 'Taskboard']);
        $this->callJson($admin, 'DELETE', "/api/activities/{$emptyActivity->id}")->assertSuccessful();
    }

    // ─── US2: assignment + notification correctness ──────────────────────────

    public function test_assigning_on_create_notifies_once_with_real_detailed_activity_fk(): void
    {
        $pm = $this->user('Project Manager');
        $assignee = $this->user('Team Member');
        $project = $this->project();
        $this->assign($pm, $project);
        $this->assign($assignee, $project);
        $module = $this->module($project);

        $res = $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
            'module_id' => $module->id, 'name' => 'Assign me', 'assignee_user_id' => $assignee->id,
        ]);
        $res->assertStatus(201);
        $taskId = $res->json('data.id');

        $notif = Notification::where('recipient_user_id', $assignee->id)
            ->where('type', Notification::TYPE_ASSIGNMENT)
            ->first();

        $this->assertNotNull($notif);
        $this->assertEquals($taskId, $notif->detailed_activity_id);
    }

    public function test_reassign_notifies_new_resubmit_does_not_clear_does_not(): void
    {
        [$pm, $a, $b, $task] = $this->makeTaskWithTwoCandidates();

        $this->callJson($pm, 'PATCH', "/api/detailed-activities/{$task->id}", ['assignee_user_id' => $a->id])->assertOk();
        $this->assertEquals(1, Notification::where('recipient_user_id', $a->id)->where('type', Notification::TYPE_ASSIGNMENT)->count());

        // Resubmitting the same assignee fires nothing new.
        $this->callJson($pm, 'PATCH', "/api/detailed-activities/{$task->id}", ['assignee_user_id' => $a->id])->assertOk();
        $this->assertEquals(1, Notification::where('recipient_user_id', $a->id)->where('type', Notification::TYPE_ASSIGNMENT)->count());

        // Reassign to B fires exactly one for B, none new for A.
        $this->callJson($pm, 'PATCH', "/api/detailed-activities/{$task->id}", ['assignee_user_id' => $b->id])->assertOk();
        $this->assertEquals(1, Notification::where('recipient_user_id', $b->id)->where('type', Notification::TYPE_ASSIGNMENT)->count());
        $this->assertEquals(1, Notification::where('recipient_user_id', $a->id)->where('type', Notification::TYPE_ASSIGNMENT)->count());

        // Clearing fires nothing.
        $before = Notification::where('type', Notification::TYPE_ASSIGNMENT)->count();
        $this->callJson($pm, 'PATCH', "/api/detailed-activities/{$task->id}", ['assignee_user_id' => null])->assertOk();
        $this->assertEquals($before, Notification::where('type', Notification::TYPE_ASSIGNMENT)->count());
    }

    public function test_reassign_away_and_back_notifies_again(): void
    {
        [$pm, $a, $b, $task] = $this->makeTaskWithTwoCandidates();

        $this->callJson($pm, 'PATCH', "/api/detailed-activities/{$task->id}", ['assignee_user_id' => $a->id])->assertOk();
        $this->callJson($pm, 'PATCH', "/api/detailed-activities/{$task->id}", ['assignee_user_id' => $b->id])->assertOk();
        $this->callJson($pm, 'PATCH', "/api/detailed-activities/{$task->id}", ['assignee_user_id' => $a->id])->assertOk();

        // A was assigned twice (initial + reassigned back) => two notifications for A.
        $this->assertEquals(2, Notification::where('recipient_user_id', $a->id)->where('type', Notification::TYPE_ASSIGNMENT)->count());
        $this->assertEquals(1, Notification::where('recipient_user_id', $b->id)->where('type', Notification::TYPE_ASSIGNMENT)->count());
        $this->assertEquals(3, Notification::where('type', Notification::TYPE_ASSIGNMENT)
            ->whereIn('recipient_user_id', [$a->id, $b->id])->count());
    }

    public function test_rapid_same_second_reassign_sequence_still_notifies_three_times(): void
    {
        // No artificial delay between requests — proves the audit-log-id-based
        // dedup key doesn't collide the way a timestamp-based key could.
        [$pm, $a, $b, $task] = $this->makeTaskWithTwoCandidates();

        $this->callJson($pm, 'PATCH', "/api/detailed-activities/{$task->id}", ['assignee_user_id' => $a->id])->assertOk();
        $this->callJson($pm, 'PATCH', "/api/detailed-activities/{$task->id}", ['assignee_user_id' => $b->id])->assertOk();
        $this->callJson($pm, 'PATCH', "/api/detailed-activities/{$task->id}", ['assignee_user_id' => $a->id])->assertOk();

        $this->assertEquals(3, Notification::where('type', Notification::TYPE_ASSIGNMENT)
            ->whereIn('recipient_user_id', [$a->id, $b->id])->count());
    }

    public function test_assignee_without_project_access_rejected_on_create_and_update(): void
    {
        $pm = $this->user('Project Manager');
        $outsider = $this->user('Team Member'); // real internal user, no access to this project
        $project = $this->project();
        $this->assign($pm, $project);
        $module = $this->module($project);

        $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
            'module_id' => $module->id, 'name' => 'X', 'assignee_user_id' => $outsider->id,
        ])->assertStatus(422);

        $res = $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", ['module_id' => $module->id, 'name' => 'Y']);
        $taskId = $res->json('data.id');

        $this->callJson($pm, 'PATCH', "/api/detailed-activities/{$taskId}", ['assignee_user_id' => $outsider->id])
            ->assertStatus(422);
    }

    private function makeTaskWithTwoCandidates(): array
    {
        $pm = $this->user('Project Manager');
        $a = $this->user('Team Member');
        $b = $this->user('Team Member');
        $project = $this->project();
        $this->assign($pm, $project);
        $this->assign($a, $project);
        $this->assign($b, $project);
        $module = $this->module($project);

        $res = $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
            'module_id' => $module->id, 'name' => 'Assignable task',
        ]);
        $task = DetailedActivity::findOrFail($res->json('data.id'));

        return [$pm, $a, $b, $task];
    }

    // ─── US3: read-only enforcement + Client denial ──────────────────────────

    public function test_team_member_taskboard_fields_silently_stripped_before_validation(): void
    {
        $pm = $this->user('Project Manager');
        $tm = $this->user('Team Member');
        $project = $this->project();
        $this->assign($pm, $project);
        $this->assign($tm, $project);
        $module = $this->module($project);

        $res = $this->callJson($pm, 'POST', "/api/projects/{$project->id}/taskboard/tasks", ['module_id' => $module->id, 'name' => 'X']);
        $taskId = $res->json('data.id');

        $response = $this->callJson($tm, 'PATCH', "/api/detailed-activities/{$taskId}", [
            'status' => 'in_progress',
            'priority' => 'Critical',
            'estimated_story_points' => 5,
            'sprint_label' => 'Sprint 9',
            'assignee_user_id' => 999999, // deliberately invalid — must not cause a 422
        ]);

        $response->assertOk();
        $task = DetailedActivity::findOrFail($taskId);
        $this->assertEquals('in_progress', $task->status);
        $this->assertNull($task->priority);
        $this->assertNull($task->estimated_story_points);
        $this->assertNull($task->sprint_label);
        $this->assertNull($task->assignee_user_id);
    }

    public function test_client_denied_taskboard_index(): void
    {
        $client = $this->user('Client');
        $project = $this->project();
        $this->assign($client, $project);

        $this->callJson($client, 'GET', "/api/projects/{$project->id}/taskboard/tasks")->assertStatus(403);
    }

    public function test_detailed_activity_resource_client_branch_never_exposes_taskboard_fields(): void
    {
        $admin = $this->user('Admin');
        $client = $this->user('Client');
        $project = $this->project();
        $this->assign($admin, $project);
        $this->assign($client, $project);
        $module = $this->module($project);

        $res = $this->callJson($admin, 'POST', "/api/projects/{$project->id}/taskboard/tasks", [
            'module_id' => $module->id, 'name' => 'Visible one', 'priority' => 'High',
        ]);
        $taskId = $res->json('data.id');
        DetailedActivity::where('id', $taskId)->update(['client_visible' => true]);
        $subActivityId = DetailedActivity::find($taskId)->sub_activity_id;

        $response = $this->callJson($client, 'GET', "/api/sub-activities/{$subActivityId}/detailed-activities");

        $response->assertOk();
        $body = $response->json();
        $this->assertArrayNotHasKey('priority', $body[0]);
        $this->assertArrayNotHasKey('estimated_story_points', $body[0]);
        $this->assertArrayNotHasKey('sprint_label', $body[0]);
        $this->assertArrayNotHasKey('assignee_user_id', $body[0]);
    }
}
