import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STATUS_ORDER } from './taskStatus.js'
import { barWidth, markKind, buildStatusChartRows, SCALE_RESOLUTION_PCT } from './reportChart.js'

// SC-011's own numbers: a status holding one task beside a status holding
// hundreds. The chart this replaces rendered that 1 at 0.07px.
const LOPSIDED = { not_started: 899, blocked: 1 }

test('a count of one against hundreds is neither empty nor a proportional bar', () => {
  assert.equal(markKind(1, 900), 'pip')
  assert.notEqual(markKind(1, 900), markKind(0, 900))
})

// T041a asked for "barWidth(1, 900) clamps to the floor". Amendment B (FR-019)
// replaced the floor with a third mark type, and this is the assertion that
// records the change rather than quietly keeping a clamp: a sub-resolution
// count makes NO length claim, so its width is zero and its dot carries it.
test('a sub-resolution count has no length at all -- the clamp is gone', () => {
  assert.equal(barWidth(1, 900), '0%')
})

test('a count of zero has no length', () => {
  assert.equal(barWidth(0, 900), '0%')
  assert.equal(markKind(0, 900), 'empty')
})

test('a proportional count is its true share, not a max-normalised one', () => {
  // The defect being fixed: the old chart divided by the LARGEST count, so
  // 40/30/30 and 90/5/5 rendered identically. These are shares of the total.
  assert.equal(barWidth(300, 900), '33.33%')
  assert.equal(barWidth(900, 900), '100.00%')
})

test('the resolution boundary is exact and stated', () => {
  assert.equal(SCALE_RESOLUTION_PCT, 1)
  assert.equal(markKind(10, 1000), 'bar')   // exactly 1% -- at the line, a bar
  assert.equal(markKind(9, 1000), 'pip')    // just below
})

test('an empty project produces no marks and no division by zero', () => {
  const { total, rows } = buildStatusChartRows({})
  assert.equal(total, 0)
  assert.equal(rows.length, STATUS_ORDER.length)
  assert.ok(rows.every((row) => row.kind === 'empty'))
  assert.equal(barWidth(0, 0), '0%')
})

// Laravel's countBy serialises an empty collection as `[]`, not `{}`. Driving
// the rows from STATUS_ORDER rather than Object.entries is what makes that a
// non-event; this asserts it stays that way.
test('an empty collection arriving as an array still renders all seven rows', () => {
  const { total, rows } = buildStatusChartRows([])
  assert.equal(total, 0)
  assert.deepEqual(rows.map((row) => row.status), STATUS_ORDER)
})

test('every status renders always, including the ones with no tasks', () => {
  const { rows } = buildStatusChartRows({ completed: 4 })
  assert.deepEqual(rows.map((row) => row.status), STATUS_ORDER)
  assert.equal(rows.filter((row) => row.count === 0).length, STATUS_ORDER.length - 1)
})

test('the denominator is the sum of ALL response values, not of the known keys', () => {
  // If the backend enum grows a status the frontend has never heard of, a
  // denominator over the seven known keys inflates every printed share while
  // the header total says something else.
  const { total, rows } = buildStatusChartRows({ completed: 50, archived: 50 })
  assert.equal(total, 100)
  assert.equal(barWidth(rows.find((row) => row.status === 'completed').count, total), '50.00%')
})

test('a status absent from STATUS_ORDER surfaces rather than vanishing', () => {
  const { rows } = buildStatusChartRows({ completed: 5, archived: 3 })
  const stranger = rows.find((row) => row.status === 'archived')
  assert.ok(stranger, 'an unrecognised status key was dropped from the chart')
  assert.equal(stranger.count, 3)
  assert.equal(stranger.known, false)
  assert.ok(rows.filter((row) => row.known).every((row) => STATUS_ORDER.includes(row.status)))
})

test('the rows sum to the total printed in the panel header', () => {
  const { total, rows } = buildStatusChartRows({ ...LOPSIDED, completed: 40, archived: 7 })
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), total)
})

test('no status reaches a mark through a fallback -- every key is explicit', () => {
  const { rows } = buildStatusChartRows(LOPSIDED)
  for (const status of STATUS_ORDER) {
    assert.ok(rows.some((row) => row.status === status), `${status} has no row`)
  }
})
