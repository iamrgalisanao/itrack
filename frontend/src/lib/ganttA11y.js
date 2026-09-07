// What the Gantt timeline says to assistive technology.
//
// Extracted rather than duplicated. `getGanttStatusLabel` was a
// component-scoped arrow inside WorkProgram.jsx, so a pure module could neither
// import it nor copy it without minting a FIFTH status vocabulary in an app
// that already has four. The Gantt set is authoritative for this announcement
// and it genuinely disagrees with taskStatus.js -- `completed` is "Completed"
// here and "Done" there -- so the choice of which to extract was not cosmetic.
//
// Everything here is a pure function of its arguments, which is the whole
// reason it is here: node --test can hold the assistive STRING, in both
// directions, where a snapshot of a rendered span would pass whenever the
// field was missing for the wrong reason.
//
// What this module does NOT prove, per contracts/ui-contracts.md Contract 4:
// that the string reaches the accessibility tree. That is the component's job
// and the manual matrix's.

import { formatDate } from './utils.js'

/**
 * Statuses the API accepts, plus `pending`, which the client synthesises in
 * getRollupStatus for parent rows.
 *
 * Exhaustive on purpose. `blocked`, `backlog` and `for_review` used to fall
 * through to a default and were all labelled "Pending" -- a blocked task
 * announced as merely not started yet.
 */
export function getGanttStatusLabel(status) {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'in_progress':
      return 'In Progress'
    case 'for_review':
      return 'For Review'
    case 'delayed':
      return 'Delayed'
    case 'blocked':
      return 'Blocked'
    case 'backlog':
      return 'Backlog'
    case 'not_started':
      return 'Not Started'
    case 'pending':
      return 'Pending'
    default:
      // Show the unknown value rather than substituting a plausible one.
      // Silently announcing "Not Started" is exactly how `blocked` read as
      // "Pending" for so long (FR-008).
      return status ? String(status).replace(/_/g, ' ') : 'Unknown'
  }
}

/**
 * Contract 2 -- a POSITIVE ALLOWLIST, and the positivity is the requirement.
 *
 * The shipping test is `role === 'Client'`, which returns false for null. But
 * useEffectiveUser() returns null until auth resolves, so during that window
 * `isClient` is false and the contributor renders to a viewer whose role is not
 * yet known. Every unrecognised, absent or future role must land on the same
 * side as Client, and only these four names may open the gate.
 */
const CONTRIBUTOR_ROLES = ['Admin', 'Project Manager', 'Department Head', 'Team Member']

export function canSeeContributor(role) {
  return CONTRIBUTOR_ROLES.includes(role)
}

// The visible row beside the bar carries the full name, so truncating here
// costs a screen-reader user nothing they cannot reach -- while an untruncated
// name makes every bar's announcement unskippable. No ellipsis is appended:
// "…" is announced inconsistently across screen readers, and the cut always
// falls on a word boundary so the name does not end mid-syllable.
export const GANTT_NAME_MAX = 80

function truncateOnWord(name, max) {
  if (!name) return ''
  if (name.length <= max) return name
  const cut = name.lastIndexOf(' ', max)
  return cut > 0 ? name.slice(0, cut) : name.slice(0, max)
}

function scheduleClause(row) {
  if (!row.plan_start_date && !row.plan_end_date) return 'no dates scheduled'
  return `${formatDate(row.plan_start_date)} to ${formatDate(row.plan_end_date)}`
}

// The visual card shows Actual only when it diverges from the plan. Mirrored
// here rather than re-decided, so the two cannot drift into disagreeing about
// whether a task is on schedule.
function hasDivergentActuals(row) {
  return Boolean(
    row.actual_start_date &&
      (row.actual_start_date !== row.plan_start_date || row.actual_end_date !== row.plan_end_date),
  )
}

/**
 * The bar's accessible NAME: identity, status, schedule.
 *
 * Never appends "button" -- the element's role supplies that, and appending it
 * yields "... button button". Never appends "Click timeline bar to edit": an
 * instruction only a mouse user can act on, addressed to people who cannot
 * (FR-005).
 */
export function buildGanttBarLabel(row) {
  const name = truncateOnWord(row.name, GANTT_NAME_MAX)
  const identity = row.code ? `${row.code} ${name}` : name
  return `${identity}, ${getGanttStatusLabel(row.status)}, ${scheduleClause(row)}`
}

/**
 * The bar's accessible DESCRIPTION: the fields the row summary does not show.
 *
 * TAKES THE DECISION, NEVER THE ROLE. `includeContributor` is a boolean the
 * caller derives from canSeeContributor -- one definition, consumed at the
 * visible sites and here, so the gate cannot be reimplemented per call site
 * and drift (FR-007).
 *
 * Duration is spelled out. "0m 5d" is announced as "zero em five dee", which
 * is not what the abbreviation means to anyone reading it aloud.
 */
export function buildGanttBarDescription(row, { includeContributor = false } = {}) {
  const parts = [`Level: ${row.type}.`]

  if (row.plan_start_date || row.plan_end_date) {
    parts.push(`Planned ${formatDate(row.plan_start_date)} to ${formatDate(row.plan_end_date)}.`)
  } else {
    parts.push('Planned dates not set.')
  }

  if (hasDivergentActuals(row)) {
    parts.push(`Actual ${formatDate(row.actual_start_date)} to ${formatDate(row.actual_end_date)}.`)
  }

  parts.push(`Duration ${row.duration_months || 0} months ${row.duration_days || 0} days.`)

  if (row.progress !== undefined && row.progress !== null) {
    parts.push(`Progress ${row.progress}%.`)
  }

  // getVisibleGanttRows defaults `responsible` to '-' at every level, so the
  // dash is the common case rather than a curiosity. Announcing "Contributor:
  // dash" is worse than saying nothing.
  const contributor = includeContributor ? row.responsible : ''
  if (contributor && contributor !== '-') {
    parts.push(`Contributor: ${contributor}.`)
  }

  return parts.join(' ')
}
