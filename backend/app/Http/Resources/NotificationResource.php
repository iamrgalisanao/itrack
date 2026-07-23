<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * New code under Constitution Principle II — NotificationController
 * previously returned raw Eloquent models (pre-constitution code, same
 * pattern SupportIssueResource's docblock calls out for
 * DetailedActivityController). This feature already touches the same
 * query path (005-support-ops-automation's recipient-aware retrieval
 * correction), which is a reasonable moment to fix the response shape too.
 */
class NotificationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                    => $this->id,
            'user_role'             => $this->user_role,
            'type'                  => $this->type,
            'severity'              => $this->severity,
            'title'                 => $this->title,
            'message'               => $this->message,
            'detailed_activity_id'  => $this->detailed_activity_id,
            'link_url'              => $this->link_url,
            'event_key'             => $this->event_key,
            'event_date'            => $this->event_date?->toDateString(),
            'metadata'              => $this->metadata,
            'is_read'               => $this->is_read,
            'read_at'               => $this->read_at?->toIso8601String(),
            'created_at'            => $this->created_at?->toIso8601String(),
        ];
    }
}
