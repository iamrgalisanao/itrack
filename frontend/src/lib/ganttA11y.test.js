import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getGanttStatusLabel,
  canSeeContributor,
  buildGanttBarLabel,
  buildGanttBarDescription,
  GANTT_NAME_MAX,
} from './ganttA11y.js'

// WRITTEN BEFORE THE MODULE EXISTED, and confirmed failing for module-absent
// rather than passing vacuously. That ordering is the point: a snapshot of a
// rendered span would pass when the contributor field is missing FOR THE WRONG
// REASON -- the fixture simply had no `responsible` -- which is the trap that
// made an earlier feature's `reports` row assert nothing at all.
//
// Expected strings below are written out as literals, not derived from the
// formatters, so this file tests correctness rather than self-consistency.

// The sentinel exists so a leak is unambiguous. A test asserting "the string
// does not contain the contributor's name" against a fixture named "Alice" can
// pass because the formatter emitted nothing at all; it cannot pass by accident
// against a token no other field can produce.
const SENTINEL = 'SENTINEL-CONTRIBUTOR'

const ROW = {
  id: 42,
  type: 'task',
  code: '1.1.1',
  name: 'Schedule Kick-off Meeting',
  status: 'blocked',
  progress: 40,
  responsible: SENTINEL,
  plan_start_date: '2026-01-05',
  plan_end_date: '2026-01-09',
  actual_start_date: '2026-01-06',
  actual_end_date: '2026-01-12',
  duration_months: 0,
  duration_days: 5,
}

// ---------------------------------------------------------------- Contract 2
//
// A POSITIVE ALLOWLIST over the four non-Client roles. The shipping code today
// is `role === 'Client'`, which returns false for null -- and useEffectiveUser()
// returns null before auth resolves, so the contributor renders during that
// window. That is the requirement, not an edge case.

test('canSeeContributor admits exactly the four internal roles', () => {
  for (const role of ['Admin', 'Project Manager', 'Department Head', 'Team Member']) {
    assert.equal(canSeeContributor(role), true, `${role} must see the contributor`)
  }
})

test('canSeeContributor refuses Client', () => {
  assert.equal(canSeeContributor('Client'), false)
})

test('canSeeContributor FAILS CLOSED on every absent or unknown role', () => {
  // null and undefined are the live defect: auth has not resolved yet.
  for (const role of [null, undefined, '', 'client', 'CLIENT', 'Auditor', 'Guest', 0, false, {}]) {
    assert.equal(canSeeContributor(role), false, `${JSON.stringify(role)} must not see the contributor`)
  }
})

// ------------------------------------------------- FR-007, in both directions
//
// The first assertion alone is satisfied by a formatter that withholds the
// contributor from EVERYONE -- which passes the confidentiality test and breaks
// the product. Both directions are asserted for that reason.

test('a Client never receives the contributor, whatever the role value is', () => {
  for (const role of ['Client', null, undefined, '', 'Auditor']) {
    const text = buildGanttBarDescription(ROW, { includeContributor: canSeeContributor(role) })
    assert.ok(
      !text.includes(SENTINEL),
      `contributor leaked to role ${JSON.stringify(role)}: ${text}`,
    )
  }
})

test('an internal role DOES receive the contributor', () => {
  const text = buildGanttBarDescription(ROW, { includeContributor: canSeeContributor('Team Member') })
  assert.ok(text.includes(SENTINEL), `contributor withheld from an internal role: ${text}`)
})

test('the formatter takes the decision, never the role', () => {
  // Passing a role where a boolean belongs must not accidentally grant access.
  // `{ includeContributor: 'Admin' }` is truthy, so this asserts the call site
  // shape rather than the formatter's tolerance: the two explicit booleans are
  // the whole contract, and nothing else may be smuggled through.
  // Every assertion carries a message. A bare assert.ok here reports only
  // "Expected values to be truthy", which is how a tamper defaulting
  // `includeContributor` to true went red WITHOUT naming the leak -- the run
  // was correct and the report was useless.
  assert.ok(
    buildGanttBarDescription(ROW, { includeContributor: true }).includes(SENTINEL),
    'contributor withheld when the decision was explicitly true',
  )
  assert.ok(
    !buildGanttBarDescription(ROW, { includeContributor: false }).includes(SENTINEL),
    'contributor leaked when the decision was explicitly false',
  )
  assert.ok(
    !buildGanttBarDescription(ROW, {}).includes(SENTINEL),
    'contributor leaked with an empty options object -- the default is fail-open',
  )
  assert.ok(
    !buildGanttBarDescription(ROW).includes(SENTINEL),
    'contributor leaked with no options at all -- the default is fail-open',
  )
})

// ------------------------------------------------------------- the label
//
// Contract 1: identity, status, schedule. Never "button" -- the role supplies
// that, and appending it produces "... button button". Never "Click timeline
// bar to edit", which is an instruction only a mouse user can act on (FR-005).

test('the bar label carries code, name, status and schedule', () => {
  assert.equal(
    buildGanttBarLabel(ROW),
    '1.1.1 Schedule Kick-off Meeting, Blocked, Jan 5, 2026 to Jan 9, 2026',
  )
})

test('the bar label never appends the role or a mouse-only instruction', () => {
  const text = buildGanttBarLabel(ROW).toLowerCase()
  assert.doesNotMatch(text, /\bbutton\b/)
  assert.doesNotMatch(text, /\bclick\b/)
})

test('a row with no code omits it rather than printing a gap', () => {
  assert.equal(
    buildGanttBarLabel({ ...ROW, code: null }),
    'Schedule Kick-off Meeting, Blocked, Jan 5, 2026 to Jan 9, 2026',
  )
})

test('a row with no dates says so instead of announcing a dash', () => {
  assert.equal(
    buildGanttBarLabel({ ...ROW, plan_start_date: null, plan_end_date: null }),
    '1.1.1 Schedule Kick-off Meeting, Blocked, no dates scheduled',
  )
})

test('a long name is truncated on a word boundary, never mid-word', () => {
  const long = 'Coordinate the quarterly stakeholder alignment workshop and circulate the resulting action register'
  const label = buildGanttBarLabel({ ...ROW, name: long })
  const name = label.slice('1.1.1 '.length, label.indexOf(', Blocked'))
  assert.ok(name.length <= GANTT_NAME_MAX, `name is ${name.length} chars`)
  assert.ok(long.startsWith(name), 'truncation altered the name')
  assert.ok(!name.endsWith(' '), 'truncation left a trailing space')
  // Word boundary: the character after the cut in the original is a space.
  assert.equal(long[name.length], ' ')
})

test('a name at exactly the limit is not truncated', () => {
  const exact = 'x'.repeat(GANTT_NAME_MAX)
  assert.ok(buildGanttBarLabel({ ...ROW, name: exact }).includes(exact))
})

// -------------------------------------------------------- the description
//
// The fields the row summary does not show. Announced from the LEFT pane, so a
// browse-mode reader meets it beside the row it describes rather than N rows
// away -- but that is a wiring decision, and this module only owns the string.

test('the description carries level, planned vs actual, duration and progress', () => {
  assert.equal(
    buildGanttBarDescription(ROW, { includeContributor: false }),
    'Level: task. Planned Jan 5, 2026 to Jan 9, 2026. Actual Jan 6, 2026 to Jan 12, 2026. Duration 0 months 5 days. Progress 40%.',
  )
})

test('the description appends the contributor only when the decision says so', () => {
  assert.equal(
    buildGanttBarDescription(ROW, { includeContributor: true }),
    'Level: task. Planned Jan 5, 2026 to Jan 9, 2026. Actual Jan 6, 2026 to Jan 12, 2026. Duration 0 months 5 days. Progress 40%. Contributor: SENTINEL-CONTRIBUTOR.',
  )
})

test('actual dates matching the plan are not announced twice', () => {
  const onPlan = { ...ROW, actual_start_date: ROW.plan_start_date, actual_end_date: ROW.plan_end_date }
  const text = buildGanttBarDescription(onPlan, { includeContributor: false })
  assert.ok(text.includes('Planned Jan 5, 2026 to Jan 9, 2026.'))
  assert.ok(!text.includes('Actual'), `redundant actual dates announced: ${text}`)
})

test('a row with no planned dates says so rather than announcing two dashes', () => {
  const text = buildGanttBarDescription(
    { ...ROW, plan_start_date: null, plan_end_date: null },
    { includeContributor: false },
  )
  assert.ok(text.includes('Planned dates not set.'), text)
  assert.ok(!text.includes('- to -'), text)
})

test('a row with no progress omits the clause rather than announcing 0%', () => {
  const text = buildGanttBarDescription({ ...ROW, progress: undefined }, { includeContributor: false })
  assert.ok(!text.includes('Progress'), text)
})

test('a contributor of "-" is treated as absent, not announced as a dash', () => {
  // getVisibleGanttRows defaults `responsible` to '-' for every level, so the
  // dash is the common case rather than a curiosity.
  const text = buildGanttBarDescription({ ...ROW, responsible: '-' }, { includeContributor: true })
  assert.ok(!text.includes('Contributor'), text)
})

// ------------------------------------------------------------ status labels
//
// The GANTT vocabulary is authoritative for this announcement, not
// taskStatus.js's -- they genuinely disagree (`completed` is "Completed" here
// and "Done" there). Extracting rather than duplicating is what stops a fifth
// status vocabulary from being minted.

test('every status the API accepts has a label, plus the pending rollup', () => {
  assert.deepEqual(
    ['backlog', 'not_started', 'pending', 'in_progress', 'for_review', 'blocked', 'delayed', 'completed']
      .map(getGanttStatusLabel),
    ['Backlog', 'Not Started', 'Pending', 'In Progress', 'For Review', 'Blocked', 'Delayed', 'Completed'],
  )
})

test('an unknown status shows itself rather than a plausible substitute', () => {
  // Silently rendering "Not Started" is exactly how `blocked` read as "Pending"
  // for so long.
  assert.equal(getGanttStatusLabel('awaiting_signoff'), 'awaiting signoff')
  assert.equal(getGanttStatusLabel(null), 'Unknown')
  assert.equal(getGanttStatusLabel(undefined), 'Unknown')
})
