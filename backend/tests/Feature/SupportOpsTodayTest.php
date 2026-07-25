<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\DepartmentGrant;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Project;
use App\Models\SubActivity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupportOpsTodayTest extends TestCase
{
    use RefreshDatabase;

    private function createUser(?string $role, ?string $department = 'IT'): User
    {
        return User::factory()->create(['role' => $role, 'department' => $department]);
    }

    private function makeIssue(int $projectId, array $overrides = []): DetailedActivity
    {
        $module      = Module::factory()->create(['project_id' => $projectId]);
        $activity    = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        return DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible'  => false,
            'work_type'       => 'support',
            'status'          => 'in_progress',
            ...$overrides,
        ]);
    }

    private function endpoint(): string
    {
        return '/api/support-ops/today';
    }

    private function idsIn(\Illuminate\Testing\TestResponse $res, string $section): \Illuminate\Support\Collection
    {
        return collect($res->json($section))->pluck('id');
    }

    // ─── Role matrix (T011) ─────────────────────────────────────────────────

    public function test_internal_roles_can_access(): void
    {
        foreach (['Admin', 'Project Manager', 'Team Member', 'Department Head'] as $role) {
            $res = $this->actingAs($this->createUser($role), 'sanctum')->getJson($this->endpoint());
            $res->assertOk();
        }
    }

    public function test_client_is_denied(): void
    {
        $res = $this->actingAs($this->createUser('Client'), 'sanctum')->getJson($this->endpoint());
        $res->assertStatus(403);
    }

    public function test_null_role_is_denied(): void
    {
        $res = $this->actingAs($this->createUser(null), 'sanctum')->getJson($this->endpoint());
        $res->assertStatus(403);
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $res = $this->getJson($this->endpoint());
        $res->assertStatus(401);
    }

    // ─── Cross-project leakage matrix (T012) ────────────────────────────────

    public function test_team_member_sees_issue_from_own_department_project(): void
    {
        $project = Project::factory()->create(['department' => 'IT']);
        $issue = $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subMinutes(5),
        ]);

        $teamMember = $this->createUser('Team Member', 'IT');
        \App\Models\ProjectAssignment::create([
            'user_id' => $teamMember->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $this->createUser('Admin', 'IT')->id,
        ]);

        $res = $this->actingAs($teamMember, 'sanctum')->getJson($this->endpoint());

        $res->assertOk();
        $this->assertTrue($this->idsIn($res, 'watch_closely')->contains($issue->id));
    }

    public function test_team_member_does_not_see_issue_from_other_department_project(): void
    {
        $itProject = Project::factory()->create(['department' => 'IT']);
        $financeProject = Project::factory()->create(['department' => 'Finance']);
        $itIssue = $this->makeIssue($itProject->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subMinutes(5),
        ]);
        $financeIssue = $this->makeIssue($financeProject->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subMinutes(5),
        ]);

        $teamMember = $this->createUser('Team Member', 'IT');
        \App\Models\ProjectAssignment::create([
            'user_id' => $teamMember->id,
            'project_id' => $itProject->id,
            'assigned_by_user_id' => $this->createUser('Admin', 'IT')->id,
        ]);

        $res = $this->actingAs($teamMember, 'sanctum')->getJson($this->endpoint());

        $res->assertOk();
        $ids = $this->idsIn($res, 'watch_closely');
        $this->assertTrue($ids->contains($itIssue->id));
        $this->assertFalse($ids->contains($financeIssue->id));
    }

    public function test_admin_and_project_manager_see_both_departments(): void
    {
        $itProject = Project::factory()->create(['department' => 'IT']);
        $financeProject = Project::factory()->create(['department' => 'Finance']);
        $itIssue = $this->makeIssue($itProject->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subMinutes(5),
        ]);
        $financeIssue = $this->makeIssue($financeProject->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subMinutes(5),
        ]);

        foreach (['Admin', 'Project Manager'] as $role) {
            $res = $this->actingAs($this->createUser($role, 'Marketing'), 'sanctum')->getJson($this->endpoint());
            $res->assertOk();
            $ids = $this->idsIn($res, 'watch_closely');
            $this->assertTrue($ids->contains($itIssue->id));
            $this->assertTrue($ids->contains($financeIssue->id));
        }
    }

    public function test_department_head_sees_only_granted_departments(): void
    {
        $itProject = Project::factory()->create(['department' => 'IT']);
        $financeProject = Project::factory()->create(['department' => 'Finance']);
        $itIssue = $this->makeIssue($itProject->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subMinutes(5),
        ]);
        $financeIssue = $this->makeIssue($financeProject->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subMinutes(5),
        ]);

        $deptHead = $this->createUser('Department Head', 'IT');

        // No grant to Finance yet — only IT should be visible.
        $res = $this->actingAs($deptHead, 'sanctum')->getJson($this->endpoint());
        $res->assertOk();
        $ids = $this->idsIn($res, 'watch_closely');
        $this->assertTrue($ids->contains($itIssue->id));
        $this->assertFalse($ids->contains($financeIssue->id));

        // Grant Finance to IT's Department Head — now both are visible.
        DepartmentGrant::create([
            'grantee_role'       => 'Department Head',
            'grantee_department' => 'IT',
            'granted_department' => 'Finance',
            'granted_by_role'    => 'Admin',
        ]);

        $res2 = $this->actingAs($deptHead, 'sanctum')->getJson($this->endpoint());
        $ids2 = $this->idsIn($res2, 'watch_closely');
        $this->assertTrue($ids2->contains($itIssue->id));
        $this->assertTrue($ids2->contains($financeIssue->id));
    }

    // ─── Stale vs. P1-Watch-Closely + sort order (T013) ─────────────────────

    public function test_stale_and_not_yet_stale_p1_issues_are_classified_correctly(): void
    {
        $project = Project::factory()->create();
        $staleIssue = $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subHours(2),
        ]);
        $freshIssue = $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subMinutes(10),
        ]);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')->getJson($this->endpoint());

        $res->assertOk();
        $this->assertTrue($this->idsIn($res, 'stale')->contains($staleIssue->id));
        $this->assertFalse($this->idsIn($res, 'watch_closely')->contains($staleIssue->id));
        $this->assertTrue($this->idsIn($res, 'watch_closely')->contains($freshIssue->id));
        $this->assertFalse($this->idsIn($res, 'stale')->contains($freshIssue->id));
    }

    public function test_stale_bucket_is_sorted_most_overdue_first(): void
    {
        $project = Project::factory()->create();
        // Less overdue: crossed its threshold 10 minutes ago.
        $lessOverdue = $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subMinutes(70), // stale by 10 min
        ]);
        // More overdue: crossed its threshold 3 hours ago.
        $moreOverdue = $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subHours(4), // stale by 3 hours
        ]);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')->getJson($this->endpoint());

        $res->assertOk();
        $ids = $this->idsIn($res, 'stale')->values();
        $this->assertSame($moreOverdue->id, $ids->first());
        $this->assertSame($lessOverdue->id, $ids->last());
    }

    // ─── Empty state (T014) ─────────────────────────────────────────────────

    public function test_zero_qualifying_issues_returns_200_with_empty_sections(): void
    {
        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')->getJson($this->endpoint());

        $res->assertOk()->assertJson([
            'stale' => [],
            'watch_closely' => [],
            'waiting_for_client' => [],
            'learning_priorities' => [],
        ]);
    }

    // ─── Non-Support-Ops work_type exclusion (T014a, FR-011) ────────────────

    public function test_ordinary_kanban_work_types_never_appear(): void
    {
        $project = Project::factory()->create();

        $kanbanTasks = [
            $this->makeIssue($project->id, [
                'work_type' => 'project',
                'client_priority' => 'P1',
                'last_client_update_at' => now()->subHours(2),
            ]),
            $this->makeIssue($project->id, [
                'work_type' => 'bug',
                'status' => 'blocked',
            ]),
            $this->makeIssue($project->id, [
                'work_type' => 'feature',
                'client_priority' => 'P1',
                'last_client_update_at' => now()->subHours(2),
            ]),
            $this->makeIssue($project->id, [
                'work_type' => 'admin',
                'status' => 'delayed',
            ]),
        ];

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')->getJson($this->endpoint());
        $res->assertOk();

        $allIds = $this->idsIn($res, 'stale')
            ->merge($this->idsIn($res, 'watch_closely'))
            ->merge($this->idsIn($res, 'waiting_for_client'))
            ->merge($this->idsIn($res, 'learning_priorities'));

        foreach ($kanbanTasks as $task) {
            $this->assertFalse($allIds->contains($task->id));
        }
    }

    // ─── Waiting for Client (T018, FR-005, FR-009) ──────────────────────────

    public function test_blocked_and_delayed_statuses_both_appear_in_waiting_for_client(): void
    {
        $project = Project::factory()->create();
        $blockedIssue = $this->makeIssue($project->id, ['status' => 'blocked']);
        $delayedIssue = $this->makeIssue($project->id, ['status' => 'delayed']);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')->getJson($this->endpoint());

        $res->assertOk();
        $ids = $this->idsIn($res, 'waiting_for_client');
        $this->assertTrue($ids->contains($blockedIssue->id));
        $this->assertTrue($ids->contains($delayedIssue->id));
    }

    public function test_blocked_and_stale_issue_appears_only_in_waiting_for_client(): void
    {
        $project = Project::factory()->create();
        $issue = $this->makeIssue($project->id, [
            'status' => 'blocked',
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subHours(2), // stale by timestamp math
        ]);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')->getJson($this->endpoint());

        $res->assertOk();
        $this->assertTrue($this->idsIn($res, 'waiting_for_client')->contains($issue->id));
        $this->assertFalse($this->idsIn($res, 'stale')->contains($issue->id));
        $this->assertFalse($this->idsIn($res, 'watch_closely')->contains($issue->id));
    }

    // ─── Learning Priorities (T020, FR-006, FR-009a) ────────────────────────

    public function test_open_learning_entry_appears_in_learning_priorities(): void
    {
        $project = Project::factory()->create();
        $issue = $this->makeIssue($project->id, [
            'work_type' => 'learning',
            'status' => 'in_progress',
            'client_priority' => null,
        ]);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')->getJson($this->endpoint());

        $res->assertOk();
        $this->assertTrue($this->idsIn($res, 'learning_priorities')->contains($issue->id));
    }

    public function test_completed_learning_entry_never_appears(): void
    {
        $project = Project::factory()->create();
        $issue = $this->makeIssue($project->id, [
            'work_type' => 'learning',
            'status' => 'completed',
        ]);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')->getJson($this->endpoint());

        $res->assertOk();
        $allIds = $this->idsIn($res, 'stale')
            ->merge($this->idsIn($res, 'watch_closely'))
            ->merge($this->idsIn($res, 'waiting_for_client'))
            ->merge($this->idsIn($res, 'learning_priorities'));
        $this->assertFalse($allIds->contains($issue->id));
    }

    public function test_learning_entry_with_blocked_status_and_client_priority_stays_isolated(): void
    {
        $project = Project::factory()->create();
        $issue = $this->makeIssue($project->id, [
            'work_type' => 'learning',
            'status' => 'blocked',
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subDays(10), // would be "stale" by the math, if it mattered here
        ]);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')->getJson($this->endpoint());

        $res->assertOk();
        $this->assertTrue($this->idsIn($res, 'learning_priorities')->contains($issue->id));
        $this->assertFalse($this->idsIn($res, 'waiting_for_client')->contains($issue->id));
        $this->assertFalse($this->idsIn($res, 'stale')->contains($issue->id));
        $this->assertFalse($this->idsIn($res, 'watch_closely')->contains($issue->id));
    }
}
