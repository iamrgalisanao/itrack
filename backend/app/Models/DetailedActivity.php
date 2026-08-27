<?php

namespace App\Models;

use App\Models\Concerns\BelongsToProject;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DetailedActivity extends Model
{
    use HasFactory;
    use BelongsToProject;

    public const PRIORITY_CRITICAL = 'Critical';
    public const PRIORITY_HIGH     = 'High';
    public const PRIORITY_MEDIUM   = 'Medium';
    public const PRIORITY_LOW      = 'Low';

    public const PRIORITIES = [
        self::PRIORITY_CRITICAL,
        self::PRIORITY_HIGH,
        self::PRIORITY_MEDIUM,
        self::PRIORITY_LOW,
    ];

    protected $fillable = [
        'sub_activity_id',
        'code',
        'name',
        'type',
        'description',
        'notes',
        'output',
        'responsible',
        'support',
        'duration_months',
        'duration_days',
        'plan_start_date',
        'plan_end_date',
        'actual_start_date',
        'actual_end_date',
        'status',
        'progress',
        'sort_order',
        'client_visible',
        'work_type',
        'client_name',
        'tenant_name',
        'channel',
        'client_priority',
        'last_client_update_at',
        'next_action',
        'evidence',
        'root_cause',
        'resolution',
        'priority',
        'estimated_story_points',
        'sprint_label',
        'assignee_user_id',
    ];

    protected $casts = [
        'plan_start_date'       => 'date',
        'plan_end_date'         => 'date',
        'actual_start_date'     => 'date',
        'actual_end_date'       => 'date',
        'client_visible'        => 'boolean',
        'last_client_update_at' => 'datetime',
        'estimated_story_points' => 'integer',
    ];

    public function subActivity()
    {
        return $this->belongsTo(SubActivity::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_user_id');
    }

    public function comments()
    {
        return $this->hasMany(Comment::class)->orderBy('created_at', 'asc');
    }

    public function attachments()
    {
        return $this->hasMany(Attachment::class)->orderBy('created_at', 'asc');
    }

    public function predecessors()
    {
        return $this->belongsToMany(DetailedActivity::class, 'task_dependencies', 'task_id', 'predecessor_id')->withTimestamps();
    }

    public function dependents()
    {
        return $this->belongsToMany(DetailedActivity::class, 'task_dependencies', 'predecessor_id', 'task_id')->withTimestamps();
    }

    public function resolveProjectId(): int
    {
        return $this->subActivity->activity->module->project_id;
    }

    /**
     * Constrain to what `$user` may see *within* a project they can already
     * reach. `Project::accessibleTo()` answers "which projects"; this answers
     * "which tasks inside them", which nothing owned before.
     *
     * It exists because `client_visible` was a `where()` every author had to
     * remember, in five query shapes across nine controllers, and it was
     * forgotten in at least seven places -- the dashboard heatmap (a raw join),
     * the Reports tree (an eager load), the sub-activity endpoints (a relation)
     * -- each found by a separate audit rather than by review.
     *
     * Prefer this over an inline where(): it is greppable, so a reviewer can
     * see its absence.
     */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->when(
            $user->isClient(),
            fn (Builder $q) => $q->where('client_visible', true)
        );
    }

    /**
     * 021-dashboard-my-work — "open" is every status except completed.
     * `status` is NOT NULL with a default, so a plain inequality is safe and
     * covers backlog/for_review/blocked, which the dashboard's older
     * four-status counts silently drop.
     */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->where('status', '!=', 'completed');
    }

    /**
     * 009-support-ops-knowledge-base — FR-003/FR-004's inclusion rule: an
     * eligible work type, the same status value the board treats as
     * "Resolved" (matched by value, never by display label), and both
     * root_cause and resolution present and non-blank after trimming.
     */
    public function scopeResolvedWithRecordedFix(Builder $query): Builder
    {
        return $query
            ->whereIn('work_type', ['support', 'learning'])
            ->where('status', 'completed')
            ->whereNotNull('root_cause')
            ->whereRaw("TRIM(root_cause) != ''")
            ->whereNotNull('resolution')
            ->whereRaw("TRIM(resolution) != ''");
    }
}
