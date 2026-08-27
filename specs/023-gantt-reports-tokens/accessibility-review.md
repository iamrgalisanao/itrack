# Accessibility Review — Status-Colour System

Section 508 Accessibility Specialist, dispatched 2026-08-27 under constitution 1.4.0's **Specialist
Agent Routing**. Scope is the whole status-colour system, not just 023 — this is the first
application of a rule written because features 021–023 did WCAG work across three features without
ever routing this specialist.

**Method**: Brettel–Viénot–Mollon (1997) dichromacy simulation at severity 1.0, CIEDE2000 on the
simulated colours, validated against the Sharma et al. reference pairs. Independently re-derived
here with ΔE76 as a cross-check; the metrics differ in magnitude but every conclusion matched.

**Standards note**: 508's legal baseline is WCAG 2.0 AA. Findings citing 1.4.11 and 1.4.13 are
WCAG 2.1 — best practice, not the 508 floor. Everything marked Critical is WCAG 2.0 A/AA.

## The finding that changes how we do colour

Contrast against a *surface* and distinguishability from *each other* are different requirements,
and **the first actively works against the second**. Tuning every status token to clear a similar
ratio against the same shared surfaces drives them toward equal luminance relative to one another —
which is exactly what makes them collapse when hue is removed.

Measured, the status fills sit at **1.00–1.66:1 against each other** under simulated dichromacy.
Luminance carries no signal, so once hue goes there is nothing left. Worst cases are semantically
the worst possible: light protanopia puts delayed/blocked at ΔE₀₀ 8.10 from completed; dark
deuteranopia at 7.03. Failure and success, indistinguishable.

**The gate's passing condition and this failure mode are causally linked.** Running it harder makes
it worse. Recorded as the **Hue-Loss Rule** in `DESIGN.md`, above the AA Floor Rule it corrects.

## What holds (verified, not assumed)

- **Colour is never the sole carrier on the Gantt.** `WorkProgram.jsx:2477` renders the status name
  as text beside every bar, and `getGanttStatusLabel` is exhaustive with a raw-value default. 1.4.1
  satisfied. This is what keeps the palette conformant while the hue problem is open.
- Gantt bar fill vs row background: 5.73–10.71:1, passes 1.4.11 comfortably.
- Critical-path outline: 20.15:1 light / 16.25:1 dark. The `DESIGN.md` reasoning matches the code.
- Focus ring `--ring`: 4.19–6.77:1 on every surface. So `--primary`'s recorded XFAIL is a *text*
  exception only; every non-text use of it clears 3:1.
- Collapsed-group headers and timeline controls are real `<button>`s with focus rings and
  `aria-label`s. No defect.
- Blue and neutral are safe separators across all three dichromacies (min ΔE₀₀ 16.88). The problem
  is confined to the red/amber/green cluster.

## Critical

**C1 — `GroupSummaryBar.jsx:75-82`: the segment bar is colour-only.** 1.4.1, 1.1.1. Bare `<span>`s
with a background and a `title`; no text, no legend, no role. While a group is collapsed this is the
*only* representation of its distribution. `title` on a roleless span is not an accessible name and
is mouse-only. Compounding it: under deuteranopia `in_progress` (blue-500) and `for_review`
(purple-500) measure **1.04:1 against each other** — the same colour. And `blocked`/`delayed` are
red-500/red-600, ΔE₀₀ 7.64 **in normal vision** — two statuses given two shades of one hue by
design.

**C2 — `WorkProgram.jsx:2654-2675`: the Gantt bar is a mouse-only control.** 4.1.2, 2.4.7, 1.3.1.
`cursor-pointer` + `onClick`, no `tabIndex`, `role`, `onKeyDown`, `aria-label`, or focus style. The
same file implements the correct pattern at `:1738-1743`, so this is a regression against an in-file
convention. Not a 2.1.1 failure: the Edit button at `:2509` reaches the identical handler — but that
mitigation is undocumented and hand-duplicated, so the two paths can drift. Progress % is the one
field with no keyboard route when the bar is under 50px.

**C3 — The hover tooltip is transparent.** 1.4.3, 1.4.13, 2.1.1. `--popover`/`--popover-foreground`
are undefined, so `bg-popover` emits nothing. Text measures **1.00–3.52:1** over the bars it renders
across; the field labels hit 1.00:1 — invisible. Independently, 1.4.13 fails on all three counts:
not dismissible, not hoverable, not focus-triggered. `components/ui/tooltip.jsx` carries the same
classes, so **every tooltip in the app is affected**.

## Major

**M1 — Red/amber/green collapse under protanopia and deuteranopia.** See the structural finding
above. 1.4.1 is *satisfied* because text always accompanies the colour, so this is a usability
defect and a latent conformance failure — latent because C1 shows a surface has already dropped the
text label once.

**M2 — `Reports.jsx:732-749`: three statuses render as one colour.** Verified independently:
`not_started`, `completed` and `delayed` all fall through `default` to `bg-primary/70`. **Completed
and delayed are the same violet.** `todo`/`done` are dead branches for statuses the API never emits.
This is the exact defect 023 fixed in the Gantt, one file over. It escaped Gate 4 because the values
are Tailwind classes, not hex, and escaped the contrast gate because it never reads `Reports.jsx`.

**M3 — Non-text contrast (1.4.11) is untested and failing in seven places.** `--input` vs
`--background` is **1.27:1 light / 1.36:1 dark** — the identifying boundary of every form control in
the app, and the highest-impact item. Also: the progress-overlay edge at 1.08–1.35:1, which is the
lowest-contrast boundary in the timeline and is the *sole* encoding wherever the % label is
suppressed; the baseline bar at 1.65:1; and segment adjacency at 1.05–1.28:1.

## Minor

**N1** critical-path membership has no programmatic equivalent (1.3.1). **N2** `title`-only
information on non-focusable elements. **N3** the same status is three different hues across Gantt /
Taskboard / Reports — `for_review` is amber, purple, then amber again. **N4** untokenised 021-era
literals in `Reports.jsx:489`, `:675`. **N5** group accent rotation collides under CVD at six or
more groups. **N6** weekend shading at 1.01:1 conveys nothing.

## Suggestions

**S1** no `forced-colors` support — inline `background` is overridden wholesale by Windows HCM, so
status encoding vanishes; the pill survives, so it degrades rather than breaks. **S2** no automated
a11y check in CI. **S3** add colourblind simulation to the gate.

## What the contrast gate is structurally unable to see

Ten properties, the first three being the ones that matter most:

1. **It never compares two palette colours to each other.** Every measurement is token-vs-surface or
   ink-vs-fill. Hue discriminability is a between-token property with no check anywhere — and, per
   the structural finding, the gate's own passing condition worsens it.
2. **It only knows 4.5:1.** No 3:1 tier exists in the file, so the entire 1.4.11 surface is outside
   its universe.
3. **It reads `--name: #hex` and one JS object.** Every Tailwind utility — all of `taskStatus.js`,
   `groupSummary.js`, `matchStatusColor` — is invisible to it. That is most status colour in the app
   by surface area.
4. Absence is invisible by construction: a reference to an undefined token produces no row and no
   error. That is exactly how `bg-popover` shipped transparent.
5. Assertion 7 proves the component *references* the map, not that the element is focusable, named,
   or operable.
6. Compositing is modelled only where it is told to. 7. Its surface list is fixed at three, so real
   stacking contexts (a tooltip over a bar) are unmodelled. 8. It never renders — focus order, AT
   announcements, reflow are all outside a static parser. 9. No `forced-colors` / `prefers-contrast`.
   10. It cannot judge whether the *right* status got the *right* colour beyond enum presence.

## Proposed gate extensions

- **Assertion 8** — hue separation: simulate every fill under all three dichromacies, assert min
  pairwise ΔE₀₀ ≥ 11 per theme, with an explicit XFAIL table for pairs that intentionally share a
  fill (the same mechanism `--primary` already uses).
- **Assertion 9** — a 3:1 tier for `--input`, focus rings, bar fills, overlay edges, segment
  adjacency.
- **Assertion 10** — undefined-token guard: sweep JSX for `bg-*`/`text-*`/`border-*` naming a token
  and fail if it is absent from `@theme inline`. This would have caught `bg-popover` on day one.
