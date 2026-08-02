# Contract: Retro Entry Discussion, Attachments & Decision

New endpoints, all on `RetrospectiveController` (`backend/routes/api.php`,
grouped with the existing Retrospectives routes). Base auth pattern for
every endpoint below: `canView()`/`canWrite()` (as noted per-endpoint) +
`hasProjectAccess($user, $retroEntry->session->project_id)` — identical
shape to every existing Retro* endpoint (research.md D1). Every denial
calls `AuditLogger::denied(...)` and returns the existing Retrospectives
403 message, matching 013's precedent exactly.

## `GET /api/retro-entries/{retroEntry}/comments`

- **Auth**: `canView()` + project-scoped.
- **Success (200)**: `RetroEntryCommentResource::collection`, ordered
  `created_at` ascending (oldest first, matching `Comment`'s convention).
- **Empty**: `200` with an empty array.

## `POST /api/retro-entries/{retroEntry}/comments`

- **Auth**: `canWrite()` + project-scoped — **not** restricted to the
  entry's author (spec FR-003).
- **Body**: `{ "body": string (required, min:1, max:5000) }`.
- **Success (201)**: `RetroEntryCommentResource`. `author_user_id` is
  always `$request->user()->id` — never client-supplied.
- **Side effect**: calls `Notification::parseAndSendRetroMentions($body,
  $comment, $retroEntry)` (research.md D4) — fire-and-forget, does not
  affect the response.
- No `DELETE`/`PATCH` endpoint exists for comments (spec FR-004).

## `GET /api/retro-entries/{retroEntry}/attachments`

- **Auth**: `canView()` + project-scoped.
- **Success (200)**: `RetroEntryAttachmentResource::collection`, ordered
  `created_at` ascending.

## `POST /api/retro-entries/{retroEntry}/attachments`

- **Auth**: `canWrite()` + project-scoped — not restricted to the entry's
  author.
- **Body**: multipart `file` (required, `max:102400` KB = 100MB,
  `mimetypes:` the same whitelist as `AttachmentController::ALLOWED_MIME_TYPES`
  — pdf, docx, xlsx, png, jpeg, zip; research.md D5).
- **Success (201)**: `RetroEntryAttachmentResource`.
- **Failure (422)**: disallowed MIME type or over size limit — nothing
  stored (`Storage::put` only runs after validation passes).
- Filename sanitized via the same logic as `AttachmentController::sanitizeFilename()`
  (research.md D5) before constructing the stored path
  `retro-entry-attachments/{retroEntry->id}/{uuid}_{safeName}`.

## `GET /api/retro-entry-attachments/{retroEntryAttachment}/download`

- **Auth**: `canView()` + project-scoped, re-checked on every request (not
  inferred from a signed URL) — matches `AttachmentController::download()`'s
  existing re-check pattern (plan.md's OWASP Coding-Standard Constraint).
- **Success (200)**: streamed file download via `Storage::disk($disk)->download($path, $original_name)`
  — the client receives `original_name`, never `stored_name` or `path`.
- **Failure (404)**: file missing from disk despite a DB row existing
  (matches `AttachmentController`'s existing `abort(404, ...)` behavior).

## `DELETE /api/retro-entry-attachments/{retroEntryAttachment}`

- **Auth**: `canWrite()` + project-scoped, **and** the entry's existing
  author-or-Admin/PM moderation rule — but evaluated against the
  **attachment's uploader**, not the entry's author: `$user->id ===
  $attachment->uploaded_by_user_id || $user->isAdmin() ||
  $user->isProjectManager()` (spec Acceptance Scenario 5, User Story 2).
  A non-uploader, non-Admin/PM `canWrite()` user is denied, even if they
  are the *entry's* author — uploading and authoring the entry are
  independent identities.
- **Success (204)**. Deletes the physical file first
  (`Storage::disk($disk)->delete($path)`), then the DB row — matches
  `AttachmentController::destroy()`'s ordering.

## `PATCH /api/retro-entries/{id}` — gains `decision`

- **Auth**: unchanged base rule (014's contract), with `decision` added to
  the existing `$isAuthorOrModerator`-gated field set — the same branch as
  `body`, `sentiment`, `is_repeating`. A `canWrite()` user who is neither
  the entry's author nor Admin/PM and sends `decision` gets `403`,
  identical to sending `body`/`sentiment`/`is_repeating` under the same
  condition.
- **Body** (extends 014's list): `{ ..., "decision"?: string|null }`.
- **Success (200)**: updated `RetroEntryResource`, now including
  `decision`.
- **No audit-log call** — `decision` follows `body`/`sentiment`/
  `is_repeating`'s existing no-audit precedent (content characterization,
  not an access/ownership change).

## Client-role and unauthenticated denial

Every endpoint above denies Client and unauthenticated requests identically
to every existing Retrospectives endpoint — there is no partial or
read-only path for either. No `visibility` field exists anywhere in this
contract for Client to be scoped by (research.md D3) — access is binary,
matching 013's fail-closed precedent.

## Frontend call sites

`frontend/src/lib/api.js` gains: `fetchRetroEntryComments(entryId)`,
`createRetroEntryComment(entryId, body)`, `fetchRetroEntryAttachments(entryId)`,
`uploadRetroEntryAttachment(entryId, formData, onUploadProgress)`,
`deleteRetroEntryAttachment(id)`, `downloadRetroEntryAttachment(id, filename)`
— following the exact same call shape as the existing
`fetchAttachments`/`uploadAttachment`/`deleteAttachment`/`downloadAttachment`
functions already in `api.js` for `DetailedActivity`.
