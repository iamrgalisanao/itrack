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
export const STATUS_SEGMENT_CLASSES = {
  backlog: 'bg-slate-400',
  not_started: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  for_review: 'bg-purple-500',
  blocked: 'bg-red-500',
  delayed: 'bg-red-600',
  completed: 'bg-emerald-500',
}

// Status column badge — same color families as STATUS_SEGMENT_CLASSES, in
// the outline-badge style PRIORITY_BADGE_CLASSES already uses.
export const STATUS_BADGE_CLASSES = {
  backlog: 'border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300',
  not_started: 'border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300',
  in_progress: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  for_review: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400',
  blocked: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
  delayed: 'border-red-600/40 bg-red-600/10 text-red-800 dark:text-red-400',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
}
