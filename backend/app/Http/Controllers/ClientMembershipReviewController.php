<?php

namespace App\Http\Controllers;

use App\Http\Resources\ProjectMembershipResource;
use App\Models\ClientDomain;
use App\Models\ProjectMembership;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\ClientDomainPolicy;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ClientMembershipReviewController extends Controller
{
    public function __construct(private readonly ClientDomainPolicy $domains) {}

    public function index(Request $request)
    {
        $user = $request->user();

        if (!$user->isAdmin() && !$user->isProjectManager()) {
            AuditLogger::denied($request, 'client_membership_review.list', 'project_membership');
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $validated = $request->validate([
            'client_organization_id' => ['sometimes', 'integer', Rule::exists('client_organizations', 'id')],
            'project_id' => ['sometimes', 'integer', Rule::exists('projects', 'id')],
            'domain_type' => ['sometimes', 'string', Rule::in(['verified_corporate', 'public_provider', 'unverified'])],
            'state' => ['sometimes', 'string', Rule::in(ProjectMembership::validStates())],
            'older_than_days' => ['sometimes', 'integer', 'min:0'],
        ]);

        $query = ProjectMembership::query()
            ->with(['user', 'project'])
            ->whereIn('state', $this->reviewStates($validated['state'] ?? null))
            ->latest();

        if (!$user->isAdmin()) {
            $query->whereHas('project', fn (Builder $project) => $this->scopePmAdministeredProjects($project, $user));
        }

        if (isset($validated['client_organization_id'])) {
            $query->where('client_organization_id', $validated['client_organization_id']);
        }

        if (isset($validated['project_id'])) {
            $query->where('project_id', $validated['project_id']);
        }

        if (isset($validated['older_than_days'])) {
            $query->where('created_at', '<=', now()->subDays($validated['older_than_days']));
        }

        $memberships = $query->get();

        if (isset($validated['domain_type'])) {
            $memberships = $memberships
                ->filter(fn (ProjectMembership $membership) => $this->domainType($membership) === $validated['domain_type'])
                ->values();
        }

        return ProjectMembershipResource::collection($memberships);
    }

    private function reviewStates(?string $state): array
    {
        return $state !== null
            ? [$state]
            : [
                ProjectMembership::STATE_PENDING,
                ProjectMembership::STATE_REJECTED,
                ProjectMembership::STATE_EXPIRED,
                ProjectMembership::STATE_SUSPENDED,
                ProjectMembership::STATE_REMOVED,
            ];
    }

    private function scopePmAdministeredProjects(Builder $query, User $user): void
    {
        $query->whereDoesntHave('ownerships')
            ->orWhereHas('ownerships', fn (Builder $owner) => $owner->where('user_id', $user->id));
    }

    private function domainType(ProjectMembership $membership): string
    {
        $domain = $this->domains->domainFromEmail((string) $membership->user?->email);

        if ($domain !== '' && $this->domains->isPublicProvider($domain)) {
            return 'public_provider';
        }

        $verified = $domain !== '' && ClientDomain::query()
            ->where('client_organization_id', $membership->client_organization_id)
            ->where('domain', $domain)
            ->where('status', ClientDomain::STATUS_VERIFIED)
            ->exists();

        return $verified ? 'verified_corporate' : 'unverified';
    }
}
