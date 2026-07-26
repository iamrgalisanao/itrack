# Implementation Plan: Task Detail Tabs & Completion Indicators

**Branch**: `010-task-detail-tabs` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-task-detail-tabs/spec.md`

## Summary

Splits the shared `TaskDetailModal`'s single long-scroll Details tab into Details/Support/Resolution/Comments/Files tabs, but only for a Support Ops issue (`task.work_type` of `support`/`learning`) — a Kanban board task keeps its current three tabs, unchanged, automatically. Adds a live completion count to the Support and Resolution tab labels (reusing this app's own existing "required" definitions: Client/Client Priority from Support Ops intake validation, Root Cause/Resolution from 009-support-ops-knowledge-base's inclusion rule), a per-field marker on any currently-blank required field, and a non-blocking save-time summary of what's still missing. No backend change of any kind — this is a frontend component reorganization plus a completeness signal layered on data that already exists, never a new validation rule.

## Technical Context

**Language/Version**: JavaScript (ES2022+), React 19 — unchanged, no backend involvement in this feature (PHP 8.4/Laravel 13 untouched).

**Primary Dependencies**: None new. Extends `TaskDetailModal.jsx`, `SupportIssueExtraFields.jsx` (narrowed), a new sibling `ResolutionExtraFields.jsx`, a new shared `SupportGeneratorPanel.jsx` (both extracted from and reused by the two components above — see Constraints), `TaskComments.jsx`/`TaskFiles.jsx` (unchanged, already `readOnly`-aware since 009).

**Storage**: N/A — no schema, no migration, no new endpoint.

**Testing**: This app has no automated frontend test suite (established practice across 001-009: lint + build + manual browser verification). Verification here is therefore: (1) `npm run lint`/`npm run build` clean; (2) `php artisan test` — full, unmodified pass, since no backend file changes; (3) manual verification via quickstart.md's six scenarios, covering the 5-tab split, Kanban's 3-tab isolation, live completion counts, the completion-vs-activity-count visual distinction, the non-blocking save-time summary, and read-only-mode behavior.

**Target Platform**: Same dev/prod web app as prior features — Vite dev server at `localhost:5173`, no backend surface touched.

**Project Type**: Web application (backend/ + frontend/, existing structure) — this feature is frontend-only.

**Performance Goals**: No concern — two small pure functions (`getSupportCompletion`/`getResolutionCompletion`) each checking two fields, recomputed on every render of a modal a single user has open; no list-scale or network cost involved.

**Constraints**: Per FR-002/SC-003, the 5-tab layout MUST be gated on `task.work_type` **and** the presence of both `supportFields`/`resolutionFields` render props — never on which page opened the modal — so a Kanban task can never show Support/Resolution tabs regardless of future caller changes elsewhere. Per FR-012/FR-013, no indicator introduced by this feature may block a save, require a confirmation step, or be enforced anywhere outside the frontend — the existing `DetailedActivityController::update()` validation is not touched. Per FR-014, tab-label completion counts MUST still compute and render in `readOnly` mode, while per-field markers and the save-time summary MUST NOT. `GeneratorPanel` and `hasUnsavedFieldChange` (today, private module-scoped helpers inside `SupportIssueExtraFields.jsx`, used by all three copy-only generators) MUST be extracted to a shared, exported location before the Troubleshooting Packet generator moves to `ResolutionExtraFields.jsx` — found during task planning: splitting the file without this step would force a choice between duplicating both (drift risk) or leaving `ResolutionExtraFields.jsx` unable to compile against them at all (they're not exported today).

**Scale/Scope**: 0 migrations, 0 backend files changed, 1 modified component (`TaskDetailModal.jsx` — tab count decision, two new render-prop names, save-flow summary state), 1 narrowed component (`SupportIssueExtraFields.jsx` — loses Evidence/Root Cause/Resolution/Troubleshooting Packet, gains its own required-field markers), 1 modified utility file (`lib/supportTemplates.js` — gains `isFilled`/`getSupportCompletion`/`getResolutionCompletion`, found during implementation to be the only Fast-Refresh-safe home for them), 2 new components (`ResolutionExtraFields.jsx`; `SupportGeneratorPanel.jsx`, the shared-chrome extraction found necessary during task planning), 3 modified callers (`SupportOps.jsx`, `TodayDashboard.jsx`, `SupportOpsKnowledgeBase.jsx` — each splits its one `extraFields` prop into `supportFields`/`resolutionFields`), 0 changes to `Kanban.jsx` or `TaskComments.jsx`/`TaskFiles.jsx`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Fail-Closed Access Control | No | This feature touches no authorization logic — every existing access rule (who can view/edit/comment/upload) is completely untouched. N/A. |
| II. Consistent API Contracts | No | No API endpoint is added, removed, or changed. N/A. |
| III. Test Coverage Grows With the Feature | Partial | No backend endpoint or authorization rule is added (this app's automated test suite is backend-only, per established practice), so there is no new PHPUnit coverage to add. Verification is manual, via quickstart.md — consistent with how every prior frontend-only change in this codebase (e.g., 007's Sidebar/MobileBar effective-role fixes) has been verified. **PASS** under the practice this principle's own Rationale describes. |
| IV. Audit Sensitive Mutations | No | This feature performs no mutation of any kind beyond what `onSave`/`TaskComments`/`TaskFiles` already do unchanged — nothing new to audit. N/A. |
| V. Small, Additive, Reversible Migrations | No | No migration at all. N/A. |
| VI. Real Auth Is the Only Forward Path | Yes | No new identity or role concept introduced; `userRole` continues to flow through exactly as it does today (from each caller's `useEffectiveUser()`, unchanged since 007/009). **PASS**. |

No unjustified violations. Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: Design artifacts (data-model.md, contracts/, quickstart.md) confirm the architecture above — a task-content-driven tab count decision, two narrowly-scoped exported completion functions, a save-flow change that only ever adds a non-blocking summary (never blocks, delays, or requires confirmation), and zero backend files touched. `Kanban.jsx` requires zero changes; its isolation follows structurally from `work_type`, not from a rule this plan has to separately guarantee stays maintained. Gate re-evaluation: **PASS**, unchanged from pre-design.

## Project Structure

### Documentation (this feature)

```text
specs/010-task-detail-tabs/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output (frontend component contract — no backend data model)
├── quickstart.md         # Phase 1 output
├── contracts/             # Phase 1 output
└── tasks.md               # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
# Web application (frontend/ + backend/, matches existing repo layout) — backend/ untouched by this feature

frontend/
├── src/components/
│   ├── TaskDetailModal.jsx         # modified — tab-count decision from task.work_type,
│   │                                #   extraFields → supportFields/resolutionFields,
│   │                                #   missingSummary state + non-blocking save-time
│   │                                #   summary banner
│   ├── SupportGeneratorPanel.jsx   # new — GeneratorPanel component only, extracted from
│   │                                #   SupportIssueExtraFields.jsx (was private/unexported)
│   │                                #   so both it and ResolutionExtraFields.jsx can share
│   │                                #   one copy (hasUnsavedFieldChange moved to
│   │                                #   lib/supportTemplates.js instead — see below)
│   ├── SupportIssueExtraFields.jsx # modified — narrowed to Support-tab fields only,
│   │                                #   imports GeneratorPanel from SupportGeneratorPanel.jsx
│   │                                #   and hasUnsavedFieldChange/isFilled from
│   │                                #   lib/supportTemplates.js, required-field markers on
│   │                                #   Client/Client Priority labels
│   ├── ResolutionExtraFields.jsx   # new — Evidence/Root Cause/Resolution/Troubleshooting
│   │                                #   Packet (moved from SupportIssueExtraFields.jsx),
│   │                                #   imports GeneratorPanel from SupportGeneratorPanel.jsx
│   │                                #   and hasUnsavedFieldChange/isFilled from
│   │                                #   lib/supportTemplates.js, required-field markers on
│   │                                #   Root Cause/Resolution labels
│   ├── TaskComments.jsx            # unchanged
│   └── TaskFiles.jsx               # unchanged
├── src/lib/
│   └── supportTemplates.js         # modified — gains isFilled(), getSupportCompletion(),
│                                    #   getResolutionCompletion() (found during implementation:
│                                    #   Fast Refresh forbids a component file exporting a
│                                    #   plain function alongside its component, so these live
│                                    #   here rather than in the two component files above)
└── src/pages/
    ├── SupportOps.jsx              # modified — split extraFields into supportFields/resolutionFields
    ├── TodayDashboard.jsx          # modified — same split
    ├── SupportOpsKnowledgeBase.jsx # modified — same split, readOnly stays hardcoded true
    └── Kanban.jsx                  # unchanged — never supplied extraFields, unaffected
```

**Structure Decision**: The redesign lives entirely inside the existing shared-component set introduced by `002-support-ops-tracker`'s original `TaskDetailModal` extraction — no new page, no new route, no new backend surface. `SupportIssueExtraFields.jsx` is narrowed rather than deleted-and-rewritten, and `ResolutionExtraFields.jsx` is a new sibling at the same layer, so the change reads as "the existing Support Ops fields component split along the same line as the new tabs," not a new subsystem. All three affected pages change in exactly the same one-line-shaped way (splitting one render prop into two), keeping the diff mechanical and easy to review identically across all three call sites. `Kanban.jsx` needs no defensive check added to keep it isolated — isolation is structural, following from `task.work_type` never being a Support Ops value for a Kanban-created task (confirmed via `grep`), not from a rule this plan has to separately enforce or that a future edit could accidentally weaken.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
