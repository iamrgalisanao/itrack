<?php

namespace Tests\Feature;

use App\Models\Attachment;
use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AttachmentTest extends TestCase
{
    use RefreshDatabase;

    private $project;
    private $detailedActivity;

    protected function setUp(): void
    {
        parent::setUp();

        // Create the task tree
        $project = Project::create([
            'name' => 'Test Project',
            'department' => 'IT'
        ]);
        $module = $project->modules()->create(['name' => 'Test Module']);
        $activity = $module->activities()->create(['name' => 'Test Activity']);
        $subActivity = $activity->subActivities()->create(['name' => 'Test Sub Activity']);
        $this->project = $project;
        // `client_visible => true` is REQUIRED, and its absence was hiding a
        // defect rather than testing one.
        //
        // The column defaults to false, so this fixture built a HIDDEN task --
        // and two tests below then asserted a Client could list its attachments
        // and download one. That is exactly the C2/M1 disclosure: a
        // client-visible attachment on a hidden task, reachable because nothing
        // asked the parent. The tests were encoding the bug as expected
        // behaviour, the same way ReportTest did before PR #14.
        //
        // Their intent -- "a Client with project access can reach a
        // client-visible attachment" -- is preserved; the task now actually is
        // client-visible, which is what that intent always assumed.
        $this->detailedActivity = $subActivity->detailedActivities()->create([
            'name' => 'Test Task',
            'client_visible' => true,
        ]);
    }

    /**
     * Helper to create an authenticated user for role-scoped requests.
     */
    private function createUser(string $role = 'Team Member', string $dept = 'IT'): User
    {
        return User::factory()->create([
            'name' => $role,
            'role' => $role,
            'department' => $dept,
        ]);
    }

    /**
     * 007-permission-hardening: Team Member/Client visibility is scoped to
     * explicit project_assignments rows now, not whole-department
     * membership — assign the acting user to $this->project so tests
     * exercising role/visibility behavior (not project-scoping itself)
     * still reach that behavior.
     */
    private function assignToProject(User $user): ProjectAssignment
    {
        return ProjectAssignment::create([
            'user_id'             => $user->id,
            'project_id'          => $this->project->id,
            'assigned_by_user_id' => $this->createUser('Admin')->id,
        ]);
    }

    /**
     * Helper to create a fake attachment record.
     */
    private function createAttachmentRecord(array $overrides = []): Attachment
    {
        return $this->detailedActivity->attachments()->create(array_merge([
            'uploader' => 'Admin',
            'uploader_role' => 'Admin',
            'original_name' => 'document.pdf',
            'stored_name' => 'uuid_document.pdf',
            'disk' => 'local',
            'path' => 'attachments/' . $this->detailedActivity->id . '/uuid_document.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => 1024,
            'visibility' => Attachment::VISIBILITY_INTERNAL,
        ], $overrides));
    }

    /**
     * Index tests: Scoped access for Client role.
     */
    public function test_index_scopes_attachments_for_client_role(): void
    {
        // 1. Create one internal and one client_visible attachment
        $this->createAttachmentRecord([
            'original_name' => 'internal.pdf',
            'visibility' => Attachment::VISIBILITY_INTERNAL,
        ]);
        $this->createAttachmentRecord([
            'original_name' => 'client.pdf',
            'visibility' => Attachment::VISIBILITY_CLIENT_VISIBLE,
        ]);

        // 2. Fetch as Project Manager
        $responsePM = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->getJson(route('detailed-activities.attachments.index', $this->detailedActivity));

        $responsePM->assertStatus(200);
        $responsePM->assertJsonCount(2);
        // path must be hidden
        $responsePM->assertJsonMissingPath('0.path');

        // 3. Fetch as Client
        $client = $this->createUser('Client');
        $this->assignToProject($client);
        $responseClient = $this->actingAs($client, 'sanctum')
            ->getJson(route('detailed-activities.attachments.index', $this->detailedActivity));

        $responseClient->assertStatus(200);
        $responseClient->assertJsonCount(1);
        $responseClient->assertJsonFragment(['original_name' => 'client.pdf']);
        $responseClient->assertJsonMissing(['original_name' => 'internal.pdf']);
    }

    /**
     * Store tests: Clients blocked from uploading.
     */
    public function test_client_cannot_upload_files(): void
    {
        Storage::fake('local');
        $file = UploadedFile::fake()->create('report.pdf', 100); // 100 KB

        $response = $this->actingAs($this->createUser('Client'), 'sanctum')
            ->postJson(route('detailed-activities.attachments.store', $this->detailedActivity), [
                'file' => $file,
                'visibility' => 'client_visible',
            ]);

        $response->assertStatus(403);
    }

    /**
     * Store tests: Accept valid uploads and sanitize filename.
     */
    public function test_authorized_user_can_upload_valid_file(): void
    {
        Storage::fake('local');
        // Unsafe characters (space) in filename to test sanitization
        $originalName = 'unsafe file.pdf';
        $file = UploadedFile::fake()->create($originalName, 100, 'application/pdf');

        $response = $this->actingAs($this->createUser('Project Manager'), 'sanctum')
            ->postJson(route('detailed-activities.attachments.store', $this->detailedActivity), [
                'file' => $file,
                'visibility' => Attachment::VISIBILITY_INTERNAL,
            ]);

        $response->assertStatus(201);
        $data = $response->json();

        // 1. Verify response properties (no path)
        $this->assertEquals('unsafe_file.pdf', $data['stored_name'] ?? null ? substr($data['stored_name'], 37) : null);
        $this->assertEquals($originalName, $data['original_name']);
        $this->assertArrayNotHasKey('path', $data);

        // 2. Verify stored on private local disk, NOT public disk
        $attachment = Attachment::findOrFail($data['id']);
        Storage::disk('local')->assertExists($attachment->path);
        $this->assertStringStartsWith('attachments/' . $this->detailedActivity->id . '/', $attachment->path);
    }

    /**
     * Store tests: File size constraint (100 MB).
     */
    public function test_upload_exceeding_size_limit_is_rejected(): void
    {
        Storage::fake('local');
        // 101 MB = 103424 KB (Laravel validation uses KB)
        $largeFile = UploadedFile::fake()->create('huge.zip', 101 * 1024);

        $response = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson(route('detailed-activities.attachments.store', $this->detailedActivity), [
                'file' => $largeFile,
                'visibility' => Attachment::VISIBILITY_INTERNAL,
            ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['file']);
    }

    /**
     * Store tests: Disallowed MIME types.
     */
    public function test_upload_disallowed_mime_type_is_rejected(): void
    {
        Storage::fake('local');
        $exeFile = UploadedFile::fake()->create('malicious.exe', 10, 'application/x-msdownload');

        $response = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->postJson(route('detailed-activities.attachments.store', $this->detailedActivity), [
                'file' => $exeFile,
                'visibility' => Attachment::VISIBILITY_INTERNAL,
            ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['file']);
    }

    /**
     * Download tests: Visibility gating.
     */
    public function test_client_cannot_download_internal_file(): void
    {
        $attachment = $this->createAttachmentRecord([
            'visibility' => Attachment::VISIBILITY_INTERNAL,
        ]);

        $response = $this->actingAs($this->createUser('Client'), 'sanctum')
            ->get(route('attachments.download', $attachment));

        $response->assertStatus(403);
    }

    /**
     * Download tests: Successful download.
     */
    public function test_authorized_user_can_download_file(): void
    {
        Storage::fake('local');
        $attachment = $this->createAttachmentRecord([
            'visibility' => Attachment::VISIBILITY_CLIENT_VISIBLE,
        ]);

        // Place file mock on disk
        Storage::disk('local')->put($attachment->path, 'file-contents');

        $client = $this->createUser('Client');
        $this->assignToProject($client);
        $response = $this->actingAs($client, 'sanctum')
            ->get(route('attachments.download', $attachment));

        $response->assertStatus(200);
        $this->assertEquals('file-contents', $response->streamedContent());
    }

    /**
     * Download tests: Missing file on disk returns 404.
     */
    public function test_download_missing_file_returns_404(): void
    {
        Storage::fake('local');
        $attachment = $this->createAttachmentRecord();

        // File is NOT on disk

        $response = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->get(route('attachments.download', $attachment));

        $response->assertStatus(404);
    }

    /**
     * Destroy tests: Roles and deletion limits.
     */
    public function test_only_permitted_roles_can_delete_attachments(): void
    {
        Storage::fake('local');
        
        // 1. Client and Dept Head cannot delete
        $attachment1 = $this->createAttachmentRecord();
        Storage::disk('local')->put($attachment1->path, 'data');
        $response = $this->actingAs($this->createUser('Client'), 'sanctum')
            ->deleteJson(route('attachments.destroy', $attachment1));
        $response->assertStatus(403);

        $response = $this->actingAs($this->createUser('Department Head'), 'sanctum')
            ->deleteJson(route('attachments.destroy', $attachment1));
        $response->assertStatus(403);

        // 2. Team Member cannot delete other's file
        $attachmentAdminFile = $this->createAttachmentRecord([
            'uploader_role' => 'Admin'
        ]);
        $response = $this->actingAs($this->createUser('Team Member'), 'sanctum')
            ->deleteJson(route('attachments.destroy', $attachmentAdminFile));
        $response->assertStatus(403);

        // 3. Team Member CAN delete their own file
        $teamMember = $this->createUser('Team Member');
        $this->assignToProject($teamMember);
        $attachmentMemberFile = $this->createAttachmentRecord([
            'uploader_role' => 'Team Member',
            'uploaded_by_user_id' => $teamMember->id,
        ]);
        Storage::disk('local')->put($attachmentMemberFile->path, 'data');
        $response = $this->actingAs($teamMember, 'sanctum')
            ->deleteJson(route('attachments.destroy', $attachmentMemberFile));
        $response->assertStatus(204);
        $this->assertDatabaseMissing('attachments', ['id' => $attachmentMemberFile->id]);
        Storage::disk('local')->assertMissing($attachmentMemberFile->path);

        // 4. Admin CAN delete any file
        $attachmentAnyFile = $this->createAttachmentRecord([
            'uploader_role' => 'Team Member'
        ]);
        Storage::disk('local')->put($attachmentAnyFile->path, 'data');
        $response = $this->actingAs($this->createUser('Admin'), 'sanctum')
            ->deleteJson(route('attachments.destroy', $attachmentAnyFile));
        $response->assertStatus(204);
        $this->assertDatabaseMissing('attachments', ['id' => $attachmentAnyFile->id]);
        Storage::disk('local')->assertMissing($attachmentAnyFile->path);
    }
}
