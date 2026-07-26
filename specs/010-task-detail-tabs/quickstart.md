# Quickstart: Validating Task Detail Tabs & Completion Indicators

## Prerequisites

- Backend running: `cd backend && php artisan serve` (http://localhost:8000)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- No migration needed — this feature adds no table, column, or endpoint.
- Fixture data: at least one Support Ops issue with none of Client/Client Priority/Root Cause/Resolution filled in, and at least one Kanban board task (any status) that is not a Support Ops issue. **Note**: Support Ops intake (`POST /api/support-ops`) requires Client and Client Priority to be filled in at creation time — this fixture cannot be created via the normal intake form in that state. Create the issue via intake as usual, then clear Client, Client Priority, Root Cause, and Resolution back to blank through the issue's existing Support/Resolution edit fields (or seed it directly in the test database) before starting these scenarios.

## Scenario 1 — A Support Ops issue shows five focused tabs (US1, FR-001/FR-003/FR-004/FR-005)

1. Sign in as any internal role, open a Support Ops issue from the Support Ops board or Today dashboard.
2. **Expected**: five tabs — Details, Support, Resolution, Comments, Files.
3. Open the Details tab. **Expected**: only base fields (title, status, progress, assignee, priority, planned dates, description, notes) — no Client/Root Cause/etc.
4. Open the Support tab. **Expected**: Client, Tenant, Channel, Client Priority, Last Client Update (+ record action), Next Action, Client Message Templates, Freeform Client Update — nothing else.
5. Open the Resolution tab. **Expected**: Evidence, Root Cause, Resolution, Troubleshooting Packet — nothing else.

## Scenario 2 — A Kanban task is completely unaffected (US1, FR-002, SC-003)

1. Open a Kanban board task's detail view.
2. **Expected**: exactly three tabs — Details, Comments, Files — identical to before this feature shipped. No Support or Resolution tab, no completion indicator anywhere.

## Scenario 3 — Tab labels show live completion (US2, FR-006/FR-007/FR-008)

1. Open a Support Ops issue with no Client, Client Priority, Root Cause, or Resolution recorded.
2. **Expected**: the Support tab's label reads "0/2" and the Resolution tab's label reads "0/2".
3. Without saving, fill in Client and Client Priority on the Support tab.
4. **Expected**: the Support tab's label updates to "2/2" immediately, before any save.
5. Switch to the Resolution tab, fill in Root Cause only.
6. **Expected**: the Resolution tab's label reads "1/2".

## Scenario 4 — Completion indicators don't get confused with activity counts (US2, FR-009)

1. On an issue with existing comments and files, open its detail view.
2. **Expected**: Comments/Files tab labels show a bare activity count (e.g., "3"), while Support/Resolution show an `x/y` fraction (e.g., "2/2") — the two are visually distinct and never presented as the same kind of number.

## Scenario 5 — Missing required fields are marked, and don't block saving (US2/US3, FR-010/FR-011/FR-012)

1. Open a Support Ops issue missing its Client Priority and Resolution.
2. **Expected**: the Client Priority label (Support tab) and Resolution label (Resolution tab) both show a visible marker.
3. On the Details tab, change Notes to a distinctive, easily-recognized value (e.g., append today's timestamp) — this is how step 8 below confirms the save genuinely completed, not just that a summary appeared.
4. Save the issue without filling in Client Priority or Resolution.
5. **Expected**: the save succeeds — no error, no confirmation prompt to click through — and a summary appears listing both missing fields, grouped by tab (e.g., "Support is missing: Client Priority", "Resolution is missing: Resolution").
6. Without closing the modal, fill in Client Priority and Resolution now (do not save yet). **Expected**: the summary banner disappears on its own as soon as both are filled — it's recomputed live from the current form, so it can never keep reporting a field the tab-label pill already shows as complete.
7. Close the modal via its normal Close/X control.
8. Reopen the same issue. **Expected**: the Notes value from step 3 is present — confirming the save actually persisted, and the summary in step 5 was informational rather than a sign the save silently failed.
9. Fill in Client Priority and Resolution, then save.
10. **Expected**: the save succeeds and the modal closes immediately — no summary appears, since nothing is missing.

## Scenario 6 — Read-only mode still shows tabs and counts, but no markers or summary (FR-014)

1. From the Support Ops Knowledge Base (009), open a result that is missing its Client Priority — Client Priority is a required Support-tab field (FR-006), unlike Evidence, so this is the field that actually exercises marker suppression below.
2. **Expected**: five tabs still appear, with completion counts on Support/Resolution labels reflecting the issue's actual recorded data (Support's count reflects the missing Client Priority).
3. **Expected**: no required-field marker appears on any label, and there is no way to trigger a save or see a missing-fields summary — matching 009's existing read-only behavior (no Save button at all).

## Regression check

- Run backend tests: `cd backend && php artisan test` — this feature changes no backend code, so every existing test must pass completely unmodified.
- Confirm `npm run build` and `npm run lint` remain clean.
- Confirm Kanban's task detail view — creating a task, editing it, adding a comment, uploading a file — behaves exactly as before this feature shipped.
- Confirm 009's Knowledge Base read-only view (no save, no comment/upload/delete affordance) still holds with the new tab structure layered on top.
