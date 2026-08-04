<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RetroEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'session_id' => $this->retro_session_id,
            'author' => $this->author->name,
            'author_id' => $this->author_user_id,
            'body' => $this->body,
            'sentiment' => $this->sentiment,
            'is_repeating' => (bool) $this->is_repeating,
            'decision' => $this->decision,
            'vote_count' => $this->votes()->count(),
            'voted_by_me' => $request->user()
                ? $this->votes()->where('user_id', $request->user()->id)->exists()
                : false,
            'owner' => $this->owner?->name,
            'owner_id' => $this->owner_user_id,
            'created_at' => $this->created_at,
        ];
    }
}
