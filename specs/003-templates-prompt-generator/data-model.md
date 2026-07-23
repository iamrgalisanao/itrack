# Phase 1 Data Model: Templates and Prompt Generator (Support Ops Phase 2)

**No new tables. No new columns. No migration.** This feature reads existing
`SupportIssueResource` fields and writes only ordinary `audit_logs` rows via
the table/model already created before `002-support-ops-tracker`. Everything
below is a precise content/interpolation contract — a review pass during
planning found the first draft's mapping too loose to implement consistently,
so this version pins down every source field, every fallback, and every
malformed-input case explicitly.

**Data source discipline (FR-016)**: all three artifacts read from
`SupportOps.jsx`'s own `selectedIssue` state — the last-saved issue as
fetched from the API — never from `TaskDetailModal`'s local `form` state
(the parameter `extraFields(form, setForm)` receives, which holds
in-progress, possibly-unsaved edits to `client_name`/`tenant_name`/
`evidence`/`root_cause`/etc.). Since `extraFields` is defined as a closure
inside `SupportOps.jsx`, it has access to both `selectedIssue` and `form` —
the generators MUST deliberately reach for `selectedIssue`, not `form`, for
every field they read. This is what keeps a generated artifact's content
and the generation-log endpoint's server-side audit derivation (which reads
the same persisted database row) from ever disagreeing about what was
actually disclosed.

## Description parsing grammar (shared by all three artifacts)

`SupportOpsController::store()` composes four intake-time values into the
existing `description` column as a structured text block (see
`002-support-ops-tracker/contracts/support-ops-api.md`):

```text
Timestamp: 2026-07-22 14:30
Area/workflow affected: Checkout screen
Expected: Order confirms and prints a receipt
Actual: Screen freezes, no confirmation shown
```

To extract these four values back out for the templates/packet, apply this
grammar exactly:

1. Recognize four labels, **case-insensitively**, only at the start of a
   line (leading whitespace ignored): `Timestamp:`, `Area/workflow affected:`,
   `Expected:`, `Actual:`.
2. A label's value is everything after its colon, **trimmed** of leading and
   trailing whitespace, continuing across subsequent lines **until** the next
   recognized label or the end of the description (i.e. values may be
   multi-line).
3. If a label is **not found**, or its value is **empty after trimming**, the
   corresponding field is treated as not present — render its dependent slot
   as the blank placeholder defined below. **Never** infer or fabricate a
   value, and never partially match (e.g. a line starting "Expectedly," does
   not match the `Expected:` label).
4. If the description contains **none** of the four labels (unstructured
   prose, or an issue whose `description` was set directly through
   `PUT /detailed-activities/{id}` rather than Support Ops intake), all four
   derived fields are blank. **Do not** fall back to inserting the raw,
   unparsed `description` text into any packet field — this would put
   unbounded, unformatted text into a fixed-shape prompt and contradicts
   FR-007's "never fabricated, never silently substituted" rule.
5. If a label appears **more than once**, use the **first** occurrence only.
6. This parsing is read-only and idempotent — it never rewrites
   `description`, and running it twice on the same issue always yields the
   same four values.

## Message Template (computed, not persisted)

Each of the seven fixed stages is a canonical sentence template using only
`client_name` (optional) and `name` — the issue title (optional). Neither
`tenant_name` nor any `description`-parsed field is used in these — keeping
client-facing text short and free of the internal detail that could make a
message feel like it's quoting an internal ticket. When `client_name` is
present, the greeting includes it; when absent, the greeting is phrased
without a name slot rather than leaving a blank space or stray punctuation.

| Stage | Template (client_name present) | Template (client_name absent) |
|---|---|---|
| Acknowledgement | "Hi {client_name}, we've received your report regarding \"{name}\" and are looking into it." | "Hi, we've received your report regarding \"{name}\" and are looking into it." |
| Intake request | "Hi {client_name}, to help us investigate \"{name}\" faster, could you share any additional details or screenshots when you have a moment?" | "Hi, to help us investigate \"{name}\" faster, could you share any additional details or screenshots when you have a moment?" |
| Investigation started | "Hi {client_name}, we've started investigating \"{name}\". We'll update you as soon as we know more." | "Hi, we've started investigating \"{name}\". We'll update you as soon as we know more." |
| Progress update | "Hi {client_name}, quick update on \"{name}\" — we're still working on it and will follow up with next steps soon." | "Hi, quick update on \"{name}\" — we're still working on it and will follow up with next steps soon." |
| Waiting for client | "Hi {client_name}, we're currently waiting on some information from your side to continue investigating \"{name}\". Let us know when you're able to share it." | "Hi, we're currently waiting on some information from your side to continue investigating \"{name}\". Let us know when you're able to share it." |
| Root cause found | "Hi {client_name}, we've identified the cause of \"{name}\" and are working on a fix." | "Hi, we've identified the cause of \"{name}\" and are working on a fix." |
| Resolved | "Hi {client_name}, \"{name}\" has been resolved. Please let us know if you run into it again." | "Hi, \"{name}\" has been resolved. Please let us know if you run into it again." |

If `name` (issue title) is also absent (an edge case — issues normally
require a title), substitute "your reported issue" in place of `"{name}"` in
every template above, with the surrounding quote marks dropped as well (i.e.
`we've received your report regarding your reported issue`, not
`regarding "your reported issue"`). No template ever reads `evidence`,
`root_cause`, `resolution`, or `next_action` — structurally excluded from
every stage's slot list (FR-002), not filtered out after the fact.

**Channel-agnostic wording check**: none of the seven templates above name a
messaging provider or instruct the user to "send via X" — confirmed by
inspection; this is also asserted by SC-003 and MUST be preserved if these
templates are ever edited.

## Freeform Composer (computed, not persisted)

Pre-fill: `"Hi {client_name}, regarding \"{name}\": "` (cursor placed at the
end, ready for the user to continue typing), using the same present/absent
substitution rules as the fixed templates above for a missing `client_name`
or `name`. The remainder of the body is empty, user-authored text. Never
written to component state that survives an unmount — every open of the
composer re-derives the pre-fill from the current issue props (FR-014).

## Troubleshooting Packet (computed, not persisted)

Fixed prompt format (matching `docs/support_ops_module_plan.md`'s "Codex
Troubleshooting Packet" verbatim structure), with this exact source mapping:

| Packet field | Source | Blank behavior |
|---|---|---|
| Client issue | `name` (issue title) | Blank placeholder if `name` absent |
| Tenant | `tenant_name` | Blank placeholder if absent |
| Provider/client | `client_name` — this label refers to the client organization, **not** a messaging provider (see FR-001's disambiguation note); there is no separate "provider" field in this data model | Blank placeholder if absent |
| Timestamp | The parsed `Timestamp:` value from `description` (see grammar above), used verbatim as the user originally typed it | **Fallback**: if not present/parseable, use `created_at` formatted as `new Date(created_at).toLocaleString()` — matching the exact convention already used for timestamps elsewhere in this app (`Admin.jsx`'s audit log display, `SupportOps.jsx`'s `last_client_update_at` display, `Reports.jsx`'s `generated_at` display) |
| Environment | *(no tracked field at all)* | Always a blank placeholder — FR-007 |
| Endpoint or workflow | Parsed `Area/workflow affected:` value from `description` | Blank placeholder if not present/parseable |
| Request payload/sample | *(no tracked field at all)* | Always a blank placeholder — FR-007 |
| Error message | *(no tracked field at all)* | Always a blank placeholder — FR-007 |
| Expected behavior | Parsed `Expected:` value from `description` | Blank placeholder if not present/parseable |
| Actual behavior | Parsed `Actual:` value from `description` | Blank placeholder if not present/parseable |
| Screenshots/log snippets | `evidence` (free text only — this feature does **not** attach or reference actual file attachments from `TaskFiles`; copy-only plain text cannot embed binary attachments, so this slot is text-only by design) | Blank placeholder if `evidence` absent |
| *(analysis request footer)* | Static text (the "Please inspect the project and identify: 1. Likely cause..." block from the source plan), not issue data | Always present, never varies |
| *(optional addendum, FR-006)* | `root_cause`, rendered as an extra "Suspected root cause so far: {root_cause}" line **appended after** the footer | **Omitted entirely** (not shown blank) when `root_cause` is empty — this is optional context, not one of the packet's core fixed slots |

A blank placeholder is rendered as the field's label followed by nothing
(e.g. `Environment:` with an empty rest-of-line) — visibly present and
labeled, never dropped, never containing a fabricated guess.

Unlike a Message Template, the packet *does* include internal-only fields
(`evidence`, the parsed technical detail, and optionally `root_cause`) — this
is the point of a technical handoff prompt. This is why FR-013's audit
requirement applies to the packet too whenever it includes `client_name`
and/or `tenant_name`: it's the artifact most likely to carry sensitive
technical detail alongside personal information in the same output.

## Audit Log Entry (existing table, new trigger — no schema change)

Written via `App\Services\AuditLogger::record()` against the existing
`audit_logs` table, using new dot-style action names consistent with the
convention already documented in that service's docblock. **Trigger**: an
explicit user click on a "Generate [stage]" / "Start freeform draft" /
"Generate troubleshooting packet" action — never a stage-selection change,
an edit, a copy, or a close/reopen (see FR-013's full trigger definition).

| `action` | Fired on explicit click of |
|---|---|
| `support_issue.template_generated` | "Generate" for a selected Message Template stage |
| `support_issue.draft_started` | "Start freeform draft" |
| `support_issue.packet_generated` | "Generate troubleshooting packet" |

**Privacy gate — artifact-type specific**: what counts as "included" MUST
match exactly what that artifact type actually puts in its output (per the
Message Template / Freeform Composer / Troubleshooting Packet sections
above), never just whatever the issue happens to have set:

| `artifact_type` | `included_client_name` computed from | `included_tenant_name` computed from |
|---|---|---|
| `template` | `client_name` non-empty (post-trim) | always `false` — a template never puts `tenant_name` in its output, regardless of whether the issue has one set |
| `draft` | `client_name` non-empty (post-trim) | always `false` — same reason as `template` |
| `packet` | `client_name` non-empty (post-trim) | `tenant_name` non-empty (post-trim) — the packet is the only artifact that actually includes tenant |

A `template`/`draft` generation logs only if `client_name` is non-empty. A
`packet` generation logs if *either* `client_name` or `tenant_name` is
non-empty. This check is **always performed server-side** — see
`contracts/generation-log-api.md`'s trust-boundary note. The frontend's
`POST` body carries no `included_client_name`/`included_tenant_name` fields
at all; the server computes both independently, per the table above, before
deciding whether to write anything.

**Snapshot-consistency check (race handling)**: generation happens
client-side instantly, but the audit call is a separate, slightly-later
network round-trip — the issue could theoretically be edited by someone else
in between. To avoid under-logging what was actually shown to the user, the
frontend sends `issue_updated_at` — the exact ISO 8601 string from the
issue's `updated_at` as returned by `SupportIssueResource` at the moment the
artifact was generated (not sensitive data, just a timestamp; see
`contracts/generation-log-api.md` for the exact comparison method). The
server compares this to the issue's *current* `updated_at`, re-serialized
the same way:
  - **Match** (no edit happened in between): the current DB values are
    exactly what was rendered — derive `included_client_name`/
    `included_tenant_name` from them normally (per the artifact-type table
    above), and skip writing an entry only if the resulting artifact-type-
    specific check finds nothing included.
  - **Mismatch** (the issue changed in between): the server cannot confirm
    what was actually rendered, so it errs toward writing the entry
    regardless of the current field values, with
    `metadata.snapshot_stale: true` so a reviewer can tell this entry was
    recorded defensively rather than freshly confirmed. An extra or
    over-cautious entry is an acceptable cost for RA 10173 accountability; a
    silently missed one is not.

This mechanism never reintroduces client-trusted PII presence — only a
timestamp travels from the frontend, and it is used purely to decide *which*
of the two logging paths above to take, never to determine the actual
`included_*` values themselves (those are always read from the DB, in both
paths).

**Scope check**: before any of the above, the server verifies `{id}`
resolves to a Support Ops-scoped `DetailedActivity` (same `work_type`
scoping as `SupportOpsController::index()`) — a valid id belonging to an
unrelated Kanban-only task 404s instead of logging.

`entity_type`: `'detailed_activity'` (a support issue is a `DetailedActivity`
row, same convention as everywhere else). `entity_id`: the issue's id.

`metadata` shape — **structural information only, never the actual field
values or generated text** (this is deliberate: the audit trail must not
become a second store of the same sensitive data it's meant to be
accounting for):

```json
{
  "artifact_type": "template" | "draft" | "packet",
  "template_stage": "acknowledgement" | "intake_request" | "investigation_started" | "progress_update" | "waiting_for_client" | "root_cause_found" | "resolved" | null,
  "included_client_name": true,
  "included_tenant_name": false,
  "snapshot_stale": false
}
```

`template_stage` is `null` for `artifact_type: "draft"` and
`artifact_type: "packet"` (neither has a fixed stage). `included_client_name`/
`included_tenant_name` are booleans only, computed server-side from the
issue's field values at write time — never the actual name values, and never
sourced from client input. `snapshot_stale` is `true` only when the
snapshot-consistency check above found a mismatch (the entry was written
defensively); `false` in the normal case.

## State transitions

None for the three generated artifacts. The one persisted side effect (an
`audit_logs` row) is itself immutable once written (matching `AuditLog`'s
existing `const UPDATED_AT = null`) and has no further lifecycle.
