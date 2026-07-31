<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProjectInvitation extends Model
{
    public const STATE_PENDING = 'pending';
    public const STATE_ACCEPTED = 'accepted';
    public const STATE_EXPIRED = 'expired';
    public const STATE_REVOKED = 'revoked';

    protected $fillable = [
        'client_organization_id',
        'project_id',
        'email',
        'email_domain',
        'role',
        'state',
        'token_hash',
        'invited_by_user_id',
        'accepted_by_user_id',
        'accepted_at',
        'expires_at',
    ];

    protected $hidden = ['token_hash'];

    protected function casts(): array
    {
        return [
            'accepted_at' => 'datetime',
            'expires_at' => 'datetime',
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

    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by_user_id');
    }

    public function acceptedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'accepted_by_user_id');
    }
}
