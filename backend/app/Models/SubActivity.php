<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SubActivity extends Model
{
    use HasFactory;

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
}
