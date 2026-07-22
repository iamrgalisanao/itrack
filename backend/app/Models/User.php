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

#[Fillable(['name', 'email', 'password', 'role', 'department'])]
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
        ];
    }
}
