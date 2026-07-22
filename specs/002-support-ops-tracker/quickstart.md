# Quickstart: Validating Support Ops Tracker (Phase 1)

## Prerequisites

- Backend running: `cd backend && php artisan serve` (http://localhost:8000)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- Migration applied: `cd backend && php artisan migrate` (adds the 10 new
  `detailed_activities` columns)
- Signed in as one of the persona accounts from `001-real-auth-cutover`'s
  quickstart (all password `password`): `pm@itrack.test` (Project Manager),
  `team@itrack.test` (Team Member), `depthead@itrack.test` (Department Head),
  `client@itrack.test` (Client)

## Scenario 1 — Dedicated board, existing views unaffected (US1, FR-003, FR-010)

1. Sign in as `pm@itrack.test`, navigate to `/support-ops`, select the
   seeded "PITX POS Tenant Sales Management Systems" project.
2. **Expected**: an empty board (no support-type tasks exist yet) with six
   columns — Intake, Needs Info, Needs Investigation, Investigating, Client
   Update Due, Resolved.
3. Navigate to `/kanban` for the same project.
4. **Expected**: the existing 70 seeded tasks still show exactly as before
   — nothing about visiting `/support-ops` changed what Kanban displays.

## Scenario 2 — Client role denied, Department Head can view (US1, FR-011)

1. Sign in as `client@itrack.test`, attempt to navigate to `/support-ops`.
2. **Expected**: denied, consistent with the existing Kanban Board's
   internal-only restriction.
3. Sign in as `depthead@itrack.test`, navigate to `/support-ops`.
4. **Expected**: the board loads (view access granted) but no "quick
   intake" control is available/usable for this role (write access denied
   per FR-001/FR-011).

## Scenario 3 — Quick intake creates an issue in one form (US2, FR-001, SC-001)

1. Sign in as `team@itrack.test` (a Team Member — confirms write access
   isn't limited to PM/Admin).
2. From `/support-ops`, trigger quick intake, fill in client "PITX", tenant
   "Tenant X", channel "Viber", priority "P1", issue title "Transaction
   sync failing", and submit.
3. **Expected**: a new card appears in the Intake column within the same
   view, no navigation to Work Program/module pickers required. Confirm via
   `GET /api/support-ops?project_id=<id>` that the created record has
   `work_type: "support"`, `status: "backlog"`, `progress: 0`.
4. Check Work Program for this project.
5. **Expected**: a "Support Requests" module now exists (auto-provisioned),
   containing the new issue — Work Program is unaffected in the sense that
   it still shows everything, including this new module, per FR-010.

## Scenario 4 — Stale-update flagging (US3, FR-005, FR-006)

1. Using the issue from Scenario 3 (P1), update its `last_client_update_at`
   to over an hour ago (via the detail view's "record client update" with a
   backdated time, or directly in the DB for testing).
2. **Expected**: the card is visually flagged as stale on the board.
3. Create a second P1 issue and immediately record a client update on it
   (setting `last_client_update_at` to now).
4. **Expected**: this second issue is not flagged.
5. Move the first (stale) issue to the Resolved column.
6. **Expected**: it is no longer flagged, regardless of how old
   `last_client_update_at` is.
7. Create a third issue with no `client_priority` set.
8. **Expected**: it is neither flagged as stale nor shown as fresh — visibly
   marked as "priority not set" instead.

## Scenario 5 — Full investigation detail view (US4, FR-007, FR-008)

1. Open any support issue's detail view.
2. **Expected**: all support-specific fields are visible, alongside the
   existing comments and attachments panels already used elsewhere in
   iTrack.
3. Edit `next_action` and `root_cause`, save, close, and reopen the issue.
4. **Expected**: both changes persisted.
5. As `team@itrack.test`, confirm you *can* edit `next_action`,
   `client_priority`, and `resolution` (this is the Team-Member allow-list
   extension called out in plan.md — without it, this step would silently
   fail to save those fields).
6. As `depthead@itrack.test`, attempt to edit any field on an issue.
7. **Expected**: denied — Department Head can view but not write, per
   Scenario 2.

## Scenario 6 — Filtering narrows the board (US5, FR-009)

1. With at least two issues from different clients on the board, filter by
   one client.
2. **Expected**: only that client's issues remain visible.
3. Clear the filter, then filter to "needs update" only.
4. **Expected**: only currently-stale issues (per Scenario 4's rules) are
   shown.
5. Create or reuse a `work_type: learning` task; confirm it does not appear
   on the default board.
6. Enable the "Learning" filter.
7. **Expected**: the learning entry now appears (FR-012).

## Regression check

- Run backend tests: `cd backend && php artisan test` — all existing tests
  (`RoleAccessTest`, `AuthenticationTest`, etc.) plus the new
  `SupportOpsControllerTest` must pass.
- Manually confirm Reports & Health and Schedule View render unchanged for
  a project that now contains support-type tasks (FR-010, SC-004).
