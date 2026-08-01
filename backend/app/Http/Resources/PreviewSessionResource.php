<?php

namespace App\Http\Resources;

use App\Support\ProjectClientAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The `store` (start) response is the ONLY place `token` is ever exposed —
 * no GET endpoint re-serves it, and the frontend captures it once into
 * sessionStorage (data-model.md's Response shapes).
 */
class PreviewSessionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'token' => $this->token,
            'target' => [
                'id' => $this->target->id,
                'name' => $this->target->name,
                'role' => $this->target->role,
                'department' => $this->target->department,
                // 012-help-center: computed for the *previewed* user, not
                // the Admin starting the preview — see data-model.md "Two
                // response shapes need this field, not one."
                'client_role' => app(ProjectClientAccess::class)->highestClientRole($this->target),
            ],
            'expires_at' => $this->expires_at,
        ];
    }
}
