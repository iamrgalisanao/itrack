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
use Tests\TestCase;

/**
 * 009-support-ops-knowledge-base: a searchable, browsable, read-only view
 * over resolved Support Ops issues that already have both a root cause and
 * a resolution recorded. US1 (search), US2 (browse/filter) covered here —
 * US3 (open full context) has no new backend endpoint, per contracts.md.
 */
class SupportOpsKnowledgeBaseTest extends TestCase
{
    use RefreshDatabase;

    private function createUser(?string $role, ?string $department = 'IT'): User
    {
        return User::factory()->create(['role' => $role, 'department' => $department]);
    }

    /** Builds a full Project → Module → Activity → SubActivity → DetailedActivity chain. */
    private function makeIssue(int $projectId, array $overrides = []): DetailedActivity
    {
        $module = Module::factory()->create(['project_id' => $projectId]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        return DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible'  => false,
            'work_type'       => 'support',
            'status'          => 'completed',
            'root_cause'      => 'Default root cause.',
            'resolution'      => 'Default resolution.',
            ...$overrides,
        ]);
    }

    /** A resolved, complete issue — the baseline "eligible" fixture. */
    private function makeResolvedIssue(int $projectId, array $overrides = []): DetailedActivity
    {
        return $this->makeIssue($projectId, $overrides);
    }

    private function endpoint(): string
    {
        return '/api/support-ops/knowledge-base';
    }

    private function idsIn($res): \Illuminate\Support\Collection
    {
        return collect($res->json('data'))->pluck('id');
    }

    // ─── T003: keyword matches name/client/tenant/root_cause/resolution ──────

    public function test_keyword_matches_across_five_fields(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);

        $byName = $this->makeResolvedIssue($project->id, ['name' => 'Checkout page crash']);
        $byClient = $this->makeResolvedIssue($project->id, ['client_name' => 'Acme Corp']);
        $byTenant = $this->makeResolvedIssue($project->id, ['tenant_name' => 'acme-prod']);
        $byRootCause = $this->makeResolvedIssue($project->id, ['root_cause' => 'Connection pool exhausted under peak load.']);
        $byResolution = $this->makeResolvedIssue($project->id, ['resolution' => 'Increased pool size and added a circuit breaker.']);

        $cases = [
            ['crash', $byName->id],
            ['Acme', $byClient->id],
            ['acme-prod', $byTenant->id],
            ['pool exhausted', $byRootCause->id],
            ['circuit breaker', $byResolution->id],
        ];

        foreach ($cases as [$keyword, $expectedId]) {
            $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?q=' . urlencode($keyword));
            $res->assertOk();
            $this->assertTrue($this->idsIn($res)->contains($expectedId), "Expected keyword '{$keyword}' to match issue {$expectedId}");
        }
    }

    // ─── T004: case-insensitive and partial match ─────────────────────────────

    public function test_search_is_case_insensitive_and_partial(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);
        $issue = $this->makeResolvedIssue($project->id, ['client_name' => 'Acme Corp']);

        foreach (['ACME', 'acme', 'Acme', 'cme Cor'] as $keyword) {
            $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?q=' . urlencode($keyword));
            $res->assertOk();
            $this->assertTrue($this->idsIn($res)->contains($issue->id), "Expected keyword '{$keyword}' to match case-insensitively/partially");
        }
    }

    // ─── T005: literal %, _, \ characters match literally, not as wildcards ──

    public function test_wildcard_characters_are_matched_literally(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);

        $literalPercent = $this->makeResolvedIssue($project->id, ['root_cause' => 'CPU usage hit 100% during the incident.']);
        $unrelated = $this->makeResolvedIssue($project->id, ['root_cause' => 'CPU usage hit XYZ during the incident.']);

        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?q=' . urlencode('100%'));
        $res->assertOk();
        $ids = $this->idsIn($res);
        $this->assertTrue($ids->contains($literalPercent->id));
        $this->assertFalse($ids->contains($unrelated->id));

        $literalUnderscore = $this->makeResolvedIssue($project->id, ['name' => 'job_queue_worker crashed']);
        $res2 = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?q=' . urlencode('job_queue'));
        $res2->assertOk();
        $this->assertTrue($this->idsIn($res2)->contains($literalUnderscore->id));

        // A literal backslash in the search text (e.g. a Windows path) must
        // match as ordinary text — this is the exact character MySQL and
        // SQLite disagreed about when this feature used backslash as its own
        // ESCAPE character (see research.md's "found during implementation"
        // correction); switching to `!` means backslash carries no special
        // meaning in this LIKE clause at all, so it just needs to pass
        // through untouched.
        $literalBackslash = $this->makeResolvedIssue($project->id, ['root_cause' => 'Config path was C:\\Users\\admin\\config.ini and was missing.']);
        $res3 = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?q=' . urlencode('C:\\Users\\admin'));
        $res3->assertOk();
        $this->assertTrue($this->idsIn($res3)->contains($literalBackslash->id));
    }

    // ─── T006: missing root cause or resolution (or both) excludes the issue ──

    public function test_issue_missing_root_cause_or_resolution_is_excluded(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);

        $missingBoth = $this->makeResolvedIssue($project->id, [
            'name' => 'Payment gateway outage', 'root_cause' => null, 'resolution' => null,
        ]);
        $missingResolution = $this->makeResolvedIssue($project->id, [
            'name' => 'Payment gateway outage v2', 'root_cause' => 'Some cause', 'resolution' => '   ',
        ]);
        $missingRootCause = $this->makeResolvedIssue($project->id, [
            'name' => 'Payment gateway outage v3', 'root_cause' => '', 'resolution' => 'Some fix',
        ]);

        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?q=' . urlencode('Payment gateway'));
        $res->assertOk();
        $ids = $this->idsIn($res);
        $this->assertFalse($ids->contains($missingBoth->id));
        $this->assertFalse($ids->contains($missingResolution->id));
        $this->assertFalse($ids->contains($missingRootCause->id));
    }

    // ─── T007: a non-resolved issue is excluded regardless of match ───────────

    public function test_non_resolved_issue_is_excluded(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);

        $open = $this->makeIssue($project->id, [
            'name' => 'Still investigating widget failure',
            'status' => 'in_progress',
            'root_cause' => 'Widget failure root cause.',
            'resolution' => 'Widget failure resolution.',
        ]);

        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?q=' . urlencode('widget failure'));
        $res->assertOk();
        $this->assertFalse($this->idsIn($res)->contains($open->id));
    }

    // ─── T008: visibility scoped to accessible projects, every internal role ─

    public function test_results_scoped_to_accessible_projects(): void
    {
        $itProject = Project::factory()->create(['department' => 'IT']);
        $financeProject = Project::factory()->create(['department' => 'Finance']);
        $itIssue = $this->makeResolvedIssue($itProject->id, ['name' => 'IT scoped issue']);
        $financeIssue = $this->makeResolvedIssue($financeProject->id, ['name' => 'Finance scoped issue']);

        // Admin/PM: unrestricted.
        foreach (['Admin', 'Project Manager'] as $role) {
            $user = $this->createUser($role, 'IT');
            $res = $this->actingAs($user, 'sanctum')->getJson($this->endpoint());
            $ids = $this->idsIn($res);
            $this->assertTrue($ids->contains($itIssue->id));
            $this->assertTrue($ids->contains($financeIssue->id));
        }

        // Department Head, scoped to their own department (IT) only —
        // no DepartmentGrant to Finance exists in this fixture.
        $deptHead = $this->createUser('Department Head', 'IT');
        $res = $this->actingAs($deptHead, 'sanctum')->getJson($this->endpoint());
        $ids = $this->idsIn($res);
        $this->assertTrue($ids->contains($itIssue->id));
        $this->assertFalse($ids->contains($financeIssue->id));

        // Team Member with only partial (IT) project access.
        $teamMember = $this->createUser('Team Member', 'IT');
        ProjectAssignment::create([
            'user_id' => $teamMember->id,
            'project_id' => $itProject->id,
            'assigned_by_user_id' => $this->createUser('Admin', 'IT')->id,
        ]);
        $res = $this->actingAs($teamMember, 'sanctum')->getJson($this->endpoint());
        $ids = $this->idsIn($res);
        $this->assertTrue($ids->contains($itIssue->id));
        $this->assertFalse($ids->contains($financeIssue->id));
    }

    // ─── T009: Client role denied, including a direct API request ────────────

    public function test_client_role_is_denied(): void
    {
        $client = $this->createUser('Client', 'IT');
        $res = $this->actingAs($client, 'sanctum')->getJson($this->endpoint());
        $res->assertStatus(403);
        $res->assertJson(['message' => 'Unauthorized: Support Ops is restricted to internal team members.']);
    }

    // ─── T010: zero matches returns 200 with an empty set, not an error ──────

    public function test_zero_matches_returns_empty_set_not_error(): void
    {
        $admin = $this->createUser('Admin');
        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?q=' . urlencode('nonexistent-keyword-xyz'));
        $res->assertOk();
        $this->assertCount(0, $res->json('data'));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // User Story 2: Browse resolved issues without a keyword
    // ═══════════════════════════════════════════════════════════════════════

    // ─── T017: browsing with no keyword, ordered most-recently-resolved first

    public function test_browse_with_no_keyword_orders_most_recently_resolved_first(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);

        $older = $this->makeResolvedIssue($project->id, ['name' => 'Older issue', 'updated_at' => now()->subDays(5)]);
        $newer = $this->makeResolvedIssue($project->id, ['name' => 'Newer issue', 'updated_at' => now()->subDay()]);

        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());
        $res->assertOk();
        $ids = $this->idsIn($res)->values();

        $this->assertLessThan($ids->search($older->id), $ids->search($newer->id));
    }

    // ─── T018: project/client/tenant/priority filters narrow individually ────

    public function test_filters_narrow_results_individually(): void
    {
        $admin = $this->createUser('Admin');
        $projectA = Project::factory()->create(['department' => 'IT']);
        $projectB = Project::factory()->create(['department' => 'IT']);

        $target = $this->makeResolvedIssue($projectA->id, [
            'name' => 'Target issue', 'client_name' => 'Acme', 'tenant_name' => 'acme-prod', 'client_priority' => 'P1',
        ]);
        $other = $this->makeResolvedIssue($projectB->id, [
            'name' => 'Other issue', 'client_name' => 'Globex', 'tenant_name' => 'globex-prod', 'client_priority' => 'P3',
        ]);

        foreach ([
            ['project_id', $projectA->id],
            ['client_name', 'Acme'],
            ['tenant_name', 'acme-prod'],
            ['client_priority', 'P1'],
        ] as [$param, $value]) {
            $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?' . $param . '=' . urlencode($value));
            $res->assertOk();
            $ids = $this->idsIn($res);
            $this->assertTrue($ids->contains($target->id), "Filter {$param}={$value} should include the target issue");
            $this->assertFalse($ids->contains($other->id), "Filter {$param}={$value} should exclude the other issue");
        }
    }

    // ─── T019: keyword + filter combine with AND, narrower than either alone ─

    public function test_keyword_and_filter_combine_with_and(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);

        $matchesBoth = $this->makeResolvedIssue($project->id, ['name' => 'Login timeout issue', 'client_name' => 'Acme']);
        $matchesKeywordOnly = $this->makeResolvedIssue($project->id, ['name' => 'Login timeout issue v2', 'client_name' => 'Globex']);
        $matchesFilterOnly = $this->makeResolvedIssue($project->id, ['name' => 'Unrelated billing issue', 'client_name' => 'Acme']);

        $res = $this->actingAs($admin, 'sanctum')->getJson(
            $this->endpoint() . '?q=' . urlencode('timeout') . '&client_name=' . urlencode('Acme')
        );
        $res->assertOk();
        $ids = $this->idsIn($res);
        $this->assertTrue($ids->contains($matchesBoth->id));
        $this->assertFalse($ids->contains($matchesKeywordOnly->id));
        $this->assertFalse($ids->contains($matchesFilterOnly->id));
    }

    // ─── T020: pagination matches UserManagementController's shape ───────────

    public function test_pagination_matches_established_shape(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);
        foreach (range(1, 3) as $i) {
            $this->makeResolvedIssue($project->id, ['name' => "Paginated issue {$i}"]);
        }

        $default = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());
        $default->assertOk();
        $this->assertEquals(15, $default->json('meta.per_page'));

        $custom = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?per_page=2');
        $custom->assertOk();
        $this->assertCount(2, $custom->json('data'));

        $tooLarge = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?per_page=101');
        $tooLarge->assertStatus(422);

        $tooSmall = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint() . '?per_page=0');
        $tooSmall->assertStatus(422);
    }
}
