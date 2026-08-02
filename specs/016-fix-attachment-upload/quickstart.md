# Quickstart: Fix Work Program Attachment Upload

## Prerequisites

- Backend running (`php artisan serve`) and frontend dev server running
  (`npm run dev`), pointed at the same database.
- A seeded internal user with write access to at least one task with a
  detailed activity (e.g., `pm@itrack.test` / `password`).
- A test file under the existing size limit and an allowed MIME type (e.g.,
  a small `.png` or `.pdf`), plus one file over the size limit or of a
  disallowed type, to confirm rejection still works.

## Setup

No setup beyond the running app — this fix touches one existing function,
no migration, no new route, no new dependency.

## Validation Scenarios

### 1. Upload succeeds (the actual bug fix)

1. Sign in as an internal user with write access to a task.
2. Open a task's detailed activity, go to its Files tab.
3. Select a valid file and confirm the upload.
4. **Expected**: the file appears in the attachment list within a few
   seconds, no error toast/message. (Before the fix: this step fails with a
   422 "file field is required" error every time.)

### 2. Existing validation still rejects invalid files

1. Repeat step 3 above with a disallowed MIME type.
2. **Expected**: the existing rejection message is shown, unchanged from
   before this fix.
3. Repeat with a file over the size limit.
4. **Expected**: the existing size-limit rejection message is shown,
   unchanged from before this fix.

### 3. Download and delete are unaffected

1. Using the file uploaded in Scenario 1, click download.
2. **Expected**: the file downloads with the correct filename and content
   (unchanged behavior).
3. Delete the attachment (as the uploader or as Admin/PM).
4. **Expected**: it's removed from the list and from storage (unchanged
   behavior).

### 4. No access regression (authorization untouched)

1. Attempt the same upload as a user without write access to the task (or
   as a Client, if Work Program attachments are internal-only for this
   task).
2. **Expected**: the existing authorization denial still applies —
   identical to pre-fix behavior, since this fix does not touch
   authorization.

## Automated Regression Check

Run the existing backend suite to confirm no backend-side regression (this
fix makes no backend changes, so this is a sanity check, not new coverage):

```bash
php artisan test --filter=AttachmentTest
```

**Expected**: all existing `AttachmentTest.php` cases still pass.

## Definition-of-Done Checklist (Constitution Principle VIII)

- [ ] Scenario 1 confirms the upload now succeeds (previously failed 100%
      of the time)
- [ ] Scenario 2 confirms MIME/size validation is unchanged
- [ ] Scenario 3 confirms download/delete are unchanged
- [ ] Scenario 4 confirms authorization is unchanged
- [ ] `php artisan test --filter=AttachmentTest` passes
- [ ] Diff reviewed against `code-slop`: fix is the minimal header-override
      change, no unrelated refactor
