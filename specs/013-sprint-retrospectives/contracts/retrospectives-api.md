# Contract: Sprint Retrospectives

Source of truth once implemented: `backend/app/Http/Controllers/RetrospectiveController.php` (new), `backend/app/Http/Resources/RetroSessionResource.php` / `RetroEntryResource.php` (new). Role-gating mirrors `SupportOpsController`'s `canView()`/`canWrite()` shape exactly — not a new pattern.

## Role gates, used on every endpoint below

- **`canView(User $user)`**: `isAdmin() || isProjectManager() || isTeamMember() || isDepartmentHead()` — identical to `SupportOpsController::canView()`.
- **`canWrite`**: the existing `$user->canWrite()` trait method (Admin, Project Manager, Team Member — excludes Department Head).
- Every denial calls `AuditLogger::denied($request, '<action>', '<entity>', $id)` and returns `403` with `{ "message": "Unauthorized: Retrospectives are restricted to internal team members." }` — the same message shape `SupportOpsController` already uses for its own denial.
- Project-level scoping: every session/entry lookup additionally checks `Project::accessibleTo($user)->whereKey($project_id)->exists()` — role alone is not sufficient, matching the 007-permission-hardening project-scoping fix already applied to Support Ops.

## `GET /api/retro-sessions?project_id={id}`

- **Auth**: `canView()`. **Success (200)**: `RetroSessionResource::collection`, ordered `latest()` first (FR-009, US5).
- **Empty**: `200` with an empty array — never an error (a project with no sessions yet).

## `POST /api/retro-sessions`

- **Auth**: `canWrite()`.
- **Body**: `{ "project_id": int, "label": string (required, max:255) }`.
- **Success (201)**: `RetroSessionResource`.

## `GET /api/retro-sessions/{id}`

- **Auth**: `canView()` + project-scoped.
- **Success (200)**: `{ "session": RetroSessionResource, "entries": RetroEntryResource::collection }`, entries ordered `latest()` first within the session.

## `POST /api/retro-sessions/{id}/entries`

- **Auth**: `canWrite()` + project-scoped (via the parent session's `project_id`).
- **Body**: `{ "body": string (required), "sentiment": string (required, in: keep,improve,discuss) }` (FR-004 — validation rejects anything else, including omission).
- **Success (201)**: `RetroEntryResource`. `author_user_id` is always `$request->user()->id` — never client-supplied.

## `PATCH /api/retro-entries/{id}`

- **Auth**: `canWrite()` **and** project-scoped (`Project::accessibleTo($request->user())->whereKey($entry->session->project_id)->exists()` — required on every request to this endpoint, not only the ones touching `body`/`sentiment`), further restricted per FR-007: `body`/`sentiment` changes are only allowed when `$request->user()->id === $entry->author_user_id` **or** the user `isAdmin()`/`isProjectManager()`. A `canWrite()` Team Member who is not the author gets `403`, not a silent no-op. Critically, an author whose current project access fails the scoping check above is denied `403` even though `author_user_id` matches them — FR-007's authorship privilege does not survive losing project access (see `spec.md` Edge Cases).
- **Body** (all optional, at least one required): `{ "body"?: string, "sentiment"?: string, "owner_user_id"?: int|null }`.
  - **Owner assignment exception**: setting `owner_user_id` is allowed for *any* `canWrite()` user with project access (not just the author/Admin/PM) — FR-006, assigning follow-up ownership is a team action, not an authorship privilege. If a request changes `owner_user_id` alongside `body`/`sentiment` and the requester is neither author nor Admin/PM, only the `owner_user_id` change is applied; `body`/`sentiment` changes are rejected with `403`.
  - **Owner target validation (FR-006)**: the supplied `owner_user_id` MUST resolve to a user for whom `Project::accessibleTo($targetUser)->whereKey($entry->session->project_id)->exists()` is true. A request naming a user with no access to that project is rejected with `422`, not silently accepted — an owner assignment is a claim about who's actually positioned to follow up, not an arbitrary label.
  - Changing `owner_user_id` calls `AuditLogger::record()` (Constitution Principle IV — a responsibility-tracking action).
- **Success (200)**: updated `RetroEntryResource`.

## `DELETE /api/retro-entries/{id}`

- **Auth**: same as `PATCH`'s author/Admin/PM restriction **and** the same project-scoping re-check (FR-007) — a former author who has lost project access cannot delete their own old entry, matching the `PATCH` behavior above.
- **Success (204)**. Calls `AuditLogger::record()` (destructive action, Constitution Principle IV).

## `POST /api/retro-entries/{id}/vote`

- **Auth**: `canWrite()` + project-scoped.
- **No body**. Toggles: if `$request->user()`'s vote row exists, delete it; otherwise create it (FR-005, `research.md` Decision 1).
- **Success (200)**: `{ "voted": bool, "vote_count": int }` — enough for the frontend to update the button state and count without refetching the whole entry.
- **No mutation-audit call** — voting is high-frequency and low-stakes; see `plan.md`'s Constitution Check, Principle IV row.

## Client-role denial (FR-008, SC-005)

Every endpoint above denies `isClient()` the same as every other role that fails `canView()`/`canWrite()` — there is no partial or read-only Client response anywhere in this contract. Verified by the same fail-closed reasoning already applied to Kanban and Support Ops: deny by default, grant only recognized internal roles.

## Frontend call sites

`frontend/src/lib/api.js` gains: `fetchRetroSessions(projectId)`, `createRetroSession(projectId, label)`, `fetchRetroSession(id)`, `createRetroEntry(sessionId, body, sentiment)`, `updateRetroEntry(id, patch)`, `deleteRetroEntry(id)`, `toggleRetroVote(id)` — called from the new `frontend/src/pages/Retrospectives.jsx`, following the same fetch/loading-state conventions already established by `SupportOps.jsx`.
