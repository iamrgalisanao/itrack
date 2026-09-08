// The Schedule page's assignee-filter predicates.
//
// Two one-line expressions, extracted because both hide a trap that a reader
// cannot see and a test can pin. Same reasoning that put the report chart's
// arithmetic in reportChart.js: if it is worth getting right, it is worth being
// able to fail.

/**
 * Is there anybody to filter by?
 *
 * THE LIST IS SEEDED WITH 'all'. So `assignees.length === 0` — the obvious
 * test, and the one the task described — can never be true, and a filter gated
 * on it renders unconditionally while looking implemented. The real emptiness
 * test is "nothing beyond the sentinel".
 *
 * Hidden on emptiness, never on role: a Client with assignees to filter by
 * should get the filter, and an Admin on a project with none should not.
 */
export function hasAssignees(assignees) {
  return assignees.filter((a) => a !== 'all').length > 0
}

/**
 * Should the selection actually filter anything?
 *
 * Not simply `filter !== 'all'`. A selection that is no longer offered has to
 * stop filtering, or the page silently shows nothing while the control that
 * would explain why is either hidden or displaying a value absent from its own
 * options.
 *
 * That covers two cases with one test:
 *   - the filter is hidden because nobody is assignable, and a stale selection
 *     would otherwise keep filtering by an invisible value;
 *   - the filter is still shown, but the selected person specifically has gone
 *     while others remain — which a bare "is the control visible" guard misses.
 *
 * Chosen over resetting the selection to 'all', which needs a state-syncing
 * effect and throws the choice away if that assignee comes back.
 */
export function isAssigneeFilterActive(assigneeFilter, assignees) {
  return assigneeFilter !== 'all' && assignees.includes(assigneeFilter)
}
