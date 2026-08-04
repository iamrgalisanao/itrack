# Implementation Plan: Retro Entry Discussion, Attachments & Decision

**Branch**: `015-retro-entry-context` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-retro-entry-context/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add two new sub-resources to `RetroEntry` — a flat, append-only comment list
and a file-attachment list — plus a new `decision` text field on `RetroEntry`
itself. Mirrors the existing `Comment`/`Attachment` system already built for
`DetailedActivity` in Work Program (same storage mechanism, MIME whitelist,
size limit, streamed-download-never-raw-path pattern), but simplified in two
ways specific to Retrospectives: no `visibility`/`client_visible` distinction
(Retrospectives are already internal-only end to end), and real
`author_user_id`/`uploaded_by_user_id` foreign keys from the start (matching
`RetroEntry`'s own modern convention) rather than `DetailedActivity`
Comment/Attachment's legacy `author`/`author_role` display-string fields.
Permission checks reuse `RetrospectiveController`'s own established
`canView()`/`canWrite()`/`hasProjectAccess()`/`deny()` shape — not
`DetailedActivity`'s `AccessContext`/`isAccessibleTo()` pattern, which is a
different auth mechanism from a different, older part of the codebase.

## Technical Context

**Language/Version**: PHP 8.3 (backend, `backend/composer.json` `"php": "^8.3"` — no PHP 8.4-only syntax); JavaScript (frontend — confirmed still no TypeScript: no `typescript` package, no `.ts`/`.tsx` files, unchanged since 014's plan.md)

**Primary Dependencies**: Laravel 13.8 (`laravel/framework: ^13.8`), Laravel Sanctum 4.0, React 19.2 / Vite 8 / Tailwind v4, existing shadcn/Radix primitives (`table.jsx`, `dialog.jsx`, `tabs.jsx` — `tabs.jsx` is already installed and used elsewhere, a natural fit for a Comments/Files sub-view on an entry, avoiding a new dependency)

**Storage**: MySQL — two new tables (`retro_entry_comments`, `retro_entry_attachments`), one additive column (`retro_entries.decision`). Files stored via `Storage::disk('local')`, identical mechanism to `DetailedActivity`'s `AttachmentController` (`attachments/{id}/{uuid}_{safeName}` path convention, adapted to `retro-entry-attachments/{id}/...`)

**Testing**: PHPUnit 12, matching `RetrospectivesTest.php`'s existing Arrange/Act/Assert + `assertDatabaseHas`/`assertJsonPath` conventions

**Target Platform**: Existing iTrack web app (internal roles only — this feature inherits Retrospectives' existing internal-only boundary, never reachable by Client)

**Project Type**: Web application (Laravel API + React SPA), no new project

**Performance Goals**: No dedicated target beyond existing pages; comment/attachment lists are scoped per-entry and expected to be small (tens, not thousands, of rows) — no pagination required for Phase 1

**Constraints**: Additive-only migrations (Constitution Principle V); no visibility/client-visible field anywhere in this feature (spec FR-016); file upload constraints (MIME whitelist, size limit) must match `AttachmentController`'s existing values, not invent new ones

**Scale/Scope**: Same scale as 013/014 — one project's retro sessions/entries at a time

### Coding-Standard Constraints

Derived from the installed skills (`php-best-practices`, `laravel-best-practices`, `react-vite-best-practices`, `typescript-react-patterns`, `laravel-testing`, `laravel-owasp-security`, `code-slop`), applied to this feature's actual surface:

- **`laravel-best-practices` / `sec-mass-assignment`**: `RetroEntryComment`/`RetroEntryAttachment` MUST declare explicit `$fillable` arrays (never `$guarded = []`), matching every existing Retro* model.
- **`laravel-owasp-security` / Broken Access Control (A01)**: every new endpoint MUST use `RetrospectiveController`'s own `canView()`/`canWrite()`/`hasProjectAccess()` gate — not `DetailedActivity`'s `AccessContext`/`isAccessibleTo()` pattern. Mixing the two auth mechanisms on one feature would be a real broken-access-control risk (two different code paths to keep in sync, easy to update one and miss the other).
- **`laravel-owasp-security` / Injection & File Upload (A03/Additional Checks)**: the new attachment upload MUST reuse `AttachmentController`'s exact `sanitizeFilename()` logic (strip path separators/null bytes, strip leading dots, whitelist-character replacement) and MIME whitelist — copy the constant, don't invent a new one, so both attachment systems stay in lockstep if the whitelist changes later. Files MUST continue to be stored outside any public disk root and served only via a streamed `Storage::download()` call, never a direct path/URL.
- **`laravel-owasp-security` / Broken Access Control (A01)**: attachment `download()` MUST re-verify `canView()` + `hasProjectAccess()` on every request — a signed/predictable URL alone is not sufficient, matching how `AttachmentController::download()` already re-checks `isAccessibleTo()` rather than trusting the route parameter.
- **`code-slop` / `over-eng-dependency-creep`**: comment/attachment lists MUST use existing `table.jsx`/`tabs.jsx` primitives, not a new UI library, for the same reason `collapsible.jsx` was reused (not replaced) in 014.
- **`code-slop` / `naming-generic-placeholders`**: mention-parsing logic MUST be a small, purpose-named method (e.g. `parseAndSendRetroMentions`) — not a generic `handleStuff()`-style helper — acknowledging it is a deliberate near-duplicate of `Notification::parseAndSendMentions()`, not a reusable abstraction, because that method is type-coupled to `Comment`/`DetailedActivity` and an `author_role` string field `RetroEntryComment` does not have (see research.md).
- **`php-best-practices` / `type-return-types`, `type-parameter-types`**: new controller methods and any new private helpers declare parameter and return types, matching `RetrospectiveController`'s existing typed-method style.
- **`laravel-testing` / `http-test-structure`, `fake-storage`**: new attachment tests use `Storage::fake('local')` + `UploadedFile::fake()`, matching Laravel's standard file-upload testing pattern.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Fail-Closed Access Control | PASS — new endpoints reuse `RetrospectiveController`'s existing inclusion-based `canView()`/`canWrite()`/`hasProjectAccess()` gates; no new ad-hoc role checks. |
| II. Consistent API Contracts | PASS — new `RetroEntryCommentResource`/`RetroEntryAttachmentResource` API Resources, no raw model exposure; `path`/`stored_name`/`disk` hidden from attachment responses matching `Attachment::$hidden`. |
| III. Test Coverage Grows With the Feature | PASS — plan requires PHPUnit tests for every new endpoint's happy path + denial path (see Phase 1 test requirements). |
| IV. Audit Sensitive Mutations | PASS — `AuditLogger::denied()` on every 403 path (matching existing `RetrospectiveController` convention), consistent with how `CommentController`/`AttachmentController` already audit-log their client-denial paths. |
| V. Small, Additive, Reversible Migrations | PASS — two new tables (one concern each), one additive nullable column (`decision`) on an existing table — no destructive changes. |
| VI. Real Auth Is the Only Forward Path | PASS — new models use real `author_user_id`/`uploaded_by_user_id` FKs from day one (never the legacy mock `author`/`author_role` string pattern). |
| VII. Installed Coding-Standard Skills Govern Implementation | PASS — see Coding-Standard Constraints above. |
| VIII. Definition-of-Done Gate | PASS (planned) — test requirements, authorization/tenant-isolation review, OWASP review (file-upload + broken-access-control focus, this feature's actual relevant categories), and code-slop review are all carried into Phase 1/quickstart. |

No violations. Complexity Tracking is not needed.

**Post-Phase-1 re-check**: Confirmed after generating data-model.md,
contracts/, and quickstart.md — no new entity, endpoint, or role was
introduced beyond what this table already accounts for. All eight rows
still PASS; no Complexity Tracking entry required.

## Project Structure

### Documentation (this feature)

```text
specs/015-retro-entry-context/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── database/migrations/
│   ├── <timestamp>_create_retro_entry_comments_table.php       # new
│   ├── <timestamp>_create_retro_entry_attachments_table.php    # new
│   └── <timestamp>_add_decision_to_retro_entries_table.php     # new, additive nullable column
├── app/
│   ├── Models/
│   │   ├── RetroEntryComment.php       # new — belongsTo RetroEntry, belongsTo User (author)
│   │   ├── RetroEntryAttachment.php    # new — belongsTo RetroEntry, belongsTo User (uploader)
│   │   └── Notification.php            # gains parseAndSendRetroMentions() — small parallel
│   │                                    # method, not a shared one (see research.md)
│   └── Http/
│       ├── Resources/
│       │   ├── RetroEntryCommentResource.php       # new
│       │   └── RetroEntryAttachmentResource.php    # new — hides path/stored_name/disk
│       └── Controllers/
│           └── RetrospectiveController.php   # gains indexComments/storeComment,
│                                              # indexAttachments/storeAttachment/downloadAttachment/
│                                              # destroyAttachment, and decision handling in updateEntry()
└── tests/Feature/
    └── RetrospectivesTest.php   # extended with new cases (no new file, matching 014's convention)

frontend/src/
├── pages/
│   └── Retrospectives.jsx    # entry rows gain an expand/detail affordance surfacing
│                              # Comments + Files (Tabs) + the decision field
└── lib/
    └── api.js                 # gains fetchRetroEntryComments/createRetroEntryComment,
                                 # fetchRetroEntryAttachments/uploadRetroEntryAttachment/
                                 # deleteRetroEntryAttachment/downloadRetroEntryAttachment
```

**Structure Decision**: Single existing web application structure (`backend/`
Laravel API + `frontend/` React SPA), unchanged from 013/014. No new
top-level directories, no new frontend dependency, no new backend package.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

No violations — table intentionally omitted.
