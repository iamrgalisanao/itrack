# Phase 1 Data Model: Bug Tracker

## Entity: Bug

Table: `bugs`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint, PK | |
| `project_id` | bigint, FK → `projects.id`, cascade delete | Drives all access scoping via `BelongsToProject` |
| `bug_number` | unsigned integer | Per-project sequence, never reused (research.md D2). Unique together with `project_id`. |
| `title` | string(255) | Required |
| `description` | text, nullable | |
| `reporter_id` | bigint, FK → `users.id` | Defaults to creating user on create (FR-003) |
| `owner_id` | bigint, FK → `users.id`, nullable | Optional — the internal user responsible for fixing it (FR-003) |
| `priority` | string | Enum: `Critical`, `High`, `Medium`, `Low` (FR-005) |
| `status` | string | Enum: `Awaiting Review`, `Ready for Dev`, `Fixing`, `Fixed` (FR-004) |
| `sprint_label` | string(120), nullable | Free text, no relationship (FR-006, FR-013) |
| `due_date` | date, nullable | (FR-006) |
| `visibility` | string | Enum: `internal`, `client_visible` — mirrors `Attachment`/`Comment`'s existing convention exactly (FR-010) |
| `breach_notified_at` | timestamp, nullable | Set the first time a breach notification is sent for this bug, so `generateBugBreachNotifications()` has a fast filter in addition to `sendNotification()`'s own event_key dedup (belt-and-suspenders, avoids re-scanning already-notified bugs every poll) |
| `created_at` / `updated_at` | timestamps | |

### Relationships

- `Bug belongsTo Project` (via `project_id`)
- `Bug belongsTo User as reporter` (via `reporter_id`)
- `Bug belongsTo User as owner` (via `owner_id`, nullable)

### Validation rules (enforced in `BugController`, not just DB constraints)

- `title`: required, string, max 255.
- `priority`: required, `in:Critical,High,Medium,Low`.
- `status`: required, `in:Awaiting Review,Ready for Dev,Fixing,Fixed`.
- `visibility`: required, `in:internal,client_visible`; settable only by
  internal roles (Client requests attempting to set this are rejected by
  the same authorization check that blocks all Client writes, FR-011).
- `due_date`: nullable, date, no past-date restriction (a bug can be
  retroactively marked with a past due date, e.g. when back-filling —
  reasonable default, not spec-mandated either way).
- `reporter_id` / `owner_id`: nullable on `owner_id`; both, when present,
  must reference a user who is internal (Admin/PM/Team Member/Department
  Head) — Client users are never valid Reporters or Owners (Client cannot
  create/edit bugs at all per FR-011, so this is enforced implicitly by who
  can call the write endpoints, plus explicit validation if `reporter_id`
  is ever settable independent of the creator default).

### Derived / computed (not stored)

- **Display group**: computed from `status` — Awaiting Review → "Incoming";
  Ready for Dev or Fixing → "Development Work"; Fixed → "Resolved"
  (research.md D4). Exposed by `BugResource` as a `group` field so the
  frontend doesn't need to duplicate the mapping.
- **Display Bug ID string**: `"BUG-" . str_pad($bug_number, 3, '0',
  STR_PAD_LEFT)`, exposed by `BugResource` as `bug_id` (e.g. `"BUG-001"`).
- **Overdue flag**: `due_date` is in the past AND `status !== 'Fixed'` —
  exposed by `BugResource` as a boolean `is_overdue` so the frontend
  doesn't need to duplicate today's-date comparison logic (the live
  countdown itself is still computed client-side per research.md D5, but
  whether to render "overdue" styling at all is server-confirmed).

## State transitions

`status` is a free selection among the 4 fixed values by any internal user
with project access — no gated ordering (research.md D4, spec Assumptions).
The only side effect of a status change is display-group placement
(derived, not stored) and, if `status` becomes `Fixed`, no further breach
notifications are generated for that bug going forward (FR-009) — enforced
by `generateBugBreachNotifications()`'s `where('status', '!=',
Bug::STATUS_FIXED)` filter, not a separate transition hook.

## Notification touchpoint (no new table)

SLA breach notifications reuse the existing `notifications` table
unchanged (research.md D3) — `detailed_activity_id` stays `null` for
bug-breach rows; the bug's identity lives entirely in `event_key`
(`"bug_breach:bug:{id}:reporter"` / `"...owner"`) and `link_url`
(`"/bug-tracker?bug={id}"`, matching the existing `?session=`/`?task=`
deep-link convention already used by Retrospectives/Kanban).
