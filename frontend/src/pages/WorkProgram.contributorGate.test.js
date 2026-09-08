import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// FR-007's SINGLE-DEFINITION CLAUSE, held structurally.
//
// ganttA11y.test.js proves canSeeContributor is correct. It cannot prove
// WorkProgram.jsx *uses* it — a perfect allowlist consumed at four sites out of
// five leaks at the fifth, and every unit test still passes. This file is the
// assertion that the shipping component asks the right question.
//
// What it proves: the source text wires the gate. What it does NOT prove: that
// the rendered output withholds the field at runtime. That needs the app and a
// real session, and it is in C7's manual matrix. Recorded rather than implied,
// per contracts/ui-contracts.md Contract 4.
//
// Path resolved relative to this file, not to cwd, so `npm test` behaves the
// same from the repo root and from frontend/.
const SRC = readFileSync(fileURLToPath(new URL('./WorkProgram.jsx', import.meta.url)), 'utf8')
const SRC_LINES = SRC.split(/\r?\n/)

test('WorkProgram imports the gate rather than reimplementing it', () => {
  // Matches canSeeContributor anywhere in the named-import list, not a single
  // exact import line. The first form broke the moment C3 imported
  // buildGanttBarLabel alongside it -- a true failure report for a change that
  // satisfied the requirement completely. An assertion that fires on a sibling
  // import is measuring formatting, not wiring.
  const ganttA11yImport = SRC_LINES.find(
    (line) => line.startsWith('import') && line.includes("from '@/lib/ganttA11y'"),
  )
  assert.ok(
    ganttA11yImport,
    'WorkProgram.jsx imports nothing from @/lib/ganttA11y -- the tested gate is not the one that ships',
  )
  assert.ok(
    ganttA11yImport.includes('canSeeContributor'),
    `canSeeContributor is not among WorkProgram's ganttA11y imports: ${ganttA11yImport}`,
  )
  assert.match(
    SRC,
    /const showContributor = canSeeContributor\(userRole\)/,
    'showContributor is not derived from canSeeContributor(userRole)',
  )
})

// The five sites move together or not at all. Gate the three that DISPLAY data
// on the allowlist and leave the two column spans on `isClient`, and a viewer
// whose role has not resolved gets the contributor correctly hidden and a
// col-span-5 gap where it used to be — a fix that looks like a bug.
const REQUIRED = [
  ["{showContributor && <div className=\"col-span-2\">Contributor</div>}", 1, 'header Contributor column'],
  ["showContributor ? 'col-span-5' : 'col-span-7'", 2, 'both task-name column spans'],
]

for (const [needle, times, what] of REQUIRED) {
  test(`the gate is consumed at: ${what}`, () => {
    const n = SRC.split(needle).length - 1
    assert.equal(n, times, `expected ${times} occurrence(s) of ${needle}, found ${n}`)
  })
}

const FORBIDDEN = [
  ["{!isClient && <div className=\"col-span-2\">Contributor</div>}", 'the header Contributor column is gated on the denylist again'],
  ["isClient ? 'col-span-7' : 'col-span-5'", 'a task-name column span is gated on the denylist again'],
]

for (const [needle, why] of FORBIDDEN) {
  test(`the denylist has not returned: ${why}`, () => {
    assert.ok(!SRC.includes(needle), `${why} — found ${needle}`)
  })
}

test('the Gantt contributor cell and hover-card row are gated on the allowlist', () => {
  // Both are multi-line JSX blocks, so the guard is asserted against the line
  // that immediately precedes the field rather than against the field's line.
  const lines = SRC.split('\n')
  for (const [i, line] of lines.entries()) {
    if (!/\{row\.responsible\}/.test(line)) continue
    const window = lines.slice(Math.max(0, i - 4), i).join('\n')
    assert.ok(
      !/\{!isClient &&/.test(window),
      `a Gantt contributor field near line ${i + 1} is still guarded by !isClient`,
    )
  }
})

// A two-sided ratchet, same shape as verify-contrast.py's palette-literal rows.
// `isClient` legitimately survives in the List view, taskboard routing and the
// client-visibility filters — all outside 024's scope and filed rather than
// fixed in passing. What must not happen is the count GROWING, which is how a
// sixth hand-rolled role check appears in a file this size without anyone
// noticing.
const ISCLIENT_BASELINE = 12

test('the hand-rolled role check does not spread', () => {
  const n = SRC.split('isClient').length - 1
  assert.ok(
    n <= ISCLIENT_BASELINE,
    `isClient occurrences rose to ${n} (baseline ${ISCLIENT_BASELINE}). A new hand-rolled role check entered the file; use canSeeContributor, or move the baseline deliberately.`,
  )
  assert.ok(
    n >= ISCLIENT_BASELINE,
    `isClient occurrences fell to ${n} (baseline ${ISCLIENT_BASELINE}). Good — lower ISCLIENT_BASELINE to ${n} in the same commit, or the ceiling stops guarding the new floor.`,
  )
})
