# Contract: Generation Audit Log API (new)

Source of truth once implemented: `backend/routes/api.php`,
`backend/app/Http/Controllers/SupportOpsController.php` (new action added
to the existing controller — see plan.md's decision against a new
controller). Documented here during planning so `/speckit-tasks` has a
concrete contract to build against.

This is the **only** new backend surface in this feature. Template/packet
generation itself is entirely client-side (see research.md and
data-model.md) — this endpoint exists solely to satisfy FR-013's Data
Privacy Act audit requirement, and only for generations whose output
actually includes personal information.

## `POST /api/support-ops/{id}/generation-log`

- **Auth**: `auth:sanctum` + the identical inclusion-based view check already
  used by `SupportOpsController::index()` (`isAdmin() || isProjectManager()
  || isTeamMember() || isDepartmentHead()`) — enforced at the API level per
  FR-010, not only by hiding controls in the UI. Deliberately the *view*
  check, not `canWrite()` — generating a template/packet is available to
  anyone who can open the issue, including Department Head, who can view but
  not edit (matches FR-010; generating text is not a write to the issue).

- **Full role/response matrix**:

  | Caller | Result |
  |---|---|
  | Admin | 200 |
  | Project Manager | 200 |
  | Team Member | 200 (same view-access gate as `index()` — explicitly not restricted to `canWrite()` roles) |
  | Department Head | 200 (can view Support Ops; generating text is not a write, so this is allowed even though Department Head cannot edit issue fields) |
  | Client | 403 |
  | Authenticated user with null/unrecognized role | 403 (fail-closed, Constitution Principle I) |
  | Unauthenticated request | 401 |
  | Valid role, nonexistent `{id}` | 404 |
  | Valid role, `{id}` exists but is not a Support Ops-scoped record (see below) | 404 |
  | Valid role, valid Support Ops `{id}`, body fails validation | 422 |

- **Path param**: `{id}` — the `DetailedActivity` id of the open issue. The
  server MUST verify this record is actually within Support Ops' scope (the
  same `work_type` scoping `SupportOpsController::index()` already applies —
  see `002-support-ops-tracker/contracts/support-ops-api.md`) before doing
  anything else. A syntactically valid id belonging to an ordinary
  Kanban-only task (never touched by Support Ops) MUST 404, not log an entry
  — this endpoint is not a generic "log an event against any task" facility.

- **Body**:
  ```text
  artifact_type          required, in:template,draft,packet
  template_stage         nullable, string, in:acknowledgement,intake_request,
                          investigation_started,progress_update,
                          waiting_for_client,root_cause_found,resolved
                          — required (non-null) when artifact_type=template;
                          MUST be null/omitted for draft and packet
  issue_updated_at       required, string — the *exact* ISO 8601 string from
                          `SupportIssueResource.updated_at` as the frontend
                          had it loaded at the moment of generation (i.e.
                          `issue.updated_at` straight from the response
                          already driving the UI, passed through unmodified —
                          not reformatted or reparsed by the frontend). Not
                          sensitive data — used only for the
                          snapshot-consistency check below, never to
                          determine the actual included_* booleans.
  ```
  `included_client_name`/`included_tenant_name` are **not** client-supplied
  fields at all — see the trust-boundary note below.

  **Client-side gating note (artifact-type-specific, matching the server's
  own check)**: the frontend only *calls* this endpoint when it can tell
  locally that the generation would include personal information for that
  specific artifact type — for `template`/`draft`, that means a non-empty
  (post-trim) `client_name` only (`tenant_name` is irrelevant to the gating
  decision for these two, since it's never part of their output); for
  `packet`, a non-empty `client_name` **or** `tenant_name`. This mirrors the
  server's own artifact-type table below exactly, so the frontend never
  makes a pointless call for a template/draft just because the issue has a
  `tenant_name` set. This gating is purely a UX/traffic optimization to skip
  an unnecessary network call — not a security boundary and not the source
  of truth for what gets recorded (the server re-derives everything
  independently regardless of whether the frontend's local check was even
  correct).

  **Trust boundary — server MUST re-derive, never trust client input, and
  MUST branch on `artifact_type`**: on every call that reaches this
  endpoint, the server loads the issue fresh from the database and
  independently computes, per data-model.md's artifact-type table:
  - `artifact_type: template` or `draft` → `included_client_name = trim(issue.client_name) !== ''`; `included_tenant_name` is **hardcoded `false`** — never derived from `issue.tenant_name` at all, since neither of these two artifact types ever puts tenant in their output, regardless of whether the issue happens to have one set.
  - `artifact_type: packet` → `included_client_name = trim(issue.client_name) !== ''` **and** `included_tenant_name = trim(issue.tenant_name) !== ''` — both are real checks, since the packet is the only artifact that actually includes tenant.

  The client sends no booleans at all, precisely so there is nothing for a
  buggy or malicious direct API caller to misrepresent. This is what
  actually makes FR-013's privacy gate trustworthy for RA 10173
  accountability purposes — a client-supplied flag would not be, and neither
  would a same-check-for-every-artifact-type shortcut (a template with a
  blank `client_name` but the issue having a `tenant_name` set MUST NOT log
  `included_tenant_name: true` — tenant was never in that template's text).

  **Snapshot-consistency check (handles the render/log-write race)**:
  generation is instant and client-side, but this endpoint call happens a
  moment later over the network — the issue could theoretically be edited
  by someone else in that window. The server compares `issue_updated_at`
  against the freshly-loaded issue's own `updated_at`, both normalized the
  same way (`$issue->updated_at?->toIso8601String()`, matching
  `SupportIssueResource`'s own serialization exactly, so there is no
  ambiguity from timezone offsets, sub-second precision, or reformatting —
  a plain string comparison of two values produced by the identical
  serialization method):
  - **Match**: current DB values are exactly what was rendered — proceed
    with steps 4 below normally (including skipping the write if the
    artifact-type-specific check above finds nothing included).
  - **Mismatch**: the server cannot confirm the current values match what
    was shown to the user, so it writes the entry regardless of the current
    field values, with `metadata.snapshot_stale: true` (see data-model.md).
    Under-logging what was actually disclosed is worse than an occasional
    extra/defensive entry for RA 10173 accountability purposes.

- **Trigger discipline (frontend responsibility, validated by contract, not
  by this endpoint)**: this endpoint MUST be called only on an explicit
  "Generate [stage]" / "Start freeform draft" / "Generate troubleshooting
  packet" click — never on stage-selection/browsing, editing generated text,
  copying, or closing/reopening a composer without a fresh Generate click.
  See FR-013 and data-model.md for the full trigger definition. Re-clicking
  Generate (same or different stage) calls this endpoint again — each
  explicit generation is its own audit entry, by design (not deduplicated).

- **Server-side behavior**:
  1. Re-run the same view-access check as `index()` — fail-closed.
  2. Load the issue by `{id}`; 404 if it doesn't exist or isn't Support
     Ops-scoped (see path param note above).
  3. Validate the body per the rules above.
  4. Compare `issue_updated_at` to `$issue->updated_at?->toIso8601String()`
     — set `snapshot_stale = (issue_updated_at !== that string)`.
  5. Compute `included_client_name`/`included_tenant_name` fresh from the
     loaded issue's current field values, **branching on `artifact_type`**
     per the trust-boundary note above (`template`/`draft`:
     `included_tenant_name` hardcoded `false`; `packet`: both real checks) —
     never from client input.
  6. If `snapshot_stale` is `false` **and** the artifact-type-specific check
     finds nothing included (both relevant booleans `false`), return success
     without writing any audit row at all (per FR-013's privacy gate — no
     personal information disclosed by this artifact, no log). Otherwise
     (something relevant is `true`, or `snapshot_stale` is `true`), proceed
     to write an entry — a stale snapshot always logs, regardless of what
     the current values happen to be, per the snapshot-consistency check
     above.
  7. Map `artifact_type` to the action name:
     `template` → `support_issue.template_generated`,
     `draft` → `support_issue.draft_started`,
     `packet` → `support_issue.packet_generated`.
  8. `AuditLogger::record($request, $action, 'detailed_activity', $id, null, ['artifact_type' => ..., 'template_stage' => ..., 'included_client_name' => ..., 'included_tenant_name' => ..., 'snapshot_stale' => ...])`
     — see data-model.md for the full metadata shape, using the
     server-computed values from steps 4–5. **The request body, the
     response, and the audit metadata MUST NEVER include the generated text
     itself or the actual `client_name`/`tenant_name` values** — only the
     server-derived booleans and the stage key ever appear in the metadata.
- **Success (200)**: `{ "logged": true }` in both the "audit row written" and
  the "artifact-type-specific check found nothing included, nothing to log"
  cases — intentionally minimal, per
  Constitution Principle II (no raw model return), and deliberately not
  distinguishing the two cases in the response so the frontend doesn't need
  its own (untrusted) belief about whether logging happened to match the
  server's.
- **Failure (401)**: standard Sanctum unauthenticated response.
- **Failure (403)**: `{ "message": "..." }` for Client role or unrecognized
  role — same message style as the existing `index()` denial.
- **Failure (404)**: issue not found, or not a Support Ops-scoped record.
- **Failure (422)**: validation errors, standard Laravel shape (e.g.
  `artifact_type` missing/invalid, `template_stage` provided when
  `artifact_type` is `draft`/`packet` or missing when it's `template`, or
  `issue_updated_at` missing or not a string in the same ISO 8601 format
  `SupportIssueResource` itself produces — validated as a well-formed string
  in that format, **never parsed/reformatted/normalized** before the
  snapshot-consistency comparison, since re-parsing risks silently
  tolerating a value that wouldn't actually match the resource's own
  `toIso8601String()` output byte-for-byte).

## Failure handling contract (frontend behavior, not this endpoint's concern)

If this endpoint's call fails for any reason (network error, 5xx, a 401 from
an expired session) **the frontend MUST NOT**:
- block the generated text from displaying,
- disable or delay the Copy action,
- retry synchronously in a way that delays the UI,
- surface a user-facing blocking error.

The frontend **MUST** log the failure to the browser console only (best
effort). This is a deliberate availability-over-strict-audit trade-off
(research.md), and SC-005 is scoped accordingly as a best-effort target, not
a hard guarantee.

## Frontend call site

`frontend/src/lib/api.js` gains
`logSupportGeneration(issueId, { artifact_type, template_stage, issue_updated_at }) => api.post(`/support-ops/${issueId}/generation-log`, { artifact_type, template_stage, issue_updated_at })`,
called fire-and-forget (not awaited before enabling Copy or displaying
generated text) from `SupportOps.jsx`, exactly once per explicit Generate
click — never from the Copy button, a stage-selection change, an edit, or a
close/reopen (see data-model.md's trigger table). `issue_updated_at` is read
straight off the currently-open issue's own `updated_at` (already present in
the `SupportIssueResource` response driving the page — no extra fetch
needed). The frontend only makes this call when it locally determines,
**per the artifact-type-specific gating rule above** (client name only for
`template`/`draft`; client name or tenant name for `packet`), that the
generation would include personal information for that specific artifact —
skipping the call otherwise, as a traffic optimization — but sends no
boolean flags, since the server independently re-derives them from the
issue record (see trust-boundary note above).
