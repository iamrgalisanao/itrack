# Contract: `TaskDetailModal` Prop Changes & Caller Updates

No backend contract exists for this feature (no new/changed endpoint). This documents the frontend component contract change and exactly which existing call sites must be updated to match it.

## `TaskDetailModal` (modified)

| Prop | Before | After |
|---|---|---|
| `extraFields` | `(form, setForm, readOnly) => JSX` — rendered once, inside the Details tab | **Removed.** |
| `supportFields` | — | **New, optional.** `(form, setForm, readOnly) => JSX` — rendered as the Support tab's body. |
| `resolutionFields` | — | **New, optional.** `(form, setForm, readOnly) => JSX` — rendered as the Resolution tab's body. |
| `task`, `onClose`, `onSave`, `userRole`, `eyebrowLabel`, `readOnly` | Unchanged | Unchanged |

**Tab count**: 5 tabs (Details, Support, Resolution, Comments, Files) when `task.work_type` is `support`/`learning` **and** both `supportFields`/`resolutionFields` are supplied; otherwise 3 tabs (Details, Comments, Files), byte-identical to today. No caller ever needs to declare which layout it wants — it follows from the task and the props supplied.

**Save behavior change**: a successful save auto-closes the modal exactly as today, **unless** the task qualifies for the 5-tab layout and at least one of its required fields (Client, Client Priority, Root Cause, Resolution) is currently blank — in that case, the save still completes, but the modal stays open showing a summary of what's missing, closable via the modal's existing Close/X controls. A task that doesn't qualify for the 5-tab layout (e.g., every Kanban task) is entirely unaffected by this — its saves behave exactly as they do today, always auto-closing.

## Caller updates required

### `frontend/src/pages/SupportOps.jsx`

Currently passes a single `extraFields={(form, setForm, readOnly) => <SupportIssueExtraFields ... readOnly={readOnly} />}`. Update to pass `supportFields={(form, setForm, readOnly) => <SupportIssueExtraFields ... readOnly={readOnly} />}` and `resolutionFields={(form, setForm, readOnly) => <ResolutionExtraFields ... readOnly={readOnly} />}`, splitting the props each currently-combined component needs (e.g., `onRecordClientUpdate`/generator-related callbacks stay with `SupportIssueExtraFields`; nothing Resolution-specific currently needs a callback beyond `form`/`setForm`/`readOnly`/`selectedIssue`).

### `frontend/src/pages/TodayDashboard.jsx`

Same change as `SupportOps.jsx` — identical `extraFields` usage today, identical split required.

### `frontend/src/pages/SupportOpsKnowledgeBase.jsx`

Same change, with `readOnly` always `true` (unchanged from 009) and `onRecordClientUpdate`/`showToast` continuing to be passed as the existing no-op stand-ins (009's Assumption: neither is ever actually invoked in read-only mode, since the button and generators that would call them don't render there).

### `frontend/src/pages/Kanban.jsx`

**No change.** It supplies neither `extraFields` today nor `supportFields`/`resolutionFields` after this change — its tasks are never `work_type: support/learning`, so it was never eligible for the 5-tab layout and remains on the unchanged 3-tab path automatically.

## New file: `frontend/src/components/SupportGeneratorPanel.jsx`

**Found during task planning, not in the original design pass**: `SupportIssueExtraFields.jsx` today defines two module-scoped helpers — `GeneratorPanel` (the presentational chrome every one of the three copy-only generators renders through) and `hasUnsavedFieldChange(form, issue, fields)` (the "you have an unsaved edit" warning check) — and neither is exported. All three generators use both today; after the split, the Troubleshooting Packet generator (moving to `ResolutionExtraFields.jsx`) still needs them, while Client Message Templates and Freeform Client Update (staying in `SupportIssueExtraFields.jsx`) still need them too. Leaving them where they are would force `ResolutionExtraFields.jsx` to either duplicate both (silent drift risk between the two files' generator chrome and warning logic from day one) or reach into a sibling module's private internals (not exported, so not actually possible without also exporting them anyway).

Resolution: extract both into this new file, exported, with zero behavior change — a pure move. Both `SupportIssueExtraFields.jsx` and `ResolutionExtraFields.jsx` import from it instead of either owning a copy.

**Correction (found during implementation)**: `hasUnsavedFieldChange` actually landed in `@/lib/supportTemplates` instead, not `SupportGeneratorPanel.jsx` — that file ended up component-only (`GeneratorPanel` alone), since it's a component file and Fast Refresh's `react-refresh/only-export-components` rule forbids it exporting a plain function alongside a component. `hasUnsavedFieldChange` moved to `@/lib/supportTemplates`, the codebase's established home for pure, no-React helpers, alongside `isFilled`. Every reference below to "`GeneratorPanel`/`hasUnsavedFieldChange` from `SupportGeneratorPanel.jsx`" should read as `GeneratorPanel` from `SupportGeneratorPanel.jsx` and `hasUnsavedFieldChange` from `@/lib/supportTemplates`.

## New file: `frontend/src/components/ResolutionExtraFields.jsx`

A new component, structured identically to the (narrowed) `SupportIssueExtraFields.jsx`: accepts `form`, `setForm`, `selectedIssue`, `showToast`, `readOnly`; renders Evidence, Root Cause, Resolution, and the Troubleshooting Packet generator (moved from `SupportIssueExtraFields.jsx`, along with its own local generator state — `packetText`/`packetCopyStatus`/`packetGeneratedAt`/`handleGeneratePacket`/`handleCopyPacket`), importing `GeneratorPanel` from `SupportGeneratorPanel.jsx` and `hasUnsavedFieldChange`/`isFilled` from `@/lib/supportTemplates` rather than duplicating any of them.

**Correction (found during implementation)**: does not itself export `getResolutionCompletion` — see the correction below.

## `SupportIssueExtraFields.jsx` (narrowed, not deleted)

Keeps: Client, Tenant, Channel, Client Priority, Last Client Update (+ record action), Next Action, Client Message Templates generator, Freeform Client Update generator, and their existing local state — now importing `GeneratorPanel` from `SupportGeneratorPanel.jsx` and `hasUnsavedFieldChange`/`isFilled` from `@/lib/supportTemplates` instead of defining them locally. Removes: Evidence, Root Cause, Resolution, and the Troubleshooting Packet generator (moved to `ResolutionExtraFields.jsx`). Gains: a required-field marker (`*`) on the Client and Client Priority labels per data-model.md.

**Correction (found during implementation)**: does not itself export `getSupportCompletion` — see below.

## Correction (found during implementation): completion functions live in `@/lib/supportTemplates`, not the two component files

The original design above had `SupportIssueExtraFields.jsx`/`ResolutionExtraFields.jsx` each export their own `getSupportCompletion`/`getResolutionCompletion`. That trips the same `react-refresh/only-export-components` constraint that justified the `SupportGeneratorPanel.jsx` extraction above — a component file may only export components. Both functions moved to `@/lib/supportTemplates` instead, alongside `isFilled`/`hasUnsavedFieldChange` (already living there), with their required-field lists (`SUPPORT_REQUIRED_FIELDS`/`RESOLUTION_REQUIRED_FIELDS`) as private module constants in that same file. `TaskDetailModal.jsx` imports both directly from `@/lib/supportTemplates` to render the tab-label completion pills; neither component file exports a completion function itself. Full detail in data-model.md's "Completion helpers" section.
