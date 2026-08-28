<?php

namespace App\Http\Controllers;

use App\Http\Resources\TeamMemberResource;
use App\Models\TeamMember;
use App\Services\AuditLogger;
use App\Models\User;
use Illuminate\Http\Request;

class TeamMemberController extends Controller
{
    /**
     * The internal staff directory is internal.
     *
     * This returned `TeamMember::all()` with no role check and no Resource, so
     * every authenticated caller -- a Client with nothing but a project
     * assignment included -- received every person's internal `role`, their
     * free-text `description`, and which `side` they sit on.
     *
     * It is the disclosure PR #26 closed one level down: #26 stopped
     * `responsible` and `support` reaching Clients, one staff name per planning
     * row. This served the directory those names come from.
     *
     * Found by the Software Architect reviewing the route-coverage guard that
     * this same branch adds -- the guard forced a classification decision here,
     * and the classification was wrong. That is the guard working: a route
     * nobody listed would have left no trace at all.
     */
    public function index(Request $request)
    {
        if (!$this->isInternal($this->user($request))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        return TeamMemberResource::collection(TeamMember::all());
    }

    /**
     * Every non-Client role. A positive allowlist, not `!isClient()`: an
     * unrecognised or absent role must fail closed, which a negation does not.
     */
    private function isInternal(User $user): bool
    {
        return $user->isAdmin()
            || $user->isProjectManager()
            || $user->isDepartmentHead()
            || $user->isTeamMember();
    }

    /**
     * POST /api/team-members — Admin only.
     */
    public function store(Request $request)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'member.create', 'team_member');
            return response()->json(['message' => 'Unauthorized: Only Admins can add team members.'], 403);
        }

        $validated = $request->validate([
            'name'         => 'nullable|string|max:255',
            'side'         => 'nullable|string|max:50',
            'role'         => 'required|string|max:255',   // project/job role, NOT system role
            'description'  => 'nullable|string',
            'abbreviation' => 'nullable|string|max:50',
        ]);

        $member = TeamMember::create($validated);

        AuditLogger::record(
            $request,
            'member.created',
            'team_member',
            $member->id,
            "Team member \"{$member->role}\" added.",
            ['role' => $member->role]
        );

        return TeamMemberResource::make($member);
    }

    public function show(Request $request, TeamMember $teamMember)
    {
        if (!$this->isInternal($this->user($request))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        return TeamMemberResource::make($teamMember);
    }

    /**
     * PUT /api/team-members/{teamMember} — Admin or Project Manager.
     */
    public function update(Request $request, TeamMember $teamMember)
    {
        $user = $this->user($request);

        if (!$user->isPmOrAdmin()) {
            AuditLogger::denied($request, 'member.update', 'team_member', $teamMember->id);
            return response()->json(['message' => 'Unauthorized: Only Admins and Project Managers can update team members.'], 403);
        }

        $validated = $request->validate([
            'name'         => 'nullable|string|max:255',
            'side'         => 'nullable|string|max:50',
            'role'         => 'sometimes|string|max:255',
            'description'  => 'nullable|string',
            'abbreviation' => 'nullable|string|max:50',
        ]);

        $teamMember->update($validated);

        AuditLogger::record(
            $request,
            'member.updated',
            'team_member',
            $teamMember->id,
            "Team member updated.",
            ['changed_fields' => array_keys($validated)]
        );

        return TeamMemberResource::make($teamMember);
    }

    /**
     * DELETE /api/team-members/{teamMember} — Admin only.
     */
    public function destroy(Request $request, TeamMember $teamMember)
    {
        $user = $this->user($request);

        if (!$user->isAdmin()) {
            AuditLogger::denied($request, 'member.delete', 'team_member', $teamMember->id);
            return response()->json(['message' => 'Unauthorized: Only Admins can remove team members.'], 403);
        }

        AuditLogger::record(
            $request,
            'member.deleted',
            'team_member',
            $teamMember->id,
            "Team member \"{$teamMember->role}\" removed.",
            ['role' => $teamMember->role]
        );

        $teamMember->delete();
        return response()->noContent();
    }

    // ─── Helper ─────────────────────────────────────────────────────────────

    private function user(Request $request): User
    {
        return $request->user();
    }
}
