<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\AuditLog;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\PreviewSession;
use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\ProjectOwnership;
use App\Models\SubActivity;
use App\Models\User;
use Carbon\Carbon;
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

    /** 008-project-ownership: makes $pm an owner of $project. */
    private function own(User $pm, Project $project): ProjectOwnership
    {
        return ProjectOwnership::create([
            'user_id'             => $pm->id,
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

    /**
     * US2: same as callJson, but with an X-Preview-Session header attached
     * to this request only — passed as json()'s own $headers argument
     * rather than via withHeaders(), which mutates TestCase::$defaultHeaders
     * and would otherwise leak the preview header into every later request
     * in the same test method.
     */
    private function callJsonPreviewing($actor, string $token, string $method, string $url, array $payload = [])
    {
        return $this->actingAs($actor, 'sanctum')
            ->json($method, $url, $payload, ['X-Preview-Session' => $token]);
    }

    /** US2: starts a preview session as $admin targeting $target, returns the raw token. */
    private function startPreview(User $admin, User $target)
    {
        $res = $this->callJson($admin, 'POST', '/api/preview-sessions', ['target_user_id' => $target->id]);
        $res->assertStatus(201);
        return $res->json('data.token') ?? $res->json('token');
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

    // ═══════════════════════════════════════════════════════════════════════
    // 008-project-ownership, User Story 2: PM-scoped administration
    // ═══════════════════════════════════════════════════════════════════════

    // ─── T019: the full enforcement matrix (data-model.md), one row per case ──

    public function test_enforcement_matrix_admin_always_allowed(): void
    {
        $admin = $this->createUser('Admin');
        $tm = $this->createUser('Team Member', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);
        // Project has a different owner entirely — irrelevant to Admin.
        $this->own($this->createUser('Project Manager'), $project);

        $this->callJson($admin, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(201);
    }

    public function test_enforcement_matrix_pm_on_ownerless_project_allowed(): void
    {
        $pm = $this->createUser('Project Manager');
        $tm = $this->createUser('Team Member', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);
        // No ownership row created at all — FR-018 rollout safety net.

        $this->callJson($pm, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(201);
    }

    public function test_enforcement_matrix_pm_sole_owner_allowed(): void
    {
        $pm = $this->createUser('Project Manager');
        $tm = $this->createUser('Team Member', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);
        $this->own($pm, $project);

        $this->callJson($pm, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(201);
    }

    public function test_enforcement_matrix_pm_not_owner_of_solely_other_owned_project_denied(): void
    {
        $pmA = $this->createUser('Project Manager');
        $pmC = $this->createUser('Project Manager');
        $tm = $this->createUser('Team Member', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);
        $this->own($pmC, $project);

        $this->callJson($pmA, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(403)
            ->assertJson(['message' => 'You do not own this project.']);
    }

    public function test_enforcement_matrix_pm_one_of_several_owners_allowed(): void
    {
        $pmA = $this->createUser('Project Manager');
        $pmD = $this->createUser('Project Manager');
        $tm = $this->createUser('Team Member', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);
        $this->own($pmA, $project);
        $this->own($pmD, $project);

        $this->callJson($pmA, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(201);
    }

    public function test_enforcement_matrix_pm_excluded_from_multi_owner_project_denied(): void
    {
        $pmA = $this->createUser('Project Manager');
        $pmD = $this->createUser('Project Manager');
        $pmC = $this->createUser('Project Manager'); // not an owner
        $tm = $this->createUser('Team Member', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);
        $this->own($pmA, $project);
        $this->own($pmD, $project);

        $this->callJson($pmC, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(403)
            ->assertJson(['message' => 'You do not own this project.']);
    }

    public function test_enforcement_matrix_other_role_denied(): void
    {
        $client = $this->createUser('Client', 'IT');
        $tm = $this->createUser('Team Member', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);

        $this->callJson($client, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(403)
            ->assertJson(['message' => 'Unauthorized: Only Admins and Project Managers can manage project assignments.']);
    }

    // ─── T020: a PM who owns zero projects — ownerless vs. other-owned ────────

    public function test_pm_owning_zero_projects_denied_on_owned_project_but_allowed_on_ownerless(): void
    {
        $pmA = $this->createUser('Project Manager'); // owns nothing
        $pmC = $this->createUser('Project Manager');
        $tm = $this->createUser('Team Member', 'IT');

        $ownedProject = Project::factory()->create(['department' => 'IT']);
        $this->own($pmC, $ownedProject);
        $ownerlessProject = Project::factory()->create(['department' => 'IT']);

        $this->callJson($pmA, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $ownedProject->id])
            ->assertStatus(403);

        $this->callJson($pmA, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $ownerlessProject->id])
            ->assertStatus(201);
    }

    // ─── T021: Admin's store()/destroy() behavior is provably unaffected ──────

    public function test_admin_assignment_behavior_unaffected_by_ownership_presence(): void
    {
        $admin = $this->createUser('Admin');
        $tm = $this->createUser('Team Member', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);

        // With zero owners.
        $created = $this->callJson($admin, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id]);
        $created->assertStatus(201);
        $this->callJson($admin, 'DELETE', '/api/project-assignments/' . $created->json('data.id'))->assertStatus(204);

        // With an owner (a different PM entirely) present.
        $this->own($this->createUser('Project Manager'), $project);
        $this->callJson($admin, 'POST', '/api/project-assignments', ['user_id' => $tm->id, 'project_id' => $project->id])
            ->assertStatus(201);
    }

    // ─── T022: GET /api/project-assignments unaffected by ownership for PM ────

    public function test_pm_read_of_project_assignments_unaffected_by_ownership(): void
    {
        $pm = $this->createUser('Project Manager'); // owns zero projects
        $tm = $this->createUser('Team Member', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);
        $this->own($this->createUser('Project Manager'), $project); // owned by someone else
        $assignment = $this->assign($tm, $project);

        $response = $this->callJson($pm, 'GET', '/api/project-assignments?project_id=' . $project->id);
        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals($assignment->id, $response->json('data.0.id'));
    }

    // ─── T023: PM read-visibility across surfaces is unaffected by ownership ──

    public function test_pm_read_visibility_unaffected_by_ownership(): void
    {
        $owningPm = $this->createUser('Project Manager');
        $nonOwningPm = $this->createUser('Project Manager');
        $project = Project::factory()->create(['department' => 'IT']);
        $this->own($owningPm, $project);
        // nonOwningPm owns nothing at all.

        foreach ([$owningPm, $nonOwningPm] as $pm) {
            $this->callJson($pm, 'GET', "/api/projects/{$project->id}")->assertStatus(200);
            $this->callJson($pm, 'GET', "/api/projects/{$project->id}/modules")->assertStatus(200);
            $this->callJson($pm, 'GET', '/api/dashboard')->assertStatus(200);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // User Story 2: Admin can preview the app as a specific user
    // ═══════════════════════════════════════════════════════════════════════

    // ─── T029/T030: preview reflects the target's complete access ───────────

    public function test_preview_as_team_member_shows_only_their_assignment_not_admins_full_access(): void
    {
        $admin = $this->createUser('Admin');
        $projectA = Project::factory()->create(['department' => 'IT']);
        $projectB = Project::factory()->create(['department' => 'Finance']);
        $tm = $this->createUser('Team Member', 'IT');
        $this->assign($tm, $projectA);

        // Sanity: the Admin's own view sees both projects.
        $adminIds = collect($this->callJson($admin, 'GET', '/api/projects')->json())->pluck('id')->all();
        $this->assertContains($projectA->id, $adminIds);
        $this->assertContains($projectB->id, $adminIds);

        $token = $this->startPreview($admin, $tm);

        $previewIds = collect($this->callJsonPreviewing($admin, $token, 'GET', '/api/projects')->json())->pluck('id')->all();
        $this->assertEquals([$projectA->id], $previewIds);

        $dashboard = $this->callJsonPreviewing($admin, $token, 'GET', '/api/dashboard');
        $dashboard->assertStatus(200)->assertJsonPath('stats.projects', 1);
    }

    public function test_preview_as_client_hits_the_pre_existing_export_denial(): void
    {
        $admin = $this->createUser('Admin');
        $client = $this->createUser('Client', 'IT');

        // Sanity: the Admin's own export access works.
        $this->callJson($admin, 'GET', '/api/reports/export-csv')->assertStatus(200);

        $token = $this->startPreview($admin, $client);

        $this->callJsonPreviewing($admin, $token, 'GET', '/api/reports/export-csv')->assertStatus(403);
    }

    // ─── T031/T032: writes are blocked while previewing, and audited ─────────

    public function test_writes_are_blocked_while_previewing_and_never_apply(): void
    {
        $admin = $this->createUser('Admin');
        $chain = $this->makeChain();
        $target = $this->createUser('Team Member', 'IT');
        $this->assign($target, $chain['project']);

        $token = $this->startPreview($admin, $target);

        foreach ($this->nestedSurfaces($chain) as $label => [$method, $url, $payload]) {
            if ($method === 'GET') {
                continue;
            }
            $res = $this->callJsonPreviewing($admin, $token, $method, $url, $payload ?? []);
            $res->assertStatus(403, "Expected write {$label} to be blocked while previewing");
        }

        // Confirm nothing actually changed — the module's name is untouched.
        $this->assertDatabaseHas('modules', ['id' => $chain['module']->id, 'name' => $chain['module']->name]);
    }

    public function test_blocked_write_is_audited(): void
    {
        $admin = $this->createUser('Admin');
        $chain = $this->makeChain();
        $target = $this->createUser('Team Member', 'IT');
        $this->assign($target, $chain['project']);

        $token = $this->startPreview($admin, $target);
        $this->callJsonPreviewing($admin, $token, 'PATCH', "/api/modules/{$chain['module']->id}", ['name' => 'Blocked']);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'preview.write_blocked',
            'actor_user_id' => $admin->id,
        ]);
        $entry = AuditLog::where('action', 'preview.write_blocked')->first();
        $this->assertEquals($target->id, $entry->metadata['target_user_id']);
        $this->assertEquals('PATCH', $entry->metadata['attempted_method']);
        $this->assertStringContainsString("modules/{$chain['module']->id}", $entry->metadata['attempted_path']);
    }

    // ─── T033-T036: starting a preview session ───────────────────────────────

    public function test_non_admin_cannot_start_preview(): void
    {
        $target = $this->createUser('Team Member');
        foreach (['Project Manager', 'Department Head', 'Team Member', 'Client'] as $role) {
            $actor = $this->createUser($role);
            $this->callJson($actor, 'POST', '/api/preview-sessions', ['target_user_id' => $target->id])
                ->assertStatus(403);
        }
    }

    public function test_cannot_preview_as_another_admin(): void
    {
        $admin = $this->createUser('Admin');
        $otherAdmin = $this->createUser('Admin');

        $this->callJson($admin, 'POST', '/api/preview-sessions', ['target_user_id' => $otherAdmin->id])
            ->assertStatus(422);
    }

    public function test_cannot_preview_as_disabled_account(): void
    {
        $admin = $this->createUser('Admin');
        $disabled = $this->createUser('Team Member', 'IT', active: false);

        $this->callJson($admin, 'POST', '/api/preview-sessions', ['target_user_id' => $disabled->id])
            ->assertStatus(422);
    }

    public function test_starting_a_new_preview_replaces_the_active_one(): void
    {
        $admin = $this->createUser('Admin');
        $firstTarget = $this->createUser('Team Member');
        $secondTarget = $this->createUser('Client');

        $firstToken = $this->startPreview($admin, $firstTarget);

        // Presenting the still-active first token while starting a second preview
        // must succeed, not be blocked by BlockWritesDuringPreview.
        $res = $this->callJsonPreviewing($admin, $firstToken, 'POST', '/api/preview-sessions', [
            'target_user_id' => $secondTarget->id,
        ]);
        $res->assertStatus(201);

        $this->assertNotNull(PreviewSession::where('token', $firstToken)->first()->ended_at);
    }

    // ─── T037: invalid preview tokens short-circuit with 409, no domain data ─

    public function test_expired_preview_token_returns_409_with_no_domain_data(): void
    {
        Carbon::setTestNow(Carbon::now());
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member');
        $token = $this->startPreview($admin, $target);

        Carbon::setTestNow(Carbon::now()->addHours(3));

        $res = $this->callJsonPreviewing($admin, $token, 'GET', '/api/projects');
        $res->assertStatus(409);
        $res->assertHeader('X-Preview-Ended', '1');
        $this->assertEquals(['message' => 'Preview session ended.', 'reason' => 'expired'], $res->json());

        Carbon::setTestNow();
    }

    public function test_disabled_target_preview_token_returns_409_with_no_domain_data(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member');
        $token = $this->startPreview($admin, $target);

        $target->update(['is_active' => false]);

        $res = $this->callJsonPreviewing($admin, $token, 'GET', '/api/projects');
        $res->assertStatus(409);
        $res->assertHeader('X-Preview-Ended', '1');
        $this->assertEquals(['message' => 'Preview session ended.', 'reason' => 'target_disabled'], $res->json());
    }

    public function test_target_role_changed_preview_token_returns_409_with_no_domain_data(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member');
        $token = $this->startPreview($admin, $target);

        $target->update(['role' => 'Project Manager']);

        $res = $this->callJsonPreviewing($admin, $token, 'GET', '/api/projects');
        $res->assertStatus(409);
        $res->assertHeader('X-Preview-Ended', '1');
        $this->assertEquals(['message' => 'Preview session ended.', 'reason' => 'target_role_changed'], $res->json());
    }

    public function test_unresolvable_preview_token_returns_409_with_no_domain_data(): void
    {
        $admin = $this->createUser('Admin');

        $res = $this->callJsonPreviewing($admin, 'not-a-real-token', 'GET', '/api/projects');
        $res->assertStatus(409);
        $res->assertHeader('X-Preview-Ended', '1');
        $this->assertEquals(['message' => 'Preview session ended.', 'reason' => 'not_found'], $res->json());
    }

    // ─── T038: preview.started / preview.ended audit trail ───────────────────

    public function test_preview_started_and_manually_ended_are_audited(): void
    {
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member');
        $token = $this->startPreview($admin, $target);

        $this->assertDatabaseHas('audit_logs', ['action' => 'preview.started', 'actor_user_id' => $admin->id]);

        $this->callJsonPreviewing($admin, $token, 'DELETE', '/api/preview-sessions/current')
            ->assertStatus(204);

        $this->assertDatabaseHas('audit_logs', ['action' => 'preview.ended', 'actor_user_id' => $admin->id]);
        $entry = AuditLog::where('action', 'preview.ended')->first();
        $this->assertEquals('manual', $entry->metadata['reason']);
    }

    public function test_preview_ended_reasons_are_audited_for_each_invalidation_path(): void
    {
        // Expired
        Carbon::setTestNow(Carbon::now());
        $admin = $this->createUser('Admin');
        $expiredTarget = $this->createUser('Team Member');
        $expiredToken = $this->startPreview($admin, $expiredTarget);
        Carbon::setTestNow(Carbon::now()->addHours(3));
        $this->callJsonPreviewing($admin, $expiredToken, 'GET', '/api/projects');
        Carbon::setTestNow();
        $this->assertDatabaseHas('audit_logs', ['action' => 'preview.ended', 'entity_id' => PreviewSession::where('token', $expiredToken)->first()->id]);
        $this->assertEquals('expired', AuditLog::where('action', 'preview.ended')->where('entity_id', PreviewSession::where('token', $expiredToken)->first()->id)->first()->metadata['reason']);

        // Target disabled
        $disabledTarget = $this->createUser('Team Member');
        $disabledToken = $this->startPreview($admin, $disabledTarget);
        $disabledTarget->update(['is_active' => false]);
        $this->callJsonPreviewing($admin, $disabledToken, 'GET', '/api/projects');
        $disabledSessionId = PreviewSession::where('token', $disabledToken)->first()->id;
        $this->assertEquals('target_disabled', AuditLog::where('action', 'preview.ended')->where('entity_id', $disabledSessionId)->first()->metadata['reason']);

        // Target role changed
        $roleChangedTarget = $this->createUser('Team Member');
        $roleChangedToken = $this->startPreview($admin, $roleChangedTarget);
        $roleChangedTarget->update(['role' => 'Client']);
        $this->callJsonPreviewing($admin, $roleChangedToken, 'GET', '/api/projects');
        $roleChangedSessionId = PreviewSession::where('token', $roleChangedToken)->first()->id;
        $this->assertEquals('target_role_changed', AuditLog::where('action', 'preview.ended')->where('entity_id', $roleChangedSessionId)->first()->metadata['reason']);
    }

    // ─── T039: bounded 2-hour preview lifetime ───────────────────────────────

    public function test_preview_session_expires_at_is_exactly_two_hours_after_start(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 7, 25, 10, 0, 0));
        $admin = $this->createUser('Admin');
        $target = $this->createUser('Team Member');
        $this->startPreview($admin, $target);

        $session = PreviewSession::first();
        $this->assertTrue($session->started_at->copy()->addHours(2)->equalTo($session->expires_at));

        Carbon::setTestNow();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // User Story 3: consistent access-denied experience and audit trail
    // ═══════════════════════════════════════════════════════════════════════

    // ─── T050: the audit trail from US1/US2 is visible end-to-end through
    // the same Admin Audit Logs viewer already in use — not new audit-
    // writing code, just verifying the already-built mechanism (see this
    // file's class docblock and tasks.md's note on audit tasks).

    public function test_assignment_and_preview_audit_entries_are_visible_via_audit_logs_endpoint(): void
    {
        $admin = $this->createUser('Admin');
        $project = Project::factory()->create(['department' => 'IT']);
        $tm = $this->createUser('Team Member', 'IT');

        $created = $this->callJson($admin, 'POST', '/api/project-assignments', [
            'user_id' => $tm->id, 'project_id' => $project->id,
        ])->assertStatus(201);
        $assignmentId = $created->json('data.id');
        $this->callJson($admin, 'DELETE', "/api/project-assignments/{$assignmentId}")->assertStatus(204);

        $token = $this->startPreview($admin, $tm);
        $this->callJsonPreviewing($admin, $token, 'DELETE', '/api/preview-sessions/current')
            ->assertStatus(204);

        $res = $this->callJson($admin, 'GET', '/api/audit-logs');
        $res->assertStatus(200);

        $actions = collect($res->json('data') ?? $res->json())->pluck('action')->all();
        $this->assertContains('project_assignment.created', $actions);
        $this->assertContains('project_assignment.deleted', $actions);
        $this->assertContains('preview.started', $actions);
        $this->assertContains('preview.ended', $actions);
    }
}
