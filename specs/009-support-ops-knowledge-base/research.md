# Phase 0 Research: Support Ops Knowledge Base

No `NEEDS CLARIFICATION` markers exist in the Technical Context — every decision below came from reading existing code (`SupportOpsController`, `DetailedActivity`, `SupportOps.jsx`, `TodayDashboard.jsx`, `App.jsx`'s nav structure, `Comment`/`AttachmentController`) and 006/007/008's own design records, not new research after the fact.

## Decision: a new `knowledgeBase()` method on the existing `SupportOpsController`, not a new controller

**Rationale**: `today()` already established the exact precedent this feature needs — a cross-project (no single `project_id` required) Support Ops view, added directly to `SupportOpsController` rather than a new controller. This feature is structurally the same shape (cross-project, same `canView()` role gate, same eligible work types), so it follows the same precedent for the same reason `today()` did: one cohesive domain controller, not a new abstraction for a single additional read endpoint.

**Alternatives considered**: A dedicated `SupportOpsKnowledgeBaseController` — rejected; there is no second call site or independent lifecycle that would justify splitting it out, and `SupportOpsController` is not so large that a fifth method meaningfully hurts readability (it mirrors `today()`'s size and shape almost exactly).

## Decision: a new `DetailedActivity::scopeResolvedWithRecordedFix(Builder $query)` query scope encapsulates FR-003/FR-004's inclusion rule

**Rationale**: The rule ("eligible work type, resolved status, both root cause and resolution non-blank after trimming") is exactly the kind of reusable, testable-in-isolation condition this app already expresses as a model scope (`Project::scopeAccessibleTo`, `Project::scopeOwnedBy`). Encapsulating it as `DetailedActivity::scopeResolvedWithRecordedFix()` keeps the controller method thin and makes the inclusion rule independently unit-testable rather than inline query-building logic duplicated wherever it's needed.

```php
public function scopeResolvedWithRecordedFix(Builder $query): Builder
{
    return $query
        ->whereIn('work_type', ['support', 'learning'])
        ->where('status', 'completed')
        ->whereNotNull('root_cause')
        ->whereRaw("TRIM(root_cause) != ''")
        ->whereNotNull('resolution')
        ->whereRaw("TRIM(resolution) != ''");
}
```

`'completed'` is confirmed as the actual resolved status value (not just its "Resolved" board-column label) by `SupportOpsController::today()`'s existing `where('status', '!=', 'completed')` exclusion and `SupportOps.jsx`'s column definition (`{ id: 'completed', label: 'Resolved', ... }`) — the scope matches on this value, never on the string "Resolved". `TRIM(...) != ''` (rather than only `whereNotNull`) is what makes a whitespace-only value count as blank, per FR-003's explicit definition.

**Alternatives considered**: Inlining the condition directly in the controller — rejected; it would need to be identical in both the count-for-pagination query and the fetch query, and a scope is the established way this codebase avoids that duplication.

## Decision: reuse `TodaySupportIssueResource` unchanged for knowledge base results — no new Resource class, and the payload is intentionally the full issue, not a trimmed search-result snippet

**Rationale**: `TodaySupportIssueResource` returns every field FR-001 searches or FR-006 filters on (`root_cause`, `resolution`, `client_name`, `tenant_name`, plus a nested `project` label needed here for the same cross-project reason `today()` needed it) — but, precisely stated, it is not a lean "snippet" shape: it also carries `evidence`, `description`, `next_action`, `client_visible`, `responsible`, and `channel`, none of which FR-001/FR-006 need to search or filter on. This is a deliberate choice, not an oversight: every one of those fields is already visible to every role this feature admits (Admin/PM/Team Member/Department Head) the moment they open the same issue anywhere else in the app (`index()`, `today()`), so including them in the knowledge base's list response exposes nothing new — there is no access boundary being crossed by fetching them one screen earlier than the modal. The list *UI* still only renders the search-relevant subset (name, client, tenant, root cause, resolution, project, resolved date) as the result card; the rest of the payload rides along unused until FR-009's "open full context" reuses the very same fetched object as `TaskDetailModal`'s initial `task` prop, needing no second fetch to populate it.

**Alternatives considered**: A new, slimmer `KnowledgeBaseIssueResource` returning only the search-relevant subset — rejected; it would reintroduce exactly the kind of near-duplicate Resource class this decision otherwise avoids, for a payload-size saving that doesn't matter at this feature's scale (pagination already caps each response to at most 100 rows) and no access-control benefit (nothing in the fuller payload is hidden from these roles anywhere else).

## Decision: cross-project visibility reuses `Project::scopeAccessibleTo` exactly as `today()` already does — no new authorization concept

**Rationale**: `today()` already solved "which projects can this cross-project Support Ops view draw from" via `Project::query()->accessibleTo($user)->pluck('id')`, then constraining the `DetailedActivity` query to that project-id set through the `subActivity.activity.module` relationship chain. This feature asks the identical question for the identical role set (`canView()`: Admin/PM/Team Member/Department Head), so it reuses the identical mechanism, verbatim.

**Alternatives considered**: None — this is a direct continuation of `today()`'s own already-justified decision, not a new fork (the same reasoning 008's research.md used for reusing `scopeAccessibleTo` rather than reinventing it).

## Decision: keyword search (`q`) is case-insensitive, partial, escapes SQL LIKE wildcards using `!` (not backslash), and matches exactly five columns

**Rationale**: FR-001/FR-001a. Implemented as a `WHERE (...)` group of `orWhereRaw("LOWER(column) LIKE ? ESCAPE '!'", [...])` clauses across `name`, `client_name`, `tenant_name`, `root_cause`, `resolution` — the same shape as this codebase's one existing search precedent (`UserManagementController::index()`'s name/email search), extended to more columns. Three deliberate, contained improvements over that precedent: (1) both sides are explicitly lowercased (`LOWER(column) LIKE LOWER(?)`) rather than relying on the database's default column collation happening to be case-insensitive — FR-001a is a requirement of this feature's behavior, and it shouldn't silently depend on an unstated, unverified server-configuration assumption that could differ across environments or change later; (2) the keyword is escaped for LIKE's special `%`/`_` characters before interpolation so a literal percent sign or underscore typed by a user is matched literally, not interpreted as a SQL wildcard; (3) the query names its escape character explicitly rather than relying on any engine's default.

**Correction (found during implementation)**: the original design used backslash as the escape character (`ESCAPE '\\'`, `addcslashes($keyword, '%_\\')`). This passed reasoning on paper but failed the first test run with `SQLSTATE[HY000]: ESCAPE expression must be a single character` — because MySQL (this app's prod/dev database) and SQLite (this test suite's driver, per `phpunit.xml`) disagree on how a literal backslash is written inside a SQL string literal: MySQL's own string-literal parser collapses `\\` to one backslash, so `ESCAPE '\\'` correctly names a single backslash on MySQL, but SQLite does not perform that collapse, so the identical SQL text names a two-character string on SQLite — invalid for an `ESCAPE` clause. Rather than writing engine-conditional SQL (which this codebase has no precedent for and would need to detect the active driver), the fix replaces backslash with `!` as the escape character throughout: `!` requires no special quoting in either engine's string-literal syntax, so `ESCAPE '!'` and a matching PHP-side `str_replace(['!', '%', '_'], ['!!', '!%', '!_'], strtolower($keyword))` (escaping `!` itself first, so an escape sequence this code just inserted is never re-escaped by a later replacement) are byte-identical, and correct, on both engines. `UserManagementController`'s existing search relies on none of this — it never needed escaping — so there was no existing engine-portability precedent to follow either way; this decision is this feature's own.

**Alternatives considered**: A full-text search index or fuzzy/ranked matching — rejected per spec.md's own Assumptions; no such infrastructure exists in this codebase, and nothing in this feature's motivation calls for building one. Relying on MySQL's default `_ci` (case-insensitive) collation alone, matching `UserManagementController`'s existing precedent exactly — rejected; it would make a stated functional requirement (FR-001a) an unstated side effect of server configuration rather than a property the query itself guarantees, and the explicit `LOWER()` form costs nothing extra to write.

## Decision: filters (project, client, tenant, priority) are exact-match narrowing, distinct from keyword's partial match

**Rationale**: Confirmed in `SupportOps.jsx` that its existing client/tenant/priority filters are dropdown-driven exact-value comparisons sourced from the current board's distinct values (`uniqueClients`, `issue.client_name !== filters.client`), not free-text partial matches. The knowledge base's filters mirror that exact semantic — `client_name`/`tenant_name`/`client_priority` equality checks, `project_id` equality — so a user narrowing "by client" gets the same mental model they already have from the board, while `q` remains the only fuzzy/partial dimension.

**Alternatives considered**: Making filters partial-match too, for a more forgiving UX — rejected; it would blur the one clear distinction (exact filter vs. fuzzy keyword) that makes FR-006a's "every filter narrows, never widens" guarantee easy to reason about and test.

## Decision: results sort by `updated_at` descending — the best available proxy for "most recently resolved," not a new `resolved_at` column

**Rationale**: No `resolved_at` (or any dedicated resolution timestamp) column exists on `detailed_activities` today. Adding one would be new schema, which spec.md's Assumptions explicitly rule out ("No new database table or column"). `updated_at` is the closest existing proxy — the record's timestamp naturally advances when its status transitions to `completed` — and this codebase already leans on `updated_at` as a "when was this issue last touched" signal elsewhere (`SupportOpsController::generationLog()`'s snapshot-staleness check compares against it directly).

**Known, accepted limitation**: if an issue's resolution text is edited well after it was actually resolved, `updated_at` advances again and the issue will resurface near the top of "most recently resolved" even though it wasn't newly resolved. This is judged acceptable — a rare edit-after-resolution case, not the common path — rather than justifying new schema for a feature whose original motivation never asked for exact resolution-date precision.

**Alternatives considered**: Adding a `resolved_at` timestamp, set the moment status transitions to `completed` — rejected for this iteration as unnecessary schema growth to solve a problem nobody has reported; revisit if sort-order accuracy becomes a real complaint once the feature ships.

## Decision: pagination mirrors `UserManagementController::index()`'s exact shape

**Rationale**: `per_page` validated `nullable|integer|min:1|max:100`, defaulting to 15, via Eloquent's `paginate()` — the one established pagination pattern in this codebase (FR-006b). No reason to invent a second shape for the same kind of "list view that can grow large" problem.

**Alternatives considered**: Cursor-based pagination — rejected as unwarranted complexity; nothing about this feature's scale or access pattern (an internal team browsing/searching its own resolved-issue history) resembles the high-throughput or real-time-feed scenarios cursor pagination exists to solve.

## Decision: "full original context" (FR-009/FR-009a) needs no new backend endpoint — it's satisfied by reusing the existing, already-shared `TaskDetailModal` component, given a new `readOnly` mode

**Rationale**: Confirmed `TaskDetailModal` is already a shared component consumed by `Kanban.jsx`, `SupportOps.jsx`, and `TodayDashboard.jsx` (007's own follow-up fix made all of them preview-aware via the same component). Confirmed in `CommentController`/`AttachmentController` that visibility filtering (`internal` vs. `client_visible`) only ever restricts the Client role — every role admitted into the knowledge base already sees full comment/attachment content when opening an issue directly today. Reusing this component is still the right call for FR-009/FR-009a — but a first pass of this plan wrongly assumed it could be reused *unchanged*.

**Correction (round-1 plan review)**: `TaskDetailModal` today is unconditionally editable — its Details tab always renders live inputs and an unconditional "Save Changes" button (`onSave(form)`), `SupportIssueExtraFields` always renders editable Client/Tenant/Channel/Priority/Next Action/Evidence/Root Cause/Resolution fields plus a "Record client update now" action, and `TaskComments`/`TaskFiles` always render an add-comment form and an upload control with no role or mode gate on whether they render at all (only on who may *delete* an existing comment/file). Reusing it as-is would let a knowledge base visit silently edit or delete the very historical record the feature exists to preserve — directly contradicting FR-010 ("MUST NOT alter... any Support Ops issue data") and the Assumptions section's "discovery/reference surface only." This needed a real fix, not a wording change: a new `readOnly` boolean prop, threaded through all four components, additive and defaulted to `false` so `Kanban.jsx`/`SupportOps.jsx`/`TodayDashboard.jsx` need zero changes and keep their exact current (editable) behavior:
- `TaskDetailModal`: when `readOnly`, renders the Details tab's existing fields with the native `disabled` attribute instead of building a second, parallel read-only layout, hides the "Save Changes" button (Close remains), and passes `readOnly` through to `extraFields` and to `TaskComments`/`TaskFiles`.
- `SupportIssueExtraFields`: when `readOnly`, disables its own fields identically and does not render the "Record client update now" button or the three Support Generators panels (Client Message Templates, Freeform Client Update, Troubleshooting Packet) — generating a client-facing message about an issue that's already closed and being viewed purely for historical reference isn't a coherent action to offer, independent of the mutation question.
- `TaskComments`/`TaskFiles`: when `readOnly`, the add-comment form and upload control are not rendered, and no delete action is offered on any existing comment/file, regardless of what role-based delete logic would otherwise allow.

**Alternatives considered**: A dedicated read-only "knowledge base issue detail" view/endpoint — rejected; it would duplicate `TaskDetailModal`'s rendering and the comment/attachment endpoints' visibility logic in a second place that has to be kept in sync with the first forever, for a view that would show the user exactly the same thing they already have a working component for. Revising FR-010 instead to permit normal edits when opened from the knowledge base — rejected; a search/reference surface that can silently mutate the data it's searching undermines the entire reason a knowledge base needs to be trustworthy, and nothing in this feature's motivation ever asked for edit capability.

## Decision: the frontend is a new page, `SupportOpsKnowledgeBase.jsx`, mirroring `TodayDashboard.jsx`'s established structure

**Rationale**: `TodayDashboard.jsx` is already the precedent for "a cross-project Support Ops list page that fetches on mount, respects `useEffectiveUser()` for preview-awareness, and opens the shared `TaskDetailModal` on a result click" (`openIssueDetail(issue)` → `<TaskDetailModal task={selectedIssue} .../>`). The knowledge base page is structurally the same kind of page — a cross-project Support Ops list, just filtered/searched instead of bucketed by staleness — so it follows the identical pattern rather than inventing a new one.

**Alternatives considered**: A tab inside the existing `SupportOps.jsx` board — rejected; that page's entire structure (a single-project selector driving one Kanban board) doesn't fit a cross-project search/browse view, and the deferral memo that originated this feature already made this exact call ("closer to a new page than a new notification type").

## Finding: `App.jsx`'s nav structure needs `subItem` (singular) generalized to `subItems` (plural) — one call site, cleanly reusable

**What was found**: `NAV_GROUPS`'s "Support Ops" entry currently has a single `subItem: { path: '/support-ops/today', ... }`, and exactly one render site (`{item.subItem && isNavItemVisible(item, userRole) && <SidebarNavLink {...item.subItem} .../>}`) inside `SidebarNavGroups` — which is itself already a single shared component rendered by both `Sidebar` (desktop) and `MobileBar`, so this only needs changing in one place, not two. Adding "Knowledge Base" as a second sub-link under "Support Ops" requires: (1) changing that one entry's shape from `subItem: {...}` to `subItems: [...]`, and (2) changing the one render site from a single conditional element to a `.map(...)` over the array. Both are small, mechanical, and low-risk given there's only one consumer of the shape today.

**Note on access control**: the parent "Support Ops" item's existing `internalOnly: true` flag already gates the whole group, including any of its sub-items — a Client-role user sees neither "Today" nor "Knowledge Base" in the nav, with zero new gating logic required on the frontend. This is a UI-consistency nicety only; the backend's own `canView()` check on the new endpoint (FR-008/FR-011) remains the actual, authoritative enforcement, exactly as it already is for `today()`.

**Output**: All Technical Context unknowns resolved via direct inspection of existing code; no `NEEDS CLARIFICATION` markers remain. Proceeding to Phase 1.
