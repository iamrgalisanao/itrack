<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Comment;
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

    /**
     * Appears on the internal-only *fields* of a task the Client may legitimately
     * see. Guards the other axis: the row is allowed through, the fields are not.
     *
     * The row sentinel above cannot detect this. It sits only on the hidden task,
     * so an endpoint that filters rows correctly and then serialises raw models
     * passes it while disclosing notes, root_cause, resolution and evidence on
     * every visible task. That is a real defect the first version of this file
     * could not see -- the same shape as the misses it was written to prevent: a
     * gate measuring the wrong axis.
     */
    private const FIELD_SENTINEL = 'FIELD-SENTINEL-INTERNAL-ONLY';

    private function createUser(string $role, string $dept = 'IT'): User
    {
        return User::factory()->create(['role' => $role, 'department' => $dept, 'is_active' => true]);
    }

    private function makeChain(): array
    {
        $project = Project::factory()->create(['department' => 'IT']);
        $module = Module::factory()->create([
            'project_id' => $project->id, 'responsible' => self::FIELD_SENTINEL,
        ]);
        $activity = Activity::factory()->create([
            'module_id' => $module->id, 'responsible' => self::FIELD_SENTINEL,
        ]);
        $subActivity = SubActivity::factory()->create([
            'activity_id' => $activity->id, 'responsible' => self::FIELD_SENTINEL,
        ]);

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
            // Client-visible row, internal-only fields. Every one of these is
            // outside DetailedActivityResource's Client branch by design.
            'notes'           => self::FIELD_SENTINEL,
            'root_cause'      => self::FIELD_SENTINEL,
            'resolution'      => self::FIELD_SENTINEL,
            'evidence'        => self::FIELD_SENTINEL,
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

        $this->assertStringNotContainsString(
            self::FIELD_SENTINEL,
            $response->getContent(),
            "{$url} disclosed internal fields of a client-visible task to a Client"
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

    /**
     * `comments_count` is produced by ModuleController's `withCount` and by
     * nothing else, so moving that tree onto DetailedActivityResource could
     * have dropped it. Nothing in the suite covered it, and the frontend reads
     * it as `?? 0` at eight call sites -- so the regression would have shipped
     * as every task silently showing zero comments, with no error anywhere.
     *
     * The count is also a disclosure surface in its own right: an internal
     * comment on a client-visible task must not raise the number a Client sees.
     */
    public function test_modules_tree_keeps_comment_counts_and_scopes_them_by_visibility(): void
    {
        ['chain' => $chain, 'client' => $client, 'visible' => $visible] = $this->seedBoundary();

        Comment::create([
            'detailed_activity_id' => $visible->id,
            'author'               => 'PM',
            'author_role'          => 'Project Manager',
            'body'                 => 'Shared with the client',
            'visibility'           => Comment::VISIBILITY_CLIENT_VISIBLE,
        ]);
        Comment::create([
            'detailed_activity_id' => $visible->id,
            'author'               => 'PM',
            'author_role'          => 'Project Manager',
            'body'                 => self::FIELD_SENTINEL,
            'visibility'           => Comment::VISIBILITY_INTERNAL,
        ]);

        $url = "/api/projects/{$chain['project']->id}/modules";

        $seen = fn ($user) => data_get(
            $this->actingAs($user, 'sanctum')->getJson($url)->json(),
            '0.activities.0.sub_activities.0.detailed_activities'
        );

        $clientTasks = collect($seen($client))->firstWhere('id', $visible->id);
        $this->assertNotNull($clientTasks, 'Client lost the visible task entirely');
        $this->assertArrayHasKey('comments_count', $clientTasks, 'comments_count was dropped');
        $this->assertSame(1, $clientTasks['comments_count'], 'Client saw the internal comment in the count');

        $member = $this->createUser('Team Member');
        $this->assign($member, $chain['project']);
        $memberTask = collect($seen($member))->firstWhere('id', $visible->id);
        $this->assertSame(2, $memberTask['comments_count']);
    }

    /**
     * The other half of the boundary, and the half this file kept forgetting to
     * assert: what a Client must still RECEIVE.
     *
     * Neither /schedule nor /work-program is role-guarded (App.jsx:699, :688),
     * so Clients render both from this tree. `Schedule.jsx:367` decides what is
     * a milestone with `duration_months === 0 && duration_days === 0`. Move
     * those two fields behind the internal branch and that comparison becomes
     * `undefined === 0` -- false, always. Milestone detection stops working for
     * Clients only, nothing throws, and no test notices.
     *
     * Every assertion above this one checks that a Client sees less. This one
     * checks the fix did not overshoot, which is the failure mode the field
     * axis invites.
     */
    public function test_client_still_receives_the_fields_their_own_pages_render(): void
    {
        ['chain' => $chain, 'client' => $client, 'visible' => $visible] = $this->seedBoundary();

        $task = collect(data_get(
            $this->actingAs($client, 'sanctum')
                ->getJson("/api/projects/{$chain['project']->id}/modules")
                ->json(),
            '0.activities.0.sub_activities.0.detailed_activities'
        ))->firstWhere('id', $visible->id);

        foreach (['duration_months', 'duration_days', 'plan_start_date', 'plan_end_date', 'status', 'progress'] as $field) {
            $this->assertArrayHasKey($field, $task, "Client lost {$field}, which their own pages render");
        }

        // Specifically the milestone comparison, not merely the key's presence.
        $this->assertSame(0, $task['duration_months']);
        $this->assertSame(0, $task['duration_days']);
    }

    /**
     * The three levels ABOVE a task have the same field boundary, and until now
     * had none. `Module`, `Activity` and `SubActivity` were serialised with
     * `attributesToArray()`, so `responsible` and `support` -- internal staff
     * names -- reached Clients on three endpoints.
     *
     * The row-axis sentinel could not see it and neither could the field-axis
     * one, because both sat only on `DetailedActivity`. The frontend hides the
     * column for Clients (`WorkProgram.jsx:2469`), which is what made this look
     * like defence-in-depth rather than the only gate.
     *
     * Asserted in both directions: withheld from a Client, and still delivered
     * to an internal role. A filter that strips the field from everyone passes
     * the first assertion and breaks the product.
     */
    public function test_parent_levels_withhold_internal_fields_from_clients_only(): void
    {
        ['chain' => $chain, 'client' => $client] = $this->seedBoundary();
        $member = $this->createUser('Team Member');
        $this->assign($member, $chain['project']);

        $url = "/api/projects/{$chain['project']->id}/modules";

        $module = fn ($user) => data_get(
            $this->actingAs($user, 'sanctum')->getJson($url)->json(), '0'
        );

        $forClient = $module($client);
        $this->assertNotNull($forClient, 'Client lost the module tree entirely');
        foreach (['responsible', 'support', 'output', 'sort_order'] as $field) {
            $this->assertArrayNotHasKey($field, $forClient, "Module.{$field} reached a Client");
        }
        $this->assertArrayNotHasKey('responsible', $forClient['activities'][0]);
        $this->assertArrayNotHasKey('responsible', $forClient['activities'][0]['sub_activities'][0]);

        // Still present for an internal role, and still the real value. Assert
        // the key first: without that, a filter stripping the field from
        // everyone fails with "Undefined array key" instead of naming what
        // broke, and a PHP error reads differently from a test failure in CI.
        $forMember = $module($member);
        foreach ([
            'module'       => $forMember,
            'activity'     => $forMember['activities'][0],
            'sub-activity' => $forMember['activities'][0]['sub_activities'][0],
        ] as $level => $node) {
            $this->assertArrayHasKey(
                'responsible', $node,
                "{$level}.responsible was withheld from an internal role -- the filter is not "
                . 'conditional on the audience'
            );
            $this->assertSame(self::FIELD_SENTINEL, $node['responsible'], $level);
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

        // The other direction: the fix must withhold these fields from Clients
        // without withholding them from everyone. Filtering unconditionally
        // would satisfy the assertions above and break the app.
        $this->assertStringContainsString(self::FIELD_SENTINEL, $response->getContent());
    }
}
