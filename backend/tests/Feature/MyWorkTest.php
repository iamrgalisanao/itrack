<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\PreviewSession;
use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\SubActivity;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 021-dashboard-my-work, User Story 1: the dashboard's My Work panel.
 *
 * The load-bearing rule under test is that being a task's assignee is not
 * by itself authorization to see it — the query filters on assignee AND on
 * the acting user's accessible projects, because an assignment row can
 * outlive project access (research.md R3).
 */
class MyWorkTest extends TestCase
{
    use RefreshDatabase;

    private const ANCHORS = ['today' => '2026-08-26', 'week_end' => '2026-08-30'];

    private function createUser(string $role = 'Team Member', string $dept = 'IT', bool $active = true): User
    {
        return User::factory()->create([
            'role'       => $role,
            'department' => $dept,
            'is_active'  => $active,
        ]);
    }

    /** Project → Module → Activity → SubActivity, ready for tasks to hang off. */
    private function makeChain(array $projectOverrides = []): array
    {
        $project = Project::factory()->create(['department' => 'IT', ...$projectOverrides]);
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        return compact('project', 'module', 'activity', 'subActivity');
    }

    private function assign(User $user, Project $project): ProjectAssignment
    {
        return ProjectAssignment::create([
            'user_id'             => $user->id,
            'project_id'          => $project->id,
            'assigned_by_user_id' => $this->createUser('Admin')->id,
        ]);
    }

    private function taskFor(User $assignee, SubActivity $subActivity, array $attrs = []): DetailedActivity
    {
        return DetailedActivity::factory()->create([
            'sub_activity_id'   => $subActivity->id,
            'assignee_user_id'  => $assignee->id,
            'status'            => 'not_started',
            'client_visible'    => false,
            ...$attrs,
        ]);
    }

    private function myWork(User $actor, array $params = [])
    {
        return $this->actingAs($actor)->getJson('/api/my-work?' . http_build_query($params ?: self::ANCHORS));
    }

    /** Flattens every task id present anywhere in the bucket envelope. */
    private function taskIds(array $json): array
    {
        return collect($json['buckets'])->flatMap(fn ($b) => collect($b['tasks'])->pluck('id'))->all();
    }

    // ─── Reachability and role access ────────────────────────────────────────

    public function test_all_five_roles_can_reach_my_work_endpoint(): void
    {
        foreach (['Admin', 'Project Manager', 'Department Head', 'Team Member', User::ROLE_CLIENT] as $role) {
            $this->myWork($this->createUser($role))->assertOk();
        }
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->getJson('/api/my-work')->assertUnauthorized();
    }

    public function test_disabled_user_is_rejected(): void
    {
        // EnsureUserIsActive answers 401, not 403, so the frontend's existing
        // 401 interceptor clears the session and redirects to /login.
        $this->myWork($this->createUser('Team Member', 'IT', active: false))->assertUnauthorized();
    }

    public function test_team_member_sees_only_own_open_assigned_tasks(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $other = $this->createUser('Team Member');
        $this->assign($member, $project);
        $this->assign($other, $project);

        $mine = $this->taskFor($member, $sub, ['plan_end_date' => '2026-08-27']);
        $completed = $this->taskFor($member, $sub, ['status' => 'completed', 'plan_end_date' => '2026-08-27']);
        $theirs = $this->taskFor($other, $sub, ['plan_end_date' => '2026-08-27']);
        $unassigned = DetailedActivity::factory()->create([
            'sub_activity_id'  => $sub->id,
            'assignee_user_id' => null,
        ]);

        $ids = $this->taskIds($this->myWork($member)->assertOk()->json());

        $this->assertContains($mine->id, $ids);
        $this->assertNotContains($completed->id, $ids);
        $this->assertNotContains($theirs->id, $ids);
        $this->assertNotContains($unassigned->id, $ids);
    }

    public function test_all_open_statuses_are_included_except_completed(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);

        $open = [];
        foreach (['backlog', 'not_started', 'in_progress', 'for_review', 'blocked', 'delayed'] as $status) {
            $open[$status] = $this->taskFor($member, $sub, ['status' => $status, 'plan_end_date' => '2026-08-27'])->id;
        }
        $done = $this->taskFor($member, $sub, ['status' => 'completed', 'plan_end_date' => '2026-08-27']);

        $ids = $this->taskIds($this->myWork($member)->assertOk()->json());

        foreach ($open as $status => $id) {
            $this->assertContains($id, $ids, "Open status '{$status}' should appear in My Work");
        }
        $this->assertNotContains($done->id, $ids);
    }

    public function test_admin_my_work_is_still_assignee_scoped(): void
    {
        ['subActivity' => $sub] = $this->makeChain();
        $admin = $this->createUser('Admin');
        $member = $this->createUser('Team Member');

        $adminTask = $this->taskFor($admin, $sub, ['plan_end_date' => '2026-08-27']);
        $memberTask = $this->taskFor($member, $sub, ['plan_end_date' => '2026-08-27']);

        $ids = $this->taskIds($this->myWork($admin)->assertOk()->json());

        // Admin can *see* every project, but My Work is their own work only.
        $this->assertContains($adminTask->id, $ids);
        $this->assertNotContains($memberTask->id, $ids);
    }

    // ─── Tenant isolation ────────────────────────────────────────────────────

    public function test_assigned_task_in_inaccessible_project_is_excluded(): void
    {
        ['project' => $accessible, 'subActivity' => $accessibleSub] = $this->makeChain();
        ['subActivity' => $foreignSub] = $this->makeChain();

        $member = $this->createUser('Team Member');
        $this->assign($member, $accessible);

        $visible = $this->taskFor($member, $accessibleSub, ['plan_end_date' => '2026-08-27']);
        // Assigned to them, but in a project they have no assignment row for.
        $hidden = $this->taskFor($member, $foreignSub, ['plan_end_date' => '2026-08-27']);

        $json = $this->myWork($member)->assertOk()->json();
        $ids = $this->taskIds($json);

        $this->assertContains($visible->id, $ids);
        $this->assertNotContains($hidden->id, $ids);
        $this->assertSame(1, $json['buckets']['this_week']['count']);
    }

    public function test_user_b_tasks_never_appear_in_user_a_my_work(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $a = $this->createUser('Team Member');
        $b = $this->createUser('Team Member');
        $this->assign($a, $project);
        $this->assign($b, $project);

        $aTask = $this->taskFor($a, $sub, ['plan_end_date' => '2026-08-27']);
        $bTask = $this->taskFor($b, $sub, ['plan_end_date' => '2026-08-27']);

        $this->assertNotContains($bTask->id, $this->taskIds($this->myWork($a)->json()));
        $this->assertNotContains($aTask->id, $this->taskIds($this->myWork($b)->json()));
    }

    public function test_revoking_assignment_removes_tasks_on_very_next_request(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $assignment = $this->assign($member, $project);
        $task = $this->taskFor($member, $sub, ['plan_end_date' => '2026-08-27']);

        $this->assertContains($task->id, $this->taskIds($this->myWork($member)->json()));

        $assignment->delete();

        $this->assertNotContains($task->id, $this->taskIds($this->myWork($member)->json()));
    }

    // ─── Bucketing ───────────────────────────────────────────────────────────

    public function test_tasks_bucket_into_overdue_this_week_later_and_no_due_date(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);

        $overdue = $this->taskFor($member, $sub, ['plan_end_date' => '2026-08-25']);
        $thisWeek = $this->taskFor($member, $sub, ['plan_end_date' => '2026-08-28']);
        $later = $this->taskFor($member, $sub, ['plan_end_date' => '2026-09-15']);
        $undated = $this->taskFor($member, $sub, ['plan_end_date' => null]);

        $json = $this->myWork($member)->assertOk()->json();

        $this->assertSame([$overdue->id], collect($json['buckets']['overdue']['tasks'])->pluck('id')->all());
        $this->assertSame([$thisWeek->id], collect($json['buckets']['this_week']['tasks'])->pluck('id')->all());
        $this->assertSame([$later->id], collect($json['buckets']['later']['tasks'])->pluck('id')->all());
        $this->assertSame([$undated->id], collect($json['buckets']['no_due_date']['tasks'])->pluck('id')->all());

        foreach (['overdue', 'this_week', 'later', 'no_due_date'] as $bucket) {
            $this->assertSame(1, $json['buckets'][$bucket]['count']);
        }
    }

    public function test_due_today_is_this_week_not_overdue(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);

        $today = $this->taskFor($member, $sub, ['plan_end_date' => self::ANCHORS['today']]);

        $json = $this->myWork($member)->assertOk()->json();

        $this->assertSame([$today->id], collect($json['buckets']['this_week']['tasks'])->pluck('id')->all());
        $this->assertSame(0, $json['buckets']['overdue']['count']);
    }

    public function test_week_end_boundary_splits_this_week_from_later(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);

        // 2026-08-30 is the Sunday anchor; 08-31 is the Monday after.
        $sunday = $this->taskFor($member, $sub, ['plan_end_date' => '2026-08-30']);
        $monday = $this->taskFor($member, $sub, ['plan_end_date' => '2026-08-31']);

        $json = $this->myWork($member)->assertOk()->json();

        $this->assertSame([$sunday->id], collect($json['buckets']['this_week']['tasks'])->pluck('id')->all());
        $this->assertSame([$monday->id], collect($json['buckets']['later']['tasks'])->pluck('id')->all());
    }

    public function test_bucket_counts_always_sum_to_total_open_tasks(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);

        foreach (['2026-08-01', '2026-08-26', '2026-08-30', '2026-09-30', null] as $due) {
            $this->taskFor($member, $sub, ['plan_end_date' => $due]);
        }

        $json = $this->myWork($member)->assertOk()->json();

        $sum = collect($json['buckets'])->sum('count');
        $this->assertSame(5, $sum, 'Buckets must partition the open set — no overlaps, no gaps');
    }

    public function test_absent_anchors_fall_back_to_server_defaults(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);
        $this->taskFor($member, $sub, ['plan_end_date' => null]);

        $response = $this->actingAs($member)->getJson('/api/my-work');

        $response->assertOk();
        $this->assertNotEmpty($response->json('meta.today'));
        $this->assertNotEmpty($response->json('meta.week_end'));
        $this->assertSame(1, $response->json('buckets.no_due_date.count'));
    }

    public function test_lone_anchor_is_rejected(): void
    {
        $member = $this->createUser('Team Member');

        $this->myWork($member, ['today' => '2026-08-26'])->assertStatus(422);
        $this->myWork($member, ['week_end' => '2026-08-30'])->assertStatus(422);
    }

    public function test_malformed_or_inverted_anchors_are_rejected(): void
    {
        $member = $this->createUser('Team Member');

        $this->myWork($member, ['today' => 'not-a-date', 'week_end' => '2026-08-30'])->assertStatus(422);
        $this->myWork($member, ['today' => '2026-08-26', 'week_end' => '2026-08-20'])->assertStatus(422);
    }

    public function test_invalid_bucket_and_per_bucket_values_are_rejected(): void
    {
        $member = $this->createUser('Team Member');

        $this->myWork($member, [...self::ANCHORS, 'bucket' => 'bogus', 'all' => 1])->assertStatus(422);
        $this->myWork($member, [...self::ANCHORS, 'per_bucket' => 0])->assertStatus(422);
        $this->myWork($member, [...self::ANCHORS, 'per_bucket' => 101])->assertStatus(422);
        // bucket and all must travel together
        $this->myWork($member, [...self::ANCHORS, 'all' => 1])->assertStatus(422);
        $this->myWork($member, [...self::ANCHORS, 'bucket' => 'overdue'])->assertStatus(422);
    }

    // ─── Caps and expansion ──────────────────────────────────────────────────

    public function test_rows_are_capped_while_counts_stay_true_totals(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);

        for ($i = 0; $i < 15; $i++) {
            $this->taskFor($member, $sub, ['plan_end_date' => '2026-08-27']);
        }

        $json = $this->myWork($member)->assertOk()->json();

        $this->assertCount(10, $json['buckets']['this_week']['tasks']);
        $this->assertSame(15, $json['buckets']['this_week']['count']);
        $this->assertSame(10, $json['meta']['per_bucket']);
    }

    public function test_single_bucket_can_be_expanded_uncapped(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);

        for ($i = 0; $i < 15; $i++) {
            $this->taskFor($member, $sub, ['plan_end_date' => '2026-08-27']);
        }
        for ($i = 0; $i < 12; $i++) {
            $this->taskFor($member, $sub, ['plan_end_date' => '2026-09-27']);
        }

        $json = $this->myWork($member, [...self::ANCHORS, 'bucket' => 'this_week', 'all' => 1])->assertOk()->json();

        $this->assertCount(15, $json['buckets']['this_week']['tasks']);
        // The other buckets stay capped.
        $this->assertCount(10, $json['buckets']['later']['tasks']);
        $this->assertSame(12, $json['buckets']['later']['count']);
    }

    public function test_empty_buckets_are_present_with_zero_count(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);
        $this->taskFor($member, $sub, ['plan_end_date' => '2026-08-25']);

        $json = $this->myWork($member)->assertOk()->json();

        foreach (['overdue', 'this_week', 'later', 'no_due_date'] as $bucket) {
            $this->assertArrayHasKey($bucket, $json['buckets']);
        }
        $this->assertSame(0, $json['buckets']['later']['count']);
        $this->assertSame([], $json['buckets']['later']['tasks']);
    }

    // ─── Payload discipline ──────────────────────────────────────────────────

    public function test_row_payload_is_curated_not_the_full_task_model(): void
    {
        ['project' => $project, 'module' => $module, 'subActivity' => $sub] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);
        $this->taskFor($member, $sub, [
            'plan_end_date' => '2026-08-27',
            'notes'         => 'internal note',
            'root_cause'    => 'internal root cause',
            'resolution'    => 'internal resolution',
        ]);

        $row = $this->myWork($member)->assertOk()->json('buckets.this_week.tasks.0');

        foreach (['notes', 'root_cause', 'resolution', 'evidence', 'client_name', 'tenant_name', 'description'] as $banned) {
            $this->assertArrayNotHasKey($banned, $row, "'{$banned}' must not be exposed in a My Work row");
        }

        $this->assertSame($project->id, $row['project']['id']);
        $this->assertSame($module->name, $row['module']['name']);
        $this->assertArrayHasKey('sub_activity_id', $row);
    }

    public function test_can_write_reflects_the_effective_role(): void
    {
        foreach (['Admin' => true, 'Project Manager' => true, 'Team Member' => true,
                  'Department Head' => false, User::ROLE_CLIENT => false] as $role => $expected) {
            $this->assertSame(
                $expected,
                $this->myWork($this->createUser($role))->json('meta.can_write'),
                "meta.can_write for {$role}"
            );
        }
    }

    // ─── Preview-as-user ─────────────────────────────────────────────────────

    private function startPreview(User $admin, User $target): string
    {
        $response = $this->actingAs($admin)->postJson('/api/preview-sessions', ['target_user_id' => $target->id]);
        $response->assertCreated();

        return $response->json('data.token') ?? $response->json('token');
    }

    public function test_preview_shows_the_previewed_users_work_not_the_admins(): void
    {
        ['project' => $project, 'subActivity' => $sub] = $this->makeChain();
        $admin = $this->createUser('Admin');
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);

        $adminTask = $this->taskFor($admin, $sub, ['plan_end_date' => '2026-08-27']);
        $memberTask = $this->taskFor($member, $sub, ['plan_end_date' => '2026-08-27']);

        $token = $this->startPreview($admin, $member);

        $json = $this->actingAs($admin)
            ->json('GET', '/api/my-work?' . http_build_query(self::ANCHORS), [], ['X-Preview-Session' => $token])
            ->assertOk()
            ->json();

        $ids = $this->taskIds($json);
        $this->assertContains($memberTask->id, $ids);
        $this->assertNotContains($adminTask->id, $ids);
    }

    public function test_preview_can_write_follows_the_previewed_role(): void
    {
        $admin = $this->createUser('Admin');
        $client = $this->createUser(User::ROLE_CLIENT);

        $token = $this->startPreview($admin, $client);

        $canWrite = $this->actingAs($admin)
            ->json('GET', '/api/my-work?' . http_build_query(self::ANCHORS), [], ['X-Preview-Session' => $token])
            ->assertOk()
            ->json('meta.can_write');

        $this->assertFalse($canWrite, 'Previewing a Client must not expose write affordances');
    }

    public function test_expired_preview_token_returns_409_with_no_domain_data(): void
    {
        $admin = $this->createUser('Admin');
        $member = $this->createUser('Team Member');
        $token = $this->startPreview($admin, $member);

        Carbon::setTestNow(now()->addHours(3));

        $response = $this->actingAs($admin)
            ->json('GET', '/api/my-work?' . http_build_query(self::ANCHORS), [], ['X-Preview-Session' => $token]);

        $response->assertStatus(409);
        $this->assertNull($response->json('buckets'));

        Carbon::setTestNow();
    }
}
