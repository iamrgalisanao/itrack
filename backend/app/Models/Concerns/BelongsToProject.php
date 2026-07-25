<?php

namespace App\Models\Concerns;

use App\Models\Project;
use App\Models\User;

/**
 * 007-permission-hardening: the single project-level authorization
 * primitive shared by every model nested under a Project (Module,
 * Activity, SubActivity, DetailedActivity, Comment, Attachment) — one
 * rule, delegating to the exact same Project::scopeAccessibleTo the
 * top-level ProjectController/ReportController already use, rather than
 * six independently-written checks that could drift (research.md,
 * plan.md's Structure Decision).
 *
 * Each using model implements resolveProjectId() for its own specific
 * relationship depth; this trait provides the one shared check on top of
 * it.
 */
trait BelongsToProject
{
    abstract public function resolveProjectId(): int;

    public function isAccessibleTo(User $user): bool
    {
        return Project::query()
            ->accessibleTo($user)
            ->whereKey($this->resolveProjectId())
            ->exists();
    }
}
