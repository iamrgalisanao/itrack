<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\SubActivity;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * 021-dashboard-my-work, User Story 2: the dashboard summary payload.
 *
 * Covers the additive `completed_recent` metric and the Client-visibility
 * filter on `recent_activities` — the latter is a pre-existing leak found
 * during 021's research pass: dashboard() listed recent tasks without the
 * `client_visible` filter DetailedActivityController::index() applies, so a
 * Client saw the names and status of internal tasks in accessible projects.
 */
class DashboardSummaryTest extends TestCase
{
    use RefreshDatabase;

    private function createUser(string $role = 'Team Member', string $dept = 'IT'): User
    {
        return User::factory()->create([
            'role'       => $role,
            'department' => $dept,
            'is_active'  => true,
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

    private function assign(User $user, Project $project): void
    {
        ProjectAssignment::create([
            'user_id'             => $user->id,
            'project_id'          => $project->id,
            'assigned_by_user_id' => $this->createUser('Admin')->id,
        ]);
    }

    // ─── recent_activities client visibility (the leak fix) ──────────────────

    public function test_client_does_not_see_internal_tasks_in_recent_activities(): void
    {
        ['project' => $project, 'subActivity' => $subActivity] = $this->makeChain();
        $client = $this->createUser(User::ROLE_CLIENT);
        $this->assign($client, $project);

        DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'name'            => 'Internal only task',
            'client_visible'  => false,
        ]);
        DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'name'            => 'Shared with client',
            'client_visible'  => true,
        ]);

        $response = $this->actingAs($client)->getJson('/api/dashboard');

        $response->assertOk();
        $names = collect($response->json('recent_activities'))->pluck('name');
        $this->assertContains('Shared with client', $names);
        $this->assertNotContains('Internal only task', $names);
    }

    public function test_internal_roles_still_see_internal_tasks_in_recent_activities(): void
    {
        ['project' => $project, 'subActivity' => $subActivity] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);

        DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'name'            => 'Internal only task',
            'client_visible'  => false,
        ]);

        $response = $this->actingAs($member)->getJson('/api/dashboard');

        $response->assertOk();
        $names = collect($response->json('recent_activities'))->pluck('name');
        $this->assertContains('Internal only task', $names);
    }

    // ─── completed_recent ────────────────────────────────────────────────────

    public function test_completed_recent_counts_only_completions_within_seven_days(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 26, 12, 0, 0));

        ['project' => $project, 'subActivity' => $subActivity] = $this->makeChain();
        $member = $this->createUser('Team Member');
        $this->assign($member, $project);

        // Inside the window: completed 3 days ago.
        DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'status'          => 'completed',
            'updated_at'      => Carbon::now()->subDays(3),
        ]);
        // Boundary: exactly 7 days ago counts as inside.
        DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'status'          => 'completed',
            'updated_at'      => Carbon::now()->subDays(7),
        ]);
        // Outside the window: completed 8 days ago.
        DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'status'          => 'completed',
            'updated_at'      => Carbon::now()->subDays(8),
        ]);
        // Not completed at all, updated today.
        DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'status'          => 'in_progress',
            'updated_at'      => Carbon::now(),
        ]);

        $response = $this->actingAs($member)->getJson('/api/dashboard');

        $response->assertOk();
        $this->assertSame(2, $response->json('stats.completed_recent'));

        Carbon::setTestNow();
    }

    public function test_completed_recent_excludes_internal_tasks_for_clients(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 8, 26, 12, 0, 0));

        ['project' => $project, 'subActivity' => $subActivity] = $this->makeChain();
        $client = $this->createUser(User::ROLE_CLIENT);
        $this->assign($client, $project);

        DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'status'          => 'completed',
            'client_visible'  => false,
            'updated_at'      => Carbon::now()->subDay(),
        ]);
        DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'status'          => 'completed',
            'client_visible'  => true,
            'updated_at'      => Carbon::now()->subDay(),
        ]);

        $response = $this->actingAs($client)->getJson('/api/dashboard');

        $response->assertOk();
        $this->assertSame(1, $response->json('stats.completed_recent'));

        Carbon::setTestNow();
    }

    // ─── Existing contract preserved (additive change only) ──────────────────

    public function test_existing_stats_keys_are_preserved(): void
    {
        $admin = $this->createUser('Admin');

        $response = $this->actingAs($admin)->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonStructure([
            'stats' => [
                'projects', 'modules', 'activities', 'detailed_activities',
                'completed', 'in_progress', 'not_started', 'delayed',
                'team_members', 'glossary_terms', 'overall_progress',
                'completed_recent',
            ],
            'recent_activities',
            'module_heatmap',
        ]);
    }

    public function test_dashboard_counts_remain_scoped_to_accessible_projects(): void
    {
        ['project' => $assigned, 'subActivity' => $assignedSub] = $this->makeChain();
        ['subActivity' => $otherSub] = $this->makeChain();

        $member = $this->createUser('Team Member');
        $this->assign($member, $assigned);

        DetailedActivity::factory()->create(['sub_activity_id' => $assignedSub->id]);
        DetailedActivity::factory()->create(['sub_activity_id' => $otherSub->id]);

        $response = $this->actingAs($member)->getJson('/api/dashboard');

        $response->assertOk();
        $this->assertSame(1, $response->json('stats.projects'));
        $this->assertSame(1, $response->json('stats.detailed_activities'));
    }
}
