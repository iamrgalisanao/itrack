# Phase 0 Research: Templates and Prompt Generator (Support Ops Phase 2)

No `NEEDS CLARIFICATION` markers exist in the Technical Context. Every
decision below came from reading the actual existing code
(`AuditLogger`, `AuditLog` model/migration, `SupportOpsController`,
`SupportIssueResource`, `TaskDetailModal`, `frontend/src/lib/api.js`) and from
the two clarification answers recorded in `spec.md`, rather than new external
research — this feature builds entirely on infrastructure already delivered
in 002-support-ops-tracker.

## Decision: Templates and the packet are computed entirely client-side; zero schema change

**Rationale**: Every field the seven message templates, the freeform
composer, and the troubleshooting packet need already exists on
`SupportIssueResource` (`client_name`, `tenant_name`, `channel`, `name`,
`client_priority`, `next_action`, `evidence`, `root_cause`, `resolution`,
`description`). Rendering is pure string interpolation over data the open
issue's React state already holds — no new endpoint is needed to *generate*
anything, and no new column is needed to *store* anything (per spec
Assumption "No new persisted fields").

**Alternatives considered**: A backend endpoint that returns pre-rendered
template text — rejected as unnecessary network round-trip latency for
something that's pure string formatting over data the frontend already has
in memory (would work against SC-001/SC-002's <15s targets for no benefit).

## Decision: The audit log write is triggered by *generation*, not by *copy*

**Rationale**: FR-013 requires an audit entry whenever a template/packet/draft
"containing personal information ... is generated" — the moment personal
information is rendered on screen is when the disclosure risk exists,
regardless of whether the user ever clicks Copy afterward. Tying the audit
call to generation (not copy) also means the copy action itself — a
`navigator.clipboard.writeText()` call — has zero network dependency and can
never be delayed or blocked by a logging round-trip, satisfying FR-012's
"MUST NOT block" requirement by construction.

**Alternatives considered**: Logging on copy instead of generation — rejected,
it would miss the case where a user generates a packet, reads the personal
information on screen, and closes the modal without copying (the disclosure
to the screen already happened; RA 10173 accountability should cover that,
not just the copy action). Logging on both generation and copy — rejected as
redundant noise in the audit trail for the same underlying event.

## Decision: Audit call is fire-and-forget from the frontend, never blocking

**Rationale**: `AuditLogger::record()` is currently only ever called
synchronously from within controller actions that are themselves already the
network round-trip (e.g. `task.updated` inside `PUT /detailed-activities/{id}`).
This feature is the first case where the "sensitive event" is a pure frontend
render, not a backend write already in flight — so a *new*, dedicated
backend call is unavoidable to get an audit row written at all. Making that
call block the UI (e.g. disabling Copy until the log call resolves) would
mean a flaky network connection could stop a support agent from
communicating with a client, which is a worse operational outcome than an
occasional missed audit entry. The call fires immediately after generation,
its failure is logged to the console only, and it never gates the Copy
button's availability.

**Alternatives considered**: Blocking/awaiting the log call before showing
the Copy button — rejected per above. Queuing failed log calls for retry in
`localStorage` — rejected as overkill for an internal MVP tool and in tension
with FR-014's "no persistence of any kind" spirit for this feature's
client-side state.

## Decision: One new controller action on the existing `SupportOpsController`, not a new controller

**Rationale**: This is a single-purpose, Support-Ops-specific action
(`generationLog()`) that reuses `SupportOpsController`'s existing
role-gating helper rather than introducing a new controller and duplicating
that check. It follows the same nested-under-the-feature convention 002
already established (`support-ops` as the route prefix for anything specific
to this feature, as opposed to the general-purpose `detailed-activities`
endpoints).

**Alternatives considered**: A new `SupportOpsAuditController` — rejected,
unnecessary indirection for one action; `DetailedActivityController` —
rejected, this action is conceptually specific to the Phase 2 generator
feature, not a general task-update concern.

## Decision: No new frontend dependencies; template content lives in a plain JS module

**Rationale**: `navigator.clipboard.writeText()` is a standard browser API
already usable without any package. The seven templates, the packet format,
and their interpolation logic are pure functions with no React dependency, so
they belong in `frontend/src/lib/supportTemplates.js` (alongside the existing
`frontend/src/lib/api.js`, `frontend/src/lib/utils.js` convention) rather than
inline in `SupportOps.jsx`, keeping the (already large) page component from
growing further and making the template content independently readable/
editable.

**Alternatives considered**: Inlining template strings directly in
`SupportOps.jsx` — rejected, would make an already large file larger and mix
static content with component logic for no benefit.

**Output**: All Technical Context unknowns resolved via direct inspection of
existing code plus the two recorded clarification answers; no
`NEEDS CLARIFICATION` markers remain. Proceeding to Phase 1.
