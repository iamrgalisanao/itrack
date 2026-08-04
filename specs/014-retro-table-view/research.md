# Phase 0 Research: Retrospective Table View

No `[NEEDS CLARIFICATION]` markers remained in spec.md — the feature
description already resolved scope, permission, and computation-model
questions. This document records the concrete decisions carried into
Phase 1, and the skill-derived test requirements that feed `/speckit-tasks`.

## Decisions

### D1 (revised): The Session is the group; Type is a per-row column, not a grouping axis

- **Original decision (superseded)**: This document originally proposed
  three collapsible groups mapped 1:1 to `RetroEntry::SENTIMENTS`
  (`keep`/`improve`/`discuss`), with Type implied by which sub-table a row
  sat in.
- **Why revised**: reference mockups supplied after the initial
  implementation showed monday.com's actual grouping axis is a named,
  arbitrary "Group" — and within one group, entries of every Type sit
  together in a single table, with Type rendered as an ordinary per-row
  colored value. Splitting by sentiment was an interpretation made before
  seeing the reference, not something the original feature description
  required.
- **Revised decision**: The retro Session (013's existing entity) *is* the
  group — creating a session already creates a new named table, matching
  monday.com's "create a group" action exactly. One collapsible table
  renders per session (the currently-selected one, via 013's existing pill
  switcher — no change to that switcher), containing every entry regardless
  of Type. Type is shown as a per-row color-coded value sourced from the
  same `RetroEntry::SENTIMENTS` constant, not a table-splitting mechanism.
  No new "group" entity or user-configurable grouping is introduced.
- **Rationale**: spec FR-005 still excludes a generic custom-column/
  custom-group *creation* feature ("this is not a board-customization
  engine") — reusing the existing Session entity as the group satisfies the
  reference UI's structure without adding that capability. Introducing a
  separate `retro_groups` concept alongside Session would be a real
  duplicate entity for the same thing.
- **Alternatives considered**: A generic `retro_groups` table mirroring
  monday.com's board-customization model, independent of Session — rejected
  as a duplicate concept (Session already serves this role) and as
  contradicting Constitution Principle V (migrations should match an actual
  near-term need, not speculative generality). Stacking every session on
  one page as multiple simultaneous groups (removing the pill switcher) —
  considered and explicitly deferred by the user in favor of keeping the
  existing switcher; the single currently-selected session is the one
  table shown.

### D2: `is_repeating` is a plain boolean column, not a lookup/enum

- **Decision**: `retro_entries.is_repeating boolean default(false)`, added
  to `RetroEntry::$fillable` and `RetroEntryResource`.
- **Rationale**: It is a two-state human-set flag (spec FR-006/FR-013,
  explicitly not automated trend detection). A boolean is the smallest
  correct representation; an enum or separate lookup table would be
  over-engineering for a yes/no flag (`code-slop` `over-eng-premature-
  interface`).
- **Alternatives considered**: A `repeat_count` integer or a
  `related_entry_id` self-reference (linking to a prior "original" entry) —
  both rejected as out of scope; spec explicitly rules out any
  cross-session comparison or automated linkage.

### D3: `is_repeating` reuses the existing author-or-Admin/PM edit check

- **Decision**: In `RetrospectiveController::updateEntry()`, `is_repeating`
  is validated and applied under the exact same `$isAuthorOrModerator`
  branch that already gates `body`/`sentiment`, not the separate, broader
  `owner_user_id` branch (which any `canWrite()` user with project access
  may set).
- **Rationale**: spec FR-007 explicitly ties Repeating-toggle permission to
  "the existing author-or-Admin/PM edit permission from 013, FR-007" — this
  is a deliberate reuse of an established boundary, not a new one. It is
  also the OWASP-correct choice: broadening it to any `canWrite()` user
  would let a Team Member alter a fact-of-record on someone else's entry
  they don't own (`laravel-owasp-security` A01, Broken Access Control).
- **Alternatives considered**: Letting any `canWrite()` project member
  toggle Repeating (same rule as owner assignment) — rejected because
  Repeating characterizes the *content* of someone else's entry (like
  editing its body/sentiment), unlike owner assignment which is a
  *follow-up* delegation any team member can propose.

### D4: Vote totals computed at read time from `retro_entry_votes`, no stored counter

- **Decision**: `showSession()` computes `vote_summary.total_votes` and
  `vote_summary.total_voters` with a single aggregate query against
  `RetroEntryVote` scoped to the session's entry IDs, added as a sibling key
  in the existing manually-built `{session, entries}` response — not a new
  route, not a new stored column.
- **Rationale**: spec FR-010 explicitly requires this to match 013's
  join-table voting pattern (no stored counters, to avoid drift). A single
  `whereIn('retro_entry_id', $entryIds)` query keeps it O(1) queries
  regardless of entry count, avoiding the N+1 that a naive
  per-entry-then-sum approach would introduce (`laravel-best-practices`
  `eloquent-eager-loading`).
- **Alternatives considered**: Summing `RetroEntryResource`'s already-
  computed per-entry `vote_count` values in the frontend after the fact —
  rejected because `total_voters` (distinct users) cannot be derived from
  the per-entry counts alone (a user who voted on 3 entries must count once,
  not three times); the backend has direct access to the vote rows and the
  frontend does not.

### D5: Frontend reuses existing `table.jsx` / `collapsible.jsx` primitives

- **Decision**: The single session table is built from the shadcn/Radix
  primitives in `frontend/src/components/ui/table.jsx` (already used in
  `WorkProgram.jsx`, `Admin.jsx`, `Team.jsx`, `Glossary.jsx`) and
  `collapsible.jsx` (present in the codebase but, until this feature, had
  no consumers and no installed peer dependency — `@radix-ui/react-
  collapsible` was missing from `package.json` despite the wrapper file
  existing; this feature installs it, its only change to `package.json`).
- **Rationale**: No new frontend dependency is justified when an existing,
  already-scaffolded primitive does the job once its one missing package is
  installed (`code-slop` `over-eng-dependency-creep`; `react-vite-best-
  practices` — no bundle-size justification for a new table/accordion
  library instead).
- **Alternatives considered**: A dedicated third-party data-grid library
  (e.g. for inline-editable cells) — rejected as disproportionate to a
  fixed six-column, non-reorderable, non-resizable table. Building
  collapse/expand from raw `useState` instead of Radix — rejected in favor
  of finishing the already-half-installed `collapsible.jsx` primitive,
  keeping the interaction pattern consistent with any future collapsible
  use elsewhere in the app.

### D6: Repeating tally is computed client-side, not added as a third backend field

- **Decision**: The footer's "X/N repeating" tally (spec FR-014) is
  computed in `Retrospectives.jsx` from the entry list already fetched to
  render the table (`entries.filter(e => e.is_repeating).length` over
  `entries.length`) — it is not a new backend-computed field alongside
  `vote_summary`.
- **Rationale**: Unlike vote totals (which require joining `retro_entry_
  votes`, data the frontend doesn't have), the repeating tally only needs
  data already present in the `entries` array `showSession()` returns.
  Adding a backend field for something derivable with zero extra queries
  would be needless API surface (`code-slop` `over-eng-dependency-creep`
  applied to backend surface, not just frontend packages).
- **Alternatives considered**: Computing it server-side alongside
  `vote_summary` for symmetry — rejected; symmetry alone isn't a reason to
  add a field, and doing so would contradict FR-010's precedent of
  preferring derivation over new stored/computed surface where the data is
  already available.

### D7: `sentiment` becomes nullable; Type is set later via the table, not at creation

- **Decision**: `retro_entries.sentiment` changes from a required column to
  nullable. `storeEntry()`'s validation drops `required` in favor of
  `nullable`; the "Add Entry" form no longer offers a Type picker at all.
  `updateEntry()`'s existing `sentiment` validation (`sometimes|string|in:
  ...`) is unchanged — Type is still only ever *set* to a real value via
  update, never explicitly cleared back to null once chosen.
- **Rationale**: Reference material (a second monday.com screenshot set)
  showed Type is assigned by clicking the table's Type cell after the fact,
  not chosen in the creation form — mirroring monday's native "status
  column" pattern. This is a genuine workflow correction (FR-018/FR-019),
  not a restyling; it changes what's required to create an entry.
- **Alternatives considered**: Keeping `sentiment` required and defaulting
  new entries to an arbitrary Type (e.g., always "Discuss") until manually
  changed — rejected because a defaulted-but-wrong Type is worse than a
  visibly blank one; it would misrepresent unreviewed feedback as already
  categorized. Adding a 4th enum value like `'unset'` instead of `NULL` —
  rejected as unnecessary; `NULL` already means "no value" and needs no
  new case in `RetroEntry::SENTIMENTS` or the `Rule::in()` check.

### D8: Session rename reuses `canWrite()`, not an author-only rule

- **Decision**: The new `PATCH /retro-sessions/{id}` endpoint is gated by
  the same `canWrite()` + `hasProjectAccess()` check `storeSession()`
  already uses — any write-capable team member with project access can
  rename any session, not only whoever created it.
- **Rationale**: spec FR-016 explicitly calls this out: session naming is
  session-level metadata management, the same category of action as
  creating a session or adding an entry (a team action), not an
  authorship claim like editing an entry's body (`updateEntry()`'s
  `$isAuthorOrModerator` check). Sessions don't have a "moderator" concept
  today — inventing one just for rename would be a new permission model
  for a single field.
- **Alternatives considered**: Restricting rename to the session's
  `created_by_user_id` or to Admin/PM only — rejected; FR-016 explicitly
  requires it not be limited to the creator, and there's no stated reason
  to be stricter than session creation itself.

### D9: Default session name is a fixed string, no uniqueness constraint

- **Decision**: Clicking "New Session" calls `createRetroSession(projectId,
  'New Session')` immediately — a fixed default label, not auto-numbered
  (`'New Session 2'`, etc.) or timestamped.
- **Rationale**: spec's Assumptions section defers the exact default text
  to planning but requires creation never blocks on it; `label` has no
  uniqueness constraint in `data-model.md` (multiple sessions can share a
  name, same as two "Sprint 3" sessions in different projects already
  could under 013). Auto-numbering would require an extra query per
  creation (count existing "New Session*" labels) for a cosmetic-only
  benefit users can achieve by renaming immediately anyway.
- **Alternatives considered**: Server-generated numbered defaults — rejected
  as unnecessary complexity/query cost for a value the user is expected to
  change right away.

## Skill-Derived Test Requirements

These are not implementation tasks themselves; they are the concrete test
cases `/speckit-tasks` must turn into test tasks, per Constitution
Principle III (test coverage grows with the feature) and Principle VIII
(Definition-of-Done Gate: authorization + tenant-isolation checks are
test-verified, not just reviewed).

From `laravel-testing` (HTTP & Feature Tests, Database Assertions):

1. Author toggles their own entry's `is_repeating` → 200, `assertDatabaseHas`
   the new value.
2. Non-author, non-Admin/PM Team Member attempts to toggle another user's
   entry's `is_repeating` → 403, value unchanged in the database.
3. Admin and, separately, Project Manager toggle `is_repeating` on an entry
   they did not author → 200, succeeds (matches existing
   `$isAuthorOrModerator` behavior for body/sentiment).
4. `showSession()` response includes `vote_summary.total_votes` and
   `vote_summary.total_voters` matching a hand-computed expectation from
   seeded vote rows (multiple users, some voting on multiple entries — the
   distinct-voter count must not double count).
5. A session with zero votes returns `vote_summary` as `{total_votes: 0,
   total_voters: 0}`, not a missing/null key (spec Edge Cases,
   Acceptance Scenario 2 of User Story 3).

From `laravel-owasp-security` (Broken Access Control, A01 — this feature's
directly relevant OWASP category since it only touches an existing
authenticated/authorized surface, not auth, crypto, or file handling):

6. Regression-style test proving `is_repeating` cannot be set via the
   `owner_user_id`-style unrestricted path — i.e. a `canWrite()` user with
   project access but who is neither the author nor Admin/PM still gets 403
   when the request body contains `is_repeating` (mirrors 013's own F1/F2
   regression tests for `updateEntry()`).
7. Client-role and unauthenticated requests to `showSession()` continue to
   be denied (no regression in the vote-summary addition) — this is an
   existing 013 test case that must still pass unmodified, confirmed rather
   than assumed.

8. A PATCH containing only `is_repeating` MUST leave the entry's `body`,
   `sentiment`, `owner_user_id`, and vote rows unchanged — assert all four
   still match their pre-toggle values after the request (spec FR-008;
   `speckit-analyze` finding C2). Distinct from cases 1–3 above, which only
   assert the flag itself changed, not that nothing else did.

From `code-slop` (Test slop):

9. New tests must assert actual database/response state (`assertDatabaseHas`,
   `assertJsonPath`), not merely "does not throw" — matching the existing
   `RetrospectivesTest.php` style, avoiding `test-doesnt-throw` slop.

From D6 above — the repeating tally is frontend-only and derived, so it has
no backend test case; its correctness is covered by manual verification
(quickstart.md) confirming the tally matches a hand-count and updates
immediately on toggle, since there is no server response field to assert
against in a PHPUnit test.

From D7/D8 (new capabilities — session rename, nullable Type):

10. An entry created with no `sentiment` in the request body succeeds
    (201) and `RetroEntryResource`'s `sentiment` is `null`, not an error
    and not a default value (FR-018).
11. A user permitted to edit an entry (author, or Admin/PM) sets its
    `sentiment` via `PATCH` from `null` to a valid value → 200, persisted
    (FR-019, reuses `updateEntry()`'s existing `sentiment` validation and
    `$isAuthorOrModerator` gate — no new permission code path, so this is
    a thin regression test, not new authorization surface).
12. A Team Member with `canWrite()` and project access, but who is neither
    the session's creator nor Admin/PM, renames a session via `PATCH
    /retro-sessions/{id}` → 200, succeeds (FR-016, D8 — proves rename is
    not creator-restricted).
13. A user without `canWrite()` (e.g., Department Head) or without project
    access attempts to rename a session → 403 (mirrors `storeSession()`'s
    existing denial tests, same gate reused).
14. Renaming a session to an empty string → 422, existing `label`
    unchanged in the database (FR-017).
