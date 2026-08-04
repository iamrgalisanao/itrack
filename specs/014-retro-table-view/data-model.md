# Phase 1 Data Model: Retrospective Table View

This feature changes one existing entity and introduces one derived
(non-persisted) view. No new tables.

## RetroEntry (existing, from 013-sprint-retrospectives — extended)

| Field | Type | Notes |
|---|---|---|
| id | bigint | unchanged |
| retro_session_id | FK → retro_sessions, cascade | unchanged |
| author_user_id | FK → users | unchanged |
| body | text | unchanged |
| **sentiment** | **string, nullable, one of `RetroEntry::SENTIMENTS` when set** | **changed** — was required-not-null; now nullable, since Type is assigned via the table after creation, not required at creation (FR-018/FR-019, research.md D7) |
| owner_user_id | FK → users, nullable, nullOnDelete | unchanged |
| **is_repeating** | **boolean, default `false`** | **new** — set only via the same author-or-Admin/PM check that governs `body`/`sentiment` edits (not the broader owner-assignment check) |
| created_at / updated_at | timestamps | unchanged |

### Migration

```php
// backend/database/migrations/<timestamp>_add_is_repeating_to_retro_entries_table.php
Schema::table('retro_entries', function (Blueprint $table) {
    // Defaults false — matches the client_visible precedent
    // (2026_06_25_014400_add_client_visible_to_detailed_activities_table.php):
    // existing rows are not-repeating until a human explicitly flags them.
    $table->boolean('is_repeating')->default(false)->after('sentiment');
});
```

Reversible via `dropColumn('is_repeating')` in `down()`.

### Migration: `sentiment` becomes nullable

```php
// backend/database/migrations/<timestamp>_make_sentiment_nullable_on_retro_entries_table.php
Schema::table('retro_entries', function (Blueprint $table) {
    // Widening constraint, not destructive — no existing NOT-NULL sentiment
    // values are altered or lost. New entries may now be created with no
    // Type; Type is assigned later via the table (FR-018/FR-019).
    $table->string('sentiment')->nullable()->change();
});
```

`down()` reverts to `->nullable(false)->change()`. Per Constitution
Principle V's callout requirement for changes to an existing column's
meaning: this is a widening (relaxing), not narrowing, change — no data
loss, no backfill required, and existing rows (all of which already have a
non-null `sentiment` from 013/014 Phase 1–7) are unaffected either way.
Laravel 13's `->change()` alters columns natively (no `doctrine/dbal`
dependency required, confirmed absent from `composer.lock`).

### Model change

`App\Models\RetroEntry::$fillable` gains `'is_repeating'` (explicit
fillable list, not `$guarded = []` — `laravel-best-practices`
`sec-mass-assignment`).

### Validation rule (in `RetrospectiveController::updateEntry()`)

- `is_repeating` — `sometimes|boolean`
- Applied under the existing `$isAuthorOrModerator` gate alongside `body`
  and `sentiment` (see contracts/retrospectives-api.md for the exact
  branch this joins).

## RetroEntryResource (existing — extended)

Adds one field:

```php
'is_repeating' => (bool) $this->is_repeating,
```

Placed alongside the existing `sentiment` field, matching the migration's
column position.

## RetroSession (existing, from 013-sprint-retrospectives — gains an update path)

No schema change — `label` already exists and is already a plain string
column. What's new is a controller action that can change it after
creation.

### New endpoint: `PATCH /retro-sessions/{id}`

- **Auth**: `canWrite()` + `hasProjectAccess()` — same gate as
  `storeSession()` (research.md D8) — not restricted to the session's
  `created_by_user_id`.
- **Body**: `{ "label": string (required, max:255) }`.
- **Success (200)**: updated `RetroSessionResource`.
- **No audit log call** — renaming session-level metadata is not a
  sensitive mutation in the sense Constitution Principle IV means (no
  access/role/ownership change), consistent with how `body`/`sentiment`
  edits on entries are also not audited.

## Session Vote Summary (new — derived, not persisted)

Not an Eloquent model or table. A plain array computed inside
`RetrospectiveController::showSession()` from the session's existing
`RetroEntryVote` rows, added as a new top-level key in that endpoint's
existing manually-built JSON response (`{session, entries}` →
`{session, entries, vote_summary}`).

| Field | Type | Computation |
|---|---|---|
| total_votes | integer | `RetroEntryVote::whereIn('retro_entry_id', $entryIds)->count()` |
| total_voters | integer | `RetroEntryVote::whereIn('retro_entry_id', $entryIds)->distinct('user_id')->count('user_id')` |

Both queries scoped to `$entryIds = $retroSession->entries()->pluck('id')`,
computed once per `showSession()` call — one additional query pair per
request, not per entry (see research.md D4 and the Coding-Standard
Constraints in plan.md for the N+1-avoidance requirement this satisfies).

## Entities explicitly NOT introduced

- No `retro_groups` table — the retro Session already serves as the group;
  Type (`RetroEntry::SENTIMENTS`) is a per-row column, not a grouping
  concept (research.md D1, revised).
- No `retro_columns` / custom-field table — table columns are fixed-schema
  per spec FR-005.
- No stored vote-count or voter-count column anywhere — both are derived at
  read time (research.md D4, matching 013's existing `vote_count` /
  `voted_by_me` pattern on `RetroEntryResource`).
- No stored repeating-tally column — computed client-side from the already-
  fetched entry list (research.md D6, spec FR-014).
