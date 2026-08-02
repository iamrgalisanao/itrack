# Tasks: Sprint Retrospectives

**Input**: Design documents from `/specs/013-sprint-retrospectives/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Backend test tasks are included and REQUIRED, not optional — Constitution Principle III mandates a matching test task for any new backend logic in the same change. Frontend verification is manual-in-browser per the constitution's Development Workflow, matching this project's existing UI-testing practice.

**Organization**: Tasks are grouped by user story (see spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- File paths are exact, repository-root-relative

---

## Phase 1: Setup

**Purpose**: The three new tables and their models — nothing in this feature works without them.

- [X] T001 Create three migrations per `data-model.md`: `create_retro_sessions_table`, `create_retro_entries_table`, `create_retro_entry_votes_table`, following the `foreignId()->constrained()->cascadeOnDelete()` convention already used in `2026_07_26_090000_create_project_ownerships_table.php`
- [X] T002 [P] Create `RetroSession`, `RetroEntry`, `RetroEntryVote` models in `backend/app/Models/` with the relationships defined in `data-model.md` (`project()`/`entries()`, `session()`/`author()`/`owner()`/`votes()`, `entry()`/`user()`)

**Checkpoint**: Schema and models exist; nothing reads or writes through them yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared response shapes and the role-gating helpers every endpoint depends on.

**⚠️ CRITICAL**: No user story phase below can be implemented until this phase is complete.

- [X] T003 [P] Create `backend/app/Http/Resources/RetroSessionResource.php` per `data-model.md`'s shape (includes `entry_count`, needed by US5 later)
- [X] T004 [P] Create `backend/app/Http/Resources/RetroEntryResource.php` per `data-model.md`'s shape (includes `vote_count` and `voted_by_me`, needed by US3 later)
- [X] T005 Create `backend/app/Http/Controllers/RetrospectiveController.php` with private `canView(User $user)` and reliance on the existing `$user->canWrite()` trait method, mirroring `SupportOpsController`'s exact shape (inclusion-based, never a deny-list); every denial path calls `AuditLogger::denied()` per `contracts/retrospectives-api.md`

**Checkpoint**: Resources and the controller's shared gating logic exist; no endpoint methods yet.

---

## Phase 3: User Story 1 - Open a retro session and capture insights as they happen (Priority: P1) 🎯 MVP

**Goal**: A PM/Admin creates a named session; internal team members add entries to it continuously.

**Independent Test**: Create a session, have two different internal users each add an entry, confirm both appear attributed correctly (per `quickstart.md` Scenario 1).

### Implementation for User Story 1

- [X] T006 [US1] Implement `POST /api/retro-sessions` in `RetrospectiveController` (create session, `canWrite()`) + route in `backend/routes/api.php`, grouped like the existing Support Ops block
- [X] T007 [US1] Implement `GET /api/retro-sessions?project_id={id}` (list, `canView()`, `latest()` first) + route
- [X] T008 [US1] Implement `GET /api/retro-sessions/{id}` (session + its entries, `canView()`, project-scoped) + route
- [X] T009 [US1] Implement `POST /api/retro-sessions/{id}/entries` (add entry, `canWrite()`, `author_user_id` always the requester) + route

### Tests for User Story 1

- [X] T010 [US1] [P] Add `backend/tests/Feature/RetrospectivesTest.php` covering T006–T009: happy paths, `canView()`/`canWrite()` role denial, Client-role denial, and project-scoping denial (a user without project access gets `403` even with a valid role)

### Frontend for User Story 1

- [X] T011 [US1] Add `fetchRetroSessions`, `createRetroSession`, `fetchRetroSession`, `createRetroEntry` to `frontend/src/lib/api.js`
- [X] T012 [US1] Create `frontend/src/pages/Retrospectives.jsx`: session list, create-session form, and an active session view listing its entries (plain list for now — sentiment grouping arrives in US2)
- [X] T013 [US1] Wire Retrospectives into `frontend/src/App.jsx`: one `NAV_GROUPS` entry under Team Ops (`internalOnly: true`, matching Kanban/Support Ops) and its route

### Verification for User Story 1

- [X] T014 [US1] Manually run `quickstart.md` Scenarios 1, 7 (Client denial), and 9 (Work Program untouched)

**Checkpoint**: Sessions and entries exist and are usable end-to-end — a legitimate, demoable MVP even before sentiment tags, voting, or ownership land.

---

## Phase 4: User Story 2 - Tag entries by sentiment so the team can see them organized (Priority: P1)

**Goal**: Every entry carries exactly one of Keep/Improve/Discuss, and the session visibly groups by it.

**Independent Test**: Submission without a tag is blocked; entries with all three tags are visibly distinguished (per `quickstart.md` Scenario 2).

### Implementation for User Story 2

- [X] T015 [US2] Add required + enum (`keep`/`improve`/`discuss`) validation to T009's entry-creation request, per `research.md` Decision 3

### Tests for User Story 2

- [X] T016 [US2] [P] Extend `RetrospectivesTest.php`: entry creation rejected with no sentiment and with an invalid sentiment value

### Frontend for User Story 2

- [X] T017 [US2] Update `Retrospectives.jsx`: sentiment selector required on the entry form; entries displayed grouped into three columns (Keep / Improve / Discuss)

### Verification for User Story 2

- [X] T018 [US2] Manually run `quickstart.md` Scenario 2

**Checkpoint**: Entries are meaningfully categorized, not just a flat list.

---

## Phase 5: User Story 3 - Vote on entries to surface what matters most (Priority: P2)

**Goal**: Toggleable per-user voting with an accurate, shared vote count.

**Independent Test**: Vote, confirm count increases; vote again, confirm it decreases; confirm the count is the same for every viewer (per `quickstart.md` Scenario 3).

### Implementation for User Story 3

- [X] T019 [US3] Implement `POST /api/retro-entries/{id}/vote` (toggle: create-or-delete the vote row, `canWrite()`, project-scoped) + route, per `research.md` Decision 1

### Tests for User Story 3

- [X] T020 [US3] [P] Extend `RetrospectivesTest.php`: first vote creates a row, second vote from the same user removes it, `vote_count` reflects the real row count (not a separately maintained counter), role/project-scoping denial

### Frontend for User Story 3

- [X] T021 [US3] Add `toggleRetroVote` to `api.js`; add a vote button and live count to each entry in `Retrospectives.jsx`

### Verification for User Story 3

- [X] T022 [US3] Manually run `quickstart.md` Scenario 3

**Checkpoint**: Entries can be prioritized by the team, not just listed.

---

## Phase 6: User Story 4 - Assign an owner so follow-through actually happens (Priority: P2)

**Goal**: Any `canWrite()` user can assign/reassign/clear an entry's owner; only the author or Admin/PM can edit or delete the entry itself.

**Independent Test**: Assign, reassign, and clear an owner; confirm a non-author Team Member is denied editing/deleting someone else's entry while the author and Admin/PM succeed (per `quickstart.md` Scenarios 4 and 5).

### Implementation for User Story 4

- [X] T023 [US4] Implement `PATCH /api/retro-entries/{id}` + route, per `contracts/retrospectives-api.md`'s split: `owner_user_id` editable by any `canWrite()` user who currently has project access; `body`/`sentiment` editable only by the author or an Admin/PM, and **only** when that user currently has project access (`Project::accessibleTo()`) — an author whose access was later revoked is denied even though `author_user_id` matches. Validate the *target* `owner_user_id` resolves to a user who also has project access (`422` if not) — FR-006. Calls `AuditLogger::record()` when `owner_user_id` changes (Constitution Principle IV)
- [X] T024 [US4] Implement `DELETE /api/retro-entries/{id}` + route, using the same author-or-Admin/PM permission check **and** the same project-access re-check as T023. Calls `AuditLogger::record()` on delete (destructive action, Constitution Principle IV)

### Tests for User Story 4

- [X] T025 [US4] [P] Extend `RetrospectivesTest.php`: owner assign/reassign/clear succeeds for any `canWrite()` user; a non-author Team Member is denied on `body`/`sentiment` edit and on delete; the author succeeds on both; Admin/PM can moderate any entry regardless of authorship; an author whose `ProjectAssignment` has been removed is denied editing/deleting their own old entry (project-access re-check, not just an authorship check); assigning an owner with no access to the project is rejected with `422`

### Frontend for User Story 4

- [X] T026 [US4] Add `updateRetroEntry` and `deleteRetroEntry` to `api.js`; add owner-assignment UI and edit/delete controls to `Retrospectives.jsx`, visible only to the entry's author or an Admin/PM (the frontend hint — T023/T024 are the actual enforcement)

### Verification for User Story 4

- [X] T027 [US4] Manually run `quickstart.md` Scenarios 4 and 5

**Checkpoint**: Retrospective outcomes are trackable commitments, not just comments, and moderation works as specified.

---

## Phase 7: User Story 5 - Browse and reopen past sessions (Priority: P3)

**Goal**: Every session for a project is listed and reopenable, showing only its own entries.

**Independent Test**: Create two sessions with different entries; confirm both are listed and each shows only its own entries (per `quickstart.md` Scenario 8).

### Implementation for User Story 5

- [X] T028 [US5] Confirm T003/T007 already satisfy this (`RetroSessionResource`'s `entry_count`, `GET /api/retro-sessions`'s `latest()` ordering) — fix if either was missed when first built

### Frontend for User Story 5

- [X] T029 [US5] Add a session list/switcher to `Retrospectives.jsx` so a user can move between past sessions without losing track of the current one

### Verification for User Story 5

- [X] T030 [US5] Manually run `quickstart.md` Scenario 8

**Checkpoint**: All five user stories are complete and independently verified.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: The two cross-cutting scenarios that don't belong to a single story, plus final validation.

- [X] T031 [P] Manually run `quickstart.md` Scenario 6 (Department Head can view everything built in US1–US5 but has no create/add/vote/assign/edit/delete control rendered, and the backend still denies any of those actions if attempted directly)
- [X] T032 [P] Confirm `quickstart.md` Scenario 9 still holds — Work Program's Module/Activity/Sub-Activity/Task structure and behavior are unchanged by this feature (FR-011)
- [X] T033 Run `php artisan test` (backend) and re-run the full `quickstart.md` validation guide end to end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T002's models) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only — the MVP
- **User Story 2 (Phase 4)**: Depends on US1's entry-creation endpoint (T009) existing to add validation to
- **User Story 3 (Phase 5)**: Depends on Foundational only; independent of US2, though both are P1/P2 in sequence
- **User Story 4 (Phase 6)**: Depends on Foundational only; independent of US2/US3
- **User Story 5 (Phase 7)**: Depends on US1 (T007's list endpoint, T003's resource) already existing — verification-heavy, not much new code
- **Polish (Phase 8)**: Depends on all five user stories being complete

### Parallel Opportunities

- T001 and T002 (Setup) — T002 depends on T001's tables existing, so sequential, not parallel
- T003 and T004 (Foundational) can run in parallel — different files
- Once Foundational is done, US3 (Phase 5) and US4 (Phase 6) can proceed in parallel with each other and with US2 (Phase 4), since none share an implementation file with the others beyond the shared `RetrospectiveController.php` (coordinate to avoid clobbering unrelated methods in the same file)
- T031 and T032 (Polish) can run in parallel

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md` Scenarios 1, 7, 9
5. Sessions and entries work end-to-end — demoable before sentiment grouping, voting, or ownership exist

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate → demo (MVP: sessions + entries)
3. US2 → validate → demo (sentiment-organized entries)
4. US3 → validate → demo (voting surfaces priority)
5. US4 → validate → demo (ownership + moderation)
6. US5 → validate → demo (session history)
7. Polish → final full-suite validation

---

## Notes

- [P] tasks touch different files with no dependency on an incomplete task
- Every backend implementation task has a matching test task in the same phase, per Constitution Principle III
- Frontend verification is manual-in-browser against `quickstart.md`, per the constitution's existing UI-testing practice
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
