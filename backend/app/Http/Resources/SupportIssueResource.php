<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * New code under Constitution Principle II — unlike the pre-existing
 * DetailedActivityController (which predates the constitution and returns
 * raw Eloquent models), SupportOpsController returns through this resource.
 */
class SupportIssueResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                    => $this->id,
            'name'                  => $this->name,
            'work_type'             => $this->work_type,
            'status'                => $this->status,
            'client_name'           => $this->client_name,
            'tenant_name'           => $this->tenant_name,
            'channel'               => $this->channel,
            'client_priority'       => $this->client_priority,
            'last_client_update_at' => $this->last_client_update_at?->toIso8601String(),
            'next_action'           => $this->next_action,
            'evidence'              => $this->evidence,
            'root_cause'            => $this->root_cause,
            'resolution'            => $this->resolution,
            'description'           => $this->description,
            'progress'              => $this->progress,
            'responsible'           => $this->responsible,
            'client_visible'        => $this->client_visible,
            'created_at'            => $this->created_at?->toIso8601String(),
            'updated_at'            => $this->updated_at?->toIso8601String(),
        ];
    }
}
