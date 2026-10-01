<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table) {
            // Highest task number ever issued in the project. Tasks are
            // hard-deleted, so MAX(task_number) would reuse a deleted
            // number; a counter never goes backwards.
            $table->unsignedInteger('task_counter')->default(0);
        });

        Schema::table('detailed_activities', function (Blueprint $table) {
            $table->unsignedInteger('task_number')->nullable();
        });

        // Number existing tasks per project, oldest first.
        $rows = DB::table('detailed_activities as t')
            ->join('sub_activities as s', 's.id', '=', 't.sub_activity_id')
            ->join('activities as a', 'a.id', '=', 's.activity_id')
            ->join('modules as m', 'm.id', '=', 'a.module_id')
            ->orderBy('m.project_id')
            ->orderBy('t.id')
            ->get(['t.id as task_id', 'm.project_id']);

        $counters = [];
        foreach ($rows as $row) {
            $counters[$row->project_id] = ($counters[$row->project_id] ?? 0) + 1;
            DB::table('detailed_activities')
                ->where('id', $row->task_id)
                ->update(['task_number' => $counters[$row->project_id]]);
        }

        foreach ($counters as $projectId => $count) {
            DB::table('projects')->where('id', $projectId)->update(['task_counter' => $count]);
        }
    }

    public function down(): void
    {
        Schema::table('detailed_activities', function (Blueprint $table) {
            $table->dropColumn('task_number');
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->dropColumn('task_counter');
        });
    }
};
