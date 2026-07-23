# Quickstart: Validating Daily Operating Dashboard (Support Ops Phase 3)

## Prerequisites

- Backend running: `cd backend && php artisan serve` (http://localhost:8000)
- Frontend running: `cd frontend && npm run dev` (http://localhost:5173)
- **No migration to run** — this feature adds zero columns/tables.
- Signed in as one of the persona accounts from `001-real-auth-cutover`'s
  quickstart (all password `password`): `pm@itrack.test` (Project Manager,
  sees all projects), `team@itrack.test` (Team Member, sees only their own
  department's projects), `depthead@itrack.test` (Department Head, sees
  their granted departments), `client@itrack.test` (Client, no access at
  all).
- At least two projects in **different departments**, each with at least
  one Support Ops issue, so cross-project aggregation and department-based
  scoping are both actually exercised:
  - Project A: one P1 issue with `last_client_update_at` over an hour ago
    (stale), one P1 issue updated a few minutes ago (not yet stale).
  - Project B (different department than A): one issue in `blocked` status,
    one issue in `delayed` status, one open `work_type: learning` entry.

## Scenario 1 — Cross-project aggregation and access scoping (US1, FR-002)

1. Sign in as `pm@itrack.test` (sees all projects) and open the Today view.
2. **Expected**: issues from both Project A and Project B appear, each
   labeled with its own project name.
3. Sign in as `team@itrack.test`, whose department only covers Project A
   (not B).
4. **Expected**: only Project A's issues appear — Project B's are absent,
   confirming this view respects the same department-based access as
   `Reports`/`Dashboard`, not "every project in the system."
5. Sign in as `client@itrack.test` and attempt to reach the Today view
   directly by URL.
6. **Expected**: denied, identical to the existing `/support-ops` board's
   restriction.

## Scenario 2 — Stale vs. P1-not-yet-stale classification (US1, FR-003, FR-004)

1. Sign in as `pm@itrack.test`, open the Today view.
2. **Expected**: Project A's stale P1 issue appears in the **Stale**
   section; the not-yet-stale P1 issue appears in the **P1 — Watch
   Closely** section, not Stale.
3. **Expected**: the Stale section is sorted with the most-overdue item
   first (per data-model.md's overdue-duration sort, not raw elapsed time).
4. Update the not-yet-stale issue's `last_client_update_at` further into
   the past (past its 1-hour threshold) directly via `php artisan tinker`
   (e.g. `DetailedActivity::find($id)->update(['last_client_update_at' => now()->subHours(2)])`)
   — the UI's "Record client update now" always sets this field to the
   current moment and cannot backdate it, so a genuinely stale fixture
   requires setting the timestamp directly. Alternatively, wait past the
   threshold in real time, then reload.
5. **Expected**: it moves from P1 — Watch Closely into Stale — never
   appearing in both at once.

## Scenario 3 — Waiting for Client covers both `blocked` and `delayed` (US2, FR-005)

1. Open the Today view as `pm@itrack.test`.
2. **Expected**: both Project B's `blocked` issue and its `delayed` issue
   appear in the **Waiting for Client** section — confirming neither status
   value is silently dropped.
3. If either of those two issues would also qualify as stale by the
   timestamp math, confirm it appears **only** in Waiting for Client, never
   duplicated into Stale (FR-009's precedence).

## Scenario 4 — Learning Priorities is a separate track (US3, FR-006, FR-009a)

1. Open the Today view as `pm@itrack.test`.
2. **Expected**: Project B's open learning entry appears in **Learning
   Priorities**, labeled with its project.
3. Mark that learning entry `completed` (via the existing detail view) and
   reload.
4. **Expected**: it disappears from Learning Priorities entirely — this
   section shows open items only, not a history log.
5. If reachable, set a learning entry's `status` to `blocked` and/or give it
   a `client_priority` of `P1`, then reload.
6. **Expected**: it still appears **only** in Learning Priorities (if still
   open) — it must never appear in Waiting for Client, Stale, or P1 — Watch
   Closely, since those fields don't carry their usual support-triage
   meaning on a learning entry (FR-009a).

## Scenario 5 — Empty states vs. load failure (FR-010)

1. Sign in as a Department Head whose granted departments have zero
   Support Ops activity (or temporarily point at a project with none).
2. **Expected**: the Today view loads normally with all four sections
   showing a clear "nothing here" empty state — not an error, not a blank
   gap that looks broken.
3. Simulate a load failure (e.g. block the `today` request via browser
   devtools).
4. **Expected**: a single dashboard-level error is shown — not four
   empty-looking sections that could be mistaken for "nothing's urgent
   today."

## Scenario 6 — Selecting an item opens the existing, unchanged detail experience (FR-008, FR-012)

1. From the Today view, select any item.
2. **Expected**: the same shared issue detail modal used by the existing
   `/support-ops` board opens, including `003-templates-prompt-generator`'s
   client message templates, freeform composer, and troubleshooting packet
   — nothing about them is different when reached from Today.
3. As `depthead@itrack.test`, select an item.
4. **Expected**: the modal opens in view-only mode for edit fields (same
   restriction Department Head already has everywhere else), but the
   Phase 2 generators remain usable (generating text is not a write to the
   issue — unchanged from `003-templates-prompt-generator`'s FR-010).
5. Confirm the Today view's own page has no inline edit controls anywhere
   outside this modal (FR-012).

## Regression check

- Run backend tests: `cd backend && php artisan test` — all existing tests
  plus the new `SupportOpsTodayTest` must pass.
- Manually confirm the existing `/support-ops` board, Kanban Board, Work
  Program, Schedule, and Reports views are unchanged.
- Confirm `npm run build` and `npm run lint` remain clean (no new frontend
  dependency was introduced).
