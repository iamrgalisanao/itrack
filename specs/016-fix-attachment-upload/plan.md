# Implementation Plan: Fix Work Program Attachment Upload

**Branch**: `013-sprint-retrospectives` (fix continues on current branch; no dedicated branch) | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-fix-attachment-upload/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`uploadAttachment` (`frontend/src/lib/api.js:113`) posts a `FormData` body
through the shared `api` axios instance, which is created with a default
`Content-Type: application/json` header (`frontend/src/lib/api.js:4-9`).
Axios does not strip or replace an explicitly-set default header for
`FormData` bodies, so the request goes out as JSON-typed with no multipart
boundary, and the backend's `file` validation rule on
`POST /detailed-activities/{id}/attachments` rejects it with 422 "file
field is required." This is the exact bug already diagnosed and fixed in
015-retro-entry-context's `uploadRetroEntryAttachment`. The fix here is the
same one-line pattern: pass `headers: { 'Content-Type': undefined }`
per-request so axios lets the browser set the correct
`multipart/form-data; boundary=...` header. No backend change is needed —
`AttachmentController` and its validation are already correct and already
covered by `backend/tests/Feature/AttachmentTest.php`.

## Technical Context

**Language/Version**: PHP 8.3 (backend, unchanged — no backend code touched), JavaScript/JSX with React 19.2 (frontend, `frontend/src/lib/api.js`)

**Primary Dependencies**: axios ^1.18.0 (frontend HTTP client), Laravel 13.8 (backend, unchanged)

**Storage**: N/A — no data model or storage change; existing `Attachment` model/table and local disk storage are untouched

**Testing**: No frontend automated test framework is configured in this repo (`frontend/package.json` has no `vitest`/`jest`/`@testing-library` entry) — verification is manual, browser-driven (matching this project's existing UI-testing practice per the constitution's Development Workflow §4). Backend has no code change, so no new PHPUnit tests are required; existing `backend/tests/Feature/AttachmentTest.php` coverage remains the regression baseline.

**Target Platform**: Web (existing React SPA over Sanctum session API)

**Project Type**: Web application (existing `backend/` + `frontend/` structure)

**Performance Goals**: N/A — no measurable performance change; fix corrects a broken request, does not alter data volume or request frequency

**Constraints**: Must not change the upload endpoint, MIME whitelist, size limit, or any other backend validation (FR-002). Must not change download/delete behavior (FR-003).

**Scale/Scope**: Single function change (`uploadAttachment`) plus its one call site (`frontend/src/components/TaskFiles.jsx`) — no other callers exist.

### Coding-Standard Constraints

- **react-vite-best-practices**: no relevant rule is triggered — this change is a one-line request-config fix, not a new component, hook, or build concern.
- **typescript-react-patterns**: not applicable — frontend is JS/JSX, no `.ts`/`.tsx` files exist; per Constitution Principle VII this skill activates only if/when the frontend adopts TypeScript.
- **laravel-best-practices / php-best-practices**: not applicable — no backend code changes in this fix.
- **laravel-owasp-security / php-best-practices `sec-file-uploads`**: not re-litigated here — the backend-side MIME whitelist, size limit, and streamed-download pattern already satisfy this and are explicitly out of scope for this fix (FR-002). The only thing this fix must confirm is that it does not weaken that boundary: the browser-set multipart boundary is the correct fix, not a workaround that bypasses validation (e.g., not manually forcing a specific `Content-Type` string).
- **code-slop**: the fix must stay a minimal, targeted change (`headers: { 'Content-Type': undefined }` on the one existing `api.post(...)` call) — no speculative refactor of `uploadAttachment`, no new abstraction layer, no touching `TaskFiles.jsx` beyond what's needed to verify the fix.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Status |
|---|---|---|
| I. Fail-Closed Access Control | No new/changed endpoint or role gate | PASS (N/A) |
| II. (project-specific, see constitution) | No change to project/tenant scoping | PASS (N/A) |
| III. Test-Backed Changes | This is a defect fix to a code path with existing backend test coverage (`AttachmentTest.php`); no backend logic changes, so no new backend test is required. Frontend verification is manual per this project's established practice (no frontend test framework configured) — see quickstart.md | PASS |
| VII. Installed Coding-Standard Skills Govern Implementation | Reviewed above; no applicable rule requires a different approach | PASS |
| VIII. Definition-of-Done Gate | Tests: existing `AttachmentTest.php` must still pass (no backend change expected to break it). Authorization: unchanged — not touched by this fix. Tenant isolation: unchanged. OWASP: reviewed above, fix does not weaken file-upload validation. code-slop: reviewed above, fix is minimal and targeted | PASS |

No violations. Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/016-fix-attachment-upload/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No `data-model.md` or `contracts/` — this fix introduces no new entity, no new
endpoint, and no changed API contract (same request shape as documented by
the existing `AttachmentController`; only the transport header changes).

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── lib/
│   │   └── api.js              # uploadAttachment fix (the only functional change)
│   └── components/
│       └── TaskFiles.jsx       # existing caller, used for manual verification — no code change expected
```

**Structure Decision**: Existing web application structure (`backend/` +
`frontend/`) is unchanged. This fix touches exactly one function in
`frontend/src/lib/api.js`; no new files, directories, or structural changes.

## Complexity Tracking

*No violations — section not applicable.*
