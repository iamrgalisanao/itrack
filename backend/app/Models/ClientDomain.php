<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientDomain extends Model
{
    public const STATUS_VERIFIED = 'verified';
    public const STATUS_REMOVED = 'removed';

    protected $fillable = [
        'client_organization_id',
        'domain',
        'status',
        'verified_at',
        'verified_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'verified_at' => 'datetime',
        ];
    }

    public function clientOrganization(): BelongsTo
    {
        return $this->belongsTo(ClientOrganization::class);
    }

    public function verifiedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by_user_id');
    }
}
