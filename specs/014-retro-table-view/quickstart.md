# Quickstart: Retrospective Table View

Validates `014-retro-table-view` end-to-end. Assumes `013-sprint-
retrospectives` is already implemented and its own quickstart scenarios
still pass (this feature is additive, not a replacement — Scenario 0 below
re-confirms that before testing anything new).

## Prerequisites

- Backend dev server running (`php artisan serve` or the project's `composer
  dev` script) with migrations run, including
  `add_is_repeating_to_retro_entries_table` and
  `make_sentiment_nullable_on_retro_entries_table`.
- Frontend dev server running (`npm run dev`).
- Test users available for at least: Admin, Project Manager, two distinct
  Team Members (author + non-author), Department Head, Client — same
  personas 013's quickstart used.
- A project with an existing retro session containing entries in all three
  sentiments, ideally reusing 013's kept demo data ("Sprint 3" session)
  rather than recreating it.

## Scenario 0: 013 regression check

1. As a Team Member, open an existing session.
2. Confirm sessions list, entry creation, voting, and owner assignment
   still work exactly as before — this feature changes layout and adds
   fields, it does not change any 013 behavior.

**Expected**: no regression; if anything here fails, stop and treat it as
a 013 regression, not a 014 bug.

## Scenario 1: Single session table layout (US1)

1. As a Team Member, open a session with entries across Keep, Improve, and
   Discuss.
2. Confirm one collapsible table renders (the session itself is the group
   — no separate sentiment sub-tables), showing all of that session's
   entries with columns Feedback, Submitter, Type, Repeating?, Vote, Owner,
   with Type shown as a per-row color-coded value.
3. Collapse the table, then re-expand it.
4. Open a session with zero entries.
5. Time how long it takes to identify which entries are marked Repeating
   and what each entry's Type is, at a standard desktop viewport width
   (e.g. 1440px).
6. Confirm the "Add Entry" affordance is still present and still creates
   an entry successfully after the layout change.

**Expected**: (2) all six columns present, entries of every Type mixed in
one table, not split into sub-tables; (3) entries reappear unchanged after
re-expand; (4) the empty session still renders its table (collapsed or
expanded) with an empty-state indicator, not omitted; (5) the scan takes a
few seconds at most and requires no horizontal/sideways scrolling
(SC-001); (6) Add Entry works exactly as it did in 013 (FR-004).

## Scenario 2: Repeating flag — author (US2)

1. As the author of an entry, toggle its Repeating flag on.
2. Reload the page.
3. Toggle it off.

**Expected**: (1) flag shows set immediately; (2) flag remains set after
reload (persisted, not client-only state); (3) flag clears and persists
cleared.

## Scenario 3: Repeating flag — permission boundary (US2)

1. As a second Team Member who did not author the entry from Scenario 2,
   attempt to toggle its Repeating flag.
2. As an Admin (or separately, a Project Manager) who did not author it,
   toggle the same entry's Repeating flag.

**Expected**: (1) no control is available, or the action is rejected
(403) if attempted directly — matches 013's existing body/sentiment edit
restriction, not the looser owner-assignment rule; (2) succeeds for
Admin/PM regardless of authorship.

## Scenario 4: Vote totals and repeating tally footer (US3)

1. As three different users, cast a total of five votes across several
   entries in one session (at least one user voting on more than one
   entry).
2. In that same session (5 entries), mark 3 of them Repeating.
3. View the session as any internal role.
4. Have one user remove one of their votes (while still holding at least
   one other vote in the session).
5. Have that same user remove their one remaining vote.
6. Toggle one of the 3 Repeating entries back off.

**Expected**: (3) footer reads "Total votes: 5", "Total voters: 3", and a
repeating tally of "3/5"; (4) total votes drops to 4, total voters stays 3;
(5) total voters drops to 2, total votes drops to 3; (6) the repeating
tally updates to "2/5" immediately, without a page reload (FR-014).

## Scenario 5: Vote totals and repeating tally — zero state

1. Open a session with zero entries.
2. Open a session with entries but zero votes cast and none marked
   Repeating.

**Expected**: (1) footer reads "Total votes: 0", "Total voters: 0",
repeating tally "0/0"; (2) footer reads "Total votes: 0", "Total voters:
0", repeating tally "0/N" (N = entry count) — shown, not hidden, in both
cases.

## Scenario 6: Department Head — view-only, unchanged

1. As Department Head, open the session.

**Expected**: sees all six columns, including Repeating? and the footer
(vote totals and repeating tally); has no control to vote, add entries,
assign owners, or toggle Repeating — identical to 013's existing view-only
behavior, now also covering the new column and footer.

## Scenario 7: Client denial — unchanged

1. As Client, confirm the Retrospectives nav entry is absent and direct
   navigation to the retrospectives route is denied.

**Expected**: no regression from 013 — the new columns and footer
introduce no new exposure.

## Scenario 8: Instant session creation and rename (US4)

1. As a Project Manager, click "New Session".
2. Confirm a new table appears immediately, with a default name and zero
   entries — no intermediate form or prompt.
3. Edit the table's title to a custom name and confirm it.
4. Reload the page and reopen that session.
5. As a Team Member (not the creator, not Admin/PM) with write access to
   the same project, rename a different existing session.
6. As a Department Head, attempt to rename a session (directly via the
   API, since no rename control should be visible to them).

**Expected**: (2) new session visible within ~2 seconds, no form/prompt
(SC-006); (3)-(4) the custom name persists after reload (FR-017, SC-007);
(5) rename succeeds — not restricted to the session's creator (FR-016);
(6) `403` — Department Head lacks `canWrite()`, same gate as session
creation.

## Scenario 9: Assign Type from the table, not at creation (US5)

1. As a Team Member, add a new entry with only feedback text.
2. Confirm the entry appears with a blank Type cell, and confirm the "Add
   Entry" form had no Type/sentiment picker at any point.
3. Click that entry's Type cell; confirm a dropdown offers Keep, Improve,
   Discuss.
4. Pick "Improve"; confirm the cell updates immediately.
5. Reload the page; confirm "Improve" persisted.
6. Click the same cell again and change it to "Keep".
7. As a second Team Member who is not that entry's author (and not
   Admin/PM), click the same entry's Type cell.

**Expected**: (2) entry created successfully, Type cell visibly blank, no
Type picker ever shown in the Add Entry form (FR-018); (3)-(4) dropdown
appears and selection applies immediately; (5) persisted (FR-019, SC-007);
(6) Type can be changed again, not just set once; (7) no dropdown opens —
read-only for a non-permitted user (FR-019's last clause, mirrors 013's
existing body/sentiment edit restriction).

## Validation tasks (Constitution Principle VIII — Definition-of-Done Gate)

These carry into `/speckit-tasks` as explicit tasks, not left implicit:

1. **Automated tests green**: `php artisan test` passes, including the new
   PHPUnit cases listed in `research.md`'s Skill-Derived Test Requirements
   (repeating-flag author/non-author/Admin/PM cases, vote-summary
   computation, zero-vote state, Client/unauthenticated denial regression,
   nullable-sentiment creation, session-rename permission and validation).
2. **Authorization check reviewed**: confirm in code review that
   `is_repeating` is validated under `$isAuthorOrModerator` in
   `updateEntry()` — not under the `owner_user_id` branch — by reading the
   diff, not just running the tests (guards against a test suite that
   happens to pass while the wrong branch was edited).
3. **Tenant/project-isolation check reviewed**: confirm `showSession()`'s
   `vote_summary` computation is scoped to the current session's entry IDs
   only — manually verify with two sessions in different projects that one
   session's vote totals never include the other's votes.
4. **OWASP review** (`laravel-owasp-security`, Broken Access Control
   focus — the only OWASP category this feature's surface touches):
   attempt the Scenario 3 non-author toggle directly via the API (not just
   through the UI) and confirm `403`, not merely that the UI hides the
   control.
5. **code-slop review** (`code-slop`): confirm no new abstraction was
   introduced for what remains a single table per session (research.md
   D1), the repeating tally stayed a client-side derivation rather than
   becoming a needless third backend field (research.md D6), no new
   comment narrates obvious code, and new test cases assert real
   database/response state rather than "does not throw."
