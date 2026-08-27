<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\SubActivity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The `client_visible` boundary, tested by sentinel rather than by endpoint.
 *
 * `Project::accessibleTo()` answers "which projects a user may reach".
 * This boundary answers "which tasks inside them", and it had no owner: it
 * was a `where()` each author had to remember, in five query shapes across
 * nine controllers. It was forgotten in the dashboard heatmap (a raw join),
 * the Reports tree (an eager load), and the sub-activity endpoints (a
 * relation) — three separate audits, three separate incidents, one cause.
 *
 * So these tests do not check a filter is present. They plant an internal task
 * carrying a string that must never reach a Client, then read every endpoint a
 * Client can reach and assert the string is absent from the whole response
 * body. A new endpoint that forgets the filter fails here, rather than waiting
 * for the next audit to notice it.
 */
class ClientVisibilityBoundaryTest extends TestCase
{
    use RefreshDatabase;

    /** Appears only on the internal task. Must never reach a Client. */
    private const SENTINEL = 'SENTINEL-INTERNAL-DO-NOT-DISCLOSE';

    private function createUser(string $role, string $dept = 'IT'): User
    {
        return User::factory()->create(['role' => $role, 'department' => $dept, 'is_active' => true]);
    }

    private function makeChain(): array
    {
        $project = Project::factory()->create(['department' => 'IT']);
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

    /**
     * One internal task carrying the sentinel in every free-text field a raw
     * model would serialise, plus one visible task so an endpoint cannot pass
     * by returning nothing at all.
     *
     * Both durations are pinned to 0 deliberately. `/api/reports` only surfaces
     * tasks its `milestonesForProject()` treats as milestones — both durations
     * zero — and the factory defaults `duration_days` to 1. Without these two
     * lines the sentinel is structurally ineligible for the reports payload, so
     * the `reports` provider row passes whether the filter is there or not.
     * Verified: revert the ReportController fix and that row fails; restore it
     * and it passes.
     */
    private function seedBoundary(): array
    {
        $chain = $this->makeChain();
        $client = $this->createUser('Client');
        $this->assign($client, $chain['project']);

        $internal = DetailedActivity::factory()->create([
            'sub_activity_id' => $chain['subActivity']->id,
            'name'            => self::SENTINEL,
            'notes'           => self::SENTINEL,
            'client_visible'  => false,
            'status'          => 'in_progress',
            'duration_months' => 0,
            'duration_days'   => 0,
        ]);

        $visible = DetailedActivity::factory()->create([
            'sub_activity_id' => $chain['subActivity']->id,
            'name'            => 'Shared With Client',
            'client_visible'  => true,
            'status'          => 'in_progress',
            'duration_months' => 0,
            'duration_days'   => 0,
        ]);

        return compact('chain', 'client', 'internal', 'visible');
    }

    public static function clientReachableRoutes(): array
    {
        return [
            'sub-activities index' => ['/api/activities/%activity%/sub-activities'],
            'sub-activity show'    => ['/api/sub-activities/%subActivity%'],
            'detailed activities'  => ['/api/sub-activities/%subActivity%/detailed-activities'],
            'modules index'        => ['/api/projects/%project%/modules'],
            'dashboard'            => ['/api/dashboard'],
            'reports'              => ['/api/reports'],
        ];
    }

    #[DataProvider('clientReachableRoutes')]
    public function test_no_client_reachable_endpoint_discloses_an_internal_task(string $template): void
    {
        ['chain' => $chain, 'client' => $client] = $this->seedBoundary();

        $url = strtr($template, [
            '%project%'     => $chain['project']->id,
            '%activity%'    => $chain['activity']->id,
            '%subActivity%' => $chain['subActivity']->id,
        ]);

        $response = $this->actingAs($client, 'sanctum')->getJson($url);

        // A 403 is a perfectly good answer; what must never happen is a 200
        // carrying the sentinel.
        if ($response->status() !== 200) {
            $this->assertContains($response->status(), [403, 404], "Unexpected status for {$url}");

            return;
        }

        $this->assertStringNotContainsString(
            self::SENTINEL,
            $response->getContent(),
            "{$url} disclosed an internal task to a Client"
        );
    }

    public function test_sub_activity_endpoints_still_return_the_visible_task(): void
    {
        ['chain' => $chain, 'client' => $client] = $this->seedBoundary();

        // Guards the fix against the laziest possible regression: filtering
        // everything out and calling the boundary closed.
        foreach ([
            "/api/activities/{$chain['activity']->id}/sub-activities",
            "/api/sub-activities/{$chain['subActivity']->id}",
        ] as $url) {
            $response = $this->actingAs($client, 'sanctum')->getJson($url);
            $response->assertOk();
            $this->assertStringContainsString('Shared With Client', $response->getContent(), $url);
        }
    }

    public function test_internal_roles_still_see_the_internal_task(): void
    {
        ['chain' => $chain] = $this->seedBoundary();
        $member = $this->createUser('Team Member');
        $this->assign($member, $chain['project']);

        $response = $this->actingAs($member, 'sanctum')
            ->getJson("/api/sub-activities/{$chain['subActivity']->id}");

        $response->assertOk();
        $this->assertStringContainsString(self::SENTINEL, $response->getContent());
    }
}
