<?php

namespace App\Http\Controllers;

use App\Models\TeamMember;
use App\Services\AuditLogger;
use App\Models\User;
use Illuminate\Http\Request;

class TeamMemberController extends Controller
{
    public function index()
    {
        return TeamMember::all();
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

        return $member;
    }

    public function show(TeamMember $teamMember)
    {
        return $teamMember;
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

        return $teamMember;
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
