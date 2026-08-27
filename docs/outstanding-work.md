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
| **C3** | `--popover`/`--popover-foreground` undefined → `bg-popover` emits nothing → **every tooltip in the app** renders at 1.00–3.52:1 | **OPEN** (verified: no `popover` in `index.css`) | App-wide, currently shipping. Larger live failure than the one 023 fixed. WCAG 1.4.3, 1.4.13 |
| **C1** | `GroupSummaryBar.jsx:75-82` segment bar is colour-only; blue/purple at 1.04:1 under deuteranopia; blocked/delayed are two shades of one hue in **normal** vision | OPEN | WCAG 1.4.1, 1.1.1 |
| **C2** | `WorkProgram.jsx` Gantt bar is a mouse-only control — no `tabIndex`, `role`, `onKeyDown`, `aria-label`, focus style | OPEN | The same file has the correct pattern at `:1738-1743`. Mitigated by the Edit button, but undocumented and hand-duplicated. WCAG 4.1.2, 2.4.7 |
| **M2** | `Reports.jsx:732-749` — `not_started`, `completed`, `delayed` all fall through to `bg-primary/70`. **Completed and delayed are the same violet** | **OPEN** (verified: no `case 'delayed'`) | Same defect class 023 fixed one file over. Escaped both gates. Least contested item in the queue |
| **M1** | Red/amber/green collapse under protanopia/deuteranopia; status fills at 1.00–1.66:1 **against each other** | OPEN | 1.4.1 satisfied (text always accompanies colour), so usability + latent conformance. Recorded as the Hue-Loss Rule in `DESIGN.md` |
| **M3** | Non-text contrast (1.4.11) untested; `--input` at **1.27:1** vs `--background` | **OPEN** (verified) | `--input` is the boundary of every form control in the app. Also overlay edge 1.08–1.35:1, baseline bar 1.65:1, segment adjacency 1.05–1.28:1 |
| N1–N6 | Critical-path has no programmatic equivalent; `title`-only info; same status three different hues across views; untokenised 021-era literals in `Reports.jsx:489,675`; group accents collide under CVD at ≥6 groups; weekend shading at 1.01:1 | OPEN | Minor |
| S1–S3 | No `forced-colors` support; no automated a11y check in CI; add CVD simulation to the gate | OPEN | Suggestions |

**Proposed gate extensions** (assertions 8/9/10): hue separation under all three dichromacies; a 3:1
tier; an undefined-token guard that would have caught `bg-popover` on day one. Reference
implementations were written and validated during the review.

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
| **The `011`/`012` stack — 2 and 3 commits ahead, and `012` is built on `011`** | — | **OPEN. Do not delete.** They are one decision, not two branches: `012` contains both of `011`'s commits, so they cannot be reviewed independently and deleting `011` alone loses nothing. Both sit **68 commits behind `main`**, so any revival opens with a rebase that will not be clean. Three outcomes: rebase and finish, cherry-pick what survives, or `git tag archive/011-012` and delete. Absent a named champion, tag-and-delete — a branch untouched for 68 commits is an unmade decision wearing a branch name |
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

- **C2 and C3 are one fix on the Gantt, not two rows.** C3 requires replacing the hand-rolled
  `opacity-0 group-hover` div with Radix `Tooltip` (1.4.13 needs focus-triggered and dismissible),
  and a Radix trigger requires the bar to be focusable — which *is* C2. Scheduling them apart means
  doing the Gantt bar twice.
- **M2, C1, N3 and "status vocabulary alignment" are one problem in four sections**, filed rows
  apart with no cross-reference. 023 excluded `matchStatusColor` *because* of this coupling.

### Smaller misses

- **Issue #8 does not cover M1**, though this file's header implies it does. The structural
  hue-loss finding — the one that forced the Hue-Loss Rule — is tracked in no issue.
- **The branch inventory was wrong.** `origin/011-project-client-access-control` is **2 commits
  ahead** of `main` and `origin/012-help-center` is **3 ahead** — they carry unmerged work, not
  stale refs. `013` and `022` are merged and deletable. Do **not** delete `011` or `012`.
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
- **Build-time contrast enforcement** (022 #1). **DELIVERED** in 022 — `scripts/verify-contrast.py`
  runs as the `design-tokens` CI job.
- **Retokenise the Gantt bar palette and the Reports progress ring** (022 #4). **DELIVERED** in 023 —
  except `matchStatusColor`, which is M2 above and remains open.
