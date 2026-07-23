# Phase 1 Data Model: Real User Management

**One small, additive migration.** No new tables. `users` gains a single
`is_active` boolean column, `default(true)` — every existing row is active
with no backfill step. No other schema change.

## `User` (existing entity — one new column, no meaning change to existing fields)

| Field | Existing? | Change |
|---|---|---|
| `name`, `email`, `role`, `department` | Yes | Unchanged in meaning — this feature adds the ability to manage them through the UI (previously backend/seed-only). |
| `password` | Yes | Unchanged — still hashed via `Hash::make()`, still hidden from every response (`#[Hidden]`). |
| `is_active` | **New** | `boolean`, `default(true)`. Cast to `bool` on the model. **Not** in the general update endpoint's mass-assignable field set (research.md) — only `disable`/`reactivate` actions may change it. |

## Validation rules

| Field | Create | Update | Notes |
|---|---|---|---|
| `name` | `required\|string\|max:255` | `sometimes\|required\|string\|max:255` | |
| `email` | `required\|email\|unique:users,email` | `sometimes\|required\|email\|unique:users,email,{id}` | FR-003 |
| `password` | `required\|string\|min:8\|confirmed` | n/a (separate reset action) | research.md |
| `role` | `required\|in:` + `User::validRoles()` | `sometimes\|required\|in:` + `User::validRoles()` | Never a hand-typed list (research.md) |
| `department` | `required_if:role,Team Member,Department Head,Client\|nullable\|string` | same | FR-002, matches `Project::accessibleTo`'s existing per-role dependency on `department` |

## Last-enabled-Admin invariant (FR-007, SC-005) — must be transactional

A single check, applied before any action that would set `role != Admin`
or `is_active = false` on a user who is **currently** an enabled Admin:

```text
function wouldLeaveNoEnabledAdmins(target, proposedChanges):
    if target.role != 'Admin' or target.is_active == false:
        return false   # target isn't currently a counted Admin — n/a

    becomesNonAdminOrDisabled =
        (proposedChanges.role is set and proposedChanges.role != 'Admin')
        or (proposedChanges.is_active is set and proposedChanges.is_active == false)

    if not becomesNonAdminOrDisabled:
        return false

    enabledAdminCount = count(User where role = 'Admin' and is_active = true)
    return enabledAdminCount <= 1   # target IS that one — this action would zero it out
```

Applied identically regardless of who the acting Admin is — including when
the acting Admin and the target are the same person (subsumes FR-007's
self-protection as one instance of this general rule, not a separate
check).

**Race condition**: checking `enabledAdminCount` and then writing the
update are two separate steps — without protection, two concurrent
requests (e.g. two Admins each demoting a *different* one of exactly two
remaining enabled Admins, at nearly the same moment) could both read
`enabledAdminCount == 2`, both see "still ≥ 2 after this one," and both
proceed, leaving zero. This check-then-act sequence MUST run inside a
database transaction with the enabled-Admin rows locked for the duration
(`SELECT ... FOR UPDATE`, e.g. Eloquent's `lockForUpdate()`) so the second
concurrent request's count re-reads only after the first request's write
has either committed or rolled back — never both reading the pre-update
count. Every code path that can trigger this check (the general update
action and the disable action) must use the same locked-transaction
pattern; there is exactly one invariant, enforced one way, not
per-endpoint-duplicated logic that could drift.

## Audit actions (FR-009), extending `AuditLogger`'s existing docblock list

| Action | `entity_id` | `metadata` |
|---|---|---|
| `user.created` | new user's id | `{ role, department }` — never `password` |
| `user.updated` | target user's id | `{ changed_fields: [...], old: {...}, new: {...} }` for only the fields that changed among `name`/`email`/`role`/`department` — never `password`, never `is_active` (that's `user.disabled`/`user.reactivated`'s job) |
| `user.disabled` | target user's id | `{ }` or a reason if later added — never sensitive data |
| `user.reactivated` | target user's id | `{ }` |
| `user.password_reset` | target user's id | `{ }` — confirms the action happened; the new password value is never present anywhere in this metadata |

## State transitions

```text
        create
          │
          ▼
      [active] ──disable──▶ [disabled]
          ▲                     │
          └──────reactivate─────┘
```

Both transitions are only reachable through their own dedicated actions
(never the general update endpoint — research.md), and both are blocked
outright if applying them would leave zero enabled Admins (the
`wouldLeaveNoEnabledAdmins` guard above), regardless of which direction:
`disable` is blocked in that case; a role edit that would change the last
enabled Admin's role away from `Admin` is blocked the same way.

## Response shape (`UserResource`)

```json
{
  "id": 12,
  "name": "Jane Doe",
  "email": "jane@example.com",
  "role": "Team Member",
  "department": "IT",
  "is_active": true,
  "created_at": "2026-07-23T09:00:00+00:00",
  "updated_at": "2026-07-23T09:00:00+00:00"
}
```

Never includes `password` or `remember_token` (FR-011) — enforced by the
Resource's explicit field list, not merely relying on the model's
`#[Hidden]` attribute (which only protects direct model serialization, not
a resource that might otherwise reach into the model's raw attributes).
