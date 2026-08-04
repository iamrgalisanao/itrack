<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RetroEntryVote extends Model
{
    protected $fillable = ['retro_entry_id', 'user_id'];

    public function entry(): BelongsTo
    {
        return $this->belongsTo(RetroEntry::class, 'retro_entry_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
