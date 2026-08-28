<?php

namespace App\Http\Controllers;

use App\Support\AccessContext;
use App\Http\Resources\ProjectInvitationResource;
use App\Http\Resources\ProjectMembershipResource;
use App\Models\ClientDomain;
use App\Models\ClientOrganization;
use App\Models\Project;
use App\Models\ProjectInvitation;
use App\Models\ProjectMembership;
use App\Models\ProjectOwnership;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\ClientDomainPolicy;
use App\Services\ProjectInvitationTokenService;
use App\Support\ProjectClientAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ProjectInvitationController extends Controller
{
    public function __construct(
        private readonly ProjectClientAccess $access,
        private readonly ProjectInvitationTokenService $tokens,
        private readonly ClientDomainPolicy $domains,
    ) {}

    public function index(Request $request, Project $project)
    {
        $user = AccessContext::user($request);

        if (!$this->canManageInvitations($user, $project)) {
            AuditLogger::denied($request, 'project_invitation.list', 'project', $project->id);
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        return ProjectInvitationResource::collection(
            $project->invitations()
                ->where('client_organization_id', $project->client_organization_id)
                ->latest()
                ->get()
        );
    }

    public function store(Request $request, Project $project)
    {
        $user = AccessContext::user($request);

        if (!$this->canManageInvitations($user, $project)) {
            AuditLogger::denied($request, 'project_invitation.create', 'project', $project->id);
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $validated = $request->validate([
            'client_organization_id' => ['required', 'integer', Rule::exists('client_organizations', 'id')],
            'email' => ['required', 'email:rfc', 'max:255'],
            'role' => ['required', Rule::in(ProjectMembership::validRoles())],
            'expires_in_days' => ['sometimes', 'integer', 'min:1', 'max:30'],
        ]);

        if ((int) $validated['client_organization_id'] !== (int) $project->client_organization_id) {
            return response()->json(['message' => 'Invitation client organization must match the project.'], 422);
        }

        $email = $this->domains->normalizeEmail($validated['email']);
        $issued = $this->tokens->issueAttributes($validated['expires_in_days'] ?? 7);

        $invitation = ProjectInvitation::query()
            ->where('client_organization_id', $project->client_organization_id)
            ->where('project_id', $project->id)
            ->where('email', $email)
            ->where('state', ProjectInvitation::STATE_PENDING)
            ->first();

        $invitationAttributes = [
            'client_organization_id' => $project->client_organization_id,
            'project_id' => $project->id,
            'email' => $email,
            'email_domain' => $this->domains->domainFromEmail($email),
            'role' => $validated['role'],
            'state' => ProjectInvitation::STATE_PENDING,
            'token_hash' => $issued['token_hash'],
            'invited_by_user_id' => $user->id,
            'expires_at' => $issued['expires_at'],
        ];

        if ($invitation) {
            AuditLogger::record(
                $request,
                'project_invitation.revoked',
                'project_invitation',
                $invitation->id,
                "Existing pending invitation token revoked for {$email}.",
                [
                    'client_organization_id' => $invitation->client_organization_id,
                    'project_id' => $invitation->project_id,
                    'email_domain' => $invitation->email_domain,
                    'reason' => 'resent',
                ]
            );

            $invitation->update($invitationAttributes);
        } else {
            $invitation = ProjectInvitation::create($invitationAttributes);
        }

        AuditLogger::record(
            $request,
            'project_invitation.created',
            'project_invitation',
            $invitation->id,
            "Invitation created for {$email}.",
            [
                'client_organization_id' => $invitation->client_organization_id,
                'project_id' => $invitation->project_id,
                'email_domain' => $invitation->email_domain,
                'role' => $invitation->role,
            ]
        );

        return response()->json([
            'data' => [
                ...ProjectInvitationResource::make($invitation)->resolve($request),
                'invitation_url' => url('/invitations/accept?token=' . $issued['plaintext_token']),
            ],
        ], 201);
    }

    public function accept(Request $request)
    {
        $user = AccessContext::user($request);

        $validated = $request->validate([
            'token' => ['required', 'string'],
        ]);

        $invitation = $this->tokens->findValidInvitation($validated['token']);

        if (!$invitation) {
            $expiredInvitation = $this->tokens->findInvitation($validated['token']);

            if (
                $expiredInvitation
                && $expiredInvitation->state === ProjectInvitation::STATE_PENDING
                && $expiredInvitation->expires_at->isPast()
            ) {
                $expiredInvitation->update(['state' => ProjectInvitation::STATE_EXPIRED]);

                AuditLogger::record(
                    $request,
                    'project_invitation.expired',
                    'project_invitation',
                    $expiredInvitation->id,
                    'Project invitation expired during acceptance.',
                    [
                        'client_organization_id' => $expiredInvitation->client_organization_id,
                        'project_id' => $expiredInvitation->project_id,
                        'email_domain' => $expiredInvitation->email_domain,
                    ]
                );
            }

            return response()->json(['message' => 'Invitation is invalid, expired, or no longer pending.'], 422);
        }

        if ($this->domains->normalizeEmail($user->email) !== $invitation->email) {
            AuditLogger::denied($request, 'project_invitation.accept_email_mismatch', 'project_invitation', $invitation->id);
            return response()->json(['message' => 'Invitation email does not match the signed-in user.'], 403);
        }

        $membership = DB::transaction(function () use ($request, $user, $invitation) {
            $project = Project::findOrFail($invitation->project_id);

            if ((int) $project->client_organization_id !== (int) $invitation->client_organization_id) {
                AuditLogger::denied($request, 'project_invitation.accept_stale_project_client', 'project_invitation', $invitation->id);
                abort(response()->json(['message' => 'Invitation is no longer valid for this project.'], 422));
            }

            $organization = ClientOrganization::findOrFail($invitation->client_organization_id);
            $state = $this->membershipStateForAcceptedInvitation($organization, $invitation);

            $membership = ProjectMembership::updateOrCreate(
                [
                    'client_organization_id' => $invitation->client_organization_id,
                    'project_id' => $invitation->project_id,
                    'user_id' => $user->id,
                ],
                [
                    'role' => $invitation->role,
                    'state' => $state,
                    'approved_at' => $state === ProjectMembership::STATE_APPROVED ? now() : null,
                    'approved_by_user_id' => null,
                    'suspended_at' => null,
                    'removed_at' => null,
                ]
            );

            $invitation->update([
                'state' => ProjectInvitation::STATE_ACCEPTED,
                'accepted_by_user_id' => $user->id,
                'accepted_at' => now(),
            ]);

            AuditLogger::record(
                $request,
                'project_invitation.accepted',
                'project_invitation',
                $invitation->id,
                "Invitation accepted by {$user->email}.",
                [
                    'client_organization_id' => $invitation->client_organization_id,
                    'project_id' => $invitation->project_id,
                    'membership_id' => $membership->id,
                    'membership_state' => $membership->state,
                ]
            );

            return $membership;
        });

        return ProjectMembershipResource::make($membership)
            ->response()
            ->setStatusCode(200);
    }

    private function canManageInvitations(User $user, Project $project): bool
    {
        if ($project->client_organization_id === null) {
            return false;
        }

        if ($user->isAdmin()) {
            return true;
        }

        if ($user->isProjectManager()) {
            return $this->pmMayAdminister($user, $project);
        }

        return $this->access->canManageClientMembers($user, $project);
    }

    private function pmMayAdminister(User $user, Project $project): bool
    {
        $hasAnyOwner = ProjectOwnership::where('project_id', $project->id)->exists();

        if (!$hasAnyOwner) {
            return true;
        }

        return Project::query()->ownedBy($user)->whereKey($project->id)->exists();
    }

    private function membershipStateForAcceptedInvitation(
        ClientOrganization $organization,
        ProjectInvitation $invitation,
    ): string {
        if ($organization->trusted_domain_policy !== ClientOrganization::POLICY_DOMAIN_AUTO_APPROVE) {
            return ProjectMembership::STATE_PENDING;
        }

        $verifiedDomain = ClientDomain::query()
            ->where('client_organization_id', $organization->id)
            ->where('domain', $invitation->email_domain)
            ->where('status', ClientDomain::STATUS_VERIFIED)
            ->exists();

        return $verifiedDomain ? ProjectMembership::STATE_APPROVED : ProjectMembership::STATE_PENDING;
    }

}
