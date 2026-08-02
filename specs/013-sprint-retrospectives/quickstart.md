# Quickstart: Validating Sprint Retrospectives

## Prerequisites

- Backend running: `cd backend && php artisan serve --port=8011` (or the project's configured port)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- Migration run: `php artisan migrate` (creates `retro_sessions`, `retro_entries`, `retro_entry_votes`)
- Seeded persona accounts (all passwords `password`): `admin@itrack.test`, `pm@itrack.test`, `depthead@itrack.test`, `team@itrack.test`, `client@itrack.test`
- A project both `pm@itrack.test` and `team@itrack.test` have access to

## Scenario 1 — Create a session and capture entries continuously (US1, FR-001/FR-003)

1. Sign in as `pm@itrack.test`, open Retrospectives, create a session labeled "Sprint 3".
2. **Expected**: the session appears immediately, empty.
3. Sign in as `team@itrack.test`, open the same session, add an entry.
4. **Expected**: the entry appears attributed to the Team Member — no scheduled meeting or session state gated the add.
5. Open Retrospectives on a project with zero sessions.
6. **Expected**: a clear empty state, not an error.

## Scenario 2 — Sentiment tagging is required and visible (US2, FR-004)

1. Attempt to submit an entry with no sentiment selected.
2. **Expected**: submission is blocked — sentiment is required.
3. Add one entry each tagged Keep, Improve, and Discuss.
4. **Expected**: the session visibly groups or distinguishes entries by tag.

## Scenario 3 — Voting toggles and is visible to everyone (US3, FR-005)

1. As `team@itrack.test`, vote on an entry.
2. **Expected**: the vote count increases, visible immediately.
3. Vote on the same entry again.
4. **Expected**: the vote is removed (toggled off), count decreases.
5. Sign in as `pm@itrack.test` and view the same entry.
6. **Expected**: the vote count reflects Team Member's current (toggled-off) state — the count is real, not per-viewer.

## Scenario 4 — Owner assignment and reassignment (US4, FR-006)

1. Assign an owner to an entry.
2. **Expected**: the entry shows the assigned owner.
3. Reassign to a different internal user, then clear the owner entirely.
4. **Expected**: both changes are reflected immediately; clearing removes the owner, not just resets to some default.
5. Attempt to assign an owner to a user who has no access to the entry's project (e.g. a Team Member with no `ProjectAssignment` there).
6. **Expected**: rejected (`422`) — ownership can't be handed to someone with no way to actually see the project.

## Scenario 5 — Edit/delete permission is author-or-Admin/PM only (FR-007)

1. As `team@itrack.test`, add an entry, then sign in as a *different* Team Member with access to the same project.
2. Attempt to edit or delete the first Team Member's entry.
3. **Expected**: denied (`403`) — not a silent no-op, not a successful edit.
4. As `pm@itrack.test`, edit or delete that same entry.
5. **Expected**: succeeds — Admin/PM can moderate any entry regardless of authorship.
6. As the original author (`team@itrack.test`), edit their own entry.
7. **Expected**: succeeds.
8. Remove `team@itrack.test`'s `ProjectAssignment` from this project (revoking their access), then have them attempt to edit or delete their own entry from Step 1.
9. **Expected**: denied (`403`) — authorship alone doesn't carry the privilege once project access is gone; this is the case a former-author check that only compares `author_user_id` would miss.

## Scenario 6 — Department Head can view but not write (FR-001/FR-002)

1. Sign in as `depthead@itrack.test`, open a session with existing entries.
2. **Expected**: sessions, entries, votes, and owners are all visible.
3. Attempt to create a session, add an entry, vote, or assign an owner.
4. **Expected**: no create/add/vote/assign control is available to this role — consistent with Department Head's read-only relationship to Work Program and Support Ops elsewhere in the app.

## Scenario 7 — Client role is denied entirely (FR-008, SC-005)

1. Sign in as `client@itrack.test`.
2. **Expected**: Retrospectives does not appear in the sidebar at all (matching Kanban/Support Ops).
3. Navigate directly to the Retrospectives URL.
4. **Expected**: denied — no session list, no entry data, no partial view.

## Scenario 8 — Browsing session history (US5, FR-009)

1. Create two sessions on the same project with different entries in each.
2. **Expected**: both sessions appear in the list, most recent first.
3. Open the older session.
4. **Expected**: only that session's own entries are shown.

## Scenario 9 — Work Program is untouched (FR-011)

1. Before and after this feature ships, open Work Program for the same project.
2. **Expected**: identical Module → Activity → Sub-Activity → Task structure, identical behavior — Retrospectives introduces no visible or functional change to Work Program itself.
