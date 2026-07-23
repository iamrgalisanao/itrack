<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * Defaults to a safe internal Team Member in IT. Tests that need a specific
     * role/department should override these explicitly via create([...]).
     *
     * `is_active` is explicit here (not left to the migration's DB-level
     * `default(true)`) because `create()` doesn't automatically re-fetch
     * DB-computed defaults into the in-memory model on every driver — and
     * `actingAs()` in tests uses that in-memory instance directly, without
     * re-fetching from the database. Without this, `is_active` would read
     * as `null` in test helpers, and 006-real-user-management's
     * `EnsureUserIsActive` middleware treats a falsy `is_active` as
     * disabled, incorrectly rejecting every test-created user.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'role' => User::ROLE_TEAM_MEMBER,
            'department' => 'IT',
            'is_active' => true,
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
