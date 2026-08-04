<?php

namespace Tests\Feature;

use App\Models\Bug;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BugTrackerTest extends TestCase
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

    private function callJson($actor, string $method, string $url, array $payload = [])
    {
        return $this->actingAs($actor, 'sanctum')->json($method, $url, $payload);
    }

    private function makeBug(Project $project, User $reporter, array $overrides = []): Bug
    {
        $bug = new Bug(array_merge([
            'title' => 'Something is broken',
            'description' => 'It broke.',
            'reporter_id' => $reporter->id,
            'priority' => Bug::PRIORITY_HIGH,
            'status' => Bug::STATUS_AWAITING_REVIEW,
            'visibility' => Bug::VISIBILITY_INTERNAL,
        ], $overrides));
        $bug->project_id = $project->id;
        $bug->bug_number = (Bug::withTrashed()->where('project_id', $project->id)->max('bug_number') ?? 0) + 1;
        $bug->save();

        return $bug;
    }

    // ─── US1: create, sequencing, grouping, IDOR, validation ─────────────────

    public function test_internal_user_creates_bug_lands_in_incoming_with_sequential_id(): void
    {
        $pm = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($pm, $project);

        $response = $this->callJson($pm, 'POST', "/api/projects/{$project->id}/bugs", [
            'title' => 'Login button does nothing',
            'priority' => 'High',
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.status', 'Awaiting Review');
        $response->assertJsonPath('data.group', 'Incoming');
        $response->assertJsonPath('data.bug_id', 'BUG-001');
        $response->assertJsonPath('data.reporter_id', $pm->id);
    }

    public function test_second_bug_gets_next_sequential_bug_id(): void
    {
        $pm = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($pm, $project);

        $this->callJson($pm, 'POST', "/api/projects/{$project->id}/bugs", ['title' => 'First', 'priority' => 'Low']);
        $second = $this->callJson($pm, 'POST', "/api/projects/{$project->id}/bugs", ['title' => 'Second', 'priority' => 'Low']);

        $second->assertJsonPath('data.bug_id', 'BUG-002');
    }

    public function test_bug_number_never_reused_after_deletion(): void
    {
        $pm = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($pm, $project);

        $this->callJson($pm, 'POST', "/api/projects/{$project->id}/bugs", ['title' => 'First', 'priority' => 'Low']);
        $secondRes = $this->callJson($pm, 'POST', "/api/projects/{$project->id}/bugs", ['title' => 'Second', 'priority' => 'Low']);
        $secondId = $secondRes->json('data.id');

        $this->callJson($pm, 'DELETE', "/api/bugs/{$secondId}")->assertNoContent();

        $third = $this->callJson($pm, 'POST', "/api/projects/{$project->id}/bugs", ['title' => 'Third', 'priority' => 'Low']);
        $third->assertJsonPath('data.bug_id', 'BUG-003');
    }

    public function test_status_change_moves_bug_between_groups(): void
    {
        $pm = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($pm, $project);
        $bug = $this->makeBug($project, $pm);

        $devWork = $this->callJson($pm, 'PATCH', "/api/bugs/{$bug->id}", ['status' => 'Ready for Dev']);
        $devWork->assertJsonPath('data.group', 'Development Work');

        $resolved = $this->callJson($pm, 'PATCH', "/api/bugs/{$bug->id}", ['status' => 'Fixed']);
        $resolved->assertJsonPath('data.group', 'Resolved');
    }

    public function test_direct_awaiting_review_to_fixed_jump_is_allowed(): void
    {
        $pm = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($pm, $project);
        $bug = $this->makeBug($project, $pm, ['status' => Bug::STATUS_AWAITING_REVIEW]);

        $response = $this->callJson($pm, 'PATCH', "/api/bugs/{$bug->id}", ['status' => 'Fixed']);

        $response->assertOk();
        $response->assertJsonPath('data.group', 'Resolved');
    }

    public function test_user_without_project_access_denied_on_every_endpoint(): void
    {
        $outsider = $this->user('Team Member');
        $project = $this->project();
        $owner = $this->user('Project Manager');
        $this->assign($owner, $project);
        $bug = $this->makeBug($project, $owner);

        $this->callJson($outsider, 'GET', "/api/projects/{$project->id}/bugs")->assertStatus(403);
        $this->callJson($outsider, 'POST', "/api/projects/{$project->id}/bugs", ['title' => 'X', 'priority' => 'Low'])->assertStatus(403);
        $this->callJson($outsider, 'GET', "/api/bugs/{$bug->id}")->assertStatus(403);
        $this->callJson($outsider, 'PATCH', "/api/bugs/{$bug->id}", ['title' => 'Y'])->assertStatus(403);
        $this->callJson($outsider, 'DELETE', "/api/bugs/{$bug->id}")->assertStatus(403);
    }

    public function test_validation_rejects_missing_title_and_invalid_enums(): void
    {
        $pm = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($pm, $project);

        $this->callJson($pm, 'POST', "/api/projects/{$project->id}/bugs", ['priority' => 'High'])
            ->assertStatus(422);

        $this->callJson($pm, 'POST', "/api/projects/{$project->id}/bugs", ['title' => 'X', 'priority' => 'Nonsense'])
            ->assertStatus(422);

        $bug = $this->makeBug($project, $pm);
        $this->callJson($pm, 'PATCH', "/api/bugs/{$bug->id}", ['status' => 'Nonsense'])
            ->assertStatus(422);
    }

    public function test_internal_user_reassigns_reporter_via_patch(): void
    {
        $pm = $this->user('Project Manager');
        $newReporter = $this->user('Team Member');
        $project = $this->project();
        $this->assign($pm, $project);
        $this->assign($newReporter, $project);
        $bug = $this->makeBug($project, $pm);

        $this->callJson($pm, 'PATCH', "/api/bugs/{$bug->id}", ['reporter_id' => $newReporter->id])
            ->assertOk();

        $this->callJson($pm, 'GET', "/api/bugs/{$bug->id}")
            ->assertJsonPath('data.reporter_id', $newReporter->id);
    }

    // ─── US2: due dates + SLA breach notifications ────────────────────────────

    public function test_overdue_bug_notifies_reporter_and_owner_exactly_once(): void
    {
        $reporter = $this->user('Project Manager');
        $owner = $this->user('Team Member');
        $project = $this->project();
        $this->assign($reporter, $project);
        $this->assign($owner, $project);
        $bug = $this->makeBug($project, $reporter, [
            'owner_id' => $owner->id,
            'due_date' => now()->subDay(),
        ]);

        $this->callJson($reporter, 'GET', '/api/notifications')->assertOk();

        $reporterNotif = Notification::where('recipient_user_id', $reporter->id)
            ->where('type', Notification::TYPE_OVERDUE)
            ->where('event_key', "bug_breach:bug:{$bug->id}:{$reporter->id}")
            ->first();
        $ownerNotif = Notification::where('recipient_user_id', $owner->id)
            ->where('type', Notification::TYPE_OVERDUE)
            ->where('event_key', "bug_breach:bug:{$bug->id}:{$owner->id}")
            ->first();

        $this->assertNotNull($reporterNotif);
        $this->assertNotNull($ownerNotif);
        $this->assertNotEquals($reporterNotif->id, $ownerNotif->id);
    }

    public function test_polling_twice_does_not_duplicate_breach_notification(): void
    {
        $reporter = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($reporter, $project);
        $bug = $this->makeBug($project, $reporter, ['due_date' => now()->subDay()]);

        $this->callJson($reporter, 'GET', '/api/notifications');
        $this->callJson($reporter, 'GET', '/api/notifications');

        $count = Notification::where('event_key', "bug_breach:bug:{$bug->id}:{$reporter->id}")->count();
        $this->assertEquals(1, $count);

        $this->assertNotNull($bug->fresh()->breach_notified_at);
    }

    public function test_bug_fixed_before_due_date_never_notifies(): void
    {
        $reporter = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($reporter, $project);
        $bug = $this->makeBug($project, $reporter, [
            'due_date' => now()->addDay(),
            'status' => Bug::STATUS_FIXED,
        ]);

        $this->travel(2)->days();
        $this->callJson($reporter, 'GET', '/api/notifications');

        $count = Notification::where('event_key', "bug_breach:bug:{$bug->id}:{$reporter->id}")->count();
        $this->assertEquals(0, $count);
    }

    public function test_bug_without_due_date_never_notifies(): void
    {
        $reporter = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($reporter, $project);
        $bug = $this->makeBug($project, $reporter, ['due_date' => null]);

        $this->callJson($reporter, 'GET', '/api/notifications');

        $count = Notification::where('event_key', "bug_breach:bug:{$bug->id}:{$reporter->id}")->count();
        $this->assertEquals(0, $count);
    }

    public function test_bug_with_no_owner_notifies_reporter_only(): void
    {
        $reporter = $this->user('Project Manager');
        $project = $this->project();
        $this->assign($reporter, $project);
        $bug = $this->makeBug($project, $reporter, ['due_date' => now()->subDay()]);

        $this->callJson($reporter, 'GET', '/api/notifications');

        $total = Notification::where('type', Notification::TYPE_OVERDUE)
            ->where('event_key', 'like', "bug_breach:bug:{$bug->id}:%")
            ->count();
        $this->assertEquals(1, $total);
    }

    // ─── US3: Client visibility ────────────────────────────────────────────────

    public function test_client_sees_only_client_visible_bugs(): void
    {
        $reporter = $this->user('Project Manager');
        $client = $this->user('Client');
        $project = $this->project();
        $this->assign($reporter, $project);
        $this->assign($client, $project);
        $this->makeBug($project, $reporter, ['title' => 'Internal one', 'visibility' => Bug::VISIBILITY_INTERNAL]);
        $this->makeBug($project, $reporter, ['title' => 'Visible one', 'visibility' => Bug::VISIBILITY_CLIENT_VISIBLE]);

        $response = $this->callJson($client, 'GET', "/api/projects/{$project->id}/bugs");

        $response->assertOk();
        $titles = collect($response->json('data'))->pluck('title');
        $this->assertTrue($titles->contains('Visible one'));
        $this->assertFalse($titles->contains('Internal one'));
    }

    public function test_client_requesting_internal_bug_by_id_is_denied(): void
    {
        $reporter = $this->user('Project Manager');
        $client = $this->user('Client');
        $project = $this->project();
        $this->assign($reporter, $project);
        $this->assign($client, $project);
        $bug = $this->makeBug($project, $reporter, ['visibility' => Bug::VISIBILITY_INTERNAL]);

        $this->callJson($client, 'GET', "/api/bugs/{$bug->id}")->assertStatus(403);
    }

    public function test_client_denied_on_every_write_endpoint(): void
    {
        $reporter = $this->user('Project Manager');
        $client = $this->user('Client');
        $project = $this->project();
        $this->assign($reporter, $project);
        $this->assign($client, $project);
        $bug = $this->makeBug($project, $reporter, ['visibility' => Bug::VISIBILITY_CLIENT_VISIBLE]);

        $this->callJson($client, 'POST', "/api/projects/{$project->id}/bugs", ['title' => 'X', 'priority' => 'Low'])->assertStatus(403);
        $this->callJson($client, 'PATCH', "/api/bugs/{$bug->id}", ['title' => 'Y'])->assertStatus(403);
        $this->callJson($client, 'DELETE', "/api/bugs/{$bug->id}")->assertStatus(403);
    }

    public function test_client_without_project_access_denied_entirely(): void
    {
        $reporter = $this->user('Project Manager');
        $client = $this->user('Client'); // not assigned to $project
        $project = $this->project();
        $this->assign($reporter, $project);
        $bug = $this->makeBug($project, $reporter, ['visibility' => Bug::VISIBILITY_CLIENT_VISIBLE]);

        $this->callJson($client, 'GET', "/api/projects/{$project->id}/bugs")->assertStatus(403);
        $this->callJson($client, 'GET', "/api/bugs/{$bug->id}")->assertStatus(403);
    }

    // ─── Cross-project tenant isolation ──────────────────────────────────────

    public function test_internal_user_cannot_reach_bug_on_a_project_they_lack_access_to(): void
    {
        $memberOfA = $this->user('Team Member');
        $projectA = $this->project();
        $projectB = $this->project();
        $this->assign($memberOfA, $projectA);
        $reporterB = $this->user('Project Manager');
        $this->assign($reporterB, $projectB);
        $bugOnB = $this->makeBug($projectB, $reporterB);

        $this->callJson($memberOfA, 'GET', "/api/bugs/{$bugOnB->id}")->assertStatus(403);
        $this->callJson($memberOfA, 'PATCH', "/api/bugs/{$bugOnB->id}", ['title' => 'Hijacked'])->assertStatus(403);
    }
}
