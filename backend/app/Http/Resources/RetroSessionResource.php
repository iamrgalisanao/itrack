<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RetroSessionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'project_id' => $this->project_id,
            'label' => $this->label,
            'created_by' => $this->createdBy->name,
            'created_at' => $this->created_at,
            'entry_count' => $this->entries()->count(),
        ];
    }
}
