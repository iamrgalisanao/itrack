# AGENTS.md

Operating rules for AI agents in this repository. Verified against the codebase and
`specs/` as of 2026-08-08. Source priority when documents conflict: (1)
`.specify/memory/constitution.md`, (2) approved specs under `specs/`, (3) executable
tests, (4) current implementation, (5) `CLAUDE.md`/other docs. Unresolved conflicts
are documented below rather than silently resolved — see "Known debt and exceptions."

## 1. Project overview

- **Backend**: Laravel REST API in `backend/` (PHP), Sanctum session auth (not
  token auth), tests via PHPUnit-style classes even though the Pest plugin is
  installed (`backend/tests/`, `extends Tests\TestCase`). Do not hardcode
  framework/language versions in agent instructions — check
  `backend/composer.json` for the current Laravel/PHP version constraints
  before any version-sensitive work (upgrades, deprecations, syntax choices
  tied to a specific version).
- **Frontend**: React SPA (Vite, Tailwind, shadcn/Radix) in `frontend/`, a
  separate deployable calling the API over `/api` — **not** an Inertia app.
  Check `frontend/package.json` for current React/Vite/Tailwind versions
  before version-sensitive work.
- **API boundary**: the frontend's sole HTTP client for iTrack's own backend
  is `frontend/src/lib/api.js` (one `axios.create`, `withCredentials: true`,
  `baseURL: '/api'`); the backend's authenticated routes all sit behind one
  middleware group in `backend/routes/api.php` (see Binding Rules).
- **Spec Kit workflow**: feature work is tracked under `specs/NNN-feature-name/`
  (spec.md/plan.md/tasks.md/research.md per feature), driven by the `speckit-*`
  skills. Check for an existing spec folder before building in an unfamiliar
  area — `research.md` files explain constraints not obvious from code alone.
  **A spec folder's existence alone does not mean the feature is approved or
  fully implemented.** Determine status from explicit repository evidence —
  workflow/task metadata such as `tasks.md` completion markers, commit
  history, executable tests, and the actual implementation — not from
  `tasks.md` completion markers alone and not from folder presence alone.
  Where the repository does not clearly represent a spec's approval or
  completion status, treat that status as unverified rather than assuming
  either approved or unapproved. Treat specs as design intent to verify, not a
  substitute for reading the implementation.

## 2. Binding rules

These are enforced by the constitution, an approved spec, or an executable test —
not just convention. Violating them is a defect, not a style choice.

- **Effective-user resolution (reads)**: read-scoping resolves the acting user via
  `App\Support\AccessContext::user($request)` — `$request->attributes->get('preview_target')
  ?? $request->user()` (`backend/app/Support/AccessContext.php:24-27`) — never
  `$request->user()` directly. This is what makes Admin "preview as user"
  transparent to reads. Source: `specs/007-permission-hardening/research.md`,
  `data-model.md:177-184`.
- **Effective-user resolution (writes/audit)**: `App\Services\AuditLogger`
  resolves its actor from the real `$request->user()` directly
  (`backend/app/Services/AuditLogger.php:47`), never `AccessContext` — verified
  for this specific call site; this is not a claim that every mutation-actor
  field elsewhere in the application has been independently audited. Note:
  each controller's shared authorization helper (used for both read-scoping
  and the write-permission *gate check*, e.g. `ProjectController.php:26-29,61`)
  does resolve via `AccessContext` by design
  (`specs/007-permission-hardening/plan.md:42`); this is safe only because
  `BlockWritesDuringPreview` rejects nearly all non-GET requests whenever a
  preview is active
  (`backend/app/Http/Middleware/BlockWritesDuringPreview.php:19-25`), a
  guarantee covered by `backend/tests/Feature/ProjectScopingTest.php:590`
  (`test_writes_are_blocked_while_previewing_and_never_apply`). Do not weaken
  `BlockWritesDuringPreview` or change the middleware order without
  re-verifying this guarantee.
- **Middleware order** (`backend/routes/api.php:50`) is exactly `auth:sanctum →
  EnsureUserIsActive → ResolvePreviewSession → BlockWritesDuringPreview`, applied to
  one group covering every authenticated route. The order is load-bearing —
  `ResolvePreviewSession` must resolve the preview token before
  `BlockWritesDuringPreview` can act on it. Security-sensitive (see Change
  Boundaries).
- **Role authorization**: every privileged check MUST go through the `HasRole`
  trait's predicates (`isAdmin()`, `isPmOrAdmin()`, `isDepartmentHead()`,
  `canWrite()`, etc. — `backend/app/Traits/HasRole.php`), never an inline
  `$user->role === '...'` comparison used as a privilege-tier gate. A null,
  unrecognized, or `hasValidRole()`-failing role MUST be denied (403), not
  allowed by default. Source: `.specify/memory/constitution.md` Principle I.
  **Note**: not every `$user->role` reference is a violation — per-record
  domain-data matching (e.g. "does this record's stored target-role equal the
  user's role") and null/truthiness checks are not privilege-tier checks and
  don't have a `HasRole` equivalent; see Known Debt for the specific sites
  reviewed.
- **Project/client isolation**: every project-scoped query MUST derive from the
  acting user's accessible project set. For direct `Project` queries, use
  `Project::accessibleTo($user)` (`backend/app/Models/Project.php:89-119`); for
  nested resources (Module/Activity/SubActivity/DetailedActivity/Comment/
  Attachment/etc.) use an equivalent relationship-constrained scope that
  filters through the owning Project's accessibility, not a fresh role check.
  Duplicating role-branching logic directly in a controller instead of routing
  through `accessibleTo()` or an equivalent scope is prohibited — the
  branching lives in one place. `accessibleTo()` denies unknown/null roles via
  `whereRaw('1 = 0')` (`Project.php:117-118`). Source: Constitution Principle
  VIII item 3; covered by `backend/tests/Feature/ProjectScopingTest.php` and
  `RoleAccessTest.php`.
  - **Intentional compatibility constraint, not technical debt**:
    `accessibleTo()` grants Client access via *either* a legacy direct
    `project_assignments` row *or* an approved `ProjectMembership` tied to
    `client_organization_id` (`Project.php:104-115`). Both paths are live
    simultaneously by explicit spec decision
    (`specs/011-project-client-access-control/spec.md:119`, FR-016: preserve
    existing `ProjectAssignment`/`ProjectOwnership`, no destructive migration)
    — this is an approved design choice, not an oversight to "clean up." Any
    change to client-access logic must still handle both paths.
- **API response shaping**: every endpoint returns a Laravel API Resource
  (`backend/app/Http/Resources/`) or an explicit curated array (e.g.
  `AuthController::curatedUser()`) — never a raw Eloquent model or `->toArray()`.
  Sensitive fields (passwords, tokens, internal-only metadata) are never
  serialized. Source: Constitution Principle II. **Note**: existing violations of
  this rule exist — see Known Debt; do not extend them.
- **Audit logging**: role changes, permission/department grants, and destructive
  operations (deletes, access revocations) MUST call `App\Services\AuditLogger::record()`
  (or `::denied()`) at the point of mutation, not be reconstructed later. Source:
  Constitution Principle IV.
- **Additive migrations**: schema changes are additive/nullable by default, one
  concern per migration. A destructive change (dropping/renaming a live column,
  changing a column's meaning) requires an explicit call-out in the spec's plan and
  a stated rollback path — never bundled silently into an unrelated migration.
  Source: Constitution Principle V.
- **Frontend API client usage**: all calls to iTrack's own backend go through the
  single axios instance in `frontend/src/lib/api.js` — confirmed the only
  `axios.create` call site in `frontend/src`. This does not prohibit a different
  transport (e.g. a WebSocket connection, a direct browser upload to an external
  storage provider) when an approved spec explicitly calls for it; the rule is
  "use `lib/api.js` for iTrack's own backend," not "ban all other network code."
- **Backend quality gate**: `php artisan test` must pass for the changed surface
  (PHPUnit-style, `backend/tests/Feature` and `Unit`) — Constitution Principle
  VIII item 1 plus Principle III (new/changed endpoints, relationships, or authz
  rules ship a test in the same change, covering the happy path and at least one
  denied/unauthorized path for anything role-gated).
- **Frontend quality gate**: `npm run build` must succeed (it is the real
  correctness gate — there is no configured frontend test runner, see Known Debt)
  and `npm run lint` must pass, per `.github/workflows/ci.yml`.
- **Real auth only**: new frontend work builds against `AuthContext`/`useAuth()`/
  `RequireAuth`/`Login.jsx` (real Sanctum-session auth) and reads role via
  `useEffectiveUser()` (`PreviewContext`) for preview-aware UI. Source: Constitution
  Principle VI. **Unresolved note**: the constitution and `CLAUDE.md` both describe
  a legacy `localStorage` mock role-switcher in `App.jsx`/`UserContext` that must
  not be extended — this was **not found** anywhere in current `frontend/src` during
  verification (only a historical mention in `specs/001-real-auth-cutover/spec.md:9`).
  Treat the prohibition as still binding (extending any future mock-auth mechanism
  is exactly what it guards against) but do not spend time hunting for code that
  may no longer exist.

## 3. Current conventions

These describe how the codebase is actually written today. They are not
constitution-mandated and are not permanently binding — an approved spec may
change any of them. Do not treat "this is what exists" as "this is required,"
but also do not introduce a competing pattern (a new state-management library, a
FormRequest-based validation layer, a Policy class, etc.) without an approved
spec, since that constitutes a broad architectural change (see Change Boundaries).

- **Inline validation**: there is no `app/Http/Requests/` directory; all backend
  validation is inline `$request->validate()` inside controller actions (26 of 28
  controllers). Current pattern, not a documented mandate.
- **Controller/service organization**: no `app/Policies/` directory exists.
  Authorization logic lives in `App\Support\AccessContext`,
  `App\Support\ProjectClientAccess` (client-specific gating), the `HasRole` trait,
  and inline controller checks. Cross-cutting logic otherwise lives in
  `app/Services/` (e.g. `AuditLogger`, `ClientDomainPolicy`,
  `ProjectInvitationTokenService`, Support Ops classifiers/builders).
- **Frontend page-level data fetching**: every page in `frontend/src/pages/`
  fetches its own data via `useState`+`useEffect` calling functions from
  `frontend/src/lib/api.js` directly. Current pattern.
- **Current state-management approach**: no global state library is installed
  (no Redux/Zustand/Jotai/React Query/SWR found in `package.json` or imports as
  of this verification). Local/UI state uses React Context (`AuthContext`,
  `PreviewContext`, an inline `ThemeContext` in `App.jsx`) plus component-level
  `useState`.
- **PHPUnit test style**: `backend/tests/` uses PHPUnit-style classes
  (`extends Tests\TestCase`) exclusively — zero Pest `test()`/`it()` syntax found
  — even though the Pest plugin is installed. Match this style for new backend
  tests.

Agents MUST NOT introduce a broad architectural change (a new frontend
state-management library, FormRequest-based validation, Policy classes, a new
HTTP client, a new test framework style, etc.) without an approved spec under
`specs/` covering it. Matching an existing convention is the default; changing one
is a specced feature, not an incidental choice made while doing something else.

## 4. Known debt and exceptions

These are real, current gaps or deviations. They are **not** sanctioned patterns
to copy — they are backlog items. An agent may fix one of these in isolation
(see Change Boundaries) but should not extend them.

- **Inconsistent API Resource usage** (violates Principle II / Binding Rule "API
  response shaping"): 12 of 28 controllers never reference an API Resource class.
  Confirmed raw-model/raw-collection returns at
  `backend/app/Http/Controllers/ProjectController.php:246-249` (`'project' =>
  $project`) and `backend/app/Http/Controllers/AuditLogController.php:72`
  (`response()->json($query->paginate($perPage))`). Not exhaustively audited
  across all 28 controllers.
- **Role-comparison sites reinspected**: of 4 sites originally flagged as
  possible Principle I violations, only one is even borderline:
  - `NotificationController.php:85` (`$notification->user_role === $user->role`
    in `markAsRead()`) — gates a 403, but compares stored per-record domain
    data (a legacy notification's target-role field) rather than performing a
    privilege-tier check; `HasRole` has no applicable predicate for this
    per-record match. **Flagged for human review, not a confirmed violation.**
  - `NotificationController.php:210` — notification-generation targeting logic,
    not a request-level access gate; the method's actual privilege check
    already uses `isAdmin()`/`isProjectManager()`. **Not a violation.**
  - `DepartmentGrant.php:39` — a null/truthiness check on `$user->role`, not a
    value comparison. **Not a violation.**
  - `DepartmentGrant.php:43` — passes `$user->role` as a lookup parameter for a
    `DepartmentGrant` query; domain-data usage, not an authorization
    comparison. **Not a violation.**
- **Missing frontend test runner**: `frontend/src/lib/supportTemplates.test.js`
  exists, but `package.json` has no `test` script and no test-runner dependency
  (no vitest/jest found). This test file is not executed anywhere, in CI or
  locally.
- **Documentation/deployment inconsistencies** (unresolved — do not silently
  pick a side):
  - `docs/deployment-vps.md` describes a Docker-Compose-based deployment and a
    root `.env.production.example` has compose-shaped vars
    (`DB_ROOT_PASSWORD`, `ITRACK_HTTP_BIND`), but **no `docker-compose.yml`
    exists anywhere in the repo** (Dockerfiles do exist:
    `backend/Dockerfile`, `docker/nginx/Dockerfile`). Unverified whether the
    compose file is untracked/generated or the doc is stale.
  - `specs/012-*` is missing from an otherwise contiguous `001`–`020` sequence.
    Reason unverified.
  - `backend/app/Http/Middleware/EnsureUserIsActive.php:11`'s doc comment claims
    it's "Applied alongside auth:sanctum ... in bootstrap/app.php" — it is
    actually registered in `routes/api.php:50`. Stale comment, not a behavioral
    issue.
  - The constitution/`CLAUDE.md` legacy mock-role-switcher warning does not
    correspond to any code found in current `frontend/src` (see Binding Rules,
    "Real auth only").

## 5. Change boundaries

- **Safe, isolated changes**: adding an API Resource to a controller that
  currently lacks one (one controller at a time, with a test asserting the
  response shape is unchanged where it matters to the frontend).
- **Changes requiring an approved spec**: anything altering
  `Project::accessibleTo()`'s branching, the dual legacy/membership
  client-access paths, the middleware chain or its order, `AccessContext`'s
  resolution logic, or introducing a new frontend state-management library /
  backend Policy or FormRequest layer as a project-wide convention. Confirm the
  spec is actually approved (see "Spec Kit workflow" caveat above), not just
  present as a folder.
- **Security-sensitive areas requiring explicit review** (Constitution Principle
  VIII items 2–3 apply in full): `backend/routes/api.php`'s middleware group and
  ordering; `AccessContext`; `ResolvePreviewSession` /
  `BlockWritesDuringPreview`; `Project::accessibleTo()`; `HasRole`; any endpoint
  touching role, department-grant, or client-membership state.
- **Prohibited unrelated refactors**: do not rename, restyle, or "clean up"
  files outside the scope of the current task's spec/request — especially inside
  the security-sensitive areas above, where an unrelated formatting diff makes
  the actual change harder to review for authz correctness.
- **Files/flows that must not be changed casually**: `backend/routes/api.php`'s
  middleware group definition (line 50); `AccessContext.php`;
  `BlockWritesDuringPreview.php`; `ResolvePreviewSession.php`;
  `Project::accessibleTo()` (`Project.php:89-119`); `HasRole.php`. Changes here
  require a spec and explicit test coverage, not an incidental touch while doing
  something else.

## 6. Definition of done

Per Constitution Principle VIII, provide evidence (command run + result, not just
a claim) for every applicable gate:

1. **Backend tests**: `cd backend && php artisan test` passes for the changed
   surface; a new/changed endpoint, relationship, or authz rule has a
   corresponding `backend/tests/Feature` test covering the happy path and at
   least one denied/unauthorized path.
2. **Frontend build and lint**: `cd frontend && npm run build && npm run lint`
   succeed.
3. **Authorization review**: the change is checked against Binding Rule "Role
   authorization" — no inline `role ===` privilege-tier comparisons, no
   default-allow paths.
4. **Tenant-isolation review**: the change is checked to confirm it cannot
   return or mutate data outside the acting user's accessible
   Projects/ClientOrganizations, via `Project::accessibleTo()` or the equivalent
   scope for the resource.
5. **Migration safety**: any schema change is additive/nullable, one concern per
   migration; a destructive change has an explicit call-out and rollback path.
6. **API contract review**: new/changed endpoints return via an API Resource or
   explicit curated array, never a raw model.
7. **Audit logging**: sensitive mutations (role changes, grants, deletes, access
   revocations) call `AuditLogger::record()`/`denied()` at the point of mutation.
8. **Security and quality review**: apply the constitution-mandated reviews —
   `laravel-owasp-security` and `code-slop` for the changed backend/frontend
   surface (Principle VIII items 4–5), and `frontend-design` for any
   frontend-touching change (constitution's Frontend Design and Review
   Governance section). Use these named skills when they're available in the
   working environment. If a named skill isn't available (uninstalled, renamed,
   or not exposed in the current environment), perform an equivalent manual
   review covering the same concerns and explicitly disclose in your output
   that you substituted a manual review and why — do not silently skip the
   gate.

A task that cannot satisfy an applicable gate must document the exception and
why, not silently skip it.

## 7. Agent output rules

- Cite file paths and symbols (function/class/line) for every finding or claim
  about the codebase.
- Separate verified facts (you read the code/test/spec) from inference; mark
  unverified information explicitly rather than presenting it as fact.
- Keep diffs minimal — touch only the files required by the task's scope.
- Report the commands you executed and their results (test runs, build/lint
  output), not just a summary of intent.
- Disclose unverified assumptions before acting on them, especially in
  security-sensitive areas (Section 5).
- **Destructive or irreversible actions** (migration rollback, force-push,
  deleting data, bypassing `BlockWritesDuringPreview`/`AccessContext`, dropping
  a live column) require explicit authorization before proceeding — stop and
  ask.
- **Non-destructive uncertainty** does not require stopping: make the safest,
  most minimal assumption, and label it explicitly in your output, rather than
  pausing for every small ambiguity.
- Avoid changing files unrelated to the current task, even if they look
  outdated or "slop"-y — flag them instead of fixing them opportunistically,
  unless the task explicitly includes cleanup.
