# Phase 1 Data Model: Daily Operating Dashboard (Support Ops Phase 3)

**No new tables. No new columns. No migration.** This feature reads existing
`DetailedActivity`/`Project` fields across every project the signed-in user
has access to (via `Project::accessibleTo($user)`, already used by
`ReportController`) and returns them pre-classified into four sections.
Nothing is written anywhere — this is a GET endpoint only.

## Source data (existing fields, no changes)

Read via the existing hierarchy chain `DetailedActivity → subActivity →
activity → module → project` (each model relationship already exists; see
research.md). Two distinct field sets matter here, and they are not the
same list:

- **Classification-input fields** — the minimal set `SupportOpsStaleness`/
  `SupportOpsTodayClassifier` actually read to decide an issue's section:
  `work_type`, `status`, `client_priority`, `last_client_update_at`,
  `created_at`. Nothing else influences the algorithm below.
- **Response-output fields** — the full field set returned to the frontend,
  which is strictly larger: every field `SupportIssueResource` already
  exposes (`id`, `name`, `work_type`, `status`, `client_name`,
  `tenant_name`, `channel`, `client_priority`, `last_client_update_at`,
  `next_action`, `evidence`, `root_cause`, `resolution`, `description`,
  `progress`, `responsible`, `client_visible`, `created_at`, `updated_at`),
  plus the project label and, for stale items, `overdue_since` (see
  Response shape below). This is the larger set because each selected item
  is passed directly as `TaskDetailModal`'s `task` prop (matching how
  `SupportOps.jsx`'s existing board already works) — the modal needs every
  field it would need on the existing board, not just the handful the
  classifier consumes.

Newly read (not newly added) for this feature specifically: the project
each issue belongs to, via the same hierarchy chain, for the project-label
requirement (FR-007).

**Query-level narrowing**: regardless of classification, an issue with
`status == 'completed'` can never land in any of the four sections — Waiting
for Client requires `blocked`/`delayed`, Stale/P1-watch-closely both
explicitly skip `completed` issues, and Learning Priorities explicitly
excludes `completed` entries (FR-006). Given that, the query itself excludes
`status = 'completed'` at the database level (`whereNot('status', 'completed')`
alongside the existing `work_type` filter) rather than loading completed
issues just to discard them in PHP afterward. This is a correctness-preserving
optimization — it changes nothing about which issues end up in which
section, it just avoids loading and iterating rows that the classification
algorithm would exclude anyway.

## Classification algorithm (server-side, per FR-003's "computed once" requirement)

For every `DetailedActivity` with `work_type` in `['support', 'learning']`
across accessible projects, in this exact order (matching FR-009/FR-009a's
precedence, encoded as sequential exclusive checks — see research.md):

```text
1. If work_type == 'learning':
     if status != 'completed': → Learning Priorities section
     else: excluded entirely (FR-006, US3 Acceptance Scenario 2)
     (never evaluated against any rule below — FR-009a)

2. Else (work_type == 'support'):
   a. If status in ['blocked', 'delayed']: → Waiting for Client section
   b. Else if staleness(issue) == 'stale': → Stale section
   c. Else if client_priority == 'P1': → P1 — Watch Closely section
   d. Else: excluded (not urgent by any of this dashboard's criteria)
```

Each issue lands in **at most one** section, by construction — no
post-hoc deduplication pass is needed (research.md's decision).

## `staleness(issue)` — ported from `SupportOps.jsx`'s existing algorithm

Server-side equivalent of the frontend's `getStalenessState()`/
`addOneBusinessDay()`, using Carbon (verified equivalent — see research.md):

| `client_priority` | Stale when... |
|---|---|
| `P1` | `now - reference >= 1 hour` |
| `P2` | `now - reference >= 4 hours` |
| `P3` | `now >= reference->copy()->addWeekday()` (Carbon's built-in "next business day," skips Sat/Sun) |
| unset / null | Never "stale" for this dashboard's purposes — excluded from both Stale and P1-watch-closely (there's no priority to key a threshold off of) |

Where `reference = last_client_update_at ?? created_at` (same fallback as
the existing frontend algorithm — "no explicit update yet, clock starts
from when the issue was logged"). A `completed`-status issue is never
staleness-checked at all (matches the frontend's existing "Resolved issues
are never flagged" rule) — moot in practice here since Waiting for Client
already only matches `blocked`/`delayed`, but the same short-circuit is
kept for parity with the existing algorithm.

## Stale-section sort order (FR-003: "most overdue first")

Sort key: `overdue_duration = now - (reference + threshold_for_priority)` —
i.e. how far *past* the threshold each issue is, not raw elapsed time. This
lets a P3 issue overdue by 3 days and a P1 issue overdue by 10 minutes both
sort meaningfully by the same "how late is this, relative to its own bar"
measure, descending (most overdue first).

## Response shape (per `contracts/today-dashboard-api.md`)

```json
{
  "stale": [ { ...issue fields..., "project": { "id": 1, "name": "Acme Rollout" }, "overdue_since": "2026-07-23T02:00:00+00:00" } ],
  "watch_closely": [ { ...issue fields..., "project": {...} } ],
  "waiting_for_client": [ { ...issue fields..., "project": {...} } ],
  "learning_priorities": [ { ...issue fields..., "project": {...} } ],
  "generated_at": "2026-07-23T09:00:00+00:00"
}
```

Each item is a new `TodaySupportIssueResource` — the same field set as the
existing `SupportIssueResource`, plus a nested `project` object (`id`,
`name`) per FR-007. This is new code, so per Constitution Principle II it
uses a proper API Resource rather than a raw array — the top-level
four-section wrapper is a curated array (matching the precedent of
`AuthController::curatedUser()` for a hand-composed, non-model response),
not itself a Resource.

## State transitions

None. Every field this feature reads already exists and is already written
by other, existing code paths (issue create/update, "Record client update
now"). This feature has no write path of its own.
