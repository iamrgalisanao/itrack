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
        Schema::table('projects', function (Blueprint $table) {
            $table->string('health')->default('on_track');
            $table->timestamp('health_updated_at')->nullable();
            $table->string('health_updated_by')->nullable();
            $table->text('health_note')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['health', 'health_updated_at', 'health_updated_by', 'health_note']);
        });
    }
};
