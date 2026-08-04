# Feature Specification: Retrospective Table View

**Feature Branch**: `014-retro-table-view`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "Follow-up to 013-sprint-retrospectives: rework the Retrospectives session view from a 3-column Kanban board into a monday.com-style grouped table view, and add two new pieces of data that don't exist yet. Layout: replace the side-by-side Keep/Improve/Discuss lanes with three collapsible groups (Keep, Improve, Discuss), each rendering its entries as a table with columns: Feedback, Submitter, Type (the sentiment), Repeating?, Vote, Owner. Keep the existing 'Add Entry' affordance (inline row or modal, whichever fits the table layout better) — do not add a generic '+' custom-column feature; iTrack's columns stay fixed-schema, this is not a board-customization engine. New field — 'Repeating?': each retro entry gets a boolean flag, settable by whoever can moderate that entry (existing author-or-Admin/PM edit permission from 013, FR-007), indicating this feedback is a recurring issue raised before. This is a per-entry flag set by a human, not automated cross-session trend detection — 013's spec explicitly excluded analytics/trend reporting across sessions, and that exclusion still holds; nothing here computes repetition automatically. New computed value — session vote totals footer: each session's table view shows 'Total votes: N' (sum of all entries' vote counts in that session) and 'Total voters: M' (count of distinct users who cast at least one vote anywhere in that session). Read-only, computed at read time the same way per-entry vote_count already is (013's join-table voting pattern, no stored counters). Access control, roles, and all other constraints from 013-sprint-retrospectives (internal-only: Admin/PM/Team Member/Department Head; Client denied; Department Head remains view-only) carry over unchanged — this is additive to that feature, not a redesign of its permissions."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse a session as a single grouped table (Priority: P1)

An internal team member (Admin, Project Manager, Team Member, or Department
Head) opens a retro session and sees every entry in that session — Keep,
Improve, and Discuss mixed together — as one collapsible table listing
Feedback, Submitter, Type, Repeating?, Vote, and Owner, replacing the
current side-by-side card-lane layout. The retro session itself is the
"group": creating a new session already creates a new named table (matching
how "New Session" already works), so no additional grouping concept is
introduced. Type is a per-row value (shown as a color-coded indicator,
chosen from the same Keep/Improve/Discuss set already used when authoring
an entry) rather than a mechanism that splits entries into separate
sub-tables.

**Why this priority**: This is the core visual rework the request is about;
every other piece of this feature (the Repeating flag, the vote totals
footer) is displayed inside this table and has no standalone surface without
it.

**Independent Test**: Open a session with entries across all three
sentiments as a Team Member; confirm one collapsible table appears
containing every entry with the six named columns and a per-row Type
indicator, and collapsing/expanding the table does not lose or duplicate
entries.

**Acceptance Scenarios**:

1. **Given** a retro session with entries in Keep, Improve, and Discuss,
   **When** a Team Member opens the session, **Then** one collapsible table
   is shown containing all of that session's entries, each row displaying
   Feedback, Submitter, Type, Repeating?, Vote, Owner.
2. **Given** the session's table is expanded, **When** the user collapses
   it, **Then** its entries are hidden but not removed, and re-expanding
   shows them again unchanged.
3. **Given** a session has zero entries, **When** it is opened, **Then**
   the table still appears (collapsed or expanded) with an empty-state
   indicator rather than being omitted entirely.

---

### User Story 2 - Flag an entry as a repeating issue (Priority: P2)

A user who can already moderate a given entry (its author, or any Admin/
Project Manager, per 013's existing edit rule) marks it as "Repeating" to
signal this feedback has come up before, so the team can prioritize
recurring pain points during triage.

**Why this priority**: Adds real triage value once the table view exists,
but the table view is usable without it — it depends on User Story 1's
layout to have a column to live in.

**Independent Test**: As the author of an entry, toggle its Repeating flag
on and off; confirm the change persists after reloading the session, and
confirm a non-author Team Member cannot toggle it on another user's entry.

**Acceptance Scenarios**:

1. **Given** an entry authored by the current user, **When** they mark it
   Repeating, **Then** the entry's Repeating? column shows the flag is set,
   and it persists across a page reload.
2. **Given** an entry authored by a different user, **When** a Team Member
   who is not that author and not an Admin/PM views the entry, **Then**
   they cannot toggle its Repeating flag (consistent with 013's FR-007
   author-or-Admin/PM edit rule).
3. **Given** an Admin or Project Manager, **When** they view any entry in a
   project they have access to, **Then** they can toggle its Repeating flag
   regardless of authorship.

---

### User Story 3 - See session-wide vote and repeating totals (Priority: P3)

An internal team member viewing a session sees a footer summarizing overall
engagement for that session: the total number of votes cast across all
entries, the number of distinct people who cast at least one vote, and how
many of the session's entries are marked Repeating out of the total —
without having to count individual rows by hand.

**Why this priority**: Purely informational — it helps gauge overall
engagement but doesn't gate or change any other action in the session, so it
can ship last without blocking the table rework or the Repeating flag.

**Independent Test**: In a session where three different users have cast a
total of five votes across several entries, confirm the footer reads
"Total votes: 5" and "Total voters: 3"; have one of those users unvote one
entry and confirm votes drops to 4 while voters stays 3 (they still have at
least one other vote), then have them unvote their only remaining vote and
confirm voters drops to 2. Separately, in a session with 5 entries where 3
are marked Repeating, confirm the footer shows a "3/5" repeating tally.

**Acceptance Scenarios**:

1. **Given** a session where 3 distinct users have cast 5 votes total across
   its entries, **When** a Team Member opens the session, **Then** the
   footer shows "Total votes: 5" and "Total voters: 3".
2. **Given** a session with zero votes cast, **When** any internal user
   opens it, **Then** the footer shows "Total votes: 0" and "Total voters:
   0" rather than being hidden.
3. **Given** a user who has voted on multiple entries in a session,
   **When** they remove one of those votes (but still have at least one
   other vote in the session), **Then** total votes decreases by one and
   total voters stays unchanged.
4. **Given** a session with 5 entries where 3 have their Repeating flag
   set, **When** any internal user opens it, **Then** the footer shows a
   repeating tally of "3/5", updating immediately when any entry's
   Repeating flag is toggled.

---

### User Story 4 - Start a session instantly and name it later (Priority: P2)

A Project Manager or Admin clicks "New Session" and immediately gets a new,
empty, named table to start capturing feedback in — without first being
stopped by a form asking for a label. They (or any write-capable teammate)
rename it whenever they like by editing the table's title directly, before
or after entries exist.

**Why this priority**: Removes friction from starting a retro session, but
the table-view rework (US1) and Repeating/vote features work identically
regardless of how a session got its name — this doesn't block anything
else.

**Independent Test**: As a Project Manager, click "New Session"; confirm a
new table appears immediately with a default name and zero entries, then
rename it and confirm the new name persists after a page reload.

**Acceptance Scenarios**:

1. **Given** a Project Manager on the Retrospectives page, **When** they
   click "New Session", **Then** a new session table appears immediately
   (no intermediate "enter a label" prompt) with a default name and zero
   entries, and it becomes the selected/visible session.
2. **Given** a newly created session with its default name, **When** a
   write-capable user edits the table's title and confirms the change,
   **Then** the new name is shown immediately and persists after a page
   reload.
3. **Given** an existing session that already has entries, **When** a
   write-capable user renames it, **Then** the rename succeeds without
   affecting any of its entries, votes, or Repeating flags.
4. **Given** a Team Member (not Admin/PM), **When** they rename a session
   they have write access to, **Then** the rename succeeds — session
   naming follows the same `canWrite()` permission already used for
   creating a session and adding entries (013's existing rule), not a
   narrower author-only rule.

---

### User Story 5 - Assign an entry's Type from the table (Priority: P2)

A write-capable team member adds feedback text without being forced to
categorize it as Keep/Improve/Discuss on the spot. The entry appears in the
table with its Type cell blank; anyone permitted to edit that entry clicks
the Type cell and picks Keep, Improve, or Discuss from a dropdown, the same
way monday.com's status-column pattern works.

**Why this priority**: Changes *when* and *where* Type is set, not whether
it exists — US1's table and US2's Repeating flag both already accommodate a
per-row Type value. This can ship after the table view without blocking
anything else P1.

**Independent Test**: As a Team Member, add an entry with only feedback
text (no Type prompt); confirm it appears with a blank Type cell; click
that cell, choose "Improve"; confirm the row updates immediately and the
choice persists after a page reload.

**Acceptance Scenarios**:

1. **Given** the "Add Entry" form, **When** a write-capable user submits
   only feedback text, **Then** the entry is created successfully with no
   Type set, and no Type selector appears anywhere in the add-entry form.
2. **Given** an entry with no Type set, **When** a user permitted to edit
   that entry (its author, or an Admin/Project Manager — 013's existing
   edit rule) clicks its Type cell, **Then** a dropdown offers Keep,
   Improve, and Discuss.
3. **Given** that dropdown, **When** the user picks one, **Then** the
   entry's Type cell updates immediately to show the chosen value, and it
   persists after a page reload.
4. **Given** an entry that already has a Type set, **When** a permitted
   user clicks its Type cell, **Then** they can change it to a different
   Type the same way (not only set it once).
5. **Given** a user who is not permitted to edit a given entry, **When**
   they view its Type cell, **Then** it is read-only — no dropdown opens
   on click, consistent with 013's existing body/sentiment edit
   restriction.

### Edge Cases

- A session with zero entries: the table still renders (collapsed or
  expanded) with an empty-state indicator rather than being omitted, and
  the footer shows "Total votes: 0", "Total voters: 0", and a repeating
  tally of "0/0" rather than being hidden.
- A Client-role user attempting to reach the table view directly (URL or
  otherwise): denied entirely, unchanged from 013's existing internal-only
  restriction — no new exposure is introduced by the table layout or the
  new columns.
- A Department Head viewing the table: sees all columns including Repeating?
  and the footer (vote totals and repeating tally), but cannot toggle
  Repeating, cannot vote, and cannot add entries — consistent with 013's
  existing view-only rule for this role.
- An entry's author loses project access after authoring it (013's F1
  scenario): they also lose the ability to toggle that entry's Repeating
  flag, since Repeating uses the same moderation check as edit/delete.
- Toggling Repeating on an entry does not change its Vote count, its Owner,
  or any other field — it is independent of every other per-entry action,
  and updates the footer's repeating tally without a page reload.
- An entry with no Type set: its Type cell renders visibly blank/empty
  (not an error state, not defaulted to a specific Type), and it is
  included in the Repeating tally's denominator like any other entry.
- Renaming a session to an empty or whitespace-only value: rejected the
  same way an empty label is already rejected at session creation (013's
  existing `required` validation on `label`), leaving the prior name in
  place.
- A session is renamed while another user is viewing it: unspecified
  real-time sync — the other user sees the new name on their next refresh
  or session-list reload, consistent with how this feature does not
  introduce real-time updates anywhere else.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST display a retro session's entries as a single
  collapsible table (the session itself is the group — no additional
  grouping concept is introduced), replacing the current side-by-side lane
  layout. Entries of all sentiments appear together in this one table, not
  split into separate sentiment sub-tables.
- **FR-002**: The table MUST render one row per entry with columns:
  Feedback (entry text), Submitter (author), Type (sentiment, shown as a
  color-coded per-row value chosen from the same Keep/Improve/Discuss set
  used when authoring an entry), Repeating?, Vote, and Owner.
- **FR-003**: The session's table MUST remain collapsible/expandable, and
  MUST render even when the session has zero entries (as an empty table,
  not omitted).
- **FR-004**: Users MUST retain the ability to add a new entry to a session
  from the table view, following the same sentiment-tagging and permission
  rules established in 013-sprint-retrospectives (internal write-capable
  roles only).
- **FR-005**: The system MUST NOT expose a mechanism to add, remove, or
  rename table columns — the six columns in FR-002 are fixed for this
  feature.
- **FR-006**: Every retro entry MUST support a boolean "Repeating" flag,
  defaulting to not-set for existing and newly created entries.
- **FR-007**: A user MUST be able to toggle an entry's Repeating flag if and
  only if they are permitted to edit that entry under 013's existing rule
  (the entry's author, or an Admin/Project Manager with access to the
  entry's project) — the same permission surface as editing the entry's
  body or sentiment, re-checked against current project access each time
  (013's F1 regression coverage applies equally here).
- **FR-008**: Toggling the Repeating flag MUST NOT alter the entry's body,
  sentiment, owner, or vote count.
- **FR-009**: Each session view MUST display a read-only summary showing
  the total number of votes cast across all of that session's entries, and
  the number of distinct users who have cast at least one vote anywhere in
  that session.
- **FR-010**: Both totals in FR-009 MUST be computed at read time from the
  existing vote records (013's join-table pattern) — the system MUST NOT
  introduce a separately stored counter that could drift from the
  underlying vote data.
- **FR-011**: The vote totals summary MUST be visible to every role that
  can already view the session (Admin, Project Manager, Team Member,
  Department Head), including roles that cannot vote themselves
  (Department Head).
- **FR-012**: Access control for the table view, its columns, and its
  actions MUST be identical to 013-sprint-retrospectives' existing rules:
  internal roles only (Admin, Project Manager, Team Member, Department
  Head), Client role denied entirely, Department Head remains view-only
  (sees all columns and the vote totals footer, but cannot add entries,
  vote, assign owners, or toggle Repeating).
- **FR-013**: This feature MUST NOT introduce any automated detection,
  scoring, or cross-session comparison of repeating feedback — the
  Repeating flag is set only by explicit user action on a single entry, and
  013's exclusion of cross-session analytics/trend reporting continues to
  apply.
- **FR-014**: The session footer MUST also display a repeating tally — the
  count of entries with the Repeating flag set, out of the session's total
  entry count (e.g., "3/5") — visible to the same roles as the vote totals
  summary (FR-011), and updating immediately when any entry's Repeating
  flag changes without requiring a page reload.
- **FR-015**: Clicking "New Session" MUST create a new session immediately,
  with a system-assigned default name, and MUST NOT require the user to
  supply a label before creation succeeds.
- **FR-016**: A write-capable user (013's existing `canWrite()` role set —
  not limited to the session's creator) MUST be able to rename any session
  they have project access to, at any time, whether or not it has entries.
- **FR-017**: Session rename MUST use the same required, non-empty,
  max-255-character validation on the label that session creation already
  uses (013's existing rule) — an empty or whitespace-only name is
  rejected, leaving the prior name in place.
- **FR-018**: The "Add Entry" form MUST NOT require or offer a Type
  (sentiment) selection — only feedback text is required to create an
  entry. A newly created entry MUST start with no Type set.
- **FR-019**: A user permitted to edit a given entry (013's existing
  author-or-Admin/PM rule, FR-007's permission surface) MUST be able to
  set or change that entry's Type directly from its Type cell in the
  table, choosing from Keep, Improve, or Discuss. A user not permitted to
  edit the entry MUST see the Type cell as read-only.
- **FR-020**: An entry with no Type set MUST still be included in every
  other feature this spec defines (Repeating flag, voting, owner
  assignment, the footer's repeating tally denominator) — the absence of a
  Type MUST NOT block or alter any other per-entry action.

### Key Entities

- **Retro Entry** (existing, from 013-sprint-retrospectives): gains one new
  attribute, a boolean Repeating flag, in addition to its existing
  body/sentiment/author/owner/vote-count attributes. Its Type (sentiment)
  attribute changes from always-required-at-creation to optional, settable
  later — the attribute itself is not new, only its cardinality (now
  nullable) and the point in time it can be set.
- **Retro Session** (existing, from 013-sprint-retrospectives): gains the
  ability to have its label changed after creation — no new attribute, an
  existing attribute (`label`) becomes editable post-creation via a new
  action, not just at creation time.
- **Session Vote Summary**: not a stored entity — a derived, read-time view
  over a session's existing vote records, exposing two numbers (total votes,
  total distinct voters) for that session.
- **Session Repeating Tally**: not a stored entity — a derived count over a
  session's already-loaded entries (how many have `is_repeating` set, out
  of the total), requiring no additional query since the full entry list is
  already fetched to render the table.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team member can identify which entries are marked Repeating
  and what each entry's Type is, within 5 seconds of opening a session,
  without scrolling sideways (unlike the current 3-lane layout on narrow
  screens).
- **SC-002**: 100% of entries marked Repeating retain that state after a
  page reload and after any other unrelated edit to the session (e.g.,
  another entry's vote changing).
- **SC-003**: The displayed "Total votes" and "Total voters" figures match
  a manual count of the session's underlying vote records in 100% of
  spot-checks during verification.
- **SC-004**: No user without edit rights on a given entry (per 013's
  existing rule) can successfully toggle that entry's Repeating flag, in
  100% of tested role/authorship combinations.
- **SC-005**: Client-role users continue to have zero access to the
  Retrospectives table view, its data, or its new fields — no regression
  from 013's existing denial.
- **SC-006**: A user can go from clicking "New Session" to having a
  visible, empty, ready-to-use table in under 2 seconds, with zero
  required form fields in between.
- **SC-007**: 100% of session renames and Type assignments persist after a
  page reload, matching SC-002's existing bar for the Repeating flag.

## Assumptions

- "Submitter" in the table maps directly to the existing "author" concept
  from 013-sprint-retrospectives; no new identity or display-name concept is
  introduced.
- "Type" in the table maps directly to the existing "sentiment" field
  (Keep/Improve/Discuss); it is shown as a per-row color-coded table column
  instead of implied by which lane a card sits in or which sub-table a row
  is grouped under.
- The retro Session is the only grouping concept this feature introduces —
  it reuses 013's existing Session entity rather than adding a new
  monday.com-style "board group" concept. One session remains visible at a
  time via the existing pill switcher (013's US5); this feature does not
  change the pill switcher to a stacked-all-sessions layout.
- "Add Entry" may be implemented as either an inline add-row within the
  table or the existing modal dialog from 013 — the specific interaction
  pattern is a presentation decision for the planning phase, not a
  requirement here, as long as it remains reachable from the table view for
  write-capable roles.
- Existing entries created under 013-sprint-retrospectives (before this
  feature ships) are treated as not-Repeating by default; no backfill
  logic beyond a standard additive/nullable migration default is implied.
- The system-assigned default session name (FR-015) is a fixed string
  (e.g., "New Session") rather than an auto-incrementing or timestamped
  name — the planning phase picks the exact default text; this spec only
  requires that one exists and that creation never blocks on it.
- Existing entries created before this correction (with a Type already
  set under the prior required-at-creation rule) are unaffected — their
  Type values are preserved as-is; this only changes the rule for new
  entries and adds the ability to edit Type from the table for any entry,
  new or old.
- Subitems (a per-entry sub-task breakdown with Owner/Status/Date, observed
  in reference material) are explicitly out of scope for this spec —
  deferred to a future feature, not implied by anything here.
