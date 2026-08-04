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
export const GROUP_ACCENT_CLASSES = [
  { bar: 'bg-emerald-500', label: 'text-emerald-700 dark:text-emerald-400' },
  { bar: 'bg-amber-500', label: 'text-amber-700 dark:text-amber-400' },
  { bar: 'bg-primary', label: 'text-primary' },
  { bar: 'bg-rose-500', label: 'text-rose-700 dark:text-rose-400' },
  { bar: 'bg-orange-500', label: 'text-orange-700 dark:text-orange-400' },
]

// Segments split the bar equally across the distinct values present in the
// group, not proportionally by how many items hold each value — a lone
// value (e.g. everything unset) fills the whole bar; two present values
// split it 50/50 regardless of their individual counts. Tooltips still show
// the real per-value count.
export function buildSegments(items, field, order, classes) {
  const counts = new Map()
  for (const item of items) {
    const key = item[field] || 'unset'
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const present = order.filter((key) => counts.get(key) > 0)
  const equalPct = present.length ? 100 / present.length : 0
  return present.map((key) => ({ key, count: counts.get(key), pct: equalPct, className: classes[key] }))
}

// Single continuous fill for a rolled-up percentage (e.g. average task
// progress across a group) — same footprint (label + h-7 bar) as
// GroupSegmentBar so the two sit flush in the same collapsed header row,
// but progress is a continuous 0-100 value, not a categorical distribution,
// so it gets one fill + a centered percentage instead of equal-share segments.
export function GroupProgressBar({ title, pct, widthPx }) {
  const clamped = Math.max(0, Math.min(100, pct || 0))
  return (
    <div className="hidden sm:block shrink-0" style={{ width: widthPx }}>
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

export function GroupSegmentBar({ title, segments, labels, widthPx }) {
  if (segments.length === 0) {
    return (
      <div className="hidden sm:block shrink-0" style={{ width: widthPx }}>
        <div className="text-xs font-medium text-muted-foreground text-center mb-1.5">{title}</div>
        <div className="h-7 w-full rounded-md bg-muted" />
      </div>
    )
  }
  return (
    <div className="hidden sm:block shrink-0" style={{ width: widthPx }}>
      <div className="text-xs font-medium text-muted-foreground text-center mb-1.5">{title}</div>
      <div className="flex h-7 w-full overflow-hidden rounded-md bg-muted">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={segment.className}
            style={{ width: `${segment.pct}%` }}
            title={`${labels[segment.key]}: ${segment.count}`}
          />
        ))}
      </div>
    </div>
  )
}
