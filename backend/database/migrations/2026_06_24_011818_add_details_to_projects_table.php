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
            $table->string('project_owner')->nullable();
            $table->string('department')->nullable();
            $table->string('status')->default('not_started');
            $table->date('start_date')->nullable();
            $table->date('target_end_date')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn(['project_owner', 'department', 'status', 'start_date', 'target_end_date']);
        });
    }
};
