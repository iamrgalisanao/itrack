<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('detailed_activities', function (Blueprint $table) {
            // Defaults false — tasks are internal until explicitly shared by PM/Admin
            $table->boolean('client_visible')->default(false)->after('sort_order');
        });
    }

    public function down(): void
    {
        Schema::table('detailed_activities', function (Blueprint $table) {
            $table->dropColumn('client_visible');
        });
    }
};
