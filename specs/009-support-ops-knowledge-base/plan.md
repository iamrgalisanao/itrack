# Implementation Plan: Support Ops Knowledge Base

**Branch**: `009-support-ops-knowledge-base` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-support-ops-knowledge-base/spec.md`

## Summary

Adds a searchable, browsable, read-only view over Support Ops issues that are already resolved and already have both a root cause and a resolution recorded — so an internal team member can find how a similar issue was solved before, instead of re-diagnosing it. No new table, column, or migration: this is a new query (one `DetailedActivity` scope plus one controller method reusing the existing cross-project `today()` pattern and the existing `TodaySupportIssueResource`) and a new frontend page mirroring `TodayDashboard.jsx`'s established structure. Opening a result's full context reuses the already-shared `TaskDetailModal` and the endpoints it already calls, given one necessary addition: a new `readOnly` mode threaded through that modal and its Comments/Files/extra-fields children, since the modal is unconditionally editable today and this feature must not be able to mutate the historical record it searches (FR-010). No new backend visibility logic is introduced anywhere in this feature.

## Technical Context

**Language/Version**: PHP 8.4 (Laravel 13, unchanged) / JavaScript (ES2022+), React 19 (unchanged) — same stack as 001-008.

**Primary Dependencies**: None new. Reuses `Project::scopeAccessibleTo` (cross-project visibility, identical to `today()`), `TodaySupportIssueResource` (unchanged), `HasRole`/`canView()` predicates (unchanged). `TaskDetailModal` (already shared across three other pages) is reused but not unchanged — it gains one new, additive `readOnly` prop (default `false`, so its three existing callers are unaffected) that this feature is the first to set to `true`.

**Storage**: MySQL, no schema change. One new query scope on the existing `DetailedActivity` model (`scopeResolvedWithRecordedFix`); no migration.

**Testing**: PHPUnit Feature tests in a new `backend/tests/Feature/SupportOpsKnowledgeBaseTest.php`, mirroring `SupportOpsTodayTest.php`'s established pattern — covering: (1) a resolved issue with both root cause and resolution recorded is found by a keyword matching its name, client, tenant, root cause, or resolution; (1a) matching is verified explicitly case-insensitive (an uppercase search finds a lowercase-recorded value and vice versa) and explicitly partial (a substring finds a full-field value); (1b) a keyword containing a literal `%`, `_`, or `\` character matches only that literal text, never behaving as a SQL wildcard; (2) a resolved issue missing either field is excluded, including a whitespace-only value; (3) a non-resolved issue is excluded regardless of text match; (4) browsing with no keyword returns results ordered most-recently-resolved first; (5) project/client/tenant/priority filters narrow correctly, individually and combined with a keyword (AND, never OR); (6) results never include an issue from a project the requester cannot access, verified across every internal role, including a Team Member with only partial project access; (7) a Client-role request is denied `403`; (8) zero matches returns `200` with an empty set, not an error; (9) pagination behaves like `UserManagementController`'s. Frontend: manual verification via quickstart.md, unchanged practice from 001-008, plus explicit manual confirmation that opening a knowledge base result in `readOnly` mode offers no save/comment/upload/delete action anywhere in the modal (Details, Comments, and Files tabs) — this is the one behavior in this feature a backend test cannot cover.

**Target Platform**: Same dev/prod web app as prior features — Laravel API at `localhost:8000`, Vite dev server at `localhost:5173`.

**Project Type**: Web application (backend/ + frontend/, existing structure).

**Performance Goals**: Acceptable at this feature's current, internal-team scale — same query shape and scale class as `today()`, which already aggregates across every accessible project, with standard pagination bounding response size. Not a claim of indexed performance at any scale: the `LOWER(column) LIKE ?` keyword match across five text columns cannot use a standard index and will scan candidate rows within the accessible-project/resolved-with-fix set. Acceptable today given that set's expected size (an internal team's own resolved-issue history); revisit with proper indexing or full-text search if result volume grows enough to make this a real complaint, not before.

**Constraints**: Per FR-003/FR-004, the inclusion rule (eligible work type, `status = completed` by value not label, both `root_cause` and `resolution` non-blank after trimming) MUST be expressed once, as a reusable query scope, not duplicated between the results query and any count/pagination query. Per FR-007, cross-project visibility MUST reuse `Project::scopeAccessibleTo` exactly as `today()` already does — no new or looser authorization concept. Per FR-009/FR-009a, "full original context" MUST be reached through the existing `TaskDetailModal` and the endpoints it already calls — this feature MUST NOT introduce a second rendering of an issue's detail, comments, or attachments, since that would be a second place for visibility rules to drift out of sync with the first. Per FR-001a, keyword matching MUST be case-insensitive (via an explicit `LOWER()` on both sides of the comparison, not an assumption about the database's default column collation) and partial across exactly five fields, with SQL LIKE wildcard characters in the user's input treated literally, not as wildcards. Per FR-010, `TaskDetailModal` MUST NOT be reused as-is — it is unconditionally editable today — and MUST instead gain an additive `readOnly` mode (default `false`, so its three existing callers are unaffected) that this feature sets to `true`, suppressing every save/comment/upload/delete affordance in the Details, Comments, and Files tabs alike.

**Scale/Scope**: 0 migrations, 1 modified model (`DetailedActivity` — new scope), 1 modified controller (`SupportOpsController` — new `knowledgeBase()` method), 1 modified route file, 1 new backend test file, 1 new frontend page (`SupportOpsKnowledgeBase.jsx`), 1 modified frontend nav structure (`App.jsx`'s `NAV_GROUPS`/`SidebarNavGroups`, `subItem` → `subItems`), 1 modified `frontend/src/lib/api.js`, 4 modified shared frontend components for the new `readOnly` mode (`TaskDetailModal.jsx`, `SupportIssueExtraFields.jsx`, `TaskComments.jsx`, `TaskFiles.jsx`) — each change additive and defaulted off, so their three existing callers (`Kanban.jsx`, `SupportOps.jsx`, `TodayDashboard.jsx`) require no changes of their own.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I. Fail-Closed Access Control | Yes | Reuses `canView()` (`HasRole` predicates) exactly as `today()`/`index()` already do — never a raw role-string comparison. A Client or unrecognized role is denied. **PASS**. |
| II. Consistent API Contracts | Yes | Reuses `TodaySupportIssueResource` unchanged — never a raw model. No new Resource shape introduced. **PASS**. |
| III. Test Coverage Grows With the Feature | Yes | New `SupportOpsKnowledgeBaseTest.php` required in the same change, covering the full inclusion/exclusion/visibility/denial matrix — see Testing above. **PASS**. |
| IV. Audit Sensitive Mutations | N/A | This feature performs no mutation of any kind (FR-010) — nothing to audit. Not a violation; simply out of this principle's scope. |
| V. Small, Additive, Reversible Migrations | N/A | No migration at all — trivially satisfied. |
| VI. Real Auth Is the Only Forward Path | Yes | Reads exclusively via Sanctum-authenticated `$request->user()` (backend) and `useEffectiveUser()` (frontend, matching `TodayDashboard.jsx`'s own established pattern) — no mock-role dependency anywhere. **PASS**. |

No unjustified violations. Complexity Tracking section is not needed.

**Post-Phase 1 re-check**: Design artifacts (data-model.md, contracts/, quickstart.md) confirm the architecture above — one new query scope, one new controller method reusing `today()`'s exact cross-project pattern, one reused Resource, and a frontend page reusing `TodayDashboard.jsx`'s structure and `TaskDetailModal` via its new, additive `readOnly` mode. A round-1 review of this plan caught that "TaskDetailModal unchanged" was wrong — it's unconditionally editable today, which would have let this feature silently violate its own FR-010; the fix (a defaulted-off `readOnly` prop threaded through the modal and its Comments/Files/extra-fields children) is now reflected throughout research.md/data-model.md/contracts.md and above, and does not change any of this Constitution Check's conclusions — no new access-control concept, no new visibility rule, no new data shape, and Principle II's "reused Resource" still holds since `readOnly` is a rendering concern, not a new API contract. Gate re-evaluation: **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/009-support-ops-knowledge-base/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
# Web application (frontend/ + backend/, matches existing repo layout)

backend/
├── app/Models/
│   └── DetailedActivity.php            # modified — new scopeResolvedWithRecordedFix()
├── app/Http/Controllers/
│   └── SupportOpsController.php        # modified — new knowledgeBase() method,
│                                        #   same canView() gate, same
│                                        #   Project::accessibleTo() cross-project
│                                        #   pattern as today()
├── app/Http/Resources/                 # unchanged — reuses TodaySupportIssueResource
└── routes/api.php                      # modified — add GET /api/support-ops/knowledge-base

backend/tests/Feature/
└── SupportOpsKnowledgeBaseTest.php     # new — see Testing above

frontend/
├── src/pages/
│   └── SupportOpsKnowledgeBase.jsx     # new — mirrors TodayDashboard.jsx's structure
│                                        #   (useEffectiveUser, fetch-on-mount/on-filter-
│                                        #   change, click-to-open shared TaskDetailModal
│                                        #   with readOnly={true})
├── src/components/
│   ├── TaskDetailModal.jsx             # modified — new readOnly prop (default false);
│   │                                    #   disables Details fields, hides Save Changes,
│   │                                    #   passes readOnly through to extraFields/
│   │                                    #   TaskComments/TaskFiles when true
│   ├── SupportIssueExtraFields.jsx     # modified — new readOnly prop; disables its own
│   │                                    #   fields and hides the "Record client update
│   │                                    #   now" button + all three Support Generator
│   │                                    #   panels when true
│   ├── TaskComments.jsx                # modified — new readOnly prop; hides the
│   │                                    #   add-comment form and every delete action
│   │                                    #   when true
│   └── TaskFiles.jsx                   # modified — new readOnly prop; hides the upload
│                                        #   control and every delete action when true
├── src/lib/api.js                      # modified — add fetchSupportOpsKnowledgeBase(params)
└── src/App.jsx                         # modified — NAV_GROUPS's "Support Ops" entry:
                                         #   subItem: {...} → subItems: [...] (adds
                                         #   "Knowledge Base" alongside "Today"); the one
                                         #   render site in SidebarNavGroups (shared by
                                         #   Sidebar + MobileBar) maps over the array
                                         #   instead of rendering a single conditional
                                         #   element; new route
                                         #   /support-ops/knowledge-base under the
                                         #   existing SupportOpsGuard
```

**Structure Decision**: The new backend capability is added directly to `SupportOpsController` and `DetailedActivity`, not split into new classes — `today()` already established this exact "cross-project Support Ops view" shape, and there is no second call site that would justify extracting a service or a new controller. The frontend page is new (`SupportOpsKnowledgeBase.jsx`) because it is a distinct route/URL a user navigates to, but it deliberately mirrors `TodayDashboard.jsx` line-for-line in structure rather than inventing a new page pattern — same effective-user handling, same fetch/loading/error conventions, same shared `TaskDetailModal` integration. The one structural change outside this feature's own new files — generalizing `App.jsx`'s `subItem` to `subItems` — is scoped to its single existing call site (`SidebarNavGroups`, already shared by desktop and mobile nav), so it does not ripple into a second render path. The four shared-component changes (`TaskDetailModal`/`SupportIssueExtraFields`/`TaskComments`/`TaskFiles` gaining `readOnly`) are each a single new prop with a default that preserves every existing caller's current behavior exactly — chosen over forking a separate read-only component tree, which would duplicate four components' worth of markup and drift from the editable originals over time.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
