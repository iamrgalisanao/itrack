# Feature Specification: Support Ops Automation

**Feature Branch**: `005-support-ops-automation`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Phase 4 of the Support Ops module (docs/support_ops_module_plan.md): Automation. Add a daily open-issue summary, a notification when a client update is overdue, and a weekly review report — building on the existing Support Ops board (002) and Today dashboard (004)."

**Scope note**: This spec covers only the three notification-style stories below (overdue notification, daily summary, weekly report). The module plan's fourth Phase 4 item — a repeated-issue knowledge base — is a structurally different feature (a searchable/browsable view, not a notification) and has been explicitly deferred to its own future spec rather than bundled in here.

**Delivery model** (resolved during specification): "Automation" in this phase means **on-access (lazy) generation** — the same mechanism this app's existing notifications (assignments, mentions, task due-dates) already use: content is generated the next time a relevant page is visited, deduplicated so the same crossing/day/week is never regenerated, not delivered on a genuine wall-clock schedule independent of anyone opening the app. A true scheduled-delivery phase (new job/queue infrastructure, retries, timezone-aware delivery windows) is an explicit future increment, not part of this spec. To avoid overpromising, this feature is never described to users as "automatic" or "scheduled" delivery — see FR-008.

**Recipient model** (resolved during specification — architecture review, 2026-07-23): every notification in this app today is retrieved by role alone (every user sharing a role sees the exact same notification rows) — fine for the existing types, which are genuinely role-wide announcements. This feature's content is different: two users who share a role (e.g. two Team Members in different departments) MUST NOT see each other's daily summary, weekly report, or an overdue entry for an issue only one of them can access — each is personal, access-scoped content, not a role-wide announcement. This feature therefore MUST target and retrieve by **individual recipient**, never by role alone, for all three of its entry types — see FR-001, FR-004, FR-005, and FR-006.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See overdue client updates in your notifications, not just on the Today board (Priority: P1)

An internal user is not staring at the Today view all day. Right now, a stale client update is only visible if someone happens to open Support Ops or Today — nothing surfaces it anywhere else. This story adds an entry to the existing notification feed for a support issue that has crossed its staleness threshold, generated the next time the user's notifications are loaded (the same lazy-generation model every existing notification type in this app already uses — not a scheduled push).

**Why this priority**: This is the single highest-leverage gap left after Phases 1-3 — staleness detection already exists (002), a triage view already exists (004), but neither one puts anything in front of the user outside that one screen. Without this, "automation" is really just "a screen you have to remember to check."

**Independent Test**: Can be fully tested by letting a support issue's client update cross its P1/P2/P3 threshold, then confirming each individual recipient's (per FR-001) notification list shows a new, correctly-worded overdue entry linking to that issue the next time they view notifications, and that a colleague sharing the same role but without access to that issue's project sees nothing — delivers value even if User Stories 2-3 are never built.

**Acceptance Scenarios**:

1. **Given** a support issue whose client update has crossed its staleness threshold, **When** a recipient (per FR-001) next views their notifications, **Then** a new entry appears identifying the issue, its client, and how overdue it is.
2. **Given** two users who share the same role, only one of whom can access the issue's project, **When** both view their notifications, **Then** only the one with access sees the entry — the other sees nothing for it, regardless of shared role.
3. **Given** a support issue that already has an overdue entry, **When** its client update is recorded (clearing the staleness), **Then** that entry is no longer shown as an active/urgent item for any recipient — the system does not keep nagging about an issue that's no longer stale.
4. **Given** a support issue that crosses its threshold and is never updated, **When** a recipient views notifications again later the same day, **Then** they are not shown a duplicate entry for the same overdue crossing.

---

### User Story 2 - See a daily open-issue summary without opening Today (Priority: P2)

An internal user wants a single, dated summary — "here's what's open and urgent as of today" — instead of needing to open the Today view every morning to reconstruct the same picture themselves.

**Why this priority**: Valuable daily-standup convenience once User Story 1's overdue entries exist, but secondary to it — a missed-update alert (US1) surfaces an actual client-facing risk; a summary is a convenience on top of information that's already reachable.

**Independent Test**: Can be fully tested by having open Support Ops issues across accessible projects, then confirming a dated summary appears once per day, listing counts per section (matching Today's four sections from 004), without needing User Story 1 or 3.

**Acceptance Scenarios**:

1. **Given** it is a new day and the user has not yet seen today's summary, **When** they next view their notifications, **Then** a dated summary appears with a count for each of Today's four sections (Stale, P1 — Watch Closely, Waiting for Client, Learning Priorities), reflecting only the projects that specific user can access.
2. **Given** the user has already seen today's summary, **When** they view notifications again later the same day, **Then** they are not shown a second, duplicate summary for the same day.
3. **Given** two users who share the same role but can access different projects, **When** both view today's summary, **Then** each sees counts reflecting only their own accessible projects — never each other's.
4. **Given** a user has access to zero projects with open Support Ops activity, **When** their daily summary is generated, **Then** it clearly states there is nothing open rather than being silently skipped (so its absence is never mistaken for "not working").

---

### User Story 3 - See a weekly review report (Priority: P3)

An internal user (particularly a Project Manager or Department Head) wants a retrospective rollup — issues opened, issues resolved, and issues still stale — covering the past week, for use in standups or management review.

**Why this priority**: Useful for oversight and retrospectives, but the least time-sensitive of the three notification-style stories — nothing in this report is actionable in the moment the way US1/US2 are.

**Independent Test**: Can be fully tested by having Support Ops activity (created, resolved, and still-open issues) across the past week, then confirming a weekly report appears once per week with correct opened/resolved/still-stale counts — delivers value independently of User Stories 1 and 2.

**Acceptance Scenarios**:

1. **Given** a week has just ended, **When** the user next views their notifications, **Then** a weekly report appears summarizing issues opened, issues resolved, and issues still stale during that week, scoped to their accessible projects.
2. **Given** the user has already seen this week's report, **When** they view notifications again later the same week, **Then** they are not shown a duplicate report for the same week.
3. **Given** two users who share the same role but can access different projects, **When** both view this week's report, **Then** each sees counts reflecting only their own accessible projects — never each other's.

---

### Edge Cases

- What happens if a user's project access changes (e.g., a department grant is revoked) between when a notification/summary/report was generated and when they view it? The content reflects access at generation time — same one-time-generated-then-stored behavior every other notification in this app already has; access changing later does not retroactively edit or hide already-generated notifications.
- What happens to an overdue notification (US1) for an issue that is later deleted? It is treated the same way this app already treats notifications for a deleted task — removed, not left dangling.
- What happens if a user has zero accessible projects at all (not just zero activity)? Daily/weekly digests still generate for them, stating there is nothing to report, rather than silently never appearing (same principle as 004's FR-010 empty-state requirement).
- What happens when the same issue is both overdue (US1) and part of the current day's summary (US2)? Both are shown — the summary is a rollup, not a replacement for the individual overdue entry; they are not required to suppress each other.
- What happens if a user holds a role that would normally receive an overdue entry (e.g. Project Manager) but genuinely cannot access that issue's project (should not happen under current role rules, but must not be assumed impossible)? They MUST NOT receive the entry — role membership alone is never sufficient; project access is always the deciding factor (FR-001, FR-006).
- What happens to an issue's `responsible` value when it names a role with several individual users in it (e.g. multiple Team Members in the same department)? All of them who can access the issue's project are eligible recipients (FR-001) — this feature does not attempt to guess a single "true" owner from a field that has only ever stored role text, not an individual assignee.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST deliver an overdue-update entry to every individual internal user who is both (a) eligible by role — Admin and Project Manager always; a Team Member or Department Head only when the issue's `responsible` field resolves to their role, mirroring the targeting this app's existing task-overdue notification already uses — and (b) able to access that issue's project under the existing role-based access rules. Role eligibility alone is never sufficient without project access, and project access alone is never sufficient without role eligibility.
- **FR-002**: An overdue-update entry MUST stop being treated as active/urgent, for every recipient it was delivered to, once the underlying staleness is cleared (the client update is recorded, or the issue is resolved) — it must not keep surfacing as urgent after the situation that caused it is gone. The entry MUST NOT be deleted when this happens (preserving the same never-destroy-history posture as this app's audit trail) — its urgency MUST instead be derived from the issue's current state rather than fixed permanently at the moment the entry was created, so a single, already-existing source of truth (the issue itself) decides whether it's still urgent, not a second, independently-drifting copy of that fact.
- **FR-003**: System MUST NOT create a duplicate overdue-update entry for the same issue crossing the same threshold, for the same recipient — one crossing produces exactly one entry per eligible recipient, matching the deduplication behavior already established for this app's other notification types.
- **FR-004**: System MUST provide a daily summary, generated at most once per calendar day for each individual internal user (Admin, Project Manager, Team Member, Department Head), showing a count of issues in each of the four sections already established by the Today dashboard (Stale, P1 — Watch Closely, Waiting for Client, Learning Priorities), scoped to the specific projects **that individual user** can access — never another user's accessible-project set, even one who shares the same role.
- **FR-005**: System MUST provide a weekly report, generated at most once per calendar week for each individual internal user, reporting issues opened, issues resolved, and issues still stale during that week, scoped to the specific projects that individual user can access.
- **FR-006**: Every entry introduced by this feature (overdue update, daily summary, weekly report) MUST be resolved, generated, and retrievable **per individual recipient** — never merely per role, and never falling back to role-only retrieval the way this app's pre-existing notification types do. Two users who share a role but have different project access, or who can access different sets of projects, MUST NOT be able to see each other's daily summary, weekly report, or an overdue entry for a project only one of them can access. (This app's other, pre-existing notification types remain genuinely role-wide announcements, continue to be retrieved by role, and are unaffected by this requirement — it applies only to the three entry types this feature introduces, which must always carry a specific individual recipient, never an unset/role-only one.)
- **FR-007**: A daily or weekly report MUST still be generated (with a "nothing to report" state) for a user with zero qualifying activity — never silently skipped, matching 004's empty-state precedent.
- **FR-008**: All three entry types (overdue update, daily summary, weekly report) MUST be generated on-access — the next time the relevant user's notifications are loaded — using the same lazy-generation, deduplicated mechanism this app's existing notification types already use, **not** a wall-clock-scheduled push. The system MUST NOT present or label this feature as "automatic" or "scheduled" delivery to users (e.g., no "Scheduled Daily Email" / "Automatic Morning Digest" framing), since no content actually appears until the user visits a page that triggers generation. A future increment may add genuine scheduled delivery; each entry's deduplication identity MUST include both the specific recipient and the specific period/crossing it represents (e.g. conceptually: "this overdue crossing, for this recipient", "this calendar day, for this recipient", "this calendar week, for this recipient") so that a future scheduled job could generate equivalent content without redesigning this identity scheme.
- **FR-009**: System MUST allow a user to distinguish an overdue-update entry, a daily summary, and a weekly report from each other and from existing notification types (assignment, mention, task-overdue, task-due-soon) at a glance.
- **FR-010**: Calendar-day and calendar-week boundaries (FR-004, FR-005) MUST be evaluated using one single, application-wide time reference — this app has no per-user timezone setting today, and introducing one is out of scope for this feature. A "week" MUST use the international Monday-start (ISO) week-numbering convention, to remove any ambiguity between that and a Sunday-start convention.
- **FR-011**: "Issues resolved during the week" (FR-005) MUST be determined from this app's existing status-change history (already recorded every time a task's status is updated, independent of this feature) — specifically, a transition into the resolved/completed status occurring within that week — not from a field that does not yet exist. If no such history is available for a given issue (e.g., it was already resolved before this feature existed), it is simply not counted as "resolved during the week" — it is not miscounted as resolved in a week it wasn't.

### Key Entities

- **Support Issue** *(existing, from 002-support-ops-tracker)*: Source of every notification/summary/report this feature produces. No new fields are added to it by this feature.
- **Notification** *(existing app-wide concept, already used for assignments/mentions/task due-dates)*: This feature adds new kinds of notification content (overdue-update, daily summary, weekly report), delivered to an individual recipient rather than broadcast by role (FR-006) — a distinction this entity already has a place for today (an individual-recipient field exists but is not yet used by anything), so this is a new way of *using* the existing concept, not a second, parallel notification system.
- **Status Change History** *(existing app-wide concept, already recorded whenever a task's status is updated)*: Source of "issues resolved during the week" (FR-011) — this feature reads it, it does not add to what's tracked or when.
- **Project** *(existing)*: Determines which issues' activity counts toward a given user's summary/report, via the existing role-based access rule.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user learns that a client update has gone overdue without having to open Support Ops or Today to discover it themselves.
- **SC-002**: A user can answer "what's open and urgent today" and "how did last week go" from their notifications alone, without reconstructing either picture by hand from the Today view or the board.
- **SC-003**: 100% of overdue-update notifications, daily summaries, and weekly reports respect the same project access a user already has everywhere else in the app — none ever reveal a project-scoped issue the viewing user couldn't otherwise see, and none ever reveal another user's personal digest content merely because they share a role.
- **SC-004**: No user ever receives two notifications for the same overdue crossing, the same day's summary, or the same week's report.
- **SC-005**: Zero instances, across any role, of one user seeing content (an overdue entry, a daily summary, or a weekly report) that was generated for a different individual user.

## Assumptions

- **Builds only on 002/004, no new staleness math**: The P1/P2/P3 thresholds and four-section classification are exactly what 002 (board) and 004 (Today) already established — this feature does not redefine or recompute staleness, it reacts to it.
- **Notification delivery reuses the existing mechanism, corrected to per-recipient targeting**: This app already has a deduplicated, read/unread notification concept (used today for assignments, mentions, and task due-dates) — but those existing types are retrieved by role, which is safe only because they're genuinely role-wide announcements. This feature's content is personal (a specific user's accessible-project scope), so it must be targeted and retrieved per individual recipient instead — an existing, already-present-but-unused field on this same concept exists for exactly this purpose, so this is a correction to how the existing mechanism is used, not a second, parallel notification system. Consistent with Constitution Principle II's "one consistent way to do this" spirit.
- **No new schema for Support Issue itself**: Every field this feature reads (`client_priority`, `status`, `last_client_update_at`, `root_cause`, `resolution`, etc.) already exists from 002 — this phase is generation/delivery of notifications from existing data, not new issue fields.
- **No new schema for notifications either**: The individual-recipient field this feature needs already exists on the notification concept today, unused — this feature is the first to populate it, not the first to require a migration for it.
- **Reuses existing role-based project access**: Same `accessibleTo`-equivalent scoping already used by 004 and Reports — no new access-control concept introduced.
- **Single application-wide timezone, ISO week boundaries**: Per FR-010 — no per-user timezone concept exists in this app today, and adding one is out of scope here.
- **"Resolved during the week" reuses existing status-change history**: Per FR-011 — this app already records every status transition (including a transition into the resolved/completed status) independent of this feature; this feature reads that record rather than inventing new tracking.
- **Delivered through the existing single notification surface**: This app has one notification surface today (the bell dropdown) and no separate full notifications page — this feature's three entry types appear there too, not in a new surface.

