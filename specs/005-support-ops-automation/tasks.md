---

description: "Task list template for feature implementation"
---

# Tasks: Support Ops Automation (Support Ops Phase 4)

**Input**: Design documents from `/specs/005-support-ops-automation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/notifications-api.md, quickstart.md

**Tests**: Included. Constitution Principle III and plan.md's Testing section both require Feature-test coverage for the retrieval/ownership correction (the leakage matrix SC-005 demands) and for each new entry type's generation correctness, plus a Unit test for the one genuinely new pure-logic piece (`SupportOpsWeeklyReportBuilder`).

**Organization**: Tasks are grouped by user story (US1/US2/US3, matching spec.md's priorities). Unlike 004, there is **no Setup phase** — this feature adds zero new routes, zero new migrations, and zero new frontend pages (plan.md's Scale/Scope), so there is nothing to scaffold before the Foundational phase's tests begin. The retrieval/ownership query correction (index/markAsRead/markAllAsRead all needing the same `recipient_user_id = me OR (null AND role matches)` condition) is Foundational rather than part of any one story, because all three user stories depend on it being correct before their own leakage tests can mean anything — proving it once, generically, with a manually-seeded row, is more efficient and more rigorous than each story re-proving the underlying query from scratch.

**Post-`/speckit-analyze` update (2026-07-23)**: five coverage gaps found during analysis were folded in below rather than left for implementation-time discovery — T020 and T027 (requester-only generation scoping, mirroring T012's proof for the overdue type but for daily/weekly), T025 (weekly zero-state, the sibling case to T018's daily zero-state), T029 (ISO week-boundary case), and T032 (cross-type distinguishability + notification-copy guardrail, both required by FR-009/FR-008 but previously untested). All task numbers below reflect this update — there is no prior numbering to reconcile against, since nothing had been implemented yet when the gaps were found.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Paths are absolute from repository root, matching plan.md's Project Structure section

## Path Conventions

Web application, matching this repo's existing 001-004 structure: `backend/app/`, `backend/tests/`.
No frontend paths — this feature has zero frontend changes (plan.md).

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: The retrieval/ownership correction every user story depends on, proven generically before any of this feature's real generators exist. **MUST complete before any user story phase.**

**⚠️ CRITICAL**: No user story's leakage test means anything until the underlying query correction is proven correct in isolation — a manually-seeded row with `recipient_user_id` set, checked against all three affected endpoints.

### Tests first (write these, confirm they FAIL before implementing)

- [x] T001 [P] Feature test in `backend/tests/Feature/NotificationSupportOpsAutomationTest.php`: seed a `Notification` row directly with `recipient_user_id` set to a specific user; `GET /api/notifications` returns it for that exact user, does **not** return it for a different user sharing the same role, and still returns a legacy row (`recipient_user_id` null, `user_role` matching) for both — the three-case matrix from spec.md/plan.md, proven before any real generator exists
- [x] T002 [P] Feature test in the same file: the same three-case matrix for `PUT /api/notifications/{id}/read` — own individually-scoped row succeeds (200), a different same-role user's individually-scoped row is denied (403), a legacy null-recipient role-matching row succeeds (200) for any user sharing that role
- [x] T003 [P] Feature test in the same file: the same three-case matrix for `POST /api/notifications/read-all` — only the requester's own individually-scoped rows and shared legacy rows are marked read; another same-role user's individually-scoped row is left untouched

### Implementation

- [x] T004 [P] Create `NotificationResource` in `backend/app/Http/Resources/NotificationResource.php` (Constitution Principle II) — same field set the raw `Notification` model already exposed (`id`, `type`, `severity`, `title`, `message`, `detailed_activity_id`, `link_url`, `event_key`, `event_date`, `metadata`, `is_read`, `read_at`, `created_at`)
- [x] T005 Correct the retrieval query in `NotificationController::index()` to `recipient_user_id = current_user.id OR (recipient_user_id IS NULL AND user_role = current_user.role)`, replacing the current `where('user_role', ...)` alone; wrap the response in `NotificationResource::collection()`; make T001 pass (depends on T004)
- [x] T006 Correct the ownership check in `NotificationController::markAsRead()` to the same two-branch condition, replacing `$notification->user_role !== $user->role`; wrap the response in `NotificationResource`; make T002 pass (depends on T004)
- [x] T007 Correct the query in `NotificationController::markAllAsRead()` to the same two-branch condition, replacing `where('user_role', $user->role)` alone; make T003 pass
- [x] T008 [P] Feature test (regression) in the same file: every pre-existing notification type (`assignment`, `mention`, `overdue`, `due_soon`) — all with `recipient_user_id` null — remains retrievable/actionable via all three endpoints by every user sharing the matching role, exactly as before T005-T007 (proves the correction is additive, not a behavior change for legacy rows)

**Checkpoint**: The retrieval/ownership correction is proven correct and regression-free. Every user story below only needs to add its own generator on top of this.

---

## Phase 2: User Story 1 - See overdue client updates in your notifications (Priority: P1) 🎯 MVP

**Goal**: A user who is eligible (by role and project access) for a stale support issue sees an overdue entry the next time they load their notifications; it never leaks to a same-role colleague without that project access; it stops reading as urgent once cleared, without being deleted.

**Independent Test**: Let a support issue's client update cross its threshold; confirm each eligible individual recipient (per FR-001) sees a correctly-worded entry, a same-role colleague without project access sees nothing, recording the client update downgrades the entry (never deletes it), and reloading never duplicates it.

### Tests for User Story 1

- [x] T009 [P] [US1] Feature test in `NotificationSupportOpsAutomationTest.php`: recipient eligibility matrix for `support_overdue` — Admin and Project Manager are always eligible regardless of the issue's `responsible` field; a Team Member/Department Head is eligible only when `responsible` resolves to their role **and** they can access the issue's project; a same-role user failing either half of that AND (role match without project access, or project access without role match) receives nothing (FR-001)
- [x] T010 [P] [US1] Feature test in the same file: viewing notifications twice for the same threshold-crossing produces exactly one `support_overdue` entry, not two (FR-003)
- [x] T011 [P] [US1] Feature test in the same file: after the issue's client update is recorded (no longer stale), the entry is still present in the response (never omitted, never deleted — confirmed via a direct row-count check), with `severity` downgraded to `info` and `metadata.is_currently_urgent` set to `false` (FR-002, data-model.md's resolved decision)
- [x] T012 [P] [US1] Feature test in the same file: generation is scoped to the requesting user only — when User A (an eligible recipient) loads notifications, User B (also eligible, but hasn't loaded their own notifications yet) does not yet have their own row generated; B's row appears only once B loads their own notifications (research.md's "scoped to requester" decision)

### Implementation for User Story 1

- [x] T013 [US1] Implement recipient-eligibility resolution as a private method on `NotificationController`: Admin/Project Manager always eligible; Team Member/Department Head eligible only when `Notification::resolveRoleFromResponsible($issue->responsible)` matches their role; filter to users who can access the issue's project (`Project::accessibleTo`-equivalent, applied per candidate user) — make T009 pass
- [x] T014 [US1] Implement `generateSupportOverdueEntries($user)` private method: for support/learning issues where `SupportOpsStaleness::state()` (004) is `'stale'`, scoped to `$user`'s accessible projects, create a `support_overdue` `Notification` (`recipient_user_id = $user->id`, `event_key` per data-model.md's shape) only if `$user` is eligible per T013 and no such entry already exists for this crossing; wire into `index()` alongside the existing `generateOverdueNotifications()`/`generateDueSoonNotifications()` calls — make T010, T012 pass (depends on T005, T013)
- [x] T015 [US1] Implement urgency derivation for `support_overdue` rows at response time: re-check `SupportOpsStaleness::state()` against the linked issue; if no longer `'stale'`, present `severity: 'info'` and `metadata.is_currently_urgent: false` (without mutating the underlying stored row) — make T011 pass (depends on T005)

**Checkpoint**: User Story 1 is fully functional and independently testable/demoable as the MVP.

---

## Phase 3: User Story 2 - See a daily open-issue summary (Priority: P2)

**Goal**: A user sees a dated summary of their own accessible-project counts across Today's four sections, once per calendar day, never leaking another user's counts even across a shared role, and never eagerly generated for anyone but the requester.

**Independent Test**: Have open Support Ops issues across accessible projects; confirm a dated summary with correct per-section counts appears once per day, never shows another same-role user's counts, and is never generated for a user who hasn't loaded their own notifications.

### Tests for User Story 2

- [x] T016 [P] [US2] Feature test in `NotificationSupportOpsAutomationTest.php`: a `support_daily_summary` entry's counts match `SupportOpsTodayClassifier`'s bucket sizes for that same user's accessible projects (FR-004)
- [x] T017 [P] [US2] Feature test in the same file: viewing notifications twice the same calendar day produces exactly one `support_daily_summary` entry (FR-004, FR-008)
- [x] T018 [P] [US2] Feature test in the same file: a user with zero accessible projects or zero qualifying issues still gets a summary with all-zero counts, never silently skipped (FR-007)
- [x] T019 [P] [US2] Feature test in the same file: two users sharing a role but with different accessible projects each see only their own counts in their own summary — never each other's (FR-006, SC-005)
- [x] T020 [P] [US2] Feature test in the same file: generation is scoped to the requesting user only — when User A loads notifications, User B (a different eligible internal user who hasn't loaded their own notifications yet) does not yet have their own daily summary generated (mirrors T012's proof for the overdue type; research.md's "scoped to requester" decision applies to all three entry types, not just overdue)

### Implementation for User Story 2

- [x] T021 [US2] Implement `generateDailySummary($user)` private method: run `SupportOpsTodayClassifier::classify()` (004, unchanged) over `$user`'s accessible support/learning issues, count each of the four buckets, create a `support_daily_summary` `Notification` (`recipient_user_id = $user->id`, `event_key` per data-model.md, calendar day per FR-010's single-timezone rule) only if not already generated today; wire into `index()` — make T016-T020 pass (depends on T005)

**Checkpoint**: User Story 1 and User Story 2 both work independently.

---

## Phase 4: User Story 3 - See a weekly review report (Priority: P3)

**Goal**: A user sees a weekly rollup (opened/resolved/still-stale) of their own accessible-project Support Ops activity, once per ISO week, with "resolved" sourced correctly from existing status-change history, never leaking across users, and never eagerly generated for anyone but the requester.

**Independent Test**: Have Support Ops activity (created, resolved via a real status transition, and still-open) across the past week; confirm a weekly report with correct counts appears once per week, correctly respects ISO week boundaries, and never leaks across same-role users.

### Tests for User Story 3

- [x] T022 [P] [US3] Unit test `SupportOpsWeeklyReportBuilder` in `backend/tests/Unit/SupportOpsWeeklyReportBuilderTest.php` — pure counting logic in isolation (no DB query, matching 004's classifier-test pattern): given already-fetched collections of opened issues, resolved status-change records, and current issues, returns correct `opened`/`resolved`/`still_stale` counts, reusing `SupportOpsStaleness::state()` (004) for the "still stale" count
- [x] T023 [P] [US3] Feature test in `NotificationSupportOpsAutomationTest.php`: a `support_weekly_report` entry's counts are correct against real seeded data — an issue created this week counts as opened, an issue genuinely transitioned to `completed` this week (via a real save through `updateDetailedActivity`, producing a real `task.status_changed` audit entry) counts as resolved, a currently-stale issue counts as still-stale — scoped to the user's accessible projects (FR-005, FR-011)
- [x] T024 [P] [US3] Feature test in the same file: viewing notifications twice the same ISO week produces exactly one `support_weekly_report` entry (FR-005, FR-010)
- [x] T025 [P] [US3] Feature test in the same file: a user with zero accessible projects or zero qualifying weekly activity still gets a `support_weekly_report` entry with `opened = 0`, `resolved = 0`, `still_stale = 0` — the sibling case to T018's daily zero-state, required by FR-007's explicit "daily **or** weekly" wording
- [x] T026 [P] [US3] Feature test in the same file: two users sharing a role but with different accessible projects each see only their own counts (FR-006, SC-005)
- [x] T027 [P] [US3] Feature test in the same file: generation is scoped to the requesting user only — when User A loads notifications, User B (a different eligible internal user who hasn't loaded their own notifications yet) does not yet have their own weekly report generated (mirrors T012/T020 for the weekly type)
- [x] T028 [P] [US3] Feature test in the same file: an issue resolved before this feature existed (no matching `task.status_changed` audit entry, e.g. status set directly via a factory rather than through the controller) is **not** counted as resolved this week — FR-011's explicit "not miscounted" requirement, not silently treated as an error
- [x] T029 [P] [US3] Feature test in the same file: an issue created/resolved on a Sunday belongs to the **previous** ISO week, not a new week starting that Sunday — proves the Monday-start convention (FR-010) is actually in effect, not just incidentally correct because a test happened to run mid-week

### Implementation for User Story 3

- [x] T030 [US3] Implement `SupportOpsWeeklyReportBuilder` in `backend/app/Services/SupportOpsWeeklyReportBuilder.php` — pure `build()` method taking already-fetched collections and returning `{opened, resolved, still_stale}` counts (data-model.md); make T022 pass
- [x] T031 [US3] Implement `generateWeeklyReport($user)` private method: query issues created within the current ISO week (FR-010) scoped to `$user`'s accessible projects, `task.status_changed` audit entries transitioning to `completed` within that week for currently support/learning-typed issues in those projects, and currently-stale issues in those projects; pass all three to `SupportOpsWeeklyReportBuilder::build()`; create a `support_weekly_report` `Notification` (`recipient_user_id = $user->id`, `event_key` per data-model.md) only if not already generated this week; wire into `index()` — make T023-T029 pass (depends on T005, T030)

**Checkpoint**: All three user stories are independently functional together.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across the whole feature, matching quickstart.md and the constitution's regression expectations.

- [x] T032 [P] Feature test in `NotificationSupportOpsAutomationTest.php`: `support_overdue`, `support_daily_summary`, and `support_weekly_report` each have distinct `type` values, distinct `title`/`message` content, and (for `support_overdue`) a `severity` that actually varies with urgency (FR-009) — none confusable with each other or with `assignment`/`mention`/`overdue`/`due_soon` at a glance; and, in the same test, none of the three new types' `title`/`message` contain "automatic", "automated", "scheduled", "daily email", or "morning digest" (FR-008's copy guardrail) — can only be written once all three generators exist (T014, T021, T031)
- [x] T033 [P] Walk through all six scenarios in `specs/005-support-ops-automation/quickstart.md` manually
- [x] T034 Run `cd backend && php artisan test` — confirm all existing tests plus the new `SupportOpsWeeklyReportBuilderTest` and `NotificationSupportOpsAutomationTest` pass
- [x] T035 [P] Confirm `cd frontend && npm run build` and `npm run lint` remain clean (no frontend files change — `NotificationBell.jsx` renders the new `severity`/`metadata` content through its existing rendering logic, per research.md's decision to avoid new frontend concepts)
- [x] T036 Regression check: confirm the existing Support Ops board, Today dashboard, Kanban Board, and Reports views are unchanged, and that every pre-existing notification type still behaves exactly as it did before this feature for every role

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately. BLOCKS all user stories, since none of their leakage tests are meaningful until the underlying retrieval/ownership correction is proven.
- **User Stories (Phase 2-4)**: All depend on Foundational (Phase 1) completion. They do not depend on each other — US2 and US3 each only add their own generator method plus tests against the already-corrected retrieval query.
- **Polish (Phase 5)**: Depends on all three user stories being complete — T032 specifically requires all three generators (T014, T021, T031) to exist, since it asserts mutual distinctness across all of them.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational — no dependency on US2/US3. Its Feature test file (`NotificationSupportOpsAutomationTest.php`) is created here (T001-T003, T008) and extended (not recreated) by US2/US3's test tasks.
- **User Story 2 (P2)**: Can start after Foundational — independently testable via its own tasks, though the shared test file already exists from Foundational/US1.
- **User Story 3 (P3)**: Can start after Foundational — same pattern; its one new service (`SupportOpsWeeklyReportBuilder`) has no dependency on US1/US2's generator methods.

### Within Each Phase

- Tests before implementation (T001-T003 before T004-T007; T009-T012 before T013-T015; T016-T020 before T021; T022-T029 before T030-T031)
- T004 (Resource) before T005/T006 (which wrap responses in it)
- T013 (eligibility resolution) before T014 (which uses it)
- T030 (builder) before T031 (which calls it)
- T014, T021, T031 (all three generators) before T032 (which needs all three to exist)

### Parallel Opportunities

- T001, T002, T003 (Foundational tests) can run in parallel — different assertions, same file, coordinate to avoid merge conflicts
- T004 can run in parallel with T001-T003 — different file
- T009-T012 (US1 tests) can run in parallel with each other, and either can start as soon as Foundational is done
- T016-T020 (US2 tests) and T022-T029 (US3 tests) can each start as soon as Foundational is done — they don't depend on US1's tasks, only on the corrected retrieval query
- T033, T035 (Polish) can run in parallel; T032 must wait for T014/T021/T031

---

## Parallel Example: Foundational Phase

```bash
# Launch all three retrieval/ownership matrix tests together (same file, different methods):
Task: "Feature test: three-case matrix for GET /api/notifications"
Task: "Feature test: three-case matrix for PUT /api/notifications/{id}/read"
Task: "Feature test: three-case matrix for POST /api/notifications/read-all"

# In parallel, start the Resource that T005/T006 will need:
Task: "Create NotificationResource in backend/app/Http/Resources/NotificationResource.php"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (the retrieval/ownership correction — this is the one piece every story needs correct)
2. Complete Phase 2: User Story 1 — overdue entries, eligibility, dedup, urgency derivation
3. **STOP and VALIDATE**: Run quickstart.md Scenarios 1-3 against US1 alone
4. Deploy/demo if ready — daily and weekly summaries can genuinely ship later without touching US1's code

### Incremental Delivery

1. Foundational → the retrieval/ownership correction exists, fully correct, before any new entry type is generated
2. Add User Story 1 → validate independently → MVP
3. Add User Story 2 → validate independently (Scenario 4)
4. Add User Story 3 → validate independently (Scenario 5)
5. Phase 5 Polish — cross-type distinguishability check, full quickstart.md pass, regression check (Scenario 6)

---

## Notes

- [P] tasks = different files or different assertions in a shared test file, no dependencies
- [Story] label maps task to specific user story for traceability
- The retrieval/ownership correction is intentionally Foundational, not per-story — see the Organization note above for why proving it once, generically, is correct rather than a shortcut
- Verify T001-T003/T009-T012/T016-T020/T022-T029/T032 fail before their corresponding implementation tasks
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
