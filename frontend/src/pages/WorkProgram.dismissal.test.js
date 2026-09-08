import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// C5's structure: dismissal (1.4.13), the chevron's name and state (4.1.2,
// 1.3.1), and the critical path in forced colours (1.4.1 in HCM).
//
// The runtime half is scripts/uichecks/gantt_dismiss_and_hcm.py. The forced-
// colours half is only PARTLY checkable anywhere automated -- see that file's
// docstring -- and this file proves the wiring, not the appearance.
const SRC = readFileSync(fileURLToPath(new URL('./WorkProgram.jsx', import.meta.url)), 'utf8')
const CSS = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8')

test('dismissal is one state on the pane, not a hook per row', () => {
  assert.equal(
    SRC.split('const [dismissedRowId, setDismissedRowId] = useState(null)').length - 1,
    1,
    'dismissedRowId is declared other than exactly once',
  )
  // A useState inside the row map would break the rules of hooks the moment the
  // row count changed -- and would be invisible until a filter was applied.
  //
  // The paren matters. `useState` without it also matches the prose in a comment
  // further down ("see the useState initializer"), and an assertion that fires
  // on a comment is one this file has already been caught by twice.
  const afterMap = SRC.slice(SRC.indexOf('visibleRows.map((row, rowIndex)'))
  assert.ok(
    !afterMap.includes('useState('),
    'a hook is called inside the timeline row map',
  )
})

test('Escape dismisses and focus restores, without moving focus', () => {
  // Plain string assertions, not one regex spanning both lines. A windowed
  // regex here failed the moment a comment was written between them — the
  // third time this file has had an assertion break on prose rather than code.
  assert.ok(
    SRC.includes("if (e.key !== 'Escape') return"),
    'the bar has no Escape branch (1.4.13 requires the card be dismissable without moving focus)',
  )
  assert.ok(
    SRC.includes('setDismissedRowId(row.id)'),
    'nothing records which row was dismissed',
  )
  assert.ok(
    SRC.includes('onFocus={() => setDismissedRowId(null)}'),
    'nothing clears the dismissal on focus -- a dismissal that outlives the interaction loses the card permanently',
  )
  assert.ok(
    SRC.includes('onMouseLeave={() => setDismissedRowId((id) => (id === row.id ? null : id))}'),
    'nothing clears the dismissal when the pointer leaves the bar',
  )
  // Escape must not bubble past the card it dismissed.
  assert.ok(SRC.includes('e.stopPropagation()'), 'Escape is not stopped at the bar')
})

test('the dismissed row suppresses only its own card', () => {
  assert.ok(
    SRC.includes("${dismissedRowId === row.id ? '' : 'group-hover:opacity-100 group-has-[:focus-visible]:opacity-100'}"),
    'the reveal is not gated on the dismissed row, so Escape either hides every card or none',
  )
})

test('the chevron has a name that survives its icon being hidden', () => {
  // lucide-react marks its own SVGs aria-hidden, so an icon-only button here has
  // an EMPTY accessible name unless one is supplied.
  assert.ok(
    SRC.includes('aria-expanded={isGanttRowExpanded(row)}'),
    'the chevron does not expose its expanded state (1.3.1)',
  )
  assert.ok(
    SRC.includes("aria-label={`Sub-items of ${row.code ? row.code + ' ' : ''}${row.name}`}"),
    'the chevron has no accessible name (4.1.2) — it announces as "button"',
  )
  // The name must not change on toggle: aria-expanded carries the state, and a
  // name that churns underneath the user is re-announced mid-interaction.
  assert.ok(
    !/aria-label=\{`\$\{isGanttRowExpanded\(row\) \? 'Collapse' : 'Expand'/.test(SRC),
    'the chevron name changes with its state instead of leaving that to aria-expanded',
  )
})

test('the critical path is marked for forced colours, and the rule exists', () => {
  assert.ok(
    SRC.includes("data-critical={isCritical ? 'true' : undefined}"),
    'the bar does not mark the critical path for the forced-colours rule',
  )
  assert.ok(
    /@media \(forced-colors: active\)[\s\S]*?\[data-gantt-bar\]\[data-critical='true'\][\s\S]*?outline: 2px dashed CanvasText/.test(CSS),
    'index.css has no forced-colours rule distinguishing the critical path',
  )
  // Solid is the focus indicator. Reusing it for the critical path rebuilds the
  // collision the dashed stroke exists to remove.
  assert.ok(
    !/\[data-critical='true'\][\s\S]{0,120}outline: 2px solid/.test(CSS),
    'the critical path draws a solid outline, which is what focus already uses',
  )
})
