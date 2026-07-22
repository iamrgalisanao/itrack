<?php

namespace App\Http\Controllers;

use App\Models\DetailedActivity;
use App\Models\Notification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * GET /api/notifications
     *
     * Returns all notifications for the authenticated user's role.
     * Triggers dynamic overdue and due-soon checks on load.
     *
     * v1: notifications remain role-scoped. recipient_user_id is reserved for
     * a future per-user notification refactor.
     */
    public function index(Request $request)
    {
        $user = $this->user($request);

        // Run dynamic notification checks
        $this->generateOverdueNotifications();
        $this->generateDueSoonNotifications();

        // Retrieve notifications for the user's role (eager load task to filter deleted ones)
        $notifications = Notification::where('user_role', $user->role)
            ->with('detailedActivity')
            ->orderBy('created_at', 'desc')
            ->get()
            ->filter(function ($n) {
                // If notification links to a task, ensure the task still exists in the DB
                if ($n->detailed_activity_id && !$n->detailedActivity) {
                    $n->delete(); // Auto-clean orphan notifications
                    return false;
                }
                return true;
            })
            ->values();

        $unreadCount = $notifications->where('is_read', false)->count();

        return response()->json([
            'unread_count'  => $unreadCount,
            'notifications' => $notifications,
        ]);
    }

    /**
     * PUT /api/notifications/{notification}/read
     *
     * Mark a single notification as read.
     * Enforces role ownership check (403).
     */
    public function markAsRead(Request $request, Notification $notification)
    {
        $user = $this->user($request);

        if ($notification->user_role !== $user->role) {
            return response()->json(['message' => 'Access denied.'], 403);
        }

        $notification->update([
            'is_read' => true,
            'read_at' => Carbon::now(),
        ]);

        $unreadCount = Notification::where('user_role', $user->role)
            ->where('is_read', false)
            ->count();

        return response()->json([
            'unread_count' => $unreadCount,
            'notification' => $notification,
        ]);
    }

    /**
     * POST /api/notifications/read-all
     *
     * Mark all unread notifications for the authenticated user's role as read.
     */
    public function markAllAsRead(Request $request)
    {
        $user = $this->user($request);

        Notification::where('user_role', $user->role)
            ->where('is_read', false)
            ->update([
                'is_read' => true,
                'read_at' => Carbon::now(),
            ]);

        return response()->json([
            'unread_count' => 0,
        ]);
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

    private function user(Request $request): User
    {
        return $request->user();
    }
}
