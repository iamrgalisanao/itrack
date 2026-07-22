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
        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('detailed_activity_id')->constrained()->cascadeOnDelete();

            // Who uploaded it (mock mode uses role as display name)
            $table->string('uploader');
            $table->string('uploader_role');
            $table->unsignedBigInteger('uploaded_by_user_id')->nullable(); // future real auth

            // File metadata
            $table->string('original_name');     // shown in UI
            $table->string('stored_name');        // UUID-prefixed safe filename on disk
            $table->string('disk')->default('local'); // storage driver — enables future S3 swap
            $table->string('path');               // full relative path on disk (NOT exposed via API)
            $table->string('mime_type');
            $table->unsignedBigInteger('size_bytes');

            // Access control — mirrors comments visibility model
            $table->string('visibility')->default('internal'); // 'internal' | 'client_visible'

            $table->timestamps();

            // Indexes for efficient role-scoped queries
            $table->index('detailed_activity_id');
            $table->index('visibility');
            $table->index('mime_type');
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('attachments');
    }
};
