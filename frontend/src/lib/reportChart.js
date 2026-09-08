// The project status chart's arithmetic, extracted from the JSX so it can be
// tested. T041 originally asked for this to be held by verify-cascade.py and was
// deleted: that suite never executes React, it builds its own fixture HTML from
// a hand-written CASES list, so a bar length computed in JS is structurally
// unreachable by it. Writing the fixture width by hand and then asserting the
// browser computes it would have been green, correct, and silent about
// Reports.jsx. Arithmetic is testable as arithmetic -- the same reasoning
// already applied to ganttA11y.js -- so it lives here and node --test holds it.
//
// verify-contrast.py asserts that Reports.jsx imports `barWidth` from this
// module and contains no width arithmetic of its own, so the function under
// test is the function that ships.

import { STATUS_ORDER } from './taskStatus.js'

// THE SCALE'S RESOLUTION, stated as a number rather than left implicit.
//
// A bar shorter than this share of the track cannot be drawn at a length a
// reader can compare -- at a realistic track width of 200-400px, 1% is 2-4px.
// It is expressed as a percentage and not as pixels because the track is a grid
// `1fr` whose pixel width is unknown at render time; a px threshold would be a
// guess dressed as a measurement.
export const SCALE_RESOLUTION_PCT = 1

// THREE MARK TYPES, NOT TWO -- FR-019.
//
// The obvious implementation is `max(0.25rem, share)`, and it trades one
// indistinguishability for another: every count below the clamp renders at
// identical length, so a reader cannot tell 1 from 7, while the mark still
// LOOKS proportional and therefore still makes a quantitative claim it cannot
// support. The chart this replaces shows how bad that gets -- it was
// max-scaled into a 64px box, so a count of 1 against a largest count of 900
// rendered at 0.07px, indistinguishable from zero.
//
// So a sub-resolution count gets a mark that is visibly NOT a bar (the caller
// draws a dot) and makes no length claim at all. That extends the rule already
// adopted for zero rather than inventing a precedent.
export function markKind(count, total) {
  if (!(count > 0) || !(total > 0)) return 'empty'
  return (count / total) * 100 < SCALE_RESOLUTION_PCT ? 'pip' : 'bar'
}

// The CSS width for the proportional mark. Zero-length for both non-bar kinds:
// their marks are drawn by shape, not by length, and a non-zero width here
// would put the length claim back.
//
// Percent, not px -- the whole scale is a share of the track, and a px literal
// would be the only pixel value in the module.
export function barWidth(count, total) {
  if (markKind(count, total) !== 'bar') return '0%'
  return `${((count / total) * 100).toFixed(2)}%`
}

// Rows for the chart, in STATUS_ORDER, ALWAYS all seven -- a status with no
// tasks is a fact about the project and renders as an empty track and a printed
// 0, not as an absent row. Driving the render from STATUS_ORDER rather than
// Object.entries is also what makes the chart immune to Laravel's countBy
// serialising an empty collection as `[]` instead of `{}`.
//
// The denominator is the sum of EVERY value in the response, not of the seven
// keys we recognise. If the backend enum grows an eighth status, a denominator
// over the known keys would silently inflate every printed share while the
// header total said something else. Unknown keys therefore also get their own
// rows, flagged `known: false`, so they surface rather than vanish -- the
// caller draws them in a treatment that belongs to no status.
export function buildStatusChartRows(breakdown) {
  const counts = breakdown || {}
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
  const unknown = Object.keys(counts).filter((key) => !STATUS_ORDER.includes(key))

  const rows = [...STATUS_ORDER, ...unknown].map((status) => {
    const count = counts[status] ?? 0
    return { status, count, kind: markKind(count, total), known: STATUS_ORDER.includes(status) }
  })

  return { total, rows }
}
