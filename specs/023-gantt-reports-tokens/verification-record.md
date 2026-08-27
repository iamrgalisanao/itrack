# Verification Record — 023 Legible Gantt Labels and Tokenised Chart Colours

Evidence for quickstart's gates, the Constitution VIII Definition-of-Done, and the acceptance
decisions T025 requires. Recorded against commits `b8a42ce` → the review-fix commit.

## Gate 1 — The contrast gate

`python scripts/verify-contrast.py` → **exit 0**. Ten Gantt rows plus 022's eight status rows and
the two `--primary` xfail rows, unchanged.

| Theme | destructive | success | warning | info | neutral |
|---|---|---|---|---|---|
| light (bar / overlay) | 6.47 / 8.60 | 7.13 / 9.25 | 7.09 / 9.26 | 6.70 / 8.77 | **5.73** / 7.72 |
| dark (bar / overlay) | 6.46 / 7.69 | 10.26 / 11.04 | 10.71 / 11.57 | 7.03 / 8.39 | 7.04 / 8.48 |

**Before**: 3.00 (backlog/for_review/blocked), 2.78 (in_progress), 2.13 (completed), 1.86 (delayed).
Milestone diamond 1.67 on dark warning.

**What this gate proves, and what it does not.** It proves the *map* is complete and every pairing is
legible, and — since the review — that the component is still joined to the map. It does not
interpret the component's logic; that is Gate 4 and the browser pass.

## Gate 2 — Build, lint, backend

| Check | Result |
|---|---|
| `npm run build` | **exit 0** |
| `npm run lint` | **exit 0** (one pre-existing warning in `BugTracker.jsx`, untouched) |
| `php artisan test` | **exit 0** — 448 passed, 1846 assertions |

Judged by exit code, not summary text.

## Gate 3 — Browser, both themes

Verified live on the Gantt, in both themes, via the app's own theme control:

- Bars render `var(--info)` → `rgb(29,78,216)` light / `rgb(96,165,250)` dark, and
  `var(--muted-foreground)` → `rgb(107,99,117)` / `rgb(156,163,175)`. **No gradient remains.**
- The overlay computes to `--foreground` at alpha 0.2.
- The label's ink flips: `rgb(255,255,255)` light, `rgb(22,23,29)` dark.
- **Measured in the live DOM**: label at 6.70 (bare bar) / 8.77 (overlay) light, 7.03 / 8.39 dark —
  matching data-model exactly, against 2.78 before.
- Full-page sweep: **zero visible contrast failures** in either theme.
- The previously-red "Pending" / "Not Started" pills now render neutral.

**Not verified by eye, and stated rather than implied**: the seeded project contains only
`in_progress` and `pending`/`not_started` tasks, so a `for_review` bar with progress, a
critical-path outline, the 0%/100% overlay edges, and a `width <= 16` milestone were **not** seen
rendered. They are covered by calculation and by the gate, and the code paths are unconditional, but
that is not the same as having looked at them. Worth doing on a project with richer data.

### A correction to an earlier claim in this record

An earlier version said 52 apparent failures "were all inside the opacity-0 hover tooltip, confirmed
by an ancestor-opacity walk." The walk was correct about *why a checker flagged them* and wrong
about what it meant. Code review established the real cause: `--popover` and `--popover-foreground`
**are not defined anywhere** in `index.css`, and there is no `--color-popover` in `@theme inline`, so
`bg-popover` and `text-popover-foreground` emit no CSS at all. The tooltip is transparent, and its
text measures badly because it sits over the timeline grid and the bars behind it. On hover those
are real failures, not artifacts.

Pre-existing and app-wide (`components/ui/tooltip.jsx` carries the same classes), untouched by this
feature, and recorded as a follow-up rather than fixed here — choosing popover token values is a
design-system decision, not a Gantt one. Recorded because the earlier wording would have stopped the
next reviewer from finding it.

## Gate 4 — No colour literal survives

| Check | Result |
|---|---|
| `#hex` / `rgba(` in `WorkProgram.jsx`, `Reports.jsx` | none |
| Retired accent under `src/pages src/lib src/components` | none |
| Hex in `ganttPalette.js` | none |

The sweep caught one of my own: a provenance comment in `Reports.jsx` re-introduced the retired
accent hex into a scoped path. The provenance already lives in `index.css:15` and `DESIGN.md:85`.

## Gate 5 — The gate cannot pass vacuously

Eight tampers, each must turn the gate red **and name its cause**:

| Tamper | Pairs with | Result |
|---|---|---|
| `GANTT_STATUS_TOKENS` export renamed | T003 | exit 1, "parse guard" |
| a status key deleted | T006 | exit 1, "has no Gantt colour" |
| a documented figure corrupted | T007 | exit 1, "comment says 6.99" |
| the whole ratio block deleted | T007 | exit 1, "expected 10 documented Gantt rows" |
| `for_review` remapped back to red | T003 | exit 1, "documented but never measured" |
| overlay reverted to `bg-white/20` | T009 | exit 1, "component drift" |
| inline `color:` deleted | T004 | exit 1, "component drift" |
| bar re-hardcoded as a gradient | T004 | exit 1, "component drift" |

Clean tree: exit 0.

**Four of these exist because tampering found the gate wrong**, not because it was planned that way:

1. Renaming the export did **not** trip the parse guard — the regex matched `fill:`/`ink:` pairs
   anywhere in the file rather than inside the named export. The app would break on import with the
   gate green.
2. Deleting a status reported "parse guard: found 7 entries" instead of naming it, because the `>= 8`
   count short-circuited enum coverage. The guard is now structural only.
3. Remapping `for_review` back to red — **the exact semantic bug this feature fixed** — passed a
   green gate, because assertion 6 walked measured → documented and never the reverse.
4. The module and the component were joined by nothing: reverting the overlay to white dropped three
   light families below AA, and deleting the inline `color` dropped every pairing to 1.40–3.52, both
   with a green gate. Assertion 7 now presence-checks three literals derived from the module.

## Definition-of-Done Gate (Constitution VIII)

| Item | Status |
|---|---|
| 1. Tests green | **PASS** — Gate 2 |
| 2. Authorization review | **N/A** — no endpoint, no role check, no data access; the backend file is read as text by a build-time script and is not modified |
| 3. Tenant-isolation review | **N/A** — no query, no scoping surface |
| 4. OWASP review | **N/A** — no endpoint, auth, upload or data-exposure surface; no PHP in the diff |
| 5. `code-slop` review | **PASS** — see acceptances below |

N/A items are recorded as N/A with justification, not skipped.

## T025 — Findings, resolutions and acceptances

Code review returned 3 Major, 6 Minor, 3 Suggestions. All Majors resolved; Minors resolved except
where noted.

**Resolved**: assertion 6's asymmetry (Major 1); the module/component join (Major 2); the false
`/30` border mechanism — `border-transparent` is *equally* inert, so the tints never were what saved
the ring, and the comment said they were (Minor 1); the monotonicity claim, now swept across the
alpha interval rather than argued from endpoints, since three of ten pairs lack the per-channel
dominance that would guarantee it (Minor 2); `GANTT_LABEL_SUPPRESSED` now consumed by the component
instead of being a dead second source of truth (Minor 3); the label fallback, which reproduced the
exact "blocked shows as Pending" signature FR-008 names (Minor 4); the `>= 8` parse-guard wording in
contracts and tasks (Minor 5); the enum regex, now unioning all three declarations across both
controllers (Suggestion 1).

**Accepted, with reasons**:

- **`--popover` undefined** (Major 3) — pre-existing, app-wide, and a design-system decision rather
  than a Gantt one. Recorded above and as a follow-up.
- **`?? GANTT_STATUS_TOKENS.not_started` in `getGanttBarStyles`** — not an FR-008 violation. FR-008
  constrains statuses the system accepts; all eight have explicit entries. The fallback is reachable
  only for a value outside the enum, including `null`, where the alternative is a destructuring
  `TypeError` that blanks the entire timeline. The `status` column is `string` with no DB-level
  enum, so out-of-enum values are structurally possible.
- **The `/30` border tints stay** even though inert — they express intent for when the global
  `* { border-color }` rule is scoped, and the comment now states the mechanism correctly.
- **Reports print from dark mode** (Suggestion 2) — the ring degrades on paper because `@media print`
  forces a white background without resetting the token set. Pre-existing root cause; text is inside
  the mask hole so no text-contrast criterion is affected.

## Follow-ups recorded

1. Define `--popover` / `--popover-foreground` and map them in `@theme inline`. Until then every
   popover and tooltip in the app is transparent.
2. Scope the unlayered `* { border-color }` rule so colour border utilities stop being inert.
3. Reset the token set inside `@media print` so dark-mode printing does not carry dark values onto
   white paper.
4. Align `taskStatus.js` / `groupSummary.js` / the List view with the Gantt's corrected vocabulary.
5. `Reports.jsx:728-745` `matchStatusColor` — retokenise once its `todo`/`done` vocabulary is
   reconciled with the real status list.
