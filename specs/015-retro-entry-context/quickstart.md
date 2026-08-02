# Quickstart: Retro Entry Discussion, Attachments & Decision

Validates `015-retro-entry-context` end-to-end. Assumes `013-sprint-
retrospectives` and `014-retro-table-view` are already implemented and
their own quickstart scenarios still pass (Scenario 0 re-confirms before
testing anything new).

## Prerequisites

- Backend dev server running, migrations run (`create_retro_entry_comments_table`,
  `create_retro_entry_attachments_table`, `add_decision_to_retro_entries_table`).
- Frontend dev server running.
- Test users: Admin, Project Manager, two distinct Team Members (author +
  non-author, both with project access), Department Head, Client — same
  personas 013/014 used.
- A retro entry to attach comments/attachments/a decision to, ideally
  reusing existing kept demo data.
- A small test image or PDF file for the attachment scenarios, and a
  disallowed file type (e.g. `.exe`) to test rejection.

## Scenario 0: 013/014 regression check

1. As a Team Member, open an existing session and entry.
2. Confirm entries, voting, owner assignment, Repeating toggle, and Type
   selection all still work exactly as before.

**Expected**: no regression; treat any failure here as a 013/014
regression, not a 015 bug.

## Scenario 1: Post and read comments (US1)

1. As a Team Member with project access who did **not** author a given
   entry, post a comment on it.
2. As a different internal role (e.g. Department Head) who can view the
   session, open the same entry.
3. Post a comment mentioning a role, e.g. "@Project Manager please check
   this".
4. As Client, attempt to view or post a comment (directly via the API).

**Expected**: (1) comment appears immediately, attributed to the poster,
entry's original feedback text unchanged; (2) Department Head can read
the comment thread but has no post control; (3) the mentioned role
receives a notification, matching the existing DetailedActivity mention
behavior in spirit (retro-flavored link/text); (4) `403`/denied.

## Scenario 2: Attach and download a file (US2)

1. As a write-capable user with project access, upload an allowed file
   type (e.g. a PNG) under the size limit to an entry.
2. As a different internal role, download that attachment.
3. Attempt to upload a disallowed file type (e.g. `.exe`).
4. Attempt to upload a file over the size limit.

**Expected**: (1) file appears in the attachment list; (2) downloaded file
matches the original content and filename; (3)-(4) rejected with a clear
error, nothing stored (confirm no orphaned file on disk or DB row).

## Scenario 3: Attachment deletion permission boundary (US2)

1. As the uploader, delete their own attachment.
2. As a different Team Member (not the uploader, not Admin/PM) who is
   also not the entry's author, attempt to delete another user's
   attachment on the same entry.
3. As Admin (or separately PM), delete an attachment they did not upload.

**Expected**: (1) succeeds, removed from list and storage; (2) denied —
`403`, even though this user might otherwise be able to edit other parts
of the entry; (3) succeeds regardless of who uploaded it.

## Scenario 4: Record a decision (US3)

1. As the entry's author, record a decision.
2. Reload the page; confirm it persists, shown separately from the
   original feedback text.
3. As the author, change the decision to a different value.
4. As a Team Member who is neither the author nor Admin/PM, attempt to
   set/change the decision (directly via the API).
5. Open an entry with no decision recorded, as any internal role.

**Expected**: (1)-(3) succeeds and persists, original feedback text
untouched; (4) `403`; (5) a distinct "no decision recorded yet" state, not
a blank/empty-looking field indistinguishable from an unset one.

## Scenario 5: Deleting an entry cleans up its comments/attachments

1. As Admin, note an entry that has at least one comment and one
   attachment.
2. Delete that entry (013's existing delete capability).

**Expected**: the entry, its comments, and its attachments are all gone —
no orphaned `retro_entry_comments`/`retro_entry_attachments` rows remain,
and the physical attachment file(s) are removed from disk.

## Scenario 6: Department Head — view-only, unchanged

1. As Department Head, open an entry with comments, attachments, and a
   decision recorded.

**Expected**: can read all three; has no control to post a comment,
upload/delete an attachment, or set/change the decision — consistent with
013/014's existing view-only rule for this role.

## Scenario 7: Client denial — unchanged

1. As Client, confirm no Retrospectives access exists at all (unchanged
   from 013/014) — comments/attachments/decision introduce no new
   Client-reachable surface.

## Validation tasks (Constitution Principle VIII — Definition-of-Done Gate)

1. **Automated tests green**: `php artisan test` passes, including the 12
   PHPUnit cases listed in `research.md`'s Skill-Derived Test
   Requirements.
2. **Authorization check reviewed**: confirm in code review that
   `decision` is validated under the `$isAuthorOrModerator` branch in
   `updateEntry()` (not a looser check), and that attachment deletion
   checks `uploaded_by_user_id`, not the entry's `author_user_id`.
3. **Tenant/project-isolation check reviewed**: confirm every new endpoint
   re-checks `hasProjectAccess()` against the entry's session's project —
   manually verify with entries in two different projects that neither
   comments nor attachments leak across them.
4. **OWASP review** (`laravel-owasp-security`, Broken Access Control +
   file-upload focus — this feature's actual relevant categories):
   attempt Scenario 3's non-uploader deletion and Scenario 2's disallowed
   file type directly via the API (not just the UI) and confirm the
   expected denial/rejection in both cases; confirm the download endpoint
   never returns a raw storage path in any response.
5. **code-slop review** (`code-slop`): confirm `parseAndSendRetroMentions`
   and the duplicated MIME whitelist/sanitizer (research.md D4/D5) are
   the deliberate, narrowly-scoped duplications the plan called for — not
   copy-pasted further than necessary — and that new tests assert real
   database/storage/response state rather than "does not throw."
