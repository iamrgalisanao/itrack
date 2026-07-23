<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Same field set as SupportIssueResource, plus a nested `project` label
 * (FR-007) and an `overdue_since` field the controller attaches only to
 * items in the `stale` bucket (contracts/today-dashboard-api.md).
 */
class TodaySupportIssueResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $project = $this->subActivity?->activity?->module?->project;

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
            'project'               => $project ? ['id' => $project->id, 'name' => $project->name] : null,
            'overdue_since'         => $this->when($this->overdue_since !== null, fn () => $this->overdue_since),
        ];
    }
}
