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
        Schema::create('retro_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('retro_session_id')->constrained()->cascadeOnDelete();
            $table->foreignId('author_user_id')->constrained('users');
            $table->text('body');
            $table->string('sentiment'); // 'keep' | 'improve' | 'discuss' — see RetroEntry::SENTIMENTS
            $table->foreignId('owner_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('retro_entries');
    }
};
