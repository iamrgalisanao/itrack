<?php

namespace App\Http\Controllers;

use App\Http\Resources\CommentResource;
use App\Models\Comment;
use App\Models\DetailedActivity;
use App\Models\Project;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\AccessContext;
use App\Support\ProjectClientAccess;
use Illuminate\Http\Request;

class CommentController extends Controller
{
    /**
     * Return true if the user is considered an internal user.
     */
    private function isInternalUser(User $user): bool
    {
        return $user->isAdmin()
            || $user->isProjectManager()
            || $user->isTeamMember()
            || $user->isDepartmentHead();
    }

    /**
     * GET /detailed-activities/{detailedActivity}/comments
     *
     * Returns comments for a task, scoped by the caller's role:
     *   - Client → only client_visible comments
     *   - All other roles → all comments
     * Comments are always ordered oldest → newest.
     */
    public function index(Request $request, DetailedActivity $detailedActivity)
    {
        $user = $this->user($request);

        if (!($detailedActivity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $query = $detailedActivity->comments()->orderBy('created_at', 'asc');

        if ($user->isClient()) {
            $query->where('visibility', Comment::VISIBILITY_CLIENT_VISIBLE);
        }

        return response()->json(
            $query->get()
                ->map(fn (Comment $comment) => CommentResource::make($comment)->resolve($request))
                ->values()
        );
    }

    /**
     * POST /detailed-activities/{detailedActivity}/comments
     *
     * Creates a new comment. Blocked for Client users (403).
     * author and author_role are derived from the authenticated user.
     */
    public function store(Request $request, DetailedActivity $detailedActivity)
    {
        $user = $this->user($request);

        if (!($detailedActivity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $validated = $request->validate([
            'body'       => ['required', 'string', 'min:1', 'max:5000'],
            'visibility' => ['required', 'string', 'in:internal,client_visible'],
        ]);

        if ($user->isClient()) {
            $project = Project::find($detailedActivity->resolveProjectId());

            if (!$project || !$detailedActivity->client_visible || !app(ProjectClientAccess::class)->canContribute($user, $project)) {
                AuditLogger::denied($request, 'comment.create_client_contribution', 'detailed_activity', $detailedActivity->id);
                return response()->json(['message' => 'Clients are not permitted to post comments for this task.'], 403);
            }

            $validated['visibility'] = Comment::VISIBILITY_CLIENT_VISIBLE;
        }

        $comment = $detailedActivity->comments()->create([
            'author'      => $user->name ?? $user->role,
            'author_role' => $user->role,
            'body'        => $validated['body'],
            'visibility'  => $validated['visibility'],
        ]);

        \App\Models\Notification::parseAndSendMentions($validated['body'], $comment, $detailedActivity);

        return response()->json(CommentResource::make($comment)->resolve($request), 201);
    }

    /**
     * DELETE /comments/{comment}
     *
     * Role-based delete:
     *   - Admin: can delete any comment
     *   - Project Manager: can delete any comment
     *   - Team Member: can delete only if author_role matches their role
     *   - Department Head: not allowed
     *   - Client: not allowed (403)
     */
    public function destroy(Request $request, Comment $comment)
    {
        $user = $this->user($request);

        if (!($comment->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if ($user->isClient() || $user->isDepartmentHead()) {
            return response()->json(['message' => 'You are not permitted to delete comments.'], 403);
        }

        if ($user->isTeamMember() && $comment->author_role !== $user->role) {
            return response()->json(['message' => 'Team Members may only delete their own comments.'], 403);
        }

        $comment->delete();

        return response()->noContent();
    }

    private function user(Request $request): User
    {
        return AccessContext::user($request);
    }
}
