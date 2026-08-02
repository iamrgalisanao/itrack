<?php

namespace App\Models;

use App\Models\Concerns\BelongsToProject;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Bug extends Model
{
    use BelongsToProject;
    use SoftDeletes;

    public const STATUS_AWAITING_REVIEW = 'Awaiting Review';
    public const STATUS_READY_FOR_DEV   = 'Ready for Dev';
    public const STATUS_FIXING          = 'Fixing';
    public const STATUS_FIXED           = 'Fixed';

    public const STATUSES = [
        self::STATUS_AWAITING_REVIEW,
        self::STATUS_READY_FOR_DEV,
        self::STATUS_FIXING,
        self::STATUS_FIXED,
    ];

    public const PRIORITY_CRITICAL = 'Critical';
    public const PRIORITY_HIGH     = 'High';
    public const PRIORITY_MEDIUM   = 'Medium';
    public const PRIORITY_LOW      = 'Low';

    public const PRIORITIES = [
        self::PRIORITY_CRITICAL,
        self::PRIORITY_HIGH,
        self::PRIORITY_MEDIUM,
        self::PRIORITY_LOW,
    ];

    public const VISIBILITY_INTERNAL       = 'internal';
    public const VISIBILITY_CLIENT_VISIBLE = 'client_visible';

    public const VISIBILITIES = [
        self::VISIBILITY_INTERNAL,
        self::VISIBILITY_CLIENT_VISIBLE,
    ];

    public const GROUP_INCOMING          = 'Incoming';
    public const GROUP_DEVELOPMENT_WORK  = 'Development Work';
    public const GROUP_RESOLVED          = 'Resolved';

    /**
     * research.md D4: status is a free 4-value selection, never a gated
     * workflow — this map is a pure display grouping, not a state machine.
     */
    private const STATUS_GROUP_MAP = [
        self::STATUS_AWAITING_REVIEW => self::GROUP_INCOMING,
        self::STATUS_READY_FOR_DEV   => self::GROUP_DEVELOPMENT_WORK,
        self::STATUS_FIXING          => self::GROUP_DEVELOPMENT_WORK,
        self::STATUS_FIXED           => self::GROUP_RESOLVED,
    ];

    protected $fillable = [
        'title',
        'description',
        'reporter_id',
        'owner_id',
        'priority',
        'status',
        'sprint_label',
        'due_date',
        'visibility',
    ];

    protected $casts = [
        'due_date' => 'date',
        'breach_notified_at' => 'datetime',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_id');
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function resolveProjectId(): int
    {
        return $this->project_id;
    }

    public function getGroupAttribute(): string
    {
        return self::STATUS_GROUP_MAP[$this->status] ?? self::GROUP_INCOMING;
    }

    public function getBugIdAttribute(): string
    {
        return 'BUG-' . str_pad((string) $this->bug_number, 3, '0', STR_PAD_LEFT);
    }

    public function getIsOverdueAttribute(): bool
    {
        return $this->due_date !== null
            && $this->status !== self::STATUS_FIXED
            && $this->due_date->isPast();
    }
}
