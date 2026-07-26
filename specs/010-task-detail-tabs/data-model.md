# Phase 1 Component Model: Task Detail Tabs & Completion Indicators

**No backend data model.** This feature introduces no table, column, migration, or endpoint (spec.md's Key Entities: none). What follows is the frontend component contract this feature changes — the closest equivalent to a "data model" for a presentation-only feature — mirroring how 009-support-ops-knowledge-base's own data-model.md ended with a frontend-only section for its `readOnly` addition.

## `TaskDetailModal` — prop contract changes

```text
Before:                                  After:
  extraFields(form, setForm, readOnly)     supportFields(form, setForm, readOnly)
                                            resolutionFields(form, setForm, readOnly)
```

Both new props are optional, exactly as `extraFields` was. `readOnly` (from 009) is unchanged in shape and meaning — passed through to both new render props exactly as it was to the one it replaces.

## Tab visibility decision (inside `TaskDetailModal`)

```js
const showSupportResolutionTabs =
  ['support', 'learning'].includes(task.work_type) &&
  typeof supportFields === 'function' &&
  typeof resolutionFields === 'function'
```

- `true` (today: `SupportOps.jsx`, `TodayDashboard.jsx`, `SupportOpsKnowledgeBase.jsx`, whenever the task being shown is a Support Ops issue): 5 tabs — Details, Support, Resolution, Comments, Files.
- `false` (today: every Kanban board task, and defensively any support-work-type task whose caller didn't supply both render props): 3 tabs — Details, Comments, Files, byte-identical to current behavior.

This check runs once per render from data `TaskDetailModal` already has (`task.work_type` on the prop it's already given, `supportFields`/`resolutionFields` on its own props) — no new data fetch, no new prop from a caller beyond the two render props themselves.

**Development-time guard for the mismatched case**: if `task.work_type` qualifies but only one (or neither) of `supportFields`/`resolutionFields` is supplied, `TaskDetailModal` logs a `console.warn` guarded by Vite's `import.meta.env.DEV` (stripped from production builds) naming the task and which prop is missing, before falling back to the 3-tab layout. No equivalent dev-only diagnostic exists elsewhere in this codebase today — this is a new, small, self-contained addition, not a reused pattern — but it turns "a future caller silently gets the plain layout" from a debugging mystery into an immediately visible signal during development, without affecting production behavior or requiring the caller to handle anything new.

## Completion helpers (in `@/lib/supportTemplates`, not the components — found during implementation)

**Correction (found during implementation)**: the original design called for `getSupportCompletion`/`getResolutionCompletion` to live in `SupportIssueExtraFields.jsx`/`ResolutionExtraFields.jsx` themselves, alongside the default component export each file already has. That trips this project's `react-refresh/only-export-components` lint rule (a component file may only export components, or Vite's Fast Refresh can't reliably hot-reload it) — the same constraint that already justified moving `GeneratorPanel`/`hasUnsavedFieldChange` out of `SupportIssueExtraFields.jsx` during task planning (contracts/task-detail-modal-contract.md). Both completion functions move to `@/lib/supportTemplates` instead — already the established home for this exact kind of pure, no-React helper (`isFilled`, `hasUnsavedFieldChange`) — rather than each component privately owning one:

```js
// @/lib/supportTemplates.js
export function isFilled(value) {
  return typeof value === 'string' && value.trim() !== ''
}

const SUPPORT_REQUIRED_FIELDS = ['client_name', 'client_priority']
const RESOLUTION_REQUIRED_FIELDS = ['root_cause', 'resolution']

export function getSupportCompletion(form) {
  return { complete: SUPPORT_REQUIRED_FIELDS.filter((f) => isFilled(form[f])).length, total: SUPPORT_REQUIRED_FIELDS.length }
}

export function getResolutionCompletion(form) {
  return { complete: RESOLUTION_REQUIRED_FIELDS.filter((f) => isFilled(form[f])).length, total: RESOLUTION_REQUIRED_FIELDS.length }
}
```

`SupportIssueExtraFields.jsx`/`ResolutionExtraFields.jsx` still import `isFilled` directly for their own per-field markers (below) — they just no longer each export their own completion function. `TaskDetailModal.jsx` imports both completion functions from `@/lib/supportTemplates` to render the tab-label pills.

**Correction (round-1 plan review)**: an earlier version of this helper used a plain `Boolean(form[f])` check, deliberately *not* trimming whitespace — reasoned at the time as "a live-typing indicator, not a stored-data gate." That reasoning didn't hold up: spec.md's own Assumptions state this feature "reuses [009's] existing definition[s] verbatim," and 009's actual inclusion rule already trims (`TRIM(root_cause) != ''`) — a whitespace-only value there is excluded from the knowledge base. Leaving the frontend indicator un-trimmed would let it say "2/2 complete" for an issue 009 would still treat as unresolved, directly undermining SC-002's promise that a tab label tells the truth about whether an issue's information is "fully recorded." `isFilled` now matches 009's blankness rule exactly, keeping the "reuses verbatim" claim true in substance, not just in the field names reused.

`TaskDetailModal` calls both only when `showSupportResolutionTabs` is `true`, to render each tab's label:

```jsx
<button role="tab" ...>
  Support
  {showSupportResolutionTabs && (
    <span className="ml-1 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold">
      {supportCompletion.complete}/{supportCompletion.total}
    </span>
  )}
</button>
```

Same shape for the Resolution tab, using `getResolutionCompletion`. Both counts recompute on every render, since they read live `form` state — no memoization needed at this scale (two fields checked per function, on a form the user is actively editing, not a large list).

## Per-field required marker (rendered inside `SupportIssueExtraFields`/`ResolutionExtraFields` themselves)

Each required field's `<label>` conditionally renders a marker when its own value is empty and the field is not read-only — using the same `isFilled` helper the tab-label count uses, not a second, differently-behaved check, so a field can never show "no marker" while its tab's badge simultaneously counts it as missing (or vice versa):

```jsx
<label htmlFor="support-client-name" className="text-xs font-bold text-foreground">
  Client{!readOnly && !isFilled(form.client_name) && <span className="text-destructive ml-0.5">*</span>}
</label>
```

No new prop or state needed — each component already receives `form` and `readOnly`; `isFilled` is imported from `@/lib/supportTemplates`, the same helper `getSupportCompletion`/`getResolutionCompletion` are built on.

## Save-time summary (state added to `TaskDetailModal`)

```js
// showMissingSummary is the only state; `missingSummary` itself is a const
// recomputed every render, never frozen at save time — see the note below.
const [showMissingSummary, setShowMissingSummary] = useState(false)
const missingSummary = showMissingSummary && showSupportResolutionTabs ? computeMissing(form) : null // null | { support: [...], resolution: [...] }

const handleSubmit = async (e) => {
  e.preventDefault()
  if (readOnly) return
  setIsSaving(true)
  try {
    const result = await onSave(form)
    if (result !== false) {
      const missing = showSupportResolutionTabs ? computeMissing(form) : null // null or {support:[], resolution:[]}, omitting empty groups
      if (missing) {
        setShowMissingSummary(true)   // modal stays open — see research.md's decision
      } else {
        onClose()                    // unchanged from today
      }
    }
  } finally {
    setIsSaving(false)
  }
}
```

`computeMissing(form)` is a small helper (in `@/lib/supportTemplates`, alongside `getSupportCompletion`/`getResolutionCompletion`) built from the same two functions' field lists and the same `isFilled` check (not a third source of truth or a fourth blankness definition — it reuses `['client_name', 'client_priority']`/`['root_cause', 'resolution']` to name *which* fields are missing, where `getSupportCompletion`/`getResolutionCompletion` only report *how many*). The summary itself renders as a dismissible banner above the tab bar, listing each missing field grouped by tab name (e.g., "Resolution is missing: Root Cause"), dismissed via the modal's existing Close/X controls — no separate acknowledgment control is introduced (FR-012's "never a blocking confirmation").

**Why `missingSummary` is derived, not stored directly (found during review)**: an earlier draft stored the `{support, resolution}` object itself in state, frozen at the moment of save. That let the banner keep reporting a field as missing after the user filled it in post-save — directly disagreeing with the tab-label pill sitting right next to it, which reads live `form`. Storing only the boolean `showMissingSummary` and recomputing `missingSummary` from live `form` on every render means the banner and the pills can never disagree, and filling in everything the banner flagged makes it disappear on its own, no extra dismiss logic needed for that case.

`showMissingSummary` resets to `false` in the same `useEffect` that already resets `form`/`modalTab`/counts whenever a different task is opened, so it never leaks from one issue into the next.

**Correction (found during review)**: `handleIssueSave` in `SupportOps.jsx`/`TodayDashboard.jsx` must patch `selectedIssue` from the save response, not only their issue list/dashboard state. Before US3, every successful save closed the modal immediately, so `selectedIssue` going stale after a save never mattered. Now that a save with missing fields keeps the modal open, `selectedIssue` — the last-saved source `SupportIssueExtraFields`/`ResolutionExtraFields`' generators read from per FR-016 — would otherwise still hold pre-save data while the user keeps working in the still-open modal. Both handlers now do `setSelectedIssue((prev) => (prev && prev.id === formData.id ? { ...prev, ...updated } : prev))` using the same `updated` object already extracted from the save response for the list/dashboard update.

**Correction (found during review)**: patching `selectedIssue` alone isn't enough — `SupportIssueExtraFields`/`ResolutionExtraFields` were keyed only on `selectedIssue.id`, so a save-triggered `selectedIssue` refresh didn't remount them, leaving already-generated template/freeform/packet text visibly stale (generated from pre-save data) even though the dirty-warning had gone quiet (`form` now matches the refreshed `selectedIssue`). `SupportOps.jsx`/`TodayDashboard.jsx` each now hold a `savedVersion` counter (`useState(0)`, bumped in `handleIssueSave` right after `setSelectedIssue`) and key both components on `` `${selectedIssue.id}-${savedVersion}` ``, so a save remounts them and clears their generator state, exactly as switching issues already did. `SupportOpsKnowledgeBase.jsx` keeps a plain `selectedIssue.id` key — its view is always `readOnly`, so no save (and thus no `handleIssueSave`/`savedVersion`) ever exists there.

**Correction (found during review)**: an earlier version of the fix above keyed on `` `${selectedIssue.id}-${selectedIssue.updated_at}` `` instead of a counter. `updated_at` is serialized via `toIso8601String()` (`SupportIssueResource.php`) off a column created by Laravel's default `$table->timestamps()`, which is second-precision — two saves of the same issue inside the same wall-clock second would produce an identical key and silently skip the remount. A caller-local `savedVersion` counter has no such collision window, since it increments once per successful save regardless of timing.

## State affected inside `TaskDetailModal`

| State | Change |
|---|---|
| `modalTab` | Same variable, now takes one of 5 values instead of 3 (`'details' \| 'support' \| 'resolution' \| 'comments' \| 'files'`) when `showSupportResolutionTabs` is true. |
| `showMissingSummary` | New, boolean. `false` unless a save just completed with something missing; `missingSummary` itself is a derived `const`, not state (see above). |
| `form`, `commentCount`, `fileCount`, `isSaving` | Unchanged. |

No change to `TaskComments`/`TaskFiles` beyond what 009 already added (`readOnly`) — this feature's tab restructuring only concerns the Details/Support/Resolution grouping.
