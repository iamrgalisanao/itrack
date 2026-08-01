# Tasks: In-App Help Center

**Input**: Design documents from `/specs/012-help-center/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Backend test tasks are included and REQUIRED, not optional — Constitution Principle III mandates a matching test task for any new/changed backend logic in the same change. Frontend verification is manual-in-browser per the constitution's Development Workflow (item 4), not automated tests, matching this project's existing UI-testing practice.

**Organization**: Tasks are grouped by user story (see spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- File paths are exact, repository-root-relative

---

## Phase 1: Setup

**Purpose**: Get the existing guide content into the frontend build and add the one new dependency it needs.

- [X] T001 Move `docs/user-guides/*.md` and `docs/user-guides/images/*.png` into `frontend/src/content/help-guides/` (preserving filenames; `git mv` to keep history), then remove the now-empty `docs/user-guides/` directory, per `research.md` Decision 1
- [X] T002 [P] Add `react-markdown` and `remark-gfm` to `frontend/package.json` and install, per `research.md` Decision 2

**Checkpoint**: Guide content lives in the frontend bundle; the renderer dependency is available.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared role-resolution logic and rendering plumbing every user story's guide depends on — including both places the frontend's "who is the effective user" data can come from.

**⚠️ CRITICAL**: No user story phase below can be verified end-to-end until this phase is complete. In particular, User Story 4 (Preview mode) cannot be honestly verified until T005 exists — verifying it against T004 alone would pass for previewed system roles while silently failing for previewed Client roles.

- [X] T003 Add `highestClientRole(User $user): ?string` to `backend/app/Support/ProjectClientAccess.php`, per `data-model.md`
- [X] T004 Add a `client_role` field to `AuthController::curatedUser()` in `backend/app/Http/Controllers/AuthController.php`, computed via `ProjectClientAccess::highestClientRole($user)`, per `contracts/help-center-api.md` (`GET /api/me`, `POST /api/login`)
- [X] T005 Add the same `client_role` field to `target` in `backend/app/Http/Resources/PreviewSessionResource.php` (`POST /api/preview-sessions`), computed via `ProjectClientAccess::highestClientRole($this->target)` — i.e. the *previewed* user, not the requesting Admin. This is a distinct response shape from `curatedUser()`; skipping this task leaves FR-006 broken for previewed Client-role users (see `data-model.md` "Two response shapes need this field, not one")
- [X] T006 [P] Add `backend/tests/Feature/HelpCenterRoleResolutionTest.php` covering: a Client user with an approved `client_admin` membership receives `client_role: "client_admin"` on `GET /api/me`; a Client user with no approved membership receives `client_role: null`; a non-Client role (e.g. Admin) receives `client_role: null`; an unauthenticated request to `/api/me` still returns `401` unchanged; an Admin starting a Preview session against a Client user with an approved `client_contributor` membership receives `target.client_role: "client_contributor"` on `POST /api/preview-sessions` (Constitution Principle III)
- [X] T007 [P] Create `frontend/src/lib/helpGuides.js` exporting `resolveGuideKey({ role, client_role })`, implementing the resolution table from `data-model.md` (7 system-role/client-tier branches, `client_role: null` defaulting to the Client Viewer guide per FR-004). Pure function, no memoization/caching of any kind — it must be safe to call fresh on every render (FR-010)
- [X] T008 Create `frontend/src/pages/HelpCenter.jsx`: imports all seven markdown files from `frontend/src/content/help-guides/` (Vite raw string import) and renders whichever one `resolveGuideKey()` selects, using `react-markdown` + `remark-gfm`. Calls `resolveGuideKey()` directly in the render path (or a non-memoized hook) — MUST NOT cache/memoize the resolved guide key across renders, mounts, or navigations, so that a role or membership change is reflected the next time the page is opened without requiring a full sign-out/sign-in (FR-010)

**Checkpoint**: The resolver and renderer exist and are unit-reachable; nothing is wired to the UI yet.

---

## Phase 3: User Story 1 - Open my own role's guide from Help Center (Priority: P1) 🎯 MVP

**Goal**: Every system role (Admin, Project Manager, Department Head, Team Member) reaches their own guide from the sidebar, and the Help Center link is never a dead click again.

**Independent Test**: Sign in as each of the four system roles, select Help Center, and confirm each lands on the guide written for that exact role (per `quickstart.md` Scenario 1 and 6).

### Implementation for User Story 1

- [X] T009 [US1] Wire the Help Center button in `frontend/src/App.jsx` (both the expanded sidebar rendering and the collapsed-state rendering, currently dead stubs) to navigate to a new `/help` route
- [X] T010 [US1] Add the `/help` route to `frontend/src/App.jsx`'s router, rendering `HelpCenter.jsx`, sourcing the acting user from `useEffectiveUser()` (not the raw authenticated user — this also satisfies US4, see Phase 6) and passing `{ role, client_role }` into `resolveGuideKey()`

### Verification for User Story 1

- [X] T011 [US1] Manually run `quickstart.md` Scenario 1 (all four system-role personas) and Scenario 6 (cold-load dead-click check)

**Checkpoint**: User Story 1 is fully functional and independently testable — this alone is a shippable MVP for the four internal roles.

---

## Phase 4: User Story 2 - Client users see the guide matching their access level (Priority: P1)

**Goal**: Client-role users see the guide matching their actual project access level, not a generic client document.

**Independent Test**: Approve a user's membership at each of the three client tiers in turn (and with no membership at all), signing in and checking Help Center after each change (per `quickstart.md` Scenario 2).

### Implementation for User Story 2

- [X] T012 [US2] Verify `resolveGuideKey()` (T007) against every row of `data-model.md`'s Client branch, including the multi-membership highest-access tiebreak from FR-003; fix if any case was missed when T007 was first built

### Verification for User Story 2

- [X] T013 [US2] Manually run `quickstart.md` Scenario 2 in full: `client_viewer`, `client_contributor`, `client_admin`, no approved membership (default), and the two-project tiebreak case

**Checkpoint**: All seven guides (four system-role + three client-tier) are now reachable by their intended audience.

---

## Phase 5: User Story 3 - See the guide's screenshots, not just its text (Priority: P2)

**Goal**: Every screenshot embedded in a guide's source markdown renders inline, legibly, in Help Center.

**Independent Test**: Open a guide known to contain screenshots and confirm every referenced image displays (per `quickstart.md` Scenario 3).

### Implementation for User Story 3

- [X] T014 [US3] In `HelpCenter.jsx` (or a small `remark`/`rehype` plugin passed to `react-markdown`), rewrite each guide's relative `images/foo.png` markdown references to the correct Vite-processed asset URL for that guide's own `frontend/src/content/help-guides/images/` folder

### Verification for User Story 3

- [X] T015 [US3] Manually run `quickstart.md` Scenario 3 against the Admin Guide (richest in screenshots) and at least one Client-tier guide

**Checkpoint**: Guides render with working images, not broken-image icons.

---

## Phase 6: User Story 4 - Preview mode shows the guide for the previewed role (Priority: P3)

**Goal**: An Admin using Preview mode sees the previewed role's guide in Help Center — including when the previewed user is a Client-role user, not just another internal role.

**Independent Test**: Start previewing a role (both a system role and a Client-role user), open Help Center, confirm the previewed identity's guide renders in each case; stop previewing, confirm it reverts (per `quickstart.md` Scenario 4).

### Implementation for User Story 4

- [X] T016 [US4] Confirm `HelpCenter.jsx` reads `useEffectiveUser()` (already wired in T010) — no additional frontend code should be required, since Preview-mode consistency falls out of reusing the same hook every other page already uses, *given T005 already put `client_role` on the previewed `target`*. Fix `HelpCenter.jsx` if it was accidentally wired to the raw authenticated user instead

### Verification for User Story 4

- [X] T017 [US4] Manually run `quickstart.md` Scenario 4 in full, including its Client-tier preview case (not just a previewed system role — that case alone would have passed even without T005)

**Checkpoint**: Help Center behaves consistently with the rest of the app under Preview mode, for every role Preview mode supports.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge-case hardening, negative-requirement verification, and final end-to-end validation across all four stories.

- [X] T018 [P] Manually run `quickstart.md` Scenario 5 (a cross-guide link inside rendered markdown, e.g. the Admin Guide's link to the Project Manager Guide, must not crash or dead-end the page) — add a click-handler guard in `HelpCenter.jsx` if the default `react-markdown` link behavior doesn't already degrade gracefully
- [X] T019 [P] Grep the repository for remaining references to the old `docs/user-guides/` path (e.g. any README or cross-doc links) and update them to `frontend/src/content/help-guides/`
- [X] T020 [P] Manually run `quickstart.md` Scenario 7 (FR-007/FR-008: confirm no guide picker, search box, role switcher, or content-editing control exists anywhere on the shipped `HelpCenter.jsx` page)
- [X] T021 Run `php artisan test` (backend) and re-run the full `quickstart.md` validation guide end to end, including Scenarios 4 (Client-tier preview) and 7 (FR-007/FR-008 check)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001's relocated content is what T008 imports) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational only; independent of US1 (different personas), though both are P1
- **User Story 3 (Phase 5)**: Depends on Foundational only; benefits from US1/US2 already being wired up to actually see a guide on screen, but its own change (T014) is independent
- **User Story 4 (Phase 6)**: Depends on Foundational (specifically T005, not just T003/T004) + T010 (US1's route wiring), since it verifies that same code path under Preview mode for both system and Client roles
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Parallel Opportunities

- T001 and T002 (Setup) can run in parallel
- T006 (backend test) can run in parallel with T007/T008 (frontend plumbing) once T003/T004/T005 land
- Once Foundational (Phase 2) is done, US1 and US2 can proceed in parallel (different personas, same underlying resolver)
- T018, T019, and T020 (Polish) can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# After T003/T004/T005 land:
Task: "Add HelpCenterRoleResolutionTest.php backend Feature test (T006)"
Task: "Create frontend/src/lib/helpGuides.js resolver (T007)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md` Scenarios 1 and 6
5. This alone replaces the dead Help Center stub for all four internal roles — a legitimate, demoable increment even before Client-tier, screenshot, or Preview-mode work lands

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate → demo (MVP: internal roles reach their guide)
3. US2 → validate → demo (Client tiers reach their guide)
4. US3 → validate → demo (screenshots render)
5. US4 → validate → demo (Preview-mode consistency, including previewed Client roles)
6. Polish → final full-suite validation

---

## Notes

- [P] tasks touch different files with no dependency on an incomplete task
- Every backend implementation task (T003, T004, T005) has a matching test task (T006) in the same phase, per Constitution Principle III
- Frontend verification is manual-in-browser against `quickstart.md`, per the constitution's existing UI-testing practice — no new frontend test framework is introduced by this feature
- T005 exists because `useEffectiveUser()` reads from two different backend response shapes depending on Preview state — see `data-model.md` "Two response shapes need this field, not one." Do not treat T004 as sufficient for FR-006.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
