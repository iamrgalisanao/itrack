<?php

namespace App\Console\Commands;

use App\Models\Project;
use App\Models\ProjectAssignment;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * 007-permission-hardening: the concrete rollout backfill decision
 * spec.md's Assumptions requires — seeds one project_assignments row per
 * existing Team Member/Client for every project in their current
 * department, so no existing account's access narrows the moment this
 * feature ships (quickstart.md's Prerequisites). A one-time operational
 * step, run once after migrating, before relying on the new scoping in a
 * real environment. Idempotent — safe to run more than once, since
 * ProjectAssignment::firstOrCreate never creates a duplicate row.
 */
#[Signature('permissions:backfill-assignments')]
#[Description('Seed project assignments for existing Team Member/Client accounts, matching their current department access, before permission hardening narrows their visibility.')]
class BackfillProjectAssignments extends Command
{
    public function handle(): int
    {
        $admin = User::where('role', User::ROLE_ADMIN)->first();
        if (!$admin) {
            $this->error('No Admin account exists to attribute the backfill to. Aborting.');
            return self::FAILURE;
        }

        $users = User::whereIn('role', [User::ROLE_TEAM_MEMBER, User::ROLE_CLIENT])->get();
        $created = 0;

        foreach ($users as $user) {
            $projects = Project::where('department', $user->department)->get();

            foreach ($projects as $project) {
                $assignment = ProjectAssignment::firstOrCreate(
                    ['user_id' => $user->id, 'project_id' => $project->id],
                    ['assigned_by_user_id' => $admin->id]
                );

                if ($assignment->wasRecentlyCreated) {
                    $created++;
                }
            }
        }

        $this->info("Backfill complete: {$created} project assignment(s) created for {$users->count()} Team Member/Client account(s).");
        return self::SUCCESS;
    }
}
