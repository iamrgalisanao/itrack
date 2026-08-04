# Phase 0 Research: Sprint Retrospectives

## Decision 1: Toggleable voting — a join table with a unique constraint, not a counter column

**Decision**: `retro_entry_votes` is a plain join table (`retro_entry_id`, `user_id`, timestamps) with a unique constraint on `(retro_entry_id, user_id)`. Voting is `firstOrCreate` (creates the row); un-voting is a `delete()` on that same row. The vote count exposed to the frontend is `retroEntry->votes()->count()`, computed at read time — never a separately stored counter that could drift from reality.

**Rationale**: FR-005 requires the vote to be toggleable and requires "did I vote" to be knowable per viewer, not just an aggregate count. A join table answers both directly (`whereUserId($me)` for the toggle state, `count()` for the total) with one source of truth. A stored counter column would need to be kept in sync on every vote/un-vote and creates exactly the kind of double-bookkeeping bug class the codebase's other progress/duration fields were deliberately moved away from (per this session's own Work Program UX work computing duration server-side rather than trusting a stored value).

**Alternatives considered**:
- *A `votes_count` integer column on `retro_entries`, incremented/decremented in the controller*: rejected — two sources of truth, and nothing enforces one-vote-per-user without a join table anyway, so the join table is needed regardless; the counter column would be pure redundancy.
- *Store voter IDs as a JSON array column on the entry*: rejected — no unique-constraint enforcement, no indexable "has this user voted" query, and out of step with how relationships are modeled everywhere else in this codebase (real foreign-keyed tables, not JSON blobs).

## Decision 2: No session status/lifecycle column in this phase

**Decision**: `retro_sessions` has no `status`, `closed_at`, or similar lifecycle field. A session is simply a row that exists; FR-012 explicitly keeps it open and editable indefinitely in Phase 1.

**Rationale**: Adding a status column now, only to leave every code path treating it as always "open," is exactly the kind of speculative field the constitution's additive-migration principle warns against carrying as unexplained dead weight. If a later phase adds archiving, that's one additive nullable column then — nothing about this phase's schema needs to anticipate it.

**Alternatives considered**:
- *Add a `status` enum now, defaulting to `open`, unused elsewhere*: rejected — adds a column with no behavior attached to it in this phase, purely speculative.

## Decision 3: Sentiment as a fixed enum, not a free-text tag

**Decision**: `retro_entries.sentiment` is a validated enum (`keep`, `improve`, `discuss`), stored as a plain string column with application-level validation (matching how `detailed_activities.status` and `project_memberships.role` are already handled elsewhere in this codebase — no database-level enum type, validated in the controller/request).

**Rationale**: FR-004 requires exactly one of three fixed categories, not an open vocabulary — matching monday dev's fixed Keep/Improve/Discuss set (`docs/research/monday-dev-sprints.md`). A free-text tag would let entries drift into inconsistent, uncategorizable labels, defeating the entire point of sentiment-based grouping (User Story 2).

**Alternatives considered**:
- *A separate `retro_sentiments` lookup table*: rejected — three fixed, non-user-editable values don't need a managed table; this mirrors how the existing `ProjectMembership::ROLE_*` and `DetailedActivity` status constants are handled as PHP-level constants, not database-driven lookups.

## Open Questions Resolved

None remain — the spec shipped with zero `[NEEDS CLARIFICATION]` markers, and the three decisions above cover every technical unknown identified while filling in the plan's Technical Context.
