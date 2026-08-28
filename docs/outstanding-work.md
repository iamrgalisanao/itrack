# Outstanding Work — consolidated backlog

Every deferred item, accepted exception and unresolved finding recorded across features 021–023, in
one place with its source and its **verified current status**. Compiled 2026-08-27 against `main` at
the 023 + constitution-1.5.0 merges.

Why this exists: follow-ups were being recorded in six different places — three `research.md`
"Deferred follow-ups" lists, a `verification-record.md`, an `accessibility-review.md`, and three 021
review reports. Nothing read all six together, so scoping the next feature meant reconstructing the
backlog from memory each time. That is how items get missed.

**Every status below was re-verified against the code, not transcribed.** One item on the old lists
turned out to be already fixed (see Closed).

---

## Accessibility — tracked as issue #8

Source: `specs/023-gantt-reports-tokens/accessibility-review.md` (Section 508 specialist, BVM
dichromacy simulation + CIEDE2000).

| ID | Item | Status | Notes |
|---|---|---|---|
| **C3a** | `--popover`/`--popover-foreground` undefined → `bg-popover` emits nothing → tooltips render transparent (1.4.3) | **CLOSED** — tokens defined, mapped, gated | Blast radius was overstated: all three `TooltipTrigger` sites are `asChild` onto a real `<Link>`/`<button>`, so Radix already supplied focus-open, Escape-dismiss and hoverable content. **1.4.13 never failed for the shared component** |
| **C3b** | `WorkProgram.jsx:2718` hand-rolled hover card is mouse-only (2.1.1) and its content is read inline by screen readers on every Gantt row — `opacity-0` does not remove an element from the accessibility tree | **OPEN** → 024 | Split out of C3 because marking the parent CLOSED would have put an untested "Supports" into a VPAT. See the sr-only note below |
| **C-SIDEBAR** | **The collapsed sidebar has no accessible names at all.** `App.jsx:212/358` gate the label out when collapsed, and lucide-react auto-applies `aria-hidden="true"` to its icons, so the `<Link>` and both footer `<button>`s have an **empty** accessible name. Radix's `aria-describedby` is a *description* and only exists while the tooltip is open — in browse mode it never opens | **CLOSED** — PR #18, landed before this one | **WCAG 2.4.4 (A) and 4.1.2 (A).** Screen readers announced the whole collapsed rail as "link… link… button". Fixed with a conditionally-hidden `sr-only` span rather than `aria-label`: one construct, the name comes from content so it cannot drift from the tooltip text, and no name-plus-identical-description when the tooltip opens. Found while confirming C3a's narrowing — the shared tooltip path is *1.4.13-clean and was 4.1.2-broken*, and closing C3 without this row would have read as a clean bill of health |
| **C1** | `GroupSummaryBar.jsx:75-82` segment bar is colour-only; blue/purple at 1.04:1 under deuteranopia; blocked/delayed are two shades of one hue in **normal** vision | OPEN | WCAG 1.4.1, 1.1.1 |
| **C2** | `WorkProgram.jsx` Gantt bar is a mouse-only control — no `tabIndex`, `role`, `onKeyDown`, `aria-label`, focus style | OPEN | The same file has the correct pattern at `:1738-1743`. Mitigated by the Edit button, but undocumented and hand-duplicated. WCAG 4.1.2, 2.4.7 |
| **M2** | `Reports.jsx:732-749` — `not_started`, `completed`, `delayed` all fall through to `bg-primary/70`. **Completed and delayed are the same violet** | **OPEN** (verified: no `case 'delayed'`) | Same defect class 023 fixed one file over. Escaped both gates. Least contested item in the queue |
| **M1** | Red/amber/green collapse under protanopia/deuteranopia; status fills at 1.00–1.66:1 **against each other** | OPEN | 1.4.1 satisfied (text always accompanies colour), so usability + latent conformance. Recorded as the Hue-Loss Rule in `DESIGN.md` |
| **M3** | Non-text contrast (1.4.11) untested; `--input` at **1.27:1** vs `--background` | **OPEN** (verified) | `--input` is the boundary of every form control in the app. Also overlay edge 1.08–1.35:1, baseline bar 1.65:1, segment adjacency 1.05–1.28:1 |
| N1–N6 | Critical-path has no programmatic equivalent; `title`-only info; same status three different hues across views; untokenised 021-era literals in `Reports.jsx:489,675`; group accents collide under CVD at ≥6 groups; weekend shading at 1.01:1 | OPEN | Minor |
| S1–S3 | No `forced-colors` support; no automated a11y check in CI; add CVD simulation to the gate | OPEN | Suggestions |

**Gate extensions**: assertion 8 (declaration/`@theme inline` bijection), assertion 10-lite (the
`-foreground` suffix sweep) and a 3:1 tier are **DELIVERED**. Proven against the bug as it actually
shipped: restore `index.css` to its pre-fix state and the gate exits 1 with *"`--popover-foreground`
is used as a utility but never declared"*. Four further tampers each fail by name.

10-lite is deliberately narrower than the proposed assertion 10. Measured, the general
`bg-*`/`text-*`/`border-*` sweep gives 43 hits — 2 true positives, 41 false — because Tailwind ships
builtin colours that need no token. Restricted to the `-foreground` suffix it has **zero** false
positives provably: Tailwind ships no builtin colour with that suffix, so the suffix *is* the
design-token marker.

**Still open**: assertion 9 (hue separation under the three dichromacies).

---

## Design system

| Item | Source | Status |
|---|---|---|
| **`--primary` fails the widened AA Floor Rule in light mode** — 4.19:1 as text on `--muted`, 3.40:1 on its own tint, 17 call sites. No palette step fixes it; the fix is behavioural | 022 #6 | **OPEN** — carried as the gate's only `xfail` row. Fixing it lets the XFAIL machinery be deleted rather than maintained |
| **The unlayered `* { border-color }` rule** makes every colour border utility inert app-wide | 023 VR #2 | **OPEN** (verified) — the trap `DESIGN.md` documents; `border-{state}/30` renders grey |
| `@media print` does not reset the token set, so dark-mode printing carries dark values onto white paper | 023 VR #3 | **OPEN** (verified) |
| `--destructive` on its own 15% tint clears AA by **0.039** (4.539) — the tightest margin in the system | 022 #5 | OPEN, informational. Any change to `--muted` or tint opacity breaks it; the gate catches it |
| `--accent` / `--muted-foreground` pairings never audited | 022 #2 | OPEN |
| `prefers-contrast: high` and `forced-colors` — the app defines neither | 022 #3, 023 #3, S1 | **OPEN** (verified) |
| Align `taskStatus.js`, `groupSummary.js`, the List view and the equivalent pills with the Gantt's corrected vocabulary | 023 #1, #4, VR #4, N3 | OPEN — they pass AA (4.51–8.44:1), so consistency debt, not accessibility |

---

## Feature 021 leftovers

| Item | Status |
|---|---|
| Composite index / denormalised `project_id` on `detailed_activities` if My Work query cost grows | OPEN — additive migration, own change |
| Remove unrendered `stats` keys (`team_members`, `glossary_terms` are global, not scoped) | OPEN |
| Route-level code splitting (first lazy boundary; the bundle is ~888 kB) | OPEN |
| `?placement=deep` quick-add extension | OPEN |
| `TaskDetailModal` date fields for Team Members — server silently strips them, so the UI is a no-op | OPEN — policy-surface change |
| Optional server plausibility window on client date anchors | OPEN |
| Team Members cannot edit `plan_end_date`/`plan_start_date`; concurrent status edits are last-write-wins | OPEN — recorded during the 021 audit, never scoped |

---

## Repository

| Item | Source | Status |
|---|---|---|
| `enforce_admins: false` + 0 required approvals means branch protection **does not constrain the person who enabled it** | `docs/repo-settings.md` | OPEN — correct for a solo maintainer, wrong the moment a second committer arrives |
| Branch `023-gantt-reports-tokens` kept alive deliberately | Git Workflow Master Q2 | Delete once `specs/024-*/spec.md` lands on `main` |
| **The `011`/`012` stack** | issue #13 | **CLOSED** — archived as tag `archive/011-012` and both branches deleted. See Closed below |
| `013-sprint-retrospectives`, `022-dark-status-contrast` | — | Merged, 0 ahead of `main`, deleted. Note the trap on `013`: its **local** ref reported "ahead 1", which is ahead of its *remote tracking ref*, not of `main` — the commit is on `main`. Reading that as unmerged work would have preserved a branch for nothing |

---

## Found by auditing this backlog itself

An architecture audit of this file found twelve items it had missed. That is worth recording as
plainly as the items: a consolidated backlog compiled from six sources still lost things, and one of
its **Closed** entries actively concealed a live security defect.

### Accepted exceptions, recorded once and never re-examined

These were accepted inside `plan.md` Complexity Tracking blocks or a `tasks.md` line, which no list
reads. Acceptance is not resolution, and an acceptance nobody revisits becomes a silent permanent
decision.

| Item | Where accepted | Why it needs revisiting |
|---|---|---|
| Critical-path outline is **clipped at the timeline origin** — the pane is `overflow-x-auto`, `left: 0` bars draw their outline at x = −4 | `023/plan.md:123-127` | N1 says critical-path membership has no programmatic equivalent, so the outline is its **sole** encoding — and it is partially absent on the leftmost bar |
| The outline **overlaps the baseline bar** when baselines are shown | `023/plan.md:127-129` | Accepted on aesthetics; unreviewed since |
| **`hover:shadow` violates DESIGN.md's Flat-By-Default Rule** and was pre-registered as unraisable | `023/tasks.md:88` | A named design rule has a standing exception recorded only in a task line |
| **`impeccable polish`/`harden` not run** in 022 or 023 | `022/plan.md:197`, `023/plan.md:224` | The justification ("no interaction or component structure") was true for those diffs. **It does not carry forward** — 024 adds a focusable control and a tooltip interaction. Must be re-decided, not inherited |

### 021's resolution gate is checked while its reviews still say open

`021/tasks.md:137` marks T041 `[x]` — "resolve every Critical and Major finding or document its
acceptance". But `code-slop-review.md:361` still reads *"all three are open"* and
`frontend-design-review.md:15` still reads **"BLOCKED — 7 Major"**. Spot-checking shows the fixes
landed and the documents were never updated. Two of the seven are live and in 024/025 territory:

- **MAJ-5** — a failed status change is shown visually but never announced to assistive technology
- **MAJ-7** — cancelling quick-add drops focus to `<body>`

### A shipping screen that misdescribes the security model

`frontend/src/pages/Admin.jsx:1451-1461` tells the operator the project *"operates in Mock Auth
Mode"* and describes `DepartmentGrant` — the **production** authorization path — as prototype
scaffolding pending "Active Directory/Okta". The substance is accurate, which is what makes it
harmful: it frames a live authorization mechanism in the vocabulary of the mock role-switcher
Constitution Principle VI retires. Related: `007/spec.md:119` names the role→per-user grant
conversion as needing its own spec.

### Couplings this file's table layout hid

- **C2 and C3 are one fix on the Gantt — for the Gantt only.** ~~C3 requires replacing the
  hand-rolled div with Radix `Tooltip`~~ — **this generalised wrongly.** Verified: every *shared*
  `TooltipTrigger asChild` wraps a real `<Link>` or `<button>`, so Radix already supplied
  focus-trigger and Escape-dismiss and 1.4.13 never failed there. The coupling holds for exactly one
  element, `WorkProgram.jsx:2697`. That is what made the token-only fix legitimate rather than a
  mask — it closed 1.4.3 app-wide and left one div's 2.1.1/1.4.13 for 024.
- **New, found while fixing C3, in neither review**: `opacity-0` does **not** remove an element from
  the accessibility tree, and the Gantt hover card carries no `aria-hidden` — so a screen reader
  reads that entire card inline for every Gantt row, including "Click timeline bar to edit",
  mouse-only advice read aloud to people who cannot act on it. Blanket `aria-hidden` would be worse:
  the card is the **only** DOM source of Actual start/end, Duration, and Progress for suppressed
  labels, so hiding it deletes information for screen-reader users alone.
  **But "defer to 024" was a false dichotomy** — the 508 review named a third option available now,
  ~5 lines: `aria-hidden` on the card **plus** an `sr-only` span in the left-pane row carrying those
  three values. No new focusable element, no keyboard-interaction design, no 024 dependency. Do that
  rather than parking a two-hour change behind a feature.
- **The floating surface is not actually shared.** `dropdown-menu.jsx:17` and `select.jsx:54` use
  `bg-background`, not `bg-popover` — so light `#ffffff` matching is a value coincidence that does
  not survive theming. Light: menu surface **1.00:1** against `--card`, edge **1.27:1**. Dark:
  **1.06:1** / **1.36:1** — an earlier draft of this row said 1.11/1.53, which reproduces from no
  token pair in the file; the real figures are *worse*. Dark also makes the tooltip a *third*
  floating surface. Pointing both at
  `--popover` + the same outline gives three components one contract. **OPEN — Major**, pre-existing.
- **M2, C1, N3 and "status vocabulary alignment" are one problem in four sections**, filed rows
  apart with no cross-reference. 023 excluded `matchStatusColor` *because* of this coupling.

### Smaller misses

- **Issue #8 does not cover M1**, though this file's header implies it does. The structural
  hue-loss finding — the one that forced the Hue-Loss Rule — is tracked in no issue.
- **The branch inventory was wrong.** `origin/011-project-client-access-control` was **2 commits
  ahead** of `main` and `origin/012-help-center` **3 ahead** — they carried unmerged work, not
  stale refs. `013` and `022` were merged and deletable. *(Resolved 2026-08-27: `011`/`012` are now
  archived as tag `archive/011-012` and deleted — see Closed. The finding stands as written; the
  work was real, it just found no champion.)*
- **Constitution follow-ups are absent**: the 1.3.0 Sync Impact Report carries a still-pending
  `TODO(TYPESCRIPT_ADOPTION)` and an amendment obligation if `impeccable` is renamed.
- **A deferred *verification* action, not a code item**, so no list caught it: `023`'s browser pass
  never saw a `for_review` bar with progress, the critical-path outline, the 0%/100% overlay edges,
  or a `width <= 16` milestone — the seed data has only `in_progress` and `pending`/`not_started`.
- **`DESIGN.md:278-282` understates C1's blast radius**: it names four `GroupSummaryBar` consumers.
  There are five, plus the `lib/groupSummary.js` helper. The one `DESIGN.md` omits is
  **`MyWorkPanel.jsx`** — named here so 024 does not have to re-derive it.

### Verified clean

Zero `TODO`/`FIXME`/`XXX`/`HACK` in `backend/`, `frontend/src/`, `scripts/`. The mock-auth migration
comments are inert prose — all four columns carry real user ids.

---

## Authorization — the field axis has no owner

Recorded from the architect's sign-off on PR #15. It is the one structural finding from that review
that no code change closed, and it is the same defect shape one level up from the one #15 fixed.

`DetailedActivity::scopeVisibleTo()` gave the **row** axis an owner: a named scope whose absence a
reviewer can grep for. That worked — PRs #14 and #15 converted six of seven read-scoping sites, and
the seventh is annotated as the documented exception.

**The field axis still has none.** "Remember to wrap the tree in `DetailedActivityResource`" is
hand-rolled identically in three places — `ModuleController:71`, `SubActivityController:46`,
`SubActivityController:110` — and backed only by a hardcoded six-row test provider. A new nested
endpoint repeats C-NEW and nothing fires.

| Item | Status |
|---|---|
| A resource per tree level (`ModuleResource`, `ActivityResource`, `SubActivityResource`) so nesting cannot return raw models | OPEN — the real fix |
| CI gate forbidding `client_visible` outside `scopeVisibleTo`, allowlisting the heatmap `LEFT JOIN` **and** the four instance-level checks (`DetailedActivityController:171`, `AttachmentController:108`, `CommentController:79`, `NotificationController:170`) | OPEN — queued with 025 |
| `Schedule.jsx:372` renders an assignee filter from `t.responsible`, which Clients correctly do not receive, so their dropdown collapses to `['all']` | OPEN — hide the control for Clients; frontend, rides with 024 |

**Two lessons worth more than the items.** First, the boundary test asserted at length what a Client
must *not* see and never once asserted what a Client must still *receive* — so the #15 fix silently
broke milestone detection on `/schedule` for Clients only, and the suite stayed green. Both
directions now have tests. Second, naming the row axis' owner did not give the field axis one, and
the #14 sign-off implied it had.

---

## Open decisions — recorded from the #17–#24 run

| Item | Status | Notes |
|---|---|---|
| **Row-scoping vs field-scoping** | **CLOSED — [ADR 0001](adr/0001-client-scoping-row-and-field.md)** | The ADR was widened at the architect's direction: the row/field rule alone **would not have prevented any of the four field-axis instances**, because all five endpoints found in #26's review never reached a Resource at all. The common cause is that serialisation shape is decided per controller method, so a method returning a model opts out of both axes. Constitution Principle II is not underspecified — it was unenforced. Teeth: `ClientReachableRouteCoverageTest` |
| **Dialog panel has neither a ground nor an edge in dark mode.** `bg-background/82` over a `bg-black/70` scrim composites to `#131419` on `#070709`: **panel 1.09:1, edge 1.53:1** against a 3:1 bar. Light is fine (6.34 / 6.68) | **OPEN — Major**, pre-existing | Same failure #24 fixed for menus, on the other floating surface. Deliberately *not* folded into #24: `backdrop-blur-xl` is a real perceptual cue no contrast ratio captures — a blurred backdrop is distinguishable at equal luminance, which was **not** true of the flat dropdown case — and a modal traps focus, so it is not something a user must find. Fix is `--popover` + `border-popover-border`, or an explicit decision that blur carries the boundary |
| **The design hook flags `index.css` literals on diffs that never touch it** | OPEN — tooling, low | It fired on a `.jsx`-only PR. A scoping bug that should only report files in the diff. Low priority now that the print literals are registered in `DESIGN.md`'s frontmatter, but it consumed a whole PR before that — a tooling defect generating product work is product work |

---

## Found while remediating

| Item | Status | Notes |
|---|---|---|
| **`.env.example` ships `APP_DEBUG=true` and `docs/deployment-vps.md` never says to turn it off.** A copied env file makes every 403 and 500 return a full stack trace — file paths, framework internals, and the call chain | **OPEN** | Verified: a Client's 403 on `/api/reports/export-csv` returns **19,257 bytes**, of which the denial message is one line and the rest is a trace. Harmless in the test environment, which is where it was observed; an OWASP A05 misconfiguration if the example is ever copied to a server. Config, not code — the fix is a line in the deploy guide and a check on the running box |
| **Two boundary-test rows are vacuous on the field axis**: `/api/detailed-activities/{id}/comments` and `/attachments` return `[]` because the sentinel task has none seeded | **OPEN** | They pass today by having nothing to disclose, which is the same shape as #14's `reports` row. Making them real requires seeding a comment and an attachment on a **hidden** task — which is also exactly the surface of audit findings C2 and M1. Recorded in `ClientReachableRouteCoverageTest::REACHABLE_BUT_NOT_YET_PROVEN` so the claim is visible rather than assumed |
| Ten further Client-reachable GET routes probed for the `responsible`/`support` field leak | **CLEAN — verified, not assumed** | Eight returned 200 with the sentinel absent; `taskboard/tasks` and `reports/export-csv` return 403 by role check. So PR #26's scope was complete for this defect class, which is worth recording because "we fixed the ones we found" was wrong twice in that PR |

---

## Closed — verified, not assumed

- **`recent_activities` leaked internal tasks to Clients** (021). **FIXED** — `ProjectController.php`
  filters `client_visible`, as do the headline `stats` counts via the shared query.

  **This entry was dangerously incomplete when first written.** It closed *the endpoint* on the
  strength of one query being fixed. `module_heatmap` on the same endpoint had **no**
  `client_visible` predicate at all, so a Client received per-module counts of internal tasks —
  a live tenant-isolation defect, Constitution Principle I. It was recorded exactly once, as a
  sibling note in `021/owasp-review.md`, and closing the parent here retired the only pointer to it.
  Found by the audit of this file; fixed in PR #11 with three tests proven to fail without the fix.

  The lesson is the entry, not the bug: **close individual findings, never surfaces.**
- **The `011`/`012` branch stack** (issue #13). **ARCHIVED AND DELETED** — preserved as the annotated
  tag **`archive/011-012`**, pushed and verified resolvable from a fresh clone before either branch
  was deleted. `011` was an ancestor of `012`, so the one tag on `012`'s tip holds all three commits.
  Revive with `git checkout -b revive archive/011-012`.

  **The piece most likely worth cherry-picking is the server-side duration derivation** —
  `DurationCalculator.php` plus 207 lines of tests — because it is self-contained backend work that
  does *not* depend on the 363 stale lines of `WorkProgram.jsx` churn in the same commit, which
  predate 021/022/023 rewriting the Gantt palette, the status vocabulary and the tokens on that file.
  Also inside: the `ProjectAccess.jsx` page and the Help Center. The tag is the **only** copy of
  `specs/012-help-center/`; `specs/011-project-client-access-control/` is already on `main`.

  Retired at **83 commits behind `main`**, not the 68 recorded above — the figure was re-measured at
  decision time rather than trusted, and it had drifted twice while the decision sat open. That drift
  is the argument, not a footnote.
- **Build-time contrast enforcement** (022 #1). **DELIVERED** in 022 — `scripts/verify-contrast.py`
  runs as the `design-tokens` CI job.
- **Retokenise the Gantt bar palette and the Reports progress ring** (022 #4). **DELIVERED** in 023 —
  except `matchStatusColor`, which is M2 above and remains open.
