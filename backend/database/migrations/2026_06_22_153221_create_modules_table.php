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
        Schema::create('modules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            $table->string('code')->nullable();
            $table->string('name');
            $table->text('description')->nullable();
            $table->text('output')->nullable();
            $table->string('responsible')->nullable();
            $table->string('support')->nullable();
            $table->integer('duration_months')->default(0);
            $table->integer('duration_days')->default(0);
            $table->date('plan_start_date')->nullable();
            $table->date('plan_end_date')->nullable();
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('modules');
    }
};
