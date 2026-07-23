# Implementation Plan: Templates and Prompt Generator (Support Ops Phase 2)

**Branch**: `003-templates-prompt-generator` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-templates-prompt-generator/spec.md`

## Summary

Add three copy-only text generators to the existing Support Ops issue detail
view (the `TaskDetailModal` instance rendered by `SupportOps.jsx`): seven fixed
client-message templates, a freeform client-update composer, and an AI
troubleshooting packet — all computed client-side from fields the issue
already has (`SupportIssueResource`), with zero new database columns. The one
piece of new backend surface is a lightweight audit endpoint: because
generating any of these three artifacts surfaces `client_name`/`tenant_name`
on screen (and into whatever the user pastes it into), each generation that
includes personal information is logged via the existing `AuditLogger`
service for Data Privacy Act (RA 10173) accountability — this is a read/log
action, not a mutation of the issue itself. No new npm packages: clipboard
copy uses the standard `navigator.clipboard` Web API already available in the
supported browser matrix.

## Technical Context

**Language/Version**: PHP 8.4 (Laravel 13, unchanged) / JavaScript (ES2022+),
React 19 (unchanged) — same stack as `001-real-auth-cutover` and
`002-support-ops-tracker`

**Primary Dependencies**: None new. Backend reuses `App\Services\AuditLogger`
and the existing `SupportOpsController` role-gating pattern. Frontend reuses
`TaskDetailModal`'s `extraFields(form, setForm)` render-prop slot (already
used by `SupportOps.jsx` for the Phase 1 fields) and the native
`navigator.clipboard.writeText()` browser API — no clipboard library needed.

**Storage**: MySQL. **Zero schema change** — no new tables, no new columns on
`detailed_activities`. All three artifacts read existing `SupportIssueResource`
fields (`client_name`, `tenant_name`, `channel`, `name`, `client_priority`,
`next_action`, `evidence`, `root_cause`, `resolution`, `description`) and
render them into static template strings entirely client-side. The only
persisted write this feature causes is a normal `audit_logs` row via the
existing `AuditLog` table/model — no migration needed, that table already
exists.

**Testing**: PHPUnit Feature test for the one new backend endpoint
(generation-log), covering the full role/response matrix from
`contracts/generation-log-api.md`: 200 for each of Admin, Project Manager,
Team Member, and Department Head (explicitly all four — Team Member and
Department Head are not assumed to behave like the others without a test
each); 403 for Client and for a null/unrecognized role; 401 unauthenticated;
404 for a nonexistent issue id; **404 for a syntactically valid id belonging
to an ordinary Kanban-only task never touched by Support Ops** (the
Support-Ops-scope check is a distinct case from "id doesn't exist at all,"
and needs its own test so the two 404 paths can't silently collapse into
one under-tested branch); 422 for an invalid/missing `artifact_type` or a
`template_stage` sent alongside `artifact_type: draft`/`packet`; **and a
case asserting that calling the endpoint against an issue with both
`client_name` and `tenant_name` blank returns 200 but writes zero new
`audit_logs` rows** (the "logged": true response is intentionally identical
in this case per the contract, so this must be verified by asserting on the
database, not the HTTP response shape); **and an artifact-type-specific
case**: an issue with `client_name` blank but `tenant_name` set, called with
`artifact_type: template` (or `draft`) — MUST write zero rows (tenant is
never part of a template's/draft's output, so it must not trigger logging
just because the issue happens to have one), versus the same issue called
with `artifact_type: packet` — MUST write a row with
`included_tenant_name: true` (the packet does include tenant). These two
sibling assertions are what actually prove the server's inclusion check is
artifact-type-aware rather than a single issue-level check reused across
all three artifact types — required per Constitution Principle III since
this adds backend code, **plus a test for the
snapshot-consistency check**: call the endpoint with a stale `issue_updated_at`
(simulating the issue having been edited between generation and the log
call) against an issue whose *current* `client_name`/`tenant_name` are both
blank, and assert an audit row is still written with
`metadata.snapshot_stale: true` — this is the one case where "both fields
blank" does NOT mean "skip the write," and needs explicit coverage since
it's the inverse of the more obvious happy path. Frontend:
manual verification via `quickstart.md` (no test runner in this repo,
unchanged from 001/002) — template/packet content correctness (including the
description-parsing grammar's blank-on-failure behavior with a deliberately
malformed/unstructured `description`), the privacy notice's presence,
clipboard copy, and the audit-trigger boundary cases (stage-browsing vs.
clicking Generate) are all verified by hand in the browser. In addition,
because `supportTemplates.js` is deliberately pure functions with no React
dependency (research.md), it gets automated unit tests using Node's
**built-in** test runner (`node:test` + `node:assert`, run via
`node --test frontend/src/lib/supportTemplates.test.js`) — no new npm
dependency, covering: all seven template stages with/without `client_name`;
the missing-title substitution; the description-parsing grammar's
case-insensitivity, multi-label, missing-label, and no-structure-at-all
cases; the Timestamp fallback to `created_at`; and the `root_cause`
present/absent addendum behavior. This is the highest-risk logic in the
feature (pure string interpolation bugs are easy to introduce and easy to
silently miss in manual browser testing), so it gets real test coverage
even though the rest of the frontend in this repo does not have a test
runner.

**Target Platform**: Same dev/prod web app as 001/002 — Laravel API at
`localhost:8000`, Vite dev server at `localhost:5173`.

**Project Type**: Web application (backend/ + frontend/, existing structure)

**Performance Goals**: N/A — template/packet rendering is synchronous string
interpolation over data already loaded in the open issue's React state; no
network round-trip gates the on-screen generation (only the background audit
log call touches the network, and it does not block the UI — see FR-012's
"MUST NOT block" requirement).

**Constraints**: Generating or copying MUST NOT alter the issue's persisted
`status` or `last_client_update_at` (FR-009) — the audit log write is the one
sanctioned side effect, and it is a separate `audit_logs` row, never a
`detailed_activities` write. Controls MUST be gated identically to existing
Support Ops view access, enforced at the API level (FR-010) — no new role
logic. The privacy notice (FR-012) MUST be non-blocking. The freeform draft
(FR-014) MUST NOT be persisted anywhere, under any navigation scenario (no
component state surviving unmount, no `localStorage`). Generated text MUST
render as plain text only, never via HTML injection (FR-015). Generators MUST
read from `SupportOps.jsx`'s `selectedIssue` (last-saved data), never from
`TaskDetailModal`'s local `form` state (in-progress unsaved edits) — FR-016.

**Scale/Scope**: 1 new backend endpoint (`POST /support-ops/{id}/generation-log`)
+ 1 new audit action naming convention, 1 new frontend module for static
template content + interpolation (no new page — folds into the existing
`SupportOps.jsx` issue detail render via `TaskDetailModal`'s `extraFields`),
1 new `lib/api.js` client function, 1 new PHPUnit Feature test file, 1 new
`node:test` unit test file for the pure-JS template/parsing logic.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Fail-Closed Access Control | Yes | The new `POST /support-ops/{id}/generation-log` endpoint MUST use the identical inclusion-based check already used by `SupportOpsController::index()` (`isAdmin() \|\| isProjectManager() \|\| isTeamMember() \|\| isDepartmentHead()`) — never a deny-list, and never a new, parallel role check. **PASS**, carried into tasks.md as an explicit design constraint. |
| II. Consistent API Contracts | Yes | The new endpoint returns a minimal curated response (e.g. `{"logged": true}`), never a raw model. It is new code, so it follows this principle from the start, matching `SupportIssueResource`'s precedent set in 002. **PASS**. |
| III. Test Coverage Grows With the Feature | Yes | The new endpoint is new backend surface — it ships with a Feature test covering the full role/response matrix in the same change, per Principle III. Additionally (beyond what Principle III strictly requires, since it's written around backend endpoints), the pure-JS template/parsing logic gets `node:test` unit coverage given how easy string-interpolation bugs are to miss in manual browser testing alone. **PASS**, both required as tasks in tasks.md. |
| IV. Audit Sensitive Mutations | Yes, extended in spirit | This principle is written around mutations (role changes, deletes) — generating a template/packet is a *disclosure* event, not a mutation, but the spec's Clarifications session (2026-07-23) deliberately extends the same accountability mechanism to this new kind of sensitive event (personal information leaving the system) to satisfy RA 10173. This is a considered extension of the principle's intent, not a workaround of it. **PASS**, with the extension noted here for future readers of this plan. |
| V. Small, Additive, Reversible Migrations | Yes (trivially) | **No migration at all** — zero schema change is the strictest possible reading of "small and additive." **PASS**. |
| VI. Real Auth Is the Only Forward Path | Yes | The new endpoint reads `$request->user()->role` via Sanctum session, identically to every other Support Ops endpoint. No parallel identity concept introduced. **PASS**. |

No violations. Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: Design artifacts (data-model.md, contracts/,
quickstart.md) confirm the architecture above — no new entities, no new
columns, and the one new backend touch point (`generation-log`) reuses the
exact role-gating and `AuditLogger` conventions established in 002. Gate
re-evaluation: **PASS**, unchanged from pre-design.

**Correction made during this planning pass**: an initial draft of
plan.md/data-model.md/contracts/quickstart.md was reviewed before
`/speckit-tasks`, which surfaced five gaps serious enough to fix in `spec.md`
itself rather than only in the design docs: (1) the troubleshooting packet's
field mapping was underspecified — `root_cause` had no destination slot,
"Timestamp" was undefined, and "Provider/client" was ambiguous; all three are
now pinned down precisely in data-model.md, with `root_cause` becoming an
optional addendum line (FR-006) rather than a dropped input. (2) Parsing
failure behavior for the `description`-derived fields (missing/malformed
labels, unstructured prose) was unspecified; a precise, case-insensitive
parsing grammar with defined blank-on-failure behavior is now in
data-model.md and referenced from FR-007. (3) The audit trigger ("when a
generation happens") was ambiguous enough that stage-browsing, editing, and
re-opening could each plausibly log an entry; FR-013 now defines the trigger
as an explicit "Generate" click only, with every other interaction
explicitly excluded. (4) "Generation is not a write" was true but incomplete
— FR-009 now states precisely which persisted fields cannot change, and
separately acknowledges the one sanctioned side effect (the audit row) so
the two aren't conflated. (5) Team Member and direct-API-level authorization
had no explicit coverage; the generation-log contract now states the full
role/response matrix and FR-010 requires API-level (not just UI-level)
enforcement. A new FR-015 (safe plain-text rendering, no HTML injection of
issue-derived values) was also added, since none of the User Story
descriptions had previously ruled it out explicitly.

**Second correction made during this planning pass**: a further review found
five more gaps. (1) The generation-log endpoint's contract had the frontend
send `included_client_name`/`included_tenant_name` booleans that the server
simply trusted — a real trust-boundary problem for a compliance feature,
since a buggy or malicious direct caller could misrepresent whether personal
information was involved. Fixed: the server now loads the issue and derives
both booleans itself; the client sends no such fields at all (FR-013,
contracts/generation-log-api.md, data-model.md all updated). (2) FR-007 said
Timestamp goes blank on parse failure while data-model.md said it falls back
to `created_at` — a direct contradiction; FR-007 now explicitly carves
Timestamp out as the one field that never goes blank. (3) FR-002 listed
`tenant_name` as a template pre-fill field, but the canonical template
wording in data-model.md never used it; FR-002 and FR-005 now correctly
state that only client name and issue title are used in the three
client-facing artifacts' pre-fill, with tenant reserved for the packet.
(4) The endpoint had no check that `{id}` is actually a Support Ops-scoped
record, not just any existing task id; added as an explicit 404 case.
(5) No automated coverage existed for the pure-JS template/parsing logic;
added as `node:test` unit tests (see Technical Context > Testing) despite
this repo having no frontend test runner otherwise, since this is the
highest-risk logic in the feature.

**Third correction, found during `/speckit-tasks` review**: the generated
tasks initially placed the generation controls inside `TaskDetailModal`'s
`extraFields(form, setForm)` slot without specifying which of the two
available data sources — `form` (the modal's local, possibly-unsaved edit
buffer) or `selectedIssue` (`SupportOps.jsx`'s own last-fetched state) — the
generators should read from. Reading from `form` would let an unsaved edit
to `client_name`/`tenant_name`/`evidence`/`root_cause` appear in generated
text before it's saved, while the generation-log endpoint's server-side
audit derivation only ever sees the last-saved database row — a same-user
divergence between what's disclosed and what's audited, distinct from (and
in addition to) the cross-user race the snapshot-consistency check already
handles. Fixed by adding FR-016: generators MUST read `selectedIssue`, never
`form`. Propagated to data-model.md's new "Data source discipline" note and
to the three UI-wiring tasks in tasks.md.

**Design decision surfaced during this planning pass**: the audit log write
(FR-013) is triggered by an explicit "Generate [stage]" / "Start freeform
draft" / "Generate troubleshooting packet" click — not by opening a picker,
browsing stages, editing, or the *copy* click (see FR-013's full trigger
definition, tightened during the review pass described above). Copying is a
pure `navigator.clipboard` call with no network dependency, so it can never
be slowed down or blocked by the audit call — satisfying FR-012's "MUST NOT
block" requirement by construction, not by convention. The audit call is
fire-and-forget from the frontend: a failed log write is surfaced only in
the console (best-effort), never as a blocking error to the user, since
blocking a support agent from communicating with a client over a logging
failure would be a worse outcome than an occasional missed audit entry.

## Project Structure

### Documentation (this feature)

```text
specs/003-templates-prompt-generator/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
# Option 2: Web application (frontend/ + backend/, matches existing repo layout)

backend/
├── app/Http/Controllers/
│   └── SupportOpsController.php   # modified — add generationLog() action
├── app/Services/
│   └── AuditLogger.php            # unchanged — reused as-is, new action names only
│                                   #   (support_issue.template_generated,
│                                   #   support_issue.packet_generated,
│                                   #   support_issue.draft_started)
└── routes/api.php                 # modified — add POST /api/support-ops/{id}/generation-log

frontend/
├── src/
│   ├── lib/
│   │   ├── supportTemplates.js    # new — the 7 fixed template strings, the
│   │   │                          #   packet template, and the interpolation
│   │   │                          #   function(s); pure functions, no React
│   │   ├── supportTemplates.test.js  # new — node:test unit tests (see
│   │   │                          #   Technical Context > Testing)
│   │   └── api.js                 # modified — add logSupportGeneration(id, payload)
│   ├── components/
│   │   └── TaskDetailModal.jsx    # unchanged — extraFields slot is already
│   │                              #   generic enough to host the new UI
│   └── pages/
│       └── SupportOps.jsx         # modified — extraFields render adds the
│                                  #   template picker, freeform composer,
│                                  #   packet generator, privacy notice, and
│                                  #   copy buttons, all reading from
│                                  #   supportTemplates.js
└── tests/                         # none exist yet; no test infra added by this feature

backend/tests/Feature/
└── SupportOpsGenerationLogTest.php  # new — full role/response matrix per
                                     #   contracts/generation-log-api.md
                                     #   (Admin/PM/Team Member/Dept Head 200,
                                     #   Client/invalid-role 403, unauth 401,
                                     #   bad id 404, bad artifact_type 422)
```

**Structure Decision**: No new pages, no new shared components, no schema
change. Everything folds into the existing `TaskDetailModal`/`SupportOps.jsx`
extension point built in 002, plus one small, single-purpose controller
action and route. This keeps Phase 2 exactly as scoped in
`docs/support_ops_module_plan.md` — templating and prompt generation only,
no new operational surface.
