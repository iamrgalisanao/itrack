# Tasks: Retro Entry Discussion, Attachments & Decision

**Input**: Design documents from `/specs/015-retro-entry-context/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Backend test tasks are included and REQUIRED, not optional — Constitution Principle III mandates a matching test task for any new backend logic in the same change, and Principle VIII's Definition-of-Done Gate requires the authorization/tenant-isolation/OWASP/code-slop reviews below before this feature is considered complete. Frontend verification is manual-in-browser per the constitution's existing UI-testing practice.

**Organization**: Tasks are grouped by user story (see spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US3)
- File paths are exact, repository-root-relative

---

## Phase 1: Setup

**Purpose**: The three independent, additive schema changes every story's own phase builds on.

- [X] T001 [P] Create migration `backend/database/migrations/<timestamp>_create_retro_entry_comments_table.php` per `data-model.md`: `id, retro_entry_id (FK cascade), author_user_id (FK users), body (text), timestamps`, indexes on `retro_entry_id`/`created_at` — no `visibility` column (research.md D3)
- [X] T002 [P] Create migration `backend/database/migrations/<timestamp>_create_retro_entry_attachments_table.php` per `data-model.md`: `id, retro_entry_id (FK cascade), uploaded_by_user_id (FK users), original_name, stored_name, disk (default 'local'), path, mime_type, size_bytes, timestamps`, indexes on `retro_entry_id`/`mime_type`/`created_at` — no `visibility` column
- [X] T003 [P] Create migration `backend/database/migrations/<timestamp>_add_decision_to_retro_entries_table.php`: `$table->text('decision')->nullable()->after('is_repeating');`
- [X] T004 [P] Create `backend/app/Models/RetroEntryComment.php` per `data-model.md`: `$fillable = ['retro_entry_id', 'author_user_id', 'body']`, `entry()` and `author()` `BelongsTo` relationships
- [X] T005 [P] Create `backend/app/Models/RetroEntryAttachment.php` per `data-model.md`: `$fillable` per the migration's columns minus timestamps, `$hidden = ['path']`, `$appends = ['human_size']` with `getHumanSizeAttribute()` identical to `Attachment`'s accessor, `entry()` and `uploader()` `BelongsTo` relationships
- [X] T006 [P] Add `'decision'` to `RetroEntry::$fillable` in `backend/app/Models/RetroEntry.php`

**Checkpoint**: Tables, columns, and models exist; nothing reads or writes them through the API yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The response shapes every story's endpoints depend on.

**⚠️ CRITICAL**: No user story phase below can be implemented until this phase is complete.

- [X] T007 [P] Create `backend/app/Http/Resources/RetroEntryCommentResource.php` per `data-model.md`: `id, entry_id, author, author_id, body, created_at`
- [X] T008 [P] Create `backend/app/Http/Resources/RetroEntryAttachmentResource.php` per `data-model.md`: `id, entry_id, uploader, uploader_id, original_name, mime_type, size_bytes, human_size, created_at` — `stored_name`/`disk`/`path` never included (unlike `AttachmentResource`, no Client-visibility branch needed, research.md D3)
- [X] T009 [P] Add `'decision' => $this->decision` to `backend/app/Http/Resources/RetroEntryResource.php`

**Checkpoint**: Every response shape exists; no endpoint returns them yet.

---

## Phase 3: User Story 1 - Discuss a topic without losing the original report (Priority: P1) 🎯 MVP

**Goal**: Any write-capable user with project access can post a comment on any entry they can view; every internal role can read the thread; Client is denied.

**Independent Test**: As a Team Member who did not author a given entry, post a comment; confirm it appears immediately, attributed correctly, and the entry's original feedback text is unchanged (per `quickstart.md` Scenarios 0 and 1).

### Implementation for User Story 1

- [X] T010 [US1] Implement `indexComments(Request $request, RetroEntry $retroEntry)` in `backend/app/Http/Controllers/RetrospectiveController.php`: `canView()` + `hasProjectAccess($user, $retroEntry->session->project_id)`, returns `RetroEntryCommentResource::collection($retroEntry->comments()->orderBy('created_at')->get())`
- [X] T011 [US1] Implement `storeComment(Request $request, RetroEntry $retroEntry)`: `canWrite()` + `hasProjectAccess()` (per `contracts/retro-entry-context-api.md` — **not** restricted to the entry's author), validate `'body' => 'required|string|min:1|max:5000'`, create with `author_user_id = $request->user()->id` (never client-supplied)
- [X] T012 [US1] Add `parseAndSendRetroMentions(string $body, RetroEntryComment $comment, RetroEntry $entry): void` to `backend/app/Models/Notification.php` per `research.md` D4 — same regex/role-matching/dedup/self-notify-skip logic as `parseAndSendMentions()`, but its own method (that method is type-coupled to `Comment`/`DetailedActivity` and reads `author_role`/`visibility` fields `RetroEntryComment` doesn't have); link to `/retrospectives?session={$entry->session_id}`, retro-flavored message text — **depends on T018's deep-link handling actually existing for this link to resolve to the right session, not just land on the page**
- [X] T013 [US1] Call `Notification::parseAndSendRetroMentions($validated['body'], $comment, $retroEntry)` from `storeComment()` after creation (fire-and-forget, per contract)
- [X] T014 [US1] Add routes in `backend/routes/api.php`, grouped with existing Retrospectives routes: `GET retro-entries/{retroEntry}/comments`, `POST retro-entries/{retroEntry}/comments`

### Tests for User Story 1

- [X] T015 [US1] [P] Extend `backend/tests/Feature/RetrospectivesTest.php` per `research.md`'s skill-derived cases 1–2, 7–8, 12: write-capable non-author posts a comment → 201 + `assertDatabaseHas`; any internal role (incl. Department Head) lists comments in chronological order; Client and unauthenticated denied on both endpoints; a `canView()` user without `hasProjectAccess()` denied on both endpoints; assertions target real DB/response state

### Frontend for User Story 1

- [X] T016 [US1] Add `fetchRetroEntryComments(entryId)` and `createRetroEntryComment(entryId, body)` to `frontend/src/lib/api.js`, matching the existing `fetchComments`/`createComment` call shape
- [X] T017 [US1] In `frontend/src/pages/Retrospectives.jsx`, add a per-entry expand/detail affordance (reusing the existing `table.jsx`/`tabs.jsx` primitives, per plan.md's Coding-Standard Constraints — no new UI dependency) surfacing a Comments tab: chronological list + inline post form, visible to all internal roles, form shown only to `canWrite()` users with project access (already established via the page's existing `canWrite` check)
- [X] T018 [US1] Add `?session={id}` deep-link handling to `frontend/src/pages/Retrospectives.jsx`, mirroring `Kanban.jsx`'s existing `?task={id}` handling (`Kanban.jsx:134-143` — parses `URLSearchParams` on mount, selects the matching record): on mount, if a `session` query param is present, select that session (and, once loaded, scroll to/expand the mentioned entry if an `entry` param is also present). Without this, T012's notification link (`/retrospectives?session={id}`) lands on the page but silently fails to select the right session — `speckit-analyze` finding I1

### Verification for User Story 1

- [X] T019 [US1] Manually run `quickstart.md` Scenario 0 (013/014 regression check) and Scenario 1, including clicking a mention notification and confirming it lands on the correct session (T018)

**Checkpoint**: Comments work end-to-end — a legitimate, demoable MVP even before attachments or the decision field land.

---

## Phase 4: User Story 2 - Attach evidence to a topic (Priority: P2)

**Goal**: Any write-capable user with project access can upload an allowed-type file under the size limit to any entry; any internal role can view/download; deletion is restricted to the uploader or Admin/PM.

**Independent Test**: Upload a screenshot, confirm another internal user can download it with correct content/filename, confirm a disallowed type is rejected with nothing stored (per `quickstart.md` Scenarios 2 and 3).

### Implementation for User Story 2

- [X] T020 [US2] Implement `indexAttachments(Request $request, RetroEntry $retroEntry)`: `canView()` + `hasProjectAccess()`, returns `RetroEntryAttachmentResource::collection($retroEntry->attachments()->orderBy('created_at')->get())`
- [X] T021 [US2] Implement `storeAttachment(Request $request, RetroEntry $retroEntry)`: `canWrite()` + `hasProjectAccess()`; copy `AttachmentController::ALLOWED_MIME_TYPES` and `sanitizeFilename()` into this controller (research.md D5 — deliberate duplication, not a shared service); validate `'file' => ['required', 'file', 'max:102400', 'mimetypes:' . implode(',', ALLOWED)]`; store to `Storage::disk('local')->put("retro-entry-attachments/{$retroEntry->id}/{$storedName}", ...)`; create the `RetroEntryAttachment` with `uploaded_by_user_id = $request->user()->id`
- [X] T022 [US2] Implement `downloadAttachment(Request $request, RetroEntryAttachment $retroEntryAttachment)`: `canView()` + `hasProjectAccess($user, $retroEntryAttachment->entry->session->project_id)` re-checked on every request (per plan.md's OWASP Coding-Standard Constraint — not inferred from the URL alone); `Storage::disk($disk)->exists($path)` → `abort(404)` else `Storage::disk($disk)->download($path, $original_name)`
- [X] T023 [US2] Implement `destroyAttachment(Request $request, RetroEntryAttachment $retroEntryAttachment)`: `canWrite()` + `hasProjectAccess()`, **and** `$user->id === $retroEntryAttachment->uploaded_by_user_id || $user->isAdmin() || $user->isProjectManager()` (per `contracts/retro-entry-context-api.md` — evaluated against the attachment's uploader, not the entry's author); delete the physical file first (`Storage::disk($disk)->delete($path)`), then the DB row
- [X] T024 [US2] Add routes: `GET retro-entries/{retroEntry}/attachments`, `POST retro-entries/{retroEntry}/attachments`, `GET retro-entry-attachments/{retroEntryAttachment}/download`, `DELETE retro-entry-attachments/{retroEntryAttachment}`

### Tests for User Story 2

- [X] T025 [US2] [P] Extend `RetrospectivesTest.php` per `research.md`'s skill-derived cases 3–8, 10, 12, using `Storage::fake('local')` + `UploadedFile::fake()` (matching `AttachmentTest.php`'s existing pattern): allowed-type upload → 201 + `Storage::disk('local')->assertExists(...)`; disallowed MIME/over-size-limit → 422 + `assertMissing(...)`; download returns `original_name` in `Content-Disposition`, not `stored_name`; delete removes both DB row and physical file (`assertMissing` after); uploader can delete their own; non-uploader non-Admin/PM (even the entry's own author) denied; Admin/PM can delete regardless of uploader; Client/unauthenticated denied on all four endpoints; project-access denial

### Frontend for User Story 2

- [X] T026 [US2] Add `fetchRetroEntryAttachments(entryId)`, `uploadRetroEntryAttachment(entryId, formData, onUploadProgress)`, `deleteRetroEntryAttachment(id)`, `downloadRetroEntryAttachment(id, filename)` to `frontend/src/lib/api.js`, matching the existing Attachment call shape (blob download via authed axios, not `<a href>`)
- [X] T027 [US2] In `Retrospectives.jsx`'s entry detail area, add a Files tab alongside Comments (T017): list with human-readable size, upload control visible only to `canWrite()` users with project access, hover-reveal delete button gated by a local `canDeleteAttachment(attachment)` check mirroring T023's backend rule (uploader or Admin/PM)

### Verification for User Story 2

- [X] T028 [US2] Manually run `quickstart.md` Scenarios 2 and 3

**Checkpoint**: Attachments work end-to-end alongside comments.

---

## Phase 5: User Story 3 - Record what the team decided (Priority: P2)

**Goal**: The entry's author, or an Admin/PM, records a decision separate from the original feedback text; everyone else can read it; no one else can set or change it.

**Independent Test**: As the author, record a decision, confirm it persists separately from the original text after reload; confirm a non-author, non-Admin/PM Team Member cannot set or change it (per `quickstart.md` Scenario 4).

### Implementation for User Story 3

- [X] T029 [US3] In `updateEntry()` (`RetrospectiveController.php`): add `'decision' => 'sometimes|nullable|string'` to the validation rules; add `'decision'` to the existing `$isAuthorOrModerator`-gated condition alongside `body`/`sentiment`/`is_repeating` (same branch — per `contracts/retro-entry-context-api.md`, not the broader `owner_user_id` branch); add `'decision'` to the `array_intersect_key($validated, array_flip([...]))` persisted-attribute list

### Tests for User Story 3

- [X] T030 [US3] [P] Extend `RetrospectivesTest.php` per `research.md`'s skill-derived cases 9, 11–12: author sets a decision → 200 + `assertDatabaseHas`; Admin and, separately, PM set a decision on an entry they didn't author → 200; non-author non-Admin/PM denied → 403, `decision` unchanged in DB; an author who has since lost project access is denied setting the decision (013's F1 pattern, applied to this new field); setting `decision` leaves `body` unchanged

### Frontend for User Story 3

- [X] T031 [US3] In `Retrospectives.jsx`'s entry detail area, add a Decision field/section visually separate from the Feedback text: editable inline for `canModerateEntry(entry)` users (reusing the existing helper), read-only otherwise; shows a distinct "No decision recorded yet" placeholder when `entry.decision` is `null` (spec FR-014 — not an empty-looking blank field)

### Verification for User Story 3

- [X] T032 [US3] Manually run `quickstart.md` Scenario 4

**Checkpoint**: All three user stories are complete and independently verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story scenarios and the Definition-of-Done Gate items from `quickstart.md`.

- [X] T033 [P] Extend `RetrospectivesTest.php` with an automated cascade-delete test (spec FR-015, SC-006; `speckit-analyze` finding C1 — this was manual-only before remediation): create an entry with ≥1 comment and ≥1 attachment (`Storage::fake('local')`), delete the entry, assert `assertDatabaseMissing('retro_entry_comments', ...)`, `assertDatabaseMissing('retro_entry_attachments', ...)`, and `Storage::disk('local')->assertMissing($path)` for the attachment's stored file — not just the manual check in T034
- [X] T034 [P] Manually run `quickstart.md` Scenario 5 (deleting an entry cascades to its comments and attachments, including the physical files — no orphaned rows or disk files), confirming T033's automated coverage in the live UI
- [X] T035 [P] Manually run `quickstart.md` Scenario 6 (Department Head reads comments/attachments/decision but has no post/upload/delete/edit control) and Scenario 7 (Client denial, unchanged)
- [X] T036 [P] Authorization + tenant-isolation review (Constitution Principle VIII): confirm `decision` sits in the `$isAuthorOrModerator` branch not a looser one; confirm attachment deletion checks `uploaded_by_user_id` not the entry's `author_user_id`; manually verify entries in two different projects never leak comments/attachments across them
- [X] T037 [P] OWASP review (`laravel-owasp-security`, Broken Access Control + file-upload focus): attempt Scenario 3's non-uploader deletion and Scenario 2's disallowed-type upload directly via the API; confirm the download endpoint response never includes `path`/`stored_name`
- [X] T038 [P] code-slop review (`code-slop`): confirm `parseAndSendRetroMentions` (T012) and the duplicated MIME whitelist/sanitizer (T021) stayed narrowly-scoped duplications, not copy-pasted further than necessary; confirm all new tests (including T033) assert real database/storage/response state
- [X] T039 Run `php artisan test` (backend) and re-run the full `quickstart.md` validation guide end to end, including Scenario 0's 013/014-regression check

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately, all three migrations/models are independent of each other
- **Foundational (Phase 2)**: Depends on Setup (T004/T005/T006's models existing) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only — the MVP (comments)
- **User Story 2 (Phase 4)**: Depends on Foundational only; fully independent of US1
- **User Story 3 (Phase 5)**: Depends on Foundational only; fully independent of US1/US2 (touches only `updateEntry()`, a different method than US1/US2's new methods)
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Parallel Opportunities

- T001–T006 (Setup) can all run in parallel — three independent migrations, three independent models, no shared files
- T007–T009 (Foundational) can all run in parallel — different files
- Once Foundational is done, US1 (Phase 3), US2 (Phase 4), and US3 (Phase 5) can proceed in parallel with each other — US1/US2 add new methods to `RetrospectiveController.php`, US3 only edits the existing `updateEntry()` method; coordinate if touching the same file simultaneously, but there's no logical dependency between them
- T015, T025, T030 (each story's tests) can run in parallel with each other once their respective implementation tasks land
- T033 and T036–T038 (Polish) can run in parallel; T034/T035 (manual) can run alongside them

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md` Scenarios 0 and 1
5. Comments work end-to-end — demoable before attachments or the decision field exist

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate → demo (comment thread)
3. US2 → validate → demo (file attachments)
4. US3 → validate → demo (recorded decision)
5. Polish → final full-suite validation, including Definition-of-Done Gate review tasks

---

## Notes

- [P] tasks touch different files with no dependency on an incomplete task
- Every backend implementation task has a matching test task in the same phase, per Constitution Principle III
- T036–T038 exist specifically to satisfy Constitution Principle VIII's Definition-of-Done Gate — review/verification tasks, not implementation, not satisfied merely by T039's test run passing
- Frontend verification is manual-in-browser against `quickstart.md`, per the constitution's existing UI-testing practice
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
