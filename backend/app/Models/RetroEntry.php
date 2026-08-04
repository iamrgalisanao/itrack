<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RetroEntry extends Model
{
    public const SENTIMENT_KEEP = 'keep';
    public const SENTIMENT_IMPROVE = 'improve';
    public const SENTIMENT_DISCUSS = 'discuss';

    public const SENTIMENTS = [
        self::SENTIMENT_KEEP,
        self::SENTIMENT_IMPROVE,
        self::SENTIMENT_DISCUSS,
    ];

    protected $fillable = [
        'retro_session_id',
        'author_user_id',
        'body',
        'sentiment',
        'is_repeating',
        'owner_user_id',
        'decision',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(RetroSession::class, 'retro_session_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_user_id');
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function votes(): HasMany
    {
        return $this->hasMany(RetroEntryVote::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(RetroEntryComment::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(RetroEntryAttachment::class);
    }
}
