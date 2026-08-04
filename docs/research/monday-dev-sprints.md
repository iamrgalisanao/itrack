# Research: monday dev — Sprints, Epics, Tasks, Bugs Queue, Retrospectives — Comparison to iTrack Work Program

**Date**: 2026-08-01
**Purpose**: Reference material for evaluating sprint/agile-workflow improvements to iTrack's Work Program, focused on monday.com's "monday dev" product line.

## What it is

"monday dev" is monday.com's product line for software/engineering teams — a set of five interconnected boards (Tasks, Sprints, Epics, Bugs Queue, Retrospectives) in one workspace sidebar, plus roadmap/Kanban views layered on top.

## The core architecture: Connect Boards + Mirror Columns

This is the single most important structural idea, and it's worth understanding before the individual boards: **Tasks is the hub.** Every task has a *Sprint* column and an *Epic* column, each a "Connect Boards" relation pointing at a row on the Sprints board and the Epics board respectively. Sprints and Epics each get a "Connected tasks" column pointing back. Aggregate numbers (story points, execution timeline) are never entered twice — they're **mirror columns** that sum/pull live from whatever tasks are currently connected.

Practically: a task belongs to exactly one Sprint *and* exactly one Epic simultaneously — two independent, crosscutting groupings over the same task list, not a strict parent/child tree.

## The five boards

**Tasks** — day-to-day work items. Each task carries Owner, Status, Priority, Type, Story Points, plus its Sprint and Epic relations.

**Sprints** — one row per sprint (goal, dates), with a live-rolling story-point total pulled from every task connected to it. Views include All Sprints, Kanban, and Roadmap Tracker.

**Epics** — one row per epic/feature. `Estimated SP` and `Actual SP` are mirror columns (sum of the connected tasks' story points), plus an Execution Timeline mirrored the same way. The Roadmap Tracker organizes epics by quarter for stakeholder-facing planning.

**Bugs Queue** — grouped by status (New → In Progress → Resolved). monday.com singles out nine columns as *un-deletable* because the workflow depends on them: **Owner, Status, Priority, Type, Estimated SP, Actual SP, Sprints, Epic, Bugs Queue**. A `Report Date` column plus a Time Tracking automation together answer "how long has this bug been open" without manual upkeep.

**Retrospectives** — one board per sprint, filled continuously (via a form, not just in the ceremony). Rows are individual insights, each tagged by sentiment (**To Keep** / **To Improve** / **Discuss**), voted on by the team, and assigned an owner for follow-through. Grid layout: action item, sentiment, votes, owner — outcome and accountability visible at a glance.

## Comparison to iTrack's Work Program

This is a bigger structural gap than the ClickUp List View comparison (see `clickup-list-view.md`) — Work Program doesn't have a sprint concept at all today.

| Capability | monday dev | iTrack Work Program |
|---|---|---|
| Hierarchy model | Task belongs to one Sprint *and* one Epic simultaneously (two crosscutting relations) | Task belongs to exactly one Sub-Activity in a strict Module→Activity→Sub-Activity→Task tree |
| Sprints (time-boxed iteration) | First-class board, story-point rollups, goals per sprint | Not present — Work Program tracks a fixed-scope WBS, not iteration cadence |
| Epics (feature grouping) | First-class board, mirrors SP/timeline from Tasks | Closest analog is a Module, but Modules are structural containers, not a cross-cutting "feature" grouping independent of the tree |
| Bug tracking | Dedicated Bugs Queue board, same connect/mirror pattern as everything else | **Support Ops** is the real analog — Intake→Needs Info→Investigating→Client Update Due→Resolved, with P1/P2/P3 priority and client/tenant fields. Structurally similar in spirit, separately built rather than sharing Work Program's task model |
| Retrospectives | Dedicated board, continuous input via forms, vote-driven | Not present in any form |
| Aggregate rollups (story points, etc.) | Automatic mirror columns — never entered twice | Progress % is tracked per-task and rolled up via the existing dashboard, but nothing like cross-cutting sprint/epic point totals |

## What this suggests for Work Program

The honest framing: adopting real Sprints/Epics means introducing a **crosscutting grouping orthogonal to the existing Module→Activity→Sub-Activity→Task tree** — not a small addition. Roughly by how much it disturbs what's already there:

1. **Retrospectives is the cheapest, most self-contained win** — a per-sprint (or per-milestone) feedback board with sentiment tags and voting has no dependency on restructuring Work Program's hierarchy at all. Could ship as a standalone feature, similar in shape to how Support Ops was added alongside the existing task model rather than inside it.
2. **A lightweight "Sprint" tag on Tasks**, without a full Sprints board yet — just a nullable field grouping tasks by iteration, then a filter/view slicing Work Program by that tag instead of only by Module/Activity. Low structural risk, immediately useful for teams already running sprints informally.
3. **Story-point rollups via the same mirror pattern** — iTrack already computes Duration and Progress server-side from underlying task data; a Sprint or Epic point total is the same idea applied to a new grouping.
4. **A real Epics board** is the biggest lift — it implies tasks can belong to a grouping that cuts across Modules, which the current schema doesn't support at all. Worth a dedicated architecture conversation, not a quick add.
5. **Bugs Queue** — Support Ops already fills this role conceptually; the monday dev pattern mainly suggests two concrete refinements worth stealing: the *un-deletable critical columns* concept (protect Support Ops' Priority/Owner/Status from accidental removal) and the `Report Date` + automated "time open" tracking, which Support Ops' staleness-flagging already does something similar to.

## Sources

- [Get started with monday dev – Support](https://support.monday.com/hc/en-us/articles/4413846808466-Get-started-with-monday-dev)
- [Sprint management with monday dev – Support](https://support.monday.com/hc/en-us/articles/360010646539-Sprint-management-with-monday-dev)
- [Planning epics with monday dev – Support](https://support.monday.com/hc/en-us/articles/360009482179-Planning-epics-with-monday-dev)
- [Manage your bugs queue with monday dev – Support](https://support.monday.com/hc/en-us/articles/360010530980-Manage-your-bugs-queue-with-monday-dev)
- [Sprint retrospectives with monday dev – Support](https://support.monday.com/hc/en-us/articles/4549340160658-Sprint-retrospectives-with-monday-dev)
- [Agile Sprint Planning Made Easy: End-to-End Sprint Management with monday dev – Omni Factors](https://omnifactors.com/en/blog/agile-sprint-planning-made-easy-end-to-end-sprint-management-with-monday-dev/)
- [What Are Agile Epics? The Definitive Guide For 2026 – monday.com](https://monday.com/blog/rnd/agile-epics/)
