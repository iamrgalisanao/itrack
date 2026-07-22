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
        Schema::create('comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('detailed_activity_id')->constrained()->cascadeOnDelete();
            $table->string('author');
            $table->string('author_role');
            $table->text('body');
            $table->string('visibility')->default('internal'); // 'internal' | 'client_visible'
            $table->timestamps();

            // Indexes for efficient role-scoped queries
            $table->index('detailed_activity_id');
            $table->index('visibility');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('comments');
    }
};
