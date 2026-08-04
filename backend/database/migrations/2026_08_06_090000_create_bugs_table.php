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
        Schema::create('bugs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('bug_number');
            $table->string('title');
            $table->text('description')->nullable();
            $table->foreignId('reporter_id')->constrained('users');
            $table->foreignId('owner_id')->nullable()->constrained('users');
            $table->string('priority');
            $table->string('status');
            $table->string('sprint_label')->nullable();
            $table->date('due_date')->nullable();
            $table->string('visibility')->default('internal');
            $table->timestamp('breach_notified_at')->nullable();
            $table->timestamps();
            // Soft delete, not hard delete: bug_number generation scans
            // withTrashed() so a deleted bug's number is never reused
            // (FR-002) — MAX(bug_number) alone would reuse a number if the
            // highest-numbered bug were hard-deleted.
            $table->softDeletes();

            $table->unique(['project_id', 'bug_number']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bugs');
    }
};
