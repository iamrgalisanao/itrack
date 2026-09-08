import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Contract 1's STRUCTURE, held at the source. The runtime half — focusability,
// tab order, activation, the computed focus indicator — is
// scripts/uichecks/gantt_keyboard.py, and the assistive-technology half is the
// manual matrix. Three different questions, three different instruments, and
// this file must not be cited for the other two (Contract 4).
const SRC = readFileSync(fileURLToPath(new URL('./WorkProgram.jsx', import.meta.url)), 'utf8')
const LINES = SRC.split(/\r?\n/)

const barButtonIndex = LINES.findIndex((l) => l.includes('aria-label={buildGanttBarLabel(row)}'))

// The opening tag the aria-label belongs to, and the whole attribute list up to
// the `>` that ends it. Anchored rather than windowed: a fixed lookback breaks
// the moment a comment is added between two attributes, which is a true report
// of nothing at all.
const barTagStart = LINES.slice(0, barButtonIndex).map((l, i) => [i, l])
  .reverse().find(([, l]) => l.trimStart().startsWith('<'))?.[0] ?? -1
const barTagEnd = LINES.findIndex((l, i) => i >= barButtonIndex && l.trimEnd().endsWith('>') && !l.trimEnd().endsWith('/>'))
const BAR_TAG = LINES.slice(barTagStart, barTagEnd + 1).join('\n')

test('the timeline bar is a real button, named by the tested formatter', () => {
  assert.notEqual(
    barButtonIndex,
    -1,
    'no element carries aria-label={buildGanttBarLabel(row)} — the bar has no accessible name, or it is built somewhere other than the tested formatter',
  )
  // The element opening this attribute belongs to must be a <button>. Walking
  // back to the tag is what stops the assertion passing on a div that merely
  // sprouted an aria-label — which announces a name and still cannot be reached.
  assert.ok(
    LINES[barTagStart].includes('<button'),
    `the named timeline element is not a <button>: ${LINES[barTagStart].trim()}`,
  )
  assert.ok(
    BAR_TAG.includes('type="button"'),
    'the timeline bar button has no explicit type="button"',
  )
})

test('the hover card is a SIBLING of the button, never a descendant', () => {
  // The card is a field grid. Inside a <button> it is invalid content, and the
  // accessible-name computation swallows it — the bar would announce its own
  // detail card. This is why the div could not simply be given a role.
  const closeButton = LINES.findIndex((l, i) => i > barButtonIndex && l.includes('</button>'))
  const cardOpen = LINES.findIndex((l, i) => i > barButtonIndex && l.includes('group-hover:opacity-100'))
  assert.notEqual(closeButton, -1, 'the bar button is never closed')
  assert.notEqual(cardOpen, -1, 'the hover card was not found after the bar button')
  assert.ok(
    closeButton < cardOpen,
    `the hover card (line ${cardOpen + 1}) is inside the button, which closes at line ${closeButton + 1}`,
  )
})

test('the wrapper is not a second activation path', () => {
  // Both a focusable wrapper and a focusable button means two tab stops per bar
  // and two things announcing the same task.
  const wrapperOpen = LINES.slice(0, barButtonIndex).reverse().findIndex((l) => l.includes('className="absolute h-6 group"'))
  assert.notEqual(wrapperOpen, -1, 'the non-focusable positioning wrapper is gone')
  const start = barButtonIndex - wrapperOpen - 1
  const wrapper = LINES.slice(start, barButtonIndex).join('\n')
  assert.ok(!wrapper.includes('onClick'), 'the positioning wrapper carries an onClick')
  assert.ok(!wrapper.includes('tabIndex'), 'the positioning wrapper carries a tabIndex')
})

test('focus is indicated with outline, not ring', () => {
  // The className VALUE, not the tag text. Asserting over the tag matched the
  // comment inside it — the one explaining why a ring is wrong — so the check
  // failed on prose describing the correct decision. Same defect the
  // verify-contrast.py header already records: "a name grep fires on a comment".
  const button = LINES.slice(barTagStart, barTagEnd + 1)
    .find((l) => l.trimStart().startsWith('className='))
  assert.ok(button, 'the timeline bar button has no className')
  assert.ok(
    button.includes('focus-visible:outline-2'),
    'the timeline bar has no focus-visible outline',
  )
  // Tailwind v4's ring is a box-shadow. It is lost against the busy timeline
  // grid, and forced-colors mode sets box-shadow: none outright — leaving no
  // focus indicator at all in Windows High Contrast, which is precisely the
  // population the outline exists for.
  assert.ok(
    !button.includes('ring-2'),
    'the timeline bar indicates focus with a ring; forced-colors erases box-shadow',
  )
  assert.ok(
    !button.includes('outline-none'),
    'the timeline bar sets outline-none',
  )
  assert.ok(
    button.includes('scroll-mt-'),
    'the timeline bar has no scroll-margin; tabbing to an off-screen bar puts it under the sticky header (2.4.11)',
  )
})

test('no positive tabIndex anywhere in the file', () => {
  // A positive tabIndex reorders the whole document, not just this component.
  const offenders = LINES
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /tabIndex=\{[1-9]/.test(l))
  assert.deepEqual(offenders, [], `positive tabIndex found: ${JSON.stringify(offenders)}`)
})

test('the timeline is a labelled landmark', () => {
  assert.ok(
    SRC.includes('aria-label="Project timeline"'),
    'the timeline pane is not a labelled landmark — a 50-row timeline is 50 tab stops to traverse before anything after it',
  )
  assert.ok(SRC.includes('</section>'), 'the landmark is never closed')
})

test('the status vocabulary is imported, not redefined', () => {
  // C1 put getGanttStatusLabel in lib/ganttA11y.js and for one increment there
  // were TWO copies — exactly the fifth-vocabulary outcome the extraction was
  // meant to prevent. The visible badge and the bar's accessible name must read
  // the same function or they will drift into disagreeing about a status.
  assert.ok(
    !SRC.includes('const getGanttStatusLabel ='),
    'WorkProgram defines its own getGanttStatusLabel again; import it from @/lib/ganttA11y',
  )
  const importLine = LINES.find(
    (l) => l.startsWith('import') && l.includes("from '@/lib/ganttA11y'"),
  )
  assert.ok(importLine, 'nothing is imported from @/lib/ganttA11y')
  assert.ok(
    importLine.includes('getGanttStatusLabel'),
    `getGanttStatusLabel is not imported: ${importLine}`,
  )
  assert.ok(
    importLine.includes('buildGanttBarLabel'),
    `buildGanttBarLabel is not imported: ${importLine}`,
  )
})
