# Tasks: Retrospective Table View

**Input**: Design documents from `/specs/014-retro-table-view/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Backend test tasks are included and REQUIRED, not optional — Constitution Principle III mandates a matching test task for any new backend logic in the same change, and Principle VIII's Definition-of-Done Gate requires the authorization/tenant-isolation/OWASP/code-slop reviews below before this feature is considered complete. Frontend verification is manual-in-browser per the constitution's existing UI-testing practice.

**Organization**: Tasks are grouped by user story (see spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- File paths are exact, repository-root-relative

---

## Phase 1: Setup

**Purpose**: The one new column this entire feature hangs off of.

- [X] T001 Create migration `backend/database/migrations/<timestamp>_add_is_repeating_to_retro_entries_table.php` per `data-model.md`: `$table->boolean('is_repeating')->default(false)->after('sentiment');`, matching the `client_visible` precedent (`2026_06_25_014400_add_client_visible_to_detailed_activities_table.php`)
- [X] T002 [P] Add `'is_repeating'` to `RetroEntry::$fillable` in `backend/app/Models/RetroEntry.php` (`laravel-best-practices` `sec-mass-assignment` — explicit fillable, never `$guarded = []`)

**Checkpoint**: Column and model exist; nothing reads or writes it through the API yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared response field both US1 (display) and US2 (edit) depend on.

**⚠️ CRITICAL**: No user story phase below can be implemented until this phase is complete.

- [X] T003 Add `'is_repeating' => (bool) $this->is_repeating` to `backend/app/Http/Resources/RetroEntryResource.php`, alongside the existing `sentiment` field per `data-model.md`

**Checkpoint**: Every `RetroEntryResource` response now includes `is_repeating`; nothing renders or edits it yet.

---

## Phase 3: User Story 1 - Browse a session as a grouped table (Priority: P1) 🎯 MVP

> **⚠️ SUPERSEDED by Phase 7 below.** T004–T008 implemented "group = sentiment"
> (three sub-tables per session). Reference mockups reviewed after this phase
> shipped showed the correct grouping axis is the Session itself, with Type
> as an ordinary per-row column. T004–T008 are left `[X]` as an accurate
> historical record of what was built and verified at the time; Phase 7
> supersedes their output. Do not use this phase's description as current
> behavior — see Phase 7.

**Goal**: ~~Replace the 3-lane Kanban layout with three collapsible sentiment groups, each a table with columns Feedback, Submitter, Type, Repeating?, Vote, Owner.~~ See Phase 7.

**Independent Test**: Open a session with entries in all three sentiments; confirm three collapsible groups each render a table with the six named columns, and collapse/re-expand preserves entries (per `quickstart.md` Scenario 1).

### Frontend for User Story 1

- [X] T004 [US1] In `frontend/src/pages/Retrospectives.jsx`, replace the `grid grid-cols-1 md:grid-cols-3` Kanban lane block with three `Collapsible` sections (one per `SENTIMENTS` entry), each wrapping a `Table` (`frontend/src/components/ui/collapsible.jsx`, `table.jsx` — existing primitives, no new dependency per `research.md` D5)
- [X] T005 [US1] Within each group's `Table`, render one row per entry with columns Feedback (`entry.body`), Submitter (`entry.author`), Type (`entry.sentiment` badge), Repeating? (read-only indicator for now — interactive toggle arrives in US2), Vote (existing vote button/count, unchanged), Owner (existing owner-assignment `<select>`, unchanged)
- [X] T006 [US1] Ensure a group with zero entries still renders its `Table` with an empty-state row rather than being omitted (spec FR-003, Edge Cases)
- [X] T007 [US1] Confirm the existing "Add Entry" button/dialog (outside the `SENTIMENTS.map` block T004 replaces) still renders and successfully creates an entry after the layout change — FR-004 requires this affordance survive the rework, not just remain untouched by accident (`speckit-analyze` finding C1)

### Verification for User Story 1

- [X] T008 [US1] Manually run `quickstart.md` Scenario 0 (013 regression check) and Scenario 1, including Scenario 1's added check that a scan of grouped counts/Repeating flags takes no more than a few seconds and requires no sideways scrolling at a standard viewport width (SC-001; `speckit-analyze` finding C3)

**Checkpoint**: ~~The table layout is live and matches the monday.com-style reference~~ — superseded, see Phase 7's checkpoint.

---

## Phase 4: User Story 2 - Flag an entry as a repeating issue (Priority: P2)

**Goal**: The entry's author, or an Admin/PM, can toggle its Repeating flag; no one else can.

**Independent Test**: As the author, toggle Repeating on and off, confirm it persists across reload; confirm a non-author Team Member cannot toggle it (per `quickstart.md` Scenarios 2 and 3).

### Implementation for User Story 2

- [X] T009 [US2] In `backend/app/Http/Controllers/RetrospectiveController.php`'s `updateEntry()`: add `'is_repeating' => 'sometimes|boolean'` to the validation rules, and include `'is_repeating'` in the `$isAuthorOrModerator`-gated field set (the same branch as `body`/`sentiment`, per `contracts/retrospectives-table-view-api.md` — explicitly NOT the broader `owner_user_id` branch)
- [X] T010 [US2] Add `'is_repeating'` to the `array_intersect_key($validated, array_flip([...]))` attribute list in `updateEntry()` so the toggle is actually persisted

### Tests for User Story 2

- [X] T011 [US2] [P] Extend `backend/tests/Feature/RetrospectivesTest.php` with the `laravel-testing`/`laravel-owasp-security`-derived cases from `research.md`: (1) author toggles own entry's `is_repeating` → 200 + `assertDatabaseHas`; (2) non-author, non-Admin/PM Team Member attempts to toggle another user's entry → 403, value unchanged in DB; (3) Admin and, separately, PM toggle an entry they didn't author → 200; (4) regression proving `is_repeating` cannot be set through the unrestricted owner-assignment path — a `canWrite()` user with project access but not author/Admin/PM sending `is_repeating` still gets 403 (mirrors 013's F1/F2 regression style); (5) FR-008 — a PATCH containing only `is_repeating` leaves the entry's `body`, `sentiment`, `owner_user_id`, and vote rows unchanged (`assertDatabaseHas` the original values for all four after the toggle; `speckit-analyze` finding C2)

### Frontend for User Story 2

- [X] T012 [US2] In `Retrospectives.jsx`, make the Repeating? column interactive: a toggle/checkbox calling `updateRetroEntry(entry.id, { is_repeating: !entry.is_repeating })` (existing function, no `api.js` change needed per `contracts/retrospectives-table-view-api.md`), rendered only when `canModerateEntry(entry)` is true (reusing the existing helper already gating edit/delete)

### Verification for User Story 2

- [X] T013 [US2] Manually run `quickstart.md` Scenarios 2 and 3

**Checkpoint**: Repeating is a real, permission-checked, persisted flag — not just a display column.

---

## Phase 5: User Story 3 - See session-wide vote totals (Priority: P3)

**Goal**: The session view shows a read-only footer: total votes cast and total distinct voters, computed at read time.

**Independent Test**: With 3 users casting 5 votes total, confirm the footer reads "Total votes: 5" / "Total voters: 3"; confirm it updates correctly as votes are removed (per `quickstart.md` Scenario 4), and shows zeros rather than being hidden when there are no votes (Scenario 5).

### Implementation for User Story 3

- [X] T014 [US3] In `RetrospectiveController::showSession()`, compute `$entryIds = $retroSession->entries()->pluck('id')`, then `total_votes` via `RetroEntryVote::whereIn('retro_entry_id', $entryIds)->count()` and `total_voters` via `RetroEntryVote::whereIn('retro_entry_id', $entryIds)->distinct('user_id')->count('user_id')` — two aggregate queries total, not per-entry (`laravel-best-practices` `eloquent-eager-loading`; `research.md` D4)
- [X] T015 [US3] Add `'vote_summary' => ['total_votes' => ..., 'total_voters' => ...]` as a new top-level key in `showSession()`'s existing `response()->json([...])` array, always present (never omitted when zero), per `contracts/retrospectives-table-view-api.md`

### Tests for User Story 3

- [X] T016 [US3] [P] Extend `RetrospectivesTest.php`: `showSession()` response includes `vote_summary.total_votes`/`total_voters` matching a hand-computed expectation from seeded votes across multiple users and multiple entries (distinct-voter count must not double-count a user who voted on 2+ entries); a session with zero votes returns `vote_summary: {total_votes: 0, total_voters: 0}`, not a missing/null key
- [X] T017 [US3] [P] Confirm (re-run, do not skip) 013's existing Client-role and unauthenticated denial tests for `showSession()` still pass unmodified — no regression from the new response field

### Frontend for User Story 3

- [X] T018 [US3] In `Retrospectives.jsx`, render a footer below the session's groups showing `Total votes: {sessionDetail.vote_summary.total_votes}` and `Total voters: {sessionDetail.vote_summary.total_voters}`, visible to every role that can view the session (including Department Head)

### Verification for User Story 3

- [X] T019 [US3] Manually run `quickstart.md` Scenarios 4 and 5

**Checkpoint**: All three user stories are complete and independently verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: The Definition-of-Done Gate items from `quickstart.md` that don't belong to a single story, plus final validation.

- [X] T020 [P] Manually run `quickstart.md` Scenario 6 (Department Head sees the new column and footer but has no interactive control for either) and Scenario 7 (Client denial, unchanged)
- [X] T021 [P] Authorization + tenant-isolation review (Constitution Principle VIII): read the `updateEntry()` diff to confirm `is_repeating` sits in the `$isAuthorOrModerator` branch, not the `owner_user_id` branch; manually verify with two sessions in different projects that one session's `vote_summary` never includes the other's votes
- [X] T022 [P] OWASP review (`laravel-owasp-security`, Broken Access Control focus): attempt the Scenario 3 non-author toggle directly via the API (not just through the UI) and confirm 403
- [X] T023 [P] code-slop review (`code-slop`): confirm no new abstraction was introduced for the three fixed sentiment groups, no narration comments were added, and T011/T016's new tests assert real database/response state rather than "does not throw"
- [X] T024 Run `php artisan test` (backend) and re-run the full `quickstart.md` validation guide end to end, including Scenario 0's 013-regression check

---

## Phase 7: Correction — Session is the group, not sentiment (Priority: P1)

**Why this phase exists**: Reference mockups reviewed after Phase 3–6 shipped
showed monday.com's actual grouping axis is a named group (which the retro
Session already serves as), not sentiment — see `research.md` D1 (revised)
and `spec.md`'s User Story 1/FR-001–FR-003 amendments. This phase corrects
Phase 3's output and adds the repeating tally (spec FR-014) discovered from
the same mockups. Frontend-only plus one footer addition — no new backend
endpoint, no new migration.

**Goal**: One collapsible table per session (not three), Type as a per-row
color-coded column, and a repeating tally in the footer alongside vote
totals.

**Independent Test**: Open a session with entries across all three Types;
confirm one table shows every entry with a per-row Type indicator; confirm
the footer shows both "Total votes: N / Total voters: M" and a repeating
tally "X/N" that updates immediately when a Repeating flag is toggled (per
`quickstart.md` Scenario 1 and Scenario 4, both revised).

### Frontend for Phase 7

- [X] T025 [US1] In `frontend/src/pages/Retrospectives.jsx`, remove the `SENTIMENTS.map` outer loop (three `Collapsible`+`Table` blocks) added by T004; render exactly one `Collapsible` wrapping one `Table` for the currently-selected session, with every entry in `sessionDetail.entries` as a row regardless of sentiment
- [X] T026 [US1] Within that single table's Type column, render `entry.sentiment` as a per-row color-coded `Badge` (reuse the existing `SENTIMENTS` constant for label/color lookup — same constant T005 already used, now read per-row instead of as a group key)
- [X] T027 [US1] Ensure the single table still renders (collapsed or expanded) with an empty-state row when the session has zero entries (spec FR-003, unchanged requirement, now scoped to one table instead of three)
- [X] T028 [US1] Regression-check that Add Entry, the Repeating checkbox (US2/T012), the Vote button (existing), and the Owner select (existing) all still function correctly now that they render inside the single flattened table instead of per-sentiment sub-tables
- [X] T029 [US3] Add a repeating tally to the footer built in T018: compute `entries.filter(e => e.is_repeating).length` over `entries.length` client-side (no backend change — research.md D6) and render it as "X/N" alongside the existing "Total votes"/"Total voters" text, updating on every `loadSessionDetail()` refresh (spec FR-014)

### Verification for Phase 7

- [X] T030 Manually re-run `quickstart.md` Scenarios 0, 1, 2, 3, 4, 5, 6, and 7 end-to-end against the corrected single-table layout (Scenarios 1, 4, and 5 were revised for this phase; 2, 3, 6, 7 should be unaffected but are re-run to confirm no regression from the layout rework)
- [X] T031 Run `php artisan test` to confirm zero backend regression (expected: no backend files changed in this phase, so no new failures)

**Checkpoint**: The table layout now matches the reference mockups exactly — one table per session, Type as a row value, footer showing both vote totals and the repeating tally.

---

## Phase 8: Second correction — instant session creation + rename, Type set from the table (Priority: P2)

**Why this phase exists**: A second round of reference material (monday.com
screenshots + explicit user instruction) showed two more workflow details
this spec's Phase 1–7 output didn't match: (1) "New Session" should create
a blank, immediately-usable table with a renamable default name, not a
label-first form; (2) Type is assigned by clicking the table's Type cell
after an entry exists, not chosen in the creation form. See spec.md User
Stories 4/5 (FR-015–FR-020) and research.md D7/D8/D9. A third observed
detail (per-entry Subitems) is explicitly deferred, not part of this phase.

**Goal**: Clicking "New Session" is a single action with no form; every
session can be renamed by any write-capable teammate; new entries start
with no Type; Type is set/changed from the table.

**Independent Test**: Click "New Session" and confirm an empty table
appears with zero required input; rename it and confirm persistence; add
an entry with no Type and confirm it can be set afterward from its Type
cell (per `quickstart.md` Scenarios 8 and 9).

### Implementation for Phase 8

- [X] T032 Create migration `backend/database/migrations/<timestamp>_make_sentiment_nullable_on_retro_entries_table.php`: `$table->string('sentiment')->nullable()->change();` per `data-model.md` (widening change, not destructive — no backfill needed)
- [X] T033 In `backend/app/Http/Controllers/RetrospectiveController.php`'s `storeEntry()`, change `'sentiment' => ['required', 'string', Rule::in(RetroEntry::SENTIMENTS)]` to `'sentiment' => ['nullable', 'string', Rule::in(RetroEntry::SENTIMENTS)]`, and pass `$validated['sentiment'] ?? null` into `RetroEntry::create()` (spec FR-018)
- [X] T034 Add `updateSession(Request $request, RetroSession $retroSession)` to `RetrospectiveController`: `canWrite()` + `hasProjectAccess()` gate (identical to `storeSession()`, research.md D8), validate `'label' => 'required|string|max:255'`, update, return `RetroSessionResource` — no audit log call (per `data-model.md`)
- [X] T035 Add route `Route::patch('retro-sessions/{retroSession}', [RetrospectiveController::class, 'updateSession']);` in `backend/routes/api.php`, grouped with the other retro-sessions routes

### Tests for Phase 8

- [X] T036 [P] Extend `backend/tests/Feature/RetrospectivesTest.php` per `research.md`'s D7/D8 skill-derived cases (items 10–14): entry created with no `sentiment` → 201, `sentiment` is `null`; permitted user sets `sentiment` via `PATCH` from `null` → 200, persisted; a non-creator Team Member with `canWrite()` renames a session → 200; a user without `canWrite()`/project access attempts rename → 403; renaming to an empty string → 422, prior label unchanged

### Frontend for Phase 8

- [X] T037 Add `updateRetroSession(id, label)` to `frontend/src/lib/api.js`: `api.patch(`/retro-sessions/${id}`, { label })`
- [X] T038 In `frontend/src/pages/Retrospectives.jsx`, remove the "New Session" dialog (`isNewSessionOpen`/`newSessionLabel` state and the `Dialog` block) — the "New Session" button now calls `createRetroSession(selectedProjectId, 'New Session')` directly and selects the newly created session (research.md D9)
- [X] T039 Add inline-rename UI for the session title (the label shown in the collapsible trigger from T025): click to edit, Enter/blur to save via `updateRetroSession`, Escape to cancel without saving; visible only to `canWrite()` users (matches T034's backend gate)
- [X] T040 In the "Add Entry" dialog, remove the `SENTIMENTS` button-picker section entirely; `createRetroEntry` is called with only `body` (no `sentiment` argument), matching T033's now-optional field
- [X] T041 Make the Type table cell interactive: for `canModerateEntry(entry)` users, clicking it opens a small dropdown/menu of Keep/Improve/Discuss (calling `updateRetroEntry(entry.id, { sentiment: value })`); render a visibly blank/placeholder cell when `entry.sentiment` is `null`; non-permitted users see a read-only cell (badge or blank), no dropdown on click

### Verification for Phase 8

- [X] T042 Manually run `quickstart.md` Scenarios 8 and 9, plus a full re-run of Scenarios 0–7 to confirm no regression from removing the New Session dialog and the Add Entry sentiment picker
- [X] T043 Run `php artisan test` to confirm the full suite (including T036's new cases) passes

**Checkpoint**: Starting a session and categorizing feedback both match the corrected reference workflow — zero-friction session creation, Type assigned from the table.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T002's fillable change) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only — the MVP (layout rework)
- **User Story 2 (Phase 4)**: Depends on Foundational only; independent of US1's layout work but visually lands inside the table US1 builds
- **User Story 3 (Phase 5)**: Depends on Foundational only; fully independent of US1/US2
- **Polish (Phase 6)**: Depends on all three user stories being complete
- **Phase 7 (correction)**: Depends on Phase 6 having shipped (it corrects Phase 3's output) — supersedes Phase 3's layout
- **Phase 8 (second correction)**: Depends on Phase 7 (builds on the single-table layout T025 produced) — independent of Phase 7's own internals otherwise

### Parallel Opportunities

- T001 and T002 (Setup) can run in parallel — different files, T002 doesn't depend on T001's migration having run yet (only on it existing before tests execute)
- Once Foundational (T003) is done, US2 (Phase 4) and US3 (Phase 5) can proceed in parallel with each other and with US1 (Phase 3), since T009/T010/T014/T015 touch different methods in the same controller file (coordinate to avoid clobbering) while T012/T018 touch different render sections of the same frontend file as T004–T007 (same coordination note)
- T020–T023 (Polish) can run in parallel
- T032 and T034 (Phase 8, different backend concerns — migration vs. new controller method) can run in parallel; T037–T041 (frontend) should follow T032–T036 since the frontend calls depend on the new endpoint and relaxed validation existing first

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md` Scenarios 0 and 1
5. The table layout is live and demoable before Repeating is interactive or vote totals exist

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate → demo (grouped table layout)
3. US2 → validate → demo (Repeating flag, permission-checked)
4. US3 → validate → demo (vote totals footer)
5. Polish → final full-suite validation, including Definition-of-Done Gate review tasks

---

## Notes

- [P] tasks touch different files (or, where noted, different non-overlapping sections of the same file) with no dependency on an incomplete task
- Every backend implementation task has a matching test task in the same phase, per Constitution Principle III
- T021–T023 exist specifically to satisfy Constitution Principle VIII's Definition-of-Done Gate — they are review/verification tasks, not implementation, and are not satisfied merely by T024's test run passing
- Frontend verification is manual-in-browser against `quickstart.md`, per the constitution's existing UI-testing practice
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
