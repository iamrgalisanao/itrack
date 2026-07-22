<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A grant record means:
     *   "The Department Head of [grantee_department] can also see projects in [granted_department]."
     *
     * In mock mode, this applies to any persona matching grantee_role + grantee_department.
     * In real auth, this will be replaced with user/group-based grants.
     */
    public function up(): void
    {
        Schema::create('department_grants', function (Blueprint $table) {
            $table->id();

            // Who receives the expanded access
            $table->string('grantee_role');           // e.g. Department Head
            $table->string('grantee_department');     // e.g. Operations

            // Which department they are now allowed to see
            $table->string('granted_department');     // e.g. IT

            // Who granted it (mock-mode: role string; future: user_id)
            $table->string('granted_by_role');
            $table->unsignedBigInteger('granted_by_user_id')->nullable(); // placeholder

            $table->timestamps();

            // Prevent duplicate grants
            $table->unique(['grantee_role', 'grantee_department', 'granted_department'], 'dept_grant_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('department_grants');
    }
};
