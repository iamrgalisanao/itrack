# Phase 0 Research: Real User Management

No `NEEDS CLARIFICATION` markers exist in the Technical Context — every
decision below came from reading existing code (`AuthController`, `User`
model, `routes/api.php`, `bootstrap/app.php`, `AuditLogger`, `Admin.jsx`,
`RoleAccessTest`) and the architecture review's own findings, not new
research after the fact.

## Decision: Disabled-account enforcement is a middleware on the shared `auth:sanctum` group, not a per-endpoint check

**Rationale**: `routes/api.php` already wraps every authenticated endpoint
(including `/api/me`) in one `Route::middleware('auth:sanctum')->group(...)`.
Registering a new `EnsureUserIsActive` middleware alongside `auth:sanctum`
on that same group — once, in `bootstrap/app.php` — protects every existing
and future authenticated endpoint automatically, including ones this
feature never touches directly. A per-controller check (e.g. only inside
`UserManagementController` or only inside `AuthController::login()`) would
satisfy FR-005's login-time half but leave every other endpoint reachable
by an already-issued session cookie belonging to a since-disabled user —
exactly the gap the architecture review's first finding named.

**Alternatives considered**: Checking `is_active` only inside `login()` —
rejected, explicitly insufficient per FR-005/SC-002 ("an existing session's
next API call," not just a fresh login). Checking it inside a base
controller class every controller extends — rejected, this app's
controllers don't currently share a common authenticated-base-class
pattern, and a middleware is the idiomatic Laravel mechanism for
cross-cutting request gates already used elsewhere in this stack
(`EnsureFrontendRequestsAreStateful`, referenced in `Tests\TestCase`).

## Decision: Login rejects a disabled account via `Auth::attempt()`'s own credential matching, not a separate post-check

**Rationale**: `Auth::attempt(['email' => ..., 'password' => ..., 'is_active' => true])`
adds `is_active = 1` as an extra `WHERE` condition to Laravel's own
credential-lookup query (`EloquentUserProvider::retrieveByCredentials`) —
if the account is disabled, `Auth::attempt()` simply returns `false`, and
`AuthController::login()`'s existing `ValidationException` ("The provided
credentials are incorrect.") fires exactly as it already does for a wrong
password. This means a disabled account gets the *same* generic message a
wrong-password attempt gets — never a distinct "your account is disabled"
message, which would let an attacker confirm an email belongs to a real
(if disabled) account. No new code path, no new error message to keep
consistent with the existing one.

**Alternatives considered**: Authenticate first, then check `is_active`
and return a distinct "account disabled" error — rejected, this is exactly
the account-enumeration risk avoided above, and duplicates checking logic
that `Auth::attempt()` already does for free when given the extra
credential.

## Decision: The last-enabled-Admin invariant is one general guard, not a self-only check

**Rationale**: FR-007 (an Admin can't demote/disable themselves) is a
narrower instance of SC-005's actual invariant ("never possible to leave
the system with zero enabled Admin accounts"). If enforcement only checked
"is the acting Admin editing their own row," two Admins could still
demote/disable *each other* down to zero enabled Admins, or a lone
remaining Admin could be demoted by some future automated/bulk-edit path
that isn't "self" in the narrow sense. A single guard —
`wouldLeaveNoEnabledAdmins(User $target, array $changes): bool`, checked
before any update that would set `role != Admin` or `is_active = false` on
a currently-enabled Admin — subsumes the self-protection case (FR-007) as
one instance of the general rule (SC-005), rather than needing two separate
code paths that could drift out of sync.

**Alternatives considered**: A narrower "can't edit own account's role/
status" check only — rejected per the architecture review's finding #3;
satisfies FR-007's literal wording but not SC-005's actual invariant.

## Decision: `is_active` is only settable through dedicated disable/reactivate actions, never the general update endpoint

**Rationale**: Keeping `is_active` out of the general "edit user" request's
mass-assignable fields means every status change goes through one of two
narrow, distinctly-audited actions (`disable`/`reactivate`) rather than
being one field among many in a generic `PATCH` — this keeps the audit
log's `user.disabled`/`user.reactivated` actions meaningful (they always
correspond to a deliberate, singular action) rather than needing to detect
"was `is_active` among the changed fields in this arbitrary edit" logic
inside the general update handler.

**Alternatives considered**: One generic update endpoint handling every
field including `is_active` — rejected; splitting status changes into
their own actions is simpler to audit correctly and matches how this
feature's own acceptance scenarios describe disable/reactivate as distinct
actions, not a field edit.

## Decision: Role/department validation reuses `User::validRoles()`, never a second hardcoded list

**Rationale**: `User::validRoles()` already exists as the single source of
truth for the five system roles (`User.php`'s own docblock: "never compare
against raw strings"). The architecture review's finding #5 calls out
exactly the risk of a second, hand-typed role list drifting from this one.
Validation rules reference `in:` . `implode(',', User::validRoles())` or
equivalent, not a literal string.

**Alternatives considered**: A hardcoded `in:Admin,Project Manager,...`
validation string — rejected, this is precisely the drift risk
`User::validRoles()` already exists to prevent.

## Decision: Password policy is `required|string|min:8|confirmed`, for both create and reset

**Rationale**: No existing password policy is defined anywhere in this
codebase (users today are only ever seeded, never created via the API) —
`min:8|confirmed` is a conservative, standard baseline requiring the Admin
to type the new password twice (`password_confirmation`), catching typos
before an Admin locks a user out with a mistyped password neither of them
knows. `Hash::make()` (already used by `UserFactory`) hashes it before
storage; the plaintext value is never included in any `AuditLogger::record()`
call's `metadata`.

**Alternatives considered**: No minimum length — rejected as an
unnecessarily weak default when establishing this policy for the first
time. A more complex policy (special characters, rotation) — rejected as
unjustified complexity for an internal tool with no stated requirement for
it.

## Decision: New `user.*` audit actions, extending `AuditLogger`'s existing docblock list

**Rationale**: `AuditLogger`'s docblock already documents every action name
this app uses (`project.*`, `task.*`, `support_issue.*`, `member.*`,
`department_grant.*`, `permission.denied`) as a single source of truth for
what's logged. This feature adds `user.created`, `user.updated`,
`user.disabled`, `user.reactivated`, `user.password_reset` to that same
list — for `user.updated`, `metadata` carries only the changed fields'
old/new values for `role`/`department`/`name`/`email` (never `password`);
for `user.password_reset`, `metadata` confirms the action happened without
including the new password value anywhere.

**Alternatives considered**: A separate audit mechanism specific to user
management — rejected, this is exactly the "second, parallel system"
pattern this app's constitution (Principle IV) and every prior feature in
this session have avoided.

## Decision: The disabled-account gate returns 401, reusing an existing frontend mechanism, not a new one

**Rationale**: `frontend/src/lib/api.js` already has a response
interceptor whose own comment reads: "Lets AuthContext react to a session
ending mid-use (expiry, invalidation, **disabled account**) the same way it
reacts to explicit sign-out — any 401 from any request clears the signed-in
user, and `RequireAuth` takes it from there." This is exact,
pre-existing, purpose-built infrastructure for this feature's disabled-
account scenario — discovered by reading the frontend, not assumed. `403`
would bypass this mechanism entirely (the interceptor only reacts to 401),
leaving a disabled user's browser showing a raw, unhandled error with no
redirect — precisely the "user may look stuck" risk the architecture
review named. Returning `401` instead means this feature requires **zero
new frontend code**: `onUnauthorized()` fires, `AuthContext` clears `user`,
`RequireAuth` redirects to `/login`, exactly as it already does for an
expired session.

**Alternatives considered**: `403` (arguably more semantically "correct"
per HTTP spec — authenticated but forbidden, not unauthenticated) —
rejected once the existing interceptor was found; matching this codebase's
own established mechanism for "this session is over" outranks abstract
HTTP-semantics purity here, and building a second, parallel
"handle-this-403-specially" path would be exactly the kind of duplicated
mechanism this session has avoided elsewhere. Building new frontend
handling for a distinct disabled-account error — rejected as unnecessary
now that the reuse path is confirmed to already exist and already covers
this exact scenario by name.

## Decision: The last-Admin invariant check must run inside a locked transaction

**Rationale**: The check ("would this leave zero enabled Admins?") and the
write (the actual demote/disable) are two separate steps. Without locking,
two nearly-simultaneous requests — e.g. two different Admins each demoting
a different one of exactly two remaining enabled Admins — could both read
"2 enabled Admins, still ≥ 1 after mine" before either write commits, and
both proceed, leaving zero. Wrapping the read-check-write sequence in
`DB::transaction()` with `lockForUpdate()` on the enabled-Admin rows
forces the second request to wait for the first to commit (or roll back)
before its own count is read, so it correctly sees the post-first-write
state.

**Alternatives considered**: An application-level count check with no
locking (the original design, before this was flagged) — rejected; correct
in the common case but has a real, if narrow, race window under concurrent
admin actions, which is exactly the kind of bug that's invisible in
day-to-day use and catastrophic on the rare occasion it fires (a system
with zero enabled Admins requires direct database intervention to recover
from — the exact failure mode this whole feature exists to avoid needing).

## Decision: New "Users" tab inside the existing `Admin.jsx`, not a new page

**Rationale**: `Admin.jsx` already implements a tabbed "Admin Control
Center" (Members/Grants/Logs) for every other admin-only tool, with an
established `activeTab` state + `Tabs`/`Table`/`Card` component pattern
already in place. Adding a fourth tab is a direct, low-risk extension of
that existing convention; a separate page would duplicate the
`AdminGuard`-wrapped-route setup for no benefit.

**Alternatives considered**: A new standalone `/admin/users` page —
rejected, unnecessary duplication of the guard/layout `Admin.jsx` already
provides.

**Output**: All Technical Context unknowns resolved via direct inspection
of existing code; no `NEEDS CLARIFICATION` markers remain. Proceeding to
Phase 1.
