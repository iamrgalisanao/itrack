# Contract: Retrospective Table View (delta over 013-sprint-retrospectives)

Base contract: [`specs/013-sprint-retrospectives/contracts/retrospectives-api.md`](../../013-sprint-retrospectives/contracts/retrospectives-api.md).

**Revision note**: this contract was extended a second time after initial
implementation (Phase 8 in tasks.md) to add `PATCH /api/retro-sessions/{id}`
and to make `sentiment` optional at creation — both driven by reference
material reviewed after Phase 1–7 shipped. All role gates, project-scoping,
and denial behavior from the base contract carry over unchanged; the new
endpoint reuses `storeSession()`'s existing gate exactly.

## `GET /api/retro-sessions/{id}` — response gains `vote_summary`

- **Auth**: unchanged (`canView()` + project-scoped).
- **Success (200)**, new shape:

  ```json
  {
    "session": { "...RetroSessionResource" },
    "entries": [ "...RetroEntryResource (now includes is_repeating)" ],
    "vote_summary": { "total_votes": 5, "total_voters": 3 }
  }
  ```

- `vote_summary` is always present, even when the session has zero entries
  or zero votes (`{ "total_votes": 0, "total_voters": 0 }`, never omitted
  or `null` — spec Acceptance Scenario 2, User Story 3).
- Computed with two aggregate queries scoped to the session's entry IDs
  (`total_votes` = count of vote rows; `total_voters` = count of distinct
  `user_id` among those rows) — not per-entry queries (data-model.md,
  research.md D4).
- Visible to every role that can already reach this endpoint, including
  Department Head (view-only — sees the summary but cannot vote,
  matching FR-011).

## `RetroEntryResource` — gains `is_repeating`

Every endpoint in the base contract that returns a `RetroEntryResource`
(`storeEntry`, `updateEntry`, and the `entries` array inside
`showSession`) now includes:

```json
{ "is_repeating": false }
```

alongside the existing `sentiment` field. Defaults to `false` for entries
created before this feature shipped (migration default) and for newly
created entries (not settable at creation time — see below).

## `PATCH /api/retro-entries/{id}` — accepts `is_repeating`

- **Auth**: unchanged base rule, with `is_repeating` explicitly added to
  the **author-or-Admin/PM-only** branch — the same branch that already
  gates `body` and `sentiment`, NOT the broader owner-assignment branch
  that any `canWrite()` project member may use.
  - A `canWrite()` Team Member who is neither the entry's author nor an
    Admin/PM and sends `is_repeating` in the request body gets `403`,
    identical to sending `body` or `sentiment` under the same condition.
  - The existing project-access re-check (base contract's FR-007 callout:
    an author who has lost project access is denied even though
    `author_user_id` still matches) applies identically here — no separate
    or weaker check is introduced for this field.
- **Body** (all optional, at least one required — extends the base
  contract's list): `{ "body"?: string, "sentiment"?: string, "owner_user_id"?: int|null, "is_repeating"?: boolean }`.
- **Success (200)**: updated `RetroEntryResource`, now including
  `is_repeating`.
- **No new audit-log call** — `is_repeating` is a content characterization
  of the entry (like `body`/`sentiment`), not a responsibility-tracking
  action like `owner_user_id`; it follows `body`/`sentiment`'s existing
  no-audit precedent, not `owner_user_id`'s `AuditLogger::record()` call.

## `POST /api/retro-sessions/{id}/entries` — `sentiment` is now optional

- **Auth**: unchanged (`canWrite()` + project-scoped).
- **Body**: `{ "body": string (required), "sentiment"?: string (optional, in: keep,improve,discuss when present) }` —
  supersedes the base contract's `sentiment` requirement (base contract:
  `required`). `is_repeating` is still not settable at creation — every new
  entry starts as `false` (unchanged from Phase 1–7) and is toggled
  afterward via `PATCH`.
- **Success (201)**: `RetroEntryResource`, `sentiment` is `null` when
  omitted (spec FR-018).
- The frontend "Add Entry" form no longer sends `sentiment` at all — Type
  is assigned afterward via the table's Type cell, not at creation
  (spec User Story 5).

## `PATCH /api/retro-sessions/{id}` — new endpoint, renames a session

- **Auth**: `canWrite()` + `hasProjectAccess()` on the session's
  `project_id` — the exact gate `storeSession()` already uses. Not
  restricted to the session's `created_by_user_id` (spec FR-016,
  research.md D8).
- **Body**: `{ "label": string (required, max:255) }`.
- **Success (200)**: updated `RetroSessionResource`.
- **Failure (422)**: empty/whitespace-only or over-length `label` — prior
  label unchanged (spec FR-017).
- **No audit-log call** — session rename is metadata management, not a
  Constitution Principle IV-sensitive mutation, consistent with entries'
  `body`/`sentiment` edits also not being audited.

## `POST /api/retro-sessions` — unaffected, but frontend calling pattern changes

- **Auth/Body**: unchanged from the base contract (`project_id`, `label`
  both still required by the endpoint itself — this contract does not
  relax `storeSession()`'s own validation).
- **What changes is only how the frontend calls it**: clicking "New
  Session" now calls this endpoint immediately with a fixed default label
  (`"New Session"`, research.md D9) instead of opening a form that collects
  a label from the user first. The endpoint itself has no way to
  distinguish a user-chosen label from the frontend's default — both are
  just strings satisfying the same `required|string|max:255` rule.

## Frontend call sites

`frontend/src/lib/api.js`'s existing `updateRetroEntry(id, patch)` already
accepts an arbitrary patch object and needs no signature change — callers
pass `{ is_repeating: true }` (or `false`) or `{ sentiment: 'improve' }`
alongside/instead of the existing `body`/`sentiment`/`owner_user_id` keys.
New: `updateRetroSession(id, label)` — `PATCH /retro-sessions/${id}` with
`{ label }`, added for the rename action (Phase 8).
