<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\Module;
use App\Models\Activity;
use App\Models\SubActivity;
use App\Models\DetailedActivity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SupportOpsGenerationLogTest extends TestCase
{
    use RefreshDatabase;

    private function createUser(?string $role = 'Team Member'): User
    {
        return User::factory()->create(['role' => $role]);
    }

    private function makeTask(int $projectId, array $overrides = []): DetailedActivity
    {
        $module      = Module::factory()->create(['project_id' => $projectId]);
        $activity    = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        return DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible'  => false,
            ...$overrides,
        ]);
    }

    private function makeSupportIssue(array $overrides = []): DetailedActivity
    {
        $project = Project::factory()->create();

        return $this->makeTask($project->id, ['work_type' => 'support', ...$overrides]);
    }

    private function snapshotOf(DetailedActivity $issue): string
    {
        return $issue->fresh()->updated_at->toIso8601String();
    }

    private function endpoint(DetailedActivity $issue): string
    {
        return "/api/support-ops/{$issue->id}/generation-log";
    }

    // ─── Access control ─────────────────────────────────────────────────────

    public function test_all_four_internal_roles_can_log(): void
    {
        foreach (['Admin', 'Project Manager', 'Team Member', 'Department Head'] as $role) {
            $issue = $this->makeSupportIssue(['client_name' => 'Acme Corp']);

            $res = $this->actingAs($this->createUser($role), 'sanctum')
                ->postJson($this->endpoint($issue), [
                    'artifact_type'    => 'template',
                    'template_stage'   => 'acknowledgement',
                    'issue_updated_at' => $this->snapshotOf($issue),
                ]);

            $res->assertOk()->assertJson(['logged' => true]);
            $this->assertDatabaseHas('audit_logs', [
                'action'      => 'support_issue.template_generated',
                'entity_type' => 'detailed_activity',
                'entity_id'   => $issue->id,
            ]);
        }
    }

    public function test_client_is_denied(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => 'Acme Corp']);

        $res = $this->actingAs($this->createUser('Client'), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'    => 'template',
                'template_stage'   => 'acknowledgement',
                'issue_updated_at' => $this->snapshotOf($issue),
            ]);

        $res->assertStatus(403);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_null_role_is_denied(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => 'Acme Corp']);

        $res = $this->actingAs($this->createUser(null), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'    => 'template',
                'template_stage'   => 'acknowledgement',
                'issue_updated_at' => $this->snapshotOf($issue),
            ]);

        $res->assertStatus(403);
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => 'Acme Corp']);

        $res = $this->postJson($this->endpoint($issue), [
            'artifact_type'    => 'template',
            'template_stage'   => 'acknowledgement',
            'issue_updated_at' => $this->snapshotOf($issue),
        ]);

        $res->assertStatus(401);
    }

    // ─── Scope checks (two distinct 404 paths) ──────────────────────────────

    public function test_nonexistent_issue_id_returns_404(): void
    {
        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson('/api/support-ops/999999/generation-log', [
                'artifact_type'    => 'template',
                'template_stage'   => 'acknowledgement',
                'issue_updated_at' => now()->toIso8601String(),
            ]);

        $res->assertStatus(404);
    }

    public function test_kanban_only_task_returns_404_distinct_from_nonexistent_id(): void
    {
        $project = Project::factory()->create();
        $kanbanTask = $this->makeTask($project->id, ['work_type' => 'project']);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson($this->endpoint($kanbanTask), [
                'artifact_type'    => 'template',
                'template_stage'   => 'acknowledgement',
                'issue_updated_at' => $this->snapshotOf($kanbanTask),
            ]);

        $res->assertStatus(404);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_learning_work_type_is_in_scope(): void
    {
        $issue = $this->makeSupportIssue(['work_type' => 'learning', 'client_name' => 'Acme Corp']);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'    => 'template',
                'template_stage'   => 'acknowledgement',
                'issue_updated_at' => $this->snapshotOf($issue),
            ]);

        $res->assertOk();
    }

    // ─── Validation (422) ───────────────────────────────────────────────────

    public function test_invalid_artifact_type_is_rejected(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => 'Acme Corp']);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'    => 'bogus',
                'issue_updated_at' => $this->snapshotOf($issue),
            ]);

        $res->assertStatus(422)->assertJsonValidationErrors('artifact_type');
    }

    public function test_template_stage_required_when_artifact_type_is_template(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => 'Acme Corp']);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'    => 'template',
                'issue_updated_at' => $this->snapshotOf($issue),
            ]);

        $res->assertStatus(422)->assertJsonValidationErrors('template_stage');
    }

    public function test_template_stage_prohibited_when_artifact_type_is_draft_or_packet(): void
    {
        foreach (['draft', 'packet'] as $artifactType) {
            $issue = $this->makeSupportIssue(['client_name' => 'Acme Corp']);

            $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
                ->postJson($this->endpoint($issue), [
                    'artifact_type'    => $artifactType,
                    'template_stage'   => 'acknowledgement',
                    'issue_updated_at' => $this->snapshotOf($issue),
                ]);

            $res->assertStatus(422)->assertJsonValidationErrors('template_stage');
        }
    }

    public function test_missing_issue_updated_at_is_rejected(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => 'Acme Corp']);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'  => 'template',
                'template_stage' => 'acknowledgement',
            ]);

        $res->assertStatus(422)->assertJsonValidationErrors('issue_updated_at');
    }

    public function test_non_string_issue_updated_at_is_rejected(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => 'Acme Corp']);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'    => 'template',
                'template_stage'   => 'acknowledgement',
                'issue_updated_at' => 1753231846,
            ]);

        $res->assertStatus(422)->assertJsonValidationErrors('issue_updated_at');
    }

    public function test_malformed_issue_updated_at_format_is_rejected(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => 'Acme Corp']);

        foreach ([
            '2026-07-23',                      // Y-m-d only, missing time
            '2026-07-23 09:15:00',              // space instead of T, no offset
            '2026-07-23T09:15:00Z',             // Z instead of numeric offset
        ] as $malformed) {
            $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
                ->postJson($this->endpoint($issue), [
                    'artifact_type'    => 'template',
                    'template_stage'   => 'acknowledgement',
                    'issue_updated_at' => $malformed,
                ]);

            $res->assertStatus(422)->assertJsonValidationErrors('issue_updated_at');
        }
    }

    // ─── Privacy gate: both blank skips the write ───────────────────────────

    public function test_both_client_and_tenant_blank_returns_200_but_writes_no_row(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => null, 'tenant_name' => null]);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'    => 'packet',
                'issue_updated_at' => $this->snapshotOf($issue),
            ]);

        $res->assertOk()->assertJson(['logged' => true]);
        $this->assertDatabaseCount('audit_logs', 0);
    }

    // ─── Artifact-type-specific inclusion (the core correctness property) ──

    public function test_tenant_only_issue_does_not_log_for_template_or_draft(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => null, 'tenant_name' => 'Branch 7']);

        foreach (['template', 'draft'] as $artifactType) {
            $payload = [
                'artifact_type'    => $artifactType,
                'issue_updated_at' => $this->snapshotOf($issue),
            ];
            if ($artifactType === 'template') {
                $payload['template_stage'] = 'acknowledgement';
            }

            $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
                ->postJson($this->endpoint($issue), $payload);

            $res->assertOk();
        }

        // tenant_name alone must never trigger logging for template/draft — they never disclose it.
        $this->assertDatabaseCount('audit_logs', 0);
    }

    public function test_tenant_only_issue_does_log_for_packet_with_correct_flags(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => null, 'tenant_name' => 'Branch 7']);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'    => 'packet',
                'issue_updated_at' => $this->snapshotOf($issue),
            ]);

        $res->assertOk();
        $this->assertDatabaseCount('audit_logs', 1);

        $log = \App\Models\AuditLog::first();
        $this->assertEquals('support_issue.packet_generated', $log->action);
        $this->assertFalse($log->metadata['included_client_name']);
        $this->assertTrue($log->metadata['included_tenant_name']);
    }

    // ─── Snapshot-consistency check ─────────────────────────────────────────

    public function test_stale_snapshot_forces_logging_even_when_both_blank(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => null, 'tenant_name' => null]);
        $staleTimestamp = $issue->fresh()->updated_at->subHour()->toIso8601String();

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'    => 'packet',
                'issue_updated_at' => $staleTimestamp,
            ]);

        $res->assertOk();
        $this->assertDatabaseCount('audit_logs', 1);

        $log = \App\Models\AuditLog::first();
        $this->assertTrue($log->metadata['snapshot_stale']);
    }

    public function test_fresh_matching_snapshot_on_both_blank_issue_does_not_log(): void
    {
        $issue = $this->makeSupportIssue(['client_name' => null, 'tenant_name' => null]);

        $res = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'    => 'packet',
                'issue_updated_at' => $this->snapshotOf($issue),
            ]);

        $res->assertOk();
        $this->assertDatabaseCount('audit_logs', 0);
    }

    // ─── Metadata never contains actual field values ────────────────────────

    public function test_metadata_never_contains_generated_text_or_actual_field_values(): void
    {
        $issue = $this->makeSupportIssue([
            'client_name' => 'Acme Corp',
            'tenant_name' => 'Branch 7',
        ]);

        $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson($this->endpoint($issue), [
                'artifact_type'    => 'packet',
                'issue_updated_at' => $this->snapshotOf($issue),
            ]);

        $log = \App\Models\AuditLog::first();
        $this->assertEqualsCanonicalizing(
            ['artifact_type', 'template_stage', 'included_client_name', 'included_tenant_name', 'snapshot_stale'],
            array_keys($log->metadata)
        );
        $this->assertStringNotContainsString('Acme Corp', json_encode($log->metadata));
        $this->assertStringNotContainsString('Branch 7', json_encode($log->metadata));
    }
}
