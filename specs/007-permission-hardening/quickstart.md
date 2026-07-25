# Quickstart: Validating Permission Hardening

## Prerequisites

- Backend running: `cd backend && php artisan serve` (http://localhost:8000)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- **Migrations required**: `cd backend && php artisan migrate` (adds `project_assignments` and `preview_sessions` — both new tables, no existing data touched).
- **Rollout backfill** (spec.md's Assumptions — required before this is considered deployable, not just migrated): seed one `project_assignments` row per existing Team Member/Client for every project in their current department, so no existing account's access narrows the moment this ships. Run this once, after migrating, before relying on the new scoping in a real environment: `php artisan tinker` or a one-off Artisan command iterating `User::whereIn('role', ['Team Member', 'Client'])->get()` and `Project::where('department', $user->department)->get()`.
- Signed in as a seeded Admin account (all passwords `password`).

## Scenario 1 — Team Member sees only assigned projects, not their whole department (US1, FR-001–FR-003)

1. As Admin, confirm (via Admin Control Center → Project Assignments tab) a Team Member in the IT department currently has no assignments — or note their existing ones.
2. Assign that Team Member to exactly one of at least two IT-department projects.
3. Sign in as that Team Member.
4. **Expected**: Dashboard, Work Program, Schedule, and Reports show only the assigned project — not the other IT-department project, even though it's in the same department (this is the actual regression this feature fixes — before this feature, both would be visible).
5. Open the assigned project's board (the Kanban view, backed by `GET /api/projects/{id}/modules`).
6. **Expected**: modules/activities/tasks load normally for the assigned project.

## Scenario 2 — Every nested resource under an unassigned project is denied, not just the project itself (US1, FR-003)

1. As the same Team Member from Scenario 1, note the ID of the *other* IT-department project they are not assigned to (visible earlier as Admin).
2. Attempt to fetch that project's modules directly: `GET /api/projects/{other_id}/modules`.
3. **Expected**: `403`, not an empty list and not the project's real data — this previously had **no** access check at all (research.md's Finding).
4. If any module/activity/sub-activity/task/comment/attachment ID belonging to that other project is known, attempt to fetch or write it directly by ID via its own shallow route (e.g. `GET /api/activities/{id}`, `GET /api/detailed-activities/{id}`) — bypassing the project-level route entirely.
5. **Expected**: `403` at every depth — a Team Member cannot read or write any resource belonging to a project they aren't assigned to, regardless of how deeply nested.

## Scenario 3 — Nonexistent and inaccessible project IDs are indistinguishable (US1, FR-005/FR-011)

1. As the same Team Member, request a project ID that does not exist at all (e.g. ID `999999`): `GET /api/projects/999999`.
2. Request the other IT-department project ID from Scenario 2 (exists, but unassigned): `GET /api/projects/{other_id}`.
3. **Expected**: both return `403` with the identical response body — no `404` for either, and nothing in either response reveals which ID was real.
4. As an Admin, repeat step 1 (nonexistent ID) with an Admin session.
5. **Expected**: Admin still gets a normal `404` — this feature does not change Admin/PM/Department Head behavior (FR-004).

## Scenario 4 — Removing an assignment takes effect immediately, no re-login (US1, FR-002)

1. Sign in as a Team Member with exactly one project assignment, in one browser session; confirm the Dashboard shows that project.
2. In a separate Admin session, remove that assignment (Project Assignments tab).
3. Back in the Team Member's still-open session, reload the Dashboard.
4. **Expected**: the project is gone, replaced by the "no projects assigned yet" empty state — no error, matching 006's immediate-effect precedent for role/department edits.

## Scenario 5 — Admin previews as a Team Member and sees exactly their access, read-only (US2, FR-006–FR-009)

1. As Admin, from the Admin Control Center's "User Accounts" tab, click "Preview" on the Team Member from Scenario 1.
2. **Expected**: a persistent preview banner appears; Dashboard/Work Program/Schedule/Reports now show only that Team Member's assigned project(s) — the Admin's own full visibility is temporarily replaced for reads.
3. Attempt to create, edit, or delete anything while the banner is showing (e.g. edit a task).
4. **Expected**: the write is rejected (`403`, "Write operations are disabled while previewing") — and confirm via the Admin Control Center's Logs tab that a `preview.write_blocked` entry was recorded, and that the attempted edit did **not** actually apply (reload without previewing and confirm the data is unchanged).
5. While still previewing that Team Member, click "Preview" on a *different* user (a Client, for example) without first clicking "End Preview."
6. **Expected**: this succeeds — the banner switches to show the new target, not a `403` from the write-blocking middleware (round-3 review point 1: starting a replacement preview is exempted from the write block specifically so this works while the old preview's header is still being sent).
7. Click "End Preview."
8. **Expected**: full Admin access returns immediately.
9. As a non-Admin (any other role), attempt `POST /api/preview-sessions` directly.
10. **Expected**: `403`.
11. As Admin, attempt to start a preview targeting another Admin account.
12. **Expected**: `422`, rejected with a clear message — no narrower access exists to preview as another Admin.
13. As Admin, disable a Team Member's account first, then attempt to start a preview targeting that now-disabled account.
14. **Expected**: `422`, rejected up front at creation — not merely allowed to start and fail confusingly on first use.

## Scenario 6 — Preview session ends itself when the target becomes invalid, and on its own timer (US2, FR-019/FR-020)

1. As Admin, start a preview as a Team Member.
2. In a separate Admin session, disable that Team Member's account (Admin Control Center → User Accounts).
3. Back in the previewing session, make any request.
4. **Expected**: that specific request gets `409` with the `X-Preview-Ended` header and **no domain data** (not a mix of preview-ended signaling and real data — round-3 review point 3) — the frontend then clears the preview banner client-side and issues a fresh, separate request, which returns the Admin's own full access normally.
5. Separately, confirm via the Logs tab that a `preview.ended` entry exists with `reason: target_disabled`.
6. Repeat steps 1-5, but instead of disabling the target, change their role (e.g. Team Member → Project Manager) in the separate Admin session.
7. **Expected**: the same `409`/no-data/banner-clear behavior, this time with `reason: target_role_changed` in the Logs tab — confirming a role change alone (without disabling the account) also ends the preview, not just a disable.
8. (Time-dependent, optional manual check) Confirm `preview_sessions.expires_at` is set to two hours after `started_at` at creation, and that a session past that timestamp behaves the same way as step 4 (`409`, no data, banner cleared, `reason: expired`) on its next use.

## Scenario 6b — Preview reflects the target's pre-existing role behavior, not just project assignments (round-4 review)

1. As Admin, start a preview as a Client user.
2. Attempt `GET /api/reports/export-csv` while previewing.
3. **Expected**: denied by the same Client export restriction a real Client hits — not the Admin's own unrestricted export access. This confirms the previewed identity applies to *all* of the target's access, including role behavior this feature didn't add, not only the new project-assignment scoping (FR-006; research.md's finding on the shared controller `user()` helper).
4. End the preview and repeat step 2 as the real Admin.
5. **Expected**: succeeds normally — confirms step 3's denial was specific to the preview, not a regression in the Admin's own access.

## Scenario 7 — Consistent access-denied experience across entry points (US3, FR-010)

1. Trigger a denial three different ways: (a) navigate directly to `/kanban` as a role without Kanban access, (b) call a project-scoped API endpoint directly for an unassigned project as a Team Member, (c) as a Team Member with an open Reports page, have an Admin revoke their only project assignment in a separate session, then trigger a Reports refetch.
2. **Expected**: all three render the same `AccessDenied` component/experience — same icon, heading, message style, and recovery action — not three different-looking outcomes.

## Scenario 7b — Role-based endpoint gating still wins over assignment scoping (round-3 review point 4)

1. As a Client assigned to at least one project (so assignment scoping alone would not deny them), attempt `GET /api/reports/export-csv`.
2. **Expected**: denied by the existing, unrelated role check — same as before this feature shipped — not a project-scoping 403 and not newly allowed because of an assignment. This confirms assignment scoping only narrows an endpoint a role can already reach; it never substitutes for a role check.

## Scenario 8 — Assignment validation and idempotency (US1, FR-016/FR-017)

1. As Admin, attempt to assign a Department Head, Project Manager, or Admin user to a project via `POST /api/project-assignments`.
2. **Expected**: `422`, rejected — these roles don't take project-level assignments (FR-016).
3. Attempt to assign a disabled user account to a project.
4. **Expected**: `422`, rejected.
5. Assign a valid Team Member to a project they're already assigned to (repeat an existing assignment).
6. **Expected**: `200` (not `201`), the existing assignment is returned, and the Logs tab shows **no** new `project_assignment.created` entry for this repeat call.

## Scenario 9 — Audit trail completeness (US3, FR-013/FR-018)

1. Grant, then revoke, a project assignment as Admin.
2. **Expected**: `project_assignment.created` and `project_assignment.deleted` entries appear in the Logs tab, each identifying the acting Admin, the target user, and the project.
3. Start, then end, a preview session.
4. **Expected**: `preview.started` and `preview.ended` (`reason: manual`) entries appear, identifying the Admin and the target — the target's own audit trail is unaffected (they are never the "actor" of any of these entries).

## Scenario 10 — Project deletion cascades assignments (US1, FR-014)

1. As Admin, create a project, assign a Team Member to it.
2. Delete the project.
3. **Expected**: no error; querying `project_assignments` for that project id returns nothing (verify via `php artisan tinker` — no dedicated UI surfaces orphaned assignments, since there should be none).

## Regression check

- Run backend tests: `cd backend && php artisan test` — all existing tests, including `RoleAccessTest.php`'s Department Head + `DepartmentGrant` scoping tests, must pass **unmodified**, plus the new `ProjectScopingTest.php`.
- Manually confirm Admin, Project Manager, and Department Head see the same projects/data they did before this feature, across Dashboard, Kanban, Work Program, Schedule, and Reports.
- Confirm `npm run build` and `npm run lint` remain clean.
