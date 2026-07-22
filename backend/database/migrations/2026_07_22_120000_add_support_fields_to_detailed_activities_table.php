<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('detailed_activities', function (Blueprint $table) {
            // Defaults 'project' — every existing task and any task created
            // outside the Support Ops intake flow is unaffected.
            $table->string('work_type')->default('project')->after('client_visible');
            $table->string('client_name')->nullable()->after('work_type');
            $table->string('tenant_name')->nullable()->after('client_name');
            $table->string('channel')->nullable()->after('tenant_name');
            $table->string('client_priority')->nullable()->after('channel');
            $table->timestamp('last_client_update_at')->nullable()->after('client_priority');
            $table->text('next_action')->nullable()->after('last_client_update_at');
            $table->text('evidence')->nullable()->after('next_action');
            $table->text('root_cause')->nullable()->after('evidence');
            $table->text('resolution')->nullable()->after('root_cause');
        });
    }

    public function down(): void
    {
        Schema::table('detailed_activities', function (Blueprint $table) {
            $table->dropColumn([
                'work_type',
                'client_name',
                'tenant_name',
                'channel',
                'client_priority',
                'last_client_update_at',
                'next_action',
                'evidence',
                'root_cause',
                'resolution',
            ]);
        });
    }
};
