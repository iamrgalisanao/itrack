<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RetroEntryAttachmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'entry_id' => $this->retro_entry_id,
            'uploader' => $this->uploader->name,
            'uploader_id' => $this->uploaded_by_user_id,
            'original_name' => $this->original_name,
            'mime_type' => $this->mime_type,
            'size_bytes' => $this->size_bytes,
            'human_size' => $this->human_size,
            'created_at' => $this->created_at,
        ];
    }
}
