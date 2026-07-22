<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Activity extends Model
{
    use HasFactory;

    protected $fillable = [
        'module_id',
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

    public function module()
    {
        return $this->belongsTo(Module::class);
    }

    public function subActivities()
    {
        return $this->hasMany(SubActivity::class)->orderBy('sort_order');
    }
}
