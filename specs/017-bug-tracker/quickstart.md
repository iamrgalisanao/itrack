# Quickstart: Bug Tracker

## Prerequisites

- Backend running (`php artisan serve`) and frontend dev server running
  (`npm run dev`), pointed at the same seeded database.
- At least one internal user (e.g. `pm@itrack.test`) and one Client user
  with access to the same project, per the existing seed data / 011's
  access-control fixtures.
- Migration applied (`php artisan migrate`) for the new `bugs` table.

## Setup

No manual setup beyond migrating — this feature adds one table and no new
external dependency.

## Validation Scenarios

### 1. Report a bug and see it grouped correctly (US1)

1. Sign in as an internal user with access to a project, open Bug Tracker.
2. Create a bug with a title, description, and Priority "High".
3. **Expected**: it appears immediately in the "Incoming" group with
   Status "Awaiting Review", a Bug ID like "BUG-001", and Reporter = you.
4. Change its Status to "Ready for Dev".
5. **Expected**: it moves to "Development Work".
6. Change its Status to "Fixed".
7. **Expected**: it moves to "Resolved".

### 2. Bug ID sequencing survives deletion (data-model.md, FR-002)

1. Create two more bugs on the same project (now at BUG-002, BUG-003).
2. Delete BUG-002.
3. Create a new bug.
4. **Expected**: the new bug is BUG-004, not a reused BUG-002.

### 3. Due date countdown and SLA breach notification (US2)

1. Create a bug with a due date in the past (or set one via PATCH,
   depending on what the UI allows) and Status not Fixed.
2. Set an Owner different from the Reporter.
3. Poll notifications (open the notification bell, or reload) as the
   Reporter.
4. **Expected**: exactly one breach notification appears, linking to
   `/bug-tracker?bug={id}`.
5. Repeat as the Owner.
6. **Expected**: they also get exactly one breach notification,
   independent of the Reporter's.
7. Poll again (reload) as either user.
8. **Expected**: no duplicate notification is created (dedup via
   event_key).
9. Mark the bug Fixed, then poll again.
10. **Expected**: no further breach notification (past or future) for this
    bug.

### 4. Client visibility (US3)

1. As an internal user, mark one bug `client_visible` and leave another
   `internal`.
2. Sign in as a Client user with access to that project, open Bug Tracker.
3. **Expected**: only the `client_visible` bug appears; no create/edit/
   delete/status controls are visible or reachable for it.
4. Attempt to fetch the `internal`-only bug directly by ID (e.g. via the
   API or a guessed URL).
5. **Expected**: 403/404 — not silently exposed (IDOR check).
6. Sign in as a Client user WITHOUT access to that project.
7. **Expected**: Bug Tracker for that project is entirely inaccessible.

### 5. Tenant isolation (laravel-owasp-security, plan.md Coding-Standard Constraints)

1. As an internal user with access to Project A only, attempt to view or
   modify a bug that belongs to Project B (by ID).
2. **Expected**: 403 — access denied, even though the user is a valid
   internal role.

## Automated Regression Check

```bash
php artisan test --filter=BugTrackerTest
```

**Expected**: all new authorization, tenant-isolation, sequencing,
grouping, and breach-notification test cases pass.

## Definition-of-Done Checklist (Constitution Principle VIII)

- [ ] Scenario 1 confirms create + status-group transitions work
- [ ] Scenario 2 confirms Bug ID sequencing never reuses a number
- [ ] Scenario 3 confirms breach notifications fire once per recipient and
      stop once a bug is Fixed
- [ ] Scenario 4 confirms Client visibility and IDOR protection
- [ ] Scenario 5 confirms cross-project tenant isolation
- [ ] `php artisan test --filter=BugTrackerTest` passes
- [ ] Diff reviewed against `code-slop`: no new service/abstraction layer,
      matches existing `RetrospectiveController`/`NotificationController`
      shapes
