# Tasks: Support Ops Knowledge Base

**Input**: Design documents from `/specs/009-support-ops-knowledge-base/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/support-ops-knowledge-base-api.md, quickstart.md (all present, all reviewed and revised across two rounds as of this generation)

**Tests**: Included. Explicitly requested by this feature's own plan.md Testing section, and required by the constitution's Principle III for any new endpoint/authorization rule. The one deliberate exception is User Story 3: contracts.md confirms it adds no new backend endpoint, so it has no backend test tasks — only frontend component work plus the manual verification plan.md itself calls out as "the one behavior in this feature a backend test cannot cover."

**Organization**: Tasks are grouped by user story (US1 = P1, US2 = P2, US3 = P3) per spec.md's priority order.

## Path Conventions

Web app, matching the existing repo layout: `backend/` (Laravel API), `frontend/` (React/Vite). Exact file paths are given per task, matching plan.md's Project Structure section.

## Phase 1: Setup

- [x] T001 Confirm the `009-support-ops-knowledge-base` branch is checked out and both dev servers (`cd backend && php artisan serve`, `cd frontend && npm run dev`) start cleanly — environment check only, no code changes; no migration to run (this feature adds no table or column)

---

## Phase 2: Foundational (Blocking Prerequisite)

**Purpose**: The one reusable query condition every later query in this feature builds on.

- [x] T002 Add `scopeResolvedWithRecordedFix(Builder $query): Builder` to `backend/app/Models/DetailedActivity.php` — `whereIn('work_type', ['support', 'learning'])`, `where('status', 'completed')` (the value the board's "Resolved" column renders, matched by value not label), `whereNotNull('root_cause')` + `whereRaw("TRIM(root_cause) != ''")`, same for `resolution` (data-model.md; FR-003/FR-004)

**Checkpoint**: The inclusion rule exists as one reusable, independently correct unit — User Story 1 can now build the endpoint on top of it.

---

## Phase 3: User Story 1 - Search resolved issues by keyword (Priority: P1) 🎯 MVP

**Goal**: An internal team member can search resolved, complete Support Ops issues by keyword and see relevant results with their root cause and resolution visible.

**Independent Test**: As an internal team member, enter a keyword that appears in a previously resolved issue's name, client, root cause, or resolution text; confirm that issue appears in the results, and confirm a keyword matching nothing returns an empty result set rather than an error.

### Tests for User Story 1 ⚠️

> Write these first; confirm they fail before starting the Implementation tasks below.

- [x] T003 [P] [US1] Feature test: a resolved issue with both root cause and resolution recorded is found by a keyword matching its `name`, `client_name`, `tenant_name`, `root_cause`, or `resolution` — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php` (new file)
- [x] T004 [P] [US1] Feature test: matching is case-insensitive (an uppercase search finds a lowercase-recorded value and vice versa) and partial (a substring finds a full-field value) — FR-001a — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`
- [x] T005 [P] [US1] Feature test: a keyword containing a literal `%`, `_`, or `\` character matches only that literal text, never behaving as a SQL wildcard — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`
- [x] T006 [P] [US1] Feature test: a resolved issue missing its root cause, its resolution, or both (including a whitespace-only value in either) is excluded from results even when its other fields match the keyword — FR-003 — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`
- [x] T007 [P] [US1] Feature test: an issue that is not in the resolved status is excluded regardless of how well its text matches — FR-004 — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`
- [x] T008 [P] [US1] Feature test: results are scoped to exactly the projects `Project::accessibleTo($user)` returns, verified across Admin, Project Manager, Department Head, and a Team Member with only partial project access (an issue in an inaccessible project never appears, with no distinct error) — FR-007 — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`
- [x] T009 [P] [US1] Feature test: a Client-role request is denied `403`, identical to `today()`'s existing message, including a direct request that bypasses the UI — FR-008/FR-011 — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`
- [x] T010 [P] [US1] Feature test: a keyword matching zero issues returns `200` with an empty result set, never an error — FR-002 — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`

### Implementation for User Story 1

- [x] T011 [US1] Add `knowledgeBase(Request $request)` to `backend/app/Http/Controllers/SupportOpsController.php` — `canView()` gate (identical to `today()`), `Project::query()->accessibleTo($user)->pluck('id')` cross-project scoping, `DetailedActivity::resolvedWithRecordedFix()`, `q` keyword search across exactly `name`/`client_name`/`tenant_name`/`root_cause`/`resolution` via `LOWER(column) LIKE ? ESCAPE '!'` with the keyword lowercased and wildcard-escaped using `!` as the escape character (not backslash — MySQL and SQLite disagree on backslash-in-string-literal handling, discovered via the T005 test failing on first run; `!` needs no special quoting on either engine), sorted `updated_at` descending, paginated (`per_page` validated `nullable|integer|min:1|max:100`, default 15), returning `TodaySupportIssueResource::collection(...)` (data-model.md, contracts/support-ops-knowledge-base-api.md)
- [x] T012 [US1] Add route `GET /api/support-ops/knowledge-base` to `backend/routes/api.php`
- [x] T013 [US1] Add `fetchSupportOpsKnowledgeBase(params)` to `frontend/src/lib/api.js` — a thin passthrough (`api.get('/support-ops/knowledge-base', { params })`), not a per-field whitelist, so it already accepts every query param contracts.md defines (`q`, `project_id`, `client_name`, `tenant_name`, `client_priority`, `page`, `per_page`) without needing an edit when US2 (T022) starts sending the filter params — US1 itself only ever calls it with `q`/`page`/`per_page`
- [x] T014 [US1] Create `frontend/src/pages/SupportOpsKnowledgeBase.jsx` — `useEffectiveUser()`, a keyword search input, fetch-on-mount and on-search-change, a result list rendering each issue's name/client/tenant/root cause/resolution/project/resolved date, mirroring `TodayDashboard.jsx`'s established fetch/loading-state structure
- [x] T015 [US1] In `frontend/src/App.jsx`: change `NAV_GROUPS`'s "Support Ops" entry from `subItem: {...}` to `subItems: [...]` (keeping "Today", adding "Knowledge Base" → `/support-ops/knowledge-base`); update the one render site in `SidebarNavGroups` (shared by `Sidebar` and `MobileBar`) to map over the array instead of rendering a single conditional element; add the route under the existing `SupportOpsGuard`
- [x] T016 [US1] Run T003-T010 — all green before proceeding to User Story 2

**Checkpoint**: An internal team member can navigate to the Knowledge Base and find a relevant resolved issue by keyword. This alone is a deployable MVP — the actual reason this feature exists.

---

## Phase 4: User Story 2 - Browse resolved issues without a keyword (Priority: P2)

**Goal**: A team member without a specific keyword in mind can browse resolved issues most-recently-resolved first, and narrow by project, client, tenant, or priority.

**Independent Test**: As an internal team member, open the knowledge base with no search keyword entered; confirm resolved issues appear, most recent first, and confirm narrowing by any one filter reduces the list to only matching issues.

### Tests for User Story 2 ⚠️

> Write these first; confirm they fail before starting the Implementation tasks below.

- [x] T017 [P] [US2] Feature test: browsing with no keyword returns eligible results ordered most-recently-resolved (`updated_at` descending) first — FR-005 — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`
- [x] T018 [P] [US2] Feature test: `project_id`, `client_name`, `tenant_name`, and `client_priority` filters each narrow results correctly on their own, as exact matches — FR-006 — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`
- [x] T019 [P] [US2] Feature test: a keyword and one or more filters supplied together return only results satisfying all of them (logical AND — narrower than either alone, never broader) — FR-006a — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`
- [x] T020 [P] [US2] Feature test: pagination behaves like `UserManagementController::index()` — default `per_page` of 15, accepts up to 100, rejects values outside `min:1|max:100` — FR-006b — in `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`

### Implementation for User Story 2

- [x] T021 [US2] Extend `knowledgeBase()` in `backend/app/Http/Controllers/SupportOpsController.php` — add `project_id`/`client_name`/`tenant_name`/`client_priority` exact-match filters (each independent, all AND-combined with each other and with `q`); no change to the sort order already added in T011 (already applies consistently with or without filters)
- [x] T022 [US2] Add project/client/tenant/priority filter controls to `frontend/src/pages/SupportOpsKnowledgeBase.jsx`, wired to the same fetch call as the keyword search, mirroring `SupportOps.jsx`'s existing dropdown-filter UX
- [x] T023 [US2] Run T017-T020 — all green before proceeding to User Story 3

**Checkpoint**: A team member can browse and narrow the knowledge base with no keyword at all, exactly as usefully as searching one.

---

## Phase 5: User Story 3 - Open a search result's full context (Priority: P3)

**Goal**: Selecting a knowledge base result opens the issue's complete original detail — evidence, discussion, attachments — through the same view already used elsewhere, in a read-only mode that cannot mutate the historical record being browsed.

**Independent Test**: As an internal team member, select a result from the knowledge base; confirm it opens the same issue detail view already used elsewhere in the app, and confirm no save, comment, upload, or delete action is available anywhere in it.

**Note**: No new backend endpoint exists for this story (contracts.md) — FR-009/FR-009a are satisfied entirely by frontend reuse of already-existing endpoints, so there are no backend test tasks here, only component changes and the manual verification plan.md itself flags as unavoidable.

### Implementation for User Story 3

- [x] T024 [US3] Add a `readOnly` boolean prop (default `false`) to `frontend/src/components/TaskDetailModal.jsx` — when `true`, render the Details tab's existing fields with the native `disabled` attribute, do not render the "Save Changes" button (Close remains), and pass `readOnly` through to the `extraFields` call and to `TaskComments`/`TaskFiles`. Also guard `handleSubmit` itself with an early `if (readOnly) return` (or equivalent), so the component never calls `onSave(form)` in read-only mode even if a future edit misses disabling one field or the caller omits `onSave` entirely — the component's own safety should not depend solely on every field being correctly disabled elsewhere
- [x] T025 [US3] Add a `readOnly` boolean prop (default `false`) to `frontend/src/components/SupportIssueExtraFields.jsx` — when `true`, disable its own fields identically and do not render the "Record client update now" button or the three Support Generator panels (Client Message Templates, Freeform Client Update, Troubleshooting Packet)
- [x] T026 [US3] Add a `readOnly` boolean prop (default `false`) to `frontend/src/components/TaskComments.jsx` — when `true`, do not render the add-comment form, and do not offer a delete action on any existing comment regardless of the viewing role's normal delete permission
- [x] T027 [US3] Add a `readOnly` boolean prop (default `false`) to `frontend/src/components/TaskFiles.jsx` — when `true`, do not render the upload control, and do not offer a delete action on any existing attachment regardless of the viewing role's normal delete permission
- [x] T028 [US3] In `frontend/src/pages/SupportOpsKnowledgeBase.jsx`, add `selectedIssue` state and an `openIssueDetail(issue)` handler (mirroring `TodayDashboard.jsx`'s exact pattern); render `<TaskDetailModal task={selectedIssue} readOnly onClose={...} userRole={...} extraFields={...} />` on result click — no `onSave` handler is needed since the Save button never renders in `readOnly` mode
- [x] T029 [US3] Manual verification via `specs/009-support-ops-knowledge-base/quickstart.md` Scenarios 6-7 — confirm full context opens correctly and confirm no save/comment/upload/delete action is present anywhere in the modal when opened from the knowledge base

**Checkpoint**: All three user stories are independently functional. A knowledge base result is fully actionable (full context reachable) without any risk of mutating the historical record being searched.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T030 [P] Regression check: confirm `Kanban.jsx`, `SupportOps.jsx`, and `TodayDashboard.jsx`'s own use of `TaskDetailModal` is completely unaffected by T024-T027 — full editing, commenting, and file upload/delete still work exactly as before, since none of them pass `readOnly` (`WorkProgram.jsx` does not use `TaskDetailModal` at all — confirmed via `grep` during implementation, correcting an inherited assumption from earlier design docs) — per quickstart.md's Regression check
- [x] T031 [P] Run `npm run lint` and `npm run build` in `frontend/` — clean, no leftover unused imports or reference errors
- [x] T032 Run the complete `php artisan test` suite — 100% pass, zero regressions across 001-009
- [x] T033 Execute `specs/009-support-ops-knowledge-base/quickstart.md` Scenarios 1-7 manually against the running dev servers

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: No dependencies.
- **Foundational (T002)**: Depends on Setup — BLOCKS User Story 1 (the scope is used inside `knowledgeBase()`).
- **User Story 1 (T003-T016)**: Depends on Foundational. Must complete before US2/US3 — both extend the endpoint and page US1 creates; neither introduces a new one.
- **User Story 2 (T017-T023)**: Depends on US1's `knowledgeBase()` method and `SupportOpsKnowledgeBase.jsx` page existing — it modifies both, not creates new ones.
- **User Story 3 (T024-T029)**: Depends on US1's page existing (T028 wires the modal into it) but is otherwise independent of US2 — the four component changes (T024-T027) touch no file US2 touches, so they could be staffed in parallel with US2 if two developers are available.
- **Polish (T030-T033)**: Depends on all three user stories being complete.

### Within Each User Story

- Tests are written and confirmed failing before their corresponding Implementation tasks (US1/US2). US3 has no backend tests to sequence against, per its Note above.
- Backend query/endpoint work (US1's T011-T012, US2's T021) before the frontend calls that depend on it (US1's T013-T015, US2's T022).

### Parallel Opportunities

- T003-T010 (US1 tests) — same new test file, but independent PHPUnit methods; safe to write in parallel, run together.
- T017-T020 (US2 tests) — same file, independent methods.
- T024-T027 (US3's four component changes) — four different files, no dependency among them.
- US3's component work (T024-T028) can proceed in parallel with US2 (T017-T023) once US1 is done, if staffed separately — they touch entirely different files.

---

## Parallel Example: User Story 1

```bash
# All eight US1 tests are independent PHPUnit methods in the same new file —
# write and run them together before starting T011:
Task: T003 Keyword matches name/client/tenant/root cause/resolution
Task: T004 Case-insensitive and partial match
Task: T005 Literal %, _, and \ characters match literally
Task: T006 Missing root cause or resolution (or both) excludes the issue
Task: T007 Non-resolved issue excluded regardless of match
Task: T008 Visibility scoped to accessible projects, across every role
Task: T009 Client role denied, including direct API access
Task: T010 Zero matches returns 200 with an empty set
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1).
3. **Stop and validate**: an internal team member can search resolved issues by keyword and see their root cause/resolution. This alone is the entire reason this feature exists — ship it before adding browsing or full-context drill-down.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. User Story 1 → test independently → deploy/demo (MVP).
3. User Story 2 → test independently → deploy/demo — browsing without a keyword, a real and distinct use case.
4. User Story 3 → test independently → deploy/demo — full context, safely read-only.
5. Polish → full regression + manual quickstart pass → ship.

### Parallel Team Strategy

With two developers, after User Story 1 is done: Developer A takes User Story 2 (extending `knowledgeBase()` and its page with filters), Developer B takes User Story 3 (the four `readOnly` component changes and wiring the modal) — both depend on US1 existing but not on each other.

---

## Notes

- [P] tasks touch different files or independent test methods with no dependency on an incomplete task.
- [Story] labels map every user-story-phase task back to spec.md's US1/US2/US3 for traceability.
- Every user story is independently completable and testable per its own Independent Test above.
- Confirm each phase's tests fail before implementing that phase (US1/US2 only — US3 has no backend tests to sequence against).
- Commit after each task or logical group, per this project's established per-story commit convention.
- Stop at any checkpoint to validate a story independently before moving to the next.
