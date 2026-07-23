<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Traits\HasRole;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'role', 'department', 'is_active'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRole, Notifiable;

    /**
     * The five v1 system roles. These literals are the single source of truth —
     * never compare against raw strings; use the HasRole trait predicates or
     * these constants to avoid casing drift.
     */
    public const ROLE_ADMIN            = 'Admin';
    public const ROLE_PROJECT_MANAGER  = 'Project Manager';
    public const ROLE_DEPARTMENT_HEAD  = 'Department Head';
    public const ROLE_TEAM_MEMBER      = 'Team Member';
    public const ROLE_CLIENT           = 'Client';

    /**
     * All valid system roles.
     *
     * @return string[]
     */
    public static function validRoles(): array
    {
        return [
            self::ROLE_ADMIN,
            self::ROLE_PROJECT_MANAGER,
            self::ROLE_DEPARTMENT_HEAD,
            self::ROLE_TEAM_MEMBER,
            self::ROLE_CLIENT,
        ];
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    /**
     * FR-007/SC-005 (006-real-user-management): would applying
     * $proposedChanges to this user leave the system with zero enabled
     * Admins? Deliberately takes no acting-user parameter — it evaluates
     * purely on this target's resulting state, so it cannot special-case
     * "am I editing myself" vs. "am I editing someone else" even in
     * principle (see tests/Unit/UserTest.php's docblock).
     *
     * Locks the enabled-Admin rows (`lockForUpdate()`) so a concurrent
     * caller re-reading the count blocks until this one's surrounding
     * transaction commits or rolls back (research.md's "must be
     * transactional" decision). **This method does not open its own
     * transaction** — it must always be called from inside the caller's
     * `DB::transaction()` closure, with the subsequent write happening in
     * that *same* closure, before it commits. If this method opened and
     * committed its own transaction here, the lock would be released
     * before the caller's write even ran, defeating the whole point —
     * see `UserManagementController::update()`/`disable()` for the correct
     * usage.
     */
    public function wouldLeaveNoEnabledAdmins(array $proposedChanges): bool
    {
        if ($this->role !== self::ROLE_ADMIN || !$this->is_active) {
            return false;
        }

        $becomesNonAdminOrDisabled =
            (array_key_exists('role', $proposedChanges) && $proposedChanges['role'] !== self::ROLE_ADMIN)
            || (array_key_exists('is_active', $proposedChanges) && $proposedChanges['is_active'] === false);

        if (!$becomesNonAdminOrDisabled) {
            return false;
        }

        $enabledAdminCount = self::query()
            ->where('role', self::ROLE_ADMIN)
            ->where('is_active', true)
            ->lockForUpdate()
            ->count();

        return $enabledAdminCount <= 1;
    }
}
