# Quickstart: Validating the Support Ops Knowledge Base

## Prerequisites

- Backend running: `cd backend && php artisan serve` (http://localhost:8000)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- No migration needed — this feature adds no table or column.
- Fixture data: at least two resolved (`status: completed`) Support Ops issues with both `root_cause` and `resolution` filled in, across at least two different projects/departments, plus at least one resolved issue missing one or both of those fields (to verify exclusion) and one still-open issue with matching text (to verify it never appears).
- Signed in as a seeded internal account (Admin, Project Manager, Team Member, or Department Head — all passwords `password`) for most scenarios; a Client account for the denial scenario.

## Scenario 1 — Keyword search returns a relevant resolved issue (US1, FR-001/FR-001a)

1. Sign in as any internal role, open Support Ops → Knowledge Base.
2. Search a keyword that appears only in a resolved issue's root cause (not its name or client).
3. **Expected**: that issue appears in the results, with its root cause and resolution visible.
4. Repeat the search in a different case (e.g., uppercase) and as a partial word.
5. **Expected**: identical results both times — search is case-insensitive and partial-match.

## Scenario 2 — Incomplete or unresolved issues never appear (US1, FR-003/FR-004)

1. Search a keyword that matches a resolved issue with only a root cause recorded (resolution left blank).
2. **Expected**: it does not appear.
3. Search a keyword that matches a resolved issue with only a resolution recorded (root cause left blank).
4. **Expected**: it does not appear either.
5. Search a keyword that matches a still-open (non-`completed`) issue's text.
6. **Expected**: it does not appear, regardless of how well its text matches.

## Scenario 3 — Browsing without a keyword, and filtering (US2, FR-005/FR-006/FR-006a)

1. Open the Knowledge Base with no search term entered.
2. **Expected**: resolved, complete issues appear, most-recently-resolved first.
3. Apply a client filter.
4. **Expected**: only issues for that client remain.
5. Apply a keyword and the client filter together.
6. **Expected**: only issues matching both remain — narrower than either alone, never broader.

## Scenario 4 — Visibility never exceeds existing Support Ops access (FR-007, Edge Cases)

1. As a Team Member assigned to only some projects, search a keyword that matches a resolved issue in a project they are NOT assigned to.
2. **Expected**: that issue does not appear — no error, no "1 hidden result" indicator, simply absent.
3. As an Admin or Project Manager (unrestricted), repeat the same search.
4. **Expected**: the issue now appears — confirming the exclusion in step 2 was a visibility boundary, not a data or search-logic bug.

## Scenario 5 — Client role is denied (FR-008/FR-011)

1. Sign in as a Client-role account.
2. Confirm no "Knowledge Base" (or "Support Ops") entry appears in the sidebar.
3. Call `GET /api/support-ops/knowledge-base` directly (e.g., via browser devtools or curl, reusing the Client's session).
4. **Expected**: `403` — denied at the API regardless of the missing nav entry, not merely hidden in the UI.

## Scenario 6 — Opening a result reaches full original context (US3, FR-009/FR-009a)

1. From a search result, select an issue.
2. **Expected**: the same issue detail view used elsewhere in the app opens (evidence, discussion, attachments included) — not a separate, knowledge-base-only summary screen.
3. If that issue has any comments or attachments, confirm they render identically to opening the same issue directly from its project's Support Ops board.

## Scenario 7 — Opening a result from the knowledge base is read-only (FR-010)

1. From a search result, select an issue (as in Scenario 6).
2. On the Details tab, confirm every field is disabled and no "Save Changes" button is present — only "Close".
3. Confirm the "Record client update now" button and the Support Generators (Client Message Templates, Freeform Client Update, Troubleshooting Packet) are not present.
4. Switch to the Comments tab.
5. **Expected**: no add-comment form is present, and no existing comment offers a delete action, regardless of your role.
6. Switch to the Files tab.
7. **Expected**: no upload control is present, and no existing attachment offers a delete action.
8. Now open the same issue directly from its project's Support Ops board (not through the knowledge base).
9. **Expected**: fully editable as before — Save Changes, comment posting, file upload, and role-appropriate deletes are all present, confirming `readOnly` affects only the knowledge base's use of this modal, not its other three existing callers.

## Regression check

- Run backend tests: `cd backend && php artisan test` — all existing tests, including `SupportOpsControllerTest.php`/`SupportOpsTodayTest.php`, must pass unmodified, plus this feature's new `SupportOpsKnowledgeBaseTest.php`.
- Confirm `npm run build` and `npm run lint` remain clean.
- Confirm the existing "Today" sub-nav entry and page are unaffected by the nav-structure change (`subItem` → `subItems`) this feature requires.
- Confirm Kanban, Support Ops, and Today Dashboard's own use of `TaskDetailModal` is completely unaffected — full editing, commenting, and file upload/delete still work exactly as before the `readOnly` prop was added, since none of them ever pass it. (Work Program does not use `TaskDetailModal`.)
