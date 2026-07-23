<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * New code under Constitution Principle II (006-real-user-management) —
 * an explicit field allow-list, not just reliance on the model's
 * `#[Hidden(['password', 'remember_token'])]` attribute, which only
 * protects direct model serialization, not necessarily every path a
 * Resource might read the model through.
 */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'         => $this->id,
            'name'       => $this->name,
            'email'      => $this->email,
            'role'       => $this->role,
            'department' => $this->department,
            'is_active'  => $this->is_active,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
