# Feature Specification: Templates and Prompt Generator

**Feature Branch**: `003-templates-prompt-generator`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "Phase 2 of the Support Ops module (docs/support_ops_module_plan.md): Templates and Prompt Generator. Adds copyable client messaging templates (Acknowledgement, Intake request, Investigation started, Progress update, Waiting for client, Root cause found, Resolved), a copyable AI troubleshooting packet auto-filled from the issue's fields, and a client-facing update generator field — all surfaced from the Support Ops issue detail modal built in 002-support-ops-tracker."

## Clarifications

### Session 2026-07-23

- Q: The troubleshooting packet and client templates surface `client_name`/`tenant_name` in text meant to be copied into external tools — what concrete mechanism satisfies Data Privacy Act of 2012 (RA 10173) compliance for this? → A: Visible, persistent privacy notice near the generate/copy actions, plus an audit log entry recorded each time a template or packet containing personal information is generated (no blocking confirmation click).
- Q: Should the freeform client-update draft (User Story 3) survive if the user navigates away or closes the issue before copying it? → A: No — fully ephemeral, closing/reopening the issue always starts from a fresh pre-fill with an empty body. No persistence layer of any kind for draft text.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Send a client status update without retyping it from scratch (Priority: P1)

A Project Manager or Team Member working an issue in Support Ops needs to message
the client through whatever channel that client uses (chat app, email, SMS —
already tracked on the issue). Instead of typing a message from memory, they open
the issue, pick the message stage that matches where the issue is right now (e.g.
"Investigation started" or "Waiting for client"), and get a message already
filled in with the client's name and the issue summary — ready to review, tweak,
and copy into whichever channel they're using.

**Why this priority**: This is the single most frequent action support staff will
take — every open issue needs at least one client-facing update, often several.
Removing the retyping step is the core value of Phase 2.

**Independent Test**: Can be fully tested by opening any issue, selecting each of
the seven message stages in turn, and confirming a correctly pre-filled,
copy-ready message appears for each — delivers value even if the troubleshooting
packet (User Story 2) is never used.

**Acceptance Scenarios**:

1. **Given** an open issue with a client name and issue title recorded, **When**
   the user selects the "Acknowledgement" stage, **Then** a message referencing
   that client name and issue title is displayed, ready to copy.
2. **Given** a generated message, **When** the user edits the text before
   copying, **Then** the edited text (not the original template) is what gets
   copied.
3. **Given** a generated message, **When** the user selects "Copy", **Then** the
   exact displayed text is placed on the clipboard and the user gets a visible
   confirmation that the copy succeeded.
4. **Given** an issue missing an optional detail (e.g. no client name
   recorded), **When** a template references that detail, **Then** the
   message renders with that portion cleanly omitted (per FR-002's wording
   rules) rather than showing an error or blocking generation. (`tenant_name`
   is not used by any client-facing template — see FR-002 — so it is never a
   candidate for this scenario; it is exercised instead by the troubleshooting
   packet's own missing-tenant handling in User Story 2.)

---

### User Story 2 - Get an AI-ready troubleshooting prompt for a technical issue (Priority: P1)

A Team Member investigating a technical support issue wants to hand it off to an
AI coding assistant for a first pass at diagnosis. Instead of manually copying
details out of the issue into a prompt, they click one action in the issue detail
view and get a structured troubleshooting prompt pre-filled with everything
already known about the issue, with clear blanks for anything that isn't tracked
yet.

**Why this priority**: Technical triage is the other half of daily Support Ops
work, alongside client communication — this removes the same kind of manual
retyping for the technical audience.

**Independent Test**: Can be fully tested by opening a technical issue, generating
the troubleshooting packet, and confirming every tracked field is filled in and
every untracked field is clearly marked as blank — delivers value even if no
client-facing template (User Story 1) is ever generated for that issue.

**Acceptance Scenarios**:

1. **Given** an issue with client, tenant, affected area, expected behavior,
   actual behavior, and evidence recorded, **When** the user generates the
   troubleshooting packet, **Then** all of those values appear in the correct
   slot of the generated prompt.
2. **Given** an issue with no recorded environment, request payload, or error
   message (none of these are captured elsewhere in Support Ops today), **When**
   the packet is generated, **Then** those slots appear clearly marked as blank
   rather than omitted or filled with placeholder junk.
3. **Given** an issue with a non-empty `root_cause` already recorded, **When**
   the packet is generated, **Then** an additional "suspected root cause so
   far" line appears with that value; **given** an issue with `root_cause`
   empty, **when** the packet is generated, **then** that line is omitted
   entirely rather than shown blank.
4. **Given** a generated packet, **When** the user selects "Copy", **Then** the
   full packet text is placed on the clipboard.

---

### User Story 3 - Draft a one-off client update that doesn't fit any fixed stage (Priority: P2)

Sometimes an issue's situation doesn't match any of the seven fixed stages (e.g.
a partial workaround while the real fix is still pending). A user wants to draft
a custom client-facing update that still starts from the issue's known details,
instead of writing one completely from a blank page.

**Why this priority**: Valuable but less frequent than the fixed stages in User
Story 1 — most updates do fit one of the seven stages.

**Independent Test**: Can be fully tested by opening the freeform composer on any
issue, confirming it starts pre-filled with the same client-facing details as the
fixed templates (client name, issue title) but with open body text, and copying
the result — delivers value independently of whether any fixed-stage template is
ever used on that issue.

**Acceptance Scenarios**:

1. **Given** an open issue, **When** the user opens the freeform update composer,
   **Then** it starts pre-filled with the client name and issue title and an
   empty body for the user to write.
2. **Given** freeform composer text, **When** the user selects "Copy", **Then**
   the exact displayed text is placed on the clipboard.

---

### Edge Cases

- What happens when the issue has no client name or no issue title recorded
  (the only two fields templates and the freeform pre-fill use, per FR-002/
  FR-005), or, separately, no tenant name (relevant only to the packet, per
  FR-006)? All three artifacts still generate regardless of which of these
  are missing, with each missing slot cleanly omitted (not shown as
  "undefined," "null," or with malformed leftover punctuation) — generation
  is never blocked by missing data. See data-model.md for the canonical
  per-template wording that achieves this.
- What happens when the issue's `description` doesn't contain the expected
  structured labels (missing a label, different capitalization, labels out of
  order, multi-line values, or plain prose with no structure at all)? The
  packet generates regardless; each field normally sourced from a label that
  can't be found or parsed renders as its blank placeholder (per FR-007) —
  parsing never blocks generation and never falls back to dumping the raw
  description text in place of a specific field.
- What happens if the generation-log audit write fails (e.g. a network
  error)? The generated template, draft, or packet still displays and remains
  copyable — this feature prioritizes the user's ability to communicate over
  a guaranteed audit write (see FR-013's last bullet).
- What happens if the browser denies clipboard access? The user sees a visible
  error and the generated text remains fully selectable on-screen so it can be
  copied manually.
- What happens if a user regenerates a template after editing it, or closes and
  reopens the issue mid-draft? Switching to a different stage, reopening the
  packet, or navigating away from the issue and back all discard unsaved edits
  and start from a fresh pre-fill — no template, packet, or freeform draft text
  is ever persisted, so there is nothing to silently lose from the system's
  point of view.
- How does the system keep one issue's generated text from ever showing another
  issue's details? Every generation reads only the currently open issue's data at
  the moment of generation.
- What happens for a client whose communication channel isn't chat-based (e.g.
  email, which typically wants a subject line)? Templates are plain text bodies
  only — formatting for a specific channel's conventions is left to the user
  pasting it in, since the feature does not send anything itself (see FR-011).
- What happens if a user has unsaved edits to `client_name`, `tenant_name`,
  `evidence`, or `root_cause` in the same issue detail view when they click
  Generate? Generation reads only the last-saved values (FR-016) — an
  unsaved edit is never disclosed by a template, the freeform draft, or the
  packet until it's actually saved, so what's shown/copied and what the
  audit log independently sees from the database always agree.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide seven predefined client-facing message
  templates — Acknowledgement, Intake request, Investigation started, Progress
  update, Waiting for client, Root cause found, Resolved — selectable from the
  Support Ops issue detail view. Templates MUST be plain text and independent of
  any specific messaging channel or app: generated text MUST NOT name a
  specific messaging provider or app (e.g. Viber, WhatsApp, Messenger, Slack,
  Teams, SMS, email) and MUST NOT instruct the user to send it through a
  specific one, since the issue's tracked "Channel" field already varies per
  client and per issue. (This channel-agnostic restriction is about messaging
  providers specifically — it does not apply to the troubleshooting packet's
  "Provider/client" line in FR-006, which is a fixed label from the source
  prompt format referring to the client organization, sourced from
  `client_name`, not a messaging provider.)
- **FR-002**: Each selected template MUST be pre-filled using only the issue's
  client name and issue title — the two fields the canonical template wording
  in data-model.md actually uses. `tenant_name` is deliberately NOT part of any
  of the seven templates' or the freeform composer's automatic pre-fill (it
  appears only in the troubleshooting packet, FR-006, which is not
  client-facing); this keeps client-facing text short and free of internal
  ticketing detail a client wouldn't recognize. Internal-only details
  (evidence, root cause, resolution notes, next action) MUST NOT be
  automatically inserted into any client-facing template — this restriction
  applies only to automatic insertion. The stage name itself (e.g. "Root
  cause found," "Resolved") communicates status only; it does not imply the
  template auto-fills the actual `root_cause`/`resolution` text. A user MAY
  manually type specifics into the editable generated text before copying
  (FR-003) if they judge it appropriate to share with the client. When a
  referenced detail (client name or issue title — the only two a template
  ever references, per this FR's first sentence) is blank, the template
  MUST omit that detail cleanly — no literal "undefined," "null," "N/A," or
  malformed punctuation/doubled spaces from a blanked-out slot (see canonical
  template wording in data-model.md).
- **FR-003**: Users MUST be able to freely edit a generated template's text
  before copying it.
- **FR-004**: System MUST provide a one-click action that copies the currently
  displayed client-facing message text — as plain text, exactly as displayed
  including line breaks and the user's own edits, no HTML — to the clipboard,
  with a visible success confirmation. If the browser denies clipboard access,
  the user MUST see a visible, non-blocking error and the text MUST remain
  fully selectable on-screen for manual copying.
- **FR-005**: System MUST provide a freeform client-update composer, independent
  of the seven fixed stages, that starts pre-filled with the issue's client
  name and issue title (the same two fields as FR-002, not `tenant_name` —
  see FR-002's note) and an empty body for custom text.
- **FR-006**: System MUST provide a "Generate troubleshooting packet" action in
  the issue detail view that produces a structured technical prompt containing:
  client, tenant, timestamp, affected area, expected behavior, actual behavior,
  and evidence — populated from the issue's already-tracked fields per the
  exact field-to-source mapping in data-model.md. If the issue has a non-empty
  `root_cause` already recorded, the packet MUST also include it as an
  optional "suspected root cause so far" line (omitted entirely, not shown
  blank, when `root_cause` is empty) — this is additional context for the AI
  assistant, not one of the packet's core fixed slots.
- **FR-007**: Any troubleshooting packet field with no corresponding tracked data
  on the issue today (environment, request payload/sample, error message) MUST
  appear as a clearly labeled blank placeholder in the generated text, never
  silently omitted and never filled with fabricated content. Three fields are
  sourced by parsing the issue's `description` — affected area, expected
  behavior, actual behavior — following the parsing rules in data-model.md:
  parsing failure or a missing/malformed label for any one of them MUST still
  render that field as a blank placeholder — it MUST NOT block generation of
  the rest of the packet, and MUST NOT fall back to dumping the raw, unparsed
  description text into the packet. The Timestamp field is the one exception
  to "blank on parse failure": it is also normally sourced by parsing
  `description`, but falls back to the issue's `created_at` (formatted per
  data-model.md) when the `Timestamp:` label is missing or unparseable, since
  a real timestamp is always available from the record itself — Timestamp is
  never blank the way the other three parsed fields can be.
- **FR-008**: System MUST provide a one-click action that copies the currently
  displayed troubleshooting packet text — as plain text, exactly as displayed
  including line breaks and the user's own edits, no HTML — to the clipboard,
  with a visible success confirmation. If the browser denies clipboard access,
  the user MUST see a visible, non-blocking error and the text MUST remain
  fully selectable on-screen for manual copying.
- **FR-009**: Generating or copying any template, packet, or freeform draft MUST
  NOT by itself alter the issue's own persisted fields — specifically its
  `status` and `last_client_update_at`. (The board's "stale" indicator is a
  derived, time-relative display computed from those two fields plus
  `client_priority` and the current time — it is expected to change on its
  own as time passes regardless of this feature; what this requirement
  guarantees is that the underlying persisted values themselves never change
  as a side effect of generating or copying.) Recording that an update was
  actually sent to the client remains the existing, explicit "Record client
  update now" action delivered in 002-support-ops-tracker. The sole exception
  is the audit log entry required by FR-013: this creates a new, separate
  `audit_logs` row (a distinct record, not a mutation of the issue) and MUST
  NOT be confused with a write to the issue itself — generation is not a
  write to `detailed_activities`, but it MAY create this separate audit
  record.
- **FR-010**: These template, packet, and composer controls MUST be visible only
  to roles that already have Support Ops access (Admin, Project Manager, Team
  Member, Department Head). Clients, who have no Support Ops access at all, MUST
  NOT see or reach these controls. This restriction MUST be enforced at the
  API level (the generation-log endpoint from FR-013 re-checks the same
  role gate), not only by hiding the controls in the UI — a direct API call
  from a Client or unauthenticated session MUST be rejected the same way
  `GET /support-ops` already rejects one today.
- **FR-011**: The system MUST NOT transmit any generated text anywhere on the
  user's behalf, and MUST NOT integrate with any specific external messaging
  provider. All templates, the packet, and the freeform draft are copy-only text
  that the user pastes into whatever tool they're using (their chat app, email,
  an AI assistant) using their own judgment.
- **FR-012**: System MUST display a visible, persistent privacy notice next to
  the generation and copy actions for **all three** artifacts — the seven
  fixed templates, the freeform composer, and the troubleshooting packet —
  reminding the user that the generated text may contain personal information
  (client name, and for the packet, tenant name too) and must be handled in
  compliance with the Data Privacy Act of 2012 (Republic Act No. 10173)
  before being shared with any external tool or third party. The notice MUST
  NOT block or require dismissal before copying.
- **FR-013**: System MUST record an audit log entry each time a user takes an
  explicit "Generate" action (Generate [a specific template stage], Start
  freeform draft, or Generate troubleshooting packet) whose output includes
  personal information, capturing at minimum: which issue, which user, which
  artifact type (and template stage, if applicable), and when — reusing the
  project's existing audit-logging mechanism for sensitive actions rather
  than introducing a new one. **What counts as "included" is artifact-type
  specific, matching exactly what that artifact type actually puts in its
  output (per FR-002/FR-005/FR-006)** — not just whatever the issue happens
  to have set:
  - For `artifact_type: template` or `artifact_type: draft`: only
    `client_name` is ever part of the output (FR-002, FR-005), so only
    `included_client_name` (non-empty post-trim) is evaluated.
    `included_tenant_name` is always recorded as `false` for these two
    artifact types, **regardless of whether the issue's `tenant_name` is
    set** — tenant is never disclosed by a template or the freeform draft,
    so it must never be reported as included for them.
  - For `artifact_type: packet`: both `client_name` and `tenant_name` are
    part of the output (FR-006), so both `included_client_name` and
    `included_tenant_name` are evaluated (non-empty post-trim) and either
    one being `true` triggers logging.
  To keep the trigger itself unambiguous:
  - Selecting/browsing a template stage in a picker, without clicking
    Generate, MUST NOT log an entry.
  - Editing already-generated text MUST NOT log an entry.
  - Copying generated text (FR-004, FR-008) MUST NOT log an additional entry
    — the log entry belongs to the generation that produced the copied text.
  - Closing and reopening the composer/picker, or re-selecting the same
    already-generated stage without clicking Generate again, MUST NOT log an
    entry. Clicking Generate again (same stage or a different one) MUST log a
    new entry — it is a new, distinct generation.
  - A generation whose artifact-type-specific check above evaluates to no
    fields included (a template/draft with `client_name` empty; a packet
    with both `client_name` and `tenant_name` empty) produces no audit entry,
    since no personal information was disclosed by that specific artifact.
  - Whether `client_name`/`tenant_name` were "non-empty" for audit purposes
    MUST be determined server-side, by loading the issue and checking its
    field values — NOT by trusting a boolean the frontend sends. The
    frontend's own pre-check (to decide whether it's worth calling the
    endpoint at all) is a UX optimization only, not the source of truth for
    what gets recorded; a buggy or malicious direct API call MUST NOT be
    able to produce an audit entry that misrepresents whether personal
    information was actually involved.
  - Because generation is instantaneous and client-side but the audit call
    is a separate, slightly-later network round-trip, the issue's
    `client_name`/`tenant_name` could theoretically change in between (e.g.
    another user edits the issue at that exact moment). To avoid
    under-logging what was actually shown to the first user, the frontend
    MUST send the `updated_at` value of the issue as it was at generation
    time, and the server MUST compare it to the issue's current `updated_at`
    at write time: if they match, log using the current (== rendered)
    field values as normal; if they **don't** match, the server MUST log
    conservatively — write the entry regardless of the current field
    values, marked so a reviewer can tell this entry could not be freshly
    confirmed against the exact rendered content. An extra or over-cautious
    audit entry is an acceptable cost; a missed one is not, for RA 10173
    accountability purposes.
  - The target record MUST be verified server-side to actually be a Support
    Ops issue (i.e. within this feature's scope), not merely an existing
    `DetailedActivity` id of any kind — generation-logging against an
    unrelated Kanban-only task is out of scope and MUST be rejected.
  - The audit entry's metadata MUST NOT include the generated text itself, nor
    the actual values of `client_name`, `tenant_name`, `description`,
    `evidence`, `root_cause`, `resolution`, or `next_action` — only
    structural information (artifact type, template stage if any, and
    whether `client_name`/`tenant_name` were non-empty) to avoid the audit
    trail itself becoming a second store of the same sensitive data.
  - If the audit log write fails (e.g. a network error), the generated text
    MUST still display and remain copyable — this feature prioritizes an
    agent's ability to communicate with a client over strict audit-write
    guarantees, given the audit call has no natural blocking point in a
    read-only, client-side generation flow. A failed audit write is surfaced
    only in the browser console, never as a user-facing error blocking Copy.
- **FR-014**: The freeform client-update composer's draft text MUST NOT persist
  under any circumstance — not across closing/reopening the issue, switching to
  a different issue, navigating to another page, a browser reload, or signing
  out. Every time the composer is opened it MUST start from a fresh pre-fill
  (client name, issue title) with an empty body. No draft storage of any kind
  (no `localStorage`, `sessionStorage`, or backend draft-save) is introduced by
  this feature.
- **FR-015**: All issue-derived values (client name, tenant name, issue title,
  description-derived text, evidence) are untrusted user input and MUST be
  rendered and edited as plain text only — e.g. in a `<textarea>` or
  equivalent — never interpreted as HTML (no `dangerouslySetInnerHTML` or
  equivalent). A value containing markup, quotes, or special characters MUST
  display and copy literally as text, never executed or stripped.
- **FR-016**: The issue detail view where these generators live is the same
  view a user can also edit support fields in (`client_name`, `tenant_name`,
  `evidence`, `root_cause`, etc.), and those edits are held locally until an
  explicit Save. Generation (all three artifact types) MUST read only the
  issue's **last-saved** values for these fields — never an in-progress,
  unsaved edit sitting in the same form — so that what gets displayed/copied
  and what the generation-log endpoint's server-side audit derivation sees
  (FR-013) always agree. An unsaved edit to `client_name` MUST NOT appear in
  a generated template, draft, or packet until it has actually been saved.
  This is a same-user-editing-session concern, distinct from (and in
  addition to) the cross-user race FR-013's snapshot-consistency check
  already handles.

### Key Entities

- **Message Template**: One of the seven fixed client-facing message stages.
  Not persisted — a piece of static content rendered with the current issue's
  client-facing details at generation time. Channel-agnostic by design (see
  FR-001).
- **Troubleshooting Packet**: The structured technical prompt format. Not
  persisted — rendered from the current issue's tracked fields at generation
  time, same as a Message Template.
- **Support Issue** *(existing, from 002-support-ops-tracker)*: Source of all
  data used to fill templates and the packet, including its existing "Channel"
  field. This feature reads existing fields; it does not add columns to it.
- **Audit Log Entry** *(existing mechanism, reused per FR-013)*: One record per
  generation of a template, freeform draft, or packet that contains personal
  information, capturing the issue, user, artifact type, and timestamp — not a
  new entity, the existing project-wide audit-logging mechanism applied to a
  new trigger.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from opening an issue to having a copy-ready client
  status update on their clipboard in under 15 seconds.
- **SC-002**: A user can go from opening a technical issue to having a copy-ready
  troubleshooting prompt on their clipboard in under 15 seconds.
- **SC-003**: 100% of generated client-facing messages, across all seven
  templates and the freeform composer, contain zero internal-only fields
  (evidence, root cause, resolution, next action) and zero references to a
  specific messaging provider.
- **SC-004**: 100% of generated troubleshooting packets clearly distinguish
  filled-in fields from blank/untracked ones — no field is ever silently
  dropped from the output.
- **SC-005**: 100% of explicit Generate actions (per FR-013's trigger and
  artifact-type-specific inclusion definitions) whose output actually
  includes personal information, under normal network conditions, produce a
  corresponding audit log entry — giving the organization a reviewable trail
  of
  personal-information disclosures for Data Privacy Act accountability
  purposes. This is a best-effort accountability target, not a hard guarantee
  enforced by blocking generation (see FR-013's audit-failure behavior).

## Assumptions

- **Copy-only, no send integration, no specific channel**: Nothing in this
  feature actually sends a message anywhere, and nothing is written against a
  particular messaging provider's API (chat app, email, SMS, or otherwise).
  "Copyable" means placed on the clipboard for the user to paste into whatever
  channel that issue's client actually uses — consistent with the issue's
  existing, already-generic "Channel" field.
- **No new persisted fields**: The troubleshooting packet's three untracked
  slots (environment, request payload/sample, error message) are rendered as
  blank placeholders rather than triggering new database columns or intake form
  fields — keeping this phase templating-only, consistent with the module
  plan's phase-by-phase build order.
- **Copying never mutates the issue itself**: Using a template or the packet
  never changes the issue's own status, staleness state, or last-client-update
  timestamp — the existing "Record client update now" action (from
  002-support-ops-tracker) remains the only way to update that timestamp, so
  the two concerns (drafting a message vs. recording that one was sent) stay
  independent and neither surprises the other. The one exception, the
  DPA-driven audit log entry (FR-013), is a separate append-only record, not a
  change to the issue.
- **Same access model as the rest of Support Ops**: No new role logic is
  introduced — anyone who can already open an issue's detail view can reach
  these controls, and Clients (already excluded from Support Ops entirely)
  remain excluded.
- **AI-upskilling / learning-task fields are out of scope**: The module plan's
  "AI Upskilling Integration" section (learning task fields such as
  Topic/Video/Key idea) is a separate concern from Phase 2's three bullets
  (client messaging templates, AI troubleshooting packet, client-update
  generator) and is not addressed by this feature.
