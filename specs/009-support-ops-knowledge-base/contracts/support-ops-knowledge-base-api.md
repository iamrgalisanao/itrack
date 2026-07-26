# Contract: Support Ops Knowledge Base

Source of truth once implemented: `backend/routes/api.php`, `backend/app/Http/Controllers/SupportOpsController.php` (modified — new `knowledgeBase()` method only), `backend/app/Models/DetailedActivity.php` (modified — new `scopeResolvedWithRecordedFix()` only).

## `GET /api/support-ops/knowledge-base`

- **Auth**: `auth:sanctum` + `canView()` (Admin, Project Manager, Team Member, Department Head) — fail-closed, identical to `today()`'s existing gate. A Client-role request receives `403`, body `{ "message": "Unauthorized: Support Ops is restricted to internal team members." }` — the same message `today()`/`index()` already use, not a new one (FR-008). Enforced server-side regardless of how the request arrives — a direct API call bypassing the UI is denied exactly the same as one made through it (FR-011).
- **Query params** (all optional):
  - `q` — free-text keyword. Case-insensitive, partial match, against exactly five fields: `name`, `client_name`, `tenant_name`, `root_cause`, `resolution` (FR-001/FR-001a). Absent or empty → no keyword filter applied (browse mode, US2).
  - `project_id` — exact match, narrows to one project.
  - `client_name` — exact match (not partial — this is a filter, not a search; see `q` for partial matching).
  - `tenant_name` — exact match.
  - `client_priority` — exact match, one of `P1`/`P2`/`P3`.
  - `per_page` — `nullable|integer|min:1|max:100`, default `15` (FR-006b), identical validation shape to `UserManagementController::index()`.
  - `page` — standard Laravel paginator page number.
- **Combination rule** (FR-006a): `q` and every supplied filter combine with logical AND — a result must satisfy all of them. Supplying more filters or a keyword only narrows the result set, never widens it.
- **Inclusion rule** (FR-003/FR-004, always applied regardless of query params): only issues with an eligible work type (`support`/`learning`), a `status` of `completed` (the value the board's "Resolved" column renders — matched by value, never by that label text), and both a non-blank `root_cause` and a non-blank `resolution` (blank = empty, unset, or whitespace-only after trimming) ever appear.
- **Visibility** (FR-007): scoped to exactly the projects `Project::accessibleTo($user)` already returns for the requesting user — the identical mechanism `today()` uses, not a new or looser one. An issue in a project the requester cannot access is never returned, with no distinct error or count hinting at its existence (non-enumeration, matching this app's existing precedent from 007).
- **Sort order** (FR-005): `updated_at` descending, applied consistently whether or not `q` or any filter is supplied.
- **Success (200)**: `TodaySupportIssueResource::collection($paginator)` — the exact same Resource `today()` already uses, paginated. Standard Laravel pagination envelope (`data`, `links`, `meta`).
- **Zero matches**: `200` with an empty `data` array — never an error (FR-002).
- **No mutation**: this endpoint has no corresponding `store`/`update`/`destroy` — it is read-only, full stop (FR-010). No `AuditLogger` call is made from it; nothing it does is a sensitive mutation Constitution Principle IV would require logging.

## "Full context" (FR-009/FR-009a) — no new endpoint, but a new `readOnly` frontend contract

Selecting a result does not call any new backend route. The frontend opens the same `TaskDetailModal` component already used by `Kanban.jsx`/`SupportOps.jsx`/`TodayDashboard.jsx`, which in turn calls the same already-existing endpoints those pages already call for an issue's full detail, comments, and attachments. Whatever role-based visibility those endpoints already enforce (e.g., `CommentController`/`AttachmentController`'s existing `internal`/`client_visible` gating, which — confirmed — only ever restricts the Client role, a role already denied this entire feature) applies completely unchanged. No new response shape exists here.

**`TaskDetailModal` gains a `readOnly` boolean prop** (default `false` — every existing caller passes nothing and keeps its current, unchanged editable behavior). The knowledge base page is the only caller that ever passes `readOnly={true}`, required because the component is unconditionally editable today (FR-010 forbids any mutation through this feature — see research.md's corrected decision for the exact contradiction this closes). When `readOnly` is `true`:

| Component | Behavior change |
|---|---|
| `TaskDetailModal` | Details tab fields render `disabled`; "Save Changes" is not rendered (only "Close" remains). `readOnly` is passed through to `extraFields`, `TaskComments`, and `TaskFiles`. |
| `SupportIssueExtraFields` | Its own fields render `disabled`; the "Record client update now" button and all three Support Generator panels (Client Message Templates, Freeform Client Update, Troubleshooting Packet) are not rendered — generating a client-facing message for an issue being viewed purely as historical reference isn't a coherent action here, independent of the mutation question. |
| `TaskComments` | The add-comment form is not rendered. No delete action is offered on any existing comment, regardless of the viewing role's normal delete permission. |
| `TaskFiles` | The upload control is not rendered. No delete action is offered on any existing attachment, regardless of the viewing role's normal delete permission. |

## Frontend call sites

`frontend/src/lib/api.js` gains `fetchSupportOpsKnowledgeBase(params)` (`GET /support-ops/knowledge-base`, passing `q`/`project_id`/`client_name`/`tenant_name`/`client_priority`/`page`/`per_page` straight through as query params) — called from the new `frontend/src/pages/SupportOpsKnowledgeBase.jsx`, following the same fetch/loading-state conventions `TodayDashboard.jsx` already established for its own `fetchTodayDashboard()` call.
