<?php

namespace App\Http\Controllers;

use App\Http\Resources\BugResource;
use App\Models\Bug;
use App\Models\Project;
use App\Models\User;
use App\Support\AccessContext;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

class BugController extends Controller
{
    /**
     * 017-bug-tracker plan.md: internal roles that may create/edit/triage
     * bugs — matches KANBAN_INTERNAL_ROLES's backend equivalent.
     */
    private function canManage(User $user): bool
    {
        return $user->isAdmin()
            || $user->isProjectManager()
            || $user->isTeamMember()
            || $user->isDepartmentHead();
    }

    private function user(Request $request): User
    {
        return AccessContext::user($request);
    }

    /**
     * data-model.md: reporter_id/owner_id must reference an internal user —
     * a Client can never be a valid Reporter or Owner.
     */
    private function internalUserExistsRule(): Exists
    {
        return Rule::exists('users', 'id')->where(fn ($query) => $query->where('role', '!=', User::ROLE_CLIENT));
    }

    // ─── GET /projects/{project}/bugs ───────────────────────────────────────

    public function index(Request $request, Project $project)
    {
        $user = $this->user($request);

        if (!Project::query()->accessibleTo($user)->whereKey($project->id)->exists()) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $query = Bug::query()
            ->where('project_id', $project->id)
            ->with(['reporter', 'owner'])
            ->latest();

        if ($user->isClient()) {
            $query->where('visibility', Bug::VISIBILITY_CLIENT_VISIBLE);
        }

        return BugResource::collection($query->get());
    }

    // ─── POST /projects/{project}/bugs ──────────────────────────────────────

    public function store(Request $request, Project $project)
    {
        $user = $this->user($request);

        if (!$this->canManage($user)) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if (!Project::query()->accessibleTo($user)->whereKey($project->id)->exists()) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'priority' => ['required', Rule::in(Bug::PRIORITIES)],
            'status' => ['sometimes', Rule::in(Bug::STATUSES)],
            'owner_id' => ['nullable', 'integer', $this->internalUserExistsRule()],
            'sprint_label' => 'nullable|string|max:120',
            'due_date' => 'nullable|date',
            'visibility' => ['sometimes', Rule::in(Bug::VISIBILITIES)],
        ]);

        $bug = DB::transaction(function () use ($validated, $project, $user) {
            // withTrashed(): a soft-deleted bug's number must still count
            // toward the max, or it would be reused (FR-002, Bug::softDeletes).
            $nextBugNumber = (int) Bug::withTrashed()
                ->where('project_id', $project->id)
                ->lockForUpdate()
                ->max('bug_number') + 1;

            $bug = new Bug([
                ...$validated,
                'reporter_id' => $user->id,
                'status' => $validated['status'] ?? Bug::STATUS_AWAITING_REVIEW,
                'visibility' => $validated['visibility'] ?? Bug::VISIBILITY_INTERNAL,
            ]);
            // project_id/bug_number are deliberately excluded from $fillable
            // (sec-mass-assignment, plan.md) — set directly, never from
            // client-controlled input.
            $bug->project_id = $project->id;
            $bug->bug_number = $nextBugNumber;
            $bug->save();

            return $bug;
        });

        $bug->load(['reporter', 'owner']);

        return (new BugResource($bug))->response()->setStatusCode(201);
    }

    // ─── GET /bugs/{bug} ─────────────────────────────────────────────────────

    public function show(Request $request, Bug $bug)
    {
        $user = $this->user($request);

        if (!$bug->isAccessibleTo($user)) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if ($user->isClient() && $bug->visibility !== Bug::VISIBILITY_CLIENT_VISIBLE) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $bug->load(['reporter', 'owner']);

        return new BugResource($bug);
    }

    // ─── PATCH /bugs/{bug} ───────────────────────────────────────────────────

    public function update(Request $request, Bug $bug)
    {
        $user = $this->user($request);

        if (!$this->canManage($user)) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if (!$bug->isAccessibleTo($user)) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $validated = $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'sometimes|nullable|string',
            'priority' => ['sometimes', Rule::in(Bug::PRIORITIES)],
            'status' => ['sometimes', Rule::in(Bug::STATUSES)],
            'reporter_id' => ['sometimes', 'integer', $this->internalUserExistsRule()],
            'owner_id' => ['sometimes', 'nullable', 'integer', $this->internalUserExistsRule()],
            'sprint_label' => 'sometimes|nullable|string|max:120',
            'due_date' => 'sometimes|nullable|date',
            'visibility' => ['sometimes', Rule::in(Bug::VISIBILITIES)],
        ]);

        $bug->update($validated);
        $bug->load(['reporter', 'owner']);

        return new BugResource($bug);
    }

    // ─── DELETE /bugs/{bug} ──────────────────────────────────────────────────

    public function destroy(Request $request, Bug $bug)
    {
        $user = $this->user($request);

        if (!$this->canManage($user)) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if (!$bug->isAccessibleTo($user)) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $bug->delete();

        return response()->noContent();
    }
}
