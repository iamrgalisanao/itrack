<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Attachment extends Model
{
    /**
     * Visibility constants — mirrors the Comment model pattern.
     */
    public const VISIBILITY_INTERNAL       = 'internal';
    public const VISIBILITY_CLIENT_VISIBLE = 'client_visible';

    protected $fillable = [
        'detailed_activity_id',
        'uploader',
        'uploader_role',
        'uploaded_by_user_id',
        'original_name',
        'stored_name',
        'disk',
        'path',
        'mime_type',
        'size_bytes',
        'visibility',
    ];

    /**
     * Fields that must never be returned in API responses.
     * The storage path must not be exposed to the frontend.
     */
    protected $hidden = ['path'];

    public function detailedActivity()
    {
        return $this->belongsTo(DetailedActivity::class);
    }

    /**
     * Accessor: human-readable file size (e.g. "2.4 MB", "450 KB").
     */
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

    /**
     * Append the human_size accessor automatically to serialised output.
     */
    protected $appends = ['human_size'];
}
