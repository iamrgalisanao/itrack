import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'

// SC-010: no interface text may describe the system as a mock, a prototype or a
// scaffold. The app has used real Sanctum session auth since feature 001; copy
// saying otherwise is not merely stale, it tells an administrator that the
// access controls they are configuring are pretend.
//
// A GREP IS NOT A MECHANISM. T069 says the sweep "is the difference between
// fixing an instance and satisfying the criterion" — and a one-time search
// satisfies neither the day after it is run. This is the difference.
//
// Comments are excluded: SC-010 governs interface text, and a comment
// explaining why a word is banned would otherwise trip the ban. That exclusion
// is also why this file strips comments properly rather than matching lines —
// three assertions in this repo have now fired on their own prose.

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url))
const BANNED = /(mock|prototype|scaffold)/i

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.(jsx|js)$/.test(entry.name)) return []
    if (entry.name.endsWith('.test.js')) return []
    return [full]
  })
}

function stripComments(src) {
  // Newlines preserved so reported line numbers stay true.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + '')
}

test('no interface text calls the system a mock, prototype or scaffold', () => {
  const offenders = []
  for (const file of sourceFiles(SRC_DIR)) {
    const lines = stripComments(readFileSync(file, 'utf8')).split(/\r?\n/)
    lines.forEach((line, i) => {
      if (BANNED.test(line)) {
        offenders.push(`${relative(SRC_DIR, file).split(sep).join('/')}:${i + 1}  ${line.trim().slice(0, 90)}`)
      }
    })
  }
  assert.deepEqual(
    offenders,
    [],
    `interface text describes the system as unreal:\n  ${offenders.join('\n  ')}`,
  )
})

test('the sweep can actually see a violation', () => {
  // Otherwise the assertion above is indistinguishable from one that scans
  // nothing — which is how a suite ends up green over an empty file list.
  assert.ok(sourceFiles(SRC_DIR).length > 20, 'the file sweep found almost nothing to scan')
  assert.ok(BANNED.test('operates in Mock Auth Mode'), 'the pattern does not match the copy it was written for')
  assert.ok(!BANNED.test('grants are scoped to a role within a department'), 'the pattern matches the replacement copy')
})

test('comments are excluded, but only comments', () => {
  const stripped = stripComments([
    "// a comment mentioning mock",
    "const url = 'https://example.com/a'",
    "const copy = 'this is a prototype'",
  ].join('\n')).split('\n')
  assert.ok(!BANNED.test(stripped[0]), 'a comment was not stripped')
  assert.equal(stripped[1].includes('https://example.com/a'), true, 'a URL was mistaken for a comment')
  assert.ok(BANNED.test(stripped[2]), 'a real string literal was stripped along with the comments')
})
