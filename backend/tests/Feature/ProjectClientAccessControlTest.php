<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\Attachment;
use App\Models\ClientOrganization;
use App\Models\ClientDomain;
use App\Models\Comment;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Notification;
use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\ProjectInvitation;
use App\Models\ProjectMembership;
use App\Models\ProjectOwnership;
use App\Models\SubActivity;
use App\Models\User;
use App\Services\ProjectInvitationTokenService;
use App\Services\ClientDomainPolicy;
use App\Support\ProjectClientAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProjectClientAccessControlTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::factory()->create([
            'role' => $role,
            'department' => 'IT',
            'is_active' => true,
        ]);
    }

    private function organization(string $slug = 'clientco'): ClientOrganization
    {
        return ClientOrganization::create([
            'name' => ucfirst($slug),
            'slug' => $slug,
            'trusted_domain_policy' => ClientOrganization::POLICY_MANUAL_APPROVAL,
            'status' => ClientOrganization::STATUS_ACTIVE,
            'created_by_user_id' => $this->user('Admin')->id,
        ]);
    }

    public function test_legacy_client_project_still_uses_project_assignment(): void
    {
        $client = $this->user('Client');
        $project = Project::factory()->create(['client_organization_id' => null]);

        ProjectAssignment::create([
            'user_id' => $client->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $this->user('Admin')->id,
        ]);

        $this->assertTrue(Project::query()->accessibleTo($client)->whereKey($project->id)->exists());
        $this->assertTrue(app(ProjectClientAccess::class)->canReadProject($client, $project));
    }

    public function test_client_organization_project_requires_approved_membership_for_client_role(): void
    {
        $client = $this->user('Client');
        $organization = $this->organization();
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);

        ProjectAssignment::create([
            'user_id' => $client->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $this->user('Admin')->id,
        ]);

        $this->assertFalse(Project::query()->accessibleTo($client)->whereKey($project->id)->exists());
        $this->assertFalse(app(ProjectClientAccess::class)->canReadProject($client, $project));

        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $client->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $this->user('Admin')->id,
        ]);

        $this->assertTrue(Project::query()->accessibleTo($client)->whereKey($project->id)->exists());
        $this->assertTrue(app(ProjectClientAccess::class)->canReadProject($client, $project));
    }

    public function test_stale_client_organization_membership_does_not_grant_project_access(): void
    {
        $client = $this->user('Client');
        $oldOrganization = $this->organization('old-client');
        $newOrganization = $this->organization('new-client');
        $project = Project::factory()->create(['client_organization_id' => $newOrganization->id]);

        ProjectMembership::create([
            'client_organization_id' => $oldOrganization->id,
            'project_id' => $project->id,
            'user_id' => $client->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $this->user('Admin')->id,
        ]);

        $this->assertFalse(Project::query()->accessibleTo($client)->whereKey($project->id)->exists());
        $this->assertFalse(app(ProjectClientAccess::class)->canReadProject($client, $project));
    }

    public function test_non_approved_membership_states_do_not_grant_client_access(): void
    {
        $states = [
            ProjectMembership::STATE_PENDING,
            ProjectMembership::STATE_REJECTED,
            ProjectMembership::STATE_EXPIRED,
            ProjectMembership::STATE_SUSPENDED,
            ProjectMembership::STATE_REMOVED,
        ];

        foreach ($states as $state) {
            $client = $this->user('Client');
            $organization = $this->organization('client-' . $state);
            $project = Project::factory()->create(['client_organization_id' => $organization->id]);

            ProjectMembership::create([
                'client_organization_id' => $organization->id,
                'project_id' => $project->id,
                'user_id' => $client->id,
                'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
                'state' => $state,
            ]);

            $this->assertFalse(
                Project::query()->accessibleTo($client)->whereKey($project->id)->exists(),
                "State {$state} must not grant project access."
            );
        }
    }

    public function test_non_approved_membership_states_deny_project_nested_reads_and_client_writes(): void
    {
        Storage::fake('local');

        foreach ([
            ProjectMembership::STATE_PENDING,
            ProjectMembership::STATE_REJECTED,
            ProjectMembership::STATE_EXPIRED,
            ProjectMembership::STATE_SUSPENDED,
            ProjectMembership::STATE_REMOVED,
        ] as $state) {
            $admin = $this->user('Admin');
            $client = $this->user('Client');
            $organization = $this->organization('state-deny-' . $state);
            $project = Project::factory()->create(['client_organization_id' => $organization->id]);
            $module = Module::factory()->create(['project_id' => $project->id]);
            $activity = Activity::factory()->create(['module_id' => $module->id]);
            $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);
            $task = DetailedActivity::factory()->create([
                'sub_activity_id' => $subActivity->id,
                'client_visible' => true,
            ]);
            $task->comments()->create([
                'author' => 'Internal User',
                'author_role' => 'Team Member',
                'body' => 'Client-visible update',
                'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
            ]);
            $attachment = $task->attachments()->create([
                'uploader' => 'Internal User',
                'uploader_role' => 'Team Member',
                'uploaded_by_user_id' => $admin->id,
                'original_name' => "{$state}.pdf",
                'stored_name' => "{$state}.pdf",
                'disk' => 'local',
                'path' => "attachments/{$task->id}/{$state}.pdf",
                'mime_type' => 'application/pdf',
                'size_bytes' => 128,
                'visibility' => Attachment::VISIBILITY_CLIENT_VISIBLE,
            ]);

            Storage::disk('local')->put($attachment->path, 'fixture');

            ProjectMembership::create([
                'client_organization_id' => $organization->id,
                'project_id' => $project->id,
                'user_id' => $client->id,
                'role' => ProjectMembership::ROLE_CLIENT_CONTRIBUTOR,
                'state' => $state,
            ]);

            $this->actingAs($client, 'sanctum')
                ->getJson("/api/projects/{$project->id}")
                ->assertForbidden();

            $this->actingAs($client, 'sanctum')
                ->getJson("/api/detailed-activities/{$task->id}")
                ->assertForbidden();

            $this->actingAs($client, 'sanctum')
                ->getJson("/api/detailed-activities/{$task->id}/comments")
                ->assertForbidden();

            $this->actingAs($client, 'sanctum')
                ->getJson("/api/detailed-activities/{$task->id}/attachments")
                ->assertForbidden();

            $this->actingAs($client, 'sanctum')
                ->get("/api/attachments/{$attachment->id}/download")
                ->assertForbidden();

            $this->actingAs($client, 'sanctum')
                ->postJson("/api/detailed-activities/{$task->id}/comments", [
                    'body' => "Comment from {$state}.",
                    'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
                ])
                ->assertForbidden();

            $this->actingAs($client, 'sanctum')
                ->postJson("/api/detailed-activities/{$task->id}/attachments", [
                    'file' => UploadedFile::fake()->create("{$state}-upload.pdf", 10, 'application/pdf'),
                    'visibility' => Attachment::VISIBILITY_CLIENT_VISIBLE,
                ])
                ->assertForbidden();

            $this->assertDatabaseMissing('comments', [
                'detailed_activity_id' => $task->id,
                'body' => "Comment from {$state}.",
            ]);
            $this->assertDatabaseMissing('attachments', [
                'detailed_activity_id' => $task->id,
                'original_name' => "{$state}-upload.pdf",
            ]);
        }
    }

    public function test_team_member_assignment_still_works_on_client_organization_project(): void
    {
        $teamMember = $this->user('Team Member');
        $organization = $this->organization();
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);

        ProjectAssignment::create([
            'user_id' => $teamMember->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $this->user('Admin')->id,
        ]);

        $this->assertTrue(Project::query()->accessibleTo($teamMember)->whereKey($project->id)->exists());
        $this->assertTrue(app(ProjectClientAccess::class)->canReadProject($teamMember, $project));
    }

    public function test_clients_only_see_their_approved_projects_across_multiple_organizations(): void
    {
        $clientCoUser = $this->user('Client');
        $vendorCoUser = $this->user('Client');
        $clientCo = $this->organization('phase-seven-clientco');
        $vendorCo = $this->organization('phase-seven-vendorco');
        $clientCoVisibleProject = Project::factory()->create([
            'name' => 'ClientCo Visible',
            'client_organization_id' => $clientCo->id,
        ]);
        $clientCoPrivateProject = Project::factory()->create([
            'name' => 'ClientCo Private',
            'client_organization_id' => $clientCo->id,
        ]);
        $vendorCoVisibleProject = Project::factory()->create([
            'name' => 'VendorCo Visible',
            'client_organization_id' => $vendorCo->id,
        ]);
        $vendorCoPrivateProject = Project::factory()->create([
            'name' => 'VendorCo Private',
            'client_organization_id' => $vendorCo->id,
        ]);

        $this->approvedMembership($clientCo, $clientCoVisibleProject, $clientCoUser);
        $this->approvedMembership($vendorCo, $vendorCoVisibleProject, $vendorCoUser);

        $this->actingAs($clientCoUser, 'sanctum')
            ->getJson('/api/projects')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $clientCoVisibleProject->id);

        $this->actingAs($clientCoUser, 'sanctum')
            ->getJson("/api/projects/{$clientCoVisibleProject->id}")
            ->assertOk()
            ->assertJsonPath('id', $clientCoVisibleProject->id);

        foreach ([$clientCoPrivateProject, $vendorCoVisibleProject, $vendorCoPrivateProject] as $inaccessibleProject) {
            $this->actingAs($clientCoUser, 'sanctum')
                ->getJson("/api/projects/{$inaccessibleProject->id}")
                ->assertForbidden()
                ->assertJsonPath('message', 'You do not have access to this resource.');
        }

        $this->actingAs($vendorCoUser, 'sanctum')
            ->getJson('/api/projects')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $vendorCoVisibleProject->id);

        $this->actingAs($vendorCoUser, 'sanctum')
            ->getJson("/api/projects/{$vendorCoVisibleProject->id}")
            ->assertOk()
            ->assertJsonPath('id', $vendorCoVisibleProject->id);

        foreach ([$vendorCoPrivateProject, $clientCoVisibleProject, $clientCoPrivateProject] as $inaccessibleProject) {
            $this->actingAs($vendorCoUser, 'sanctum')
                ->getJson("/api/projects/{$inaccessibleProject->id}")
                ->assertForbidden()
                ->assertJsonPath('message', 'You do not have access to this resource.');
        }
    }

    public function test_client_nested_surfaces_are_isolated_across_multiple_organizations(): void
    {
        Storage::fake('local');

        $clientCoUser = $this->user('Client');
        $vendorCoUser = $this->user('Client');
        $clientCo = $this->organization('phase-seven-nested-clientco');
        $vendorCo = $this->organization('phase-seven-nested-vendorco');
        [$clientCoProject, $clientCoTask] = $this->clientVisibleSupportTask($clientCo, 'ClientCo Support');
        [$vendorCoProject, $vendorCoTask] = $this->clientVisibleSupportTask($vendorCo, 'VendorCo Support');

        $this->approvedMembership($clientCo, $clientCoProject, $clientCoUser);
        $this->approvedMembership($vendorCo, $vendorCoProject, $vendorCoUser);

        $clientCoComment = $clientCoTask->comments()->create([
            'author' => 'Internal User',
            'author_role' => 'Team Member',
            'body' => 'ClientCo visible comment',
            'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
        ]);
        $vendorCoComment = $vendorCoTask->comments()->create([
            'author' => 'Internal User',
            'author_role' => 'Team Member',
            'body' => 'VendorCo visible comment',
            'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
        ]);
        $clientCoAttachment = $this->visibleAttachment($clientCoTask, 'clientco-file.pdf');
        $vendorCoAttachment = $this->visibleAttachment($vendorCoTask, 'vendorco-file.pdf');
        $clientCoNotification = $this->clientNotification($clientCoTask, 'clientco-nested-notification');
        $vendorCoNotification = $this->clientNotification($vendorCoTask, 'vendorco-nested-notification');

        $this->actingAs($clientCoUser, 'sanctum')
            ->getJson("/api/detailed-activities/{$clientCoTask->id}")
            ->assertOk()
            ->assertJsonPath('id', $clientCoTask->id);

        $this->actingAs($clientCoUser, 'sanctum')
            ->getJson("/api/detailed-activities/{$vendorCoTask->id}")
            ->assertForbidden();

        $this->actingAs($clientCoUser, 'sanctum')
            ->getJson("/api/detailed-activities/{$clientCoTask->id}/comments")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $clientCoComment->id);

        $this->actingAs($clientCoUser, 'sanctum')
            ->getJson("/api/detailed-activities/{$vendorCoTask->id}/comments")
            ->assertForbidden();

        $this->actingAs($clientCoUser, 'sanctum')
            ->getJson("/api/detailed-activities/{$clientCoTask->id}/attachments")
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $clientCoAttachment->id);

        $this->actingAs($clientCoUser, 'sanctum')
            ->get("/api/attachments/{$vendorCoAttachment->id}/download")
            ->assertForbidden();

        $this->actingAs($clientCoUser, 'sanctum')
            ->getJson("/api/support-ops?project_id={$clientCoProject->id}")
            ->assertForbidden();

        $this->actingAs($clientCoUser, 'sanctum')
            ->getJson('/api/reports')
            ->assertOk()
            ->assertJsonPath('summary.project_count', 1)
            ->assertJsonPath('projects.0.id', $clientCoProject->id);

        $this->actingAs($clientCoUser, 'sanctum')
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(1, 'notifications')
            ->assertJsonPath('notifications.0.id', $clientCoNotification->id);

        $this->actingAs($vendorCoUser, 'sanctum')
            ->getJson("/api/detailed-activities/{$clientCoTask->id}")
            ->assertForbidden();

        $this->actingAs($vendorCoUser, 'sanctum')
            ->getJson('/api/reports')
            ->assertOk()
            ->assertJsonPath('summary.project_count', 1)
            ->assertJsonPath('projects.0.id', $vendorCoProject->id);

        $this->actingAs($vendorCoUser, 'sanctum')
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonCount(1, 'notifications')
            ->assertJsonPath('notifications.0.id', $vendorCoNotification->id);

        $this->assertNotSame($clientCoComment->id, $vendorCoComment->id);
    }

    public function test_clients_cannot_access_audit_logs_or_organization_review_queues(): void
    {
        $client = $this->user('Client');
        $organization = $this->organization('phase-seven-review-block');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);

        $this->approvedMembership($organization, $project, $client);

        $this->actingAs($client, 'sanctum')
            ->getJson('/api/audit-logs')
            ->assertForbidden();

        $this->actingAs($client, 'sanctum')
            ->getJson("/api/audit-logs?client_organization_id={$organization->id}&project_id={$project->id}")
            ->assertForbidden();

        $this->actingAs($client, 'sanctum')
            ->getJson('/api/client-membership-review')
            ->assertForbidden();

        $this->actingAs($client, 'sanctum')
            ->getJson("/api/client-membership-review?client_organization_id={$organization->id}&project_id={$project->id}")
            ->assertForbidden();
    }

    public function test_client_direct_id_denials_do_not_distinguish_missing_from_inaccessible_resources(): void
    {
        $client = $this->user('Client');
        $clientCo = $this->organization('phase-seven-non-enumerating-clientco');
        $vendorCo = $this->organization('phase-seven-non-enumerating-vendorco');
        [$clientCoProject] = $this->clientVisibleSupportTask($clientCo, 'Accessible ClientCo Support');
        [$vendorCoProject, $vendorCoTask] = $this->clientVisibleSupportTask($vendorCo, 'Inaccessible VendorCo Support');

        $this->approvedMembership($clientCo, $clientCoProject, $client);

        $inaccessibleProject = $this->actingAs($client, 'sanctum')
            ->getJson("/api/projects/{$vendorCoProject->id}")
            ->assertForbidden();
        $missingProject = $this->actingAs($client, 'sanctum')
            ->getJson('/api/projects/999999999')
            ->assertForbidden();
        $this->assertSame($inaccessibleProject->getContent(), $missingProject->getContent());

        $inaccessibleTask = $this->actingAs($client, 'sanctum')
            ->getJson("/api/detailed-activities/{$vendorCoTask->id}")
            ->assertForbidden();
        $missingTask = $this->actingAs($client, 'sanctum')
            ->getJson('/api/detailed-activities/999999999')
            ->assertForbidden();
        $this->assertSame($inaccessibleTask->getContent(), $missingTask->getContent());
    }

    public function test_client_task_response_omits_internal_only_fields(): void
    {
        [$client, $task] = $this->clientVisibleTaskFixture();

        $response = $this->actingAs($client, 'sanctum')
            ->getJson("/api/detailed-activities/{$task->id}");

        $response->assertOk()
            ->assertJsonPath('id', $task->id)
            ->assertJsonMissingPath('notes')
            ->assertJsonMissingPath('output')
            ->assertJsonMissingPath('responsible')
            ->assertJsonMissingPath('support')
            ->assertJsonMissingPath('work_type')
            ->assertJsonMissingPath('evidence')
            ->assertJsonMissingPath('root_cause')
            ->assertJsonMissingPath('resolution');
    }

    public function test_internal_task_response_keeps_internal_fields(): void
    {
        [, $task] = $this->clientVisibleTaskFixture();
        $admin = $this->user('Admin');

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/detailed-activities/{$task->id}");

        $response->assertOk()
            ->assertJsonPath('notes', 'Internal note')
            ->assertJsonPath('root_cause', 'Internal root cause')
            ->assertJsonPath('resolution', 'Internal resolution');
    }

    public function test_client_comment_and_attachment_responses_omit_internal_metadata(): void
    {
        [$client, $task] = $this->clientVisibleTaskFixture();

        $comment = $task->comments()->create([
            'author' => 'Internal User',
            'author_role' => 'Team Member',
            'body' => 'Client-safe comment',
            'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
        ]);

        $attachment = $task->attachments()->create([
            'uploader' => 'Internal User',
            'uploader_role' => 'Team Member',
            'uploaded_by_user_id' => null,
            'original_name' => 'client-file.pdf',
            'stored_name' => 'secret-stored-name.pdf',
            'disk' => 'local',
            'path' => 'attachments/secret/client-file.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => 128,
            'visibility' => Attachment::VISIBILITY_CLIENT_VISIBLE,
        ]);

        $commentResponse = $this->actingAs($client, 'sanctum')
            ->getJson("/api/detailed-activities/{$task->id}/comments");

        $commentResponse->assertOk()
            ->assertJsonPath('0.id', $comment->id)
            ->assertJsonMissingPath('0.author_role');

        $attachmentResponse = $this->actingAs($client, 'sanctum')
            ->getJson("/api/detailed-activities/{$task->id}/attachments");

        $attachmentResponse->assertOk()
            ->assertJsonPath('0.id', $attachment->id)
            ->assertJsonMissingPath('0.uploader_role')
            ->assertJsonMissingPath('0.uploaded_by_user_id')
            ->assertJsonMissingPath('0.stored_name')
            ->assertJsonMissingPath('0.disk')
            ->assertJsonMissingPath('0.path');
    }

    public function test_invitation_token_service_stores_hash_and_resolves_valid_token(): void
    {
        $service = app(ProjectInvitationTokenService::class);
        $attributes = $service->issueAttributes();
        $organization = $this->organization('invite-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $admin = $this->user('Admin');

        $invitation = $this->createInvitation([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'token_hash' => $attributes['token_hash'],
            'invited_by_user_id' => $admin->id,
            'expires_at' => $attributes['expires_at'],
        ]);

        $this->assertNotSame($attributes['plaintext_token'], $invitation->token_hash);
        $this->assertSame(64, strlen($attributes['plaintext_token']));
        $this->assertTrue(hash_equals($invitation->token_hash, $service->hashToken($attributes['plaintext_token'])));
        $this->assertTrue($invitation->is($service->findValidInvitation($attributes['plaintext_token'])));
    }

    public function test_invitation_token_service_rejects_invalid_expired_and_revoked_tokens(): void
    {
        $service = app(ProjectInvitationTokenService::class);
        $organization = $this->organization('reject-token-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $admin = $this->user('Admin');

        $expiredToken = $service->generatePlaintextToken();
        $this->createInvitation([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'token_hash' => $service->hashToken($expiredToken),
            'invited_by_user_id' => $admin->id,
            'expires_at' => now()->subMinute(),
        ]);

        $revokedToken = $service->generatePlaintextToken();
        $this->createInvitation([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'token_hash' => $service->hashToken($revokedToken),
            'invited_by_user_id' => $admin->id,
            'state' => \App\Models\ProjectInvitation::STATE_REVOKED,
            'expires_at' => now()->addDay(),
        ]);

        $this->assertNull($service->findValidInvitation('not-a-real-token'));
        $this->assertNull($service->findValidInvitation($expiredToken));
        $this->assertNull($service->findValidInvitation($revokedToken));
    }

    public function test_admin_can_create_and_list_project_invitations_without_exposing_token_hash(): void
    {
        $admin = $this->user('Admin');
        $organization = $this->organization('api-invite-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);

        $create = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/invitations", [
                'client_organization_id' => $organization->id,
                'email' => ' Invitee@Example.Test ',
                'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
                'expires_in_days' => 5,
            ]);

        $create->assertCreated()
            ->assertJsonPath('data.email', 'invitee@example.test')
            ->assertJsonPath('data.email_domain', 'example.test')
            ->assertJsonPath('data.role', ProjectMembership::ROLE_CLIENT_VIEWER)
            ->assertJsonMissingPath('data.token_hash');

        $this->assertNotEmpty($create->json('data.invitation_url'));

        $invitation = ProjectInvitation::firstOrFail();
        $this->assertNotSame($create->json('data.invitation_url'), $invitation->token_hash);

        $list = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/invitations");

        $list->assertOk()
            ->assertJsonPath('data.0.id', $invitation->id)
            ->assertJsonMissingPath('data.0.token_hash')
            ->assertJsonMissingPath('data.0.invitation_url');
    }

    public function test_resending_pending_invitation_reuses_existing_invitation_record(): void
    {
        $admin = $this->user('Admin');
        $organization = $this->organization('resend-invite-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);

        $first = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/invitations", [
                'client_organization_id' => $organization->id,
                'email' => 'invitee@example.test',
                'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
                'expires_in_days' => 3,
            ]);

        $second = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/invitations", [
                'client_organization_id' => $organization->id,
                'email' => 'INVITEE@example.test',
                'role' => ProjectMembership::ROLE_CLIENT_ADMIN,
                'expires_in_days' => 10,
            ]);

        $first->assertCreated();
        $second->assertCreated()
            ->assertJsonPath('data.id', $first->json('data.id'))
            ->assertJsonPath('data.role', ProjectMembership::ROLE_CLIENT_ADMIN);

        $this->assertSame(1, ProjectInvitation::where('project_id', $project->id)->where('email', 'invitee@example.test')->count());
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'project_invitation.revoked',
            'entity_type' => 'project_invitation',
            'entity_id' => $first->json('data.id'),
        ]);
    }

    public function test_accepting_invitation_creates_pending_membership_under_manual_policy(): void
    {
        $admin = $this->user('Admin');
        $client = User::factory()->create([
            'role' => 'Client',
            'email' => 'invitee@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $organization = $this->organization('manual-invite-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $issued = app(ProjectInvitationTokenService::class)->issueAttributes();

        $invitation = $this->createInvitation([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'email' => $client->email,
            'email_domain' => 'example.test',
            'token_hash' => $issued['token_hash'],
            'invited_by_user_id' => $admin->id,
            'expires_at' => $issued['expires_at'],
        ]);

        $response = $this->actingAs($client, 'sanctum')
            ->postJson('/api/project-invitations/accept', ['token' => $issued['plaintext_token']]);

        $response->assertOk()
            ->assertJsonPath('data.client_organization_id', $organization->id)
            ->assertJsonPath('data.project_id', $project->id)
            ->assertJsonPath('data.user_id', $client->id)
            ->assertJsonPath('data.state', ProjectMembership::STATE_PENDING);

        $this->assertDatabaseHas('project_invitations', [
            'id' => $invitation->id,
            'state' => ProjectInvitation::STATE_ACCEPTED,
            'accepted_by_user_id' => $client->id,
        ]);
    }

    public function test_accepting_invitation_requires_matching_signed_in_email(): void
    {
        $admin = $this->user('Admin');
        $client = User::factory()->create([
            'role' => 'Client',
            'email' => 'wrong@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $organization = $this->organization('mismatch-invite-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $issued = app(ProjectInvitationTokenService::class)->issueAttributes();

        $this->createInvitation([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'email' => 'invitee@example.test',
            'email_domain' => 'example.test',
            'token_hash' => $issued['token_hash'],
            'invited_by_user_id' => $admin->id,
            'expires_at' => $issued['expires_at'],
        ]);

        $this->actingAs($client, 'sanctum')
            ->postJson('/api/project-invitations/accept', ['token' => $issued['plaintext_token']])
            ->assertForbidden();
    }

    public function test_accepting_invitation_rejects_project_moved_to_another_client_organization(): void
    {
        $admin = $this->user('Admin');
        $client = User::factory()->create([
            'role' => 'Client',
            'email' => 'invitee@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $oldOrganization = $this->organization('stale-invite-old');
        $newOrganization = $this->organization('stale-invite-new');
        $project = Project::factory()->create(['client_organization_id' => $oldOrganization->id]);
        $issued = app(ProjectInvitationTokenService::class)->issueAttributes();

        $this->createInvitation([
            'client_organization_id' => $oldOrganization->id,
            'project_id' => $project->id,
            'email' => $client->email,
            'email_domain' => 'example.test',
            'token_hash' => $issued['token_hash'],
            'invited_by_user_id' => $admin->id,
            'expires_at' => $issued['expires_at'],
        ]);

        $project->update(['client_organization_id' => $newOrganization->id]);

        $this->actingAs($client, 'sanctum')
            ->postJson('/api/project-invitations/accept', ['token' => $issued['plaintext_token']])
            ->assertStatus(422);

        $this->assertDatabaseMissing('project_memberships', [
            'project_id' => $project->id,
            'user_id' => $client->id,
            'state' => ProjectMembership::STATE_APPROVED,
        ]);
    }

    public function test_approved_client_admin_can_create_project_invitation(): void
    {
        $clientAdmin = User::factory()->create([
            'role' => 'Client',
            'email' => 'admin-client@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $organization = $this->organization('client-admin-invite');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);

        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $clientAdmin->id,
            'role' => ProjectMembership::ROLE_CLIENT_ADMIN,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $this->user('Admin')->id,
        ]);

        $this->actingAs($clientAdmin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/invitations", [
                'client_organization_id' => $organization->id,
                'email' => 'new-contact@example.test',
                'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            ])
            ->assertCreated();
    }

    public function test_domain_policy_service_normalizes_and_detects_public_providers(): void
    {
        $policy = app(ClientDomainPolicy::class);

        $this->assertSame('clientco.example', $policy->normalizeDomain(' @ClientCo.Example. '));
        $this->assertSame('clientco.example', $policy->domainFromEmail(' Person@ClientCo.Example '));
        $this->assertTrue($policy->isPublicProvider('GMAIL.COM'));
        $this->assertTrue($policy->isPublicProvider('outlook.com'));
        $this->assertFalse($policy->isPublicProvider('clientco.example'));
    }

    public function test_admin_can_create_organization_update_policy_and_associate_project(): void
    {
        $admin = $this->user('Admin');
        $project = Project::factory()->create(['client_organization_id' => null]);

        $create = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/client-organizations', [
                'name' => 'Client Co',
                'trusted_domain_policy' => ClientOrganization::POLICY_MANUAL_APPROVAL,
            ]);

        $create->assertCreated()
            ->assertJsonPath('data.name', 'Client Co')
            ->assertJsonPath('data.trusted_domain_policy', ClientOrganization::POLICY_MANUAL_APPROVAL);

        $organizationId = $create->json('data.id');

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/client-organizations/{$organizationId}/trusted-domain-policy", [
                'trusted_domain_policy' => ClientOrganization::POLICY_DOMAIN_AUTO_APPROVE,
            ])
            ->assertOk()
            ->assertJsonPath('data.trusted_domain_policy', ClientOrganization::POLICY_DOMAIN_AUTO_APPROVE);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/projects/{$project->id}/client-organization", [
                'client_organization_id' => $organizationId,
            ])
            ->assertOk()
            ->assertJsonPath('data.client_organization_id', $organizationId);
    }

    public function test_verified_domain_routes_reject_public_providers_and_create_verified_domains(): void
    {
        $admin = $this->user('Admin');
        $organization = $this->organization('domain-route-client');

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/client-organizations/{$organization->id}/domains", ['domain' => 'gmail.com'])
            ->assertStatus(422);

        $create = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/client-organizations/{$organization->id}/domains", ['domain' => ' @ClientCo.Example. ']);

        $create->assertCreated()
            ->assertJsonPath('data.domain', 'clientco.example')
            ->assertJsonPath('data.status', ClientDomain::STATUS_VERIFIED)
            ->assertJsonMissingPath('data.rejected_at');

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/client-organizations/{$organization->id}/domains")
            ->assertOk()
            ->assertJsonPath('data.0.domain', 'clientco.example');
    }

    public function test_removed_verified_domain_can_be_reverified_without_duplicate_insert(): void
    {
        $admin = $this->user('Admin');
        $organization = $this->organization('restore-domain-client');
        $domain = ClientDomain::create([
            'client_organization_id' => $organization->id,
            'domain' => 'clientco.example',
            'status' => ClientDomain::STATUS_REMOVED,
            'verified_at' => now()->subDay(),
            'verified_by_user_id' => $admin->id,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/client-organizations/{$organization->id}/domains", ['domain' => 'clientco.example'])
            ->assertCreated()
            ->assertJsonPath('data.id', $domain->id)
            ->assertJsonPath('data.status', ClientDomain::STATUS_VERIFIED);

        $this->assertSame(1, ClientDomain::where('domain', 'clientco.example')->count());
    }

    public function test_verified_corporate_domain_auto_approves_invitation_acceptance(): void
    {
        $admin = $this->user('Admin');
        $client = User::factory()->create([
            'role' => 'Client',
            'email' => 'invitee@clientco.example',
            'department' => null,
            'is_active' => true,
        ]);
        $organization = ClientOrganization::create([
            'name' => 'Auto Approve Co',
            'slug' => 'auto-approve-co',
            'trusted_domain_policy' => ClientOrganization::POLICY_DOMAIN_AUTO_APPROVE,
            'status' => ClientOrganization::STATUS_ACTIVE,
            'created_by_user_id' => $admin->id,
        ]);
        ClientDomain::create([
            'client_organization_id' => $organization->id,
            'domain' => 'clientco.example',
            'status' => ClientDomain::STATUS_VERIFIED,
            'verified_at' => now(),
            'verified_by_user_id' => $admin->id,
        ]);
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $issued = app(ProjectInvitationTokenService::class)->issueAttributes();

        $this->createInvitation([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'email' => $client->email,
            'email_domain' => 'clientco.example',
            'token_hash' => $issued['token_hash'],
            'invited_by_user_id' => $admin->id,
            'expires_at' => $issued['expires_at'],
        ]);

        $this->actingAs($client, 'sanctum')
            ->postJson('/api/project-invitations/accept', ['token' => $issued['plaintext_token']])
            ->assertOk()
            ->assertJsonPath('data.state', ProjectMembership::STATE_APPROVED);
    }

    public function test_public_provider_invite_under_auto_approve_policy_remains_pending(): void
    {
        $admin = $this->user('Admin');
        $client = User::factory()->create([
            'role' => 'Client',
            'email' => 'invitee@gmail.com',
            'department' => null,
            'is_active' => true,
        ]);
        $organization = ClientOrganization::create([
            'name' => 'Public Provider Co',
            'slug' => 'public-provider-co',
            'trusted_domain_policy' => ClientOrganization::POLICY_DOMAIN_AUTO_APPROVE,
            'status' => ClientOrganization::STATUS_ACTIVE,
            'created_by_user_id' => $admin->id,
        ]);
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $issued = app(ProjectInvitationTokenService::class)->issueAttributes();

        $this->createInvitation([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'email' => $client->email,
            'email_domain' => 'gmail.com',
            'token_hash' => $issued['token_hash'],
            'invited_by_user_id' => $admin->id,
            'expires_at' => $issued['expires_at'],
        ]);

        $this->actingAs($client, 'sanctum')
            ->postJson('/api/project-invitations/accept', ['token' => $issued['plaintext_token']])
            ->assertOk()
            ->assertJsonPath('data.state', ProjectMembership::STATE_PENDING);
    }

    public function test_admin_can_list_project_memberships_for_current_client_organization(): void
    {
        $admin = $this->user('Admin');
        $client = $this->user('Client');
        $organization = $this->organization('membership-list-client');
        $staleOrganization = $this->organization('membership-list-stale');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);

        $currentMembership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $client->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $admin->id,
        ]);

        ProjectMembership::create([
            'client_organization_id' => $staleOrganization->id,
            'project_id' => $project->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $admin->id,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/memberships")
            ->assertOk()
            ->assertJsonPath('data.0.id', $currentMembership->id)
            ->assertJsonCount(1, 'data');

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/memberships?state=" . ProjectMembership::STATE_PENDING)
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/memberships?state=not-a-state")
            ->assertStatus(422);
    }

    public function test_project_membership_list_authorization_matches_project_scope(): void
    {
        $admin = $this->user('Admin');
        $owningProjectManager = $this->user('Project Manager');
        $otherProjectManager = $this->user('Project Manager');
        $clientAdmin = User::factory()->create([
            'role' => 'Client',
            'email' => 'client-admin@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $clientViewer = User::factory()->create([
            'role' => 'Client',
            'email' => 'client-viewer@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $organization = $this->organization('membership-auth-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);

        ProjectOwnership::create([
            'project_id' => $project->id,
            'user_id' => $owningProjectManager->id,
            'assigned_by_user_id' => $admin->id,
        ]);

        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $clientAdmin->id,
            'role' => ProjectMembership::ROLE_CLIENT_ADMIN,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $admin->id,
        ]);

        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $clientViewer->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $admin->id,
        ]);

        $this->actingAs($owningProjectManager, 'sanctum')
            ->getJson("/api/projects/{$project->id}/memberships")
            ->assertOk();

        $this->actingAs($clientAdmin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/memberships")
            ->assertOk();

        $this->actingAs($otherProjectManager, 'sanctum')
            ->getJson("/api/projects/{$project->id}/memberships")
            ->assertForbidden();

        $this->actingAs($clientViewer, 'sanctum')
            ->getJson("/api/projects/{$project->id}/memberships")
            ->assertForbidden();
    }

    public function test_admin_can_transition_project_membership_states_in_place(): void
    {
        $admin = $this->user('Admin');
        $client = $this->user('Client');
        $organization = $this->organization('membership-transition-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $membership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $client->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$membership->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.id', $membership->id)
            ->assertJsonPath('data.state', ProjectMembership::STATE_APPROVED);

        $this->assertDatabaseHas('project_memberships', [
            'id' => $membership->id,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_by_user_id' => $admin->id,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$membership->id}/suspend")
            ->assertOk()
            ->assertJsonPath('data.state', ProjectMembership::STATE_SUSPENDED);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$membership->id}/restore")
            ->assertOk()
            ->assertJsonPath('data.state', ProjectMembership::STATE_APPROVED);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$membership->id}/remove")
            ->assertOk()
            ->assertJsonPath('data.state', ProjectMembership::STATE_REMOVED);

        $this->assertSame(1, ProjectMembership::whereKey($membership->id)->count());
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'project_membership.approved',
            'entity_type' => 'project_membership',
            'entity_id' => $membership->id,
        ]);
    }

    public function test_pending_membership_can_be_rejected_or_expired(): void
    {
        $admin = $this->user('Admin');
        $organization = $this->organization('membership-terminal-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $rejectMembership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);
        $expireMembership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$rejectMembership->id}/reject")
            ->assertOk()
            ->assertJsonPath('data.state', ProjectMembership::STATE_REJECTED);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$expireMembership->id}/expire")
            ->assertOk()
            ->assertJsonPath('data.state', ProjectMembership::STATE_EXPIRED);
    }

    public function test_membership_transition_rejects_invalid_state_and_stale_project_client_organization(): void
    {
        $admin = $this->user('Admin');
        $organization = $this->organization('membership-invalid-client');
        $otherOrganization = $this->organization('membership-invalid-other');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $pendingMembership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);
        $staleMembership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $admin->id,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$pendingMembership->id}/suspend")
            ->assertStatus(409);

        $project->update(['client_organization_id' => $otherOrganization->id]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$staleMembership->id}/remove")
            ->assertStatus(422);
    }

    public function test_membership_transition_does_not_reapprove_terminal_or_removed_states(): void
    {
        $admin = $this->user('Admin');
        $organization = $this->organization('membership-terminal-reapprove');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);

        foreach ([
            ProjectMembership::STATE_REJECTED,
            ProjectMembership::STATE_EXPIRED,
            ProjectMembership::STATE_REMOVED,
            ProjectMembership::STATE_SUSPENDED,
        ] as $state) {
            $membership = ProjectMembership::create([
                'client_organization_id' => $organization->id,
                'project_id' => $project->id,
                'user_id' => $this->user('Client')->id,
                'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
                'state' => $state,
            ]);

            $this->actingAs($admin, 'sanctum')
                ->postJson("/api/project-memberships/{$membership->id}/approve")
                ->assertStatus(409);

            $this->assertDatabaseHas('project_memberships', [
                'id' => $membership->id,
                'state' => $state,
            ]);
        }
    }

    public function test_client_admin_can_transition_memberships_but_client_viewer_cannot(): void
    {
        $admin = $this->user('Admin');
        $clientAdmin = User::factory()->create([
            'role' => 'Client',
            'email' => 'membership-admin@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $clientViewer = User::factory()->create([
            'role' => 'Client',
            'email' => 'membership-viewer@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $organization = $this->organization('membership-client-admin');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);

        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $clientAdmin->id,
            'role' => ProjectMembership::ROLE_CLIENT_ADMIN,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $admin->id,
        ]);

        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $clientViewer->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $admin->id,
        ]);

        $targetMembership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);

        $this->actingAs($clientViewer, 'sanctum')
            ->postJson("/api/project-memberships/{$targetMembership->id}/approve")
            ->assertForbidden();

        $this->actingAs($clientAdmin, 'sanctum')
            ->postJson("/api/project-memberships/{$targetMembership->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.state', ProjectMembership::STATE_APPROVED);

        $selfMembership = ProjectMembership::where('user_id', $clientAdmin->id)->firstOrFail();

        $this->actingAs($clientAdmin, 'sanctum')
            ->postJson("/api/project-memberships/{$selfMembership->id}/remove")
            ->assertForbidden();
    }

    public function test_client_notifications_are_limited_to_accessible_client_visible_tasks(): void
    {
        [$client, $visibleTask] = $this->clientVisibleTaskFixture();
        $internalTask = DetailedActivity::factory()->create([
            'sub_activity_id' => $visibleTask->sub_activity_id,
            'client_visible' => false,
            'name' => 'Internal only task',
        ]);
        $otherOrganization = $this->organization('notification-other-client');
        $otherProject = Project::factory()->create(['client_organization_id' => $otherOrganization->id]);
        $otherModule = Module::factory()->create(['project_id' => $otherProject->id]);
        $otherActivity = Activity::factory()->create(['module_id' => $otherModule->id]);
        $otherSubActivity = SubActivity::factory()->create(['activity_id' => $otherActivity->id]);
        $otherTask = DetailedActivity::factory()->create([
            'sub_activity_id' => $otherSubActivity->id,
            'client_visible' => true,
            'name' => 'Other client task',
        ]);

        $visibleNotification = Notification::create([
            'user_role' => 'Client',
            'type' => Notification::TYPE_MENTION,
            'severity' => Notification::SEVERITY_INFO,
            'title' => 'Visible',
            'message' => 'Visible client update',
            'detailed_activity_id' => $visibleTask->id,
            'event_key' => 'visible-client-notification',
            'is_read' => false,
        ]);
        $internalNotification = Notification::create([
            'user_role' => 'Client',
            'type' => Notification::TYPE_MENTION,
            'severity' => Notification::SEVERITY_INFO,
            'title' => 'Internal',
            'message' => 'Internal update',
            'detailed_activity_id' => $internalTask->id,
            'event_key' => 'internal-client-notification',
            'is_read' => false,
        ]);
        $otherNotification = Notification::create([
            'user_role' => 'Client',
            'type' => Notification::TYPE_MENTION,
            'severity' => Notification::SEVERITY_INFO,
            'title' => 'Other',
            'message' => 'Other client update',
            'detailed_activity_id' => $otherTask->id,
            'event_key' => 'other-client-notification',
            'is_read' => false,
        ]);

        $this->actingAs($client, 'sanctum')
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('notifications.0.id', $visibleNotification->id)
            ->assertJsonCount(1, 'notifications');

        $this->actingAs($client, 'sanctum')
            ->putJson("/api/notifications/{$internalNotification->id}/read")
            ->assertForbidden();

        $this->actingAs($client, 'sanctum')
            ->postJson('/api/notifications/read-all')
            ->assertOk();

        $this->assertTrue($visibleNotification->refresh()->is_read);
        $this->assertFalse($internalNotification->refresh()->is_read);
        $this->assertFalse($otherNotification->refresh()->is_read);
    }

    public function test_project_membership_roles_enforce_client_contribution_boundaries(): void
    {
        Storage::fake('local');

        $admin = $this->user('Admin');
        $viewer = User::factory()->create([
            'role' => 'Client',
            'email' => 'viewer@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $contributor = User::factory()->create([
            'role' => 'Client',
            'email' => 'contributor@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $clientAdmin = User::factory()->create([
            'role' => 'Client',
            'email' => 'admin@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $organization = $this->organization('role-boundary-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);
        $task = DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible' => true,
        ]);

        foreach ([
            [$viewer, ProjectMembership::ROLE_CLIENT_VIEWER],
            [$contributor, ProjectMembership::ROLE_CLIENT_CONTRIBUTOR],
            [$clientAdmin, ProjectMembership::ROLE_CLIENT_ADMIN],
        ] as [$client, $role]) {
            ProjectMembership::create([
                'client_organization_id' => $organization->id,
                'project_id' => $project->id,
                'user_id' => $client->id,
                'role' => $role,
                'state' => ProjectMembership::STATE_APPROVED,
                'approved_at' => now(),
                'approved_by_user_id' => $admin->id,
            ]);
        }

        $this->actingAs($viewer, 'sanctum')
            ->postJson("/api/detailed-activities/{$task->id}/comments", [
                'body' => 'Viewer should not contribute.',
                'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
            ])
            ->assertForbidden();

        $this->actingAs($contributor, 'sanctum')
            ->postJson("/api/detailed-activities/{$task->id}/comments", [
                'body' => 'Contributor comment.',
                'visibility' => Comment::VISIBILITY_INTERNAL,
            ])
            ->assertCreated()
            ->assertJsonPath('visibility', Comment::VISIBILITY_CLIENT_VISIBLE)
            ->assertJsonMissingPath('author_role');

        $this->actingAs($clientAdmin, 'sanctum')
            ->postJson("/api/detailed-activities/{$task->id}/attachments", [
                'file' => UploadedFile::fake()->create('client-note.pdf', 10, 'application/pdf'),
                'visibility' => Attachment::VISIBILITY_INTERNAL,
            ])
            ->assertCreated()
            ->assertJsonPath('visibility', Attachment::VISIBILITY_CLIENT_VISIBLE)
            ->assertJsonMissingPath('uploader_role');

        $this->assertDatabaseHas('comments', [
            'detailed_activity_id' => $task->id,
            'body' => 'Contributor comment.',
            'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
        ]);

        $this->assertDatabaseHas('attachments', [
            'detailed_activity_id' => $task->id,
            'original_name' => 'client-note.pdf',
            'visibility' => Attachment::VISIBILITY_CLIENT_VISIBLE,
        ]);
    }

    public function test_client_contributor_cannot_contribute_to_internal_only_task(): void
    {
        $admin = $this->user('Admin');
        $contributor = User::factory()->create([
            'role' => 'Client',
            'email' => 'hidden-contributor@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $organization = $this->organization('hidden-task-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);
        $task = DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible' => false,
        ]);

        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $contributor->id,
            'role' => ProjectMembership::ROLE_CLIENT_CONTRIBUTOR,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $admin->id,
        ]);

        $this->actingAs($contributor, 'sanctum')
            ->postJson("/api/detailed-activities/{$task->id}/comments", [
                'body' => 'Nope.',
                'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
            ])
            ->assertForbidden();
    }

    public function test_project_membership_role_permission_matrix(): void
    {
        $admin = $this->user('Admin');
        $viewer = User::factory()->create([
            'role' => 'Client',
            'email' => 'matrix-viewer@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $contributor = User::factory()->create([
            'role' => 'Client',
            'email' => 'matrix-contributor@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $clientAdmin = User::factory()->create([
            'role' => 'Client',
            'email' => 'matrix-admin@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $organization = $this->organization('matrix-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);
        $task = DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible' => true,
        ]);

        foreach ([
            [$viewer, ProjectMembership::ROLE_CLIENT_VIEWER],
            [$contributor, ProjectMembership::ROLE_CLIENT_CONTRIBUTOR],
            [$clientAdmin, ProjectMembership::ROLE_CLIENT_ADMIN],
        ] as [$client, $role]) {
            ProjectMembership::create([
                'client_organization_id' => $organization->id,
                'project_id' => $project->id,
                'user_id' => $client->id,
                'role' => $role,
                'state' => ProjectMembership::STATE_APPROVED,
                'approved_at' => now(),
                'approved_by_user_id' => $admin->id,
            ]);
        }

        $targetMembership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);

        foreach ([$viewer, $contributor, $clientAdmin] as $client) {
            $this->actingAs($client, 'sanctum')
                ->getJson("/api/projects/{$project->id}")
                ->assertOk();
        }

        $this->actingAs($viewer, 'sanctum')
            ->postJson("/api/detailed-activities/{$task->id}/comments", [
                'body' => 'Viewer matrix comment.',
                'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
            ])
            ->assertForbidden();

        $this->actingAs($contributor, 'sanctum')
            ->postJson("/api/detailed-activities/{$task->id}/comments", [
                'body' => 'Contributor matrix comment.',
                'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
            ])
            ->assertCreated();

        $this->actingAs($viewer, 'sanctum')
            ->getJson("/api/projects/{$project->id}/memberships")
            ->assertForbidden();

        $this->actingAs($contributor, 'sanctum')
            ->getJson("/api/projects/{$project->id}/memberships")
            ->assertForbidden();

        $this->actingAs($clientAdmin, 'sanctum')
            ->getJson("/api/projects/{$project->id}/memberships")
            ->assertOk();

        $this->actingAs($contributor, 'sanctum')
            ->postJson("/api/project-memberships/{$targetMembership->id}/approve")
            ->assertForbidden();

        $this->actingAs($clientAdmin, 'sanctum')
            ->postJson("/api/project-memberships/{$targetMembership->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.state', ProjectMembership::STATE_APPROVED);
    }

    public function test_client_membership_review_filters_by_state_project_org_domain_type_and_age(): void
    {
        $admin = $this->user('Admin');
        $organization = $this->organization('review-client');
        ClientDomain::create([
            'client_organization_id' => $organization->id,
            'domain' => 'clientco.example',
            'status' => ClientDomain::STATUS_VERIFIED,
            'verified_at' => now(),
            'verified_by_user_id' => $admin->id,
        ]);
        $projectA = Project::factory()->create(['client_organization_id' => $organization->id]);
        $projectB = Project::factory()->create(['client_organization_id' => $organization->id]);
        $corporateUser = User::factory()->create([
            'role' => 'Client',
            'email' => 'person@clientco.example',
            'department' => null,
            'is_active' => true,
        ]);
        $publicUser = User::factory()->create([
            'role' => 'Client',
            'email' => 'person@gmail.com',
            'department' => null,
            'is_active' => true,
        ]);
        $unverifiedUser = User::factory()->create([
            'role' => 'Client',
            'email' => 'person@unknown.example',
            'department' => null,
            'is_active' => true,
        ]);

        $oldPending = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $projectA->id,
            'user_id' => $corporateUser->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);
        $oldPending->forceFill([
            'created_at' => now()->subDays(5),
            'updated_at' => now()->subDays(5),
        ])->save();
        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $projectA->id,
            'user_id' => $publicUser->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);
        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $projectB->id,
            'user_id' => $unverifiedUser->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_SUSPENDED,
        ]);
        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $projectB->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_REMOVED,
            'removed_at' => now(),
        ]);
        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $projectB->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_ADMIN,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $admin->id,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/client-membership-review')
            ->assertOk()
            ->assertJsonCount(4, 'data');

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/client-membership-review?domain_type=verified_corporate&older_than_days=3')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $oldPending->id);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/client-membership-review?domain_type=public_provider')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.user_id', $publicUser->id);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/client-membership-review?project_id={$projectB->id}&state=" . ProjectMembership::STATE_SUSPENDED)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.user_id', $unverifiedUser->id);
    }

    public function test_client_membership_review_authorization_scopes_project_managers_to_owned_projects(): void
    {
        $admin = $this->user('Admin');
        $owningPm = $this->user('Project Manager');
        $otherPm = $this->user('Project Manager');
        $client = $this->user('Client');
        $organization = $this->organization('review-auth-client');
        $ownedProject = Project::factory()->create(['client_organization_id' => $organization->id]);
        $otherProject = Project::factory()->create(['client_organization_id' => $organization->id]);

        ProjectOwnership::create([
            'project_id' => $ownedProject->id,
            'user_id' => $owningPm->id,
            'assigned_by_user_id' => $admin->id,
        ]);
        ProjectOwnership::create([
            'project_id' => $otherProject->id,
            'user_id' => $otherPm->id,
            'assigned_by_user_id' => $admin->id,
        ]);

        $visibleMembership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $ownedProject->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);
        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $otherProject->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);

        $this->actingAs($owningPm, 'sanctum')
            ->getJson('/api/client-membership-review')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $visibleMembership->id);

        $this->actingAs($owningPm, 'sanctum')
            ->getJson("/api/client-membership-review?project_id={$otherProject->id}")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($client, 'sanctum')
            ->getJson('/api/client-membership-review')
            ->assertForbidden();
    }

    public function test_client_membership_review_rejects_invalid_filters_and_denies_unauthorized_roles(): void
    {
        $admin = $this->user('Admin');
        $departmentHead = $this->user('Department Head');
        $teamMember = $this->user('Team Member');
        $client = $this->user('Client');

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/client-membership-review?domain_type=personal&state=unknown&older_than_days=-1')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['domain_type', 'state', 'older_than_days']);

        $this->actingAs($departmentHead, 'sanctum')
            ->getJson('/api/client-membership-review')
            ->assertForbidden();

        $this->actingAs($teamMember, 'sanctum')
            ->getJson('/api/client-membership-review')
            ->assertForbidden();

        $this->actingAs($client, 'sanctum')
            ->getJson('/api/client-membership-review')
            ->assertForbidden();
    }

    public function test_sensitive_denied_writes_and_expired_invitation_are_audited(): void
    {
        $admin = $this->user('Admin');
        $viewer = User::factory()->create([
            'role' => 'Client',
            'email' => 'audit-viewer@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $expiredInvitee = User::factory()->create([
            'role' => 'Client',
            'email' => 'expired@example.test',
            'department' => null,
            'is_active' => true,
        ]);
        $organization = $this->organization('audit-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);
        $task = DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible' => true,
        ]);

        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $viewer->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $admin->id,
        ]);
        $pendingMembership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $expiredInvitee->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);
        $issued = app(ProjectInvitationTokenService::class)->issueAttributes();
        $invitation = $this->createInvitation([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'email' => $expiredInvitee->email,
            'email_domain' => 'example.test',
            'token_hash' => $issued['token_hash'],
            'invited_by_user_id' => $admin->id,
            'expires_at' => now()->subMinute(),
        ]);

        $this->actingAs($viewer, 'sanctum')
            ->postJson("/api/detailed-activities/{$task->id}/comments", [
                'body' => 'Denied comment.',
                'visibility' => Comment::VISIBILITY_CLIENT_VISIBLE,
            ])
            ->assertForbidden();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$pendingMembership->id}/suspend")
            ->assertStatus(409);

        $this->actingAs($expiredInvitee, 'sanctum')
            ->postJson('/api/project-invitations/accept', ['token' => $issued['plaintext_token']])
            ->assertStatus(422);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'permission.denied',
            'entity_type' => 'detailed_activity',
            'entity_id' => $task->id,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'permission.denied',
            'entity_type' => 'project_membership',
            'entity_id' => $pendingMembership->id,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'project_invitation.expired',
            'entity_type' => 'project_invitation',
            'entity_id' => $invitation->id,
        ]);
        $this->assertDatabaseHas('project_invitations', [
            'id' => $invitation->id,
            'state' => ProjectInvitation::STATE_EXPIRED,
        ]);
    }

    public function test_audit_logs_filter_by_client_project_membership_user_action_and_dates(): void
    {
        $admin = $this->user('Admin');
        $organization = $this->organization('audit-filter-client');
        $otherOrganization = $this->organization('audit-filter-other');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $otherProject = Project::factory()->create(['client_organization_id' => $otherOrganization->id]);
        $client = $this->user('Client');
        $otherClient = $this->user('Client');
        $membership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $client->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);
        $otherMembership = ProjectMembership::create([
            'client_organization_id' => $otherOrganization->id,
            'project_id' => $otherProject->id,
            'user_id' => $otherClient->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$membership->id}/approve")
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$otherMembership->id}/reject")
            ->assertOk();

        $query = http_build_query([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'membership_user_id' => $client->id,
            'action' => 'project_membership.approved',
            'date_from' => now()->subDay()->toDateString(),
            'date_to' => now()->addDay()->toDateString(),
        ]);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/audit-logs?{$query}")
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.action', 'project_membership.approved')
            ->assertJsonPath('data.0.metadata.client_organization_id', $organization->id)
            ->assertJsonPath('data.0.metadata.project_id', $project->id)
            ->assertJsonPath('data.0.metadata.membership_user_id', $client->id);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/audit-logs?client_organization_id=not-an-id')
            ->assertStatus(422);
    }

    public function test_sensitive_client_access_audit_entries_include_actor_target_and_context(): void
    {
        $admin = $this->user('Admin');
        $client = $this->user('Client');
        $organization = $this->organization('audit-context-client');
        $project = Project::factory()->create(['client_organization_id' => null]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/client-organizations', [
                'name' => 'Audit Context Co',
                'trusted_domain_policy' => ClientOrganization::POLICY_MANUAL_APPROVAL,
            ])
            ->assertCreated();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/projects/{$project->id}/client-organization", [
                'client_organization_id' => $organization->id,
            ])
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/client-organizations/{$organization->id}/domains", [
                'domain' => 'audit-context.example',
            ])
            ->assertCreated();

        $this->actingAs($admin, 'sanctum')
            ->deleteJson('/api/client-domains/' . ClientDomain::where('domain', 'audit-context.example')->value('id'))
            ->assertNoContent();

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/client-organizations/{$organization->id}/trusted-domain-policy", [
                'trusted_domain_policy' => ClientOrganization::POLICY_DOMAIN_AUTO_APPROVE,
            ])
            ->assertOk();

        $invitation = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/projects/{$project->id}/invitations", [
                'client_organization_id' => $organization->id,
                'email' => $client->email,
                'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            ]);
        $invitation->assertCreated();

        $token = collect(explode('&', parse_url($invitation->json('data.invitation_url'), PHP_URL_QUERY)))
            ->mapWithKeys(function (string $part) {
                [$key, $value] = explode('=', $part, 2);
                return [$key => $value];
            })
            ->get('token');

        $this->actingAs($client, 'sanctum')
            ->postJson('/api/project-invitations/accept', ['token' => $token])
            ->assertOk();

        $membership = ProjectMembership::where('project_id', $project->id)->where('user_id', $client->id)->firstOrFail();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$membership->id}/approve")
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$membership->id}/suspend")
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$membership->id}/restore")
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$membership->id}/remove")
            ->assertOk();

        $rejectMembership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);
        $expireMembership = ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $this->user('Client')->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_PENDING,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$rejectMembership->id}/reject")
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/project-memberships/{$expireMembership->id}/expire")
            ->assertOk();

        foreach ([
            'client_organization.created',
            'project.client_organization_updated',
            'client_domain.verified',
            'client_domain.removed',
            'trusted_domain_policy.updated',
            'project_invitation.created',
            'project_invitation.accepted',
            'project_membership.approved',
            'project_membership.suspended',
            'project_membership.restored',
            'project_membership.removed',
            'project_membership.rejected',
            'project_membership.expired',
        ] as $action) {
            $this->assertDatabaseHas('audit_logs', [
                'action' => $action,
                'actor_user_id' => $action === 'project_invitation.accepted' ? $client->id : $admin->id,
            ]);
        }

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'project_membership.removed',
            'entity_type' => 'project_membership',
            'entity_id' => $membership->id,
        ]);

        $removedLog = \App\Models\AuditLog::where('action', 'project_membership.removed')->firstOrFail();
        $this->assertSame($organization->id, $removedLog->metadata['client_organization_id']);
        $this->assertSame($project->id, $removedLog->metadata['project_id']);
        $this->assertSame($client->id, $removedLog->metadata['membership_user_id']);
        $this->assertSame(ProjectMembership::STATE_APPROVED, $removedLog->metadata['old_state']);
        $this->assertSame(ProjectMembership::STATE_REMOVED, $removedLog->metadata['new_state']);
    }

    private function clientVisibleTaskFixture(): array
    {
        $client = $this->user('Client');
        $admin = $this->user('Admin');
        $organization = $this->organization('resource-client');
        $project = Project::factory()->create(['client_organization_id' => $organization->id]);
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);
        $task = DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible' => true,
            'notes' => 'Internal note',
            'output' => 'Internal output',
            'responsible' => 'Project Manager',
            'support' => 'Internal support',
            'work_type' => 'support',
            'evidence' => 'Internal evidence',
            'root_cause' => 'Internal root cause',
            'resolution' => 'Internal resolution',
        ]);

        ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $client->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $admin->id,
        ]);

        return [$client, $task];
    }

    private function approvedMembership(ClientOrganization $organization, Project $project, User $client): ProjectMembership
    {
        return ProjectMembership::create([
            'client_organization_id' => $organization->id,
            'project_id' => $project->id,
            'user_id' => $client->id,
            'role' => ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => ProjectMembership::STATE_APPROVED,
            'approved_at' => now(),
            'approved_by_user_id' => $this->user('Admin')->id,
        ]);
    }

    private function clientVisibleSupportTask(ClientOrganization $organization, string $name): array
    {
        $project = Project::factory()->create([
            'name' => $name . ' Project',
            'client_organization_id' => $organization->id,
        ]);
        $module = Module::factory()->create(['project_id' => $project->id]);
        $activity = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);
        $task = DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'name' => $name,
            'work_type' => 'support',
            'client_visible' => true,
            'status' => 'in_progress',
        ]);

        return [$project, $task];
    }

    private function visibleAttachment(DetailedActivity $task, string $name): Attachment
    {
        $path = "attachments/{$task->id}/{$name}";
        Storage::disk('local')->put($path, 'fixture');

        return $task->attachments()->create([
            'uploader' => 'Internal User',
            'uploader_role' => 'Team Member',
            'uploaded_by_user_id' => null,
            'original_name' => $name,
            'stored_name' => $name,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'application/pdf',
            'size_bytes' => 128,
            'visibility' => Attachment::VISIBILITY_CLIENT_VISIBLE,
        ]);
    }

    private function clientNotification(DetailedActivity $task, string $eventKey): Notification
    {
        return Notification::create([
            'user_role' => 'Client',
            'type' => Notification::TYPE_MENTION,
            'severity' => Notification::SEVERITY_INFO,
            'title' => $task->name,
            'message' => $task->name . ' update',
            'detailed_activity_id' => $task->id,
            'event_key' => $eventKey,
            'is_read' => false,
        ]);
    }

    private function createInvitation(array $overrides = []): ProjectInvitation
    {
        return ProjectInvitation::create([
            'client_organization_id' => $overrides['client_organization_id'],
            'project_id' => $overrides['project_id'],
            'email' => $overrides['email'] ?? 'invitee@example.test',
            'email_domain' => $overrides['email_domain'] ?? 'example.test',
            'role' => $overrides['role'] ?? ProjectMembership::ROLE_CLIENT_VIEWER,
            'state' => $overrides['state'] ?? ProjectInvitation::STATE_PENDING,
            'token_hash' => $overrides['token_hash'],
            'invited_by_user_id' => $overrides['invited_by_user_id'],
            'expires_at' => $overrides['expires_at'],
        ]);
    }
}
