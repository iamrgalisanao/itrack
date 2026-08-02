---

description: "Task list for 016-fix-attachment-upload"
---

# Tasks: Fix Work Program Attachment Upload

**Input**: Design documents from `/specs/016-fix-attachment-upload/`

**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: No new automated tests — this fix changes request transport, not
business logic, and existing `backend/tests/Feature/AttachmentTest.php`
coverage already exercises the endpoint (see research.md D2). The existing
suite is re-run as a regression check (T003), and quickstart.md's scenarios
are the manual verification for the actual fix.

**Organization**: Single user story (P1) — this is a one-function defect fix
with no independent sub-stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (the only story)

## Path Conventions

Existing web app structure (`backend/`, `frontend/`) — no new
directories/files.

---

## Phase 1: User Story 1 - Fix broken attachment upload (Priority: P1) 🎯 MVP

**Goal**: Restore working file uploads on Work Program detailed activities
by fixing the `Content-Type`/`FormData` header bug in `uploadAttachment`.

**Independent Test**: As an internal user with task write access, upload a
valid file to a detailed activity's Files tab and confirm it appears in the
attachment list with no error (see quickstart.md Scenario 1).

### Implementation for User Story 1

- [X] T001 [US1] Fix `uploadAttachment` in `frontend/src/lib/api.js` to pass
      `headers: { 'Content-Type': undefined }` on the `api.post(...)` call,
      matching the proven fix already applied to `uploadRetroEntryAttachment`
      in the same file (research.md D1). No other change to the function
      signature or call site.

### Verification for User Story 1

- [X] T002 [US1] Manually run quickstart.md Scenarios 1–4 against a locally
      running instance (`frontend/src/components/TaskFiles.jsx` is the UI
      under test): upload succeeds, MIME/size validation unchanged,
      download/delete unchanged, authorization unchanged.
- [X] T003 [US1] Run `php artisan test --filter=AttachmentTest` from
      `backend/` and confirm all existing cases still pass (regression
      check — no backend code changed, so this must be unaffected).

**Checkpoint**: User Story 1 (the entire feature) is complete and verified.

---

## Phase 2: Polish & Definition-of-Done Gate

**Purpose**: Constitution Principle VIII gate — required even for a
single-task fix.

- [X] T004 Authorization review: confirm no authorization/role-gate code was
      touched (diff should contain only the header change in `api.js`) —
      Principle I is unaffected by construction, not by omission.
- [X] T005 Tenant/project-isolation review: confirm no query or endpoint
      scoping was touched — same rationale as T004, verified by diff scope.
- [X] T006 OWASP review (`laravel-owasp-security`): confirm the fix does not
      weaken file-upload validation — the browser-generated multipart
      boundary is the correct mechanism, not a bypass of the existing MIME
      whitelist/size-limit checks in `AttachmentController` (research.md D1
      "Alternatives considered").
- [X] T007 code-slop review: confirm the final diff is limited to the
      one-line header override in `frontend/src/lib/api.js` with no
      speculative refactor of `uploadAttachment` or unrelated changes to
      `TaskFiles.jsx`.

**Checkpoint**: All Definition-of-Done Gate items pass — feature is done.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No prerequisites — this is the entire feature.
- **Phase 2 (Polish/DoD Gate)**: Depends on Phase 1 (T001–T003) being
  complete.

### Within Phase 1

- T001 (the fix) before T002/T003 (verification) — must fix before
  verifying.
- T002 and T003 can run in parallel with each other (different
  surfaces: manual browser check vs. automated backend suite).

### Parallel Opportunities

- T002 and T003 [P] — one is browser-driven, the other is `php artisan
  test`; no shared file or state dependency.
- T004–T007 are independent review passes over the same small diff and can
  be done in any order, though in practice they're fast enough to do
  sequentially against the single-commit diff.

---

## Implementation Strategy

### MVP First (and only)

1. T001: apply the fix.
2. T002 + T003: verify (parallel).
3. T004–T007: Definition-of-Done Gate review.
4. Done — this is the entire feature, no incremental phases beyond this.

---

## Notes

- No Setup or Foundational phases — nothing to initialize; this fix reuses
  100% of the existing project structure, dependencies, and test tooling.
- No `[P]` on T001 itself — it's the single blocking task everything else
  depends on.
- Commit after T001–T003 confirm the fix works, then again (or the same
  commit) once T004–T007 confirm the DoD gate — consistent with how 013/
  014/015 tracked the gate as explicit tasks rather than an implicit step.
