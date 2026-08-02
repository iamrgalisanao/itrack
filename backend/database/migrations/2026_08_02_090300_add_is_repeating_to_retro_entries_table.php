<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('retro_entries', function (Blueprint $table) {
            // Defaults false — existing entries are not-repeating until a
            // human explicitly flags them, matching the client_visible
            // precedent (2026_06_25_014400_add_client_visible_to_detailed_activities_table.php).
            $table->boolean('is_repeating')->default(false)->after('sentiment');
        });
    }

    public function down(): void
    {
        Schema::table('retro_entries', function (Blueprint $table) {
            $table->dropColumn('is_repeating');
        });
    }
};
