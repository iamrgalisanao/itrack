<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CommentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $base = [
            'id' => $this->id,
            'detailed_activity_id' => $this->detailed_activity_id,
            'author' => $this->author,
            'body' => $this->body,
            'visibility' => $this->visibility,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];

        if ($request->user()?->isClient()) {
            return $base;
        }

        return [
            ...$base,
            'author_role' => $this->author_role,
        ];
    }
}
