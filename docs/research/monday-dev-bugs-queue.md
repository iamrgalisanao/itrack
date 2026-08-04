# monday dev — Bugs Queue Reference

**Source**: User-supplied screenshot of a monday dev "Bugs Queue" board
(`Main table` view). The reference URL
(https://support.monday.com/hc/en-us/articles/360010530980-Manage-your-bugs-queue-with-monday-dev)
returned HTTP 403 when fetched — this document is based on the screenshot
only, not the article text.

## Board structure observed

A single item board ("Bugs Queue") with a "Main table" view and a separate
"Bug Reporting Form" view (a form-based intake tab, not analyzed further).
Toolbar includes: New bug, Search, Person filter, Filter, Sort, Hide,
Group by, plus monday.com platform features not relevant to iTrack
(AI suggestions, Integrate, Automate, Agents, Invite).

## Groups (status-stage groupings), in order

1. **Incoming Bugs** (yellow) — newly reported, awaiting triage.
2. **Development Work** (blue) — actively being worked.
3. **Resolved** (green) — fixed.
4. **Managed in sprints** (green, empty in the screenshot) — implies bugs
   can be pulled into a sprint-tracking board; not populated in the sample.

Each group has its own colored side-bar and a per-group progress/summary
strip (status distribution, priority distribution) below its rows.

## Columns (fields) per bug item

| Column | Observed values | Notes |
|---|---|---|
| Bug (title) | e.g. "Home page loading issue" | Free text |
| Reporter | Person avatar | Single assignee-style person field |
| Time until resolution | Live countdown, e.g. "49h 0m 0s", "0m 0s" | A live/ticking timer, implies a due date + real-time countdown |
| Status | Awaiting Review / Ready for Dev / Fixing / Fixed | Color-coded label, distinct per group but not strictly 1:1 (Development Work group had both Ready for Dev and Fixing) |
| Priority | Critical / High / Medium / Low | Color-coded label |
| Connected t[o...] | Empty ("-") in every row shown | A "connect boards" column, presumably linking to a sprint/board item; unused in the sample data |
| Bug ID | BABB-001, BABB-002, ... | Auto-generated sequential ID with a project-style prefix |

## What's explicitly out of scope for iTrack's Bug Tracker

Per the scoping decisions made when planning 017-bug-tracker:

- **"Connected to" / cross-board linking and the "Managed in sprints"
  group**: iTrack has no Sprint entity and no generic cross-board linking
  primitive (same conclusion reached for 013-sprint-retrospectives). Bug
  Tracker uses a free-text "Sprint/Milestone" label instead of a real
  relationship.
- **monday.com platform chrome**: AI suggestions, Integrate, Automate,
  Agents, Invite — these are monday.com-platform features, not part of any
  iTrack feature request.
- **Bug Reporting Form as a separate view**: iTrack's bug creation reuses
  the existing per-feature creation pattern (a form/modal within the main
  view), not a distinct "form" tab.

## What iTrack's Bug Tracker adapts, not copies

- **"Time until resolution" live countdown** → adapted to a full SLA
  countdown with breach alerts (per explicit scoping decision), reusing
  iTrack's existing `Notification` system for alerts rather than inventing
  a new one.
- **Client visibility** → iTrack already has a proven `visibility` /
  `client_visible` convention on `Attachment` and `Comment`
  (`backend/app/Models/Attachment.php`, `backend/app/Models/Comment.php`);
  Bug Tracker reuses this convention rather than monday dev's undifferentiated
  single-audience board.
- **Bug ID** → a per-project sequential ID, adapted from monday dev's
  `BABB-###` pattern.
