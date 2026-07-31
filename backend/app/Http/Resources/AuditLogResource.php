<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'action' => $this->action,
            'entity_type' => $this->entity_type,
            'entity_id' => $this->entity_id,
            'actor_role' => $this->actor_role,
            'actor_dept' => $this->actor_dept,
            'actor_user_id' => $this->actor_user_id,
            'actor_name' => $this->actor_name,
            'message' => $this->description,
            'context' => $this->metadata,
            'created_at' => $this->created_at,
        ];
    }
}
