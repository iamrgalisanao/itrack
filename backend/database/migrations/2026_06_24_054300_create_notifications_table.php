<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();

            // Mock recipient targeting (recipient_user_id is future-ready)
            $table->string('user_role');
            $table->unsignedBigInteger('recipient_user_id')->nullable();

            // Notification content
            $table->string('type'); // 'assignment', 'overdue', 'mention', 'blocked', 'due_soon'
            $table->string('severity')->default('info'); // 'info', 'warning', 'critical'
            $table->string('title');
            $table->text('message');

            // Link target
            $table->unsignedBigInteger('detailed_activity_id')->nullable();
            $table->string('link_url')->nullable();

            // Deduplication / context
            $table->string('event_key')->nullable();
            $table->date('event_date')->nullable();
            $table->json('metadata')->nullable();

            // Read state
            $table->boolean('is_read')->default(false);
            $table->timestamp('read_at')->nullable();

            $table->timestamps();

            // Indexing for performance
            $table->index(['user_role', 'is_read']);
            $table->index(['user_role', 'created_at']);
            $table->index(['type', 'detailed_activity_id']);
            $table->index('event_key');

            // Prevent duplicate notifications on a unique composite key
            // Note: Since SQL unique constraints allow multiple NULLs, we ensure event_key is non-null for unique check
            $table->unique(['user_role', 'type', 'detailed_activity_id', 'event_key'], 'notifications_unique_event');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
