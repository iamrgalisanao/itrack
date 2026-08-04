<?php

namespace App\Http\Controllers;

use App\Http\Resources\NotificationResource;
use App\Models\AuditLog;
use App\Models\Bug;
use App\Models\DetailedActivity;
use App\Models\Notification;
use App\Models\Project;
use App\Models\User;
use App\Services\SupportOpsStaleness;
use App\Services\SupportOpsTodayClassifier;
use App\Services\SupportOpsWeeklyReportBuilder;
use App\Support\ProjectClientAccess;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * GET /api/notifications
     *
     * Returns all notifications visible to the authenticated user: their own
     * individually-targeted rows (recipient_user_id = them — introduced by
     * 005-support-ops-automation) plus every role-wide legacy row
     * (recipient_user_id null, matching their role — unchanged since before
     * this feature). Triggers dynamic overdue/due-soon checks (unchanged)
     * plus this feature's three new checks, each scoped only to the
     * requesting user (research.md's "scoped to requester" decision).
     */
    public function index(Request $request)
    {
        $user = $this->user($request);

        // Run dynamic notification checks
        $this->generateOverdueNotifications();
        $this->generateDueSoonNotifications();
        $this->generateBugBreachNotifications();
        $this->generateSupportOverdueEntries($user);
        $this->generateDailySummary($user);
        $this->generateWeeklyReport($user);

        // Retrieve notifications visible to this user (eager load task to filter deleted ones)
        $notifications = Notification::where($this->visibleToUser($user))
            ->with('detailedActivity.subActivity.activity.module.project')
            ->orderBy('created_at', 'desc')
            ->get()
            ->filter(function ($n) use ($user) {
                // If notification links to a task, ensure the task still exists in the DB
                if ($n->detailed_activity_id && !$n->detailedActivity) {
                    $n->delete(); // Auto-clean orphan notifications
                    return false;
                }

                return $this->linkedTaskVisibleTo($user, $n);
            })
            ->values();

        $this->applyOverdueUrgencyDerivation($notifications);

        $unreadCount = $notifications->where('is_read', false)->count();

        return response()->json([
            'unread_count'  => $unreadCount,
            'notifications' => NotificationResource::collection($notifications),
        ]);
    }

    /**
     * PUT /api/notifications/{notification}/read
     *
     * Mark a single notification as read.
     * Enforces per-recipient ownership for this feature's individually-
     * targeted rows, and role ownership for legacy role-wide rows (403
     * otherwise).
     */
    public function markAsRead(Request $request, Notification $notification)
    {
        $user = $this->user($request);

        $isMine = $notification->recipient_user_id !== null
            ? $notification->recipient_user_id === $user->id
            : $notification->user_role === $user->role;

        if (!$isMine || !$this->linkedTaskVisibleTo($user, $notification)) {
            return response()->json(['message' => 'Access denied.'], 403);
        }

        $notification->update([
            'is_read' => true,
            'read_at' => Carbon::now(),
        ]);

        $unreadCount = $this->visibleUnreadCount($user);

        return response()->json([
            'unread_count' => $unreadCount,
            'notification' => new NotificationResource($notification),
        ]);
    }

    /**
     * POST /api/notifications/read-all
     *
     * Mark every notification visible to the authenticated user as read —
     * their own individually-targeted rows plus role-wide legacy rows.
     */
    public function markAllAsRead(Request $request)
    {
        $user = $this->user($request);

        $visibleIds = Notification::where($this->visibleToUser($user))
            ->where('is_read', false)
            ->with('detailedActivity.subActivity.activity.module.project')
            ->get()
            ->filter(fn (Notification $notification) => $this->linkedTaskVisibleTo($user, $notification))
            ->pluck('id');

        Notification::whereIn('id', $visibleIds)->update([
            'is_read' => true,
            'read_at' => Carbon::now(),
        ]);

        return response()->json([
            'unread_count' => 0,
        ]);
    }

    /**
     * Shared visibility condition for all three endpoints above (FR-006):
     * a notification is visible to a user if it was individually targeted
     * at them, or if it's a legacy role-wide row matching their role.
     */
    private function visibleToUser(User $user): \Closure
    {
        return function (Builder $query) use ($user) {
            $query->where('recipient_user_id', $user->id)
                ->orWhere(function (Builder $q) use ($user) {
                    $q->whereNull('recipient_user_id')->where('user_role', $user->role);
                });
        };
    }

    private function linkedTaskVisibleTo(User $user, Notification $notification): bool
    {
        if (!$user->isClient()) {
            return true;
        }

        if (!$notification->detailed_activity_id) {
            return true;
        }

        $task = $notification->detailedActivity;
        if (!$task) {
            return false;
        }

        $project = $task->subActivity?->activity?->module?->project;
        if (!$project) {
            return false;
        }

        if (!app(ProjectClientAccess::class)->canReadProject($user, $project)) {
            return false;
        }

        return $task->client_visible;
    }

    private function visibleUnreadCount(User $user): int
    {
        return Notification::where($this->visibleToUser($user))
            ->where('is_read', false)
            ->with('detailedActivity.subActivity.activity.module.project')
            ->get()
            ->filter(fn (Notification $notification) => $this->linkedTaskVisibleTo($user, $notification))
            ->count();
    }

    // ─── Support Ops Automation (005) ───────────────────────────────────────
    // work_type values eligible for this feature's three entry types (FR-011,
    // matching 004's TODAY_ELIGIBLE_WORK_TYPES) — never ordinary Kanban tasks.
    private const SUPPORT_OPS_WORK_TYPES = ['support', 'learning'];

    /**
     * Internal roles this feature's daily/weekly digests are generated for
     * (FR-004) — Clients have no Support Ops access at all, matching
     * SupportOpsController::canView()'s existing inclusion-based check.
     */
    private function isEligibleForSupportOpsDigest(User $user): bool
    {
        return $user->isAdmin() || $user->isProjectManager() || $user->isTeamMember() || $user->isDepartmentHead();
    }

    /**
     * FR-001: role eligibility AND project access, both required. Mirrors
     * generateOverdueNotifications()'s existing targeting (PM + resolved
     * responsible role), corrected to resolve to an individual recipient
     * (project access), not a role broadcast.
     */
    private function isEligibleForOverdueEntry(User $user, DetailedActivity $issue): bool
    {
        $roleEligible = $user->isAdmin() || $user->isProjectManager();

        if (!$roleEligible) {
            $resolvedRole = Notification::resolveRoleFromResponsible($issue->responsible);
            $roleEligible = $resolvedRole !== null && $resolvedRole === $user->role;
        }

        if (!$roleEligible) {
            return false;
        }

        $projectId = $issue->subActivity?->activity?->module?->project_id;
        if (!$projectId) {
            return false;
        }

        return Project::query()->accessibleTo($user)->where('id', $projectId)->exists();
    }

    /**
     * Generation is scoped only to $user (the current requester) — never
     * eagerly for every eligible user on every request (research.md).
     */
    private function generateSupportOverdueEntries(User $user): void
    {
        $projectIds = Project::query()->accessibleTo($user)->pluck('id');

        $issues = DetailedActivity::whereHas('subActivity.activity.module', function ($query) use ($projectIds) {
            $query->whereIn('project_id', $projectIds);
        })
            ->whereIn('work_type', self::SUPPORT_OPS_WORK_TYPES)
            ->where('status', '!=', 'completed')
            ->with('subActivity.activity.module')
            ->get();

        // Reuse the classifier's precedence (004, FR-009), not raw
        // SupportOpsStaleness::state() alone — a `blocked`/`delayed` issue
        // belongs only in Waiting for Client, even if it also happens to be
        // past its priority threshold; it must never also fire an overdue
        // entry here.
        $staleIssueIds = collect(SupportOpsTodayClassifier::classify($issues)['stale'])->pluck('id');

        foreach ($issues as $issue) {
            if (!$staleIssueIds->contains($issue->id)) {
                continue;
            }

            if (!$this->isEligibleForOverdueEntry($user, $issue)) {
                continue;
            }

            $overdueSince = SupportOpsStaleness::staleAt($issue)->toIso8601String();
            $eventKey = "support_overdue:{$issue->id}:{$user->id}:{$overdueSince}";
            $severity = $issue->client_priority === 'P1' ? Notification::SEVERITY_CRITICAL : Notification::SEVERITY_WARNING;

            Notification::sendNotification(
                $user->role,
                'support_overdue',
                $severity,
                "Client update overdue: {$issue->client_name}",
                "\"{$issue->name}\" for {$issue->client_name} has an overdue client update.",
                $issue->id,
                '/support-ops/today',
                $eventKey,
                null,
                [
                    'client_priority' => $issue->client_priority,
                    'overdue_since' => $overdueSince,
                    'is_currently_urgent' => true,
                ],
                $user->id
            );
        }
    }

    /**
     * FR-002: re-derive urgency at read time from the linked issue's current
     * state, rather than trusting whatever was true when the row was
     * created. Never mutates the stored row — only the in-memory collection
     * about to be returned in this response.
     */
    private function applyOverdueUrgencyDerivation($notifications): void
    {
        foreach ($notifications as $notification) {
            if ($notification->type !== 'support_overdue' || !$notification->detailedActivity) {
                continue;
            }

            // Reuse the classifier's precedence (004, FR-009), not raw
            // SupportOpsStaleness::state() alone — matches
            // generateSupportOverdueEntries()'s own bucket check, so an
            // issue that's since moved to blocked/delayed is correctly
            // downgraded here too, not just a resolved one.
            $stillStale = collect(SupportOpsTodayClassifier::classify([$notification->detailedActivity])['stale'])
                ->contains('id', $notification->detailedActivity->id);

            if (!$stillStale) {
                $notification->severity = Notification::SEVERITY_INFO;
                $notification->metadata = array_merge($notification->metadata ?? [], ['is_currently_urgent' => false]);
            }
        }
    }

    /**
     * FR-004: daily summary, generated at most once per calendar day per
     * user, reusing SupportOpsTodayClassifier (004) directly for counts.
     */
    private function generateDailySummary(User $user): void
    {
        if (!$this->isEligibleForSupportOpsDigest($user)) {
            return;
        }

        $today = Carbon::now()->toDateString();
        $eventKey = "support_daily_summary:{$user->id}:{$today}";

        if (Notification::where('type', 'support_daily_summary')->where('event_key', $eventKey)->exists()) {
            return;
        }

        $projectIds = Project::query()->accessibleTo($user)->pluck('id');
        $issues = DetailedActivity::whereHas('subActivity.activity.module', function ($query) use ($projectIds) {
            $query->whereIn('project_id', $projectIds);
        })
            ->whereIn('work_type', self::SUPPORT_OPS_WORK_TYPES)
            ->where('status', '!=', 'completed')
            ->get();

        $buckets = SupportOpsTodayClassifier::classify($issues);
        $counts = [
            'stale' => count($buckets['stale']),
            'watch_closely' => count($buckets['watch_closely']),
            'waiting_for_client' => count($buckets['waiting_for_client']),
            'learning_priorities' => count($buckets['learning_priorities']),
        ];

        Notification::sendNotification(
            $user->role,
            'support_daily_summary',
            Notification::SEVERITY_INFO,
            "Today's Support Ops summary",
            sprintf(
                '%d stale, %d P1 watch closely, %d waiting for client, %d learning priorities.',
                $counts['stale'],
                $counts['watch_closely'],
                $counts['waiting_for_client'],
                $counts['learning_priorities']
            ),
            null,
            '/support-ops/today',
            $eventKey,
            null,
            $counts,
            $user->id
        );
    }

    /**
     * FR-005/FR-011: weekly report, generated at most once per ISO week per
     * user. "Resolved" is sourced from the existing task.status_changed
     * audit trail, never a new column (research.md).
     */
    private function generateWeeklyReport(User $user): void
    {
        if (!$this->isEligibleForSupportOpsDigest($user)) {
            return;
        }

        $now = Carbon::now();
        $eventKey = "support_weekly_report:{$user->id}:{$now->isoWeekYear}-W{$now->isoWeek}";

        if (Notification::where('type', 'support_weekly_report')->where('event_key', $eventKey)->exists()) {
            return;
        }

        // FR-010: single application timezone, ISO (Monday-start) week.
        $weekStart = $now->copy()->startOfWeek(Carbon::MONDAY);
        $weekEnd = $now->copy()->endOfWeek(Carbon::SUNDAY);

        $projectIds = Project::query()->accessibleTo($user)->pluck('id');

        $currentIssueIds = DetailedActivity::whereHas('subActivity.activity.module', function ($query) use ($projectIds) {
            $query->whereIn('project_id', $projectIds);
        })
            ->whereIn('work_type', self::SUPPORT_OPS_WORK_TYPES)
            ->pluck('id');

        $openedIssues = DetailedActivity::whereIn('id', $currentIssueIds)
            ->whereBetween('created_at', [$weekStart, $weekEnd])
            ->get();

        $resolvedIssueIds = AuditLog::where('action', 'task.status_changed')
            ->where('entity_type', 'detailed_activity')
            ->whereIn('entity_id', $currentIssueIds)
            ->whereBetween('created_at', [$weekStart, $weekEnd])
            ->get()
            ->filter(fn ($log) => ($log->metadata['new_status'] ?? null) === 'completed')
            ->pluck('entity_id');

        $currentIssues = DetailedActivity::whereIn('id', $currentIssueIds)
            ->where('status', '!=', 'completed')
            ->get();

        $counts = SupportOpsWeeklyReportBuilder::build($openedIssues, $resolvedIssueIds, $currentIssues, $now);

        Notification::sendNotification(
            $user->role,
            'support_weekly_report',
            Notification::SEVERITY_INFO,
            "This week's Support Ops report",
            sprintf(
                '%d opened, %d resolved, %d still stale.',
                $counts['opened'],
                $counts['resolved'],
                $counts['still_stale']
            ),
            null,
            '/support-ops/today',
            $eventKey,
            null,
            $counts,
            $user->id
        );
    }

    /**
     * Helper: Generate 'overdue' notifications dynamically.
     */
    private function generateOverdueNotifications(): void
    {
        $today = Carbon::today();

        // Overdue tasks are not completed, and plan_end_date is in the past
        $overdueTasks = DetailedActivity::where('status', '!=', 'completed')
            ->whereNotNull('plan_end_date')
            ->where('plan_end_date', '<', $today)
            ->get();

        foreach ($overdueTasks as $task) {
            $planEndDateStr = $task->plan_end_date->format('Y-m-d');
            $targetRoles = ['Project Manager'];

            // Also target the assignee's role
            $assigneeRole = Notification::resolveRoleFromResponsible($task->responsible);
            if ($assigneeRole && !in_array($assigneeRole, $targetRoles)) {
                $targetRoles[] = $assigneeRole;
            }

            foreach ($targetRoles as $targetRole) {
                $eventKey = "overdue:task:{$task->id}:{$targetRole}";

                Notification::sendNotification(
                    $targetRole,
                    Notification::TYPE_OVERDUE,
                    Notification::SEVERITY_CRITICAL,
                    "Task Overdue Reminder",
                    "Task \"{$task->name}\" is overdue (Planned End Date: {$planEndDateStr}).",
                    $task->id,
                    "/kanban?task={$task->id}",
                    $eventKey,
                    $task->plan_end_date
                );
            }
        }
    }

    /**
     * Helper: Generate 'due_soon' notifications dynamically (due within next 48 hours).
     */
    private function generateDueSoonNotifications(): void
    {
        $today = Carbon::today();
        $fortyEightHoursLater = Carbon::today()->addDays(2);

        // Due soon tasks are not completed, and plan_end_date is between today and today + 2 days
        $dueSoonTasks = DetailedActivity::where('status', '!=', 'completed')
            ->whereNotNull('plan_end_date')
            ->whereBetween('plan_end_date', [$today, $fortyEightHoursLater])
            ->get();

        foreach ($dueSoonTasks as $task) {
            $planEndDateStr = $task->plan_end_date->format('Y-m-d');
            $targetRoles = ['Project Manager'];

            $assigneeRole = Notification::resolveRoleFromResponsible($task->responsible);
            if ($assigneeRole && !in_array($assigneeRole, $targetRoles)) {
                $targetRoles[] = $assigneeRole;
            }

            foreach ($targetRoles as $targetRole) {
                $eventKey = "due_soon:task:{$task->id}:{$planEndDateStr}:{$targetRole}";

                Notification::sendNotification(
                    $targetRole,
                    Notification::TYPE_DUE_SOON,
                    Notification::SEVERITY_WARNING,
                    "Task Due Soon Alert",
                    "Task \"{$task->name}\" is due soon (Planned End Date: {$planEndDateStr}).",
                    $task->id,
                    "/schedule?task={$task->id}",
                    $eventKey,
                    $task->plan_end_date
                );
            }
        }
    }

    /**
     * Helper: Generate 'overdue' (SLA breach) notifications for Bug Tracker
     * bugs (017-bug-tracker, research.md D3). Mirrors
     * generateOverdueNotifications()'s shape exactly — the lazy,
     * request-triggered pattern already established in this controller,
     * not a new scheduled-command dependency.
     */
    private function generateBugBreachNotifications(): void
    {
        $overdueBugs = Bug::where('status', '!=', Bug::STATUS_FIXED)
            ->whereNotNull('due_date')
            ->where('due_date', '<', now())
            ->whereNull('breach_notified_at')
            ->with(['reporter', 'owner'])
            ->get();

        foreach ($overdueBugs as $bug) {
            $dueDateStr = $bug->due_date->format('Y-m-d');
            $recipients = collect([$bug->reporter, $bug->owner])
                ->filter()
                ->unique('id');

            foreach ($recipients as $recipient) {
                $eventKey = "bug_breach:bug:{$bug->id}:{$recipient->id}";

                Notification::sendNotification(
                    $recipient->role,
                    Notification::TYPE_OVERDUE,
                    Notification::SEVERITY_CRITICAL,
                    'Bug Overdue',
                    "Bug \"{$bug->title}\" ({$bug->bug_id}) is overdue (Due: {$dueDateStr}).",
                    null,
                    "/bug-tracker?bug={$bug->id}",
                    $eventKey,
                    $dueDateStr,
                    null,
                    $recipient->id
                );
            }

            // breach_notified_at is deliberately excluded from Bug::$fillable
            // (never client-settable) — set directly, not via update().
            $bug->breach_notified_at = now();
            $bug->save();
        }
    }

    private function user(Request $request): User
    {
        return $request->user();
    }
}
