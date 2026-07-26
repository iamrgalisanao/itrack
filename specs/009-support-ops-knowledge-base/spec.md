# Feature Specification: Support Ops Knowledge Base

**Feature Branch**: `009-support-ops-knowledge-base`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Support Ops Knowledge Base — a searchable, browsable history of previously resolved Support Ops issues, so internal team members can find how a similar issue was resolved before, reusing recorded root cause and resolution notes. Deferred out of 005-support-ops-automation's Phase 4, where it was scoped out because it is a persistent searchable view rather than a notification digest like that feature's other three Phase 4 items."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search resolved issues by keyword (Priority: P1)

A Team Member investigating a new client issue suspects something similar has happened before. Instead of asking around or re-diagnosing from scratch, they search a keyword — a client name, a symptom, a system component — and see past resolved issues that match, each showing what caused it and how it was fixed.

**Why this priority**: This is the entire reason the knowledge base exists — reusing recorded root cause and resolution knowledge instead of re-solving the same problem. Every other story is a refinement on top of this core capability.

**Independent Test**: As an internal team member, enter a keyword that appears in a previously resolved issue's name, client, root cause, or resolution text; confirm that issue appears in the results with its root cause and resolution visible, and that a keyword matching nothing returns an empty result set rather than an error.

**Acceptance Scenarios**:

1. **Given** a resolved issue with "database timeout" recorded in its root cause, **When** a Team Member searches "timeout", **Then** that issue appears in the results.
2. **Given** a resolved issue for client "Acme Corp", **When** a Team Member searches "Acme", **Then** that issue appears in the results, matched on client name rather than root cause or resolution text.
3. **Given** no resolved issue matches the searched keyword, **When** the search runs, **Then** the system returns an empty result set with no error.
4. **Given** a resolved issue with no root cause and no resolution recorded, **When** a search keyword matches its name or client, **Then** that issue does NOT appear in the results (see Edge Cases) — there is nothing to learn from an entry that records neither.
5. **Given** a resolved issue with a root cause recorded but a resolution left blank (or the reverse), **When** a search keyword matches it, **Then** that issue also does NOT appear in the results — a half-recorded answer to "how was this resolved" is still excluded, not just a completely blank one.

---

### User Story 2 - Browse resolved issues without a keyword (Priority: P2)

A Team Member doesn't have a specific keyword in mind — they just want to see what kinds of issues have come up recently for a particular client, or across a particular project, to get a general sense of recurring patterns before starting their own investigation.

**Why this priority**: Search only helps when the user already has the right word in mind. Browsing by project, client, tenant, or priority — the same dimensions the Support Ops board itself is already filtered by today — is what makes the knowledge base useful even when they don't have a keyword yet. A real, distinct use case, not a fallback for a broken search.

**Independent Test**: As an internal team member, open the knowledge base with no search keyword entered; confirm resolved issues appear, most recent first, and confirm narrowing by any one filter (project, client, tenant, or priority) reduces the list to only matching issues.

**Acceptance Scenarios**:

1. **Given** the knowledge base is opened with no keyword, **When** the page loads, **Then** resolved issues appear ordered most-recently-resolved first, without requiring a search term.
2. **Given** a client filter is applied, **When** results are shown, **Then** only resolved issues for that client appear.
3. **Given** both a keyword and one or more filters (project, client, tenant, priority) are applied at once, **When** results are shown, **Then** only resolved issues satisfying every applied keyword and filter simultaneously appear — every additional filter or keyword narrows the result set further, never widens it.

---

### User Story 3 - Open a search result's full context (Priority: P3)

Having found a promising past issue in the search results, a Team Member wants to see its full original context — not just the root cause and resolution summary, but the evidence, discussion, and any files attached — to judge whether it truly applies to their current problem before reusing its fix.

**Why this priority**: A root-cause/resolution snippet is often enough to confirm a match, but sometimes isn't — this story makes a search result fully actionable rather than a dead-end summary, closing the loop that Stories 1 and 2 open.

**Independent Test**: As an internal team member, select a result from the knowledge base; confirm it opens the exact same issue detail view already used elsewhere in the app (the same one reached by navigating to that issue directly through its project/board) — not a separate, knowledge-base-specific rendering of the issue.

**Acceptance Scenarios**:

1. **Given** a knowledge base search result, **When** a Team Member selects it, **Then** it opens the issue's existing, already-built detail view — evidence, discussion, and attachments included exactly as that view already shows them — rather than a new, separate summary screen built just for the knowledge base.
2. **Given** an issue has comments or attachments marked for internal audiences only, **When** an internal team member (Admin, PM, Team Member, or Department Head) opens that issue's full context from a knowledge base result, **Then** they see them exactly as they would if they had navigated there directly — the knowledge base introduces no new comment/attachment visibility rule of its own, it only links into the view that already enforces the existing one.
3. **Given** the selected issue belongs to a project the viewing user can otherwise access, **When** they open its full context, **Then** it opens successfully; if the user's access to that project has since changed, the same access rules that already govern that project apply — the knowledge base does not grant any extra reach.

---

### Edge Cases

- **What happens to a resolved issue with no root cause recorded, no resolution recorded, or both?** It is excluded from every knowledge base result — search, browse, or both — the moment either field is missing, not only when both are. Half of "how this was resolved" (the cause without the fix, or the fix without why it worked) is still an incomplete answer to the question this feature exists to answer, so the bar for inclusion is both, not either.
- **What counts as "no root cause recorded" or "no resolution recorded"?** A field that is empty, unset, or contains only whitespace after trimming — not merely "not literally null." An issue where someone typed a single space, a dash, or "N/A" into root cause or resolution to move past some other requirement is treated identically to one where the field was never touched at all.
- **Is a resolved issue matched by its status value or by the "Resolved" label shown on the board?** By the underlying status value the board already uses to render that column — the label is just display text for that value in the UI today and could change independently of it; matching on displayed text would silently break if that label copy is ever edited.
- **What happens to an issue that matches the search but belongs to a project the searching user cannot otherwise access?** It is silently excluded from results — never shown, never counted, never surfaced as "1 more result you can't see." The knowledge base's visibility is exactly as wide as the user's existing Support Ops access, never wider.
- **What happens to an issue that is not yet resolved (still open, in progress, or blocked)?** It never appears in the knowledge base at all — only resolved issues carry a settled, trustworthy root cause and resolution worth reusing. An in-progress issue's notes can still change.
- **What happens when a search keyword is very short (e.g., a single character) or matches an extremely common word?** The system still returns results — potentially many — rather than rejecting the search; no minimum keyword length is enforced. Result volume is a pagination concern, not a validation failure.
- **Does capitalization or exact wording matter when searching?** No — "ACME", "Acme", and "acme" all match the same client name, and a keyword only needs to appear anywhere within a matched field, not match it in full. A user should never have to guess the exact casing or complete wording originally typed into an issue.
- **Does a keyword match fields beyond the five defined for search (name, client, tenant, root cause, resolution)?** No — a keyword appearing only in an issue's other fields (e.g., its channel, evidence, or next-action notes) does not make that issue appear in results. The searchable field set is fixed and specific, not "search everything about the issue," so that what counts as a match stays predictable.
- **What happens if the same client name or keyword appears in issues across many different projects and departments?** All matching, resolved, accessible issues appear together in one result set — the knowledge base is not siloed per project or department; recurring patterns are often exactly what crosses those boundaries.
- **Can a Client-role user access the knowledge base?** No. Root cause and resolution notes routinely contain internal technical detail never intended for a client audience, regardless of whether the originating issue itself was ever marked client-visible. Access is restricted to the same internal roles already permitted to view the Support Ops board today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an internal team member to search resolved Support Ops issues by a single free-text keyword, matching against exactly five fields — the issue's name, client name, tenant name, root cause, and resolution — and no others.
- **FR-001a**: Keyword search MUST be case-insensitive and MUST match a partial occurrence anywhere within a searched field, not require matching a field's complete, exact value.
- **FR-002**: System MUST return resolved-issue search results even when zero results match, without producing an error.
- **FR-003**: System MUST include a resolved issue in any knowledge base result — search or browse — only if it has both a non-blank root cause AND a non-blank resolution recorded; if either is blank, the issue MUST be excluded. "Blank" means empty, unset, or containing only whitespace once leading/trailing whitespace is trimmed — not only a literal absence of any value.
- **FR-004**: System MUST exclude any issue that is not in a resolved state from every knowledge base result, identified by the same underlying status value already used to render the Support Ops board's "Resolved" column — never by matching that column's displayed label text.
- **FR-005**: System MUST allow browsing resolved issues with no keyword entered, and MUST order every knowledge base result — with or without a keyword, with or without filters applied — most-recently-resolved first, consistently.
- **FR-006**: System MUST allow narrowing results by project, client, tenant, and issue priority, individually or in any combination, independent of whether a keyword is also entered.
- **FR-006a**: When a keyword and one or more filters (FR-006) are supplied together, System MUST return only results satisfying all of them simultaneously (logical AND) — an additional keyword or filter MUST narrow the result set, never widen it.
- **FR-006b**: System MUST present knowledge base results in bounded pages rather than returning every matching issue at once, consistent with how every other list view in this app that can grow large already paginates.
- **FR-007**: System MUST scope every knowledge base result to only the projects the requesting user can already access through Support Ops today, using that exact same per-role accessibility rule — never a new or looser one.
- **FR-008**: System MUST restrict knowledge base access to the same internal roles already permitted to view the Support Ops board (Admin, Project Manager, Team Member, Department Head). A Client-role user MUST be denied — including a direct request that bypasses the UI entirely, not only by omitting a UI entry point for them.
- **FR-009**: System MUST allow a user to reach an individual result's complete original issue detail view — the same detail view already used to display that issue outside the knowledge base, not a separate reimplementation of it — from within the knowledge base.
- **FR-009a**: The detail view reached via FR-009 MUST apply exactly the comment/attachment visibility rules that view already enforces today — this feature MUST NOT introduce any new or different visibility rule for an issue's comments or attachments.
- **FR-010**: System MUST NOT alter, duplicate, or separately store any Support Ops issue data as part of providing this search/browse capability — the knowledge base is a read-only view over existing issue records, never a second source of truth for them.
- **FR-011**: System MUST enforce every access restriction in this feature at the point results are actually produced, never as a client-side-only filter that a direct request could bypass.

### Key Entities

- **Resolved Support Issue** (view, not a new stored entity): A previously existing Support Ops issue that has reached a resolved state and has both a root cause and a resolution recorded. The knowledge base is a searchable/browsable read-only view over already-existing issue records meeting this condition — it introduces no new data of its own.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An internal team member can find a relevant previously resolved issue by keyword without knowing that issue's exact name — verified by searching on a client name, symptom, or root-cause term rather than the issue title itself.
- **SC-002**: 100% of knowledge base results have both a recorded root cause and a recorded resolution, neither blank (including whitespace-only) — zero results missing either, verified by automated test.
- **SC-003**: 100% of knowledge base results are drawn only from projects the requesting user can already access — zero results from an inaccessible project, verified by automated test across every internal role, and zero results of any kind for the Client role.
- **SC-004**: A user can go from a search result to that issue's complete original context — the same detail view already used elsewhere in the app — in a single action, without manually reconstructing which project or board it belongs to.
- **SC-005**: A search or browse request never returns an unbounded number of results in one response, regardless of how many resolved issues accumulate over time.

## Assumptions

- **No new database table or column.** A "resolved Support Ops issue" already exists today as a `DetailedActivity` record with a support-eligible work type, a resolved status, and (when properly documented) root cause and resolution text already captured on that same record. This feature adds a new read-only search/browse capability over that existing data, not a new entity, migration, or duplicate copy of it.
- **Visibility mirrors existing Support Ops access exactly, via the same project-accessibility rule already used elsewhere in Support Ops (e.g., the existing cross-project "Today" view).** No new authorization concept is introduced; a user sees the same projects here that they can already see on the Support Ops board.
- **Search is a simple, case-insensitive, partial-match keyword lookup across exactly five fixed fields (name, client, tenant, root cause, resolution), not a ranked or fuzzy full-text search engine.** No existing search infrastructure (indexing service, relevance scoring) exists in this codebase to build on, and nothing in this feature's motivation calls for one — straightforward substring matching, consistent with this app's one existing search precedent (user account search by name/email), is sufficient for browsing a team's own resolved-issue history.
- **"Resolved" is identified by the same underlying status value Support Ops already uses to render its board's "Resolved" column today** — never by matching that column's displayed label text, which could change independently of the value it represents. This feature does not introduce a second, separate notion of completion.
- **Filtering dimensions (project, client, tenant, priority) mirror the Support Ops board's own existing filter vocabulary exactly** (the board already filters by client, tenant, and priority today) — no new filter concept is introduced, only the same ones made to work across projects and over history instead of within one project's live board.
- **"Full original context" means routing into the same, already-existing issue detail view used elsewhere in the app — never a second, knowledge-base-specific rendering of an issue's evidence, comments, or attachments.** This is a deliberate design boundary, not just a UX preference: reusing the existing view means this feature inherits that view's existing comment/attachment visibility rules automatically and exactly, with no new visibility logic to build, test, or keep in sync as those rules evolve.
- **No editing, re-opening, or any other mutation of an issue happens through the knowledge base.** It is a discovery/reference surface only; any correction to a past issue's root cause or resolution happens through the existing Support Ops board, not here.
- **This feature depends on Support Ops issues already having root cause and resolution fields to search** (they do — captured since the original Support Ops Tracker feature), on the existing project-accessibility mechanism used throughout Support Ops, and on the existing issue detail view's own comment/attachment visibility enforcement; it does not modify any of the three.
