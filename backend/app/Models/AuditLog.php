<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    /**
     * Audit logs are immutable — no updated_at.
     */
    const UPDATED_AT = null;

    protected $fillable = [
        'action',
        'entity_type',
        'entity_id',
        'actor_role',
        'actor_dept',
        'actor_user_id',
        'actor_name',
        'description',
        'metadata',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'metadata'   => 'array',
        'created_at' => 'datetime',
    ];
}
