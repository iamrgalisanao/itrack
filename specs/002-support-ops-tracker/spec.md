# Feature Specification: Support Ops Tracker (Phase 1)

**Feature Branch**: `002-support-ops-tracker`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Add a Support Ops view inside iTrack as an operational layer on top of the existing detailed_activities task system, so client support/troubleshooting/learning work can be tracked without mixing into the general Kanban board. Phase 1 scope only: add support-specific fields to detailed activities (work_type, client_name, tenant_name, channel, client_priority, last_client_update_at, next_action, evidence, root_cause, resolution), add a dedicated /support-ops route with support-focused board columns (Intake, Needs Info, Needs TSMS Check, Investigating, Client Update Due, Resolved) backed by the existing status enum, a quick issue intake form, an issue detail modal with the new fields, and stale-client-update highlighting (P1 no update 1hr, P2 4hrs, P3 1 business day). Do not build Viber integration, Codex prompt generator, or automation in this phase — those are explicitly deferred to later phases per docs/support_ops_module_plan.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Triage support work on its own board (Priority: P1)

An internal user (Admin, Project Manager, Team Member, or — view-only,
matching how the existing Kanban Board already works — Department Head)
opens a dedicated Support Ops board that shows only client-support,
troubleshooting, and (optionally) learning work — not mixed in with every
other project task on the general Kanban board.

**Why this priority**: This is the foundation everything else in the feature
sits on. Without a separate board, there is nowhere for the rest of the
feature (intake, staleness, detail view) to live.

**Independent Test**: Sign in as an internal user, navigate to
`/support-ops`, and confirm the board shows six columns (Intake, Needs Info,
Needs Investigation, Investigating, Client Update Due, Resolved) containing only
tasks whose work type is support-related, while the existing Kanban Board at
`/kanban` is unchanged and still shows everything.

**Acceptance Scenarios**:

1. **Given** a project with a mix of regular project tasks and support
   issues, **When** an internal user opens Support Ops for that project,
   **Then** only the support issues appear, grouped into the six columns by
   their underlying status.
2. **Given** the same project, **When** the user opens the existing Kanban
   Board instead, **Then** they see the same tasks they always did —
   support issues are not hidden from it.
3. **Given** a signed-in Client-role user, **When** they attempt to reach
   `/support-ops`, **Then** they are denied, consistent with the existing
   Kanban Board's internal-only restriction.

---

### User Story 2 - Log a new client issue quickly (Priority: P1)

When a client reports a problem (e.g. over Viber, by phone, in person), an
internal user can capture it in iTrack in a single quick-entry form rather
than navigating the full Project → Module → Activity → Sub-Activity creation
flow used for regular project tasks.

**Why this priority**: The whole point of this feature is to stop missing
client follow-ups. If logging an issue is as slow as creating a normal task,
people will keep tracking issues in Viber/notes instead of iTrack, and the
feature fails its purpose.

**Independent Test**: From the Support Ops board, trigger "quick intake,"
fill in client, tenant, channel, priority, and issue title, submit, and
confirm a new card appears in the Intake column within the same view — no
navigation to Work Program or module/activity pickers required.

**Acceptance Scenarios**:

1. **Given** an internal user on the Support Ops board, **When** they submit
   the quick-intake form with client, tenant, channel, priority, issue
   title, timestamp, affected area/workflow, expected behavior, actual behavior,
   evidence, and next action, **Then** a new issue appears in the Intake
   column with `work_type = support`, `status = backlog`, and
   `progress = 0`.
2. **Given** the quick-intake form, **When** the user submits it without a
   required field (client, priority, or issue title), **Then** the form
   blocks submission and indicates what's missing, rather than creating a
   partially-filled issue.

---

### User Story 3 - See which issues need a client update now (Priority: P2)

An internal user glances at the Support Ops board and can immediately tell
which open issues have gone too long without the client being updated,
without manually checking timestamps one by one.

**Why this priority**: This directly answers the stated goal — "which
clients have not received an update recently?" — and is the highest-value
piece beyond just having a board, but it depends on User Story 1 existing
first.

**Independent Test**: Set one issue's last-client-update timestamp past its
priority's threshold (e.g. a P1 issue with no update for over an hour) and
confirm it is visually flagged on the board; confirm a fresh P1 issue
updated 10 minutes ago is not flagged.

**Acceptance Scenarios**:

1. **Given** an open P1 issue last updated 61 minutes ago, **When** the
   Support Ops board renders, **Then** that issue's card is visually flagged
   as stale.
2. **Given** an open P2 issue last updated 3 hours ago, **When** the board
   renders, **Then** it is not flagged (under its 4-hour threshold).
3. **Given** a P1 issue that has been moved to Resolved, **When** the board
   renders, **Then** it is never flagged as stale regardless of its last
   update time — resolved issues are done, not overdue.
4. **Given** an issue with no priority set, **When** the board renders,
   **Then** it is not flagged as stale (there is no threshold to compare
   against) — it should instead be visually distinguishable as
   "priority not set" so it doesn't look silently fine.

---

### User Story 4 - Track full investigation context on an issue (Priority: P2)

An internal user opens any support issue's detail view and can read or
update the client, tenant, channel, priority, next action, evidence,
root cause, and resolution — alongside the comments and attachments already
available on every task in iTrack.

**Why this priority**: Intake (US2) captures the initial report; this is
where the actual troubleshooting narrative accumulates over the life of the
issue. Without it, Support Ops is just a fancier list with no working
memory.

**Independent Test**: Open an existing support issue's detail view, edit its
next action and root cause, save, and confirm the changes persist and are
visible the next time the issue is opened.

**Acceptance Scenarios**:

1. **Given** an existing support issue, **When** an internal user opens its
   detail view, **Then** they see all support-specific fields plus the
   existing comments and attachments panels already used elsewhere in
   iTrack.
2. **Given** the detail view is open, **When** the user updates
   `next_action`, `evidence`, `root_cause`, or `resolution` and saves,
   **Then** the change is persisted and reflected on the board card where
   relevant (e.g. next action).
3. **Given** the detail view is open, **When** the user records a new
   client-facing update, **Then** `last_client_update_at` is set to now and
   any stale flag on that issue's card clears immediately.

---

### User Story 5 - Narrow the board to what matters right now (Priority: P3)

An internal user filters the Support Ops board by client, tenant, priority,
work type, or "needs a client update" so a growing list of issues stays
usable.

**Why this priority**: Valuable once issue volume grows, but the board is
still usable without it on day one — lowest priority of the five.

**Independent Test**: With several issues of different clients and
priorities on the board, apply a client filter and confirm only that
client's issues remain visible; clear it and confirm all return.

**Acceptance Scenarios**:

1. **Given** issues from multiple clients on the board, **When** the user
   filters by one client, **Then** only that client's issues are shown.
2. **Given** the same board, **When** the user filters to "needs update"
   only, **Then** only currently-stale issues are shown.

---

### Edge Cases

- An issue with no `client_priority` set is never flagged as stale (no
  threshold exists to compare against) but is visually marked as
  "priority not set" so it doesn't read as quietly fine — see US3 scenario 4.
- A `learning`-type entry (per the existing `work_type` taxonomy) does not
  appear on the default Support Ops board — it only appears when a
  "Learning" filter is explicitly enabled, per the source plan.
- Existing detailed activities created before this feature (or created
  through the regular Work Program / Kanban flow after this feature ships)
  default to `work_type = project` and never appear on the Support Ops board
  unless someone explicitly changes their work type.
- A quick-intake submission still needs a place in the existing
  Project → Module → Activity → Sub-Activity hierarchy to attach to (that's
  how every task in iTrack is structured today) — see Assumptions for how
  this is resolved without making intake feel slow.
- Moving an issue between Support Ops columns updates the same underlying
  `status` field the general Kanban Board already uses — an issue moved on
  one board is reflected on the other immediately, since they're the same
  record.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let users who can already write tasks today (Admin,
  Project Manager, Team Member — the existing `canWrite()` role set; not
  Department Head, matching the rest of the task system) create a new
  support issue through a single quick-intake form capturing: client,
  tenant, channel, priority, issue title, timestamp, affected area/workflow,
  expected behavior, actual behavior, evidence, and next action.
- **FR-002**: System MUST store `work_type`, `client_name`, `tenant_name`,
  `channel`, `client_priority`, `last_client_update_at`, `next_action`,
  `evidence`, `root_cause`, and `resolution` on the existing task record
  (detailed activity), defaulting `work_type` to `project` for every task
  that doesn't come through Support Ops intake.
- **FR-003**: System MUST provide a `/support-ops` view showing exactly six
  columns — Intake, Needs Info, Needs Investigation, Investigating, Client
  Update Due, Resolved — mapped to the existing status values `backlog`,
  `blocked`, `not_started`, `in_progress`, `for_review`, and `completed`
  respectively.
- **FR-004**: System MUST let a user move an issue between Support Ops
  columns, updating the same underlying status field the general Kanban
  Board already reads and writes.
- **FR-005**: System MUST visually flag any open (non-`completed`) support
  issue whose `last_client_update_at` exceeds its priority's staleness
  threshold: P1 → 1 hour, P2 → 4 hours, P3 → 1 business day.
- **FR-006**: System MUST visually distinguish an issue with no
  `client_priority` set from both "fresh" and "stale" issues, since
  staleness cannot be evaluated without a priority.
- **FR-007**: System MUST provide an issue detail view showing every
  support-specific field alongside the existing comments and attachments
  panels already available on task records.
- **FR-008**: System MUST let users who can write tasks today (Admin, Project
  Manager, Team Member) update any support-specific field from the detail
  view, including recording a new client-facing update (setting
  `last_client_update_at` to the current time and clearing any stale flag
  immediately). Team Member's existing field-level write restrictions (they
  cannot change governance-sensitive fields like `responsible` or
  `client_visible` today) MUST be extended to explicitly permit the new
  support-specific fields — otherwise the people most likely to work support
  tickets day-to-day would be unable to update them.
- **FR-009**: System MUST let a user filter the Support Ops board by client,
  tenant, priority, work type, and staleness ("needs update").
- **FR-010**: System MUST NOT change the behavior of the existing Kanban
  Board, Work Program, Schedule, or Reports views for any task regardless of
  its `work_type` — those views continue to show and treat all tasks exactly
  as they do today.
- **FR-011**: System MUST restrict *viewing* `/support-ops` to the same
  internal-only audience as the existing Kanban Board (Admin, Project
  Manager, Team Member, Department Head), denying the Client role and any
  user whose role cannot be validated (fail-closed, consistent with the
  project's access-control principle). *Writing* (creating or updating an
  issue) is further restricted to the `canWrite()` role set per FR-001/FR-008
  — Department Head can view the board but not create or edit issues on it,
  matching their read-only relationship to tasks elsewhere in iTrack.
- **FR-012**: System MUST exclude `learning`-work-type entries from the
  default Support Ops board view, showing them only when a user explicitly
  enables a "Learning" filter.

### Key Entities *(include if feature involves data)*

- **Support Issue**: Not a new entity — an existing "detailed activity" task
  record carrying the new support-specific fields (client, tenant, channel,
  priority, last client update time, next action, evidence, root cause,
  resolution) alongside its existing fields (name, description, status,
  progress, comments, attachments). A task is a "support issue" purely by
  virtue of `work_type = support`.
- **Client / Tenant**: Free-text identifiers stored directly on the task
  record (`client_name`, `tenant_name`) — not separate managed entities in
  this phase. No client/tenant directory is introduced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An internal user can log a new client-reported issue in one
  form, in under 60 seconds, without navigating through project/module/
  activity pickers.
- **SC-002**: 100% of open support issues whose last client update exceeds
  their priority's threshold are visually flagged, with zero false
  positives for issues within threshold.
- **SC-003**: A user can answer "which clients need attention today,"
  "which issues are waiting on the client," "which need technical investigation,"
  and "what's the next action" for every open issue, using only the
  Support Ops board and its filters — without cross-referencing Viber,
  spreadsheets, or notes.
- **SC-004**: Zero behavior change in the existing Kanban Board, Work
  Program, Schedule, or Reports views for tasks of any `work_type` —
  verified by exercising each of those views against data that includes
  support-type tasks before and after this feature ships.
- **SC-005**: A support issue's full investigation history (next action,
  evidence, root cause, resolution) is visible in one place (the detail
  view) without needing to read through comment threads to reconstruct it.

## Assumptions

- This feature depends on the real-auth cutover
  (`specs/001-real-auth-cutover/`) already being in place — `/support-ops`'s
  internal-only restriction is enforced against the authenticated user's
  real role, the same way the Kanban Board's guard is.
- Quick intake still needs a parent Sub-Activity to attach the new task
  record to (matching how every task in iTrack is structured today). To
  keep intake feeling quick rather than making users navigate the full
  hierarchy, each project gets one auto-provisioned "Support Requests"
  container (a dedicated Module → Activity → Sub-Activity chain, created on
  first use) that all Support Ops intake submissions attach under
  automatically. The user only picks a Project on the intake form, nothing
  deeper.
- Support Ops issues are scoped to one selected project at a time, matching
  the existing Project selector pattern already used in Work Program and
  Schedule — this is not a cross-project inbox in Phase 1.
- No new roles or permissions are introduced — access is gated on the same
  internal-vs-Client distinction the Kanban Board already uses, not on a new
  "Support" role.
- Per the source plan (`docs/support_ops_module_plan.md`), Viber
  integration, the Codex troubleshooting-packet generator, Viber response
  templates, and any automation (daily summaries, overdue notifications,
  weekly reports) are explicitly out of scope for this feature — Phase 1
  only.
- `client_visible` on existing tasks is unaffected by this feature; support
  issues follow the same client-visibility rules as any other task unless a
  future phase says otherwise.
