<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();

            // What happened
            $table->string('action');                               // e.g. project.created, task.status_changed
            $table->string('entity_type');                         // e.g. project, detailed_activity, team_member
            $table->unsignedBigInteger('entity_id')->nullable();

            // Who did it (mock-mode: role-based; future: user-based)
            $table->string('actor_role');
            $table->string('actor_dept')->nullable();
            $table->unsignedBigInteger('actor_user_id')->nullable(); // placeholder for real auth
            $table->string('actor_name')->nullable();                // display name

            // Human-readable + structured context
            $table->text('description')->nullable();
            $table->json('metadata')->nullable();

            // Security context
            $table->string('ip_address', 45)->nullable();           // supports IPv6
            $table->text('user_agent')->nullable();

            // Immutable — no updated_at
            $table->timestamp('created_at')->useCurrent();

            // Indexes for Admin filtering
            $table->index('action');
            $table->index('entity_type');
            $table->index('entity_id');
            $table->index('actor_role');
            $table->index('actor_dept');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
