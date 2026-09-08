// Shared task-status vocabulary for the grouped task views (Taskboard, and
// the dashboard's My Work panel). Lives in lib/ rather than in a component
// file because a module exporting both components and plain values breaks
// Fast Refresh, which `npm run lint` enforces — same reason as
// lib/groupSummary.js.
//
// These are the seven values DetailedActivityController validates. Any view
// that renders task status must cover all seven: the four-value set used by
// Work Program's List view predates backlog/for_review/blocked and silently
// drops rows holding those statuses.

export const STATUS_ORDER = ['backlog', 'not_started', 'in_progress', 'for_review', 'blocked', 'delayed', 'completed']

export const STATUS_SEGMENT_LABELS = {
  backlog: 'Backlog',
  not_started: 'Not Started',
  in_progress: 'In Progress',
  for_review: 'For Review',
  blocked: 'Blocked',
  delayed: 'Delayed',
  completed: 'Done',
}

// Solid fills for the collapsed group-header segment bar.
//
// TOKEN NAMES, NOT PALETTE LITERALS -- and the change is not cosmetic. The old
// map was raw Tailwind palette (`bg-slate-400`, `bg-red-500`), which Tailwind
// v4 emits in oklch. `verify-contrast.py` parses `#rrggbb`, so it could not see
// a single one of these values: SC-004 had no gate at all while they were
// literals. They also drifted from the Gantt, which 023 moved onto tokens.
//
// The vocabulary is GANTT_STATUS_TOKENS' -- the same five fills, so a status is
// one colour everywhere in the app. Note `for_review` moves from purple to
// --warning: that is a deliberate consolidation, not a mistake. Purple was a
// sixth hue that meant nothing and collided with the milestone dot.
export const STATUS_SEGMENT_CLASSES = {
  backlog: 'bg-muted-foreground',
  not_started: 'bg-muted-foreground',
  in_progress: 'bg-info',
  for_review: 'bg-warning',
  blocked: 'bg-destructive',
  delayed: 'bg-destructive',
  completed: 'bg-success',
}

// The ink each fill is safe to draw on, paired at a measured 4.5:1 by
// ganttPalette.js. The pair is the unit: a fill without its ink is half a
// decision, which is how a bar ends up legible as a shape and illegible as a
// label.
export const STATUS_SEGMENT_INK = {
  backlog: 'text-background',
  not_started: 'text-background',
  in_progress: 'text-info-foreground',
  for_review: 'text-warning-foreground',
  blocked: 'text-destructive-foreground',
  delayed: 'text-destructive-foreground',
  completed: 'text-success-foreground',
}

// THE NON-COLOUR CHANNEL. Not decoration -- this is what makes the fills legal.
//
// FR-009 fixes the discriminability threshold at dE00 11.0, and the palette
// does not clear it: measured under Vienot-Brettel-Mollon + CIEDE2000, six
// theme/deficiency/pair combinations fall below, and EVERY one lies inside the
// red/amber/green triad. The worst is for_review vs blocked/delayed at 3.98 in
// light deuteranopia -- and those two segments ABUT in this very bar. Two
// statuses also share a fill outright by sanctioned design (backlog/not_started
// on --muted-foreground, blocked/delayed on --destructive).
//
// So for these pairs the glyph is the ONLY thing carrying the distinction, and
// `verify-contrast.py` asserts uniqueness across ALL SEVEN unconditionally --
// not merely within fill-sharing pairs, which was the original plan and which
// would have left the sub-threshold pairs unchecked.
//
// The abbreviations are chosen against that assertion, not for prettiness:
//   * 'DN' for Done was REJECTED. delayed/completed is a sub-threshold pair
//     (7.07 dark deuteranopia), and DL/DN share an initial -- exactly the
//     collision that a natural abbreviation scheme produces and that colour can
//     no longer disambiguate. 'OK' has no such neighbour.
//   * BL/NS and BK/DL separate the two sanctioned fill-sharing pairs.
//   * BK, DL, RV, OK are mutually distinct in first letter as well as whole
//     token, because they are the triad that colour cannot separate.
export const STATUS_GLYPHS = {
  backlog: 'BL',
  not_started: 'NS',
  in_progress: 'IP',
  for_review: 'RV',
  blocked: 'BK',
  delayed: 'DL',
  completed: 'OK',
}

// Status column badge -- retokenised in the SAME task as the segment map, not
// later, and that ordering is load-bearing. The segment and the badge render
// one row apart in the same view (MyWorkPanel:565/:120, TaskboardView:245/:294)
// -- the same-page adjacency FR-011 governs. Retokenising one alone trades
// "the segment disagrees with the Gantt" for "the segment disagrees with the
// badge beside it", which is net-negative.
//
// Expressed as token utilities at alpha 0.10/0.40, which is the exact
// construction verify-contrast.py's `on_tint` assertion already measures. Left
// as literals it would be unmeasurable, same as the segment map above.
export const STATUS_BADGE_CLASSES = {
  backlog: 'border-muted-foreground/40 bg-muted-foreground/10 text-muted-foreground',
  not_started: 'border-muted-foreground/40 bg-muted-foreground/10 text-muted-foreground',
  in_progress: 'border-info/40 bg-info/10 text-info',
  for_review: 'border-warning/40 bg-warning/10 text-warning',
  blocked: 'border-destructive/40 bg-destructive/10 text-destructive',
  delayed: 'border-destructive/40 bg-destructive/10 text-destructive',
  completed: 'border-success/40 bg-success/10 text-success',
}
