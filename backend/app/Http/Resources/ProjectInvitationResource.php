<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectInvitationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'client_organization_id' => $this->client_organization_id,
            'project_id' => $this->project_id,
            'email' => $this->email,
            'email_domain' => $this->email_domain,
            'role' => $this->role,
            'state' => $this->state,
            'invited_by_user_id' => $this->invited_by_user_id,
            'accepted_by_user_id' => $this->accepted_by_user_id,
            'accepted_at' => $this->accepted_at,
            'expires_at' => $this->expires_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
