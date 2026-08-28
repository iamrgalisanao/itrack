# Data Model — 024 Accessibility Remediation

**No persisted data, no schema, no migrations.** This feature ships no PHP. The "model" is three
client-side structures and the contracts they hold with the surfaces that render them.

---

## Entity: Gantt accessible text (new)

Produced by `frontend/src/lib/ganttA11y.js`. Pure functions with no React dependency — that is
deliberate and load-bearing: the repository has no component test runner, so a formatter embedded in
JSX cannot be tested at all (see research.md R4).

### `buildGanttBarLabel(row) → string`

The button's accessible **name**. Identity only.

| Part | Source | Rule |
|---|---|---|
| code | `row.code` | prefix when present |
| name | `row.name` | truncate at **~80 chars on a word boundary** |
| status | `getGanttStatusLabel(row.status)` | never the raw `row.status` |
| dates | `formatDate(...)` | never ISO |
| progress | `row.progress` | percentage |

> `M1.2 Foundation works — Delayed, 12 Mar to 30 Apr 2026, 45% complete`

**80 chars, not 40.** The name is the only thing distinguishing rows; aggressive truncation
manufactures duplicates. **Never append "button"** — the role supplies it (4.1.2 anti-pattern).
**Never append "Click timeline bar to edit"** — FR-005; delete that string at `:2775-2777` rather
than rephrasing it.

### `buildGanttBarDescription(row, { includeContributor }) → string`

The `sr-only` node's content. Detail only — the fields the row summary does not already carry.

| Field | In left pane already? | In description |
|---|---|---|
| Level | no | **yes** |
| Planned vs Actual dates | partially (compressed range) | **yes** |
| Duration | no | **yes** |
| Progress | no | **yes** |
| Status | yes | no — in the name |
| Contributor | yes, role-gated | **only when `includeContributor`** |

**Takes the decision, not the role.** It must not re-derive the rule; that is what "single shared
definition" in FR-007 means.

### `canSeeContributor(role) → boolean`

A **positive allowlist** over the four non-Client `User::ROLE_*` values.

**The direction is the requirement.** The current `isClient = user?.role === 'Client'`
(`WorkProgram.jsx:177-178`) fails **open**: `useEffectiveUser()` returns null before auth resolves, so
`isClient === false` and the contributor renders. An allowlist returns `false` for null, unknown, and
future roles. Consumed by the formatter **and** by the three visible sites (`:2434`, `:2469`,
`:2767`) — using it in one and leaving `!isClient` in the other recreates the divergence FR-007
forbids.

---

## Entity: Status fill map (new)

`STATUS_FILL_TOKENS` in `frontend/src/lib/taskStatus.js` — an additive sibling to
`GANTT_STATUS_TOKENS`.

**Do not rename or generalise `ganttPalette.js`.** `verify-contrast.py` anchors its parse to the
literal export name `GANTT_STATUS_TOKENS`, and two tamper proofs were built around that anchor. An
additive sibling costs nothing and disturbs none of it.

Stores **token names**, never values — the property that makes the gate able to read it, and the
defect 022 and 023 both closed.

| Status | fill token | Shared with |
|---|---|---|
| `backlog` | `muted-foreground` | `not_started` |
| `not_started` | `muted-foreground` | `backlog` |
| `in_progress` | `info` | — |
| `for_review` | `warning` | — |
| `completed` | `success` | — |
| `blocked` | `destructive` | `delayed` |
| `delayed` | `destructive` | `blocked` |

**Seven values. Not eight** — `pending` is synthesised client-side by `getRollupStatus` for parent
rows and never reaches `/api/reports` (research.md R6). Including it would encode a false claim about
the endpoint.

**Shared fills are intentional and must stay shared** (research.md R9). The invariant that protects
them is the cross-surface assertion below, not a comment.

---

## Entity: Status breakdown row (reshaped)

One row per status in the Reports chart. Currently derived inline from `Object.entries` inside the
render map; becomes an explicit seven-row structure driven by `STATUS_ORDER`.

| Field | Rule |
|---|---|
| `status` | from `STATUS_ORDER` — **all seven, always**, so a zero is a present row reading `0` rather than an absent one |
| `count` | `breakdown[status] ?? 0` — indexed, not iterated, which also makes it immune to `countBy`'s empty-collection serialisation |
| `share` | `count / total` where `total = Σ counts`, computed **once outside the map** |
| `width` | `count === 0 ? 0 : max(0.25rem, share × 100%)` |

**The floor is a detectability aid, not the quantity channel** — legitimate only because the count is
printed beside it (research.md R8).

---

## The contracts

Four invariants. Each one is the *machine-checkable* form of a requirement, and each exists because
the equivalent was previously left to a comment and drifted.

1. **Enum coverage** — every status in the backend enum union has an entry in `STATUS_FILL_TOKENS`.
   *This is the assertion that would have caught the original defect, where three statuses fell
   through `default` to one violet.*
2. **Cross-surface agreement** — `STATUS_FILL_TOKENS[s] === GANTT_STATUS_TOKENS[s].fill` for every
   status. *FR-011 and SC-005 as a machine check. The most valuable of the four: it is what stops a
   future contributor "fixing" the shared `--destructive` by inventing a hue for `delayed`, which
   would reopen what 023 closed. It makes the deliberate sharing enforceable rather than folkloric.*
3. **Non-text tier** — each distinct fill ≥ 3:1 against the surface the chart renders on. The panel is
   `bg-muted/20` over `bg-card`, so the composite must be computed, not the base.
4. **Component drift** — `Reports.jsx` contains the literal joining it to the map, **and does not
   contain `matchStatusColor`**. *The negative literal is the one that earns its place: it prevents
   the old switch being quietly reintroduced beside the new map, which is how a fixed function grows
   a second copy.*

## Values

`--input`, changed. Everything else in this feature reuses existing tokens.

| | light | dark |
|---|---|---|
| before | `#e5e4e7` | `#2e303a` |
| after | `#86868e` | `#737a88` |
| vs `--background` | 1.27 → **3.61** | 1.36 → **4.15** |
| vs `--card` | 1.27 → **3.61** | 1.28 → **3.89** |
| vs `--popover` | — → **3.61** | 1.15 → **3.49** |

These are `--popover-border`'s existing values. Zero new colour decisions (research.md R11).

## State transitions

None persisted. Two client-side states are added:

- **Focus** on a timeline bar — reveals the detail card via `group-focus-visible`, **not**
  `group-focus`, or a mouse click pins the card open behind the modal it just launched.
- **Dismissed** (`dismissedRowId`) — *only if* Scenario 4 is implemented literally. One state on the
  pane, never one per row inside a ~50-row map. Open decision, carried to tasks.md.

## Consumers

- `WorkProgram.jsx` — the bar, the chevron, the card, the three contributor sites
- `Reports.jsx` — the chart, the risk tiles; `matchStatusColor` **deleted**
- `GroupSummaryBar.jsx` — glyph, legend, separator
- `taskStatus.js` — gains `STATUS_FILL_TOKENS`; its raw-palette segment classes retokenised
- `scripts/verify-contrast.py`, `scripts/verify-cascade.py` — read these as data
- **Unchanged, referenced as the vocabulary of record**: `ganttPalette.js`
