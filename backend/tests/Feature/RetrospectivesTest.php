<?php

namespace Tests\Feature;

use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\RetroEntry;
use App\Models\RetroEntryAttachment;
use App\Models\RetroEntryComment;
use App\Models\RetroEntryVote;
use App\Models\RetroSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class RetrospectivesTest extends TestCase
{
    use RefreshDatabase;

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function user(string $role, string $dept = 'IT'): User
    {
        return User::factory()->create([
            'role' => $role,
            'department' => $dept,
            'is_active' => true,
        ]);
    }

    private function assign(User $user, Project $project): ProjectAssignment
    {
        return ProjectAssignment::create([
            'user_id' => $user->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $this->user('Admin')->id,
        ]);
    }

    private function callJson($actor, string $method, string $url, array $payload = [])
    {
        return $this->actingAs($actor, 'sanctum')->json($method, $url, $payload);
    }

    private function makeSession(Project $project, ?User $creator = null): RetroSession
    {
        $creator ??= $this->user('Project Manager');

        return RetroSession::create([
            'project_id' => $project->id,
            'label' => 'Sprint 3',
            'created_by_user_id' => $creator->id,
        ]);
    }

    private function makeEntry(RetroSession $session, User $author, string $sentiment = 'keep'): RetroEntry
    {
        return RetroEntry::create([
            'retro_session_id' => $session->id,
            'author_user_id' => $author->id,
            'body' => 'Test entry',
            'sentiment' => $sentiment,
        ]);
    }

    // ─── POST /retro-sessions (create) ──────────────────────────────────────

    public function test_project_manager_can_create_a_session(): void
    {
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $this->assign($pm, $project);

        $response = $this->callJson($pm, 'POST', '/api/retro-sessions', [
            'project_id' => $project->id,
            'label' => 'Sprint 3',
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.label', 'Sprint 3');
        $response->assertJsonPath('data.project_id', $project->id);
    }

    public function test_department_head_cannot_create_a_session(): void
    {
        $depthead = $this->user('Department Head');
        $project = Project::factory()->create(['department' => 'IT']);

        $response = $this->callJson($depthead, 'POST', '/api/retro-sessions', [
            'project_id' => $project->id,
            'label' => 'Sprint 3',
        ]);

        $response->assertStatus(403);
    }

    public function test_client_cannot_create_a_session(): void
    {
        $client = $this->user('Client');
        $project = Project::factory()->create();

        $response = $this->callJson($client, 'POST', '/api/retro-sessions', [
            'project_id' => $project->id,
            'label' => 'Sprint 3',
        ]);

        $response->assertStatus(403);
    }

    public function test_team_member_cannot_create_a_session_for_an_unassigned_project(): void
    {
        $tm = $this->user('Team Member');
        $project = Project::factory()->create();
        // deliberately not assigned

        $response = $this->callJson($tm, 'POST', '/api/retro-sessions', [
            'project_id' => $project->id,
            'label' => 'Sprint 3',
        ]);

        $response->assertStatus(403);
    }

    // ─── PATCH /retro-sessions/{id} (rename, 014-retro-table-view Phase 8) ──

    public function test_non_creator_team_member_with_project_access_can_rename_a_session(): void
    {
        $pm = $this->user('Project Manager');
        $tm = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($tm, $project);
        $session = $this->makeSession($project, $pm); // created by $pm, not $tm

        $response = $this->callJson($tm, 'PATCH', "/api/retro-sessions/{$session->id}", ['label' => 'Renamed by Team Member']);

        $response->assertStatus(200);
        $response->assertJsonPath('data.label', 'Renamed by Team Member');
        $this->assertDatabaseHas('retro_sessions', ['id' => $session->id, 'label' => 'Renamed by Team Member']);
    }

    public function test_department_head_cannot_rename_a_session(): void
    {
        $depthead = $this->user('Department Head', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);
        $session = $this->makeSession($project);

        $response = $this->callJson($depthead, 'PATCH', "/api/retro-sessions/{$session->id}", ['label' => 'Hijacked']);

        $response->assertStatus(403);
    }

    public function test_user_without_project_access_cannot_rename_a_session(): void
    {
        $pm = $this->user('Project Manager');
        $outsider = $this->user('Team Member'); // deliberately not assigned
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);

        $response = $this->callJson($outsider, 'PATCH', "/api/retro-sessions/{$session->id}", ['label' => 'Hijacked']);

        $response->assertStatus(403);
    }

    public function test_renaming_a_session_to_an_empty_label_is_rejected(): void
    {
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);

        $response = $this->callJson($pm, 'PATCH', "/api/retro-sessions/{$session->id}", ['label' => '']);

        $response->assertStatus(422);
        $this->assertDatabaseHas('retro_sessions', ['id' => $session->id, 'label' => 'Sprint 3']);
    }

    // ─── GET /retro-sessions (list) ──────────────────────────────────────────

    public function test_can_view_role_lists_sessions_for_a_project(): void
    {
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $this->makeSession($project, $pm);
        $this->makeSession($project, $pm);

        $response = $this->callJson($pm, 'GET', "/api/retro-sessions?project_id={$project->id}");

        $response->assertStatus(200);
        $this->assertCount(2, $response->json('data'));
    }

    public function test_department_head_can_view_but_the_list_is_still_project_scoped(): void
    {
        $depthead = $this->user('Department Head', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);
        $this->makeSession($project);

        $response = $this->callJson($depthead, 'GET', "/api/retro-sessions?project_id={$project->id}");

        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
    }

    // ─── GET /retro-sessions/{id} (show + entries) ──────────────────────────

    public function test_show_returns_session_and_its_own_entries_only(): void
    {
        $pm = $this->user('Project Manager');
        $projectA = Project::factory()->create();
        $projectB = Project::factory()->create();
        $sessionA = $this->makeSession($projectA, $pm);
        $sessionB = $this->makeSession($projectB, $pm);

        RetroEntry::create([
            'retro_session_id' => $sessionA->id,
            'author_user_id' => $pm->id,
            'body' => 'Entry in session A',
            'sentiment' => 'keep',
        ]);
        RetroEntry::create([
            'retro_session_id' => $sessionB->id,
            'author_user_id' => $pm->id,
            'body' => 'Entry in session B',
            'sentiment' => 'keep',
        ]);

        $response = $this->callJson($pm, 'GET', "/api/retro-sessions/{$sessionA->id}");

        $response->assertStatus(200);
        $entries = $response->json('entries');
        $this->assertCount(1, $entries);
        $this->assertSame('Entry in session A', $entries[0]['body']);
    }

    public function test_team_member_without_project_access_cannot_view_session(): void
    {
        $tm = $this->user('Team Member');
        $project = Project::factory()->create();
        $session = $this->makeSession($project);
        // tm deliberately not assigned to $project

        $response = $this->callJson($tm, 'GET', "/api/retro-sessions/{$session->id}");

        $response->assertStatus(403);
    }

    // ─── POST /retro-sessions/{id}/entries (add entry) ──────────────────────

    public function test_team_member_can_add_an_entry_to_an_assigned_project_session(): void
    {
        $pm = $this->user('Project Manager');
        $tm = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($tm, $project);
        $session = $this->makeSession($project, $pm);

        $response = $this->callJson($tm, 'POST', "/api/retro-sessions/{$session->id}/entries", [
            'body' => 'We should automate the deploy step',
            'sentiment' => 'improve',
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.author', $tm->name);
        $response->assertJsonPath('data.author_id', $tm->id);
        $response->assertJsonPath('data.sentiment', 'improve');
    }

    public function test_entry_creation_ignores_client_supplied_author_id(): void
    {
        $tm = $this->user('Team Member');
        $otherUser = $this->user('Admin');
        $project = Project::factory()->create();
        $this->assign($tm, $project);
        $session = $this->makeSession($project);

        $response = $this->callJson($tm, 'POST', "/api/retro-sessions/{$session->id}/entries", [
            'body' => 'Test',
            'sentiment' => 'keep',
            'author_user_id' => $otherUser->id, // attempted spoof
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.author_id', $tm->id);
    }

    // ─── FR-004: sentiment enum when present (US2) ───────────────────────────

    /**
     * 014-retro-table-view Phase 8/FR-018 (research.md D7): supersedes the
     * prior "rejected without sentiment" expectation from 013 — Type is now
     * assigned from the table after creation, not required up front.
     */
    public function test_entry_creation_succeeds_without_sentiment_and_defaults_to_null(): void
    {
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);

        $response = $this->callJson($pm, 'POST', "/api/retro-sessions/{$session->id}/entries", [
            'body' => 'No Type yet',
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.sentiment', null);
        $this->assertDatabaseHas('retro_entries', ['body' => 'No Type yet', 'sentiment' => null]);
    }

    public function test_sentiment_can_be_set_via_patch_after_creation_with_none(): void
    {
        $pm = $this->user('Project Manager');
        $tm = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($tm, $project);
        $session = $this->makeSession($project, $pm);
        $created = $this->callJson($tm, 'POST', "/api/retro-sessions/{$session->id}/entries", ['body' => 'No Type yet']);
        $entryId = $created->json('data.id');

        $response = $this->callJson($tm, 'PATCH', "/api/retro-entries/{$entryId}", ['sentiment' => 'improve']);

        $response->assertStatus(200);
        $response->assertJsonPath('data.sentiment', 'improve');
        $this->assertDatabaseHas('retro_entries', ['id' => $entryId, 'sentiment' => 'improve']);
    }

    public function test_entry_creation_rejected_with_invalid_sentiment(): void
    {
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);

        $response = $this->callJson($pm, 'POST', "/api/retro-sessions/{$session->id}/entries", [
            'body' => 'Bad sentiment value',
            'sentiment' => 'angry',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['sentiment']);
    }

    // ─── POST /retro-entries/{id}/vote (toggle) ──────────────────────────────

    public function test_voting_toggles_and_vote_count_is_accurate(): void
    {
        $pm = $this->user('Project Manager');
        $tm = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($tm, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);

        $first = $this->callJson($tm, 'POST', "/api/retro-entries/{$entry->id}/vote");
        $first->assertStatus(200);
        $first->assertJsonPath('voted', true);
        $first->assertJsonPath('vote_count', 1);

        $this->assertDatabaseHas('retro_entry_votes', ['retro_entry_id' => $entry->id, 'user_id' => $tm->id]);

        $second = $this->callJson($tm, 'POST', "/api/retro-entries/{$entry->id}/vote");
        $second->assertStatus(200);
        $second->assertJsonPath('voted', false);
        $second->assertJsonPath('vote_count', 0);

        $this->assertDatabaseMissing('retro_entry_votes', ['retro_entry_id' => $entry->id, 'user_id' => $tm->id]);
    }

    public function test_vote_count_reflects_real_rows_not_a_separate_counter(): void
    {
        $pm = $this->user('Project Manager');
        $tm1 = $this->user('Team Member');
        $tm2 = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($tm1, $project);
        $this->assign($tm2, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);

        $this->callJson($tm1, 'POST', "/api/retro-entries/{$entry->id}/vote");
        $response = $this->callJson($tm2, 'POST', "/api/retro-entries/{$entry->id}/vote");

        $response->assertJsonPath('vote_count', 2);
        $this->assertSame(2, RetroEntryVote::where('retro_entry_id', $entry->id)->count());
    }

    public function test_client_cannot_vote(): void
    {
        $pm = $this->user('Project Manager');
        $client = $this->user('Client');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);

        $response = $this->callJson($client, 'POST', "/api/retro-entries/{$entry->id}/vote");

        $response->assertStatus(403);
    }

    // ─── GET /retro-sessions/{id} vote_summary (014-retro-table-view, US3) ──

    public function test_show_session_includes_accurate_vote_summary(): void
    {
        $pm = $this->user('Project Manager');
        $voterA = $this->user('Team Member');
        $voterB = $this->user('Team Member');
        $voterC = $this->user('Team Member');
        $project = Project::factory()->create();
        foreach ([$voterA, $voterB, $voterC] as $voter) {
            $this->assign($voter, $project);
        }
        $session = $this->makeSession($project, $pm);
        $entryOne = $this->makeEntry($session, $pm, 'keep');
        $entryTwo = $this->makeEntry($session, $pm, 'improve');

        // 5 votes total, 3 distinct voters: A votes both entries (2), B and
        // C each vote entryTwo once (2) — A must count once, not twice.
        $this->callJson($voterA, 'POST', "/api/retro-entries/{$entryOne->id}/vote");
        $this->callJson($voterA, 'POST', "/api/retro-entries/{$entryTwo->id}/vote");
        $this->callJson($voterB, 'POST', "/api/retro-entries/{$entryTwo->id}/vote");
        $this->callJson($voterC, 'POST', "/api/retro-entries/{$entryOne->id}/vote");
        $this->callJson($voterC, 'POST', "/api/retro-entries/{$entryTwo->id}/vote");

        $response = $this->callJson($pm, 'GET', "/api/retro-sessions/{$session->id}");

        $response->assertStatus(200);
        $response->assertJsonPath('vote_summary.total_votes', 5);
        $response->assertJsonPath('vote_summary.total_voters', 3);
    }

    public function test_show_session_vote_summary_is_zero_not_missing_when_no_votes(): void
    {
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $this->makeEntry($session, $pm);

        $response = $this->callJson($pm, 'GET', "/api/retro-sessions/{$session->id}");

        $response->assertStatus(200);
        $response->assertJsonPath('vote_summary.total_votes', 0);
        $response->assertJsonPath('vote_summary.total_voters', 0);
    }

    public function test_show_session_vote_summary_does_not_leak_across_sessions(): void
    {
        $pm = $this->user('Project Manager');
        $voter = $this->user('Team Member');
        $projectA = Project::factory()->create();
        $projectB = Project::factory()->create();
        $this->assign($voter, $projectA);
        $this->assign($voter, $projectB);
        $sessionA = $this->makeSession($projectA, $pm);
        $sessionB = $this->makeSession($projectB, $pm);
        $entryA = $this->makeEntry($sessionA, $pm);
        $entryB = $this->makeEntry($sessionB, $pm);

        $this->callJson($voter, 'POST', "/api/retro-entries/{$entryA->id}/vote");

        $responseA = $this->callJson($pm, 'GET', "/api/retro-sessions/{$sessionA->id}");
        $responseB = $this->callJson($pm, 'GET', "/api/retro-sessions/{$sessionB->id}");

        $responseA->assertJsonPath('vote_summary.total_votes', 1);
        $responseB->assertJsonPath('vote_summary.total_votes', 0);
    }

    public function test_client_still_denied_show_session_after_vote_summary_added(): void
    {
        $pm = $this->user('Project Manager');
        $client = $this->user('Client');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);

        $response = $this->callJson($client, 'GET', "/api/retro-sessions/{$session->id}");

        $response->assertStatus(403);
    }

    public function test_unauthenticated_still_denied_show_session_after_vote_summary_added(): void
    {
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);

        $response = $this->json('GET', "/api/retro-sessions/{$session->id}");

        $response->assertStatus(401);
    }

    // ─── PATCH /retro-entries/{id} ────────────────────────────────────────────

    public function test_author_can_edit_their_own_entry(): void
    {
        $pm = $this->user('Project Manager');
        $tm = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($tm, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $tm);

        $response = $this->callJson($tm, 'PATCH', "/api/retro-entries/{$entry->id}", ['body' => 'Updated text']);

        $response->assertStatus(200);
        $response->assertJsonPath('data.body', 'Updated text');
    }

    public function test_non_author_team_member_cannot_edit_or_delete_someone_elses_entry(): void
    {
        $pm = $this->user('Project Manager');
        $author = $this->user('Team Member');
        $other = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $this->assign($other, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $author);

        $editResponse = $this->callJson($other, 'PATCH', "/api/retro-entries/{$entry->id}", ['body' => 'Hijacked']);
        $editResponse->assertStatus(403);

        $deleteResponse = $this->callJson($other, 'DELETE', "/api/retro-entries/{$entry->id}");
        $deleteResponse->assertStatus(403);

        $this->assertDatabaseHas('retro_entries', ['id' => $entry->id, 'body' => 'Test entry']);
    }

    public function test_admin_and_pm_can_moderate_any_entry(): void
    {
        $author = $this->user('Team Member');
        $admin = $this->user('Admin');
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $session = $this->makeSession($project, $author);
        $entryForAdmin = $this->makeEntry($session, $author);
        $entryForPm = $this->makeEntry($session, $author);

        $adminEdit = $this->callJson($admin, 'PATCH', "/api/retro-entries/{$entryForAdmin->id}", ['body' => 'Edited by admin']);
        $adminEdit->assertStatus(200);

        $pmDelete = $this->callJson($pm, 'DELETE', "/api/retro-entries/{$entryForPm->id}");
        $pmDelete->assertStatus(204);
        $this->assertDatabaseMissing('retro_entries', ['id' => $entryForPm->id]);
    }

    /**
     * F1 (speckit-analyze finding): authorship alone must not survive losing
     * project access — a project-access re-check is required independently
     * of the author_user_id === user.id check.
     */
    public function test_author_who_lost_project_access_cannot_edit_or_delete_their_entry(): void
    {
        $pm = $this->user('Project Manager');
        $author = $this->user('Team Member');
        $project = Project::factory()->create();
        $assignment = $this->assign($author, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $author);

        // Revoke the author's project access.
        $assignment->delete();

        $editResponse = $this->callJson($author, 'PATCH', "/api/retro-entries/{$entry->id}", ['body' => 'Should be denied']);
        $editResponse->assertStatus(403);

        $deleteResponse = $this->callJson($author, 'DELETE', "/api/retro-entries/{$entry->id}");
        $deleteResponse->assertStatus(403);
    }

    // ─── is_repeating flag (014-retro-table-view, US2) ───────────────────────

    public function test_author_can_toggle_is_repeating_on_their_own_entry(): void
    {
        $pm = $this->user('Project Manager');
        $tm = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($tm, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $tm);

        $response = $this->callJson($tm, 'PATCH', "/api/retro-entries/{$entry->id}", ['is_repeating' => true]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.is_repeating', true);
        $this->assertDatabaseHas('retro_entries', ['id' => $entry->id, 'is_repeating' => true]);
    }

    public function test_non_author_team_member_cannot_toggle_is_repeating_on_someone_elses_entry(): void
    {
        $pm = $this->user('Project Manager');
        $author = $this->user('Team Member');
        $other = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $this->assign($other, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $author);

        $response = $this->callJson($other, 'PATCH', "/api/retro-entries/{$entry->id}", ['is_repeating' => true]);

        $response->assertStatus(403);
        $this->assertDatabaseHas('retro_entries', ['id' => $entry->id, 'is_repeating' => false]);
    }

    public function test_admin_and_pm_can_toggle_is_repeating_on_an_entry_they_did_not_author(): void
    {
        $author = $this->user('Team Member');
        $admin = $this->user('Admin');
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $session = $this->makeSession($project, $author);
        $entryForAdmin = $this->makeEntry($session, $author);
        $entryForPm = $this->makeEntry($session, $author);

        $adminResponse = $this->callJson($admin, 'PATCH', "/api/retro-entries/{$entryForAdmin->id}", ['is_repeating' => true]);
        $adminResponse->assertStatus(200);
        $adminResponse->assertJsonPath('data.is_repeating', true);

        $pmResponse = $this->callJson($pm, 'PATCH', "/api/retro-entries/{$entryForPm->id}", ['is_repeating' => true]);
        $pmResponse->assertStatus(200);
        $pmResponse->assertJsonPath('data.is_repeating', true);
    }

    /**
     * speckit-analyze finding, mirrors 013's F1/F2 regression style: a
     * canWrite() user with project access but who is neither the author nor
     * Admin/PM must be denied on is_repeating exactly as on body/sentiment —
     * it must not be reachable via the looser owner_user_id-style path.
     */
    public function test_is_repeating_cannot_be_set_through_the_unrestricted_owner_assignment_path(): void
    {
        $pm = $this->user('Project Manager');
        $author = $this->user('Team Member');
        $other = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $this->assign($other, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $author);

        // $other can legally assign owner (US4) but must still be denied
        // when the same request also carries is_repeating.
        $response = $this->callJson($other, 'PATCH', "/api/retro-entries/{$entry->id}", [
            'owner_user_id' => $other->id,
            'is_repeating' => true,
        ]);

        $response->assertStatus(403);
        $this->assertDatabaseHas('retro_entries', ['id' => $entry->id, 'is_repeating' => false, 'owner_user_id' => null]);
    }

    /**
     * FR-008 (speckit-analyze finding C2): toggling is_repeating must not
     * alter any other field on the entry.
     */
    public function test_toggling_is_repeating_leaves_other_fields_unchanged(): void
    {
        $pm = $this->user('Project Manager');
        $tm = $this->user('Team Member');
        $secondTm = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($tm, $project);
        $this->assign($secondTm, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $tm);
        $entry->update(['owner_user_id' => $secondTm->id]);
        $this->callJson($secondTm, 'POST', "/api/retro-entries/{$entry->id}/vote");

        $response = $this->callJson($tm, 'PATCH', "/api/retro-entries/{$entry->id}", ['is_repeating' => true]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('retro_entries', [
            'id' => $entry->id,
            'body' => 'Test entry',
            'sentiment' => 'keep',
            'owner_user_id' => $secondTm->id,
            'is_repeating' => true,
        ]);
        $this->assertSame(1, RetroEntryVote::where('retro_entry_id', $entry->id)->count());
    }

    // ─── Owner assignment (US4) ──────────────────────────────────────────────

    public function test_any_canwrite_user_can_assign_reassign_and_clear_owner(): void
    {
        $pm = $this->user('Project Manager');
        $tm = $this->user('Team Member');
        $secondTm = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($tm, $project);
        $this->assign($secondTm, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);

        $assignResponse = $this->callJson($tm, 'PATCH', "/api/retro-entries/{$entry->id}", ['owner_user_id' => $tm->id]);
        $assignResponse->assertStatus(200);
        $assignResponse->assertJsonPath('data.owner_id', $tm->id);

        $reassignResponse = $this->callJson($tm, 'PATCH', "/api/retro-entries/{$entry->id}", ['owner_user_id' => $secondTm->id]);
        $reassignResponse->assertJsonPath('data.owner_id', $secondTm->id);

        $clearResponse = $this->callJson($tm, 'PATCH', "/api/retro-entries/{$entry->id}", ['owner_user_id' => null]);
        $clearResponse->assertJsonPath('data.owner_id', null);
    }

    public function test_non_author_can_assign_owner_even_though_they_cannot_edit_body(): void
    {
        $pm = $this->user('Project Manager');
        $author = $this->user('Team Member');
        $other = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $this->assign($other, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $author);

        $response = $this->callJson($other, 'PATCH', "/api/retro-entries/{$entry->id}", ['owner_user_id' => $other->id]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.owner_id', $other->id);
    }

    /**
     * F2 (speckit-analyze finding): the owner target must actually have
     * project access — not merely be any valid user ID.
     */
    public function test_owner_assignment_rejected_when_target_has_no_project_access(): void
    {
        $pm = $this->user('Project Manager');
        $outsider = $this->user('Team Member'); // deliberately not assigned to $project
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);

        $response = $this->callJson($pm, 'PATCH', "/api/retro-entries/{$entry->id}", ['owner_user_id' => $outsider->id]);

        $response->assertStatus(422);
    }

    // ─── GET/POST /retro-entries/{id}/comments (015-retro-entry-context) ─────

    public function test_write_capable_non_author_can_post_a_comment(): void
    {
        $pm = $this->user('Project Manager');
        $author = $this->user('Team Member');
        $commenter = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $this->assign($commenter, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $author);

        $response = $this->callJson($commenter, 'POST', "/api/retro-entries/{$entry->id}/comments", ['body' => 'Adding some context here.']);

        $response->assertStatus(201);
        $response->assertJsonPath('data.body', 'Adding some context here.');
        $response->assertJsonPath('data.author_id', $commenter->id);
        $this->assertDatabaseHas('retro_entry_comments', [
            'retro_entry_id' => $entry->id,
            'author_user_id' => $commenter->id,
            'body' => 'Adding some context here.',
        ]);
    }

    public function test_any_internal_role_can_list_comments_chronologically(): void
    {
        $pm = $this->user('Project Manager');
        $depthead = $this->user('Department Head', 'IT');
        $project = Project::factory()->create(['department' => 'IT']);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);
        $this->callJson($pm, 'POST', "/api/retro-entries/{$entry->id}/comments", ['body' => 'First']);
        $this->callJson($pm, 'POST', "/api/retro-entries/{$entry->id}/comments", ['body' => 'Second']);

        $response = $this->callJson($depthead, 'GET', "/api/retro-entries/{$entry->id}/comments");

        $response->assertStatus(200);
        $this->assertCount(2, $response->json('data'));
        $this->assertSame('First', $response->json('data.0.body'));
        $this->assertSame('Second', $response->json('data.1.body'));
    }

    public function test_client_denied_on_comment_endpoints(): void
    {
        $pm = $this->user('Project Manager');
        $client = $this->user('Client');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);

        $this->callJson($client, 'GET', "/api/retro-entries/{$entry->id}/comments")->assertStatus(403);
        $this->callJson($client, 'POST', "/api/retro-entries/{$entry->id}/comments", ['body' => 'x'])->assertStatus(403);
    }

    /**
     * Separate from the Client-denial test above — `callJson()` calls
     * `actingAs()`, which persists across requests within a test method, so
     * mixing an authenticated call with a bare unauthenticated one in the
     * same test would silently still be "acting as" the prior user.
     */
    public function test_unauthenticated_denied_on_comment_endpoints(): void
    {
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);

        $this->json('GET', "/api/retro-entries/{$entry->id}/comments")->assertStatus(401);
        $this->json('POST', "/api/retro-entries/{$entry->id}/comments", ['body' => 'x'])->assertStatus(401);
    }

    public function test_comment_endpoints_denied_without_project_access(): void
    {
        $pm = $this->user('Project Manager');
        $outsider = $this->user('Team Member'); // deliberately not assigned
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);

        $this->callJson($outsider, 'GET', "/api/retro-entries/{$entry->id}/comments")->assertStatus(403);
        $this->callJson($outsider, 'POST', "/api/retro-entries/{$entry->id}/comments", ['body' => 'x'])->assertStatus(403);
    }

    // ─── GET/POST /retro-entries/{id}/attachments, download, delete ─────────

    public function test_write_capable_user_can_upload_an_allowed_attachment(): void
    {
        Storage::fake('local');
        $pm = $this->user('Project Manager');
        $uploader = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($uploader, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);
        $file = UploadedFile::fake()->create('screenshot.png', 100, 'image/png');

        $response = $this->actingAs($uploader, 'sanctum')
            ->postJson("/api/retro-entries/{$entry->id}/attachments", ['file' => $file]);

        $response->assertStatus(201);
        $response->assertJsonPath('data.original_name', 'screenshot.png');
        $response->assertJsonMissingPath('data.path');
        $attachment = RetroEntryAttachment::first();
        Storage::disk('local')->assertExists($attachment->getRawOriginal('path'));
    }

    public function test_disallowed_mime_type_rejected_and_nothing_stored(): void
    {
        Storage::fake('local');
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);
        $file = UploadedFile::fake()->create('malware.exe', 10, 'application/x-msdownload');

        $response = $this->actingAs($pm, 'sanctum')
            ->postJson("/api/retro-entries/{$entry->id}/attachments", ['file' => $file]);

        $response->assertStatus(422);
        $this->assertSame(0, RetroEntryAttachment::count());
        Storage::disk('local')->assertDirectoryEmpty("retro-entry-attachments/{$entry->id}");
    }

    public function test_oversized_upload_rejected(): void
    {
        Storage::fake('local');
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);
        $file = UploadedFile::fake()->create('big.pdf', 102401, 'application/pdf'); // just over 100MB

        $response = $this->actingAs($pm, 'sanctum')
            ->postJson("/api/retro-entries/{$entry->id}/attachments", ['file' => $file]);

        $response->assertStatus(422);
        $this->assertSame(0, RetroEntryAttachment::count());
    }

    public function test_download_returns_original_filename_not_stored_name(): void
    {
        Storage::fake('local');
        $pm = $this->user('Project Manager');
        $viewer = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($viewer, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);
        $file = UploadedFile::fake()->create('my report.pdf', 50, 'application/pdf');
        $upload = $this->actingAs($pm, 'sanctum')
            ->postJson("/api/retro-entries/{$entry->id}/attachments", ['file' => $file]);
        $attachmentId = $upload->json('data.id');

        $response = $this->actingAs($viewer, 'sanctum')
            ->get("/api/retro-entry-attachments/{$attachmentId}/download");

        $response->assertStatus(200);
        $response->assertHeader('content-disposition');
        $this->assertStringContainsString('my report.pdf', $response->headers->get('content-disposition'));
    }

    public function test_uploader_can_delete_their_own_attachment(): void
    {
        Storage::fake('local');
        $pm = $this->user('Project Manager');
        $uploader = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($uploader, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);
        $file = UploadedFile::fake()->create('mine.pdf', 50, 'application/pdf');
        $upload = $this->actingAs($uploader, 'sanctum')
            ->postJson("/api/retro-entries/{$entry->id}/attachments", ['file' => $file]);
        $attachment = RetroEntryAttachment::findOrFail($upload->json('data.id'));
        $path = $attachment->getRawOriginal('path');

        $response = $this->callJson($uploader, 'DELETE', "/api/retro-entry-attachments/{$attachment->id}");

        $response->assertStatus(204);
        $this->assertDatabaseMissing('retro_entry_attachments', ['id' => $attachment->id]);
        Storage::disk('local')->assertMissing($path);
    }

    /**
     * Non-uploader, non-Admin/PM — even the entry's own author — is denied
     * (contracts/retro-entry-context-api.md: evaluated against the
     * attachment's uploader, not the entry's author).
     */
    public function test_non_uploader_non_moderator_cannot_delete_attachment_even_as_entry_author(): void
    {
        Storage::fake('local');
        $pm = $this->user('Project Manager');
        $author = $this->user('Team Member');
        $uploader = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $this->assign($uploader, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $author);
        $file = UploadedFile::fake()->create('theirs.pdf', 50, 'application/pdf');
        $upload = $this->actingAs($uploader, 'sanctum')
            ->postJson("/api/retro-entries/{$entry->id}/attachments", ['file' => $file]);
        $attachment = RetroEntryAttachment::findOrFail($upload->json('data.id'));

        $response = $this->callJson($author, 'DELETE', "/api/retro-entry-attachments/{$attachment->id}");

        $response->assertStatus(403);
        $this->assertDatabaseHas('retro_entry_attachments', ['id' => $attachment->id]);
    }

    public function test_admin_and_pm_can_delete_attachment_regardless_of_uploader(): void
    {
        Storage::fake('local');
        $pm = $this->user('Project Manager');
        $admin = $this->user('Admin');
        $uploader = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($uploader, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);
        $file = UploadedFile::fake()->create('file.pdf', 50, 'application/pdf');
        $upload = $this->actingAs($uploader, 'sanctum')
            ->postJson("/api/retro-entries/{$entry->id}/attachments", ['file' => $file]);
        $attachment = RetroEntryAttachment::findOrFail($upload->json('data.id'));

        $response = $this->callJson($admin, 'DELETE', "/api/retro-entry-attachments/{$attachment->id}");

        $response->assertStatus(204);
    }

    public function test_client_denied_on_attachment_endpoints(): void
    {
        Storage::fake('local');
        $pm = $this->user('Project Manager');
        $client = $this->user('Client');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);
        $file = UploadedFile::fake()->create('x.pdf', 10, 'application/pdf');

        $this->callJson($client, 'GET', "/api/retro-entries/{$entry->id}/attachments")->assertStatus(403);
        $this->actingAs($client, 'sanctum')
            ->postJson("/api/retro-entries/{$entry->id}/attachments", ['file' => $file])
            ->assertStatus(403);
    }

    /**
     * Separate test method — see the analogous comment note on
     * test_unauthenticated_denied_on_comment_endpoints().
     */
    public function test_unauthenticated_denied_on_attachment_endpoints(): void
    {
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);

        $this->json('GET', "/api/retro-entries/{$entry->id}/attachments")->assertStatus(401);
    }

    public function test_attachment_endpoints_denied_without_project_access(): void
    {
        Storage::fake('local');
        $pm = $this->user('Project Manager');
        $outsider = $this->user('Team Member'); // deliberately not assigned
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);
        $file = UploadedFile::fake()->create('x.pdf', 10, 'application/pdf');

        $this->callJson($outsider, 'GET', "/api/retro-entries/{$entry->id}/attachments")->assertStatus(403);
        $this->actingAs($outsider, 'sanctum')
            ->postJson("/api/retro-entries/{$entry->id}/attachments", ['file' => $file])
            ->assertStatus(403);
    }

    // ─── PATCH /retro-entries/{id} decision field (015-retro-entry-context) ──

    public function test_author_can_record_a_decision(): void
    {
        $pm = $this->user('Project Manager');
        $author = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $author);

        $response = $this->callJson($author, 'PATCH', "/api/retro-entries/{$entry->id}", [
            'decision' => 'Assign a reviewer immediately when a PR opens.',
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('data.decision', 'Assign a reviewer immediately when a PR opens.');
        $this->assertDatabaseHas('retro_entries', ['id' => $entry->id, 'decision' => 'Assign a reviewer immediately when a PR opens.']);
    }

    public function test_admin_and_pm_can_record_a_decision_on_an_entry_they_did_not_author(): void
    {
        $author = $this->user('Team Member');
        $admin = $this->user('Admin');
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $session = $this->makeSession($project, $author);
        $entryForAdmin = $this->makeEntry($session, $author);
        $entryForPm = $this->makeEntry($session, $author);

        $adminResponse = $this->callJson($admin, 'PATCH', "/api/retro-entries/{$entryForAdmin->id}", ['decision' => 'Keep as is.']);
        $adminResponse->assertStatus(200);

        $pmResponse = $this->callJson($pm, 'PATCH', "/api/retro-entries/{$entryForPm->id}", ['decision' => 'Discuss further.']);
        $pmResponse->assertStatus(200);
    }

    public function test_non_author_non_moderator_cannot_record_a_decision(): void
    {
        $pm = $this->user('Project Manager');
        $author = $this->user('Team Member');
        $other = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $this->assign($other, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $author);

        $response = $this->callJson($other, 'PATCH', "/api/retro-entries/{$entry->id}", ['decision' => 'Hijacked decision']);

        $response->assertStatus(403);
        $this->assertDatabaseHas('retro_entries', ['id' => $entry->id, 'decision' => null]);
    }

    /**
     * 013's F1 pattern, applied to the decision field: authorship alone
     * does not survive losing project access.
     */
    public function test_author_who_lost_project_access_cannot_record_a_decision(): void
    {
        $pm = $this->user('Project Manager');
        $author = $this->user('Team Member');
        $project = Project::factory()->create();
        $assignment = $this->assign($author, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $author);

        $assignment->delete();

        $response = $this->callJson($author, 'PATCH', "/api/retro-entries/{$entry->id}", ['decision' => 'Should be denied']);

        $response->assertStatus(403);
    }

    public function test_setting_decision_leaves_body_unchanged(): void
    {
        $pm = $this->user('Project Manager');
        $author = $this->user('Team Member');
        $project = Project::factory()->create();
        $this->assign($author, $project);
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $author);

        $this->callJson($author, 'PATCH', "/api/retro-entries/{$entry->id}", ['decision' => 'A decision.']);

        $this->assertDatabaseHas('retro_entries', ['id' => $entry->id, 'body' => 'Test entry', 'decision' => 'A decision.']);
    }

    // ─── Cascade delete cleanup (speckit-analyze finding C1) ─────────────────

    public function test_deleting_entry_removes_its_comments_and_attachments(): void
    {
        Storage::fake('local');
        $pm = $this->user('Project Manager');
        $project = Project::factory()->create();
        $session = $this->makeSession($project, $pm);
        $entry = $this->makeEntry($session, $pm);

        $comment = $entry->comments()->create(['author_user_id' => $pm->id, 'body' => 'A comment']);
        $file = UploadedFile::fake()->create('evidence.png', 50, 'image/png');
        $upload = $this->actingAs($pm, 'sanctum')
            ->postJson("/api/retro-entries/{$entry->id}/attachments", ['file' => $file]);
        $attachment = RetroEntryAttachment::findOrFail($upload->json('data.id'));
        $path = $attachment->getRawOriginal('path');

        $this->callJson($pm, 'DELETE', "/api/retro-entries/{$entry->id}")->assertStatus(204);

        $this->assertDatabaseMissing('retro_entry_comments', ['id' => $comment->id]);
        $this->assertDatabaseMissing('retro_entry_attachments', ['id' => $attachment->id]);
        Storage::disk('local')->assertMissing($path);
    }
}
