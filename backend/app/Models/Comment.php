<?php

namespace App\Models;

use App\Models\Concerns\BelongsToProject;
use Illuminate\Database\Eloquent\Model;

class Comment extends Model
{
    use BelongsToProject;

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

    public function resolveProjectId(): int
    {
        return $this->detailedActivity->subActivity->activity->module->project_id;
    }
}
