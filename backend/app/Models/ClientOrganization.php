<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ClientOrganization extends Model
{
    public const POLICY_DOMAIN_AUTO_APPROVE = 'domain_auto_approve';
    public const POLICY_INVITATION_ONLY = 'invitation_only';
    public const POLICY_MANUAL_APPROVAL = 'manual_approval';

    public const STATUS_ACTIVE = 'active';
    public const STATUS_SUSPENDED = 'suspended';
    public const STATUS_ARCHIVED = 'archived';

    protected $fillable = [
        'name',
        'slug',
        'trusted_domain_policy',
        'status',
        'created_by_user_id',
    ];

    public static function validPolicies(): array
    {
        return [
            self::POLICY_DOMAIN_AUTO_APPROVE,
            self::POLICY_INVITATION_ONLY,
            self::POLICY_MANUAL_APPROVAL,
        ];
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function domains(): HasMany
    {
        return $this->hasMany(ClientDomain::class);
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class);
    }

    public function memberships(): HasMany
    {
        return $this->hasMany(ProjectMembership::class);
    }
}
