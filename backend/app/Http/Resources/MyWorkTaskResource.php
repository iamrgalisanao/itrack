<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * 021-dashboard-my-work: a My Work list row.
 *
 * Deliberately narrower than DetailedActivityResource. That resource carries
 * the Support Ops fields (root_cause, resolution, evidence, client_name,
 * tenant_name) plus description/notes, none of which a dashboard list row
 * renders — shipping them would be excessive exposure for no benefit. The
 * full task is fetched from GET /api/detailed-activities/{id} when a row is
 * opened in the detail modal.
 */
class MyWorkTaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $subActivity = $this->whenLoaded('subActivity');
        $activity = $subActivity?->activity;
        $module = $activity?->module;
        $project = $module?->project;

        return [
            'id'              => $this->id,
            'name'            => $this->name,
            'code'            => $this->code,
            'status'          => $this->status,
            'progress'        => $this->progress,
            'plan_end_date'   => $this->plan_end_date?->toDateString(),
            'priority'        => $this->priority,
            'sub_activity_id' => $this->sub_activity_id,
            'project'         => $project ? ['id' => $project->id, 'name' => $project->name] : null,
            'module'          => $module ? ['id' => $module->id, 'name' => $module->name] : null,
        ];
    }
}
