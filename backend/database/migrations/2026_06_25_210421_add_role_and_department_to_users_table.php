<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add system role and department columns to the users table.
     *
     * `role` is intentionally nullable with NO database default: a user with a
     * null role is treated as unauthorized for privileged actions (fail-safe),
     * rather than being silently promoted to "Team Member". Seeded users always
     * receive an explicit role.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role')->nullable()->index()->after('email');
            $table->string('department')->nullable()->index()->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['role']);
            $table->dropIndex(['department']);
            $table->dropColumn(['role', 'department']);
        });
    }
};
