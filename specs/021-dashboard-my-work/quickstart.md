# Quickstart Validation — 021 Dashboard Restructure with My Work List

Validation/run guide proving the feature end-to-end. Contracts:
[contracts/my-work-api.md](./contracts/my-work-api.md); shapes: [data-model.md](./data-model.md).

## Prerequisites

```bash
cd backend && composer install && php artisan migrate   # no 021 migrations — should report nothing new
cd frontend && npm install
# Run app: backend `composer run dev` (API on :8011 + Vite) — ports must be in SANCTUM_STATEFUL_DOMAINS
```

## Automated gates

```bash
cd backend && php artisan test --filter=MyWorkTest      # feature matrix
cd backend && php artisan test                          # full suite (incl. the two reconciled ProjectScopingTest stats assertions)
cd frontend && npm run build && npm run lint            # build is the real frontend correctness gate
```

Expected: all green. `MyWorkTest` covers the role×access matrix, tenant isolation
(assignee-alone-is-not-authorization), bucket boundaries under frozen time, anchor-param
validation, caps + true counts, fixed-shape envelope, payload field-ban list,
`meta.can_write` per role and under preview, preview read/write behavior, forced
self-assignment, mass-assignment smuggling, and the `recent_activities` `client_visible`
fix + `completed_recent` window (research.md §Test-requirements is the authoritative list).

## Manual browser verification (constitution: frontend verified in browser)

Seed or use dev data with tasks assigned to the signed-in user due: yesterday, today,
this week, +3 weeks, and none.

1. **Buckets & boundaries**: Dashboard shows My Work with Overdue/This Week/Later/No Due
   Date, correct counts; a task due **today** sits in This Week. Empty buckets are not
   rendered; all four render when populated (FR-002/FR-011 — payload always has four).
2. **SC-001 status change**: change a task's status from its row select — 2 interactions,
   no page reload; completing removes the row and decrements the count.
3. **FR-005 detail sync** (run as **PM or Admin** — Team Member date edits are stripped
   server-side by existing 002/018 policy, `plan_end_date` is not in
   `$allowedForTeamMember`): open a row → TaskDetailModal shows full task; change its
   due date and save → row moves buckets after the panel refetch; close → focus returns
   to the originating row button.
4. **Quick-add**: from This Week — title + placement (defaults to last-used) → task
   appears immediately, due end of week; entered title survives a validation failure with
   an inline actionable error. Panel-header "+ Add task" works when target buckets are
   empty. Overdue offers no quick-add.
5. **SC-003**: at 1366×768 (not just 1920), Overdue with its count is in the first
   screenful.
6. **SC-002 duplicate-count audit** (rule: component-level page totals only): check the
   summary row (4 metrics max; progress card description carries **no** completed count),
   heatmap body/legend (no `<tfoot>` totals row), Recent Activities tabs (label-only),
   My Work headers. Zero status counts appear in two components.
7. **FR-010/FR-014**: no structure-count cards (single compact strip only); no blur
   ornaments, no glass hero, no Needs Attention banner.
8. **Roles (SC-005)**: as a Client — dashboard renders, My Work shows the empty-positive
   state, no status selects, no quick-add anywhere; as Department Head — rows visible
   (if assigned), read-only badges. Verify a Team Member with no project assignments sees
   no quick-add (empty accessible set).
9. **Preview-as-user (FR-012)**: Admin previews a Team Member — My Work shows the
   target's tasks; attempting a status change surfaces a clear error (server write-block),
   never a silent failure; affordances follow the previewed role (`meta.can_write`).
10. **States**: throttle network — panel skeleton renders without blanking heatmap/Recent
    Activities; kill the API — panel-scoped error + retry; empty account — positive
    empty state (success-toned, links to Work Program).
11. **Responsive + themes**: 360px (no horizontal page scroll; rows degrade to two-line),
    tablet, desktop — each in light **and** dark mode; segment bars auto-hide below `sm`
    (inherited, don't fight it); reduced-motion honored on row removal.
12. **Keyboard**: tab to a bucket trigger (visible ring, `aria-expanded` announced),
    Enter collapses; tab to a row title button, Enter opens modal; operate the status
    select by keyboard without opening the modal; quick-add: Enter submits, Escape
    cancels and restores focus to the trigger.

## Definition-of-Done gates (Constitution VIII — all five, plus Frontend Governance)

1. **Tests green** — commands above.
2. **Authorization review** — new code has zero inline role-string comparisons (grep
   `->role ===` over the diff); all gates via `HasRole` predicates; `MyWorkController`
   routes confirmed **inside** the 4-middleware group; denial parity (TM/Client 403,
   byte-identical bodies) preserved.
3. **Tenant-isolation review** — My Work query confirmed to filter assignee **∩**
   `Project::accessibleTo`; quick-add validates module's project accessibility; parent
   context names only from the accessible chain.
4. **OWASP pass** (`laravel-owasp-security` scoped per research.md §OWASP): A01 items
   above; anchors validated + parameter-bound (no interpolated `whereRaw`); explicit
   create-array; lean resource field-ban respected; `grep dangerouslySetInnerHTML` over
   the frontend diff → nothing; N/A items recorded (uploads/payments/SSRF/migrations).
5. **code-slop pass** over the diff: spec-citing constraint comments only (reference
   `021-dashboard-my-work`), no narration comments; no `MyWorkService`/`BucketHelper`/
   one-implementation interfaces; no defensive try/catch around non-throwing Eloquent;
   no `console.log`; no drive-by edits outside the feature's file list (plan.md
   §Project Structure); tests assert behavior, never mock own collaborators.

## Frontend review pass (constitution Completion Gate — blocks until resolved/accepted)

Compare implementation against spec → constitution → this plan → sibling pages
(Taskboard, Bug Tracker, Work Program List). Classify findings; these are the
pre-registered blocking criteria:

**Critical**: mutation affordances visible to non-writable roles; any task rendered from
outside `accessibleTo` scope (any role, incl. during preview); preview reads not
reflecting the previewed user or writes failing silently; row detail/status change
unreachable by keyboard; focus not returned from modal; missing `aria-expanded` on
triggers; quick-add failure losing the typed title; status-change failure silent; any
gating via raw `useAuth()` user or the legacy localStorage switcher.

**Major**: any status count in two components (SC-002 audit) or >4 summary metrics;
surviving blur ornaments / glass hero / structure-count cards; My Work built outside the
`GroupSummaryBar` pattern or accents via inert `border-l-*`; missing empty-positive
state; empty buckets rendered; missing row cap/"Show all N"; Overdue offering quick-add;
horizontal scroll at 360px; Overdue below first screenful at 1366×768; hardcoded colors
without `dark:` pairs / AA failures in either theme; behavior changes to heatmap
drill-down, Recent Activities filters, or unrelated pages.

**Minor/Suggestion (record, non-blocking)**: row-removal animation polish; skeleton
fidelity; strip link affordances; select styling parity with BugTracker; localStorage
MRU resilience.

Findings each name file / observed / expected / correction. Critical and Major block
completion unless explicitly documented and accepted in this folder.
