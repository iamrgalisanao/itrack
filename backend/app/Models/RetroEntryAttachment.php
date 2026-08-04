<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RetroEntryAttachment extends Model
{
    protected $fillable = [
        'retro_entry_id',
        'uploaded_by_user_id',
        'original_name',
        'stored_name',
        'disk',
        'path',
        'mime_type',
        'size_bytes',
    ];

    /**
     * The storage path must not be exposed to the frontend.
     */
    protected $hidden = ['path'];

    protected $appends = ['human_size'];

    public function entry(): BelongsTo
    {
        return $this->belongsTo(RetroEntry::class, 'retro_entry_id');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by_user_id');
    }

    public function getHumanSizeAttribute(): string
    {
        $bytes = $this->size_bytes;
        if ($bytes >= 1_048_576) {
            return round($bytes / 1_048_576, 1) . ' MB';
        }
        if ($bytes >= 1_024) {
            return round($bytes / 1_024, 0) . ' KB';
        }
        return $bytes . ' B';
    }
}
