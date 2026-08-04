# Phase 0 Research: Retro Entry Discussion, Attachments & Decision

No `[NEEDS CLARIFICATION]` markers remained in spec.md — the feature
description resolved scope by explicitly deferring to `DetailedActivity`'s
existing Comment/Attachment conventions, which were read directly from the
codebase (not assumed) before this document was written.

## Decisions

### D1: Reuse `RetrospectiveController`'s auth pattern, not `DetailedActivity`'s

- **Decision**: New comment/attachment endpoints live on
  `RetrospectiveController` and use its existing `canView()`/`canWrite()`/
  `hasProjectAccess()`/`deny()` methods — not `CommentController`/
  `AttachmentController`'s `AccessContext::user($request)` +
  `$model->isAccessibleTo($user)` (via the `BelongsToProject` trait).
- **Rationale**: These are two genuinely different, coexisting auth
  mechanisms in this codebase — `BelongsToProject`/`AccessContext` is the
  older `DetailedActivity`-family pattern; `RetrospectiveController`'s own
  inline gate is what 013/014 already established for every Retro*
  endpoint. Introducing a third variant, or switching Retro* endpoints to
  the older pattern mid-feature, would fragment the auth story across one
  feature family for no benefit — `laravel-owasp-security`'s Broken Access
  Control checklist flags exactly this kind of dual-code-path risk.
- **Alternatives considered**: Adding `BelongsToProject` to `RetroEntry`
  and switching everything to `AccessContext` — rejected as an unrelated,
  much larger refactor of 013/014's already-shipped, already-tested auth
  code, with no requirement in spec.md asking for it.

### D2: `author_user_id`/`uploaded_by_user_id` from day one, no legacy string fields

- **Decision**: `RetroEntryComment` and `RetroEntryAttachment` use real
  `belongsTo(User::class)` foreign keys (`author_user_id`,
  `uploaded_by_user_id`) — never `DetailedActivity` Comment/Attachment's
  `author`/`author_role`/`uploader`/`uploader_role` display-string columns.
- **Rationale**: Those string columns are explicitly documented in the
  existing migrations as "mock mode uses role as display name" /
  "future real auth" — pre-006-real-user-management scaffolding.
  `RetroEntry` itself already made this jump (`author_user_id`,
  `owner_user_id`); this feature should not reintroduce the pattern
  `RetroEntry` already left behind (Constitution Principle VI).
- **Alternatives considered**: Matching `DetailedActivity`'s exact schema
  for copy-paste consistency — rejected; consistency with an intentionally
  superseded pattern isn't a value, consistency with `RetroEntry`'s own
  sibling fields is.

### D3: No `visibility` column on either new table

- **Decision**: `RetroEntryComment`/`RetroEntryAttachment` have no
  `visibility` field, unlike `Comment`/`Attachment`.
- **Rationale**: `visibility` exists on `DetailedActivity`'s Comment/
  Attachment specifically because `DetailedActivity` is reachable by
  Client-role users under certain conditions (`client_visible` flag,
  `ProjectClientAccess::canContribute`). Retrospectives has no such path —
  013's `RetrospectiveController::canView()` excludes Client entirely, at
  every single endpoint, with no exception. A `visibility` column with
  only one possible value forever is dead weight (spec FR-016).
- **Alternatives considered**: Adding it anyway for schema parity — rejected
  as speculative generality with no near-term need (Constitution
  Principle V's migration philosophy applies to columns, not just tables).

### D4: Mention parsing is a small parallel method, not a shared one

- **Decision**: Add `Notification::parseAndSendRetroMentions(string $body,
  RetroEntryComment $comment, RetroEntry $entry): void` — a new method with
  the same regex (`/@([a-zA-Z\s]+)/`) and the same role-matching/dedup/
  self-notify-skip logic as `parseAndSendMentions()`, but its own method,
  not a shared one.
- **Rationale**: `parseAndSendMentions(string $commentBody, Comment
  $comment, DetailedActivity $task)` is type-hinted directly to `Comment`
  and `DetailedActivity`, and internally reads `$comment->author_role`
  (line 163, `backend/app/Models/Notification.php`) and
  `$comment->visibility` (line 194) — two fields `RetroEntryComment`
  does not have under D2/D3. It also hardcodes the notification link
  (`"/kanban?task={$task->id}"`) and message text around a "task". Calling
  it as-is is impossible without either changing its signature (a
  cross-cutting edit to already-shipped 010/013 code, out of scope) or
  giving `RetroEntryComment` fields it deliberately doesn't need. A ~40-line
  parallel method with a `/retrospectives?session={id}` link and
  retro-flavored message text is smaller and safer than either.
- **Alternatives considered**: Refactoring `parseAndSendMentions()` to
  accept an interface (e.g. a `Mentionable` contract with `authorRole()`/
  `visibilityAllows(role)`/`linkFor()` methods) so both call sites share
  one implementation — rejected for this feature; it's the "right" answer
  in the abstract but touches working, tested code outside this feature's
  boundary for a two-call-site abstraction (`over-eng-premature-interface`
  territory per `code-slop`). Worth revisiting only if a third
  mentionable entity appears.

### D5: Attachment storage path convention and MIME whitelist copied, not shared

- **Decision**: `retro-entry-attachments/{retroEntryId}/{uuid}_{safeName}`
  storage path (parallel to `attachments/{detailedActivityId}/...`); the
  same `ALLOWED_MIME_TYPES` list and `sanitizeFilename()` logic are
  duplicated into the new controller method(s), not extracted into a
  shared trait/service in this feature.
- **Rationale**: Matches D4's reasoning — extracting a shared
  `FileUploadValidator` service is the "correct" long-term move but is a
  refactor of existing, working `AttachmentController` code that spec.md
  never asked for. Duplication of a ~10-line constant and a ~10-line
  sanitizer is well within `code-slop`'s "would this pass code review?"
  bar for two call sites; a third attachment system appearing would be the
  trigger to extract it.
- **Alternatives considered**: Extracting a shared trait now — rejected,
  same reasoning as D4.

## Skill-Derived Test Requirements

Concrete test cases `/speckit-tasks` must turn into test tasks, per
Constitution Principle III and Principle VIII's Definition-of-Done Gate.

From `laravel-testing` (HTTP & Feature Tests, `fake-storage`):

1. A write-capable user with project access posts a comment on an entry →
   201, `assertDatabaseHas('retro_entry_comments', ...)`.
2. Any internal role that can view the session (including Department
   Head) can list an entry's comments → 200, correct chronological order.
3. A write-capable user with project access uploads an allowed-type file
   within the size limit → 201, `Storage::fake('local')` +
   `Storage::disk('local')->assertExists(...)`.
4. An upload of a disallowed MIME type, or over the size limit, is
   rejected → 422, `Storage::disk('local')->assertMissing(...)` (nothing
   stored).
5. Downloading an attachment returns the original filename/content, not
   the stored path — assert the response's `Content-Disposition` header
   matches `original_name`, not `stored_name`.
6. Deleting an attachment removes both the DB row and the physical file —
   `Storage::disk('local')->assertMissing($path)` after the request.

From `laravel-owasp-security` (Broken Access Control, A01 — this feature's
primary OWASP category, alongside file-upload handling):

7. Client-role and unauthenticated requests are denied on every new
   endpoint (comment list/create, attachment list/create/download/
   delete) — 403/401, mirroring 013's existing Client-denial test shape.
8. A user without `hasProjectAccess()` on the entry's project is denied on
   every new endpoint, even with a valid internal role — matches 013's
   project-scoping precedent (Team Member without assignment → 403).
9. An entry's author who has since lost project access cannot delete an
   attachment they uploaded, or set the decision field, on that entry —
   mirrors 013's F1 regression (`hasProjectAccess()` re-checked
   independent of authorship/uploader identity).
10. A non-uploader, non-Admin/PM user cannot delete another user's
    attachment (matches spec Acceptance Scenario 5, User Story 2).
11. A non-author, non-Admin/PM user cannot set/change the decision field
    (matches spec Acceptance Scenario 3, User Story 3) — same
    `$isAuthorOrModerator` branch `updateEntry()` already uses for
    `body`/`sentiment`/`is_repeating`.

From `code-slop` (Test slop):

12. New tests assert real database/storage/response state
    (`assertDatabaseHas`, `Storage::assertExists`/`assertMissing`,
    `assertJsonPath`), not "does not throw."

From D4 — mention-sending has no dedicated automated test requirement
beyond confirming the regex/role-matching logic (already covered by
`Notification`'s existing behavior, now duplicated not modified) — manual
verification in quickstart.md confirms the notification fires with
retro-flavored text/link, since asserting on notification side effects
is not otherwise exercised in `RetrospectivesTest.php` today.
