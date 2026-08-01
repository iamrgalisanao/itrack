# Implementation Plan: In-App Help Center

**Branch**: `012-help-center` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-help-center/spec.md`

## Summary

Wire the existing, currently non-functional "Help Center" sidebar link to a new `/help` route that renders one of the seven already-written role-based markdown guides, auto-selected for the signed-in user's effective role. System roles (Admin, Project Manager, Department Head, Team Member) map one-to-one to a guide. Client-role users are resolved by their highest-access approved `ProjectMembership` role (Admin > Contributor > Viewer), defaulting to Viewer when none can be resolved. The guide content itself is not new work — it already exists in `docs/user-guides/` — this feature is purely about getting it in front of the right user, in the app, with zero authoring surface.

## Technical Context

**Language/Version**: PHP 8.4 (Laravel 13) backend; JavaScript (React 19) frontend — both fixed by the project constitution, no change needed for this feature.

**Primary Dependencies**: Adds one new frontend dependency for markdown-to-JSX rendering (decision and rationale in `research.md`). No new backend packages.

**Storage**: N/A — no new database tables or columns. Guide content ships as static files bundled with the frontend; the one piece of dynamic data this feature needs (a Client user's own membership role) already exists in the `project_memberships` table.

**Testing**: Backend — PHPUnit Feature test under `backend/tests/Feature` for the new role-resolution data exposed to the frontend (happy path + unauthenticated/denied path), per Constitution Principle III. Frontend — manual browser verification per the constitution's Development Workflow, exercising each of the seven role/membership configurations.

**Target Platform**: Existing web app (React SPA + Laravel API) — no new platform surface.

**Project Type**: Web application (existing frontend + backend split).

**Performance Goals**: None beyond standard SPA page-load expectations — this is a static documentation page, not a data-intensive view.

**Constraints**: MUST NOT require a database migration (guide content is static, not stored data). MUST NOT expose a Client user's full project-membership list (that's already gated to Admin/PM/`client_admin` per `ProjectMembershipController::canManageMemberships`) just to let that same user learn their own role — the self-lookup must be narrower than the existing membership-listing endpoint.

**Scale/Scope**: 7 static guide documents (~21 supporting screenshots), one new frontend route, one small backend read-only enrichment applied at both places the frontend's effective-user data can come from (`curatedUser()` and `PreviewSessionResource`) — no new endpoint class either way.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| I. Fail-Closed Access Control | The one new piece of server logic (resolving a Client user's own membership role) reuses the existing `HasRole` predicates (`isClient()`) and the existing `ProjectClientAccess` support class's membership-scoping pattern — it does not introduce a new inline role string comparison. An unresolvable/invalid role yields the documented default (Client Viewer guide client-side; `null`/absent role from the server), never an open grant. **PASS** |
| II. Consistent API Contracts | No raw Eloquent models are returned. The Client role is exposed as one additional curated field on the existing `GET /api/me` payload (`AuthController::curatedUser()`), not a parallel raw endpoint. **PASS** |
| III. Test Coverage Grows With the Feature | Both the `curatedUser()` enrichment and the `PreviewSessionResource` enrichment ship with a Feature test covering an approved-Client-member happy path (both a real session and a previewed session), a no-membership/non-Client null path, and an unauthenticated-request path, added in the same change. **PASS** (tracked as a task) |
| IV. Audit Sensitive Mutations | Not applicable — this feature performs no mutations. It is entirely read-only (viewing static content, reading one's own role). **N/A** |
| V. Small, Additive, Reversible Migrations | Not applicable — no migration at all. **PASS (trivially)** |
| VI. Real Auth Is the Only Forward Path | Guide resolution reads the real effective user via `useEffectiveUser()` on the frontend (which itself falls back to `useAuth()`/`user.role` when no Preview session is active) and the real Sanctum session user on the backend — the legacy mock persona switcher is not touched or extended. **PASS** |

No violations. Complexity Tracking table is not needed.

**Post-Phase 1 re-check**: `research.md` and `data-model.md`'s final design (one method on the existing `ProjectClientAccess` support class, one field added to the existing `curatedUser()` payload, zero migrations, zero new routes) matches exactly what this gate assessed above — no new violation was introduced during design. Gate remains **PASS**.

## Project Structure

### Documentation (this feature)

```text
specs/012-help-center/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── Http/Controllers/AuthController.php     # curatedUser() gains one field: client_role
│   ├── Http/Resources/PreviewSessionResource.php  # target gains the same field: client_role
│   └── Support/ProjectClientAccess.php         # gains one method: highestClientRole(User $user): ?string
└── tests/Feature/
    └── HelpCenterRoleResolutionTest.php        # new — covers both enrichment points

frontend/
├── src/
│   ├── pages/
│   │   └── HelpCenter.jsx                    # new page — resolves + renders a guide
│   ├── content/
│   │   └── help-guides/                      # relocated canonical source (see research.md)
│   │       ├── admin.md
│   │       ├── project-manager.md
│   │       ├── department-head.md
│   │       ├── team-member.md
│   │       ├── client-viewer.md
│   │       ├── client-contributor.md
│   │       ├── client-admin.md
│   │       └── images/*.png
│   └── App.jsx                                # Help Center link gains a real route + onClick
└── package.json                               # +1 markdown-rendering dependency
```

**Structure Decision**: Standard existing web-application split (`backend/` Laravel API, `frontend/` React SPA) — this feature adds one page, one route, the same small backend enrichment applied at both places `useEffectiveUser()` can source its data from, and relocates existing static content into the frontend bundle. No new top-level directories, no new services.

## Complexity Tracking

*No Constitution Check violations — this section is intentionally empty.*
