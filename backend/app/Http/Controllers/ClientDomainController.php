<?php

namespace App\Http\Controllers;

use App\Support\AccessContext;
use App\Http\Resources\ClientDomainResource;
use App\Models\ClientDomain;
use App\Models\ClientOrganization;
use App\Services\AuditLogger;
use App\Services\ClientDomainPolicy;
use Illuminate\Http\Request;

class ClientDomainController extends Controller
{
    public function __construct(private readonly ClientDomainPolicy $domains) {}

    public function index(Request $request, ClientOrganization $clientOrganization)
    {
        if (!AccessContext::user($request)->isPmOrAdmin()) {
            AuditLogger::denied($request, 'client_domain.list', 'client_organization', $clientOrganization->id);
            return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can view client domains.'], 403);
        }

        return ClientDomainResource::collection($clientOrganization->domains()->orderBy('domain')->get());
    }

    public function store(Request $request, ClientOrganization $clientOrganization)
    {
        $user = AccessContext::user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'client_domain.create', 'client_organization', $clientOrganization->id);
            return response()->json(['message' => 'Unauthorized: Only Admins can verify client domains.'], 403);
        }

        $validated = $request->validate([
            'domain' => ['required', 'string', 'max:255'],
        ]);

        $domain = $this->domains->normalizeDomain($validated['domain']);

        if ($domain === '' || !str_contains($domain, '.')) {
            return response()->json(['message' => 'The domain must be a valid corporate domain.'], 422);
        }

        if ($this->domains->isPublicProvider($domain)) {
            return response()->json(['message' => 'Public email providers cannot be verified as corporate domains.'], 422);
        }

        $clientDomain = ClientDomain::where('domain', $domain)->first();

        if ($clientDomain && (int) $clientDomain->client_organization_id !== (int) $clientOrganization->id) {
            return response()->json(['message' => 'This domain is already associated with another client organization.'], 422);
        }

        if ($clientDomain && $clientDomain->status === ClientDomain::STATUS_VERIFIED) {
            return response()->json(['message' => 'This domain is already verified for this client organization.'], 422);
        }

        $attributes = [
            'client_organization_id' => $clientOrganization->id,
            'domain' => $domain,
            'status' => ClientDomain::STATUS_VERIFIED,
            'verified_at' => now(),
            'verified_by_user_id' => $user->id,
        ];

        if ($clientDomain) {
            $clientDomain->update($attributes);
        } else {
            $clientDomain = ClientDomain::create($attributes);
        }

        AuditLogger::record(
            $request,
            'client_domain.verified',
            'client_domain',
            $clientDomain->id,
            "Domain \"{$domain}\" verified.",
            ['client_organization_id' => $clientOrganization->id, 'domain' => $domain]
        );

        return ClientDomainResource::make($clientDomain)
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(Request $request, ClientDomain $clientDomain)
    {
        $user = AccessContext::user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'client_domain.remove', 'client_domain', $clientDomain->id);
            return response()->json(['message' => 'Unauthorized: Only Admins can remove client domains.'], 403);
        }

        $clientDomain->update(['status' => ClientDomain::STATUS_REMOVED]);

        AuditLogger::record(
            $request,
            'client_domain.removed',
            'client_domain',
            $clientDomain->id,
            "Domain \"{$clientDomain->domain}\" removed.",
            ['client_organization_id' => $clientDomain->client_organization_id, 'domain' => $clientDomain->domain]
        );

        return response()->noContent();
    }
}
