# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

iTrack is a full-stack project management app: Laravel 13 (PHP 8.4) REST API + a React 19 SPA (Vite 8, Tailwind v4, shadcn/Radix). The backend and frontend are separate deployables — the frontend calls the API over Sanctum session auth, it is **not** an Inertia app (an `laravel-inertia-react` skill is installed but intentionally unused; see Constitution Principle VII).

Core domain hierarchy: `Project` → `Module` → `Activity` → `SubActivity` → `DetailedActivity` (a "task"). Most other features (Kanban, Taskboard, Bug Tracker, Reports, Schedule) are different views/aggregations over this same tree, not separate data models.

## Commands

### Running the app locally
```bash
# From backend/ — runs API server + queue worker + log tail + Vite together
composer run dev
```
Or individually:
```bash
cd backend && php artisan serve --port=8011   # API — see port gotcha below
cd frontend && npm run dev                     # Vite, default port 5173
```

**Port gotcha**: `frontend/vite.config.js` proxies `/api` and `/sanctum` to `VITE_BACKEND_URL` (default `http://127.0.0.1:8011`), and Vite itself defaults to port `5173`. Both of those ports must also be listed in `backend/.env`'s `SANCTUM_STATEFUL_DOMAINS`, or every request after login will silently 401 (the session cookie is set, but Sanctum won't treat an unlisted origin as a stateful SPA request). If you run Vite on a non-default port, add it to `SANCTUM_STATEFUL_DOMAINS` too.

### Backend (run from `backend/`)
```bash
php artisan test                                   # full suite (PHPUnit, not Pest — Pest plugin is installed but tests extend Tests\TestCase in PHPUnit style)
php artisan test --filter=TestClassName             # single test class
php artisan test --filter=test_method_name          # single test method
php artisan test tests/Feature/SomeTest.php          # single file
composer test                                       # config:clear + php artisan test
```
Tests run against in-memory SQLite (`phpunit.xml` overrides `DB_CONNECTION`), not the MySQL dev database — no service container or seeded data needed for CI.

```bash
composer install
php artisan migrate
php artisan db:seed          # seeds from the Excel source in docs/
```

### Frontend (run from `frontend/`)
```bash
npm run dev       # Vite dev server
npm run build     # production build — the real correctness gate; catches compile/syntax errors lint won't
npm run lint      # eslint .
```
There is no frontend test suite configured (CI only runs build + lint for frontend).

### CI (`.github/workflows/ci.yml`)
Two independent jobs on every push/PR to `main`: `php artisan test` (backend) and `npm run build && npm run lint` (frontend).

## Architecture

### Access control — read this before touching any controller or authorization logic

Every authenticated route passes through this middleware chain, **in this order** (`backend/routes/api.php`), and the order is load-bearing, not incidental:

```
auth:sanctum → EnsureUserIsActive → ResolvePreviewSession → BlockWritesDuringPreview
```

- `EnsureUserIsActive` — a disabled account loses access on its *next* request, not just future logins.
- `ResolvePreviewSession` — validates a presented preview token (Admin "preview as user") and attaches the target user to `$request->attributes['preview_target']`.
- `BlockWritesDuringPreview` — rejects mutating requests while previewing. Must run *after* the token is resolved, or it can't know a preview is even active.

Controllers resolve the acting user for **read-scoping** via `App\Support\AccessContext::user($request)`, never `$request->user()` directly — this is what makes preview-as-user transparent to every read path:
```php
$request->attributes->get('preview_target') ?? $request->user()
```
Writes and audit logging always use the real `$request->user()` instead, so the real Admin's identity is what ends up in audit logs even mid-preview.

Role checks go through `App\Traits\HasRole` (`isAdmin()`, `isPmOrAdmin()`, `canWrite()`, etc.) — never inline `$user->role === '...'` comparisons. A null/unrecognized role must fail closed (403), not fall through to allowed. The five roles are `Admin`, `Project Manager`, `Department Head`, `Team Member`, `Client` (`User::ROLE_*` constants).

Tenant/project-scoping for reads goes through `Project::accessibleTo($user)` (an Eloquent scope in `app/Models/Project.php`) — Admin/PM see everything, Department Head is scoped by `DepartmentGrant`, Team Member by `project_assignments`, Client by either a legacy assignment or an approved `ProjectMembership` tied to their `client_organization_id`. New project-scoped queries should filter through this scope (or the equivalent membership check for nested resources), not reimplement the role branching.

### Frontend auth

`AuthContext`/`RequireAuth`/`Login.jsx` implement the real Sanctum-session auth path — this is the only path new frontend work should build against. There is a legacy mock `localStorage` role-switcher some older code paths reference; it is not to be extended with new roles or gating logic (Constitution Principle VI). `PreviewContext`/`useEffectiveUser()` mirrors the backend's preview-session concept on the frontend: components needing role-based UI should read the *effective* (possibly previewed) role via `useEffectiveUser()`, not the raw authenticated user, so previewed views match what the backend would actually return.

### Backend structure

- `app/Http/Controllers/` — one controller per resource; nested resources follow `Route::apiResource('parent.child', ...)->shallow()` (e.g. `projects.modules`, `modules.activities`, down to `sub-activities.detailed-activities`).
- Every endpoint returns data through a Laravel API Resource or an explicit curated array — never a raw model/`toArray()` (Constitution Principle II).
- `app/Support/` — cross-cutting seams (`AccessContext`, `ProjectClientAccess`). `app/Services/` — domain services (`AuditLogger`, `ClientDomainPolicy`, `ProjectInvitationTokenService`, Support Ops classifiers/builders).
- Sensitive mutations (role changes, permission/department grants, deletes, access revocations) are recorded via `App\Services\AuditLogger` at the point of mutation, not reconstructed later.
- Migrations are additive/nullable by default; a destructive schema change (drop/rename a column in use) requires an explicit call-out and rollback path, never silently bundled into an unrelated feature migration.

### Frontend structure

- `src/pages/` — one component per route, wired up in `src/App.jsx`. Some routes are gated by inline guard components (`KanbanGuard`, `SupportOpsGuard`, `AdminGuard`, `RetrospectivesGuard`) that check `useEffectiveUser().role`.
- `src/components/ui/` — shadcn-style primitives (Radix-based). Prefer these and existing shared components over new one-offs — the app deliberately maintains a single coherent visual language across Work Program, Kanban, Support Ops, Retrospectives, Bug Tracker, and Taskboard (Constitution: "Existing Design System First"). `GroupSummaryBar.jsx` in particular is a shared collapsed-group-header pattern (accent bar + segmented/progress summary bars) reused across Taskboard and Work Program's List view — extend it rather than duplicating it for a new grouped view.
- `src/lib/api.js` — the single axios instance (baseURL `/api`, `withCredentials: true`); all API calls go through here, not ad hoc fetches.
- `src/context/` — `AuthContext`, `PreviewContext`, and others providing app-wide state.

### Feature history / Spec Kit workflow

`specs/NNN-feature-name/` directories (001 through 020+) are Spec Kit feature folders — each has its own `spec.md`/`plan.md`/`tasks.md`/`research.md` documenting why a feature was built the way it was. When working in an area, check whether a `specs/` folder exists for it; the `research.md`/`plan.md` files frequently explain non-obvious constraints (e.g. the middleware ordering above comes from `007-permission-hardening`'s research.md). The corresponding `speckit-*` skills (`.claude/skills/speckit-specify`, `-plan`, `-tasks`, `-implement`, `-analyze`, etc.) drive that workflow — invoke them for new feature work rather than free-forming spec/plan/task documents.

`.specify/memory/constitution.md` is the binding project constitution — read it before large changes. Its principles (fail-closed access control, API resources only, tests grow with the feature, audit sensitive mutations, additive migrations, real-auth-only, mandatory coding-standard skills, and a Definition-of-Done gate covering tests/authz/tenant-isolation/OWASP/code-slop review) are enforced expectations, not suggestions. It also has a full **Frontend Design and Review Governance** section: the `frontend-design` and `impeccable` skills must both be applied automatically to any frontend-creating or frontend-reviewing task (the latter scoped to Impeccable's Operate mode — iTrack is a suite of internal tools, not a marketing surface), findings are classified Critical/Major/Minor/Suggestion, and Critical/Major findings block completion unless explicitly accepted.

### Specialist agent routing (mandatory, and route by surface)

`.specify/memory/constitution.md` → **Specialist Agent Routing** names the subagent types that must
be dispatched for particular work surfaces. Two things about it are easy to get wrong:

- **The trigger is the surface the diff touches, not the wording of the request.** "Adjust the token
  values" is an accessibility surface. The rule exists because features 021-023 did WCAG contrast
  work across three consecutive features without ever routing the **Section 508 Accessibility
  Specialist** — each one read as design-token work — so colourblind discriminability was never
  checked on a red/amber/green status system where two states share red.
- **Dispatch during planning, not only at review.** A specialist brought in after implementation can
  only find defects.

Shortest form: accessibility surface → Section 508 Accessibility Specialist. Chart/timeline/encoding
→ Data Visualization Engineer. Auth → Identity & Access Engineer. Query/index → Database Optimizer.
CI/branch protection → DevOps Automator. Plan artifacts → Software Architect. Implemented code →
Code Reviewer. Skipping a routed specialist is an exception and is recorded in plan.md.

**Version control** → **Git Workflow Master** owns the decision; **Software Architect** must sign
off before anything irreversible runs. Routine and unsupervised: staging, commit granularity and
messages, branch creation, pushing a feature branch, opening a PR, local rebases nobody has pulled,
reverts. Requires architect sign-off first: merging to `main`, deleting a branch, force-pushing,
rewriting shared history, tagging a release, changing branch protection, or discarding committed
work. The line is not importance — it is **whether someone who did not run the action can undo it**.
Routing the decision does not mean routing every keystroke: once a strategy is set, executing it is
mechanical. See constitution → Version Control Authority.

### Installed skills that govern implementation (not optional references)

Per Constitution Principle VII, these are enforced, not passive docs:
- Backend PHP/Laravel: `.claude/skills/php-best-practices`, `.claude/skills/laravel-best-practices`, `.claude/skills/laravel-testing`.
- Frontend: `.claude/skills/react-vite-best-practices` (and `typescript-react-patterns` if/when the frontend adopts TypeScript — it's currently plain JS/JSX).
- Any frontend-touching task: `.claude/skills/frontend-design` (mandatory, automatic — see constitution above) alongside `.claude/skills/impeccable` (mandatory, Operate-mode scoped — see constitution above). `frontend-design` sets the reuse-existing-system floor; `impeccable`'s `shape`/`polish`/`harden`/`audit`/`critique` commands are the tools used within it. Run `/impeccable init` once per project to write `PRODUCT.md` before relying on its commands.
- Definition-of-Done gate: `.claude/skills/laravel-owasp-security` and `.claude/skills/code-slop` are run on the changed surface before sign-off.
