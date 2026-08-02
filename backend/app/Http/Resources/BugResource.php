<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BugResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'project_id' => $this->project_id,
            'bug_id' => $this->bug_id,
            'title' => $this->title,
            'description' => $this->description,
            'reporter' => $this->reporter?->name,
            'reporter_id' => $this->reporter_id,
            'owner' => $this->owner?->name,
            'owner_id' => $this->owner_id,
            'priority' => $this->priority,
            'status' => $this->status,
            'group' => $this->group,
            'sprint_label' => $this->sprint_label,
            'due_date' => $this->due_date?->toDateString(),
            'is_overdue' => $this->is_overdue,
            'visibility' => $this->visibility,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
