import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasAssignees, isAssigneeFilterActive } from './scheduleFilters.js'

// The sentinel is the whole point. Schedule builds
// `['all', ...new Set(tasks.map(t => t.responsible).filter(Boolean))]`,
// so the list is NEVER empty and the obvious emptiness test never fires.
const NOBODY = ['all']
const SOME = ['all', 'Alice', 'Bo']

test('a list holding only the sentinel counts as nobody', () => {
  assert.equal(hasAssignees(NOBODY), false)
})

test('the emptiness test is not length === 0, which can never be true', () => {
  // Written as an explicit regression: a filter gated on `length === 0` ships
  // looking implemented and renders unconditionally forever.
  assert.notEqual(NOBODY.length, 0, 'the sentinel is gone; this test is now checking nothing')
  assert.equal(hasAssignees(NOBODY), false, 'emptiness is being measured with the wrong test')
})

test('one real assignee is enough to show the filter', () => {
  assert.equal(hasAssignees(['all', 'Alice']), true)
  assert.equal(hasAssignees(SOME), true)
})

test('an empty list is still nobody', () => {
  assert.equal(hasAssignees([]), false)
})

test('"all" never filters', () => {
  assert.equal(isAssigneeFilterActive('all', SOME), false)
  assert.equal(isAssigneeFilterActive('all', NOBODY), false)
})

test('a selection that is still offered filters', () => {
  assert.equal(isAssigneeFilterActive('Alice', SOME), true)
})

test('a stale selection stops filtering when the control is hidden', () => {
  // The defect: the filter is gone from the page, the state still says 'Alice',
  // and every row is filtered away with nothing on screen to explain it.
  assert.equal(isAssigneeFilterActive('Alice', NOBODY), false)
})

test('a selection that vanished while others remain also stops filtering', () => {
  // The case a bare "is the control visible" guard misses: the filter is still
  // shown (Bo is assignable), the <select> holds a value absent from its own
  // options, and the page shows nothing.
  assert.equal(isAssigneeFilterActive('Alice', ['all', 'Bo']), false)
})

test('the choice survives the assignee coming back', () => {
  // Why availability is tested rather than the selection reset to 'all'.
  assert.equal(isAssigneeFilterActive('Alice', ['all', 'Bo']), false)
  assert.equal(isAssigneeFilterActive('Alice', ['all', 'Alice', 'Bo']), true)
})
