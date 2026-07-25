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
 * 007-permission-hardening, User Story 1: Team Member/Client project
 * visibility is scoped to explicit project_assignments rows, not their
 * whole department — and, per research.md's Finding, this is the first
 * time Module/Activity/SubActivity/DetailedActivity/Comment/Attachment
 * ever get a project-level authorization check at all.
 */
class ProjectScopingTest extends TestCase
{
    use RefreshDatabase;

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function createUser(string $role = 'Team Member', string $dept = 'IT', bool $active = true): User
    {
        return User::factory()->create([
            'role'       => $role,
            'department' => $dept,
            'is_active'  => $active,
        ]);
    }

    /** Builds a full Project → Module → Activity → SubActivity → DetailedActivity (+comment, +attachment) chain. */
    private function makeChain(array $projectOverrides = []): array
    {
        $project = Project::factory()->create(['department' => 'IT', ...$projectOverrides]);
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);
        $detailedActivity = DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible'  => false,
        ]);
        $comment = $detailedActivity->comments()->create([
            'author'      => 'Seed Author',
            'author_role' => 'Team Member',
            'body'        => 'Seed comment.',
            'visibility'  => 'internal',
        ]);
        $attachment = $detailedActivity->attachments()->create([
            'uploader'            => 'Seed Uploader',
            'uploader_role'       => 'Team Member',
            'uploaded_by_user_id' => null,
            'original_name'       => 'seed.pdf',
            'stored_name'         => 'seed-stored.pdf',
            'disk'                => 'local',
            'path'                => 'attachments/seed/seed-stored.pdf',
            'mime_type'           => 'application/pdf',
            'size_bytes'          => 10,
            'visibility'          => 'internal',
        ]);

        return compact('project', 'module', 'activity', 'subActivity', 'detailedActivity', 'comment', 'attachment');
    }

    private function assign(User $user, Project $project): ProjectAssignment
    {
        return ProjectAssignment::create([
            'user_id'             => $user->id,
            'project_id'          => $project->id,
            'assigned_by_user_id' => $this->createUser('Admin')->id,
        ]);
    }

    /** Every (method, url) pair across the six previously-ungated controllers, for a given chain. */
    private function nestedSurfaces(array $chain): array
    {
        return [
            'project.show'       => ['GET', "/api/projects/{$chain['project']->id}", []],
            'module.index'       => ['GET', "/api/projects/{$chain['project']->id}/modules", []],
            'module.show'        => ['GET', "/api/modules/{$chain['module']->id}", []],
            'module.store'       => ['POST', "/api/projects/{$chain['project']->id}/modules", ['name' => 'New Module']],
            'module.update'      => ['PATCH', "/api/modules/{$chain['module']->id}", ['name' => 'Renamed']],
            'module.destroy'     => ['DELETE', "/api/modules/{$chain['module']->id}", []],
            'activity.index'     => ['GET', "/api/modules/{$chain['module']->id}/activities", []],
            'activity.show'      => ['GET', "/api/activities/{$chain['activity']->id}", []],
            'activity.store'     => ['POST', "/api/modules/{$chain['module']->id}/activities", ['name' => 'New Activity']],
            'activity.update'    => ['PATCH', "/api/activities/{$chain['activity']->id}", ['name' => 'Renamed']],
            'activity.destroy'   => ['DELETE', "/api/activities/{$chain['activity']->id}", []],
            'subactivity.index'  => ['GET', "/api/activities/{$chain['activity']->id}/sub-activities", []],
            'subactivity.show'   => ['GET', "/api/sub-activities/{$chain['subActivity']->id}", []],
            'subactivity.store'  => ['POST', "/api/activities/{$chain['activity']->id}/sub-activities", ['name' => 'New Sub']],
            'subactivity.update' => ['PATCH', "/api/sub-activities/{$chain['subActivity']->id}", ['name' => 'Renamed']],
            'subactivity.destroy'=> ['DELETE', "/api/sub-activities/{$chain['subActivity']->id}", []],
            'task.index'         => ['GET', "/api/sub-activities/{$chain['subActivity']->id}/detailed-activities", []],
            'task.show'          => ['GET', "/api/detailed-activities/{$chain['detailedActivity']->id}", []],
            'task.store'         => ['POST', "/api/sub-activities/{$chain['subActivity']->id}/detailed-activities", ['name' => 'New Task']],
            'task.update'        => ['PUT', "/api/detailed-activities/{$chain['detailedActivity']->id}", ['status' => 'in_progress']],
            'task.destroy'       => ['DELETE', "/api/detailed-activities/{$chain['detailedActivity']->id}", []],
            'comment.index'      => ['GET', "/api/detailed-activities/{$chain['detailedActivity']->id}/comments", []],
            'comment.store'      => ['POST', "/api/detailed-activities/{$chain['detailedActivity']->id}/comments", ['body' => 'Hi', 'visibility' => 'internal']],
            'comment.destroy'    => ['DELETE', "/api/comments/{$chain['comment']->id}", []],
            'attachment.index'   => ['GET', "/api/detailed-activities/{$chain['detailedActivity']->id}/attachments", []],
            'attachment.destroy' => ['DELETE', "/api/attachments/{$chain['attachment']->id}", []],
            'attachment.download'=> ['GET', "/api/attachments/{$chain['attachment']->id}/download", []],
        ];
    }

    private function callJson($actor, string $method, string $url, array $payload = [])
    {
        return $this->actingAs($actor, 'sanctum')->json($method, $url, $payload);
    }

    // ─── T006/T007: assignment scoping replaces whole-department visibility ──

    public function test_team_member_sees_only_assigned_project_not_whole_department(): void
    {
        $projectA = Project::factory()->create(['department' => 'IT', 'name' => 'Project A']);
        $projectB = Project::factory()->create(['department' => 'IT', 'name' => 'Project B']);
        $tm = $this->createUser('Team Member', 'IT');
        $this->assign($tm, $projectA);

        $list = $this->callJson($tm, 'GET', '/api/projects');
        $list->assertStatus(200);
        $ids = collect($list->json())->pluck('id')->all();
        $this->assertContains($projectA->id, $ids);
        $this->assertNotContains($projectB->id, $ids);

        $this->callJson($tm, 'GET', "/api/projects/{$projectA->id}/modules")->assertStatus(200);

        $dashboard = $this->callJson($tm, 'GET', '/api/dashboard');
        $dashboard->assertStatus(200)->assertJsonPath('stats.projects', 1);

        $reports = $this->callJson($tm, 'GET', '/api/reports');
        $reports->assertStatus(200);
        $reportProjectIds = collect($reports->json('projects'))->pluck('id')->all();
        $this->assertEquals([$projectA->id], $reportProjectIds);
    }

    public function test_second_team_member_same_department_different_assignment_has_no_cross_visibility(): void
    {
        $projectA = Project::factory()->create(['department' => 'IT']);
        $projectB = Project::factory()->create(['department' => 'IT']);
        $tm1 = $this->createUser('Team Member', 'IT');
        $tm2 = $this->createUser('Team Member', 'IT');
        $this->assign($tm1, $projectA);
        $this->assign($tm2, $projectB);

        $tm1Ids = collect($this->callJson($tm1, 'GET', '/api/projects')->json())->pluck('id')->all();
        $tm2Ids = collect($this->callJson($tm2, 'GET', '/api/projects')->json())->pluck('id')->all();

        $this->assertEquals([$projectA->id], $tm1Ids);
        $this->assertEquals([$projectB->id], $tm2Ids);
    }

    // ─── T008: every nested surface denies an unassigned-but-existing project ─

    public function test_all_nested_surfaces_deny_unassigned_team_member_and_client(): void
    {
        foreach (['Team Member', 'Client'] as $role) {
            $chain = $this->makeChain();
            $user = $this->createUser($role, 'IT');
            // Deliberately NOT assigned to $chain['project'].

            foreach ($this->nestedSurfaces($chain) as $label => [$method, $url, $payload]) {
                $res = $this->callJson($user, $method, $url, $payload ?? []);
                $res->assertStatus(403, "Expected 403 for {$role} on {$label} ({$method} {$url}), got {$res->getStatusCode()}");
            }
        }
    }

    // ─── T009: nonexistent project produces the identical response to T008 ───

    public function test_nonexistent_project_produces_identical_403_to_unassigned_existing_project(): void
    {
        foreach (['Team Member', 'Client'] as $role) {
            $existingChain = $this->makeChain();
            $user = $this->createUser($role, 'IT');

            $existingResponses = [];
            foreach ($this->nestedSurfaces($existingChain) as $label => [$method, $url, $payload]) {
                $existingResponses[$label] = $this->callJson($user, $method, $url, $payload ?? []);
            }

            // A chain built then immediately deleted (cascades away) — every ID below is genuinely nonexistent.
            $ghostChain = $this->makeChain();
            $ghostProjectId = $ghostChain['project']->id;
            $ghostChain['project']->delete();

            $ghostSurfaces = [
                'project.show'   => ['GET', "/api/projects/{$ghostProjectId}"],
                'module.show'    => ['GET', "/api/modules/{$ghostChain['module']->id}"],
                'activity.show'  => ['GET', "/api/activities/{$ghostChain['activity']->id}"],
                'subactivity.show' => ['GET', "/api/sub-activities/{$ghostChain['subActivity']->id}"],
                'task.show'      => ['GET', "/api/detailed-activities/{$ghostChain['detailedActivity']->id}"],
                'module.index'   => ['GET', "/api/projects/{$ghostProjectId}/modules"],
            ];

            foreach ($ghostSurfaces as $label => [$method, $url]) {
                $ghostRes = $this->callJson($user, $method, $url);
                $ghostRes->assertStatus(403, "Expected 403 (not 404) for {$role} on nonexistent {$label}");
                $this->assertSame(
                    $existingResponses[$label]->getContent(),
                    $ghostRes->getContent(),
                    "Response body for nonexistent {$label} must be byte-identical to the unassigned-existing case ({$role})"
                );
            }
        }
    }

    // ─── T010: Admin/PM/Department Head are provably unaffected ──────────────

    public function test_admin_pm_department_head_unaffected_and_get_404_for_nonexistent_project(): void
    {
        foreach (['Admin', 'Project Manager', 'Department Head'] as $role) {
            $chain = $this->makeChain();
            $user = $this->createUser($role, 'IT');
            // No assignment created — these roles never needed one.

            $this->callJson($user, 'GET', "/api/projects/{$chain['project']->id}/modules")->assertStatus(200);
            $this->callJson($user, 'GET', "/api/modules/{$chain['module']->id}")->assertStatus(200);

            $ghostModuleId = $chain['module']->id;
            $chain['project']->delete();

            $this->callJson($user, 'GET', "/api/modules/{$ghostModuleId}")->assertStatus(404);
        }
    }

    // ─── T011: removing an assignment takes effect on the very next request ──

    public function test_removing_assignment_denies_very_next_request_no_relogin(): void
    {
        $project = Project::factory()->create(['department' => 'IT']);
        $tm = $this->createUser('Team Member', 'IT');
        $assignment = $this->assign($tm, $project);

        $this->callJson($tm, 'GET', "/api/projects/{$project->id}/modules")->assertStatus(200);

        $assignment->delete();

        $this->callJson($tm, 'GET', "/api/projects/{$project->id}/modules")->assertStatus(403);
    }

    // ─── T012: assignment idempotency ─────────────────────────────────────────

    public function test_duplicate_assignment_is_idempotent_no_duplicate_row_or_audit(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);
        $tm = $this->createUser('Team Member', 'IT');

        $first = $this->callJson($admin, 'POST', '/api/project-assignments', [
            'user_id' => $tm->id, 'project_id' => $project->id,
        ]);
        $first->assertStatus(201);

        $second = $this->callJson($admin, 'POST', '/api/project-assignments', [
            'user_id' => $tm->id, 'project_id' => $project->id,
        ]);
        $second->assertStatus(200);

        $this->assertEquals(1, ProjectAssignment::where('user_id', $tm->id)->where('project_id', $project->id)->count());
        $this->assertEquals(1, \App\Models\AuditLog::where('action', 'project_assignment.created')->count());
    }

    // ─── T013: invalid assignment targets are rejected ────────────────────────

    public function test_assigning_invalid_targets_is_rejected(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);

        foreach (['Department Head', 'Project Manager', 'Admin'] as $role) {
            $target = $this->createUser($role, 'IT');
            $this->callJson($admin, 'POST', '/api/project-assignments', [
                'user_id' => $target->id, 'project_id' => $project->id,
            ])->assertStatus(422);
        }

        $disabled = $this->createUser('Team Member', 'IT', active: false);
        $this->callJson($admin, 'POST', '/api/project-assignments', [
            'user_id' => $disabled->id, 'project_id' => $project->id,
        ])->assertStatus(422);
    }

    // ─── T014: grant/revoke audit trail ────────────────────────────────────────

    public function test_grant_and_revoke_produce_audit_entries(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);
        $tm = $this->createUser('Team Member', 'IT');

        $created = $this->callJson($admin, 'POST', '/api/project-assignments', [
            'user_id' => $tm->id, 'project_id' => $project->id,
        ])->assertStatus(201);

        $this->assertDatabaseHas('audit_logs', [
            'action'        => 'project_assignment.created',
            'actor_user_id' => $admin->id,
        ]);

        $assignmentId = $created->json('data.id');
        $this->callJson($admin, 'DELETE', "/api/project-assignments/{$assignmentId}")->assertStatus(204);

        $this->assertDatabaseHas('audit_logs', [
            'action'        => 'project_assignment.deleted',
            'actor_user_id' => $admin->id,
        ]);
    }

    // ─── T015: deleting a project cascades to remove its assignments ─────────

    public function test_deleting_project_cascades_assignment_deletion(): void
    {
        $project = Project::factory()->create(['department' => 'IT']);
        $tm = $this->createUser('Team Member', 'IT');
        $assignment = $this->assign($tm, $project);

        $project->delete();

        $this->assertDatabaseMissing('project_assignments', ['id' => $assignment->id]);
    }

    // ─── T016: assignments persist-but-dormant across a role change ──────────

    public function test_assignments_persist_dormant_across_role_change(): void
    {
        $project = Project::factory()->create(['department' => 'IT']);
        $tm = $this->createUser('Team Member', 'IT');
        $assignment = $this->assign($tm, $project);

        $tm->update(['role' => 'Project Manager']);
        $this->assertDatabaseHas('project_assignments', ['id' => $assignment->id]);

        // PM sees everything regardless of the (now-irrelevant) assignment.
        $this->callJson($tm->fresh(), 'GET', "/api/projects/{$project->id}/modules")->assertStatus(200);

        $tm->update(['role' => 'Team Member']);
        // Demoted back down — original narrower access is restored automatically, no re-entry needed.
        $this->callJson($tm->fresh(), 'GET', "/api/projects/{$project->id}/modules")->assertStatus(200);
    }
}
