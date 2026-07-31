<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectMembership extends Model
{
    public const STATE_PENDING = 'pending';
    public const STATE_APPROVED = 'approved';
    public const STATE_REJECTED = 'rejected';
    public const STATE_EXPIRED = 'expired';
    public const STATE_SUSPENDED = 'suspended';
    public const STATE_REMOVED = 'removed';

    public const ROLE_CLIENT_VIEWER = 'client_viewer';
    public const ROLE_CLIENT_CONTRIBUTOR = 'client_contributor';
    public const ROLE_CLIENT_ADMIN = 'client_admin';

    protected $fillable = [
        'client_organization_id',
        'project_id',
        'user_id',
        'role',
        'state',
        'approved_at',
        'approved_by_user_id',
        'suspended_at',
        'removed_at',
    ];

    protected function casts(): array
    {
        return [
            'approved_at' => 'datetime',
            'suspended_at' => 'datetime',
            'removed_at' => 'datetime',
        ];
    }

    public static function validStates(): array
    {
        return [
            self::STATE_PENDING,
            self::STATE_APPROVED,
            self::STATE_REJECTED,
            self::STATE_EXPIRED,
            self::STATE_SUSPENDED,
            self::STATE_REMOVED,
        ];
    }

    public static function validRoles(): array
    {
        return [
            self::ROLE_CLIENT_VIEWER,
            self::ROLE_CLIENT_CONTRIBUTOR,
            self::ROLE_CLIENT_ADMIN,
        ];
    }

    public function clientOrganization(): BelongsTo
    {
        return $this->belongsTo(ClientOrganization::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }
}
