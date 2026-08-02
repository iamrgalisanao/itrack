<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RetroEntryCommentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'entry_id' => $this->retro_entry_id,
            'author' => $this->author->name,
            'author_id' => $this->author_user_id,
            'body' => $this->body,
            'created_at' => $this->created_at,
        ];
    }
}
