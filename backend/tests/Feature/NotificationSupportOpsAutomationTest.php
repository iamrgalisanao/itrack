<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\DetailedActivity;
use App\Models\Module;
use App\Models\Notification;
use App\Models\Project;
use App\Models\SubActivity;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Support Ops Automation (005) — the three new notification entry types
 * (support_overdue, support_daily_summary, support_weekly_report) and the
 * retrieval/ownership correction they required (see spec.md's Recipient
 * model, FR-006, SC-005). Existing notification behavior is covered by
 * tests/Feature/NotificationTest.php and must remain unaffected — see
 * test_legacy_notification_types_remain_role_scoped_after_correction below
 * for a direct proof alongside that file's own full suite.
 */
class NotificationSupportOpsAutomationTest extends TestCase
{
    use RefreshDatabase;

    private function createUser(?string $role, ?string $department = 'IT'): User
    {
        return User::factory()->create(['role' => $role, 'department' => $department]);
    }

    private function makeIssue(int $projectId, array $overrides = []): DetailedActivity
    {
        $module      = Module::factory()->create(['project_id' => $projectId]);
        $activity    = Activity::factory()->create(['module_id' => $module->id]);
        $subActivity = SubActivity::factory()->create(['activity_id' => $activity->id]);

        return DetailedActivity::factory()->create([
            'sub_activity_id' => $subActivity->id,
            'client_visible'  => false,
            'work_type'       => 'support',
            'status'          => 'in_progress',
            ...$overrides,
        ]);
    }

    private function endpoint(): string
    {
        return '/api/notifications';
    }

    // ─── Foundational: retrieval/ownership three-case matrix (T001-T003) ───

    public function test_get_notifications_three_case_recipient_matrix(): void
    {
        $me = $this->createUser('Team Member', 'IT');
        $sameRoleOther = $this->createUser('Team Member', 'IT');

        $mine = Notification::create([
            'user_role' => 'Team Member',
            'recipient_user_id' => $me->id,
            'type' => 'support_daily_summary',
            'title' => 'Mine',
            'message' => 'Mine',
        ]);
        $othersIndividual = Notification::create([
            'user_role' => 'Team Member',
            'recipient_user_id' => $sameRoleOther->id,
            'type' => 'support_daily_summary',
            'title' => 'Theirs',
            'message' => 'Theirs',
        ]);
        $legacyRoleWide = Notification::create([
            'user_role' => 'Team Member',
            'recipient_user_id' => null,
            'type' => 'assignment',
            'title' => 'Legacy',
            'message' => 'Legacy',
        ]);

        $res = $this->actingAs($me, 'sanctum')->getJson($this->endpoint());

        $res->assertOk();
        $ids = collect($res->json('notifications'))->pluck('id');
        $this->assertTrue($ids->contains($mine->id));
        $this->assertFalse($ids->contains($othersIndividual->id));
        $this->assertTrue($ids->contains($legacyRoleWide->id));
    }

    public function test_mark_as_read_three_case_recipient_matrix(): void
    {
        $me = $this->createUser('Team Member', 'IT');
        $sameRoleOther = $this->createUser('Team Member', 'IT');

        $mine = Notification::create([
            'user_role' => 'Team Member', 'recipient_user_id' => $me->id,
            'type' => 'support_daily_summary', 'title' => 'Mine', 'message' => 'Mine',
        ]);
        $othersIndividual = Notification::create([
            'user_role' => 'Team Member', 'recipient_user_id' => $sameRoleOther->id,
            'type' => 'support_daily_summary', 'title' => 'Theirs', 'message' => 'Theirs',
        ]);
        $legacyRoleWide = Notification::create([
            'user_role' => 'Team Member', 'recipient_user_id' => null,
            'type' => 'assignment', 'title' => 'Legacy', 'message' => 'Legacy',
        ]);

        $this->actingAs($me, 'sanctum')->putJson("/api/notifications/{$mine->id}/read")->assertOk();
        $this->actingAs($me, 'sanctum')->putJson("/api/notifications/{$othersIndividual->id}/read")->assertStatus(403);
        $this->actingAs($me, 'sanctum')->putJson("/api/notifications/{$legacyRoleWide->id}/read")->assertOk();

        $this->assertTrue((bool) $mine->fresh()->is_read);
        $this->assertFalse((bool) $othersIndividual->fresh()->is_read);
        $this->assertTrue((bool) $legacyRoleWide->fresh()->is_read);
    }

    public function test_mark_all_as_read_three_case_recipient_matrix(): void
    {
        $me = $this->createUser('Team Member', 'IT');
        $sameRoleOther = $this->createUser('Team Member', 'IT');

        $mine = Notification::create([
            'user_role' => 'Team Member', 'recipient_user_id' => $me->id,
            'type' => 'support_daily_summary', 'title' => 'Mine', 'message' => 'Mine',
        ]);
        $othersIndividual = Notification::create([
            'user_role' => 'Team Member', 'recipient_user_id' => $sameRoleOther->id,
            'type' => 'support_daily_summary', 'title' => 'Theirs', 'message' => 'Theirs',
        ]);
        $legacyRoleWide = Notification::create([
            'user_role' => 'Team Member', 'recipient_user_id' => null,
            'type' => 'assignment', 'title' => 'Legacy', 'message' => 'Legacy',
        ]);

        $this->actingAs($me, 'sanctum')->postJson('/api/notifications/read-all')->assertOk();

        $this->assertTrue((bool) $mine->fresh()->is_read);
        $this->assertFalse((bool) $othersIndividual->fresh()->is_read);
        $this->assertTrue((bool) $legacyRoleWide->fresh()->is_read);
    }

    // ─── Foundational: legacy notification regression (T008) ───────────────

    public function test_legacy_notification_types_remain_role_scoped_after_correction(): void
    {
        $tm1 = $this->createUser('Team Member', 'IT');
        $tm2 = $this->createUser('Team Member', 'Finance');

        $legacy = Notification::create([
            'user_role' => 'Team Member', 'recipient_user_id' => null,
            'type' => 'mention', 'title' => 'You were mentioned', 'message' => 'Test',
        ]);

        foreach ([$tm1, $tm2] as $viewer) {
            $res = $this->actingAs($viewer, 'sanctum')->getJson($this->endpoint());
            $res->assertOk();
            $this->assertTrue(collect($res->json('notifications'))->pluck('id')->contains($legacy->id));
        }
    }

    // ─── US1: overdue entry eligibility, dedup, urgency, scoping (T009-T012) ───

    public function test_overdue_entry_eligibility_matrix(): void
    {
        $project = Project::factory()->create(['department' => 'IT']);
        $issue = $this->makeIssue($project->id, [
            'responsible' => 'PFC', // resolves to Team Member
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subHours(2), // stale
        ]);

        $admin = $this->createUser('Admin', 'Marketing');
        $pm = $this->createUser('Project Manager', 'Marketing');
        $matchingTm = $this->createUser('Team Member', 'IT'); // role matches responsible + can access project
        $wrongRoleTm = $this->createUser('Department Head', 'IT'); // access, but role doesn't match responsible
        $wrongDeptTm = $this->createUser('Team Member', 'Finance'); // role matches, but no project access

        // 007-permission-hardening: Team Member project access is now an
        // explicit assignment, not department membership — assign
        // $matchingTm so this test still exercises "role matches AND has
        // project access," not project-scoping itself. $wrongDeptTm stays
        // unassigned — still correctly ineligible for "no project access,"
        // just via assignment now instead of department.
        \App\Models\ProjectAssignment::create([
            'user_id' => $matchingTm->id,
            'project_id' => $project->id,
            'assigned_by_user_id' => $admin->id,
        ]);

        foreach ([$admin, $pm, $matchingTm] as $eligible) {
            $res = $this->actingAs($eligible, 'sanctum')->getJson($this->endpoint());
            $res->assertOk();
            $types = collect($res->json('notifications'))->pluck('type');
            $this->assertTrue($types->contains('support_overdue'), get_class($eligible) . ' role ' . $eligible->role . ' should be eligible');
        }

        foreach ([$wrongRoleTm, $wrongDeptTm] as $ineligible) {
            $res = $this->actingAs($ineligible, 'sanctum')->getJson($this->endpoint());
            $res->assertOk();
            $types = collect($res->json('notifications'))->pluck('type');
            $this->assertFalse($types->contains('support_overdue'), 'role ' . $ineligible->role . ' should not be eligible');
        }
    }

    public function test_overdue_entry_is_deduplicated(): void
    {
        $project = Project::factory()->create();
        $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subHours(2),
        ]);

        $admin = $this->createUser('Admin');
        $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());
        $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());

        $this->assertEquals(1, Notification::where('type', 'support_overdue')->where('recipient_user_id', $admin->id)->count());
    }

    public function test_overdue_entry_urgency_clears_without_deletion(): void
    {
        $project = Project::factory()->create();
        $issue = $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subHours(2),
        ]);

        $admin = $this->createUser('Admin');
        $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());

        $this->assertEquals(1, Notification::where('type', 'support_overdue')->count());

        // Clear the staleness
        $issue->update(['last_client_update_at' => now()]);

        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());
        $entry = collect($res->json('notifications'))->firstWhere('type', 'support_overdue');

        $this->assertNotNull($entry);
        $this->assertEquals('info', $entry['severity']);
        $this->assertFalse($entry['metadata']['is_currently_urgent']);
        // Never deleted — still exactly one row.
        $this->assertEquals(1, Notification::where('type', 'support_overdue')->count());
    }

    public function test_blocked_issue_never_generates_overdue_entry_even_if_stale_by_timestamp(): void
    {
        // FR-009's precedence (004): blocked/delayed belongs only in
        // Waiting for Client, even if it's also past its priority
        // threshold — must never also fire a support_overdue entry.
        $project = Project::factory()->create();
        $this->makeIssue($project->id, [
            'status' => 'blocked',
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subHours(2),
        ]);

        $admin = $this->createUser('Admin');
        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());

        $types = collect($res->json('notifications'))->pluck('type');
        $this->assertFalse($types->contains('support_overdue'));
    }

    public function test_overdue_entry_generation_is_scoped_to_requester(): void
    {
        $project = Project::factory()->create();
        $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subHours(2),
        ]);

        $admin = $this->createUser('Admin');
        $pm = $this->createUser('Project Manager');

        // Only admin loads notifications.
        $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());

        $this->assertEquals(1, Notification::where('type', 'support_overdue')->count());
        $this->assertEquals(0, Notification::where('type', 'support_overdue')->where('recipient_user_id', $pm->id)->count());

        // PM loads their own notifications — now their own entry is generated too.
        $this->actingAs($pm, 'sanctum')->getJson($this->endpoint());
        $this->assertEquals(1, Notification::where('type', 'support_overdue')->where('recipient_user_id', $pm->id)->count());
    }

    // ─── US2: daily summary counts, dedup, zero-state, leakage, scoping (T016-T020) ───

    public function test_daily_summary_counts_match_today_classifier(): void
    {
        $project = Project::factory()->create();
        $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subHours(2), // stale
        ]);
        $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subMinutes(5), // watch closely
        ]);
        $this->makeIssue($project->id, ['status' => 'blocked']);
        $this->makeIssue($project->id, ['work_type' => 'learning', 'status' => 'in_progress']);

        $admin = $this->createUser('Admin');
        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());

        $summary = collect($res->json('notifications'))->firstWhere('type', 'support_daily_summary');
        $this->assertNotNull($summary);
        $this->assertEquals(1, $summary['metadata']['stale']);
        $this->assertEquals(1, $summary['metadata']['watch_closely']);
        $this->assertEquals(1, $summary['metadata']['waiting_for_client']);
        $this->assertEquals(1, $summary['metadata']['learning_priorities']);
    }

    public function test_daily_summary_is_deduplicated(): void
    {
        $admin = $this->createUser('Admin');
        $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());
        $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());

        $this->assertEquals(1, Notification::where('type', 'support_daily_summary')->where('recipient_user_id', $admin->id)->count());
    }

    public function test_daily_summary_zero_state_still_generates(): void
    {
        $admin = $this->createUser('Admin');
        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());

        $summary = collect($res->json('notifications'))->firstWhere('type', 'support_daily_summary');
        $this->assertNotNull($summary);
        $this->assertEquals(0, $summary['metadata']['stale']);
        $this->assertEquals(0, $summary['metadata']['watch_closely']);
        $this->assertEquals(0, $summary['metadata']['waiting_for_client']);
        $this->assertEquals(0, $summary['metadata']['learning_priorities']);
    }

    public function test_daily_summary_never_leaks_across_same_role_users(): void
    {
        $itProject = Project::factory()->create(['department' => 'IT']);
        $financeProject = Project::factory()->create(['department' => 'Finance']);
        $this->makeIssue($itProject->id, ['client_priority' => 'P1', 'last_client_update_at' => now()->subHours(2)]);
        $this->makeIssue($financeProject->id, ['client_priority' => 'P1', 'last_client_update_at' => now()->subHours(2)]);

        $itTm = $this->createUser('Team Member', 'IT');
        $financeTm = $this->createUser('Team Member', 'Finance');
        $admin = $this->createUser('Admin');
        // 007-permission-hardening: project access is now an explicit
        // assignment, not department membership.
        \App\Models\ProjectAssignment::create(['user_id' => $itTm->id, 'project_id' => $itProject->id, 'assigned_by_user_id' => $admin->id]);
        \App\Models\ProjectAssignment::create(['user_id' => $financeTm->id, 'project_id' => $financeProject->id, 'assigned_by_user_id' => $admin->id]);

        $itRes = $this->actingAs($itTm, 'sanctum')->getJson($this->endpoint());
        $itSummary = collect($itRes->json('notifications'))->firstWhere('type', 'support_daily_summary');
        $this->assertEquals(1, $itSummary['metadata']['stale']);

        $financeRes = $this->actingAs($financeTm, 'sanctum')->getJson($this->endpoint());
        $financeSummary = collect($financeRes->json('notifications'))->firstWhere('type', 'support_daily_summary');
        $this->assertEquals(1, $financeSummary['metadata']['stale']);
    }

    public function test_daily_summary_generation_is_scoped_to_requester(): void
    {
        $admin = $this->createUser('Admin');
        $pm = $this->createUser('Project Manager');

        $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());

        $this->assertEquals(1, Notification::where('type', 'support_daily_summary')->where('recipient_user_id', $admin->id)->count());
        $this->assertEquals(0, Notification::where('type', 'support_daily_summary')->where('recipient_user_id', $pm->id)->count());
    }

    // ─── US3: weekly report counts, dedup, zero-state, leakage, scoping, audit-log source, ISO week (T023-T029) ───

    public function test_weekly_report_counts_are_correct(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 1, 7, 12, 0, 0)); // Wednesday

        $project = Project::factory()->create();
        $admin = $this->createUser('Admin');

        // Opened this week — DetailedActivity's created_at isn't
        // mass-assignable, so every issue created "now" (frozen above)
        // naturally counts as opened this week, no override needed.
        $this->makeIssue($project->id, []);

        // Resolved this week — via a real save, producing a real audit entry.
        $toResolve = $this->makeIssue($project->id, ['status' => 'in_progress']);
        $this->actingAs($admin, 'sanctum')->putJson(
            route('detailed-activities.update', $toResolve),
            ['status' => 'completed']
        )->assertOk();

        // Still stale.
        $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => Carbon::create(2026, 1, 7, 9, 0, 0),
        ]);

        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());
        $report = collect($res->json('notifications'))->firstWhere('type', 'support_weekly_report');

        $this->assertNotNull($report);
        $this->assertEquals(3, $report['metadata']['opened']); // all three issues were created this week
        $this->assertEquals(1, $report['metadata']['resolved']);
        $this->assertEquals(1, $report['metadata']['still_stale']);

        Carbon::setTestNow();
    }

    public function test_weekly_report_is_deduplicated(): void
    {
        $admin = $this->createUser('Admin');
        $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());
        $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());

        $this->assertEquals(1, Notification::where('type', 'support_weekly_report')->where('recipient_user_id', $admin->id)->count());
    }

    public function test_weekly_report_zero_state_still_generates(): void
    {
        $admin = $this->createUser('Admin');
        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());

        $report = collect($res->json('notifications'))->firstWhere('type', 'support_weekly_report');
        $this->assertNotNull($report);
        $this->assertEquals(['opened' => 0, 'resolved' => 0, 'still_stale' => 0], $report['metadata']);
    }

    public function test_weekly_report_never_leaks_across_same_role_users(): void
    {
        $itProject = Project::factory()->create(['department' => 'IT']);
        $financeProject = Project::factory()->create(['department' => 'Finance']);
        $this->makeIssue($itProject->id, []);
        $this->makeIssue($financeProject->id, []);
        $this->makeIssue($financeProject->id, []);

        $itTm = $this->createUser('Team Member', 'IT');
        $financeTm = $this->createUser('Team Member', 'Finance');
        $admin = $this->createUser('Admin');
        // 007-permission-hardening: project access is now an explicit
        // assignment, not department membership.
        \App\Models\ProjectAssignment::create(['user_id' => $itTm->id, 'project_id' => $itProject->id, 'assigned_by_user_id' => $admin->id]);
        \App\Models\ProjectAssignment::create(['user_id' => $financeTm->id, 'project_id' => $financeProject->id, 'assigned_by_user_id' => $admin->id]);

        $itRes = $this->actingAs($itTm, 'sanctum')->getJson($this->endpoint());
        $itReport = collect($itRes->json('notifications'))->firstWhere('type', 'support_weekly_report');
        $this->assertEquals(1, $itReport['metadata']['opened']);

        $financeRes = $this->actingAs($financeTm, 'sanctum')->getJson($this->endpoint());
        $financeReport = collect($financeRes->json('notifications'))->firstWhere('type', 'support_weekly_report');
        $this->assertEquals(2, $financeReport['metadata']['opened']);
    }

    public function test_weekly_report_generation_is_scoped_to_requester(): void
    {
        $admin = $this->createUser('Admin');
        $pm = $this->createUser('Project Manager');

        $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());

        $this->assertEquals(1, Notification::where('type', 'support_weekly_report')->where('recipient_user_id', $admin->id)->count());
        $this->assertEquals(0, Notification::where('type', 'support_weekly_report')->where('recipient_user_id', $pm->id)->count());
    }

    public function test_weekly_report_still_stale_excludes_blocked_issues(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 1, 7, 12, 0, 0));

        $project = Project::factory()->create();
        // Blocked and past its priority threshold — must count only toward
        // Waiting for Client, never "still stale" (same FR-009 precedence
        // rule as the overdue-entry generator).
        $this->makeIssue($project->id, [
            'status' => 'blocked',
            'client_priority' => 'P1',
            'last_client_update_at' => Carbon::create(2026, 1, 7, 9, 0, 0),
        ]);

        $admin = $this->createUser('Admin');
        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());
        $report = collect($res->json('notifications'))->firstWhere('type', 'support_weekly_report');

        $this->assertEquals(0, $report['metadata']['still_stale']);

        Carbon::setTestNow();
    }

    public function test_resolution_before_feature_existed_is_not_miscounted(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 1, 7, 12, 0, 0));

        $project = Project::factory()->create();
        // Status set directly via factory/update — no controller save, so no
        // task.status_changed audit entry exists for this transition.
        $issue = $this->makeIssue($project->id, ['status' => 'completed']);

        $admin = $this->createUser('Admin');
        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());
        $report = collect($res->json('notifications'))->firstWhere('type', 'support_weekly_report');

        $this->assertEquals(0, $report['metadata']['resolved']);

        Carbon::setTestNow();
    }

    public function test_iso_week_boundary_sunday_belongs_to_previous_week(): void
    {
        // Monday 2026-01-05 is the start of the new ISO week; Sunday
        // 2026-01-04 belongs to the previous one (FR-010).
        Carbon::setTestNow(Carbon::create(2026, 1, 5, 9, 0, 0));

        $project = Project::factory()->create();
        $this->makeIssue($project->id, ['created_at' => Carbon::create(2026, 1, 4, 10, 0, 0)]);

        $admin = $this->createUser('Admin');
        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());
        $report = collect($res->json('notifications'))->firstWhere('type', 'support_weekly_report');

        $this->assertEquals(0, $report['metadata']['opened']);

        Carbon::setTestNow();
    }

    // ─── Polish: cross-type distinguishability + copy guardrail (T032, FR-008/FR-009) ───

    public function test_new_entry_types_are_distinguishable_and_never_overclaim_automation(): void
    {
        $project = Project::factory()->create();
        $this->makeIssue($project->id, [
            'client_priority' => 'P1',
            'last_client_update_at' => now()->subHours(2),
        ]);

        $admin = $this->createUser('Admin');
        // Also seed a legacy type to compare against.
        Notification::create([
            'user_role' => 'Admin', 'recipient_user_id' => null,
            'type' => 'assignment', 'title' => 'You were assigned', 'message' => 'Test',
        ]);

        $res = $this->actingAs($admin, 'sanctum')->getJson($this->endpoint());
        $notifications = collect($res->json('notifications'));

        $byType = $notifications->groupBy('type');
        $this->assertTrue($byType->has('support_overdue'));
        $this->assertTrue($byType->has('support_daily_summary'));
        $this->assertTrue($byType->has('support_weekly_report'));
        $this->assertTrue($byType->has('assignment'));

        // Distinct type values, by construction — this assertion is what
        // proves it, not just asserts it.
        $types = $notifications->pluck('type')->unique();
        $this->assertGreaterThanOrEqual(4, $types->count());

        // Distinct titles across all four types.
        $titlesByType = $notifications->groupBy('type')->map(fn ($group) => $group->first()['title']);
        $this->assertEquals($titlesByType->unique()->count(), $titlesByType->count());

        // Copy guardrail (FR-008): none of this feature's three new types'
        // title/message ever overclaim automatic/scheduled delivery.
        $banned = ['automatic', 'automated', 'scheduled', 'daily email', 'morning digest'];
        foreach (['support_overdue', 'support_daily_summary', 'support_weekly_report'] as $type) {
            $entry = $notifications->firstWhere('type', $type);
            $text = strtolower($entry['title'] . ' ' . $entry['message']);
            foreach ($banned as $phrase) {
                $this->assertStringNotContainsString($phrase, $text, "type={$type} must not contain \"{$phrase}\"");
            }
        }
    }
}
