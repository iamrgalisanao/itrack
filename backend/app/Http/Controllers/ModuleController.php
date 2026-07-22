<?php

namespace App\Http\Controllers;

use App\Models\Module;
use App\Models\Project;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;

class ModuleController extends Controller
{
    // ─── Role Helpers ────────────────────────────────────────────────────────
    // Reads role/department from the authenticated Sanctum user (real auth).
    // Null role → fail-safe unauthorized (see HasRole trait).

    private function user(Request $request): User
    {
        return $request->user();
    }

    // ─── GET /api/projects/{project}/modules ────────────────────────────────

    public function index(Request $request, Project $project)
    {
        $user = $this->user($request);

        // Client sees only client-visible tasks with client-visible comment counts
        $isClient = $user->isClient();

        return $project->modules()->with([
            'activities.subActivities.detailedActivities' => function ($query) use ($isClient) {
                if ($isClient) {
                    $query->where('client_visible', true);
                }
                $query->withCount([
                    'comments as comments_count' => function ($q) use ($isClient) {
                        if ($isClient) {
                            $q->where('visibility', \App\Models\Comment::VISIBILITY_CLIENT_VISIBLE);
                        }
                    }
                ]);
            }
        ])->get();
    }

    // ─── POST /api/projects/{project}/modules ───────────────────────────────

    public function store(Request $request, Project $project)
    {
        $user = $this->user($request);

        if (!$user->canWrite()) {
            AuditLogger::denied($request, 'module.create', 'module');
            return response()->json(['message' => 'Unauthorized: Only Admin, Project Manager, and Team Member roles can create modules.'], 403);
        }

        $validated = $request->validate([
            'code' => 'nullable|string|max:50',
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'output' => 'nullable|string',
            'responsible' => 'nullable|string|max:255',
            'support' => 'nullable|string|max:255',
            'duration_months' => 'integer|min:0',
            'duration_days' => 'integer|min:0',
            'plan_start_date' => 'nullable|date',
            'plan_end_date' => 'nullable|date',
            'sort_order' => 'integer|min:0',
        ]);

        $module = $project->modules()->create($validated);

        AuditLogger::record(
            $request,
            'module.created',
            'module',
            $module->id,
            $module->toArray()
        );

        return $module;
    }

    public function show(Module $module)
    {
        return $module->load('activities');
    }

    // ─── PATCH /api/modules/{module} ─────────────────────────────────────────

    public function update(Request $request, Module $module)
    {
        $user = $this->user($request);

        if (!$user->canWrite()) {
            AuditLogger::denied($request, 'module.update', 'module', $module->id);
            return response()->json(['message' => 'Unauthorized: Only Admin, Project Manager, and Team Member roles can update modules.'], 403);
        }

        $validated = $request->validate([
            'code' => 'nullable|string|max:50',
            'name' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'output' => 'nullable|string',
            'responsible' => 'nullable|string|max:255',
            'support' => 'nullable|string|max:255',
            'duration_months' => 'integer|min:0',
            'duration_days' => 'integer|min:0',
            'plan_start_date' => 'nullable|date',
            'plan_end_date' => 'nullable|date',
            'sort_order' => 'integer|min:0',
        ]);

        $module->update($validated);

        AuditLogger::record(
            $request,
            'module.updated',
            'module',
            $module->id,
            $module->getChanges()
        );

        return $module;
    }

    // ─── DELETE /api/modules/{module} ───────────────────────────────────────

    public function destroy(Request $request, Module $module)
    {
        $user = $this->user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'module.delete', 'module', $module->id);
            return response()->json(['message' => 'Unauthorized: Only Admin and Project Manager roles can delete modules.'], 403);
        }

        $moduleId = $module->id;
        $module->delete();

        AuditLogger::record(
            $request,
            'module.deleted',
            'module',
            $moduleId,
            ['id' => $moduleId]
        );

        return response()->noContent();
    }
}