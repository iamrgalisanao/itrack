# Feature Specification: Retro Entry Discussion, Attachments & Decision

**Feature Branch**: `015-retro-entry-context`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Extend the Retrospectives feature (013-sprint-retrospectives, 014-retro-table-view) with the three gaps identified by comparing against monday.com's actual retrospective workflow: a discussion thread per retro entry, file attachments per retro entry, and a distinct recorded-decision field, separate from the entry's original topic text. Discussion thread: each retro entry supports a flat list of comments (no threaded replies — matches the existing Comment system already used for DetailedActivity in Work Program). Comments visible to the same internal roles that can already view the session; Client denied. Posting a comment follows the same canWrite() + project-access rule already used for adding entries — not restricted to the entry's author. Reuse the existing @mention convention already used by DetailedActivity's Comment system. File attachments: each retro entry supports file attachments using the exact same storage mechanism, MIME whitelist, size limit, and streamed-download pattern already used by DetailedActivity's Attachment system. Uploading follows the same canWrite() + project-access rule as adding entries. Deleting an attachment follows the entry's existing author-or-Admin/PM moderation rule. Recorded decision: each retro entry gains a separate 'decision' text field, distinct from its original topic text (body), for recording the outcome the team agreed on during the retrospective meeting. Editing the decision field follows the same author-or-Admin/PM permission surface as editing body/sentiment. Explicitly out of scope: threaded replies, @mention autocomplete UI, any visibility/client-visible distinction, a formal Sprint entity, and session active/completed status lifecycle."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discuss a topic without losing the original report (Priority: P1)

An internal team member (Admin, Project Manager, Team Member, or Department
Head) opens a retro entry and adds context, evidence, or follow-up
discussion as comments — without editing the entry's original feedback
text. Anyone with view access to the session can read the comment thread;
anyone with write access and project access can add to it, not just the
entry's original author.

**Why this priority**: This is the core gap the request is about — today,
any additional context has nowhere to go except overwriting the original
report. Attachments and the decision field both build on the same
comment-thread surface area (a place to add supporting detail), so this
ships first.

**Independent Test**: As a Team Member who did not author a given entry,
add a comment to it; confirm it appears immediately with the commenter's
identity and timestamp, and confirm the entry's original feedback text is
unchanged.

**Acceptance Scenarios**:

1. **Given** a retro entry with no comments yet, **When** a write-capable
   user with project access posts a comment, **Then** it appears in the
   entry's comment list immediately, attributed to that user with a
   timestamp.
2. **Given** an entry with existing comments, **When** any internal role
   that can already view the session opens it, **Then** they see the full
   comment list in chronological order — comments are not restricted to
   the entry's author or moderators to view.
3. **Given** a comment mentioning another user by role (e.g. "@Project
   Manager"), **When** the comment is posted, **Then** the mention
   notification behavior is identical to how DetailedActivity comments
   already handle mentions — no new mention mechanism is introduced.
4. **Given** a Client-role user, **When** they attempt to view or post a
   comment on any retro entry (directly via the API, not just the UI),
   **Then** they are denied, matching every other Retrospectives access
   rule.
5. **Given** a comment already posted, **When** any user (including its
   author) attempts to edit or delete it, **Then** the action is not
   available — this feature does not add comment editing or deletion.

---

### User Story 2 - Attach evidence to a topic (Priority: P2)

A write-capable team member attaches a screenshot, log file, or report to
a retro entry as supporting evidence, the same way files are already
attached to tasks in Work Program.

**Why this priority**: Builds on the same "add context without editing the
original entry" need as US1, but text comments alone already unblock most
discussion — attachments are a refinement, not a blocker for the rest of
this feature.

**Independent Test**: As a Team Member with project access, upload a
screenshot to an entry; confirm it appears in the entry's file list and
can be downloaded by another internal user; confirm a disallowed file type
is rejected.

**Acceptance Scenarios**:

1. **Given** a retro entry, **When** a write-capable user with project
   access uploads a file of an allowed type and within the size limit,
   **Then** it appears in the entry's attachment list, attributed to the
   uploader.
2. **Given** an attached file, **When** any internal role that can view
   the session downloads it, **Then** they receive the original file
   content and filename — never a raw storage path.
3. **Given** an upload of a disallowed file type or over the size limit,
   **When** it is attempted, **Then** it is rejected with a clear error
   and nothing is stored.
4. **Given** an attachment uploaded by a given user, **When** that user,
   or separately an Admin/Project Manager, deletes it, **Then** it is
   removed from both the file list and underlying storage.
5. **Given** an attachment uploaded by another user, **When** a Team
   Member who is neither the uploader nor Admin/PM attempts to delete it,
   **Then** the action is denied — matching the entry's existing
   author-or-Admin/PM moderation rule.
6. **Given** a Client-role user, **When** they attempt to view, upload, or
   download any retro entry's attachments (directly via the API), **Then**
   they are denied.

---

### User Story 3 - Record what the team decided (Priority: P2)

The person moderating a retro entry (its author, or an Admin/Project
Manager) records the outcome the team agreed on during the retrospective
meeting — a decision, an improvement to try, or a note that no change is
needed — in a field visibly separate from the entry's original report, so
the original report and the eventual outcome remain independently
readable.

**Why this priority**: Depends on nothing else in this spec to be useful
on its own, but it's the payoff of the discussion captured in US1 — the
natural point to conclude that discussion — so it's sequenced alongside
attachments rather than before them.

**Independent Test**: As the author of an entry, record a decision;
confirm it displays separately from the original feedback text and
persists after reload; confirm a non-author, non-Admin/PM Team Member
cannot record or change it.

**Acceptance Scenarios**:

1. **Given** a retro entry with no decision recorded, **When** a user
   permitted to edit that entry (its author, or Admin/PM) enters a
   decision, **Then** it is saved and displayed separately from the
   entry's original feedback text.
2. **Given** an entry with a decision already recorded, **When** a
   permitted user changes it, **Then** the update is saved and the
   original feedback text is unaffected.
3. **Given** a Team Member who is neither the entry's author nor
   Admin/PM, **When** they attempt to set or change the decision
   (directly via the API, not just the UI), **Then** they are denied —
   the same permission surface as editing the entry's body/sentiment.
4. **Given** an entry with no decision recorded, **When** any internal
   role views it, **Then** the absence of a decision is visually distinct
   from an empty string — it reads as "no decision recorded yet," not as
   a blank/broken field.

### Edge Cases

- An entry is deleted (013's existing delete capability): its comments and
  attachments are deleted along with it — no orphaned comment or
  attachment rows survive a deleted entry.
- A user's project access is revoked after they posted a comment or
  attachment: their existing comments/attachments remain visible to
  others (this feature does not retroactively hide past contributions),
  but they can no longer post new ones, consistent with 013's F1
  precedent for entry edits.
- An attachment upload fails partway (network interruption): no partial
  file or orphaned database row remains — either the upload fully
  succeeds or nothing is recorded, matching the existing DetailedActivity
  Attachment system's behavior.
- A Department Head (view-only role throughout Retrospectives): can read
  comments and download attachments, but cannot post comments, upload
  attachments, or record a decision — consistent with 013's existing
  view-only rule for this role.
- The decision field is set, then the entry's Type (sentiment) is later
  changed via 014's table view: these are independent fields: changing
  one does not alter or clear the other.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every retro entry MUST support an associated list of
  comments, each with author, body text, and timestamp.
- **FR-002**: Comments MUST be visible to every role that can already view
  the entry's session (Admin, Project Manager, Team Member, Department
  Head); Client-role users MUST be denied, matching every other
  Retrospectives access rule.
- **FR-003**: Posting a comment MUST require the same write-capable-role +
  project-access check already used for adding a retro entry — not
  restricted to the target entry's author.
- **FR-004**: This feature MUST NOT introduce comment editing or deletion
  — comments are append-only once posted.
- **FR-005**: This feature MUST NOT introduce threaded replies — comments
  are a flat, chronological list per entry.
- **FR-006**: Mentioning another user in a comment MUST behave identically
  to the existing mention behavior already used for DetailedActivity
  comments — no new mention mechanism, and no autocomplete UI, is
  introduced.
- **FR-007**: Every retro entry MUST support an associated list of file
  attachments, each with the uploader, original filename, file type, and
  size.
- **FR-008**: Uploading an attachment MUST require the same
  write-capable-role + project-access check already used for adding a
  retro entry.
- **FR-009**: Attachment uploads MUST be restricted to an allow-listed set
  of file types and MUST be rejected above a defined size limit, matching
  the constraints already enforced for DetailedActivity attachments.
- **FR-010**: Downloading an attachment MUST return the original file
  content and filename, and MUST NOT expose the underlying storage path
  or location to the client.
- **FR-011**: Deleting an attachment MUST be restricted to the entry's
  existing author-or-Admin/PM moderation rule — the same permission
  surface already governing entry body/sentiment edits and deletes.
- **FR-012**: Every retro entry MUST support a single "decision" field,
  distinct and independently readable from the entry's original feedback
  text.
- **FR-013**: Setting or changing the decision field MUST be restricted to
  the entry's existing author-or-Admin/PM moderation rule.
- **FR-014**: An entry with no decision recorded MUST be visually
  distinguishable from one with an empty/blank decision — the absence of
  a decision is its own state, not indistinguishable blank text.
- **FR-015**: Deleting a retro entry MUST also delete its comments and
  attachments — no orphaned records survive the parent entry's deletion.
- **FR-016**: This feature MUST NOT introduce any visibility or
  client-visible distinction on comments or attachments — Retrospectives
  remain internal-only end to end, unlike DetailedActivity's Comment/
  Attachment systems, which do need that distinction because Clients can
  reach DetailedActivity.

### Key Entities

- **Retro Entry Comment** (new): belongs to one Retro Entry; has an
  author (a real user, matching Retro Entry's own author convention, not
  DetailedActivity Comment's legacy name/role-string fields), body text,
  and a timestamp. Flat list, no parent/reply relationship.
- **Retro Entry Attachment** (new): belongs to one Retro Entry; has an
  uploader (a real user), original filename, stored file reference, file
  type, and size. No visibility field (unlike DetailedActivity's
  Attachment, which needs one).
- **Retro Entry** (existing, from 013/014): gains one new attribute, a
  nullable "decision" text field, independent of its existing body,
  sentiment, is_repeating, and owner attributes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team member can add supporting context to a retro entry
  (a comment) without modifying the entry's original reported text, in
  100% of cases — the original text is never altered by a comment action.
- **SC-002**: 100% of comments and attachments persist and remain
  attributed to their original author/uploader after a page reload.
- **SC-003**: No user without edit rights on a given entry can
  successfully record or change its decision field, in 100% of tested
  role/authorship combinations.
- **SC-004**: No user without write access and project access can
  successfully post a comment or upload an attachment, in 100% of tested
  role/access combinations.
- **SC-005**: Client-role users continue to have zero access to any retro
  entry's comments or attachments — no regression from the existing
  Retrospectives denial.
- **SC-006**: Deleting a retro entry leaves zero orphaned comment or
  attachment records, in 100% of tested deletions.

## Assumptions

- "Comments" and "Updates" (the term used in the monday.com reference
  material this feature is derived from) refer to the same concept; this
  spec uses "comments" to match the existing DetailedActivity terminology
  already used elsewhere in iTrack.
- Comment authorship uses Retro Entry's own real-user-FK convention
  (`author_user_id`), not DetailedActivity Comment's legacy mock-era
  `author`/`author_role` string fields — Retro Entry already made this
  modernization; this feature does not reintroduce the older pattern.
  Comments are still called "comments" throughout this spec, not "chat" or
  "updates," matching existing product terminology.
- The exact allow-listed file types and size limit are planning-phase
  decisions, not fixed by this spec — the requirement is that they match
  DetailedActivity's existing constraints, whatever those currently are,
  not that this spec hardcodes new limits.
- @mention syntax and notification delivery reuse the existing mechanism
  exactly; this spec does not define new mention syntax or a new
  notification channel.
- The decision field's absence-state (FR-014) is a presentation detail for
  the planning phase (e.g., a placeholder message) — this spec only
  requires that "no decision yet" and "decision explicitly left blank" are
  not visually identical states with no reasonable default other than
  showing a "no decision recorded yet" placeholder.
- Comments and attachments are not counted in 014's Repeating tally or
  vote totals footer — those remain scoped to entries only, unaffected by
  this feature.
