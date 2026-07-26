# Quickstart: Validating Project Ownership and PM-Scoped Administration

## Prerequisites

- Backend running: `cd backend && php artisan serve` (http://localhost:8000)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- **Migration required**: `cd backend && php artisan migrate` (adds `project_ownerships` — new table only, no existing data touched).
- **No backfill step** — unlike 007's `project_assignments` backfill, this feature deliberately does not auto-populate ownership from the existing free-text `project_owner` field (spec.md's Assumptions: no reliable signal exists in that data). Every existing project starts ownerless, which is expected and valid (FR-003) — Admin assigns real owners deliberately, on their own schedule, after this ships. This is safe specifically because an ownerless project remains **unrestricted for any PM** (FR-018) — see Scenario 0 below.
- Signed in as a seeded Admin account (all passwords `password`). At least **four** Project Manager accounts (PM-A, PM-B, PM-C, PM-D) are needed — Scenario 3 needs a project owned by someone other than PM-A, Scenario 3a needs a co-owner plus a non-owner, and Scenario 6/7 need distinct transfer targets. Seed additional PM accounts if only `pm@itrack.test` exists.

## Scenario 0 — An ownerless project is the safe deploy-day default: unrestricted for any PM (FR-018)

1. Immediately after migrating (before assigning any ownership at all), sign in as any Project Manager.
2. Attempt to assign a Team Member to any existing project.
3. **Expected**: succeeds, identical to pre-008 behavior — no PM loses any assignment authority on deploy day, because no project has a real owner yet. This is the mechanism that makes skipping a backfill safe (see Prerequisites).

## Scenario 1 — Admin assigns a project owner (US1, FR-001)

1. Sign in as Admin, open the Admin Control Center's new "Project Ownership" tab.
2. Confirm the list is empty (or shows only ownerships you've created in a prior pass of this quickstart).
3. Assign a Project Manager as the owner of a project.
4. **Expected**: the new ownership appears in the list, showing the PM, the project, and the acting Admin.

## Scenario 2 — A project can have more than one owner (US1, FR-004)

1. Assign a second, different Project Manager as an additional owner of the same project from Scenario 1.
2. **Expected**: both PMs now appear as owners of that project; neither ownership record was replaced.

## Scenario 3 — A PM can only administer a project that already has a *different* owner (US2, FR-006/FR-007)

**Note**: Project Y must have its own, different owner (PM-C) for this scenario — an ownerless project is *not* a valid stand-in for "a project PM-A doesn't own," since ownerless projects are unrestricted for everyone (Scenario 0/FR-018).

1. As Admin, assign PM-A as the sole owner of Project X, and assign a different PM (PM-C) as the sole owner of Project Y. Confirm PM-A is **not** an owner of Project Y.
2. Sign in as PM-A.
3. Attempt to assign a Team Member to Project X (`POST /api/project-assignments`).
4. **Expected**: succeeds, exactly as it did before this feature.
5. Attempt the identical action against Project Y (owned solely by PM-C).
6. **Expected**: `403`, "You do not own this project."
7. As Admin, remove PM-A's ownership of Project X (now ownerless again, and PM-A owns zero projects).
8. Sign in as PM-A; repeat step 3 against Project X.
9. **Expected**: succeeds — Project X is ownerless now, so FR-018's rollout safety net applies to *any* PM, not because PM-A personally retains authority.
10. Sign in as PM-A; repeat step 5 against Project Y (still owned solely by PM-C).
11. **Expected**: `403` — confirms a PM who owns zero projects is denied specifically on a project that *does* have an owner, distinguishing this from step 9's ownerless case.

## Scenario 3a — Being *one of several* owners is still ownership (US2, FR-006/FR-004, enforcement matrix)

This is the pair of rows in data-model.md's enforcement matrix most likely to be skipped if only Scenario 3's single-owner story gets tested.

1. As Admin, assign both PM-A and PM-D as co-owners of Project Z (multiple owners, per Scenario 2).
2. Sign in as PM-A; attempt to assign a Team Member to Project Z.
3. **Expected**: succeeds — PM-A is one of several owners, and that's sufficient; the check never requires being the *sole* owner.
4. Sign in as a third PM (PM-C, not an owner of Project Z at all) and attempt the identical action.
5. **Expected**: `403` — confirms "has an owner, but not this PM" is denied even when the project has multiple owners, not just when it has exactly one.

## Scenario 4 — Admin authority is never restricted by ownership (US2, FR-008)

1. As Admin, assign or remove a Team Member's access on any project, regardless of who (if anyone) owns it.
2. **Expected**: always succeeds — no behavior change from before this feature shipped.

## Scenario 5 — Ownership never changes what a PM can see (US2, FR-009)

1. As a PM who owns zero projects, load Dashboard, Kanban, Work Program, Schedule, and Reports.
2. **Expected**: identical to what this PM saw before this feature — every project their role already made visible is still visible. Owning nothing narrows *administrative* authority only, never *read* visibility.

## Scenario 6 — Ownership transfer is atomic and fully audited (US3, FR-010, FR-012)

1. As Admin, with Project X owned solely by PM-A, use the "Transfer" action to move ownership to PM-B.
2. **Expected**: PM-A is no longer listed as an owner of Project X; PM-B is.
3. Sign in as PM-A; attempt to assign a Team Member to Project X.
4. **Expected**: `403` — PM-A's authority ended immediately, no re-login needed to observe the change (the *denial* is immediate; PM-A doesn't need to do anything to "pick up" the loss of access).
5. Sign in as PM-B; attempt the same action.
6. **Expected**: succeeds immediately.
7. Check Admin Control Center → Audit Logs.
8. **Expected**: exactly **one** `project_ownership.transferred` entry for this action (not two separate created/deleted entries), identifying Project X, PM-A as the prior owner, and PM-B as the new one. The entry's `entity_id` references the surviving (PM-B) ownership row, with both old and new ownership ids in metadata.

## Scenario 7 — Transferring to an already-existing co-owner consolidates rather than errors (US3, FR-010, Edge Cases)

1. As Admin, ensure Project X has two owners: PM-A and PM-B (assign both if not already so from prior scenarios).
2. Use the "Transfer" action on PM-A's ownership row, transferring to PM-B (who already co-owns the project).
3. **Expected**: succeeds (`200`), no validation error. PM-A is no longer an owner; PM-B's existing ownership record is untouched (not duplicated). Audit log shows one `project_ownership.transferred` entry.

## Scenario 8 — A concurrent transfer of the same ownership record is rejected, not silently corrupted (US3, FR-015)

1. As Admin, confirm Project X is owned solely by PM-A.
2. Issue two `POST /api/project-ownerships/{id}/transfer` requests for the *same* ownership id in quick succession (e.g. two terminal `curl` calls back-to-back, or two browser tabs), one transferring to PM-B, the other to PM-C.
3. **Expected**: exactly one request succeeds (`200`); the other receives `409 Conflict` ("this ownership record no longer exists..."). Project X ends up with exactly **one** owner (either PM-B or PM-C, whichever won), never both — confirm via Admin Control Center → Project Ownership that only one new owner is listed.

## Scenario 9 — A disabled or role-changed owner's authority goes dormant, and resumes automatically (US3, FR-011)

1. As Admin, confirm PM-A owns Project X (re-establish this if Scenario 6/7 moved it away).
2. Disable PM-A's account (Admin Control Center → User Accounts).
3. Attempt to sign in as PM-A.
4. **Expected**: denied at login (006's existing disabled-account behavior — unrelated to this feature, just confirming the account truly can't act).
5. Reactivate PM-A's account, then change their role to something other than Project Manager (e.g. Team Member).
6. Sign in as PM-A; attempt to assign a Team Member to Project X.
7. **Expected**: `403` — PM-A no longer holds the Project Manager role, so ownership grants no authority, even though the ownership row itself still exists (confirm via Admin Control Center → Project Ownership: PM-A is still listed).
7a. While PM-A's ownership is still dormant, sign in as a different PM (PM-C, not an owner of Project X) and attempt the same assignment against Project X.
7b. **Expected**: `403` — Project X is *not* ownerless during PM-A's dormancy (the row still exists, just inactive), so FR-018's safety net does not reapply; only Admin can act on Project X until an owner is restored or reassigned.
8. As Admin, change PM-A's role back to Project Manager.
9. Sign in as PM-A; repeat the assignment attempt against Project X.
10. **Expected**: succeeds immediately — no re-assignment of ownership was needed; the dormant record became active again automatically the moment the role was restored.

## Scenario 10 — Invalid ownership targets are rejected (US1, FR-005)

1. As Admin, attempt to assign a Team Member, Client, Department Head, or Admin account as a project's owner.
2. **Expected**: `422` for each — only active Project Manager accounts may own a project.
3. Disable a Project Manager account, then attempt to assign them as an owner.
4. **Expected**: `422` — disabled accounts cannot be assigned ownership, even though a disabled owner's *existing* ownership is allowed to sit dormant (Scenario 9) rather than being rejected retroactively.

## Scenario 11 — Deleting a project removes its ownership records (US1, FR-014)

1. As Admin, create a project, assign a PM as its owner.
2. Delete the project.
3. **Expected**: no error; querying ownership records for that project id returns nothing (verify via `php artisan tinker` — no UI surfaces orphaned ownership rows, since there should be none).

## Regression check

- Run backend tests: `cd backend && php artisan test` — all existing tests, including `ProjectScopingTest.php`'s 007 coverage, must pass **unmodified**, plus this feature's new tests.
- Manually confirm Admin, Department Head, Team Member, and Client behavior is completely unchanged across every page.
- Confirm `npm run build` and `npm run lint` remain clean.
