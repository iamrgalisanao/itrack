<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\HidesInternalPlanningFields;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ModuleResource extends JsonResource
{
    use HidesInternalPlanningFields;

    public function toArray(Request $request): array
    {
        return $this->withoutInternalPlanningFields($request, [
            'id' => $this->id,
            'project_id' => $this->project_id,
            'code' => $this->code,
            'name' => $this->name,
            'description' => $this->description,
            'output' => $this->output,
            'responsible' => $this->responsible,
            'support' => $this->support,
            'duration_months' => $this->duration_months,
            'duration_days' => $this->duration_days,
            'plan_start_date' => $this->plan_start_date,
            'plan_end_date' => $this->plan_end_date,
            'sort_order' => $this->sort_order,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ]);
    }
}
