<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Module extends Model
{
    use HasFactory;

    protected $fillable = [
        'project_id',
        'code',
        'name',
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

    public function project()
    {
        return $this->belongsTo(Project::class);
    }

    public function activities()
    {
        return $this->hasMany(Activity::class)->orderBy('sort_order');
    }
}
