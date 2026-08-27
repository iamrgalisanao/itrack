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
| Three stale remote branches (`011-`, `012-`, `013-`) | — | Unreviewed; predate this work |

---

## Closed — verified, not assumed

- **`recent_activities` leaked internal tasks to Clients** (021). **FIXED** — `ProjectController.php:307`
  filters `client_visible`. It appeared on a "pre-existing defects found during the audit" list, not
  a deferred list; reading the two lists together would have double-counted it as outstanding.
- **Build-time contrast enforcement** (022 #1). **DELIVERED** in 022 — `scripts/verify-contrast.py`
  runs as the `design-tokens` CI job.
- **Retokenise the Gantt bar palette and the Reports progress ring** (022 #4). **DELIVERED** in 023 —
  except `matchStatusColor`, which is M2 above and remains open.
