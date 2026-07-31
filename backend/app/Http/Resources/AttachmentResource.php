<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttachmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $base = [
            'id' => $this->id,
            'detailed_activity_id' => $this->detailed_activity_id,
            'uploader' => $this->uploader,
            'original_name' => $this->original_name,
            'mime_type' => $this->mime_type,
            'size_bytes' => $this->size_bytes,
            'human_size' => $this->human_size,
            'visibility' => $this->visibility,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];

        if ($request->user()?->isClient()) {
            return $base;
        }

        return [
            ...$base,
            'uploader_role' => $this->uploader_role,
            'uploaded_by_user_id' => $this->uploaded_by_user_id,
            'stored_name' => $this->stored_name,
            'disk' => $this->disk,
        ];
    }
}
