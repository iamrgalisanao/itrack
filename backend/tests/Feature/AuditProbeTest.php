<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Attachment;
use App\Models\Comment;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\SubActivity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditProbeTest extends TestCase
{
    use RefreshDatabase;

    private function createUser(string $role = 'Team Member', string $dept = 'IT'): User
    {
        return User::factory()->create(['role' => $role, 'department' => $dept, 'is_active' => true]);
    }

    private function makeChain(array $o = []): array
    {
        $project = Project::factory()->create(['department' => 'IT', ...$o]);
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);
        return compact('project', 'module', 'activity', 'subActivity');
    }

    private function assign(User $user, Project $project): void
    {
        ProjectAssignment::create([
            'user_id' => $user->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $this->createUser('Admin')->id,
        ]);
    }

    private function dump(string $label, $response): void
    {
        fwrite(STDERR, "\n[PROBE {$label}] status=" . $response->status() . " body=" . substr($response->getContent(), 0, 1500) . "\n");
    }

    public function test_probe_subactivity_index_leaks_internal_tasks(): void
    {
        ['project' => $p, 'activity' => $a, 'subActivity' => $sa] = $this->makeChain();
        $client = $this->createUser(User::ROLE_CLIENT);
        $this->assign($client, $p);

        DetailedActivity::factory()->create([
            'sub_activity_id' => $sa->id,
            'name' => 'INTERNAL SECRET TASK',
            'notes' => 'internal notes here',
            'root_cause' => 'we broke prod',
            'client_visible' => false,
        ]);

        $this->dump('sub-activities index', $this->actingAs($client)->getJson("/api/activities/{$a->id}/sub-activities"));
        $this->dump('sub-activities show', $this->actingAs($client)->getJson("/api/sub-activities/{$sa->id}"));
        $this->assertTrue(true);
    }

    public function test_probe_report_leaks_internal_milestones(): void
    {
        ['project' => $p, 'subActivity' => $sa] = $this->makeChain();
        $client = $this->createUser(User::ROLE_CLIENT);
        $this->assign($client, $p);

        DetailedActivity::factory()->create([
            'sub_activity_id' => $sa->id,
            'name' => 'INTERNAL MILESTONE',
            'client_visible' => false,
            'duration_months' => 0,
            'duration_days' => 0,
            'progress' => 100,
        ]);
        DetailedActivity::factory()->create([
            'sub_activity_id' => $sa->id,
            'name' => 'SHARED MILESTONE',
            'client_visible' => true,
            'duration_months' => 0,
            'duration_days' => 0,
            'progress' => 0,
        ]);

        $this->dump('reports', $this->actingAs($client)->getJson('/api/reports'));
        $this->assertTrue(true);
    }

    public function test_probe_comments_attachments_on_internal_task(): void
    {
        ['project' => $p, 'subActivity' => $sa] = $this->makeChain();
        $other = $this->makeChain();
        $client = $this->createUser(User::ROLE_CLIENT);
        $this->assign($client, $p);

        $internal = DetailedActivity::factory()->create([
            'sub_activity_id' => $sa->id,
            'name' => 'INTERNAL TASK',
            'client_visible' => false,
        ]);
        $foreign = DetailedActivity::factory()->create([
            'sub_activity_id' => $other['subActivity']->id,
            'name' => 'FOREIGN TASK',
            'client_visible' => true,
        ]);

        Comment::create([
            'detailed_activity_id' => $internal->id,
            'author' => 'PM',
            'author_role' => 'Project Manager',
            'body' => 'CLIENT VISIBLE COMMENT ON HIDDEN TASK',
            'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
        ]);
        Attachment::create([
            'detailed_activity_id' => $internal->id,
            'uploader' => 'PM',
            'uploader_role' => 'Project Manager',
            'original_name' => 'internal-roadmap.pdf',
            'stored_name' => 'x_internal-roadmap.pdf',
            'disk' => 'local',
            'path' => 'attachments/x.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => 123,
            'visibility' => Attachment::VISIBILITY_CLIENT_VISIBLE,
        ]);

        $this->dump('comments on INTERNAL task', $this->actingAs($client)->getJson("/api/detailed-activities/{$internal->id}/comments"));
        $this->dump('attachments on INTERNAL task', $this->actingAs($client)->getJson("/api/detailed-activities/{$internal->id}/attachments"));
        $this->dump('comments on FOREIGN task', $this->actingAs($client)->getJson("/api/detailed-activities/{$foreign->id}/comments"));
        $this->dump('comments on NONEXISTENT task', $this->actingAs($client)->getJson('/api/detailed-activities/999999/comments'));
        $this->dump('show INTERNAL task', $this->actingAs($client)->getJson("/api/detailed-activities/{$internal->id}"));
        $this->dump('show FOREIGN task', $this->actingAs($client)->getJson("/api/detailed-activities/{$foreign->id}"));
        $this->dump('show NONEXISTENT task', $this->actingAs($client)->getJson('/api/detailed-activities/999999'));
        $this->assertTrue(true);
    }

    public function test_probe_modules_index_and_dashboard_counts(): void
    {
        ['project' => $p, 'module' => $m, 'subActivity' => $sa] = $this->makeChain();
        $client = $this->createUser(User::ROLE_CLIENT);
        $this->assign($client, $p);

        DetailedActivity::factory()->create([
            'sub_activity_id' => $sa->id, 'name' => 'INTERNAL', 'client_visible' => false,
        ]);

        $this->dump('modules index', $this->actingAs($client)->getJson("/api/projects/{$p->id}/modules"));

        $d = $this->actingAs($client)->getJson('/api/dashboard');
        fwrite(STDERR, "\n[PROBE dashboard stats] " . json_encode($d->json('stats')) . "\n[PROBE heatmap] " . json_encode($d->json('module_heatmap')) . "\n");
        $this->assertTrue(true);
    }
}
