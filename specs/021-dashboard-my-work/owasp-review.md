# OWASP Security Review — 021 Dashboard Restructure with My Work List

**Gate**: Constitution Principle VIII, Definition-of-Done gate 4 (`quickstart.md` §4).
**Skill applied**: `.claude/skills/laravel-owasp-security` (scoped per `research.md` §OWASP summary).
**Diff reviewed**: `git diff c00debe..HEAD`, backend + frontend feature surface.
**Date**: 2026-08-26.

> **Stack detection**: No React + Inertia.js detected. `inertiajs/inertia-laravel` is absent
> from `composer.json`, there is no `HandleInertiaRequests` middleware, and the SPA is a
> separate Vite deployable calling the API over Sanctum session auth. The Laravel OWASP
> checklist applies; the Inertia-specific R2/R3 data-exposure and CSRF checks are N/A. The
> R1/R4/R5 React checks still apply and were run against the frontend diff.

---

## Verdict

**PASS — no Critical and no Major findings. Gate 4 is satisfied; the feature is clear to ship.**

Every pre-registered item from `research.md` §OWASP was verified against the actual source,
not against the design docs. The feature's core defense — the assignee ∩ `accessibleTo`
double filter — is present and correct, the routes sit inside the full four-middleware
chain, the create path uses an explicit array with a server-forced assignee, and the list
resource carries none of the banned Support-Ops fields.

Three lower-severity items are recorded below. **Two Minor** and **two Suggestions**; none
block completion.

---

## Findings

### Critical

None.

### Major

None.

---

### Minor

#### MIN-1 — Client sees unfiltered aggregate task counts in the newly-promoted summary row

- **File**: `backend/app/Http/Controllers/ProjectController.php:271-275`, rendered at
  `frontend/src/pages/Dashboard.jsx:406-412, 431-464`
- **Observed**: This feature deliberately fixed two Client leaks in `dashboard()` —
  `completed_recent` (`ProjectController.php:283-291`) and `recent_activities`
  (`ProjectController.php:296-303`) both now branch on `$user->isClient()` and add
  `where('client_visible', true)`. But the restructured summary row also *promotes*
  `in_progress` (`:272`), `delayed` (`:274`) and `overall_progress` (`:275`, an `avg()` over
  every task) to prominent StatCards, and the page subtitle renders
  `completed + in_progress + not_started + delayed` as "N total tasks tracked"
  (`Dashboard.jsx:411, 425`). None of those four values are `client_visible`-filtered, so a
  Client's dashboard reports counts and an average progress that include internal tasks they
  are not permitted to see individually.
- **Expected**: `research.md` R7 states the rule the feature adopted for itself — "this key
  renders prominently, so a Client's copy must exclude internal tasks." Three sibling metrics
  became equally prominent in the same change without inheriting the rule.
- **Impact**: Aggregate-only. No task name, code, status detail or identifier crosses the
  boundary; a Client learns *how many* internal tasks exist in their accessible projects and
  a blended progress percentage. This is why it is Minor and not Major — it is a counting
  oracle, not a content leak, and the individual rows remain correctly filtered in
  `recent_activities` and `DetailedActivityController::index()`.
- **Mitigating context**: `research.md` §"Pre-existing defects" classified the older stat keys
  as deferred cleanup, and the same gap exists in `module_heatmap`
  (`ProjectController.php:324-351`), which likewise pre-dates 021. The finding is recorded
  because the restructure changed these values from incidental to headline, not because the
  code regressed.
- **Recommended fix**: extract the Client branch once and apply it to the whole family —

  ```php
  $detailedActivityQuery = DetailedActivity::whereIn('sub_activity_id', $subActivityIds)
      ->when($user->isClient(), fn ($q) => $q->where('client_visible', true));
  ```

  Every `(clone $detailedActivityQuery)` below then inherits it, `completed_recent`'s
  bespoke branch collapses into it, and the heatmap can take the same predicate on its
  `leftJoin`. Pair with a `DashboardSummaryTest` case asserting a Client's `in_progress` and
  `delayed` exclude a `client_visible = false` task. If the team prefers to keep this as a
  deferred cleanup, record the acceptance in this folder per the Constitution's
  explicitly-accepted-findings rule.

#### MIN-2 — Quick-add leaks module-ID existence: 422 for a nonexistent module, 403 for an inaccessible one

- **File**: `backend/app/Http/Controllers/MyWorkController.php:106` (validation) versus
  `:110-119` (accessibility check); pinned by
  `backend/tests/Feature/MyWorkTest.php:548-560` and `:592-593`
- **Observed**: `module_id` is validated with a bare `'exists:modules,id'`, so a module ID
  that does not exist anywhere returns **422** with `errors.module_id`, while a module that
  exists but belongs to an inaccessible project falls through to the explicit check and
  returns **403** with `You do not have access to this resource.` The two responses differ in
  status code *and* body, so an authenticated Team Member or Client can enumerate which
  module IDs exist system-wide by probing the endpoint.
- **Expected**: `research.md` §Test-requirements calls for "repo denial parity", and the
  house convention (`bootstrap/app.php:47-80`, 007-permission-hardening FR-005/FR-011) is
  that Team Members and Clients must not be able to distinguish "does not exist" from
  "exists but is not yours" for project-scoped models — `Module` is explicitly on that list.
  The sibling endpoint gets this right by folding scope into the rule:
  `TaskboardController.php:110-114` uses
  `Rule::exists('modules', 'id')->where(fn ($q) => $q->where('project_id', $project->id))`,
  collapsing both cases to an identical 422.
- **Impact**: Reveals only the existence of an integer primary key to an already-authenticated
  user — no name, project, or content. Low value to an attacker, but it is the exact
  enumeration signal the project's non-enumeration principle exists to suppress.
- **Recommended fix**: drop `exists` from the rule and let the single accessibility check
  answer both cases, which also means every denial gets the `permission.denied` audit entry
  that the nonexistent-ID path currently skips:

  ```php
  'module_id' => ['required', 'integer'],
  ```

  The `Module::query()->whereKey(...)->whereIn('project_id', ...)->exists()` check at
  `:110-113` then returns 403 uniformly. Update `MyWorkTest::test_quick_add_validation_errors`
  (`:592-593`), which currently asserts the 422 shape for a valid-but-unowned module ID.
  Note the frontend is unaffected: `MyWorkPanel.jsx:559-593` only ever submits a module ID
  drawn from the server-scoped `fetchModules()` list.

---

### Suggestion

#### SUG-1 — `store()` authorizes the effective user but assigns and audits the real user

- **File**: `backend/app/Http/Controllers/MyWorkController.php:96-119` versus `:128-138`
- **Observed**: `$user = AccessContext::user($request)` drives both gates — `canWrite()` at
  `:98` and the module-accessibility check at `:110-113` — while `assignee_user_id` at `:132`
  and `AuditLogger::record()` at `:138` use the real `$request->user()`. During an active
  preview those two identities diverge.
- **Why this is not a finding today**: unreachable. `BlockWritesDuringPreview`
  (`app/Http/Middleware/BlockWritesDuringPreview.php:19-41`) rejects every non-GET request
  while `preview_target` is attached, and its exemption list (`:43-56`) covers only
  `api/logout` and the two preview-session routes. A POST to `api/my-work/tasks` can never
  reach the controller with a preview active, so the divergence cannot be exercised.
  `MyWorkTest` asserts this (quick-add during preview is blocked with `assertDatabaseMissing`).
  It is also the documented decision in `research.md` R6.
- **Suggestion**: this is a latent coupling to the middleware, not to the controller's own
  logic. If a preview-write exemption is ever added, an Admin previewing a Team Member could
  create a task in a module scoped to the *target's* access while the row is assigned to and
  audited as the *Admin*. A one-line guard —
  `if ($request->attributes->has('preview_target')) { abort(403); }` — or simply resolving
  both gates from `$request->user()` in `store()` would make the invariant local to the
  controller. No action required for 021.

#### SUG-2 — No rate limit on `POST /api/my-work/tasks`

- **File**: `backend/routes/api.php:106`, group opened at `:51`
- **Observed**: The new write route inherits no `throttle` middleware. Any Admin, PM, or Team
  Member can create tasks in a tight loop, bounded only by the DB.
- **Context**: This is the app-wide posture, not a 021 regression — no authenticated route in
  `routes/api.php` carries a throttle, and the OWASP checklist item (A07: "payment and
  sensitive action routes have appropriate rate limits") targets sensitive actions rather than
  ordinary authenticated domain writes. Quick-add is authenticated, authorized, tenant-scoped,
  and fully audited, so abuse is attributable.
- **Suggestion**: if a throttle policy is ever adopted, apply it to the whole authenticated
  group rather than bolting it onto this one route. Out of scope for 021.

---

## Checks passed

### A01 — Broken Access Control (the pre-registered items)

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | My Work filters on assignee **AND** `Project::accessibleTo` — assignee alone is not authorization | **PASS** | `MyWorkController.php:51-60`: `$projectIds = Project::query()->accessibleTo($user)->pluck('id')`, then `->where('assignee_user_id', $user->id)` **and** `->whereHas('subActivity.activity.module', fn ($q) => $q->whereIn('project_id', $projectIds))`. Both predicates on the same base builder, cloned into all four bucket queries and the count aggregate. |
| 2 | Empty accessible set fails closed | **PASS** | `whereIn('project_id', [])` matches nothing; `Project::scopeAccessibleTo` (`Project.php:117-118`) returns `whereRaw('1 = 0')` for a null/unknown role, so an unrecognized role gets an empty list, never an unscoped one. |
| 3 | Client defense-in-depth on `client_visible` | **PASS** | `MyWorkController.php:60`: `->when($user->isClient(), fn ($q) => $q->where('client_visible', true))`. Currently moot (Clients cannot be assignees) but correct if that policy loosens. |
| 4 | Both new routes inside `auth:sanctum → EnsureUserIsActive → ResolvePreviewSession → BlockWritesDuringPreview` | **PASS** | `routes/api.php:51` opens the group; `:105-106` register `my-work` and `my-work/tasks` inside it, adjacent to `dashboard` at `:102`. Nothing registers them outside. |
| 5 | `AccessContext::user()` for reads | **PASS** | `MyWorkController.php:47` (index), `:96` (store gates). `ProjectController::dashboard():256` uses the controller's `$this->user($request)` seam, which resolves through `AccessContext`. |
| 6 | Real `$request->user()` for writes and audit | **PASS** | `MyWorkController.php:132` forces `assignee_user_id => $request->user()->id`; `AuditLogger::record()` (`AuditLogger.php:47`) reads `$request->user()` internally, so `actor_user_id`/`actor_role` stay the real Admin mid-preview. |
| 7 | No inline `$user->role === '...'` comparisons | **PASS** | `grep -E "^\+.*->role ===" ` over the backend diff returns nothing. All gates use `HasRole` predicates: `canWrite()` (`:98`, `:89`), `isClient()` (`:60`, `ProjectController.php:287, 301`). |
| 8 | Role predicates fail closed | **PASS** | `HasRole.php:53-58` — `canWrite()` is a positive allow-list of Admin/PM/Team Member; a null or unrecognized role returns false, so Client and Department Head get no write affordance and no write. |
| 9 | Denial parity — TM/Client get 403, no existence oracle on tasks | **PASS** | Both denials at `MyWorkController.php:101` and `:118` return the byte-identical `{"message":"You do not have access to this resource."}` used across 40+ call sites and by the global handler at `bootstrap/app.php:80`. Inaccessible tasks are excluded from the list rather than 404'd, so no oracle exists on the read path. (Module-ID enumeration on the create path is MIN-2 above.) |
| 10 | `meta.can_write` derived from the effective role, not a client allow-list | **PASS** | `MyWorkController.php:89` — `$user->canWrite()` on the `AccessContext` user, so an Admin previewing a Client correctly receives `false`. |
| 11 | Frontend affordance-hiding is not the only gate | **PASS** | `MyWorkPanel.jsx:258` reads `data?.meta?.can_write ?? false` (server-supplied, defaults closed before data lands) and gates the status `<select>` at `:96`, header Add task at `:445`, and both quick-add entry points at `:546, :559`. The server independently enforces `canWrite()` at `MyWorkController.php:98` for creates and via `DetailedActivityController` for status updates. No `useAuth()`/localStorage role gating anywhere in the diff. |
| 12 | No new direct-object-reference surface | **PASS** | Neither route takes a route-model-bound ID. Row clicks re-fetch through the existing, already-authorized `GET /api/detailed-activities/{id}` (`MyWorkPanel.jsx:305`); status changes reuse `PUT /api/detailed-activities/{id}` with its existing tenant check, `canWrite()`, TM field-stripping and audit. Zero new authorization surface, per `research.md` R5. |

### A03 — Injection and mass assignment

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 13 | Query params validated | **PASS** | `MyWorkController.php:33-43` — `today`/`week_end` are `date_format:Y-m-d` with reciprocal `required_with` (all-or-nothing anchors), `per_bucket` is `integer\|min:1\|max:100`, `bucket` is an `in:` whitelist built from the `BUCKETS` constant, `all` is `boolean` with `required_with:bucket`. Post-validation `resolveAnchors()` (`:161-165`) re-asserts `today <= weekEnd`, closing the gap where a supplied `week_end` is compared against a defaulted `today`. |
| 14 | Anchors parameter-bound, never interpolated | **PASS** | The single `selectRaw` (`:185-191`) uses four `?` placeholders with a separate bindings array `[$today, $today, $weekEnd, $weekEnd]`. The SQL string is a compile-time literal — no user value is concatenated into it. `applyBucket()` (`:170-180`) uses `whereDate()`/`whereNull()`, all bound. |
| 15 | No column name derived from user input | **PASS** | `applyBucket()` is a `match` over the validated whitelist returning fixed column names; `orderBy` targets are literals (`:70-71`). `bucket` reaches only a `!==` comparison (`:73`). |
| 16 | Only `selectRaw` in the diff is safe; no `whereRaw`/`orderByRaw`/`DB::raw` added | **PASS** | `grep` for `whereRaw\|orderByRaw\|DB::raw` over added backend lines returns only `MyWorkController.php:185`. |
| 17 | Quick-add uses an explicit array, never `$request->all()` | **PASS** | `MyWorkController.php:128-135` names all six columns literally. `grep '$request->all()'` over the diff returns nothing. `$validated` is used for `name`, `module_id` and `plan_end_date` only. |
| 18 | `client_visible` / `priority` / `status` / `assignee_user_id` cannot be smuggled | **PASS** | None of the four is in the validation rules, so none survives into `$validated`; the create array hard-codes `status => 'not_started'`, `progress => 0`, `client_visible => false`, and `assignee_user_id => $request->user()->id`. Verified by `MyWorkTest::test_quick_add_ignores_smuggled_fields` (`:562-580`) and `test_quick_add_forces_self_assignment` (`:500-510`). |
| 19 | Model defines explicit `$fillable`, not `$guarded = []` | **PASS** | `DetailedActivity.php:28-62` — explicit 34-column `$fillable`. Unchanged by this feature. |
| 20 | No `forceFill`/`forceCreate` with user input | **PASS** | Absent from the diff. |
| 21 | `TaskboardPlacement` extraction introduces no new input path | **PASS** | `TaskboardPlacement.php:29-38` takes an `int $moduleId` already validated and access-checked by both callers, uses `whereKey(...)->lockForUpdate()->firstOrFail()`, and creates rows from two `private const` reserved names — no user-controlled string reaches a write. Behaviour is byte-identical to the `TaskboardController` private method it replaced. |

### Excessive data exposure

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 22 | `MyWorkTaskResource` leaks no Support-Ops internals | **PASS** | `MyWorkTaskResource.php:27-38` returns exactly ten keys: `id, name, code, status, progress, plan_end_date, priority, sub_activity_id, project{id,name}, module{id,name}`. None of `root_cause`, `resolution`, `evidence`, `client_name`, `tenant_name`, `notes`, `description`, `next_action`, `channel`, or `client_priority` appears. |
| 23 | Ban list is test-enforced, not just documented | **PASS** | `MyWorkTest` asserts `assertArrayNotHasKey` over the banned field list, so a future widening of the resource fails CI rather than shipping. |
| 24 | Parent-context names come only from the accessible chain | **PASS** | `project`/`module` are read from the eager-loaded `subActivity.activity.module.project` relation (`MyWorkController.php:67`), and the row itself already passed the `whereIn('project_id', $projectIds)` filter — so a name can only belong to a project in the accessible set. Null-safe navigation (`:22-25`) yields `null` rather than a partial object if a relation is missing. |
| 25 | Every endpoint returns an API Resource or a curated array (Constitution II) | **PASS** | `index` returns a hand-built envelope of `MyWorkTaskResource::collection(...)->resolve()`; `store` returns `new MyWorkTaskResource($task)`. No raw model or `toArray()`. |
| 26 | No secrets in frontend code or browser storage | **PASS** | The only `localStorage` use in the diff (`MyWorkPanel.jsx:205-213, 360`) stores `{projectId, moduleId}` — two non-sensitive IDs the user just picked from a server-scoped list — inside try/catch. No tokens, no `VITE_*` secrets, no API keys in the diff. |

### A09 — Security logging

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 27 | Quick-add audits `task.created` | **PASS** | `MyWorkController.php:138` — `AuditLogger::record($request, 'task.created', 'detailed_activity', $task->id, 'Task created via My Work quick-add.')`, matching `TaskboardController.php:142`'s house pattern. |
| 28 | Denials audit `permission.denied` | **PASS** | `MyWorkController.php:99` (non-writable role) and `:116` (inaccessible module) both call `AuditLogger::denied(...)`, which records the normalized `permission.denied` action with the attempted action in metadata (`AuditLogger.php:72-86`). |
| 29 | Audit actor is the REAL user, never the preview target | **PASS** | `AuditLogger::record` resolves `$user = $request->user()` (`AuditLogger.php:47`) — it never touches `AccessContext`. Confirmed by the class docblock contract at `AccessContext.php:18-21`. |
| 30 | No new audit categories invented | **PASS** | `task.created` and `permission.denied` are both already in the normalized list at `AuditLogger.php:14-25`. |
| 31 | Blocked preview writes are logged | **PASS** | `BlockWritesDuringPreview.php:27-38` records `preview.write_blocked` with method and path before returning 403 — inherited by both new routes. |
| 32 | Log entries carry no secrets | **PASS** | Descriptions are static strings; metadata carries only IDs and the attempted action name. |

### Frontend / React checks (R1, R4, R5)

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 33 | No `dangerouslySetInnerHTML` anywhere in the frontend diff | **PASS** | `git diff c00debe..HEAD -- frontend/ \| grep dangerouslySetInnerHTML` → no matches. All user-controlled text (`task.name`, `task.project?.name`, `task.module?.name`) renders as JSX children, which React escapes: `MyWorkPanel.jsx:81, 89-90`. |
| 34 | No `innerHTML`, `eval()`, `new Function()`, or string `setTimeout` | **PASS** | Same grep, no matches. |
| 35 | No `href`/`src` built from user input | **PASS** | The only link in the panel is a static `<Link to="/work-program">` (`MyWorkPanel.jsx:478`). No user value reaches a URL attribute, so no `javascript:` scheme risk. |
| 36 | User text in `title` attributes is inert | **PASS** | `MyWorkPanel.jsx:79, 88, 100` place task/project names in `title` and `aria-label` — attribute values React escapes, not markup. |
| 37 | Role/permission checks are UI-only and server-mirrored | **PASS** | See check 11. `useEffectiveUser()` (`:216`) is used only to pass `userRole` to `TaskDetailModal` for its own existing affordance logic — never as the write gate. |
| 38 | Errors surface, never fail silently | **PASS** | Status-change failures set a visible row error and hard-refetch (`:285-291`); quick-add failures surface the server's `errors` shape inline and preserve the typed title (`:364-366` — `clearTitle()` runs only on success at `:361`). |

### Remaining OWASP categories relevant to the diff

| # | Category | Result | Note |
|---|----------|--------|------|
| 39 | A02 Cryptographic Failures | **N/A** | No password, token, key, or encrypted-cast handling in the diff. No new signed URLs. |
| 40 | A04 Insecure Design | **PASS** | The security-relevant business rule — "a quick-added task is assigned to the acting user" — is a server invariant (`:132`), not a client promise; `research.md` R6 records the reasoning for not extending the shared `DetailedActivityController::store()`, which would have re-opened the assign-anyone loophole 018 closed. Row caps are enforced server-side (`:73-75`) with true totals from a separate aggregate, so a client cannot request an unbounded payload — `per_bucket` is capped at 100 and `?bucket=X&all=1` expands exactly one whitelisted bucket. |
| 41 | A05 Security Misconfiguration | **N/A** | No config, CORS, `.env`, or debug-flag change in the diff. |
| 42 | A06 Vulnerable Components | **N/A** | No dependency added or upgraded — `composer.json` and `package.json` are untouched by this feature. |
| 43 | A07 Identification & Authentication | **PASS** | No auth code touched. Both routes rely on the existing Sanctum session chain; `EnsureUserIsActive` means a disabled account loses My Work access on its next request. Rate limiting: see SUG-2. |
| 44 | A08 Software & Data Integrity | **PASS** | Not an Inertia app; the SPA's axios instance sends the Sanctum XSRF cookie via `withCredentials` (`lib/api.js`), and `statefulApi()` (`bootstrap/app.php:27`) puts CSRF verification in front of these routes. No new CSRF exclusion. No `unserialize`/`eval`/`extract` of request data. |
| 45 | A10 SSRF | **N/A** | No outbound HTTP. `grep "Http::"` over the backend diff → no matches. |
| 46 | Command injection / dangerous functions | **PASS** | No `exec`, `shell_exec`, `system`, `passthru`, or open redirect in the diff. |
| 47 | Transaction integrity on create | **PASS** | `MyWorkController.php:121-136` wraps placement resolution and the insert in one `DB::transaction`; `TaskboardPlacement` documents that it deliberately does not open its own and relies on the caller's, with `lockForUpdate()` preventing a concurrent duplicate reserved chain. |

---

## N/A items recorded

Per `research.md` §OWASP, these were checked for applicability and confirmed absent from the
021 surface:

- **File uploads** — N/A. No upload path added or modified. `AttachmentController` is untouched;
  no `mimes:`/`max:` validation surface, no user-derived filename, no storage write in the diff.
- **Payments** — N/A. The application handles no payments; no amount, price, discount, or
  enrollment state is calculated anywhere in the diff.
- **SSRF** — N/A. No user-supplied URL is fetched, redirected to, or embedded. No `Http::` client
  call, no `redirect($request->input(...))`.
- **Migrations** — **NONE.** Confirmed by inspection: `git diff c00debe..HEAD --stat` lists no
  file under `backend/database/migrations/`. `scopeOpen()` (`DetailedActivity.php:109-117`) is a
  query scope over the existing NOT NULL `status` column, and the feature reuses the existing
  `assignee_user_id` FK and `plan_end_date` column. `quickstart.md` prerequisites correctly
  predict `php artisan migrate` reports nothing new. No destructive schema change, so
  Constitution Principle V's rollback-path requirement does not engage.
- **Raw HTML rendering** — N/A/PASS. `grep dangerouslySetInnerHTML` over the frontend diff
  returns nothing (check 33).
- **Inertia data exposure (R2) and Inertia CSRF (R3)** — N/A. Not an Inertia application; see the
  stack-detection note at the top.

---

## Summary

| Severity | Count | Blocking |
|----------|-------|----------|
| Critical | 0 | — |
| Major | 0 | — |
| Minor | 2 | No |
| Suggestion | 2 | No |
| Checks passed | 47 | — |

**There are no Critical or Major findings.** Gate 4 passes.

MIN-1 (Client aggregate counts) is the one finding with real security content and is worth a
follow-up ticket or an explicit acceptance note in this folder — it is a small, well-understood
aggregate-only exposure whose fix is a three-line `when()` on the shared query builder. MIN-2
(module-ID enumeration) is a consistency fix against the `TaskboardController` precedent and
would also improve audit coverage. Both SUG items are latent/app-wide and need no action for 021.

### Recommended commands (not run as part of this gate — no dependency change in the diff)

```bash
cd backend && composer audit
cd frontend && npm audit
```
