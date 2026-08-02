<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('retro_entry_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('retro_entry_id')->constrained()->cascadeOnDelete();
            $table->foreignId('uploaded_by_user_id')->constrained('users');
            $table->string('original_name');
            $table->string('stored_name');
            $table->string('disk')->default('local');
            $table->string('path');
            $table->string('mime_type');
            $table->unsignedBigInteger('size_bytes');
            $table->timestamps();

            $table->index('retro_entry_id');
            $table->index('mime_type');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('retro_entry_attachments');
    }
};
