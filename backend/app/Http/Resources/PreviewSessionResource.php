<?php

namespace App\Http\Resources;

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
            ],
            'expires_at' => $this->expires_at,
        ];
    }
}
