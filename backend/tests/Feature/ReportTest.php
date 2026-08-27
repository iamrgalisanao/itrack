<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\DetailedActivity;
use App\Models\Comment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Carbon\Carbon;

class ReportTest extends TestCase
{
    use RefreshDatabase;

    private $project1;
    private $project2;
    private $task1;
    private $task2;
    private $milestone1;

    protected function setUp(): void
    {
        parent::setUp();

        // Project 1 (IT Department)
        $this->project1 = Project::create([
            'name' => 'IT Project Alpha',
            'department' => 'IT',
            'health' => 'on_track',
        ]);
        $module1 = $this->project1->modules()->create(['name' => 'Module 1']);
        $activity1 = $module1->activities()->create(['name' => 'Activity 1']);
        $subActivity1 = $activity1->subActivities()->create(['name' => 'Sub Activity 1']);
        
        // Task 1: Overdue Task
        $this->task1 = $subActivity1->detailedActivities()->create([
            'name' => 'Overdue Task 1',
            'status' => 'in_progress',
            'plan_end_date' => Carbon::now()->subDays(2),
            'progress' => 40,
            'duration_days' => 5,
        ]);

        // Task 2: Blocked Task
        $this->task2 = $subActivity1->detailedActivities()->create([
            'name' => 'Blocked Task 2',
            'status' => 'blocked',
            'plan_end_date' => Carbon::now()->addDays(5),
            'progress' => 20,
            'duration_days' => 10,
        ]);

        // Milestone 1: Zero duration
        $this->milestone1 = $subActivity1->detailedActivities()->create([
            'name' => 'Project Kickoff Milestone',
            'status' => 'completed',
            'duration_months' => 0,
            'duration_days' => 0,
            'plan_end_date' => Carbon::now()->subDays(1),
            'progress' => 100,
        ]);

        // Project 2 (Marketing Department)
        $this->project2 = Project::create([
            'name' => 'Marketing Campaign',
            'department' => 'Marketing',
            'health' => 'at_risk',
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
     * Test Report aggregation metrics for internal role.
     */
    public function test_internal_roles_receive_full_reports_with_warning_signals(): void
    {
        $response = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->getJson(route('reports.index'));

        $response->assertStatus(200);

        // Verify summary values
        $response->assertJsonPath('summary.project_count', 2);
        $response->assertJsonPath('summary.task_count', 3);
        $response->assertJsonPath('summary.overdue_count', 1);
        $response->assertJsonPath('summary.blocked_count', 1);
        
        // Verify response shape for internal
        $response->assertJsonStructure([
            'summary' => [
                'project_count', 'task_count', 'overall_progress', 'overdue_count', 'blocked_count', 'dependency_risk_count'
            ],
            'projects' => [
                '*' => [
                    'id', 'name', 'department', 'health', 'health_label', 'progress', 'overdue_count', 'blocked_count', 'dependency_risk_count', 'milestones', 'status_breakdown'
                ]
            ],
            'generated_at',
        ]);
    }

    /**
     * Test department scope restrictions for Department Head.
     */
    public function test_department_head_restricted_to_own_department_projects(): void
    {
        $response = $this->actingAs($this->createUser('Department Head', 'IT'), 'sanctum')
            ->getJson(route('reports.index'));

        $response->assertStatus(200);
        $response->assertJsonPath('summary.project_count', 1);
        $response->assertJsonFragment(['name' => 'IT Project Alpha']);
        $response->assertJsonMissing(['name' => 'Marketing Campaign']);
    }

    /**
     * Test Client scope restrictions (basic health, milestones only, hide details).
     */
    public function test_client_restricted_to_project_level_summaries_and_milestones(): void
    {
        $client = $this->createUser('Client', 'IT');
        \App\Models\ProjectAssignment::create([
            'user_id' => $client->id,
            'project_id' => $this->project1->id,
            'assigned_by_user_id' => $this->createUser('Admin', 'IT')->id,
        ]);

        $response = $this->actingAs($client, 'sanctum')
            ->getJson(route('reports.index'));

        $response->assertStatus(200);

        // Verify Client summary does not leak internal warnings/task counts
        $response->assertJsonMissingPath('summary.task_count');
        $response->assertJsonMissingPath('summary.overdue_count');
        $response->assertJsonMissingPath('summary.blocked_count');

        // Verify project details exclude internal operational counts/breakdowns
        $response->assertJsonMissingPath('projects.0.overdue_count');
        $response->assertJsonMissingPath('projects.0.blocked_count');
        $response->assertJsonMissingPath('projects.0.status_breakdown');

        // The Client must NOT receive the internal milestone. `client_visible`
        // defaults to false, so `Project Kickoff Milestone` in setUp() is
        // internal.
        //
        // This assertion used to be its exact inverse -- the suite asserted the
        // Client DID receive that name, and passed. The leak was encoded as
        // expected behaviour, which is why 451 green tests never surfaced it and
        // why fixing the controller turned the suite red. A test that pins a
        // defect is worse than no test: it converts the fix into a regression.
        $response->assertJsonMissing(['name' => 'Project Kickoff Milestone']);

        // ...and must still receive one that is genuinely client-visible, or
        // this endpoint would be "fixed" by returning nothing at all.
        $visible = $this->project1->modules->first()
            ->activities->first()
            ->subActivities->first()
            ->detailedActivities()->create([
                'name'            => 'Client Visible Milestone',
                'status'          => 'completed',
                'duration_months' => 0,
                'duration_days'   => 0,
                'plan_end_date'   => Carbon::now()->subDays(1),
                'progress'        => 100,
                'client_visible'  => true,
            ]);

        $second = $this->actingAs($client, 'sanctum')->getJson(route('reports.index'));

        $second->assertStatus(200);
        $second->assertJsonCount(1, 'projects.0.milestones');
        $second->assertJsonFragment(['name' => 'Client Visible Milestone']);
        $second->assertJsonMissing(['name' => 'Project Kickoff Milestone']);

        $this->assertTrue($visible->client_visible);
    }

    public function test_client_progress_excludes_internal_tasks(): void
    {
        $client = $this->createUser('Client', 'IT');
        \App\Models\ProjectAssignment::create([
            'user_id'             => $client->id,
            'project_id'          => $this->project1->id,
            'assigned_by_user_id' => $this->createUser('Admin', 'IT')->id,
        ]);

        $subActivity = $this->project1->modules->first()
            ->activities->first()
            ->subActivities->first();

        // One visible task at 0%, alongside setUp()'s internal task at 100%.
        $subActivity->detailedActivities()->create([
            'name'           => 'Client Visible Work',
            'status'         => 'in_progress',
            'progress'       => 0,
            'client_visible' => true,
        ]);

        $response = $this->actingAs($client, 'sanctum')->getJson(route('reports.index'));

        $response->assertStatus(200);

        // Averaging the internal 100% in would both overstate progress and leak
        // volume: a Client could infer how much work exists that they cannot
        // see. Aggregates are disclosure -- the lesson the dashboard heatmap
        // taught one endpoint over.
        $this->assertSame(0, $response->json('projects.0.progress'));
    }

    /**
     * Test dependency risk detection warning counts.
     */
    public function test_dependency_risk_warning_calculations(): void
    {
        // Make task 2 dependent on task 1 (which is overdue)
        $this->task2->predecessors()->attach($this->task1->id);

        $response = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->getJson(route('reports.index'));

        $response->assertStatus(200);
        // Task 2 has a dependency risk because its predecessor (task 1) is overdue and task 2 is incomplete
        $response->assertJsonPath('summary.dependency_risk_count', 1);
        $response->assertJsonPath('projects.0.dependency_risk_count', 1);
    }

    /**
     * Test CSV export accessibility rules.
     */
    public function test_clients_forbidden_from_exporting_csv(): void
    {
        $response = $this->actingAs($this->createUser('Client', 'IT'), 'sanctum')
            ->getJson(route('reports.export-csv'));

        $response->assertStatus(403);
    }

    public function test_internal_roles_can_export_csv(): void
    {
        $response = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->getJson(route('reports.export-csv'));

        $response->assertStatus(200);
        $response->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
        
        $csvContent = $response->streamedContent();
        $this->assertStringContainsString('Project,Department,Task,Assignee', $csvContent);
        $this->assertStringContainsString('IT Project Alpha', $csvContent);
        $this->assertStringContainsString('Overdue Task 1', $csvContent);
    }

    /**
     * Test manual project health update permissions.
     */
    public function test_only_pm_and_admin_can_update_project_health(): void
    {
        // 1. Team Member tries to update -> 403
        $responseTM = $this->actingAs($this->createUser('Team Member'), 'sanctum')
            ->patchJson(route('projects.health', $this->project1), [
                'health' => 'at_risk',
                'health_note' => 'Looks risky',
            ]);
        $responseTM->assertStatus(403);
        $this->assertEquals('on_track', $this->project1->fresh()->health);

        // 2. Project Manager updates health -> 200
        $responsePM = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->patchJson(route('projects.health', $this->project1), [
                'health' => 'at_risk',
                'health_note' => 'Budget constraints',
            ]);
        
        $responsePM->assertStatus(200);
        $updatedProject = $this->project1->fresh();
        $this->assertEquals('at_risk', $updatedProject->health);
        $this->assertEquals('Budget constraints', $updatedProject->health_note);
        $this->assertEquals('Project Manager', $updatedProject->health_updated_by);
        $this->assertNotNull($updatedProject->health_updated_at);
    }

    /**
     * Test health update validation.
     */
    public function test_invalid_health_values_are_rejected(): void
    {
        $response = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->patchJson(route('projects.health', $this->project1), [
                'health' => 'super_healthy', // invalid
            ]);

        $response->assertStatus(422);
    }
}
