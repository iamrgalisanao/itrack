# Implementation Plan: Sprint Retrospectives

**Branch**: `013-sprint-retrospectives` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-sprint-retrospectives/spec.md`

## Summary

Add a standalone Retrospectives view alongside Work Program, mirroring how Support Ops was added as a separate operational layer without touching the Module → Activity → Sub-Activity → Task hierarchy. A Project Manager or Admin creates a named, project-scoped retro session ("Sprint 3," "Q1 Wrap-up"); internal team members (Admin, PM, Team Member — Department Head can view only, matching the existing `canWrite()`/`canView()` split already used by Support Ops) add insight entries continuously, each tagged Keep/Improve/Discuss, votable, and optionally assigned an owner for follow-up. No Sprint entity is introduced — sessions are this phase's grouping mechanism, standing alone.

## Technical Context

**Language/Version**: PHP 8.4 (Laravel 13) backend; JavaScript (React 19) frontend — both fixed by the project constitution.

**Primary Dependencies**: None new on either side — reuses the existing Eloquent/API Resource/Sanctum stack and the frontend's existing UI component set (Card, Dialog, Badge, Button, etc., the same primitives Support Ops already uses).

**Storage**: Three new tables — `retro_sessions`, `retro_entries`, and `retro_entry_votes` (the join table backing toggleable per-user votes). All additive, all nullable-by-default where optional (e.g. `owner_user_id`), per Constitution Principle V.

**Testing**: Backend — PHPUnit Feature tests under `backend/tests/Feature` covering the view/write role split, sentiment-required validation, vote toggle idempotency, owner assignment/reassignment, entry edit/delete permission, and Client-role denial, per Constitution Principle III. Frontend — manual browser verification per the constitution's Development Workflow.

**Target Platform**: Existing web app (React SPA + Laravel API) — no new platform surface.

**Project Type**: Web application (existing frontend + backend split).

**Performance Goals**: None beyond standard SPA/API expectations — a single session's entry list is bounded by how much a team writes during one retro cycle, not a high-volume table.

**Constraints**: MUST NOT modify Work Program's Module/Activity/SubActivity/DetailedActivity tables, models, or behavior (FR-011) — retrospectives is purely additive. MUST reuse `Project::accessibleTo()` for project-level visibility rather than introducing a parallel access mechanism.

**Scale/Scope**: 3 new tables, 1 new controller (~6 endpoints), 2 new API Resources, 1 new frontend page + nav entry, 0 new dependencies.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Fail-Closed Access Control | Reuses the exact `canView()`/`canWrite()` inclusion-based pattern already established in `SupportOpsController` (view: Admin/PM/TeamMember/DepartmentHead; write: the existing `canWrite()` role set) — no new inline role comparisons. An unrecognized/invalid role is denied, never granted. **PASS** |
| II. Consistent API Contracts | New `RetroSessionResource` and `RetroEntryResource` classes wrap every response; no raw Eloquent models returned. **PASS** |
| III. Test Coverage Grows With the Feature | Every new endpoint ships with a Feature test covering its happy path and its denied path in the same change. **PASS** (tracked as tasks) |
| IV. Audit Sensitive Mutations | Following `SupportOpsController`'s actual precedent (which logs both denied attempts and issue creation, not just role/grant changes): every 403 calls `AuditLogger::denied()`; entry deletion and owner reassignment call `AuditLogger::record()` (destructive and responsibility-tracking actions respectively). Routine entry creation and voting are not logged — high-frequency, low-stakes, and logging them would be noise rather than a trustworthy trail. **PASS** |
| V. Small, Additive, Reversible Migrations | Three new tables, each a single concern (sessions, entries, votes), all additive with nullable optional columns. No existing table touched. **PASS** |
| VI. Real Auth Is the Only Forward Path | All access checks read the real Sanctum-authenticated user (`$request->user()`) and, on the frontend, `useEffectiveUser()` for Preview-mode consistency with every other internal-only page. **PASS** |

No violations. Complexity Tracking table is not needed.

**Post-Phase 1 re-check**: `data-model.md`'s final schema (three tables, no touches to existing Work Program tables) and `contracts/retrospectives-api.md`'s six endpoints match exactly what this gate assessed above. Gate remains **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/013-sprint-retrospectives/
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
│   ├── xxxx_xx_xx_xxxxxx_create_retro_sessions_table.php
│   ├── xxxx_xx_xx_xxxxxx_create_retro_entries_table.php
│   └── xxxx_xx_xx_xxxxxx_create_retro_entry_votes_table.php
├── app/
│   ├── Models/
│   │   ├── RetroSession.php
│   │   ├── RetroEntry.php
│   │   └── RetroEntryVote.php
│   ├── Http/
│   │   ├── Controllers/RetrospectiveController.php   # new — mirrors SupportOpsController's shape
│   │   └── Resources/
│   │       ├── RetroSessionResource.php
│   │       └── RetroEntryResource.php
│   └── routes/api.php                                 # +6 routes, grouped like the existing Support Ops block
└── tests/Feature/
    └── RetrospectivesTest.php                          # new

frontend/
├── src/
│   ├── pages/
│   │   └── Retrospectives.jsx                          # new — session list + active session view
│   ├── lib/api.js                                       # +API call functions for the 6 endpoints
│   └── App.jsx                                          # +1 NAV_GROUPS entry (Team Ops, internalOnly: true) + route
```

**Structure Decision**: Standard existing web-application split. Retrospectives is structurally a sibling of Support Ops — same controller shape, same role-gating helpers, same nav-group placement (Team Ops, `internalOnly: true`) — not a variant bolted onto Work Program's existing controllers or tables.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
