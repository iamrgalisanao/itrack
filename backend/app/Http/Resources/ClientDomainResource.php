<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ClientDomainResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'client_organization_id' => $this->client_organization_id,
            'domain' => $this->domain,
            'status' => $this->status,
            'verified_at' => $this->verified_at,
            'verified_by_user_id' => $this->verified_by_user_id,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
