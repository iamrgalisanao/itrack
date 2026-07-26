// Support Ops Phase 2 — client message templates, freeform composer pre-fill,
// and troubleshooting packet rendering (003-templates-prompt-generator).
// Pure functions only, no React — see specs/003-templates-prompt-generator/
// data-model.md for the canonical wording/mapping tables these implement.

// ─── Shared helpers ─────────────────────────────────────────────────────────

/**
 * "Hi {client_name}, " when present, "Hi, " when absent — FR-002's
 * client-name-absent wording rule, shared by every client-facing artifact.
 */
function greeting(clientName) {
  return clientName ? `Hi ${clientName}, ` : 'Hi, '
}

/**
 * `"issue title"` when the title is present, `your reported issue` (no
 * quotes) when absent — data-model.md's missing-title substitution rule.
 */
function titlePhrase(name) {
  return name ? `"${name}"` : 'your reported issue'
}

// ─── Message Templates (US1, FR-001/FR-002) ────────────────────────────────

export const MESSAGE_TEMPLATE_STAGES = [
  { key: 'acknowledgement', label: 'Acknowledgement' },
  { key: 'intake_request', label: 'Intake request' },
  { key: 'investigation_started', label: 'Investigation started' },
  { key: 'progress_update', label: 'Progress update' },
  { key: 'waiting_for_client', label: 'Waiting for client' },
  { key: 'root_cause_found', label: 'Root cause found' },
  { key: 'resolved', label: 'Resolved' },
]

const MESSAGE_TEMPLATE_RENDERERS = {
  acknowledgement: (clientName, name) =>
    `${greeting(clientName)}we've received your report regarding ${titlePhrase(name)} and are looking into it.`,
  intake_request: (clientName, name) =>
    `${greeting(clientName)}to help us investigate ${titlePhrase(name)} faster, could you share any additional details or screenshots when you have a moment?`,
  investigation_started: (clientName, name) =>
    `${greeting(clientName)}we've started investigating ${titlePhrase(name)}. We'll update you as soon as we know more.`,
  progress_update: (clientName, name) =>
    `${greeting(clientName)}quick update on ${titlePhrase(name)} — we're still working on it and will follow up with next steps soon.`,
  waiting_for_client: (clientName, name) =>
    `${greeting(clientName)}we're currently waiting on some information from your side to continue investigating ${titlePhrase(name)}. Let us know when you're able to share it.`,
  root_cause_found: (clientName, name) =>
    `${greeting(clientName)}we've identified the cause of ${titlePhrase(name)} and are working on a fix.`,
  resolved: (clientName, name) =>
    `${greeting(clientName)}${titlePhrase(name)} has been resolved. Please let us know if you run into it again.`,
}

/**
 * Renders one of the seven fixed Message Template stages. Deliberately
 * accepts only `client_name`/`name` — `tenant_name`, `evidence`,
 * `root_cause`, `resolution`, and `next_action` are structurally excluded
 * (FR-002), not filtered out after the fact.
 */
export function renderMessageTemplate(stage, { client_name, name } = {}) {
  const renderer = MESSAGE_TEMPLATE_RENDERERS[stage]
  if (!renderer) {
    throw new Error(`Unknown message template stage: ${stage}`)
  }
  return renderer(client_name, name)
}

// ─── Freeform Composer (US3, FR-005/FR-014) ────────────────────────────────

/**
 * Pre-fill for the freeform client-update composer — same client-name/
 * title present-or-absent substitution rules as the fixed templates
 * (data-model.md's "Freeform Composer" section), with an empty body for
 * the user to continue typing. Never persisted by this function or its
 * caller — FR-014 requires a fresh pre-fill every time the composer opens.
 */
export function renderFreeformPrefill({ client_name, name } = {}) {
  return `${greeting(client_name)}regarding ${titlePhrase(name)}: `
}

// ─── Description parsing grammar (US2, shared by the packet) ───────────────

// Recognizes the four labels SupportOpsController::composeDescription()
// writes, case-insensitively, only at the start of a line (leading
// whitespace ignored). Named capture groups identify which label matched
// without any fragile string round-tripping.
const DESCRIPTION_LABEL_REGEX =
  /^[ \t]*(?:(?<timestamp>Timestamp)|(?<areaAffected>Area\/workflow affected)|(?<expected>Expected)|(?<actual>Actual)):/gim

/**
 * Parses the four intake-time labels out of a Support Ops issue's
 * `description` per data-model.md's parsing grammar: case-insensitive,
 * line-start only, multi-line values continue until the next recognized
 * label or end of string, a missing/empty-after-trim label yields no value
 * (never fabricated), unstructured prose yields all four undefined, and a
 * duplicated label uses only its first occurrence. Read-only and
 * idempotent — never mutates `description`.
 */
export function parseIntakeDescription(description) {
  const result = { timestamp: undefined, areaAffected: undefined, expected: undefined, actual: undefined }
  if (!description) return result

  const matches = [...description.matchAll(DESCRIPTION_LABEL_REGEX)]

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const key = Object.keys(match.groups).find((k) => match.groups[k] !== undefined)
    const valueStart = match.index + match[0].length
    const valueEnd = i + 1 < matches.length ? matches[i + 1].index : description.length
    const value = description.slice(valueStart, valueEnd).trim()

    if (value !== '' && result[key] === undefined) {
      result[key] = value
    }
  }

  return result
}

// ─── Troubleshooting Packet (US2, FR-006/FR-007) ───────────────────────────

const TROUBLESHOOTING_PACKET_FOOTER = [
  '',
  'Please inspect the project and identify:',
  '1. Likely cause',
  '2. Files or modules involved',
  '3. Database/config areas to check',
  '4. Safe fix or workaround',
  '5. Client-facing explanation',
  '6. Tests or verification steps',
]

function packetLine(label, value) {
  return value ? `${label}: ${value}` : `${label}:`
}

/**
 * Falls back to `created_at` (formatted the same way this app already
 * formats timestamps elsewhere — `Admin.jsx`'s audit log display,
 * `SupportOps.jsx`'s `last_client_update_at` display, `Reports.jsx`'s
 * `generated_at` display) only when the intake `Timestamp:` label wasn't
 * present/parseable — see data-model.md's Timestamp fallback rule.
 */
function resolvePacketTimestamp(parsedTimestamp, createdAt) {
  if (parsedTimestamp) return parsedTimestamp
  return createdAt ? new Date(createdAt).toLocaleString() : ''
}

/**
 * Renders the fixed troubleshooting-packet prompt per data-model.md's
 * mapping table. Unlike a Message Template, this reads internal-only
 * fields (`evidence`, the parsed technical detail, optionally
 * `root_cause`) — that's the point of a technical handoff prompt.
 */
export function renderTroubleshootingPacket({
  client_name,
  tenant_name,
  name,
  description,
  evidence,
  root_cause,
  created_at,
} = {}) {
  const parsed = parseIntakeDescription(description)

  const lines = [
    packetLine('Client issue', name),
    packetLine('Tenant', tenant_name),
    packetLine('Provider/client', client_name),
    packetLine('Timestamp', resolvePacketTimestamp(parsed.timestamp, created_at)),
    packetLine('Environment', undefined),
    packetLine('Endpoint or workflow', parsed.areaAffected),
    packetLine('Request payload/sample', undefined),
    packetLine('Error message', undefined),
    packetLine('Expected behavior', parsed.expected),
    packetLine('Actual behavior', parsed.actual),
    packetLine('Screenshots/log snippets', evidence),
    ...TROUBLESHOOTING_PACKET_FOOTER,
  ]

  const trimmedRootCause = root_cause ? root_cause.trim() : ''
  if (trimmedRootCause !== '') {
    lines.push('', `Suspected root cause so far: ${trimmedRootCause}`)
  }

  return lines.join('\n')
}

/**
 * True if any of `fields` differs between the modal's in-progress `form`
 * and the last-saved `issue` — used only to show a "you have unsaved
 * edits" hint before generating a copy-only artifact (FR-016's read source
 * itself is always `selectedIssue`, never `form`; this check never changes
 * what gets generated, only whether a warning is shown before the user
 * clicks Generate). Shared by all three copy-only generators —
 * SupportIssueExtraFields.jsx's Client Message Templates/Freeform Client
 * Update, and ResolutionExtraFields.jsx's Troubleshooting Packet
 * (010-task-detail-tabs) — via SupportGeneratorPanel.jsx.
 */
export function hasUnsavedFieldChange(form, issue, fields) {
  if (!form || !issue) return false
  return fields.some((field) => (form[field] || '') !== (issue[field] || ''))
}

/**
 * True if `value` is a non-blank string — blank means empty, unset, or
 * whitespace-only after trimming. Shared, single definition of "filled in"
 * for 010-task-detail-tabs' completion indicators (SupportIssueExtraFields.jsx's
 * `getSupportCompletion`, ResolutionExtraFields.jsx's `getResolutionCompletion`,
 * TaskDetailModal.jsx's save-time missing-fields summary) — deliberately the
 * same trim-based rule 009-support-ops-knowledge-base's backend inclusion
 * rule already uses (`TRIM(root_cause) != ''`), so a tab label can never say
 * "complete" for an issue 009's knowledge base would still treat as missing
 * that information.
 */
export function isFilled(value) {
  return typeof value === 'string' && value.trim() !== ''
}

// 010-task-detail-tabs: required-field sets, reusing rules this app already
// has rather than inventing new ones. Support: the exact two fields
// SupportOpsController::store()'s intake validation already requires
// (FR-006). Resolution: the exact two fields 009-support-ops-knowledge-
// base's own inclusion rule already requires (FR-007) — completing this
// tab is literally what makes an issue discoverable in the knowledge base
// later. Defined here (not inside SupportIssueExtraFields.jsx/
// ResolutionExtraFields.jsx) because a component file may only export
// components for Fast Refresh to work (`react-refresh/only-export-components`).
const SUPPORT_REQUIRED_FIELDS = ['client_name', 'client_priority']
const RESOLUTION_REQUIRED_FIELDS = ['root_cause', 'resolution']

/** {complete, total} — how many of the Support tab's required fields currently have a value. */
export function getSupportCompletion(form) {
  return {
    complete: SUPPORT_REQUIRED_FIELDS.filter((field) => isFilled(form[field])).length,
    total: SUPPORT_REQUIRED_FIELDS.length,
  }
}

/** {complete, total} — how many of the Resolution tab's required fields currently have a value. */
export function getResolutionCompletion(form) {
  return {
    complete: RESOLUTION_REQUIRED_FIELDS.filter((field) => isFilled(form[field])).length,
    total: RESOLUTION_REQUIRED_FIELDS.length,
  }
}

const SUPPORT_FIELD_LABELS = { client_name: 'Client', client_priority: 'Client Priority' }
const RESOLUTION_FIELD_LABELS = { root_cause: 'Root Cause', resolution: 'Resolution' }

/**
 * `null` when nothing is missing, otherwise `{ support?: [...labels], resolution?: [...labels] }`
 * naming which required fields are still blank, grouped by tab, omitting any
 * group with nothing missing. Built from the exact same `SUPPORT_REQUIRED_FIELDS`/
 * `RESOLUTION_REQUIRED_FIELDS`/`isFilled` the two completion functions above
 * use — not a third definition of "required" or "blank" — so a save-time
 * summary can never disagree with what the tab-label pills already showed.
 */
export function computeMissing(form) {
  const support = SUPPORT_REQUIRED_FIELDS.filter((field) => !isFilled(form[field])).map((field) => SUPPORT_FIELD_LABELS[field])
  const resolution = RESOLUTION_REQUIRED_FIELDS.filter((field) => !isFilled(form[field])).map((field) => RESOLUTION_FIELD_LABELS[field])
  if (support.length === 0 && resolution.length === 0) return null
  const missing = {}
  if (support.length) missing.support = support
  if (resolution.length) missing.resolution = resolution
  return missing
}
