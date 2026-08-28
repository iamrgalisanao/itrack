# ADR 0001 — Client scoping: which axis, and what enforces it

**Status**: Accepted
**Date**: 2026-08-28
**Supersedes**: nothing. First ADR in this repository.

## Context

Between PRs #11 and #26, five disclosure defects were closed on the same boundary — data reaching a
Client that should not have. They were found by five different means (a feature audit, an
architecture review of a backlog file, a PR review, a second PR review of the *fix* for the first,
and an accessibility specialist routed at planning for an unrelated feature). None was found by a
test, because until #14 no test existed for the boundary, and after #14 the tests found only what
they had been pointed at.

The five:

| # | Defect | Axis |
|---|---|---|
| #11 | `module_heatmap` aggregated internal tasks into per-module counts | row |
| #14 | Reports tree returned internal task names | row |
| #15 | Sub-activity endpoints returned raw models — every column of every task | field |
| #24 | *(not a leak — the floating-surface work that exposed how the gates were reasoned about)* | — |
| #26 | Three planning levels serialised with `attributesToArray()`; then **five more endpoints** found in review of that fix | field |

## The question this ADR was opened to answer

iTrack has two Client-scoping mechanisms and no stated rule for when each applies:

- **Row-level** — `visibility`, `Project::accessibleTo()`, `DetailedActivity::scopeVisibleTo()`.
  Decides *which records* a Client receives.
- **Field-level** — a Client branch inside an API Resource. Decides *which columns* of a record a
  Client receives.

`BugResource` uses only the first. `DetailedActivityResource` uses both. **Neither is wrong on its
face, and that is precisely the problem**: there is nothing for a reviewer to check a new resource
against, so a gap and a decision look identical in a diff.

This surfaced through a *false positive*. `BugResource` was flagged for returning `priority` to
Clients on the grounds that `DetailedActivityResource` withholds it. But `BugTracker.jsx:402/:421`
render the Priority column **ungated** while gating `Status` behind `!isClient` — the file
demonstrably knows how to gate a column and chose not to gate that one — and spec 017 treats priority
as a core bug attribute. Withholding it would have broken the Client bug list. **The finding was
wrong; the absence of a rule that would have settled it in one step was not.**

## Decision 1 — the rule

**Row scoping decides what a Client can see. Field scoping decides what a Client can see *about* it.
A resource needs both whenever its model carries a column that is internal to how the work is run
rather than a property of the work itself.**

Concretely, for the task tree: names, dates, status and progress describe the work. `responsible`,
`support`, `output`, `sort_order`, `notes`, `root_cause`, `resolution`, `evidence`, `priority` and
`sprint_label` describe how a team runs it. The first set is a Client's business; the second is not.

Two consequences that are not obvious:

- **A field's name does not carry its classification across models.** `priority` on a `Bug` is
  Client-facing by product decision; `priority` on a `DetailedActivity` is not. A rule expressed as a
  list of column names would have produced exactly the false positive above. The rule is about what
  the column *means on that model*, which is why it needs a human and cannot be a registry.
- **Row scoping alone is sufficient only when every column of the model is Client-appropriate.**
  `BugResource` comes close but **does not actually clear its own rule**, and this document asserted
  otherwise in its first draft. `BugResource` returns `reporter` and `owner` — internal staff names —
  and Decision 1 classifies `responsible` and `support` as internal *precisely because* they name
  internal staff. `reporter`/`owner` on a bug are `responsible`-shaped by that test.

  This is recorded rather than resolved because it may well be a deliberate product decision: a
  Client arguably should see who owns the bug they filed. But the rule and the exception must both be
  written down, or the next reader re-derives the false positive this ADR opens by describing.
  Filed with the open product question about `status` and `sprint_label` — the UI hides `status`
  while the API returns it, and that inconsistency should be resolved deliberately.

## Decision 2 — the finding that reframes the rule

**Constitution Principle II — "never a raw model or `toArray()`" — is not underspecified. It is
unenforced, and it was being violated on five live endpoints.**

This matters because the rule in Decision 1, on its own, **would not have prevented any of the four
field-axis instances.** Row-vs-field is guidance about how to write a Resource. All five endpoints
found in #26's review never reached a Resource at all:

```php
return $module->load('activities');
return $activity->load('subActivities');
return Project::with('modules')->accessibleTo($user)->get();
```

A rule about resource branches has no purchase on a method that returns an Eloquent model. **The
common cause is not a wrong axis; it is that serialisation shape is decided per controller method, so
any method returning a model silently opts out of both axes.**

## Decision 3 — the teeth

A rule without a mechanism is folklore, and this boundary has demonstrated that four times. Three
mechanisms, in the order they were added:

1. **A sentinel boundary test** (`ClientVisibilityBoundaryTest`, PR #14, extended #15/#26). Plants a
   value that must never reach a Client and asserts its absence from the whole response body of every
   listed route. Tests the *property*, not the filter — so a new endpoint that forgets the filter
   fails there rather than at the next audit.
   **Its limit, learned twice**: it only reads routes someone listed, and it only detects on axes
   someone planted a sentinel for. #15 existed because #14's sentinel was blind to fields. #26's
   review found five more endpoints because the list named three.

2. **A route-coverage guard** (`ClientReachableRouteCoverageTest`, this change). Enumerates every
   authenticated GET route and requires each to be either read by the boundary test or explicitly
   classified, with a reason. **Enumeration is the mechanism, not exercise** — proving each route
   safe needs fixtures per route and is impractical; forcing a one-line reviewable decision is cheap
   and cannot be satisfied by accident.
   Had it existed, `/api/modules/{module}/activities` would have been red the day it was written.

   **Its limit, and it is not theoretical.** The guard reaches a route only if nobody exempts it.
   Reviewing the very PR that added it, the architect found `/api/team-members` returning
   `TeamMember::all()` — the entire internal staff directory, each person's role and free-text
   description — to any project-assigned Client. It had been classified `NOT_CLIENT_REACHABLE` with
   the reason `'internal directory'`: a description of the *data*, not a server-side gate, which is
   the exact reasoning that list's own docblock rejects. The mechanism has a manual override, and
   the override is where the sixth defect was.

   That is still the guard working, in the strongest available sense: it forced a classification
   decision into a reviewable, greppable line that a human then got wrong. A route nobody listed
   would have left no trace at all.
   *A guard over internal **columns** was considered and rejected*: it needs a registry of which
   columns are internal — the same list that can drift — and it guards a failure mode that has never
   occurred. No new model has been the cause of any of the five.

3. **A shared withheld-field definition** (`HidesInternalPlanningFields`, PR #26) rather than a copy
   per resource. Three copies of a rule is how the row boundary came to be forgotten in seven places.

### What is deliberately *not* decided here

- **A gate on Principle II itself.** The obvious form — grep controllers for `return $model` — is the
  kind of source-text assertion this project has already been burned by twice (a gate anchored to a
  function name that passes when the function is renamed; a "dead utility" sweep that produced 87
  false positives and 0 true). The route-coverage guard reaches the same defects through a property
  that is actually checkable. If Principle II gets a direct gate later, it should be a response-shape
  assertion, not a grep.
- **`DetailedActivityResource` adopting the shared constant.** It still holds its own copy of the
  same four names, so the trait's claim to be the single definition is not yet true at the level it
  was copied from. That is a refactor of shipped code; it belongs with the next change to that file,
  not bundled here.

## Consequences

**Good.** A new authenticated GET route now forces a reviewable decision about Client reachability at
the moment it is written. The boundary test's blind spots are documented in the guard rather than
discovered — `REACHABLE_NOT_YET_PROVEN` names the rows whose sentinel cannot reach them, which is
the honest form of a coverage claim and the thing that would have caught #14's vacuous `reports` row.

**Costs.** The exemption lists must be maintained, and a wrong exemption is a silent hole — the guard
proves a route was *classified*, never that the classification was right. `NOT_CLIENT_REACHABLE`
therefore requires a server-side reason; "the UI never links there for a Client" is explicitly not
one, because that assumption is what left `WorkProgram.jsx:2476` as the only gate on three of four
Gantt row types until #26.

**Open, filed rather than deferred**: attachment download bypassing parent-task visibility (C2);
comments and attachments on hidden tasks, plus the existence oracle (M1); the 403 message oracle
(M2); `health_note` on raw `Project` models and the absence of a `ProjectResource` (M3); Support Ops
Department Head scoping. All are in `docs/outstanding-work.md`.

## A note on how this ADR was produced

Every count in it was measured, and two were wrong before they were right — the native-control census
returned 2, then 37, then 41 across three attempts, because a regex terminated on the `>` inside an
arrow function. **The guard added by this change was itself vacuous on first write**: it matched the
resolved middleware class name that `route:list` prints rather than the alias `gatherMiddleware()`
returns, enumerated zero routes, and passed. It was caught by tampering, and it now carries a canary
asserting the enumeration is non-empty.

That is the fifth instance in this sequence of a check that looked correct and measured nothing. It
is recorded here because it is the strongest available argument for the position this ADR takes:
**a mechanism is worth having only if you have watched it fail.**
