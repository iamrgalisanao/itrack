# Quickstart: Validating the In-App Help Center

## Prerequisites

- Backend running: `cd backend && php artisan serve --port=8011` (or the project's configured port)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- No migration needed — this feature adds no table or column.
- Seeded persona accounts (all passwords `password`): `admin@itrack.test`, `pm@itrack.test`, `depthead@itrack.test`, `team@itrack.test`, `client@itrack.test`.
- At least one approved `ProjectMembership` for the client persona to exercise the three Client-tier scenarios — set the `role` column on that row to `client_viewer`, `client_contributor`, or `client_admin` between scenarios (via `php artisan tinker` or the Admin → Clients tab review queue), and one scenario with the row removed/unapproved to exercise the default case.

## Scenario 1 — Each system role reaches its own guide (US1, FR-001/FR-002)

1. Sign in as `admin@itrack.test`, select **Help Center** from the sidebar.
2. **Expected**: the Admin Guide renders — its actual section headings (e.g. "Creating and managing user accounts") are visible, not a blank page or the old dead click.
3. Repeat for `pm@itrack.test`, `depthead@itrack.test`, and `team@itrack.test`.
4. **Expected**: each lands on the guide written for that exact role (Project Manager Guide, Department Head Guide, Team Member Guide respectively) — never another role's guide.

## Scenario 2 — Client users see the guide matching their access level (US2, FR-003/FR-004)

1. With the client persona's membership `role` set to `client_viewer` and `state` set to `approved`, sign in as `client@itrack.test` and select Help Center.
2. **Expected**: the Client Viewer Guide renders.
3. Change the membership `role` to `client_contributor` (e.g. via `php artisan tinker`), then reload the page (a browser refresh, not a sign-out/sign-in) and select Help Center again.
4. **Expected**: the Client Contributor Guide renders after only a reload — confirming FR-010's "re-resolve every time, don't cache" requirement holds at the component level (`resolveGuideKey()` isn't memoized against a stale value from a prior mount). This scenario doesn't require a full sign-out/sign-in, only a reload; see Scenario 4 for proof that no reload at all is needed when the identity change comes from Preview mode instead of a raw database edit.
5. Change the membership `role` to `client_admin`, repeat the reload-and-check.
6. **Expected**: the Client Admin Guide renders.
7. Remove/unapprove the membership entirely, repeat.
8. **Expected**: the Client Viewer Guide renders as the default (not an error, not a blank page).
9. Approve two memberships for the same user at different levels (e.g. `client_viewer` on one project, `client_admin` on another).
10. **Expected**: the Client Admin Guide renders — the higher-access tier wins.

## Scenario 3 — Screenshots render inline (US3, FR-005)

1. As any role from Scenario 1, open Help Center.
2. **Expected**: every screenshot referenced in that role's guide (compare against the guide's source markdown under `frontend/src/content/help-guides/`) displays as an image, not a broken-image icon, at a legible size within the content column.

## Scenario 4 — Preview mode shows the previewed role's guide (US4, FR-006)

1. Sign in as `admin@itrack.test`, use **Preview as this user** to preview `team@itrack.test`.
2. While previewing, select Help Center — without reloading the page (this also demonstrates FR-010: the previewed identity's guide resolves live, with no reload needed, unlike Scenario 2's raw-database-edit case).
3. **Expected**: the Team Member Guide renders, not the Admin Guide.
4. Stop the preview session, select Help Center again.
5. **Expected**: the Admin Guide renders again.
6. With `client@itrack.test`'s membership `role` set to `client_admin` and `state` set to `approved` (per Scenario 2's setup), use **Preview as this user** to preview `client@itrack.test`, then select Help Center.
7. **Expected**: the Client Admin Guide renders — not the Client Viewer Guide. This is the case that exercises `PreviewSessionResource`'s `target.client_role` field specifically (see `data-model.md`); a previewed Client user resolving to the Client Viewer default here (when their real membership is `client_admin`) indicates that field was never wired up, not that the feature is working correctly.
8. Stop the preview session.

## Scenario 5 — Cross-guide links don't break the page (Edge Cases, FR-009)

1. As `admin@itrack.test`, open Help Center and locate the Admin Guide's link to the Project Manager Guide (in its introduction).
2. Select that link.
3. **Expected**: no crash, no unhandled error, no dead navigation — Phase 1 does not require the link to open the Project Manager Guide in-app, but it must fail gracefully if selected.

## Scenario 6 — The link is never a dead click again (SC-005)

1. As any seeded role, select Help Center from a cold app load (no prior navigation).
2. **Expected**: a guide renders every time — there is no code path left where selecting Help Center does nothing, matching every role exercised in Scenarios 1–2.

## Scenario 7 — No browsing, search, or editing UI exists (FR-007/FR-008)

1. As `admin@itrack.test` (the role most likely to have such a control added "for convenience"), open Help Center and inspect the full page.
2. **Expected**: there is no guide picker, dropdown, search box, or role switcher anywhere on the page — only the one auto-resolved guide's rendered content. There is no button or control that creates, edits, or deletes any part of the guide's content.
3. Attempt to reach another role's guide by directly editing the URL, if Help Center's route accepts any parameter that looks like it could select a guide (it should not accept one at all in Phase 1).
4. **Expected**: no such parameter exists or has any effect — the same auto-resolved guide renders regardless.
