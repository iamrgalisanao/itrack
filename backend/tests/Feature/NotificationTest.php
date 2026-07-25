<?php
use App\Models\DetailedActivity;
use App\Models\Notification;
use App\Models\Project;
use App\Models\Comment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private $detailedActivity;
    private $project;

    protected function setUp(): void
    {
        parent::setUp();

        // Create the task tree
        $this->project = Project::create([
            'name' => 'Test Project',
            'department' => 'IT'
        ]);
        $module = $this->project->modules()->create(['name' => 'Test Module']);
        $activity = $module->activities()->create(['name' => 'Test Activity']);
        $subActivity = $activity->subActivities()->create(['name' => 'Test Sub Activity']);
        $this->detailedActivity = $subActivity->detailedActivities()->create([
            'name' => 'Test Task',
            'status' => 'not_started',
            'responsible' => 'TM', // Team Member abbreviation
        ]);
    }

    private function createUser(string $role = 'Team Member', string $dept = 'IT'): User
    {
        return User::factory()->create([
            'name' => $role,
            'role' => $role,
            'department' => $dept,
        ]);
    }

    /**
     * Test role scoping of notifications.
     */
    public function test_index_only_returns_notifications_for_active_role(): void
    {
        // Create a notification for Team Member
        Notification::create([
            'user_role' => 'Team Member',
            'type' => 'assignment',
            'title' => 'Assigned',
            'message' => 'Test',
            'detailed_activity_id' => $this->detailedActivity->id,
        ]);

        // Create a notification for Project Manager
        Notification::create([
            'user_role' => 'Project Manager',
            'type' => 'assignment',
            'title' => 'Assigned PM',
            'message' => 'Test PM',
            'detailed_activity_id' => $this->detailedActivity->id,
        ]);

        // Fetch as Team Member
        $responseTM = $this->actingAs($this->createUser('Team Member'), 'sanctum')
            ->getJson('/api/notifications');

        // 3, not 1: 005-support-ops-automation's daily summary + weekly
        // report are generated for every internal-role request per FR-007,
        // even with zero qualifying Support Ops activity (as here) — on top
        // of the one assignment notification this test seeds.
        $responseTM->assertStatus(200);
        $responseTM->assertJsonCount(3, 'notifications');
        $responseTM->assertJsonFragment(['title' => 'Assigned']);
        $responseTM->assertJsonMissing(['title' => 'Assigned PM']);

        // Fetch as Project Manager
        $responsePM = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->getJson('/api/notifications');

        $responsePM->assertStatus(200);
        $responsePM->assertJsonCount(3, 'notifications');
        $responsePM->assertJsonFragment(['title' => 'Assigned PM']);
        $responsePM->assertJsonMissing(['title' => 'Assigned']);
    }

    /**
     * Test dynamic generation of overdue and due-soon notifications on load.
     */
    public function test_index_generates_dynamic_overdue_and_due_soon_notifications(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 24, 12, 0, 0));

        // Create an overdue task (plan_end_date is yesterday, status is not completed)
        $overdueTask = $this->detailedActivity->subActivity->detailedActivities()->create([
            'name' => 'Overdue Task',
            'status' => 'in_progress',
            'responsible' => 'PPM', // Project Manager abbreviation
            'plan_end_date' => Carbon::create(2026, 6, 23, 17, 0, 0),
        ]);

        // Create a due soon task (plan_end_date is tomorrow, status is not completed)
        $dueSoonTask = $this->detailedActivity->subActivity->detailedActivities()->create([
            'name' => 'Due Soon Task',
            'status' => 'in_progress',
            'responsible' => 'PM',
            'plan_end_date' => Carbon::create(2026, 6, 25, 17, 0, 0),
        ]);

        // Create a completed task that is technically past due but shouldn't trigger alerts
        $completedTask = $this->detailedActivity->subActivity->detailedActivities()->create([
            'name' => 'Completed Task',
            'status' => 'completed',
            'responsible' => 'PM',
            'plan_end_date' => Carbon::create(2026, 6, 23, 17, 0, 0),
        ]);

        // Load notifications as Project Manager
        $response = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->getJson('/api/notifications');

        $response->assertStatus(200);

        // Verify notification records in DB
        $this->assertDatabaseHas('notifications', [
            'user_role' => 'Project Manager',
            'type' => 'overdue',
            'detailed_activity_id' => $overdueTask->id,
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_role' => 'Project Manager',
            'type' => 'due_soon',
            'detailed_activity_id' => $dueSoonTask->id,
        ]);

        // Completed task should not have overdue alerts
        $this->assertDatabaseMissing('notifications', [
            'detailed_activity_id' => $completedTask->id,
        ]);

        // Verify response shape
        $response->assertJsonStructure([
            'unread_count',
            'notifications' => [
                '*' => [
                    'id', 'user_role', 'type', 'severity', 'title', 'message',
                    'detailed_activity_id', 'link_url', 'event_key', 'is_read', 'created_at'
                ]
            ]
        ]);
        
        // 4, not 2: the overdue + due_soon notifications this test seeds,
        // plus 005-support-ops-automation's daily summary + weekly report,
        // generated for every internal-role request per FR-007 (even with
        // zero qualifying Support Ops activity, as here).
        $this->assertEquals(4, $response->json('unread_count'));
    }

    /**
     * Test duplicate prevention logic on load.
     */
    public function test_dynamic_notifications_are_deduplicated(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 6, 24, 12, 0, 0));

        $overdueTask = $this->detailedActivity->subActivity->detailedActivities()->create([
            'name' => 'Overdue Task',
            'status' => 'in_progress',
            'responsible' => 'PM',
            'plan_end_date' => Carbon::create(2026, 6, 23, 17, 0, 0),
        ]);

        // Load notifications twice
        $projectManager = $this->createUser('Project Manager');
        $this->actingAs($projectManager, 'sanctum')->getJson('/api/notifications');
        $this->actingAs($projectManager, 'sanctum')->getJson('/api/notifications');

        // Assert only ONE overdue notification exists in database
        $this->assertEquals(1, Notification::where('type', 'overdue')->where('detailed_activity_id', $overdueTask->id)->count());
    }

    /**
     * Test marking notification as read ownership check.
     */
    public function test_user_cannot_mark_another_roles_notification_as_read(): void
    {
        $notification = Notification::create([
            'user_role' => 'Project Manager',
            'type' => 'assignment',
            'title' => 'Assigned PM',
            'message' => 'Test PM',
            'detailed_activity_id' => $this->detailedActivity->id,
        ]);

        // Try marking read as Team Member
        $response = $this->actingAs($this->createUser('Team Member'), 'sanctum')
            ->putJson("/api/notifications/{$notification->id}/read");

        $response->assertStatus(403);
        $this->assertFalse((bool) $notification->fresh()->is_read);

        // Mark read as Project Manager
        $responseSuccess = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->putJson("/api/notifications/{$notification->id}/read");

        $responseSuccess->assertStatus(200);
        $this->assertTrue((bool) $notification->fresh()->is_read);
        $this->assertNotNull($notification->fresh()->read_at);
    }

    /**
     * Test marking all notifications as read.
     */
    public function test_mark_all_as_read_only_updates_own_role(): void
    {
        $pmNotification = Notification::create([
            'user_role' => 'Project Manager',
            'type' => 'assignment',
            'title' => 'Test PM',
            'message' => 'Test PM Msg',
        ]);

        $tmNotification = Notification::create([
            'user_role' => 'Team Member',
            'type' => 'assignment',
            'title' => 'Test TM',
            'message' => 'Test TM Msg',
        ]);

        $response = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->postJson('/api/notifications/read-all');

        $response->assertStatus(200);
        $this->assertTrue((bool) $pmNotification->fresh()->is_read);
        $this->assertFalse((bool) $tmNotification->fresh()->is_read);
    }

    /**
     * Test mention parser in comments.
     */
    public function test_comment_mentions_trigger_notifications(): void
    {
        // Post a comment mentioning Project Manager and Admin as Team Member
        $comment = Comment::create([
            'detailed_activity_id' => $this->detailedActivity->id,
            'author' => 'Team Member',
            'author_role' => 'Team Member',
            'body' => 'Hey @PM and @Admin, check this out!',
            'visibility' => 'internal',
        ]);

        Notification::parseAndSendMentions($comment->body, $comment, $this->detailedActivity);

        // Project Manager and Admin should be notified
        $this->assertDatabaseHas('notifications', [
            'user_role' => 'Project Manager',
            'type' => 'mention',
            'detailed_activity_id' => $this->detailedActivity->id,
        ]);

        $this->assertDatabaseHas('notifications', [
            'user_role' => 'Admin',
            'type' => 'mention',
            'detailed_activity_id' => $this->detailedActivity->id,
        ]);

        // Team Member should NOT be notified because they wrote the comment
        $this->assertDatabaseMissing('notifications', [
            'user_role' => 'Team Member',
            'type' => 'mention',
        ]);
    }

    /**
     * Test assignment trigger when creating or editing a task.
     */
    public function test_task_assignment_triggers_notification(): void
    {
        // 1. Create task via controller as Team Member, assigned to PM
        $subActivity = $this->detailedActivity->subActivity;
        $teamMember = $this->createUser('Team Member');
        \App\Models\ProjectAssignment::create([
            'user_id' => $teamMember->id,
            'project_id' => $this->project->id,
            'assigned_by_user_id' => $this->createUser('Admin')->id,
        ]);
        $response = $this->actingAs($teamMember, 'sanctum')
            ->postJson(route('sub-activities.detailed-activities.store', $subActivity), [
                'name' => 'New Assigned Task',
                'responsible' => 'PPM',
            ]);

        $response->assertStatus(201);
        $newTaskId = $response->json('id');

        $this->assertDatabaseHas('notifications', [
            'user_role' => 'Project Manager',
            'type' => 'assignment',
            'detailed_activity_id' => $newTaskId,
        ]);

        // 2. Update task assignee via controller
        $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->putJson(route('detailed-activities.update', $newTaskId), [
                'responsible' => 'PTS', // Team Member abbreviation
            ]);

        $this->assertDatabaseHas('notifications', [
            'user_role' => 'Team Member',
            'type' => 'assignment',
            'detailed_activity_id' => $newTaskId,
        ]);
    }

    /**
     * Test blocked alert triggers exactly once.
     */
    public function test_blocked_task_status_alerts_project_manager(): void
    {
        $teamMember = $this->createUser('Team Member');
        \App\Models\ProjectAssignment::create([
            'user_id' => $teamMember->id,
            'project_id' => $this->project->id,
            'assigned_by_user_id' => $this->createUser('Admin')->id,
        ]);

        // Update task status to blocked
        $response = $this->actingAs($teamMember, 'sanctum')
            ->putJson(route('detailed-activities.update', $this->detailedActivity), [
                'status' => 'blocked',
            ]);

        $response->assertStatus(200);

        $this->assertDatabaseHas('notifications', [
            'user_role' => 'Project Manager',
            'type' => 'blocked',
            'detailed_activity_id' => $this->detailedActivity->id,
        ]);

        // Save again without changing status
        $this->actingAs($teamMember, 'sanctum')
            ->putJson(route('detailed-activities.update', $this->detailedActivity), [
                'notes' => 'Some extra notes',
            ]);

        // The count of blocked notifications should still be 1 (no duplicate)
        $this->assertEquals(1, Notification::where('type', 'blocked')->where('detailed_activity_id', $this->detailedActivity->id)->count());
    }
}
