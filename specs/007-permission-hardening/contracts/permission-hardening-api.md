# Contract: Permission Hardening

Source of truth once implemented: `backend/routes/api.php`, `backend/app/Http/Controllers/{ProjectAssignmentController,PreviewSessionController}.php` (new), `backend/app/Http/Controllers/{ModuleController,ActivityController,SubActivityController,DetailedActivityController,CommentController,AttachmentController}.php` (modified — accessibility check added to every method), `backend/app/Http/Middleware/{ResolvePreviewSession,BlockWritesDuringPreview}.php` (new), `backend/app/Support/AccessContext.php` (new), `backend/app/Exceptions/Handler.php` (modified — non-enumeration rule).

## Global: every project-scoped endpoint's contract change

**Not new endpoints — this changes the contract of every existing project-scoped endpoint** for Team Member/Client requesters specifically: `GET /api/projects`, `GET /api/projects/{id}`, `GET /api/dashboard`, `GET /api/reports`, and — newly guarded, previously ungated entirely — every method under `projects.modules`, `modules.activities`, `activities.sub-activities`, `sub-activities.detailed-activities`, `detailed-activities.comments`, `detailed-activities.attachments`. **`GET /api/reports/export-csv` is a deliberate exception** — see "Role-gating still wins over assignment scoping" below.

- For a Team Member/Client, every one of these now resolves the effective user via `AccessContext::user($request)` (the real user, unless a valid preview session is active — see "Preview session validation" below) instead of `$request->user()` directly, and scopes to `project_assignments` rows instead of department.
- A request for a project (or anything nested under one) the effective user cannot access returns **`403`**, body `{ "message": "You do not have access to this resource." }` — identically whether the ID exists-but-unassigned or doesn't exist at all (data-model.md's non-enumeration mapping). Never `404` for these two roles on these routes.
- Admin/Project Manager/Department Head: **no contract change** — same responses as before this feature (FR-004).
- If a valid preview session is active (`X-Preview-Session` header present and valid for the requesting Admin), the response body reflects the *target's* access, not the Admin's own — but the response also carries no distinguishing marker of preview being active (the point is to see exactly what the target would see).

### Role-gating still wins over assignment scoping — and is itself preview-aware (round-3 review point 4, sharpened by round-4 review)

Assignment scoping only *narrows further* an endpoint the effective user's role is already permitted to call — it never *widens* access, and it is evaluated only after the existing role check passes. `GET /api/reports/export-csv` already denies Client role entirely today (unrelated to this feature); that denial logic is unchanged and fires first. A Client requesting the export endpoint gets the same role-based denial they always have — assignment scoping is never even reached for that request, so it has nothing to say about "which projects" for an endpoint the role can't use at all. This applies to every project-scoped endpoint, not just exports: wherever an existing role check already excludes Team Member or Client, that exclusion is unaffected by this feature.

**But which user that check runs against changes during preview.** `ProjectController`, `ModuleController`, `ActivityController`, `SubActivityController`, `DetailedActivityController`, `CommentController`, `AttachmentController`, and `ReportController` each already resolve the acting user through an identical private `user(Request $request): User` helper that every check in the controller calls — this feature repoints that one helper, in exactly these eight controllers, to `AccessContext::user($request)` (research.md). The effect: an Admin previewing as a Client sees the *Client's* export denial, not the Admin's own unrestricted access — satisfying FR-006's "sees exactly that user's access" for pre-existing role behavior, not only for the new assignment-scoping checks. No other controllers are touched by this change (research.md's Scope discipline).

### Preview session validation (FR-019, revised per round-3 review point 3)

Validating a presented `X-Preview-Session` header happens entirely in `ResolvePreviewSession` middleware, **before any controller runs** — not inside the eventual response:

- **Valid token**: request proceeds normally; `AccessContext::user($request)` resolves to the target throughout the controller. No distinguishing marker in the response (see above).
- **Invalid token** (not found, expired, target disabled, or target's role changed since the session started — FR-019): the middleware short-circuits immediately with **`409`**, body `{ "message": "Preview session ended.", "reason": "expired" | "target_disabled" | "target_role_changed" | "not_found" }`, header `X-Preview-Ended: 1`. **No controller runs and no domain data is included** — this deliberately replaces an earlier draft of this contract that fell back to serving the Admin's own unrestricted data in the same response, which risked rendering Admin-wide data into a screen the Admin still perceived as preview mode. The frontend interceptor reads `X-Preview-Ended`, clears local preview state, and issues a fresh, separate request (with no preview header) to get the Admin's real data intentionally — never silently, within the response that was supposed to be a preview.

## `GET /api/project-assignments`

- **Auth**: `auth:sanctum` + Admin or Project Manager (`isPmOrAdmin()`), fail-closed — 403 for every other role, 401 unauthenticated.
- **Query params**: `project_id` (optional filter), `user_id` (optional filter).
- **Success (200)**: `ProjectAssignmentResource::collection(...)`.

## `POST /api/project-assignments`

- **Auth**: Same as above.
- **Body**: `user_id`, `project_id`.
- **Validation** (FR-016): `user_id` must reference an existing user who is `is_active = true` and whose role is Team Member or Client — otherwise `422`. `project_id` must reference an existing project.
- **Idempotency** (FR-017): if the pair already exists, returns the existing `ProjectAssignmentResource` with `200` and writes **no** audit entry. If new, returns `201`, writes `project_assignment.created` audit entry.

## `DELETE /api/project-assignments/{id}`

- **Auth**: Same as above.
- **Success (204)**. Audit: `project_assignment.deleted`.
- **Effect**: takes effect on the target user's very next request (no re-login), matching 006's established immediate-effect precedent — `scopeAccessibleTo` is re-evaluated fresh on every request, never cached.

## `POST /api/preview-sessions`

- **Auth**: `auth:sanctum` + Admin-only (`isAdmin()`). 403 for every other role (FR-008), 401 unauthenticated.
- **Body**: `target_user_id`.
- **Validation** (FR-009): `target_user_id` must not resolve to a user whose role is Admin — `422` if it does, message `{ "message": "Cannot preview as another Admin." }`.
- **Validation** (round-3 review high-priority item): `target_user_id` must resolve to an `is_active = true` account — `422` if the target is disabled, message `{ "message": "Cannot preview as a disabled account." }`. Rejecting this up front, rather than only detecting it later via `ResolvePreviewSession`'s mid-session invalidation, avoids ever creating a session that would be invalid from the moment it's created.
- **Behavior**: any existing active preview session for this Admin is ended first (`ended_at` set, `reason: 'manual'` audit entry) — at most one active preview per Admin (data-model.md). This endpoint is exempt from `BlockWritesDuringPreview` (see below) specifically so this replace-in-place behavior works even while a preview is already active.
- **Success (201)**: `PreviewSessionResource` (the *only* response that ever includes `token` — data-model.md). Audit: `preview.started`.

## `DELETE /api/preview-sessions/current`

- **Auth**: `auth:sanctum` + Admin-only, and must be the Admin who owns the active session identified by the presented `X-Preview-Session` header.
- **Success (204)**. Audit: `preview.ended`, `metadata.reason: 'manual'`.
- **Failure (404)**: no active session found for the presented token/Admin pairing (already ended, expired, or no header presented).

## Write-blocking during preview (FR-007)

Applies globally, via `BlockWritesDuringPreview` in the same authenticated middleware group as `EnsureUserIsActive`:

- Any `POST`/`PUT`/`PATCH`/`DELETE` request presenting a currently-valid `X-Preview-Session` header is rejected with **`403`**, body `{ "message": "Write operations are disabled while previewing." }`, **before** the target controller runs — the write never reaches the database.
- Exempted: `DELETE /api/preview-sessions/current` (ending the preview is not a "write" in this sense), `POST /api/preview-sessions` (round-3 review point 1 — the frontend keeps attaching the active preview header while a preview is showing, so starting a *replacement* preview must not be blocked by the very session it's about to end; `PreviewSessionController::store`'s own "end any prior session first" logic, not this middleware, is what makes that safe), and `POST /api/logout`.
- Every blocked attempt is audited: `preview.write_blocked`, `metadata: { target_user_id, attempted_method, attempted_path }`.

## Frontend call sites

`frontend/src/lib/api.js` gains `fetchProjectAssignments(params)`, `createProjectAssignment(data)`, `deleteProjectAssignment(id)`, `startPreview(targetUserId)`, `endPreview()` — called from `Admin.jsx`'s new "Project Assignments" tab and the "User Accounts" tab's per-row "Preview" action, respectively. A new request interceptor attaches `X-Preview-Session` from `previewSession.js`'s `sessionStorage`-backed helper when set; the existing response interceptor gains a branch reading `X-Preview-Ended` to clear that state and surface a toast ("Preview session ended") via `PreviewContext`.
