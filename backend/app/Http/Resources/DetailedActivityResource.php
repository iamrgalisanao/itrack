<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DetailedActivityResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $base = [
            'id' => $this->id,
            'sub_activity_id' => $this->sub_activity_id,
            'code' => $this->code,
            'name' => $this->name,
            'type' => $this->type,
            'description' => $this->description,
            'plan_start_date' => $this->plan_start_date,
            'plan_end_date' => $this->plan_end_date,
            'actual_start_date' => $this->actual_start_date,
            'actual_end_date' => $this->actual_end_date,
            'status' => $this->status,
            'progress' => $this->progress,
            'client_visible' => $this->client_visible,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];

        if ($request->user()?->isClient()) {
            return $base;
        }

        return [
            ...$base,
            'notes' => $this->notes,
            'output' => $this->output,
            'responsible' => $this->responsible,
            'support' => $this->support,
            'duration_months' => $this->duration_months,
            'duration_days' => $this->duration_days,
            'sort_order' => $this->sort_order,
            'work_type' => $this->work_type,
            'client_name' => $this->client_name,
            'tenant_name' => $this->tenant_name,
            'channel' => $this->channel,
            'client_priority' => $this->client_priority,
            'last_client_update_at' => $this->last_client_update_at,
            'next_action' => $this->next_action,
            'evidence' => $this->evidence,
            'root_cause' => $this->root_cause,
            'resolution' => $this->resolution,
        ];
    }
}
