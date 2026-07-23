import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  renderMessageTemplate,
  MESSAGE_TEMPLATE_STAGES,
  renderFreeformPrefill,
  parseIntakeDescription,
  renderTroubleshootingPacket,
} from './supportTemplates.js'

const CLIENT = 'Acme Corp'
const TITLE = 'Checkout screen freezing'

// Full-data literal expectations for all seven stages, transcribed
// independently from data-model.md's canonical wording table (not derived
// from the renderer itself, so this actually tests correctness).
const EXPECTED = {
  acknowledgement: {
    clientAndTitle: `Hi ${CLIENT}, we've received your report regarding "${TITLE}" and are looking into it.`,
    clientOnly: `Hi ${CLIENT}, we've received your report regarding your reported issue and are looking into it.`,
    titleOnly: `Hi, we've received your report regarding "${TITLE}" and are looking into it.`,
    neither: `Hi, we've received your report regarding your reported issue and are looking into it.`,
  },
  intake_request: {
    clientAndTitle: `Hi ${CLIENT}, to help us investigate "${TITLE}" faster, could you share any additional details or screenshots when you have a moment?`,
    clientOnly: `Hi ${CLIENT}, to help us investigate your reported issue faster, could you share any additional details or screenshots when you have a moment?`,
    titleOnly: `Hi, to help us investigate "${TITLE}" faster, could you share any additional details or screenshots when you have a moment?`,
    neither: `Hi, to help us investigate your reported issue faster, could you share any additional details or screenshots when you have a moment?`,
  },
  investigation_started: {
    clientAndTitle: `Hi ${CLIENT}, we've started investigating "${TITLE}". We'll update you as soon as we know more.`,
    clientOnly: `Hi ${CLIENT}, we've started investigating your reported issue. We'll update you as soon as we know more.`,
    titleOnly: `Hi, we've started investigating "${TITLE}". We'll update you as soon as we know more.`,
    neither: `Hi, we've started investigating your reported issue. We'll update you as soon as we know more.`,
  },
  progress_update: {
    clientAndTitle: `Hi ${CLIENT}, quick update on "${TITLE}" — we're still working on it and will follow up with next steps soon.`,
    clientOnly: `Hi ${CLIENT}, quick update on your reported issue — we're still working on it and will follow up with next steps soon.`,
    titleOnly: `Hi, quick update on "${TITLE}" — we're still working on it and will follow up with next steps soon.`,
    neither: `Hi, quick update on your reported issue — we're still working on it and will follow up with next steps soon.`,
  },
  waiting_for_client: {
    clientAndTitle: `Hi ${CLIENT}, we're currently waiting on some information from your side to continue investigating "${TITLE}". Let us know when you're able to share it.`,
    clientOnly: `Hi ${CLIENT}, we're currently waiting on some information from your side to continue investigating your reported issue. Let us know when you're able to share it.`,
    titleOnly: `Hi, we're currently waiting on some information from your side to continue investigating "${TITLE}". Let us know when you're able to share it.`,
    neither: `Hi, we're currently waiting on some information from your side to continue investigating your reported issue. Let us know when you're able to share it.`,
  },
  root_cause_found: {
    clientAndTitle: `Hi ${CLIENT}, we've identified the cause of "${TITLE}" and are working on a fix.`,
    clientOnly: `Hi ${CLIENT}, we've identified the cause of your reported issue and are working on a fix.`,
    titleOnly: `Hi, we've identified the cause of "${TITLE}" and are working on a fix.`,
    neither: `Hi, we've identified the cause of your reported issue and are working on a fix.`,
  },
  resolved: {
    clientAndTitle: `Hi ${CLIENT}, "${TITLE}" has been resolved. Please let us know if you run into it again.`,
    clientOnly: `Hi ${CLIENT}, your reported issue has been resolved. Please let us know if you run into it again.`,
    titleOnly: `Hi, "${TITLE}" has been resolved. Please let us know if you run into it again.`,
    neither: `Hi, your reported issue has been resolved. Please let us know if you run into it again.`,
  },
}

test('MESSAGE_TEMPLATE_STAGES lists exactly the seven expected stage keys, in order', () => {
  assert.deepEqual(
    MESSAGE_TEMPLATE_STAGES.map((s) => s.key),
    [
      'acknowledgement',
      'intake_request',
      'investigation_started',
      'progress_update',
      'waiting_for_client',
      'root_cause_found',
      'resolved',
    ]
  )
})

for (const stage of Object.keys(EXPECTED)) {
  test(`renderMessageTemplate(${stage}): client name + title both present`, () => {
    assert.equal(
      renderMessageTemplate(stage, { client_name: CLIENT, name: TITLE }),
      EXPECTED[stage].clientAndTitle
    )
  })

  test(`renderMessageTemplate(${stage}): client name present, title absent`, () => {
    assert.equal(
      renderMessageTemplate(stage, { client_name: CLIENT, name: '' }),
      EXPECTED[stage].clientOnly
    )
  })

  test(`renderMessageTemplate(${stage}): client name absent, title present`, () => {
    assert.equal(
      renderMessageTemplate(stage, { client_name: '', name: TITLE }),
      EXPECTED[stage].titleOnly
    )
  })

  test(`renderMessageTemplate(${stage}): client name and title both absent`, () => {
    assert.equal(
      renderMessageTemplate(stage, { client_name: '', name: '' }),
      EXPECTED[stage].neither
    )
  })

  test(`renderMessageTemplate(${stage}): never contains "undefined", "null", or a messaging-provider name`, () => {
    for (const variant of Object.values(EXPECTED[stage])) {
      assert.doesNotMatch(variant, /undefined|null/i)
      for (const provider of ['Viber', 'WhatsApp', 'Messenger', 'Slack', 'Teams', 'SMS', 'email']) {
        assert.doesNotMatch(variant, new RegExp(provider, 'i'))
      }
    }
  })
}

test('renderMessageTemplate throws on an unknown stage key', () => {
  assert.throws(() => renderMessageTemplate('not_a_real_stage', { client_name: CLIENT, name: TITLE }))
})

// ─── renderFreeformPrefill (US3) ────────────────────────────────────────────

test('renderFreeformPrefill: client name and title both present', () => {
  assert.equal(
    renderFreeformPrefill({ client_name: CLIENT, name: TITLE }),
    `Hi ${CLIENT}, regarding "${TITLE}": `
  )
})

test('renderFreeformPrefill: client name present, title absent', () => {
  assert.equal(
    renderFreeformPrefill({ client_name: CLIENT, name: '' }),
    `Hi ${CLIENT}, regarding your reported issue: `
  )
})

test('renderFreeformPrefill: client name absent, title present', () => {
  assert.equal(
    renderFreeformPrefill({ client_name: '', name: TITLE }),
    `Hi, regarding "${TITLE}": `
  )
})

test('renderFreeformPrefill: client name and title both absent', () => {
  assert.equal(
    renderFreeformPrefill({ client_name: '', name: '' }),
    'Hi, regarding your reported issue: '
  )
})

test('renderFreeformPrefill: called with no arguments does not throw', () => {
  assert.equal(renderFreeformPrefill(), 'Hi, regarding your reported issue: ')
})

// ─── parseIntakeDescription (US2) ───────────────────────────────────────────

const STRUCTURED_DESCRIPTION = [
  'Timestamp: 2026-07-23 09:15',
  'Area/workflow affected: Checkout screen',
  'Expected: Order confirms and prints a receipt',
  'Actual: Screen freezes, no confirmation shown',
].join('\n')

test('parseIntakeDescription: fully structured description parses all four fields', () => {
  assert.deepEqual(parseIntakeDescription(STRUCTURED_DESCRIPTION), {
    timestamp: '2026-07-23 09:15',
    areaAffected: 'Checkout screen',
    expected: 'Order confirms and prints a receipt',
    actual: 'Screen freezes, no confirmation shown',
  })
})

test('parseIntakeDescription: labels are recognized case-insensitively', () => {
  const description = [
    'TIMESTAMP: 2026-07-23 09:15',
    'area/workflow affected: Checkout screen',
    'Expected: Order confirms',
    'ACTUAL: Screen freezes',
  ].join('\n')

  const result = parseIntakeDescription(description)
  assert.equal(result.timestamp, '2026-07-23 09:15')
  assert.equal(result.areaAffected, 'Checkout screen')
  assert.equal(result.expected, 'Order confirms')
  assert.equal(result.actual, 'Screen freezes')
})

test('parseIntakeDescription: a missing label yields undefined for that field only', () => {
  const description = ['Expected: Order confirms', 'Actual: Screen freezes'].join('\n')
  const result = parseIntakeDescription(description)
  assert.equal(result.timestamp, undefined)
  assert.equal(result.areaAffected, undefined)
  assert.equal(result.expected, 'Order confirms')
  assert.equal(result.actual, 'Screen freezes')
})

test('parseIntakeDescription: fully unstructured prose yields all four undefined, never dumped raw', () => {
  const description = 'The client called in a panic, nothing about this matches the intake format at all.'
  const result = parseIntakeDescription(description)
  assert.deepEqual(result, { timestamp: undefined, areaAffected: undefined, expected: undefined, actual: undefined })
})

test('parseIntakeDescription: null/empty description yields all four undefined without throwing', () => {
  for (const input of [null, undefined, '']) {
    assert.deepEqual(parseIntakeDescription(input), {
      timestamp: undefined,
      areaAffected: undefined,
      expected: undefined,
      actual: undefined,
    })
  }
})

test('parseIntakeDescription: multi-line values continue until the next label', () => {
  const description = [
    'Expected: Order confirms',
    'and prints a receipt with the correct total',
    'Actual: Screen freezes',
  ].join('\n')

  const result = parseIntakeDescription(description)
  assert.equal(result.expected, 'Order confirms\nand prints a receipt with the correct total')
  assert.equal(result.actual, 'Screen freezes')
})

test('parseIntakeDescription: a duplicated label uses only the first occurrence', () => {
  const description = ['Expected: first value', 'Expected: second value'].join('\n')
  const result = parseIntakeDescription(description)
  // The first value's span ends right where the second `Expected:` label
  // starts (per "continues until the next recognized label") — the second
  // occurrence is never merged into the first value, and never overwrites it.
  assert.equal(result.expected, 'first value')
})

test('parseIntakeDescription: an empty-after-trim label value is treated as not present', () => {
  const description = ['Expected:   ', 'Actual: Screen freezes'].join('\n')
  const result = parseIntakeDescription(description)
  assert.equal(result.expected, undefined)
  assert.equal(result.actual, 'Screen freezes')
})

// ─── renderTroubleshootingPacket (US2) ──────────────────────────────────────

const FULL_ISSUE = {
  client_name: 'Globex Corp',
  tenant_name: 'Branch 7',
  name: 'Checkout screen freezing for a client',
  description: STRUCTURED_DESCRIPTION,
  evidence: 'Screenshot attached in comment #1',
  root_cause: 'Race condition in the payment webhook handler',
  created_at: '2026-07-20T00:00:00+00:00',
}

test('renderTroubleshootingPacket: full-data mapping matches data-model.md exactly', () => {
  const packet = renderTroubleshootingPacket(FULL_ISSUE)

  assert.match(packet, /^Client issue: Checkout screen freezing for a client$/m)
  assert.match(packet, /^Tenant: Branch 7$/m)
  assert.match(packet, /^Provider\/client: Globex Corp$/m)
  assert.match(packet, /^Timestamp: 2026-07-23 09:15$/m)
  assert.match(packet, /^Endpoint or workflow: Checkout screen$/m)
  assert.match(packet, /^Expected behavior: Order confirms and prints a receipt$/m)
  assert.match(packet, /^Actual behavior: Screen freezes, no confirmation shown$/m)
  assert.match(packet, /^Screenshots\/log snippets: Screenshot attached in comment #1$/m)
  assert.match(packet, /^Please inspect the project and identify:$/m)
  assert.match(packet, /^1\. Likely cause$/m)
  assert.match(packet, /^Suspected root cause so far: Race condition in the payment webhook handler$/m)
})

test('renderTroubleshootingPacket: untracked fields render as labeled blanks, never omitted or fabricated', () => {
  const packet = renderTroubleshootingPacket({
    client_name: 'Globex Corp',
    tenant_name: 'Branch 7',
    name: 'Some issue',
    description: null,
    evidence: null,
    root_cause: null,
    created_at: '2026-07-20T00:00:00+00:00',
  })

  assert.match(packet, /^Environment:$/m)
  assert.match(packet, /^Request payload\/sample:$/m)
  assert.match(packet, /^Error message:$/m)
  assert.match(packet, /^Endpoint or workflow:$/m)
  assert.match(packet, /^Expected behavior:$/m)
  assert.match(packet, /^Actual behavior:$/m)
  assert.match(packet, /^Screenshots\/log snippets:$/m)
})

test('renderTroubleshootingPacket: Timestamp falls back to created_at when not parsed from description', () => {
  const packet = renderTroubleshootingPacket({
    name: 'Some issue',
    description: 'unstructured prose with no labels at all',
    created_at: '2026-07-20T00:00:00+00:00',
  })

  const expectedFallback = new Date('2026-07-20T00:00:00+00:00').toLocaleString()
  assert.match(packet, new RegExp(`^Timestamp: ${expectedFallback.replace(/[/,]/g, '\\$&')}$`, 'm'))
  assert.doesNotMatch(packet, /unstructured prose with no labels at all/)
})

test('renderTroubleshootingPacket: root_cause addendum is present when non-empty, entirely absent when empty', () => {
  const withRootCause = renderTroubleshootingPacket({ ...FULL_ISSUE, root_cause: 'Confirmed cause' })
  assert.match(withRootCause, /^Suspected root cause so far: Confirmed cause$/m)

  for (const rootCause of [null, undefined, '', '   ']) {
    const withoutRootCause = renderTroubleshootingPacket({ ...FULL_ISSUE, root_cause: rootCause })
    assert.doesNotMatch(withoutRootCause, /Suspected root cause so far/)
  }
})

test('renderTroubleshootingPacket: unstructured description never blocks generation or dumps raw text', () => {
  const packet = renderTroubleshootingPacket({
    ...FULL_ISSUE,
    description: 'Endpoint/workflow: workflow\nExpected: te\nActual: te', // real malformed fixture (issue #73)
  })

  // 'Endpoint/workflow:' doesn't match the recognized 'Area/workflow affected:' label,
  // so areaAffected must stay blank — the malformed label is never partially matched.
  assert.match(packet, /^Endpoint or workflow:$/m)
  assert.match(packet, /^Expected behavior: te$/m)
  assert.match(packet, /^Actual behavior: te$/m)
})
