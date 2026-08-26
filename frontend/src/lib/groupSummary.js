// Non-component building blocks for the Taskboard-style collapsible group
// header. These live outside GroupSummaryBar.jsx because a file that exports
// both components and plain values breaks Fast Refresh
// (react-refresh/only-export-components), which `npm run lint` enforces.
// GroupSummaryBar.jsx keeps the components; this module keeps the data.

// Accent pairs are consumed positionally by callers that rotate through them
// per group (`GROUP_ACCENT_CLASSES[index % GROUP_ACCENT_CLASSES.length]` in
// TaskboardView, BugTracker and Retrospectives). Appending or reordering
// entries therefore recolors existing groups on all three pages — a view with
// six or more groups changes appearance. Views needing a fixed, meaningful
// colour (where a specific group must always read as urgent) should define
// their own semantic map locally rather than index into this rotation.
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
