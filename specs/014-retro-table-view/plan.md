# Implementation Plan: Retrospective Table View

**Branch**: `014-retro-table-view` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-retro-table-view/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Rework the Retrospectives session view (`013-sprint-retrospectives`) from
three side-by-side Kanban lanes into a single collapsible table per session
(the session is the only grouping concept — no sentiment-based sub-tables),
with fixed columns (Feedback, Submitter, Type, Repeating?, Vote, Owner) and
Type shown as a per-row color-coded value rather than a grouping axis. Add
one new persisted attribute (`is_repeating` boolean on `retro_entries`,
editable under the same author-or-Admin/PM rule that already governs
body/sentiment edits) and two new read-time-computed footer values: a
session-level vote-totals summary (total votes, total distinct voters,
computed server-side from `retro_entry_votes`) and a repeating tally
(count of Repeating entries out of the session's total, computed
client-side from the already-fetched entry list — no extra query). No new
entities, no new roles, no change to 013's access-control surface — this is
additive to an existing feature.

**Correction note (post-plan)**: the original plan and its Phase 1 output
described three collapsible sentiment groups per session. Reference mockups
supplied after initial implementation showed the grouping axis is the
Session itself (matching 013's existing Session entity 1:1), with Type as
an ordinary per-row column — not a splitting mechanism. This plan, along
with data-model.md/contracts/quickstart.md, has been amended accordingly;
the corrected layout is what `/speckit-tasks` and the implementation now
target.

## Technical Context

**Language/Version**: PHP 8.3 (backend, detected from `backend/composer.json` `"php": "^8.3"` — do not use PHP 8.4-only syntax such as property hooks or asymmetric visibility); JavaScript (frontend — no TypeScript present: no `typescript` package, no `tsconfig.json`, no `.ts`/`.tsx` files under `frontend/src`, confirmed by repository scan)

**Primary Dependencies**: Laravel 13.8 (`laravel/framework: ^13.8`, detected from `backend/composer.json` — Laravel 13 APIs are available), Laravel Sanctum 4.0 (session auth, unchanged), React 19.2 / Vite 8 / Tailwind v4 (`frontend/package.json`), existing shadcn/Radix primitives in `frontend/src/components/ui/` — `table.jsx` is already used elsewhere (`WorkProgram.jsx`, `Admin.jsx`, `Team.jsx`, `Glossary.jsx`); `collapsible.jsx` existed as a scaffolded file with no consumers and no installed peer dependency (`@radix-ui/react-collapsible` was missing from `package.json`) — this feature is its first real consumer and installs the one missing package, consistent with the other ~10 already-adopted `@radix-ui/*` packages rather than introducing an unrelated new library

**Storage**: MySQL via existing `retro_entries` / `retro_entry_votes` tables from 013-sprint-retrospectives — one additive column (`is_repeating`), no new tables

**Testing**: PHPUnit 12 (`phpunit/phpunit: ^12.5.12` in `backend/composer.json`, no `pestphp/pest` present → PHPUnit syntax, matching the existing `RetrospectivesTest.php` from 013), manual browser verification for the frontend (project's established practice, no frontend test runner configured)

**Target Platform**: Existing iTrack web app (internal roles only for this surface)

**Project Type**: Web application (Laravel API backend + React SPA frontend, existing structure — no new project)

**Performance Goals**: No dedicated performance target beyond the existing page — the vote-totals summary is a single additional aggregate query per session-detail request, not per-entry, so it must not turn into an N+1 (see Coding-Standard Constraints)

**Constraints**: Additive-only migration (Constitution Principle V); no change to 013's role/permission surface (Constitution Principle I); table columns are fixed-schema, no user-defined/custom columns (spec FR-005)

**Scale/Scope**: Same scale as 013 — one project's retro sessions at a time, typically low tens of entries per session

### Coding-Standard Constraints

Derived from the installed skills (`php-best-practices`, `laravel-best-practices`, `react-vite-best-practices`, `typescript-react-patterns`, `laravel-testing`, `laravel-owasp-security`, `code-slop`), applied to this feature's actual surface — not a restatement of the skills:

- **`laravel-best-practices` / `eloquent-eager-loading`**: the vote-totals summary MUST be computed with a single aggregate query against `retro_entry_votes` scoped to the session's entry IDs (e.g. `whereIn('retro_entry_id', $entryIds)`), not by iterating `$entries` and calling `->votes()->count()` per entry — `RetroEntryResource` already does per-entry counts for the table's Vote column, so the summary must not duplicate that work with an additional N+1 pass.
- **`laravel-best-practices` / `sec-mass-assignment`**: `is_repeating` MUST be added to `RetroEntry::$fillable` explicitly (matching the existing explicit-fillable pattern already used for `owner_user_id`) — never widen to `$guarded = []`.
- **`php-best-practices` / `type-return-types`, `type-parameter-types`**: any new private helper method on `RetrospectiveController` (e.g. a vote-summary calculator) MUST declare parameter and return types, matching the existing typed-method style already used throughout the controller (`private function hasProjectAccess(User $user, int $projectId): bool`).
- **`laravel-owasp-security` / Broken Access Control (A01)**: toggling `is_repeating` MUST go through the exact same `$isAuthorOrModerator` check `updateEntry()` already applies to `body`/`sentiment` — it must not be reachable via the looser `owner_user_id`-style check (any `canWrite()` user), since that would let a non-author, non-Admin/PM Team Member alter someone else's entry. This is a direct instance of A01 broken access control if missed.
- **`laravel-owasp-security` / Broken Access Control (A01)**: the vote-totals summary endpoint path (the existing `showSession()`) MUST keep its current `canView()` + `hasProjectAccess()` re-check — the new response field is not a new route, so it inherits the existing gate, but the plan must confirm no new unguarded route is introduced for it.
- **`react-vite-best-practices` / `split-component-lazy`**: not applicable at this scope — the table rework is a change to an already-lazy-loaded route-level page (`Retrospectives.jsx`), not a new heavy dependency; no new code-splitting boundary is needed.
- **`typescript-react-patterns`**: not actively enforced — the frontend has no TypeScript today (see Technical Context). Applied prospectively only: new props for the table/group components are documented with JSDoc-style shape comments in the same convention already used in `Retrospectives.jsx`, so a future TS migration has a clear typing target.
- **`code-slop` / `naming-generic-placeholders`, `over-eng-premature-interface`**: the table rendering MUST reuse the existing `SENTIMENTS` constant (for the Type column's per-row color/label lookup) and inline render logic already in `Retrospectives.jsx` rather than introducing a new abstraction layer (e.g. a generic "BoardColumn" or "GroupedTable" component) for what remains a single table per session.
- **`code-slop` / `over-eng-dependency-creep`**: the repeating tally (FR-014) MUST be computed client-side from the entry list already loaded to render the table (`entries.filter(e => e.is_repeating).length` over `entries.length`) — it must not become a third backend-computed field alongside `vote_summary` when no additional query is needed to produce it.
- **`laravel-testing` / `http-test-structure`, `db-assert-has`**: new PHPUnit tests follow the existing `RetrospectivesTest.php` Arrange/Act/Assert shape and `assertDatabaseHas`/`assertJsonPath` conventions already established in that file — no new testing pattern introduced.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Fail-Closed Access Control | PASS — reuses 013's existing `canView()`/`canWrite()`/`hasProjectAccess()` gates unchanged; `is_repeating` toggle explicitly routed through the same author-or-Admin/PM check as body/sentiment, not a new/looser check. |
| II. Consistent API Contracts | PASS — `is_repeating` added to `RetroEntryResource`; vote summary added as a new key in `showSession()`'s existing manually-built response array (not a raw model). |
| III. Test Coverage Grows With the Feature | PASS — plan requires new PHPUnit tests for the repeating-flag permission boundary and the vote-summary computation before this is done (see Phase 1 test requirements below). |
| IV. Audit Sensitive Mutations | PASS — `is_repeating` toggles are not independently security-sensitive (no access/role change), consistent with how 013 did not audit-log `body`/`sentiment` edits either; owner reassignment's existing audit log is untouched. |
| V. Small, Additive, Reversible Migrations | PASS — one additive, defaulted, nullable-equivalent boolean column (`default(false)`), one concern, matches the `client_visible` precedent exactly. |
| VI. Real Auth Is the Only Forward Path | PASS — no frontend auth/identity change; continues using `useEffectiveUser()`. |
| VII. Installed Coding-Standard Skills Govern Implementation | PASS — see Coding-Standard Constraints above. |
| VIII. Definition-of-Done Gate | PASS — the 8 skill-derived test cases (research.md), the authorization/tenant-isolation/OWASP/code-slop review steps (quickstart.md's Validation tasks) are concretely specified, not deferred; `/speckit-tasks` has explicit test and validation tasks to generate from them. |

No violations. Complexity Tracking is not needed.

**Post-Phase-1 re-check**: Confirmed after generating data-model.md,
contracts/, and quickstart.md — no new entity, endpoint, or role was
introduced beyond what this table already accounts for. All eight rows
still PASS; no Complexity Tracking entry required.

## Project Structure

### Documentation (this feature)

```text
specs/014-retro-table-view/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── database/migrations/
│   └── <timestamp>_add_is_repeating_to_retro_entries_table.php   # new, additive
├── app/
│   ├── Models/
│   │   └── RetroEntry.php                    # add is_repeating to $fillable
│   ├── Http/
│   │   ├── Resources/
│   │   │   └── RetroEntryResource.php        # add is_repeating field
│   │   └── Controllers/
│   │       └── RetrospectiveController.php   # updateEntry() accepts is_repeating under
│   │                                          # existing $isAuthorOrModerator check;
│   │                                          # showSession() adds vote_summary
└── tests/Feature/
    └── RetrospectivesTest.php                # extend with new cases (no new file)

frontend/src/
├── pages/
│   └── Retrospectives.jsx    # replace 3-lane grid with one collapsible table per session;
│                              # Type becomes a per-row column; add Repeating? column + toggle;
│                              # add footer (vote summary + client-computed repeating tally)
├── components/ui/
│   ├── table.jsx              # existing primitive, reused
│   └── collapsible.jsx        # existing file, first real consumer (see Primary Dependencies)
└── lib/
    └── api.js                 # updateRetroEntry already supports arbitrary patch fields
                                 # (no new function needed) — confirm no change required

frontend/package.json           # +@radix-ui/react-collapsible (collapsible.jsx's missing peer dep)
```

**Structure Decision**: Single existing web application structure (`backend/` Laravel API +
`frontend/` React SPA), unchanged from 013-sprint-retrospectives. No new
top-level directories, no new frontend dependency, no new backend package.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

No violations — table intentionally omitted.
