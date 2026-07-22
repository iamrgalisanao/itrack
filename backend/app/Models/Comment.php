<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Comment extends Model
{
    /**
     * Visibility constants — use these everywhere to avoid typos.
     */
    const VISIBILITY_INTERNAL      = 'internal';
    const VISIBILITY_CLIENT_VISIBLE = 'client_visible';

    protected $fillable = [
        'detailed_activity_id',
        'author',
        'author_role',
        'body',
        'visibility',
    ];

    public function detailedActivity()
    {
        return $this->belongsTo(DetailedActivity::class);
    }
}
