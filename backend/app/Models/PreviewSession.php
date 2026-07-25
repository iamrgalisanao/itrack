<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreviewSession extends Model
{
    protected $fillable = ['admin_user_id', 'target_user_id', 'target_role_at_start', 'token', 'started_at', 'ended_at', 'expires_at'];

    protected $casts = [
        'started_at' => 'datetime',
        'ended_at'   => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_user_id');
    }

    public function target(): BelongsTo
    {
        return $this->belongsTo(User::class, 'target_user_id');
    }

    /**
     * Returns the specific invalidity reason, or null if still active — the
     * caller (ResolvePreviewSession middleware) uses this both to decide
     * validity and to audit why (FR-019). Re-checked fresh against the
     * target's current row on every call, never cached, so a mid-session
     * disable or role change is detected on the very next request.
     */
    public function invalidReason(): ?string
    {
        if ($this->ended_at !== null) {
            return 'manual';
        }
        if ($this->expires_at->isPast()) {
            return 'expired';
        }

        $target = $this->target()->first();
        if ($target === null || !$target->is_active) {
            return 'target_disabled';
        }
        if ($target->role !== $this->target_role_at_start) {
            return 'target_role_changed';
        }

        return null;
    }
}
