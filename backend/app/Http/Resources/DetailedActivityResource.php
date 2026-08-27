<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use App\Support\AccessContext;
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
            // Schedule geometry, not internal commentary. These sat in the
            // internal branch because that split was drawn for the flat
            // /detailed-activities endpoint, where nothing rendered a timeline.
            // The module tree feeds Schedule and Work Program, and neither
            // /schedule nor /work-program is role-guarded (App.jsx:699, :688),
            // so Clients reach both: Schedule.jsx:367 detects a milestone as
            // `duration_months === 0 && duration_days === 0`, which silently
            // becomes false when the keys are absent. Withholding them
            // discloses nothing either -- a Client already receives
            // plan_start_date and plan_end_date, from which duration derives.
            'duration_months' => $this->duration_months,
            'duration_days' => $this->duration_days,
            'client_visible' => $this->client_visible,
            // Produced by ModuleController's withCount, and already scoped to
            // client-visible comments for a Client. Sole producer, so it must
            // survive the move to this resource: Schedule.jsx reads it at six
            // call sites and TaskDetailModal at two, all `?? 0`, so losing it
            // shows as a silent 0 rather than an error.
            'comments_count' => $this->whenCounted('comments'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];

        if (AccessContext::user($request)->isClient()) {
            return $base;
        }

        return [
            ...$base,
            'notes' => $this->notes,
            'output' => $this->output,
            'responsible' => $this->responsible,
            'support' => $this->support,
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
            // 018-taskboard: internal-only fields, same treatment as
            // notes/responsible above — never added to the Client branch.
            'priority' => $this->priority,
            'estimated_story_points' => $this->estimated_story_points,
            'sprint_label' => $this->sprint_label,
            'assignee_user_id' => $this->assignee_user_id,
            'assignee' => $this->whenLoaded('assignee', fn () => $this->assignee ? [
                'id' => $this->assignee->id,
                'name' => $this->assignee->name,
            ] : null),
            'module' => $this->whenLoaded('subActivity', function () {
                $module = $this->subActivity?->activity?->module;
                return $module ? ['id' => $module->id, 'name' => $module->name] : null;
            }),
        ];
    }
}
