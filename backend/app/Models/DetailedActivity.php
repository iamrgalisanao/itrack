<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DetailedActivity extends Model
{
    use HasFactory;

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
}
