# Quickstart: Taskboard

## Prerequisites

- Backend running (`php artisan serve`) and frontend dev server running
  (`npm run dev`), pointed at the same seeded database.
- At least one Admin/PM user, one Team Member, and one Client user, with the internal
  users assigned to the same project and the Client having some form of access to it.
- Migration applied (`php artisan migrate`) for the four new `detailed_activities`
  columns.

## Setup

No manual setup beyond migrating — this feature adds four nullable columns and no new
table.

## Validation Scenarios

### 1. Create a task under an Epic with no existing sub-structure (US1)

1. Sign in as Admin/PM, open Work Program, select a Module that has never had a
   Taskboard task before.
2. Switch to the new Taskboard view (`?view=taskboard`).
3. Create a task, selecting that Module as the Epic, with a title and priority.
4. **Expected**: the task appears immediately under "Backlog" (no sprint label set).
5. Switch to the List view, expand the Module.
6. **Expected**: exactly one `Taskboard` Activity and one `Unclassified Tasks`
   SubActivity exist under it, containing the new task.

### 2. Sprint-label grouping and point sums (US1)

1. Create a second task under the same Epic with a sprint label (e.g. `"Sprint 1"`) and
   a story-point estimate.
2. Create a third task with the sprint label entered with extra whitespace
   (`"  Sprint 1  "`).
3. **Expected**: both land in the same `"Sprint 1"` group (whitespace normalized,
   research.md D6), and the group header shows the correct point-sum.
4. Create a fourth task with a blank sprint label.
5. **Expected**: it lands in "Backlog", not a new empty-string group.

### 3. Assignment and reassignment notifications (US2)

1. Assign the first task to a Team Member.
2. **Expected**: that Team Member gets exactly one notification.
3. Reassign the task to a second Team Member.
4. **Expected**: the second person is notified; the first is not notified again for
   this change.
5. Reassign back to the first Team Member.
6. **Expected**: the first person is notified again — not silently suppressed
   (research.md D5).
7. Resubmit the same assignee without changing it.
8. **Expected**: no new notification.
9. Clear the assignment.
10. **Expected**: no notification.
11. Attempt to assign the task to a real internal user who has no access to this
    project.
12. **Expected**: rejected.

### 4. Read-only access for Team Member/Department Head (US3)

1. Sign in as a Team Member, open the Taskboard.
2. **Expected**: priority, points, sprint label, and assignee are visible on each task
   but not editable; no "New Task" button is shown.
3. Attempt a direct API PATCH against a task with a `priority` and a deliberately
   invalid `assignee_user_id`, alongside a legitimate `status` change.
4. **Expected**: `status` applies, no 422 is returned, and the Taskboard fields are
   unchanged (research.md D3 — strip happens before validation).

### 5. Client denial (US3, FR-008)

1. Sign in as Client.
2. **Expected**: no Taskboard toggle is visible in Work Program.
3. Manually navigate to `/work-program?view=taskboard`.
4. **Expected**: falls back to the List view, not a broken all-Backlog board.
5. Attempt the underlying API request directly.
6. **Expected**: denied.

### 6. Reserved-container deletion guard (data-model.md)

1. As Admin/PM, attempt to delete the `Taskboard` Activity or `Unclassified Tasks`
   SubActivity created in Scenario 1 while they still contain tasks.
2. **Expected**: both rejected (409).
3. Delete the tasks inside them, then retry the deletion.
4. **Expected**: succeeds now that the containers are empty.

### 7. Kanban "Priority"→"Type" relabel (research.md D7)

1. Open a task in Kanban's existing task editor.
2. **Expected**: the field that used to say "Priority" now says "Type", showing the
   same underlying value as before (no data change) — and a separate, real "Priority"
   field (new, from this feature) is present alongside it.

## Automated Regression Check

```bash
php artisan test --filter=TaskboardTest
```

**Expected**: all new authorization, tenant-isolation, default-container idempotency,
deletion-guard, field-validation, and notification-dedup test cases pass.

```bash
php artisan test
```

**Expected**: full suite passes — no regression in existing `DetailedActivityController`,
`ActivityController`, `SubActivityController`, `Kanban`, or `Notification` test
coverage.

## Definition-of-Done Checklist (Constitution Principle VIII)

- [ ] Scenario 1 confirms Epic-only task creation and reserved-container auto-creation
- [ ] Scenario 2 confirms sprint-label grouping and whitespace normalization
- [ ] Scenario 3 confirms notification correctness, including the reassign-back case
- [ ] Scenario 4 confirms Team Member read-only enforcement, including the
      strip-before-validate ordering
- [ ] Scenario 5 confirms Client has zero access to the Taskboard view
- [ ] Scenario 6 confirms the reserved-container deletion guard
- [ ] Scenario 7 confirms the Kanban Priority/Type relabel
- [ ] `php artisan test --filter=TaskboardTest` passes
- [ ] Full `php artisan test` suite passes (no regression)
- [ ] Diff reviewed against `code-slop`: no new service class, no premature
      abstraction, matches `BugController`/`BugTracker.jsx`'s established shapes
