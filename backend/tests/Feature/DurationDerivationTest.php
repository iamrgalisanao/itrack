<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Project;
use App\Models\SubActivity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Duration is derived server-side from plan_start_date/plan_end_date
 * (App\Support\DurationCalculator) so a direct API call can't reintroduce
 * the client/server drift the frontend's own deriveDuration() closes for
 * requests made through WorkProgram.jsx. These tests exercise the
 * controller layer, not just the calculator, to prove client-supplied
 * duration_months/duration_days are always overridden — a request that
 * "lies" about duration is exactly the case a client-only fix can't catch.
 */
class DurationDerivationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'Admin']);
    }

    public function test_module_create_ignores_client_supplied_duration_and_derives_from_dates(): void
    {
        $project = Project::factory()->create();

        $res = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/projects/{$project->id}/modules", [
                'name'             => 'Test Module',
                'plan_start_date'  => '2026-01-01',
                'plan_end_date'    => '2026-01-31',
                // Deliberately wrong — a direct API caller lying about duration.
                'duration_months'  => 99,
                'duration_days'    => 99,
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('duration_months', 1)
            ->assertJsonPath('duration_days', 0);
    }

    public function test_module_update_recalculates_duration_when_dates_change(): void
    {
        $project = Project::factory()->create();
        $module = Module::factory()->create([
            'project_id'      => $project->id,
            'plan_start_date' => '2026-01-01',
            'plan_end_date'   => '2026-01-31',
            'duration_months' => 1,
            'duration_days'   => 0,
        ]);

        // Only the end date changes; start date isn't sent — the controller
        // must fall back to the existing stored start date, not treat it as null.
        $res = $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/modules/{$module->id}", [
                'plan_end_date' => '2026-03-15',
            ]);

        $res->assertStatus(200)
            ->assertJsonPath('duration_months', 2)
            ->assertJsonPath('duration_days', 15);
    }

    public function test_module_update_ignores_client_supplied_duration_when_dates_are_unchanged(): void
    {
        $project = Project::factory()->create();
        $module = Module::factory()->create([
            'project_id'      => $project->id,
            'plan_start_date' => '2026-01-01',
            'plan_end_date'   => '2026-01-31',
            'duration_months' => 1,
            'duration_days'   => 0,
        ]);

        $res = $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/modules/{$module->id}", [
                'name'             => 'Renamed',
                'duration_months'  => 99,
                'duration_days'    => 99,
            ]);

        $res->assertStatus(200)
            ->assertJsonPath('duration_months', 1)
            ->assertJsonPath('duration_days', 0);
    }

    public function test_task_create_derives_duration_and_same_day_range_is_one_day(): void
    {
        $project = Project::factory()->create();
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        $res = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/sub-activities/{$subActivity->id}/detailed-activities", [
                'name'            => 'Test Task',
                'plan_start_date' => '2026-05-04',
                'plan_end_date'   => '2026-05-04',
                'duration_months' => 5,
                'duration_days'   => 5,
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('duration_months', 0)
            ->assertJsonPath('duration_days', 1);
    }

    public function test_task_update_by_team_member_does_not_null_out_duration(): void
    {
        // Team Members are restricted to a status/progress/notes field
        // allowlist in DetailedActivityController::update() — plan dates
        // aren't among them, so the duration recompute must fall back to
        // the task's existing dates rather than treating them as absent.
        $project = Project::factory()->create();
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);
        $task = DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'plan_start_date' => '2026-01-01',
            'plan_end_date'   => '2026-01-31',
            'duration_months' => 1,
            'duration_days'   => 0,
        ]);

        $teamMember = User::factory()->create(['role' => 'Team Member']);
        \App\Models\ProjectAssignment::create([
            'user_id'             => $teamMember->id,
            'project_id'          => $project->id,
            'assigned_by_user_id' => $this->admin()->id,
        ]);

        $res = $this->actingAs($teamMember, 'sanctum')
            ->putJson("/api/detailed-activities/{$task->id}", [
                'status' => 'in_progress',
            ]);

        $res->assertStatus(200)
            ->assertJsonPath('duration_months', 1)
            ->assertJsonPath('duration_days', 0);
    }
}
