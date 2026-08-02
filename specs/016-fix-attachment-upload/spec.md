# Feature Specification: Fix Work Program Attachment Upload

**Feature Branch**: `013-sprint-retrospectives` (fixed in-branch; no dedicated branch created)

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Fix a file-upload bug in Work Program's attachment upload: `uploadAttachment` in frontend/src/lib/api.js posts a FormData body through the shared `api` axios instance without overriding its default `Content-Type: application/json` header. Axios does not automatically replace an explicitly-configured default Content-Type when the request body is FormData, so the browser can't set the correct `multipart/form-data; boundary=...` header, and the backend's file validation on POST /detailed-activities/{id}/attachments rejects the upload with a 422 'file field is required' error. This is the identical root cause already found and fixed in the 015-retro-entry-context feature's uploadRetroEntryAttachment, where the fix was passing `headers: { 'Content-Type': undefined }` per-request. This bug affects the existing, already-shipped Work Program task file-attachment feature (TaskFiles.jsx) — it is not a new feature, purely a defect fix. No other behavior should change: same endpoint, same validation rules, same UI. Explicitly out of scope: any other attachment/upload code path, any change to the backend AttachmentController or its MIME/size validation, any change to the download/delete flows."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Attach a file to a task's detailed activity (Priority: P1)

An internal team member (Admin, Project Manager, Team Member, or Department
Head) working a task in Work Program opens a detailed activity's Files tab
and selects a file to attach. Today the upload silently fails with a
validation error even though the user picked a valid, allowed file — the
request never actually carries the file to the server in a form the backend
can read.

**Why this priority**: This is the only user story — it is a single defect
fix restoring functionality that shipped previously and currently does not
work at all for any user.

**Independent Test**: As any internal role with write access to a task, open
a detailed activity's file attachment control, select an allowed file type
under the size limit, and confirm the file appears in the attachment list
immediately after upload (no error, no page reload required).

**Acceptance Scenarios**:

1. **Given** a user with write access to a task is viewing a detailed
   activity's attachments, **When** they select a valid file (allowed MIME
   type, under the size limit) and confirm the upload, **Then** the file is
   stored and appears in the attachment list without an error.
2. **Given** the same user, **When** they select a file that violates the
   existing MIME whitelist or size limit, **Then** they see the same
   rejection message the backend already produces today (unchanged
   validation behavior — only the transport bug is fixed).
3. **Given** the upload succeeded, **When** another user with view access
   opens the same detailed activity, **Then** they see the newly attached
   file and can download it, exactly as before this fix (download/delete
   behavior unchanged).

### Edge Cases

- What happens when the user has no write access to the task? Upload must
  still be rejected by the existing backend authorization check — this fix
  does not touch authorization.
- What happens on a slow connection while an upload is in progress? Existing
  upload-progress UI behavior in TaskFiles.jsx is unchanged; only the
  request headers are corrected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST send file-attachment upload requests from
  Work Program's task Files UI with a request body the backend can parse as
  a valid multipart file upload (correct `multipart/form-data` boundary),
  for every caller of the shared upload function.
- **FR-002**: The system MUST NOT change the upload endpoint, the accepted
  MIME types, the file size limit, or any other backend validation rule as
  part of this fix.
- **FR-003**: The system MUST NOT change the download or delete behavior for
  attachments.
- **FR-004**: A successful upload MUST result in the file appearing in the
  attachment list without requiring a manual page reload, matching existing
  UI behavior once the upload actually succeeds.
- **FR-005**: A rejected upload (disallowed type, oversized file, no write
  access) MUST continue to surface the same validation/authorization
  response the backend already returns today.

### Key Entities

- **Attachment**: An existing entity (file metadata + stored file) attached
  to a detailed activity within a task. No schema or model change is
  implied by this fix.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user attaching a valid file to a detailed activity in Work
  Program succeeds on the first attempt, with the file visible in the
  attachment list within a few seconds, 100% of the time (previously it
  failed 100% of the time).
- **SC-002**: No regression in existing attachment behavior: MIME/size
  rejection messages, download, and delete all continue to work exactly as
  before the fix, verified by manual pass through each.

## Assumptions

- The root cause and fix are already known and verified by an identical,
  already-fixed bug in the 015-retro-entry-context feature — this is a
  targeted defect fix, not new design work, so no `[NEEDS CLARIFICATION]`
  markers apply.
- No dedicated feature branch is created for this fix; work continues on
  the current branch, consistent with how the 014 and 015 corrections were
  handled within the 013-sprint-retrospectives branch.
- The fix is confined to the frontend request construction
  (`uploadAttachment` in `frontend/src/lib/api.js`); no backend change is
  required, since the backend's expectations were already correct (the
  existing 015 fix proved the same backend-side contract works once the
  request is sent correctly).
