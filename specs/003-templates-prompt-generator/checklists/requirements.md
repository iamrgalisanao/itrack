# Specification Quality Checklist: Templates and Prompt Generator

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- No [NEEDS CLARIFICATION] markers were needed: the two genuinely ambiguous
  design points (whether generating a template should auto-record a client
  update; whether untracked packet fields should get new DB columns or stay
  blank placeholders) both have reasonable, low-risk defaults, documented in
  spec.md's Assumptions section rather than raised as open questions.
- Initial draft used "Viber" as the concrete example throughout; user feedback
  during drafting flagged this as too specific, so the spec was revised to be
  fully messaging-channel-agnostic (templates are plain text bodies, no
  provider integration, channel comes from the issue's existing generic
  "Channel" field). All checklist items re-validated against the revised draft.
- `/speckit-clarify` session (2026-07-23): two questions asked and answered.
  (1) Data Privacy Act of 2012 (RA 10173) compliance mechanism for personal
  information (`client_name`/`tenant_name`) surfaced in generated text —
  integrated as FR-012/FR-013 and SC-005; FR-009 and the Assumptions section
  were updated to carve out the new audit-log entry as the one exception to
  "copying never mutates the issue." (2) Whether the freeform draft (User
  Story 3) should survive navigating away before copying — answered no,
  fully ephemeral; integrated as FR-014 and an expanded Edge Cases bullet.
  All 16 checklist items still pass against the updated spec — no
  regressions. No further high-impact ambiguities identified; ready for
  `/speckit-plan`.
- Review pass during `/speckit-plan` (2026-07-23): a detailed review of the
  draft plan/data-model/contracts/quickstart surfaced five blocking gaps —
  imprecise packet field mapping (esp. `root_cause` having no slot, "Timestamp"
  being undefined, "Provider/client" being ambiguous), undefined
  description-parsing failure behavior, an ambiguous audit-trigger definition,
  an overstated "generation is not a write" claim, and missing Team
  Member/direct-API authorization coverage. All five were resolved by
  amending spec.md directly (FR-002, FR-006, FR-007, FR-009, FR-010, FR-013
  rewritten; FR-015 added for safe plain-text rendering) rather than only
  patching the downstream design docs, so the spec itself — not just the
  plan — is now precise enough for independent implementers to agree on
  behavior. All 16 checklist items re-verified against this revision — no
  regressions.
- Third review pass (2026-07-23): five more findings on the same design
  docs — the audit endpoint trusted client-computed privacy booleans instead
  of deriving them server-side (a real trust-boundary gap for a compliance
  feature); FR-007 and data-model.md contradicted each other on whether
  Timestamp goes blank or falls back to `created_at` on parse failure;
  FR-002 listed `tenant_name` as a template pre-fill field while
  data-model.md's canonical wording never used it; the generation-log
  endpoint didn't verify `{id}` is actually a Support Ops-scoped record; and
  there was no automated test coverage for the pure-JS template/parsing
  logic. First four resolved directly in spec.md (FR-002, FR-005, FR-007,
  FR-013) and propagated to contracts/generation-log-api.md and
  data-model.md; the fifth resolved by adding a Node built-in-test-runner
  unit-test task to plan.md (no new dependency). All 16 checklist items
  re-verified — no regressions.
- Fourth review pass (2026-07-23): three more findings. (1) The server-side
  privacy-flag derivation (from the third pass) still had a subtle race: the
  audit call happens slightly after generation, so the issue could change in
  between and cause under-logging if the server only ever trusted "current"
  DB values. Fixed with a snapshot-consistency check — the frontend sends
  `issue_updated_at`, and a mismatch against the server's current value
  forces a conservative, always-log path (`metadata.snapshot_stale: true`)
  rather than silently skipping (FR-013, contracts/generation-log-api.md,
  data-model.md). (2) Two stale references to `tenant_name` as a
  template/freeform pre-fill field remained (an acceptance scenario and a
  parenthetical in FR-002) even after the second pass corrected the main
  requirement text — both fixed to match the actual client-name-and-title-only
  scope. (3) The plan's backend test list hadn't caught up to two contract
  cases added in the second/third passes (the distinct "non-Support-Ops id"
  404 and the "both fields blank → 200, zero rows written" path) — both
  added as explicit test-plan items, plus the new snapshot-stale case. All
  16 checklist items re-verified — no regressions.
- Fifth review pass (2026-07-23): three more findings. (1) The most
  substantive: the audit privacy gate was still computed at the issue level
  (any non-empty `client_name`/`tenant_name` on the issue), not per
  artifact — but FR-002/FR-005 established that templates and the freeform
  draft never actually include `tenant_name` in their output, only the
  packet does. A template/draft generation on an issue with a set
  `tenant_name` but blank `client_name` would have wrongly logged
  `included_tenant_name: true` despite tenant never appearing anywhere in
  that artifact's text. Fixed with an explicit artifact-type table (FR-013,
  data-model.md, contracts/generation-log-api.md): `template`/`draft` only
  ever check `client_name`; `packet` checks both. (2) The `issue_updated_at`
  comparison was specified as a loose `!==` without defining serialization —
  brittle across ISO string formats/precision. Fixed by requiring the exact
  `SupportIssueResource`-serialized `toIso8601String()` value on both sides
  of the comparison. (3) FR-012's privacy notice requirement still only
  mentioned template/packet controls, omitting the freeform draft (which can
  also disclose `client_name`); extended to cover all three artifacts. All
  16 checklist items re-verified — no regressions.
- Sixth review pass (2026-07-23): two small but real staleness fixes in
  contracts/generation-log-api.md left over from the fifth pass's
  artifact-type-aware rewrite. (1) The "client-side gating note" and the
  "Frontend call site" section still described the *old* issue-level check
  (call whenever the issue has any non-empty `client_name`/`tenant_name`) —
  both rewritten to mirror the server's artifact-type table exactly
  (client-name-only for `template`/`draft`; either field for `packet`), so
  the frontend doesn't make pointless calls or drift from the server's
  actual logging behavior. (2) The 422 validation note still said
  `issue_updated_at` must be "a valid date," which invites a parse/reformat
  step that would defeat the exact-string snapshot comparison; corrected to
  require the literal `SupportIssueResource`-format ISO 8601 string,
  unparsed/unreformatted. Purely contract-file wording fixes — no change to
  spec.md, data-model.md, or the actual server logic already specified. All
  16 checklist items re-verified — no regressions. Ready for
  `/speckit-tasks`.
- `/speckit-tasks` generated (2026-07-23): 29 tasks across 6 phases (see
  tasks.md). A review of the generated task list surfaced one substantive
  gap and two smaller ones. (1) Most substantive: the tasks placed
  generation controls inside `TaskDetailModal`'s `extraFields(form, setForm)`
  slot without specifying which of two available data sources — `form`
  (the modal's local, possibly-unsaved edit buffer) or `SupportOps.jsx`'s
  own `selectedIssue` (last-saved state) — generation should read from.
  Reading from `form` would let an unsaved edit to `client_name`/
  `tenant_name`/`evidence`/`root_cause` appear in generated text before
  it's saved, while the generation-log endpoint's audit derivation only
  ever sees the last-saved database row — a same-user-session divergence
  between what's disclosed and what's audited, distinct from the cross-user
  race FR-013's snapshot-consistency check already covers. Fixed with a new
  **FR-016** (spec.md) plus a matching edge case, propagated to
  data-model.md's new "Data source discipline" note, plan.md, and explicit
  reminders on tasks.md's T008/T014/T019. (2) T002's `issue_updated_at`
  validation and T004's test list hadn't caught up to the contract's
  precise "exact ISO 8601 string, never reparsed" requirement from the
  sixth pass — tightened to explicitly forbid parsing into a
  `Carbon`/`DateTime` instance and to add missing/non-string/malformed-
  format test cases. (3) tasks.md's "Parallel Opportunities"/"Parallel Team
  Strategy" sections overstated cross-story parallelism — `supportTemplates.js`,
  its test file, and `SupportOps.jsx` are each edited by all three user
  stories, so working on them concurrently needs branch-discipline
  coordination, not the dependency-free `[P]` parallelism the format
  section defines; reworded to make that distinction explicit rather than
  implying clean independence. All 16 checklist items re-verified against
  spec.md — no regressions.
- Task-list review pass (2026-07-23): three more findings, all confined to
  tasks.md/quickstart.md (no spec.md changes needed this round). (1) T028
  referenced "quickstart.md Scenarios 12–13," which didn't exist — those
  checks were actually steps 13–14 inside Scenario 7; T028 corrected to
  point there. (2) FR-016 (added in the prior pass) had no matching
  quickstart scenario to manually verify it — added **Scenario 12**
  (generate with an unsaved form edit present; confirm the last-saved value
  is used, not the unsaved one; confirm saving then flips it) and a new
  **T029** exercising it. (3) No check existed that the frontend actually
  sends the right `issue_updated_at` payload end-to-end (only the backend's
  handling of a given payload was tested, in T004) — added **Scenario 13**
  (devtools Network-tab inspection of a real `generation-log` request) and
  a new **T030**. The former T029 (regression check) renumbered to T031;
  no other task IDs shifted. tasks.md now has 31 tasks across 6 phases. All
  16 checklist items re-verified — no regressions. Ready for
  `/speckit-implement`.
