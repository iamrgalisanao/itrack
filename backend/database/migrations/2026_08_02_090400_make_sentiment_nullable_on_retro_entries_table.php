<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('retro_entries', function (Blueprint $table) {
            // Widening, not destructive — Type is now assigned from the
            // table after an entry exists, not required at creation.
            $table->string('sentiment')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('retro_entries', function (Blueprint $table) {
            $table->string('sentiment')->nullable(false)->change();
        });
    }
};
