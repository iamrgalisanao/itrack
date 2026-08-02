<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('retro_entries', function (Blueprint $table) {
            // Nullable — absence of a decision is a real, distinct state
            // (spec FR-014), not an empty string.
            $table->text('decision')->nullable()->after('is_repeating');
        });
    }

    public function down(): void
    {
        Schema::table('retro_entries', function (Blueprint $table) {
            $table->dropColumn('decision');
        });
    }
};
