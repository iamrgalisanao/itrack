<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('detailed_activities', function (Blueprint $table) {
            // Distinct from client_priority (Support Ops's P1/P2/P3) — Taskboard's
            // own real priority concept.
            $table->string('priority')->nullable()->after('client_priority');
            $table->unsignedSmallInteger('estimated_story_points')->nullable()->after('priority');
            $table->string('sprint_label', 100)->nullable()->after('estimated_story_points');
            // Real assignee FK, distinct from the existing free-text `responsible`
            // column, which is untouched and keeps its own role-based notification
            // targeting outside Taskboard.
            $table->foreignId('assignee_user_id')->nullable()->after('sprint_label')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('detailed_activities', function (Blueprint $table) {
            $table->dropConstrainedForeignId('assignee_user_id');
            $table->dropColumn(['priority', 'estimated_story_points', 'sprint_label']);
        });
    }
};
