# Quickstart: Validating Templates and Prompt Generator (Support Ops Phase 2)

## Prerequisites

- Backend running: `cd backend && php artisan serve` (http://localhost:8000)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- **No migration to run** — this feature adds zero columns/tables.
- Signed in as one of the persona accounts from `001-real-auth-cutover`'s
  quickstart (all password `password`): `pm@itrack.test` (Project Manager),
  `team@itrack.test` (Team Member), `depthead@itrack.test` (Department Head),
  `client@itrack.test` (Client)
- At least one existing Support Ops issue with `client_name` and
  `tenant_name` set, created via Support Ops quick intake (so its
  `description` has the structured `Timestamp:`/`Area/workflow affected:`/
  `Expected:`/`Actual:` block from 002-support-ops-tracker's intake
  composition), plus a second issue with `client_name`/`tenant_name` both
  blank, and a third whose `description` was set directly (not via intake)
  so it has no structured labels at all.

## Scenario 1 — Client message templates render exactly per the canonical wording (US1, FR-001, FR-002, FR-003, FR-004)

1. Sign in as `pm@itrack.test`, open the issue with `client_name` and
   `name` (title) both set, navigate to the issue detail view.
2. Select each of the seven template stages in turn and click Generate for
   each.
3. **Expected**: each renders the exact canonical wording from
   data-model.md's Message Template table (e.g. Acknowledgement →
   `"Hi {client_name}, we've received your report regarding \"{name}\" and
   are looking into it."` with the real values substituted) — not just
   "a message referencing the client name," the literal wording.
4. **Expected**: none of the seven templates ever show `evidence`,
   `root_cause`, `resolution`, or `next_action` — confirm by using an issue
   that has all four of those fields filled in and verifying they never
   appear in any of the seven generated messages.
5. **Expected**: none of the seven templates name a specific messaging
   provider or app (Viber, WhatsApp, Messenger, Slack, Teams, SMS, email) or
   say "send this via X" (FR-001, SC-003).
6. Edit the generated text for one stage, then select "Copy" (FR-004).
7. **Expected**: pasting elsewhere (e.g. a scratch text field) shows the
   *edited* text exactly, including line breaks, with no HTML formatting
   artifacts — confirming plain-text copy (FR-004, FR-015).

## Scenario 2 — Missing client name, tenant, or title never blocks generation or breaks wording (US1 edge case, FR-002)

1. Open the issue with `client_name`/`tenant_name` both blank.
2. Generate each of the seven template stages.
3. **Expected**: each renders using the "client_name absent" wording variant
   from data-model.md's table (e.g. `"Hi, we've received your report..."`)
   — no literal "undefined," "null," stray comma, or doubled space where the
   name would have gone.
4. If reachable, test an issue with no `name` (title) either.
5. **Expected**: `"your reported issue"` is substituted in place of the
   quoted title, with the surrounding quote marks also dropped (per
   data-model.md).

## Scenario 3 — Troubleshooting packet: precise field mapping, including the root-cause addendum (US2, FR-006, FR-007)

1. Open the issue created via quick intake (structured `description`), with
   `evidence` and `root_cause` both set.
2. Generate the troubleshooting packet.
3. **Expected**, per data-model.md's mapping table exactly:
   - Client issue = `name`
   - Tenant = `tenant_name`
   - Provider/client = `client_name` (confirm this is the client
     organization's name, not anything channel/messaging-related)
   - Timestamp = the parsed `Timestamp:` value from `description`, shown
     verbatim as typed at intake (not `created_at`)
   - Endpoint or workflow = the parsed `Area/workflow affected:` value
   - Expected behavior = the parsed `Expected:` value
   - Actual behavior = the parsed `Actual:` value
   - Screenshots/log snippets = `evidence`, as plain text (confirm no
     attempt is made to attach or reference actual files from the Files tab)
4. **Expected**: an additional "Suspected root cause so far: {root_cause}"
   line appears after the standard footer, since `root_cause` is non-empty.
5. **Expected**: Environment, Request payload/sample, and Error message all
   appear as clearly labeled blanks (e.g. `Environment:` with nothing after
   it) — these have no tracked source field at all, on any issue.
6. Repeat on an issue with `root_cause` empty.
7. **Expected**: the "Suspected root cause so far" line is entirely absent
   from the output — not present with a blank value, just absent.
8. Select "Copy" (FR-008) and confirm the pasted text matches exactly what
   was displayed, as plain text.

## Scenario 4 — Description parsing handles missing/malformed structure without blocking (FR-007, data-model.md's parsing grammar)

Using the third prerequisite issue (unstructured `description`, no labels
at all) and, if feasible, a deliberately malformed one (e.g. only two of the
four labels present, or `EXPECTED:` in different casing, or a multi-line
value):

1. Generate the troubleshooting packet on the unstructured-description
   issue.
2. **Expected**: packet still generates successfully; Timestamp falls back
   to `created_at` formatted via `toLocaleString()` (matching the existing
   convention in `Admin.jsx`'s audit log display); Endpoint or workflow,
   Expected behavior, and Actual behavior all render as blank placeholders;
   the raw `description` text is **not** dumped into any of these fields.
3. On a partially-structured description (e.g. only `Expected:` present),
   confirm only that one field is filled and the others (Timestamp falling
   back, Area/workflow affected, Actual behavior) are blank — parsing one
   label successfully doesn't require or imply the others are present.
4. On a description with a label in different casing (e.g. `expected:`
   lowercase), confirm it is still recognized (case-insensitive match).

## Scenario 5 — Freeform composer starts fresh across every kind of navigation (US3, FR-005, FR-014)

1. Open the freeform update composer on any issue.
2. **Expected**: pre-filled per data-model.md's freeform pre-fill, empty body
   ready for typing.
3. Type custom text, then, without copying, do each of the following in
   turn (re-typing draft text before each): close and reopen the issue;
   switch to a different issue and back; navigate to another page (e.g.
   `/kanban`) and back to this issue; reload the browser tab.
4. **Expected** in every case: the composer reopens with an empty body — no
   scenario preserves the draft text (FR-014's "under any circumstance").

## Scenario 6 — Generating never mutates the issue's persisted fields (FR-009)

1. Record an issue's current `status` and `last_client_update_at` directly
   from the API response (`GET /api/support-ops?project_id=<id>`) or the DB
   — not the board's visual "stale" badge, since that's a time-relative
   display that can change on its own regardless of this feature.
2. Generate a template, the freeform composer, and the packet, in any order,
   without clicking "Record client update now."
3. **Expected**: re-fetching the issue shows `status` and
   `last_client_update_at` byte-for-byte unchanged from step 1.

## Scenario 7 — Audit trigger fires only on explicit Generate, never on browsing/editing/copying/reopening (FR-013)

Using an issue with `client_name` set (so the privacy gate is satisfied),
check the audit log after each step (`php artisan tinker` →
`AuditLog::where('entity_id', <id>)->latest()->get()`, or an admin audit view
if one exists). Record the count after each step:

1. Open the template picker and browse through all seven stages **without**
   clicking Generate on any of them.
   **Expected**: audit count unchanged (0 new entries).
2. Click Generate on the "Acknowledgement" stage.
   **Expected**: exactly one new `support_issue.template_generated` entry,
   `metadata.template_stage = "acknowledgement"`.
3. Edit the generated text.
   **Expected**: audit count unchanged.
4. Click "Copy".
   **Expected**: audit count unchanged (Copy never logs).
5. Close the issue detail view and reopen it, without clicking Generate
   again.
   **Expected**: audit count unchanged.
6. Click Generate on "Acknowledgement" again (same stage, explicitly
   re-clicked).
   **Expected**: exactly one more new entry — re-generation is a new,
   distinct event by design.
7. Open the freeform composer (without any further click).
   **Expected**: audit count unchanged — opening alone doesn't log; only
   clicking "Start freeform draft" does. Then click "Start freeform draft".
   **Expected**: exactly one new `support_issue.draft_started` entry,
   `metadata.template_stage = null`.
8. Click "Generate troubleshooting packet".
   **Expected**: exactly one new `support_issue.packet_generated` entry.
9. Repeat steps 2–8 on an issue with `client_name` **and** `tenant_name`
   both blank.
   **Expected**: zero audit entries at any step — no personal information,
   no log, per the privacy gate.
10. Using an issue with `client_name` **blank** but `tenant_name` **set**,
    click Generate on a template stage, then click "Start freeform draft."
    **Expected**: zero audit entries for either — tenant is never part of a
    template's or the freeform draft's output, so its presence on the issue
    must not trigger logging for these two artifact types (FR-013's
    artifact-type-specific inclusion rule). Now click "Generate
    troubleshooting packet" on the same issue.
    **Expected**: exactly one new `support_issue.packet_generated` entry,
    with `metadata.included_client_name = false` and
    `metadata.included_tenant_name = true` — confirming the packet's check
    is genuinely independent of the template/draft check on the same
    underlying issue data.
11. For every logged entry above, inspect `metadata` directly.
    **Expected**: contains only `artifact_type`, `template_stage`,
    `included_client_name`, `included_tenant_name` — never the generated
    text, never the actual `client_name`/`tenant_name` string values.
12. Using a REST client (not the UI), call
    `POST /api/support-ops/{id}/generation-log` directly with a hand-crafted
    body claiming `included_client_name`/`included_tenant_name`-style flags
    (if you include them at all — the documented contract no longer accepts
    them). Separately, test that even omitting any such fields, the server's
    logged `metadata.included_client_name`/`included_tenant_name` reflect the
    issue's **actual current** `client_name`/`tenant_name` values, not
    anything the request implied.
    **Expected**: the server-derived booleans are correct regardless of what
    the request body does or doesn't claim — confirming the server never
    trusts client input for this (contracts/generation-log-api.md's
    trust-boundary requirement).
13. Using a REST client, call the endpoint with a deliberately stale
    `issue_updated_at` (e.g. an hour in the past, not matching the issue's
    real current `updated_at`) against an issue whose `client_name` and
    `tenant_name` are **both currently blank**.
    **Expected**: an audit entry is still written (not skipped), with
    `metadata.snapshot_stale: true` — confirming the server errs toward
    logging when it can't confirm the request's view of the issue matches
    its current state, rather than silently under-logging (the
    snapshot-consistency check in contracts/generation-log-api.md).
14. Repeat with a matching, fresh `issue_updated_at` on the same
    both-blank issue.
    **Expected**: no audit entry written (the normal skip-when-blank path),
    confirming the snapshot check only changes behavior on an actual
    mismatch.

## Scenario 8 — Audit write failure doesn't block the user (FR-013's last bullet)

1. Stop the backend (or block the `generation-log` request via browser
   devtools request blocking) while the frontend remains up.
2. Click Generate on any template stage for an issue with `client_name` set.
3. **Expected**: the generated text still displays and "Copy" still works
   normally — no blocking error, no disabled Copy button. A failure is
   visible only in the browser console (devtools).

## Scenario 9 — Privacy notice is visible but never blocks, for all three artifacts (FR-012)

1. Open any issue's template generation controls.
2. **Expected**: a visible privacy notice referencing the Data Privacy Act is
   present near the generate/copy actions.
3. Without dismissing or interacting with the notice, generate and copy a
   template immediately.
4. **Expected**: copy succeeds with no forced interaction with the notice
   first — it is informational only, never a blocking step.
5. Repeat steps 1–4 for the freeform composer, and again for the
   troubleshooting packet.
   **Expected**: the same non-blocking privacy notice is present near both
   of these controls too — FR-012 covers all three artifacts, not just
   templates and the packet.

## Scenario 10 — Access matches existing Support Ops gating, enforced at the API level (US1/US2/US3, FR-010, contracts/generation-log-api.md)

1. Sign in as `team@itrack.test` (Team Member).
2. **Expected**: templates, the composer, and the packet generator are all
   usable, and a Generate click successfully logs (200 from
   `generation-log`) — Team Member is explicitly included in the view-access
   gate, not assumed.
3. Sign in as `depthead@itrack.test`.
4. **Expected**: same as Team Member — Department Head can view Support Ops
   and generate text (not a write to the issue), even though Department Head
   cannot edit issue fields directly.
5. Sign in as `client@itrack.test`.
6. **Expected**: cannot reach `/support-ops` at all. Additionally, using the
   browser devtools or a REST client, attempt a direct
   `POST /api/support-ops/{id}/generation-log` call while authenticated as
   this Client session.
   **Expected**: 403, confirming enforcement is server-side, not just a
   hidden UI control.
7. Without any session cookie, attempt the same direct API call.
   **Expected**: 401.
8. With a valid internal-role session, call the endpoint with an invalid
   `artifact_type` (e.g. `"bogus"`).
   **Expected**: 422.
9. With a valid internal-role session, call the endpoint with a nonexistent
   issue id.
   **Expected**: 404.
10. With a valid internal-role session, call the endpoint against the id of
    an ordinary Kanban-only task that has never been touched by Support Ops
    (`work_type != support`, no `client_name`/`tenant_name` ever set).
    **Expected**: 404 — this endpoint only operates on Support Ops-scoped
    records, confirmed server-side, not merely by the frontend never
    surfacing the controls for such a task.

## Scenario 11 — Special characters and markup render and copy as literal text (FR-015)

1. Temporarily set an issue's `client_name` (or `evidence`) to a value
   containing markup and special characters, e.g.
   `<script>alert(1)</script> A&B "Corp"`.
2. Generate a template (for `client_name`) or the packet (for `evidence`).
3. **Expected**: the value appears in the generated text exactly as typed —
   displayed as literal text (no script execution, no HTML rendering,
   confirming the generated text area is a plain `<textarea>` or equivalent,
   never `dangerouslySetInnerHTML`).
4. Copy the text and confirm the pasted value matches exactly, unescaped
   and unexecuted.
5. Revert the test value afterward.

## Scenario 12 — Unsaved edits are never disclosed by a generator (FR-016)

1. Open an issue whose saved `client_name` is, e.g., "Acme Corp".
2. In the issue detail form, change `client_name` to a different value
   (e.g. "Wrong Corp") but do **not** click Save.
3. With that unsaved edit still sitting in the form, click Generate on any
   template stage.
4. **Expected**: the generated text uses "Acme Corp" — the last-**saved**
   value — not "Wrong Corp." This confirms generation reads
   `SupportOps.jsx`'s `selectedIssue`, never `TaskDetailModal`'s local
   `form` state (FR-016).
5. Repeat for the freeform composer and the troubleshooting packet; for the
   packet, also try an unsaved edit to `tenant_name`, `evidence`, and
   `root_cause` in turn.
6. **Expected**: same result every time — no unsaved edit to any field ever
   appears in generated text for any of the three artifacts.
7. Now actually click Save to persist "Wrong Corp," then generate again.
8. **Expected**: the newly generated text now uses "Wrong Corp" — confirming
   generation does reflect saved changes, just never in-progress ones.
9. Revert the test value afterward.

## Scenario 13 — The frontend sends the exact issue snapshot the server expects (FR-013, contracts/generation-log-api.md)

1. Open browser devtools' Network tab, filter to `generation-log`.
2. Click Generate on any template stage for an issue with `client_name` set.
3. **Expected**: the request body's `issue_updated_at` exactly matches the
   `updated_at` string from the most recent `GET /api/support-ops` (or
   equivalent) response already driving this page for this issue — passed
   through unmodified, not reformatted, truncated, or re-parsed by the
   frontend.
4. **Expected**: the request body contains only `artifact_type`,
   `template_stage`, and `issue_updated_at` — no `included_client_name`/
   `included_tenant_name` fields anywhere, confirming the frontend never
   sends the privacy flags the server is responsible for deriving itself
   (contracts/generation-log-api.md's trust-boundary requirement).

## Regression check

- Run backend tests: `cd backend && php artisan test` — all existing tests
  plus the new generation-log Feature test (covering the full role matrix
  from contracts/generation-log-api.md, including the Support-Ops-scope 404
  case) must pass.
- Run the new frontend unit tests:
  `node --test frontend/src/lib/supportTemplates.test.js` — covers the
  template/parsing logic (Scenarios 1–4's rules) at the unit level, faster
  and more exhaustive than manual browser checks alone.
- Manually confirm the Kanban Board, Work Program, Schedule, and Reports
  views are visually and functionally unchanged.
- Confirm `npm run build` and `npm run lint` remain clean (no new frontend
  dependency was introduced).
- This feature is expected to remain isolated to Support Ops
  generation/audit-related code; any change outside that area found during
  implementation should be treated as a signal to re-check scope, not
  assumed safe by default.
