<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ModuleController;
use App\Http\Controllers\ActivityController;
use App\Http\Controllers\SubActivityController;
use App\Http\Controllers\DetailedActivityController;
use App\Http\Controllers\CommentController;
use App\Http\Controllers\AttachmentController;
use App\Http\Controllers\TeamMemberController;
use App\Http\Controllers\GlossaryTermController;
use App\Http\Controllers\SupportOpsController;
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\ClientDomainController;
use App\Http\Controllers\ClientMembershipReviewController;
use App\Http\Controllers\ClientOrganizationController;
use App\Http\Controllers\ProjectAssignmentController;
use App\Http\Controllers\ProjectOwnershipController;
use App\Http\Controllers\ProjectInvitationController;
use App\Http\Controllers\ProjectMembershipController;
use App\Http\Controllers\ProjectClientOrganizationController;
use App\Http\Controllers\PreviewSessionController;
use App\Http\Middleware\EnsureUserIsActive;
use App\Http\Middleware\ResolvePreviewSession;
use App\Http\Middleware\BlockWritesDuringPreview;

// ─── Public routes (no auth required) ────────────────────────────────────────

// POST /api/login — the only public mutation. The SPA must call
// GET /sanctum/csrf-cookie before this so the CSRF cookie is set.
// Added route name for compatibility with Laravel's route() helper used in tests and elsewhere
Route::post('/login', [AuthController::class, 'login'])->name('login');

// ─── Authenticated routes ────────────────────────────────────────────────────
// Everything below requires a valid Sanctum session cookie. EnsureUserIsActive
// (006-real-user-management) applies to this entire group — including
// /api/me — so a disabled account loses access on its very next request,
// not just future login attempts (research.md's global-gate decision).
// ResolvePreviewSession then BlockWritesDuringPreview (007-permission-
// hardening) MUST run in that order, after EnsureUserIsActive: the first
// validates any presented preview token and attaches its target before
// anything else runs; the second can then reject writes based on that
// resolved target. Reversing the order would let a write-blocking check
// run before a preview token is even resolved (plan.md's Constraints).
Route::middleware(['auth:sanctum', EnsureUserIsActive::class, ResolvePreviewSession::class, BlockWritesDuringPreview::class])->group(function () {

    // Auth management
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Projects
    Route::apiResource('projects', ProjectController::class);
    Route::patch('projects/{project}/health', [ProjectController::class, 'updateHealth'])->name('projects.health');
    Route::patch('projects/{project}/client-organization', [ProjectClientOrganizationController::class, 'update'])->name('projects.client-organization');

    // Modules (nested under projects)
    Route::apiResource('projects.modules', ModuleController::class)->shallow();

    // Activities (nested under modules)
    Route::apiResource('modules.activities', ActivityController::class)->shallow();

    // Sub Activities (nested under activities)
    Route::apiResource('activities.sub-activities', SubActivityController::class)->shallow();

    // Detailed Activities (nested under sub-activities)
    Route::apiResource('sub-activities.detailed-activities', DetailedActivityController::class)->shallow();

    // Team Members
    Route::apiResource('team-members', TeamMemberController::class);

    // User Management (Admin only — real User accounts, distinct from the
    // Team Member roster above)
    Route::get('users', [UserManagementController::class, 'index']);
    Route::post('users', [UserManagementController::class, 'store']);
    Route::patch('users/{user}', [UserManagementController::class, 'update']);
    Route::post('users/{user}/disable', [UserManagementController::class, 'disable']);
    Route::post('users/{user}/reactivate', [UserManagementController::class, 'reactivate']);
    Route::post('users/{user}/reset-password', [UserManagementController::class, 'resetPassword']);

    // Glossary Terms
    Route::apiResource('glossary-terms', GlossaryTermController::class);

    // Comments (nested under detailed-activities, shallow destroy at /comments/{comment})
    Route::apiResource('detailed-activities.comments', CommentController::class)
        ->shallow()
        ->only(['index', 'store', 'destroy']);

    // Attachments — nested index/store, shallow destroy, named download route
    Route::apiResource('detailed-activities.attachments', AttachmentController::class)
        ->shallow()
        ->only(['index', 'store', 'destroy']);
    Route::get('attachments/{attachment}/download', [AttachmentController::class, 'download'])
        ->name('attachments.download');

    // Dashboard summary
    Route::get('dashboard', [ProjectController::class, 'dashboard']);

    // Support Ops
    Route::get('support-ops', [SupportOpsController::class, 'index']);
    Route::post('support-ops', [SupportOpsController::class, 'store']);
    Route::get('support-ops/today', [SupportOpsController::class, 'today']);
    Route::get('support-ops/knowledge-base', [SupportOpsController::class, 'knowledgeBase']);
    Route::post('support-ops/{id}/generation-log', [SupportOpsController::class, 'generationLog']);

    // Notifications
    Route::get('notifications', [App\Http\Controllers\NotificationController::class, 'index']);
    Route::put('notifications/{notification}/read', [App\Http\Controllers\NotificationController::class, 'markAsRead'])->name('notifications.read');
    Route::post('notifications/read-all', [App\Http\Controllers\NotificationController::class, 'markAllAsRead'])->name('notifications.read-all');

    // Reports
    Route::get('reports', [App\Http\Controllers\ReportController::class, 'index'])->name('reports.index');
    Route::get('reports/export-csv', [App\Http\Controllers\ReportController::class, 'exportCsv'])->name('reports.export-csv');

    // Audit Logs (Admin-only, read-only)
    Route::get('audit-logs', [App\Http\Controllers\AuditLogController::class, 'index'])->name('audit-logs.index');

    // Department Grants (Admin-only CRUD)
    Route::get('department-grants', [App\Http\Controllers\DepartmentGrantController::class, 'index'])->name('department-grants.index');
    Route::post('department-grants', [App\Http\Controllers\DepartmentGrantController::class, 'store'])->name('department-grants.store');
    Route::delete('department-grants/{departmentGrant}', [App\Http\Controllers\DepartmentGrantController::class, 'destroy'])->name('department-grants.destroy');

    // Project Assignments (007-permission-hardening — Admin/PM CRUD)
    Route::get('client-organizations', [ClientOrganizationController::class, 'index'])->name('client-organizations.index');
    Route::post('client-organizations', [ClientOrganizationController::class, 'store'])->name('client-organizations.store');
    Route::patch('client-organizations/{clientOrganization}/trusted-domain-policy', [ClientOrganizationController::class, 'updateTrustedDomainPolicy'])->name('client-organizations.trusted-domain-policy');
    Route::get('client-organizations/{clientOrganization}/domains', [ClientDomainController::class, 'index'])->name('client-domains.index');
    Route::post('client-organizations/{clientOrganization}/domains', [ClientDomainController::class, 'store'])->name('client-domains.store');
    Route::delete('client-domains/{clientDomain}', [ClientDomainController::class, 'destroy'])->name('client-domains.destroy');
    Route::get('client-membership-review', [ClientMembershipReviewController::class, 'index'])->name('client-membership-review.index');

    Route::get('project-assignments', [ProjectAssignmentController::class, 'index'])->name('project-assignments.index');
    Route::post('project-assignments', [ProjectAssignmentController::class, 'store'])->name('project-assignments.store');
    Route::delete('project-assignments/{projectAssignment}', [ProjectAssignmentController::class, 'destroy'])->name('project-assignments.destroy');

    Route::get('project-ownerships', [ProjectOwnershipController::class, 'index'])->name('project-ownerships.index');
    Route::post('project-ownerships', [ProjectOwnershipController::class, 'store'])->name('project-ownerships.store');
    Route::delete('project-ownerships/{projectOwnership}', [ProjectOwnershipController::class, 'destroy'])->name('project-ownerships.destroy');
    Route::post('project-ownerships/{projectOwnership}/transfer', [ProjectOwnershipController::class, 'transfer'])->name('project-ownerships.transfer');
    Route::get('projects/{project}/invitations', [ProjectInvitationController::class, 'index'])->name('project-invitations.index');
    Route::post('projects/{project}/invitations', [ProjectInvitationController::class, 'store'])->name('project-invitations.store');
    Route::post('project-invitations/accept', [ProjectInvitationController::class, 'accept'])->name('project-invitations.accept');
    Route::get('projects/{project}/memberships', [ProjectMembershipController::class, 'index'])->name('project-memberships.index');
    Route::post('project-memberships/{projectMembership}/approve', [ProjectMembershipController::class, 'approve'])->name('project-memberships.approve');
    Route::post('project-memberships/{projectMembership}/reject', [ProjectMembershipController::class, 'reject'])->name('project-memberships.reject');
    Route::post('project-memberships/{projectMembership}/suspend', [ProjectMembershipController::class, 'suspend'])->name('project-memberships.suspend');
    Route::post('project-memberships/{projectMembership}/restore', [ProjectMembershipController::class, 'restore'])->name('project-memberships.restore');
    Route::post('project-memberships/{projectMembership}/remove', [ProjectMembershipController::class, 'remove'])->name('project-memberships.remove');
    Route::post('project-memberships/{projectMembership}/expire', [ProjectMembershipController::class, 'expire'])->name('project-memberships.expire');

    // Preview Sessions (007-permission-hardening — Admin-only "preview as user")
    Route::post('preview-sessions', [PreviewSessionController::class, 'store'])->name('preview-sessions.store');
    Route::delete('preview-sessions/current', [PreviewSessionController::class, 'destroy'])->name('preview-sessions.destroy');
});
