# UI Contracts — 024

This feature exposes no HTTP API. Its contracts are the assistive-technology surface and the two
automated gates, which are the only things that can hold them.

## Contract 1 — The timeline bar's exposed semantics

| Property | Value | Criterion |
|---|---|---|
| element | native `<button type="button">` | 4.1.2 (A) |
| accessible name | `buildGanttBarLabel(row)` — identity, status, schedule | 4.1.2 (A), SC-002 |
| accessible description | `aria-describedby` → the `sr-only` node in the **left** pane | 1.3.1 (A) |
| keyboard | Enter and Space activate (native), same action as click | 2.1.1 (A) |
| focus | visible outline, `focus-visible` only | 2.4.7 (AA) |
| tab order | DOM order = row order within the bar track | 2.4.3 (A) |

Forbidden, each because it is a live anti-pattern rather than a hypothetical:
`role="grid"` (cannot span two subtrees; forces application mode) · positive `tabIndex` ·
`outline-none` · appending `"button"` to the name · appending `"Click timeline bar to edit"` ·
placing the description node **inside** the button (some AT swallow it into the name computation).

## Contract 2 — The role gate

```
canSeeContributor(role) → boolean          positive allowlist
```

| Input | Result |
|---|---|
| `Admin` / `Project Manager` / `Department Head` / `Team Member` | `true` |
| `Client` | `false` |
| `null`, `undefined`, `''`, unknown, future role | **`false`** |

The last row is the requirement, not an edge case: today's `role === 'Client'` returns `false` for
null and therefore **renders** the field before auth resolves.

**One definition, three visible consumers plus the formatter.** The formatter receives
`{ includeContributor }` — a decision — never the role.

## Contract 3 — `STATUS_FILL_TOKENS`

Seven entries, token **names** not values. Held by four assertions in `verify-contrast.py`:

1. enum coverage — every backend status has an entry (`pending` excluded: not in this endpoint's domain)
2. cross-surface agreement — `STATUS_FILL_TOKENS[s] === GANTT_STATUS_TOKENS[s].fill`, iterating
   over `STATUS_FILL_TOKENS` (seven keys; the Gantt map has eight)
3. 3:1 against the composited panel surface (`bg-muted/20` over `bg-card`)
4. component drift — `Reports.jsx` joins to the map **and no longer contains `matchStatusColor`**

5. **treatment distinctness** (SC-004, R15) — every pair sharing a fill has distinct glyph entries;
   every pair with distinct fills clears a stated ΔE00 under Brettel–Viénot–Mollon simulation. The
   measured object is the *treatment*, never the fill: a pairwise fill check fails by construction
   once the sanctioned pairs land.

Assertion 2 is what makes the deliberately-shared fills enforceable rather than folkloric:
`GANTT_STATUS_TOKENS` is the **register of which pairs may share**, which is what lets the amended
SC-005 call the sharing sanctioned rather than coincidental.

## Contract 4 — What the gates may and may not be cited for

| Gate | Proves | Does **not** prove |
|---|---|---|
| `verify-contrast.py` | token ratios, map completeness, cross-surface agreement | focusability, names, reading order, HCM |
| `verify-cascade.py` | what the browser actually computed, incl. forced-colors | anything about assistive-technology semantics |
| `node --test` | the assistive **string**, both directions | that it reaches the accessibility tree |
| manual matrix | everything above the line | — |

Recorded because a green gate has twice been cited in this project for a property it structurally
could not see.
