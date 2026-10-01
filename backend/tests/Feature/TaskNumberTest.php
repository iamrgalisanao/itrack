<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Project;
use App\Models\SubActivity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskNumberTest extends TestCase
{
    use RefreshDatabase;

    private function subActivityIn(Project $project): SubActivity
    {
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);

        return SubActivity::factory()->create(['activity_id' => $activity->id]);
    }

    public function test_tasks_are_numbered_sequentially_per_project(): void
    {
        $a = Project::factory()->create();
        $b = Project::factory()->create();
        $subA = $this->subActivityIn($a);
        $subB = $this->subActivityIn($b);

        $first = DetailedActivity::factory()->create(['sub_activity_id' => $subA->id]);
        $second = DetailedActivity::factory()->create(['sub_activity_id' => $subA->id]);
        $other = DetailedActivity::factory()->create(['sub_activity_id' => $subB->id]);

        $this->assertSame('TASK-001', $first->task_id);
        $this->assertSame('TASK-002', $second->task_id);
        $this->assertSame('TASK-001', $other->task_id);
    }

    public function test_task_number_is_never_reused_after_deletion(): void
    {
        $sub = $this->subActivityIn(Project::factory()->create());

        DetailedActivity::factory()->create(['sub_activity_id' => $sub->id]);
        $last = DetailedActivity::factory()->create(['sub_activity_id' => $sub->id]);
        $last->delete();

        $next = DetailedActivity::factory()->create(['sub_activity_id' => $sub->id]);

        $this->assertSame(3, $next->task_number);
    }

    public function test_task_number_cannot_be_set_from_input(): void
    {
        $sub = $this->subActivityIn(Project::factory()->create());

        $task = $sub->detailedActivities()->create(['name' => 'x', 'task_number' => 99]);

        $this->assertSame(1, $task->task_number);
    }
}
