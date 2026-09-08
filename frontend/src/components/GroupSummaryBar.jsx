import { useEffect, useRef, useState } from 'react'

// Shared building blocks for the Taskboard-style collapsible group header:
// a per-group accent bar + a segmented value-distribution bar shown only
// while a group is collapsed. Originally built for TaskboardView.jsx
// (019/#taskboard-scannability), then reused as-is for Bug Tracker and
// (accent bar only) Retrospectives so all three pages share one visual
// language instead of three near-identical copies.
//
// Rendered as an absolutely-positioned background bar (not a border-left
// utility): index.css defines a global, unlayered `* { border-color: ... }`
// reset that always outranks any Tailwind border-*-color utility regardless
// of specificity (unlayered CSS beats all `@layer`-declared utilities per
// the CSS Cascade Layers spec), so border-l-{color} utilities render inert
// app-wide. A background-color bar sidesteps that constraint entirely.
//
// `width` on GroupSegmentBar/GroupProgressBar must be a percentage string
// (e.g. '14.29%'), not a px number. The real <table> these bars sit above
// uses `table-layout: fixed; width: 100%` with a <colgroup> — when a
// colgroup's column widths don't sum to the table's own rendered width,
// table-layout:fixed proportionally stretches every column to fill 100%.
// A flex row's literal px-width children never participate in that stretch,
// so px widths silently drift out of alignment with the table below them at
// any viewport wide enough to leave slack. Percentages sidestep this
// entirely: both the colgroup and this row's flex children resolve their
// percentage against the same 100%-width container, so they scale together
// at every viewport instead of only matching at one specific width by
// coincidence. Callers must keep each table's full set of column
// percentages summing to 100 (see the *_COLUMN_WIDTHS constant in each
// caller file) for this to hold.
//
// GROUP_ACCENT_CLASSES and buildSegments live in @/lib/groupSummary — a file
// exporting both components and plain values breaks Fast Refresh, which lint
// enforces.

// Single continuous fill for a rolled-up percentage (e.g. average task
// progress across a group) — same footprint (label + h-7 bar) as
// GroupSegmentBar so the two sit flush in the same collapsed header row,
// but progress is a continuous 0-100 value, not a categorical distribution,
// so it gets one fill + a centered percentage instead of equal-share segments.
export function GroupProgressBar({ title, pct, width }) {
  if (pct === null || pct === undefined) {
    return (
      <div className="hidden sm:block shrink-0" style={{ width }}>
        <div className="text-xs font-medium text-muted-foreground text-center mb-1.5">{title}</div>
        <div className="h-7 w-full rounded-md bg-muted" />
      </div>
    )
  }
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div className="hidden sm:block shrink-0" style={{ width }}>
      <div className="text-xs font-medium text-muted-foreground text-center mb-1.5">{title}</div>
      <div className="relative h-7 w-full overflow-hidden rounded-md bg-muted" title={`${Math.round(clamped)}% average progress`}>
        <div className="h-full bg-primary transition-all" style={{ width: `${clamped}%` }} />
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-foreground">
          {Math.round(clamped)}%
        </span>
      </div>
    </div>
  )
}

// Below this many rendered pixels a 2-character glyph cannot be drawn legibly,
// so it is suppressed rather than clipped. Mirrors the Gantt's own
// `actualPos.width > 50` gate at WorkProgram.jsx:2692 -- same idea, smaller
// mark. It is a MEASURED px width, not a percentage: segment widths are
// percentages of a container whose real width depends on the table's
// table-layout:fixed stretch, so the only honest way to know whether the glyph
// fits is to measure the rendered box.
//
// The container is `overflow-hidden`, which means a glyph that does not fit is
// clipped SILENTLY -- it looks correct in a wide reviewer browser and vanishes
// on a narrow one. That is the failure this gate exists to prevent, and it is
// why the legend below is not optional.
const GLYPH_MIN_PX = 18

export function GroupSegmentBar({ title, segments, labels, width }) {
  const barRef = useRef(null)
  const [barPx, setBarPx] = useState(0)

  useEffect(() => {
    const el = barRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setBarPx(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (segments.length === 0) {
    return (
      <div className="hidden sm:block shrink-0" style={{ width }}>
        <div className="text-xs font-medium text-muted-foreground text-center mb-1.5">{title}</div>
        <div className="h-7 w-full rounded-md bg-muted" />
        {/* Same reserved count-row height as the populated branch below, or an
            empty group's bar drifts out of alignment with a populated one. */}
        <div className="mt-0.5 h-[13px] w-full" />
      </div>
    )
  }

  const hasGlyphs = segments.some((segment) => segment.glyph)

  return (
    <div className="hidden sm:block shrink-0" style={{ width }}>
      <div className="text-xs font-medium text-muted-foreground text-center mb-1.5">{title}</div>
      <div
        ref={barRef}
        className="flex h-7 w-full overflow-hidden rounded-md bg-muted"
        aria-hidden={hasGlyphs || undefined}
      >
        {segments.map((segment) => {
          // `outline`, deliberately not `border`. A border adds layout width
          // inside this flex row and shifts the percentage widths that this
          // file's header comment spends twenty lines protecting; outline is
          // drawn outside the box model and costs no layout. It also survives
          // forced-colors, where a background fill does not.
          const showGlyph = segment.glyph && (barPx * segment.pct) / 100 >= GLYPH_MIN_PX
          return (
            <span
              key={segment.key}
              className={`flex items-center justify-center outline-1 -outline-offset-1 outline-background/30 ${segment.className} ${segment.inkClassName || ''}`}
              style={{ width: `${segment.pct}%` }}
              title={`${labels[segment.key]}: ${segment.count}`}
            >
              {showGlyph && (
                <span className="text-[9px] font-bold leading-none select-none tracking-tight">
                  {segment.glyph}
                </span>
              )}
            </span>
          )
        })}
      </div>

      {/* Counts, ALIGNED UNDER THEIR OWN SEGMENT -- not a wrapping legend.
          The count is a CONDITION of shipping the glyph, not an addition to it:
          buildSegments gives every present status an equal share regardless of
          count, so the bar's lengths are not quantities, and a glyph without a
          printed number makes that misleading width more legible rather than
          less (research.md R18). It is also the channel that survives when the
          glyph is suppressed at narrow widths.

          The first implementation was a `flex-wrap` legend printing
          "<glyph> <label> <count>" per status. T043 caught it on the live app:
          inside the status column (~217px) it wrapped to THREE lines, grew the
          collapsed header's height, and pushed the neighbouring Priority column
          out of alignment -- breaking the "same footprint as GroupProgressBar
          so the two sit flush" contract this file's own header states. No
          amount of arithmetic would have found that.

          Mirroring the segment widths keeps it to exactly one line for any
          number of statuses, puts each number directly beneath the mark it
          describes, and needs no separate glyph-to-label mapping step from the
          reader. The full label stays available to assistive tech below. */}
      {/* ALWAYS RENDERED, even with no glyphs, and that is the fix for a
          regression T043 caught rather than a stylistic choice.

          The count row makes the Status column taller than its neighbours. The
          parent centres the columns, so a taller Status column lifts its bar
          off the shared baseline -- measured at 7px above the Priority bar,
          breaking the "same footprint ... so the two sit flush in the same
          collapsed header row" contract stated at the top of this file. The
          Priority and sentiment bars carry no glyphs and so no counts, but they
          must still reserve the same height or they drift.

          Reserving it here keeps the fix inside this component: it does not
          change what the out-of-scope vocabularies DISPLAY (research.md R17),
          only the box they occupy. */}
      <div className="mt-0.5 flex h-[13px] w-full" aria-hidden="true">
        {hasGlyphs && segments.map((segment) => (
          <span
            key={segment.key}
            className="text-[10px] leading-tight font-semibold tabular-nums text-muted-foreground text-center"
            style={{ width: `${segment.pct}%` }}
          >
            {segment.count}
          </span>
        ))}
      </div>
      {hasGlyphs && (
        <>
          {/* The bar and the count row are both visual; this is the only
              rendering that carries the status NAME, so it is not decorative
              and must not be aria-hidden. Previously the label was emitted
              twice -- once sr-only and once aria-hidden -- so screen readers
              announced every status name two times. */}
          <ul className="sr-only">
            {segments.map((segment) => (
              <li key={segment.key}>{labels[segment.key]}: {segment.count}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
