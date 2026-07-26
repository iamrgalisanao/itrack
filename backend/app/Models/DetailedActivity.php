<?php

namespace App\Models;

use App\Models\Concerns\BelongsToProject;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DetailedActivity extends Model
{
    use HasFactory;
    use BelongsToProject;

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
    ];

    protected $casts = [
        'plan_start_date'       => 'date',
        'plan_end_date'         => 'date',
        'actual_start_date'     => 'date',
        'actual_end_date'       => 'date',
        'client_visible'        => 'boolean',
        'last_client_update_at' => 'datetime',
    ];

    public function subActivity()
    {
        return $this->belongsTo(SubActivity::class);
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
