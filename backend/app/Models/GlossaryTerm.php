<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GlossaryTerm extends Model
{
    protected $fillable = [
        'number',
        'term',
        'definition',
    ];
}
