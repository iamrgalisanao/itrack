<?php

namespace App\Http\Controllers;

use App\Support\AccessContext;
use App\Http\Resources\ClientOrganizationResource;
use App\Models\ClientOrganization;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ClientOrganizationController extends Controller
{
    public function index(Request $request)
    {
        $user = AccessContext::user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'client_organization.list', 'client_organization');
            return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can view client organizations.'], 403);
        }

        return ClientOrganizationResource::collection(ClientOrganization::orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $user = AccessContext::user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'client_organization.create', 'client_organization');
            return response()->json(['message' => 'Unauthorized: Only Admins can create client organizations.'], 403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'trusted_domain_policy' => ['sometimes', Rule::in(ClientOrganization::validPolicies())],
        ]);

        $baseSlug = Str::slug($validated['name']);
        $slug = $baseSlug;
        $i = 2;
        while (ClientOrganization::where('slug', $slug)->exists()) {
            $slug = "{$baseSlug}-{$i}";
            $i++;
        }

        $organization = ClientOrganization::create([
            'name' => $validated['name'],
            'slug' => $slug,
            'trusted_domain_policy' => $validated['trusted_domain_policy'] ?? ClientOrganization::POLICY_MANUAL_APPROVAL,
            'status' => ClientOrganization::STATUS_ACTIVE,
            'created_by_user_id' => $user->id,
        ]);

        AuditLogger::record(
            $request,
            'client_organization.created',
            'client_organization',
            $organization->id,
            "Client organization \"{$organization->name}\" created.",
            ['client_organization_id' => $organization->id]
        );

        return ClientOrganizationResource::make($organization)
            ->response()
            ->setStatusCode(201);
    }

    public function updateTrustedDomainPolicy(Request $request, ClientOrganization $clientOrganization)
    {
        $user = AccessContext::user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'trusted_domain_policy.update', 'client_organization', $clientOrganization->id);
            return response()->json(['message' => 'Unauthorized: Only Admins can update trusted-domain policy.'], 403);
        }

        $validated = $request->validate([
            'trusted_domain_policy' => ['required', Rule::in(ClientOrganization::validPolicies())],
        ]);

        $oldPolicy = $clientOrganization->trusted_domain_policy;
        $clientOrganization->update(['trusted_domain_policy' => $validated['trusted_domain_policy']]);

        AuditLogger::record(
            $request,
            'trusted_domain_policy.updated',
            'client_organization',
            $clientOrganization->id,
            "Trusted-domain policy changed for \"{$clientOrganization->name}\".",
            [
                'client_organization_id' => $clientOrganization->id,
                'old_policy' => $oldPolicy,
                'new_policy' => $clientOrganization->trusted_domain_policy,
            ]
        );

        return ClientOrganizationResource::make($clientOrganization);
    }
}
