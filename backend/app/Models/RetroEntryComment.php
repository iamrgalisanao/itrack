<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RetroEntryComment extends Model
{
    protected $fillable = [
        'retro_entry_id',
        'author_user_id',
        'body',
    ];

    public function entry(): BelongsTo
    {
        return $this->belongsTo(RetroEntry::class, 'retro_entry_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_user_id');
    }
}
