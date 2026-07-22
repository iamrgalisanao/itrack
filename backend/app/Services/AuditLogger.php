<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Http\Request;

/**
 * Centralized audit logging service.
 *
 * Usage:
 *   AuditLogger::record($request, 'project.created', 'project', $project->id, 'Project created.', [...]);
 *
 * Normalized dot-style action names:
 *   project.created | project.updated | project.deleted | project.health_updated
 *   task.created | task.updated | task.deleted | task.status_changed | task.client_visibility_changed
 *   support_issue.created
 *   member.created | member.updated | member.deleted
 *   comment.deleted | attachment.deleted
 *   department_grant.created | department_grant.deleted
 *   report.exported
 *   permission.denied
 */
class AuditLogger
{
    /**
     * Record an audit event.
     *
     * @param Request     $request     Incoming HTTP request (used to extract role, IP, UA)
     * @param string      $action      Dot-style action name, e.g. "task.status_changed"
     * @param string      $entityType  Entity type string, e.g. "detailed_activity"
     * @param int|null    $entityId    Primary key of affected entity
     * @param string|null $description Human-readable description of the event
     * @param array|null  $metadata    Structured context (old/new values, etc.)
     */
    public static function record(
        Request $request,
        string $action,
        string $entityType,
        ?int $entityId = null,
        ?string $description = null,
        ?array $metadata = null
    ): void {
        $user = $request->user();

        // Derive actor identity from the authenticated user (real auth via Sanctum).
        $role      = $user?->role      ?? 'Unknown';
        $dept      = $user?->department;
        $actorName = $user?->name      ?? $role; // fall back to role when no real user (e.g. unauthenticated)

        AuditLog::create([
            'action'       => $action,
            'entity_type'  => $entityType,
            'entity_id'    => $entityId,
            'actor_role'   => $role,
            'actor_dept'   => $dept,
            'actor_user_id'=> $user?->id,
            'actor_name'   => $actorName,
            'description'  => $description,
            'metadata'     => $metadata,
            'ip_address'   => $request->ip(),
            'user_agent'   => $request->userAgent(),
        ]);
    }

    /**
     * Log a permission-denied event for high-risk access attempts.
     */
    public static function denied(
        Request $request,
        string $attemptedAction,
        string $entityType,
        ?int $entityId = null
    ): void {
        static::record(
            $request,
            'permission.denied',
            $entityType,
            $entityId,
            "Unauthorized attempt: {$attemptedAction}",
            ['attempted_action' => $attemptedAction]
        );
    }
}
