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
const GLYPH_MIN_PX = 20

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
      </div>
    )
  }

  const hasGlyphs = segments.some((segment) => segment.glyph)

  return (
    <div className="hidden sm:block shrink-0" style={{ width }}>
      <div className="text-xs font-medium text-muted-foreground text-center mb-1.5">{title}</div>
      <div ref={barRef} className="flex h-7 w-full overflow-hidden rounded-md bg-muted">
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

      {/* The legend is a CONDITION of shipping the glyph, not an addition to it.
          buildSegments gives every present status an EQUAL share regardless of
          count, so the bar's lengths are not quantities. A glyph without a
          printed number makes that misleading width more legible, not less --
          research.md R18. The number is also the channel that survives when the
          glyph is suppressed at narrow widths, and the only one available to a
          screen reader, since the bar itself is decorative. */}
      {hasGlyphs && (
        <ul className="mt-1 flex flex-wrap justify-center gap-x-2 gap-y-0.5">
          {segments.map((segment) => (
            <li key={segment.key} className="text-[10px] leading-tight text-muted-foreground">
              <span className="font-bold tracking-tight">{segment.glyph}</span>
              <span className="sr-only"> {labels[segment.key]}</span>
              <span aria-hidden="true"> {labels[segment.key]}</span>
              <span className="ml-0.5 font-semibold tabular-nums text-foreground">{segment.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
