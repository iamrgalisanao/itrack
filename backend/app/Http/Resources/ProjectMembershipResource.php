<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectMembershipResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'client_organization_id' => $this->client_organization_id,
            'project_id' => $this->project_id,
            'user_id' => $this->user_id,
            'role' => $this->role,
            'state' => $this->state,
            'approved_at' => $this->approved_at,
            'approved_by_user_id' => $this->approved_by_user_id,
            'suspended_at' => $this->suspended_at,
            'removed_at' => $this->removed_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
