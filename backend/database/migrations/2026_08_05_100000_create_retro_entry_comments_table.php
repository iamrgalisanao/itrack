<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('retro_entry_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('retro_entry_id')->constrained()->cascadeOnDelete();
            $table->foreignId('author_user_id')->constrained('users');
            $table->text('body');
            $table->timestamps();

            $table->index('retro_entry_id');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('retro_entry_comments');
    }
};
