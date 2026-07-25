<?php

namespace App\Models;

use App\Models\Concerns\BelongsToProject;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SubActivity extends Model
{
    use HasFactory;
    use BelongsToProject;

    protected $fillable = [
        'activity_id',
        'code',
        'name',
        'type',
        'description',
        'output',
        'responsible',
        'support',
        'duration_months',
        'duration_days',
        'plan_start_date',
        'plan_end_date',
        'sort_order',
    ];

    protected $casts = [
        'plan_start_date' => 'date',
        'plan_end_date' => 'date',
    ];

    public function activity()
    {
        return $this->belongsTo(Activity::class);
    }

    public function detailedActivities()
    {
        return $this->hasMany(DetailedActivity::class)->orderBy('sort_order');
    }

    public function resolveProjectId(): int
    {
        return $this->activity->module->project_id;
    }
}
