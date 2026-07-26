import { useState } from 'react'
import {
  logSupportGeneration,
} from '@/lib/api'
import {
  MESSAGE_TEMPLATE_STAGES,
  renderMessageTemplate,
  renderFreeformPrefill,
  hasUnsavedFieldChange,
  isFilled,
} from '@/lib/supportTemplates'
import { GeneratorPanel } from '@/components/SupportGeneratorPanel'

/**
 * Support-Ops-specific fields injected into the shared TaskDetailModal via
 * its `supportFields` render prop (see TaskDetailModal.jsx). Originally lived
 * inline in SupportOps.jsx; extracted so 004-daily-operating-dashboard's
 * TodayDashboard.jsx can open the same modal with the same support fields
 * and the same 003-templates-prompt-generator generators (FR-008), without
 * duplicating this block a second time.
 *
 * 010-task-detail-tabs: narrowed to the Support tab's fields only — Evidence,
 * Root Cause, Resolution, and the Troubleshooting Packet generator moved to
 * the sibling ResolutionExtraFields.jsx (the Resolution tab). GeneratorPanel
 * moved to SupportGeneratorPanel.jsx and hasUnsavedFieldChange/isFilled to
 * @/lib/supportTemplates, all shared with ResolutionExtraFields.jsx.
 *
 * Render this with `key={\`${selectedIssue.id}-${savedVersion}\`}` from the
 * caller (`savedVersion`: a counter the caller bumps on every successful
 * save) so switching between issues, or a save landing while this modal
 * stays open (US3), remounts it — that's what resets the generator state
 * below (template/freeform text, copy status, generated-at timestamps),
 * replacing what used to be a manual multi-field reset in SupportOps.jsx's
 * openIssueDetail/closeIssueDetail. `savedVersion` covers the save case
 * (010-task-detail-tabs, found during review): without it, already-generated
 * text from before a save would keep showing after `selectedIssue` refreshes
 * to the new last-saved data — the dirty-warning would even go quiet, since
 * `form` now matches the fresh `selectedIssue`, while the visible generated
 * text is still stale, pre-save data. An earlier version of this fix keyed
 * on `selectedIssue.updated_at` instead, but that's server-serialized at
 * second precision — two saves inside the same second would share a key and
 * skip the remount. A caller-side counter has no such collision window.
 *
 * `onRecordClientUpdate(issueId, setForm)` is caller-supplied because each
 * page's "update my own local list of issues" logic differs (SupportOps.jsx
 * patches one flat list; TodayDashboard.jsx must instead re-fetch and
 * re-classify, since which section an issue belongs to can change).
 *
 * `readOnly` (009-support-ops-knowledge-base) — additive, defaults to
 * `false`. When `true`, every field here renders disabled, and the "Record
 * client update now" button and both Support Generators are not rendered at
 * all: generating a client-facing message for an issue being viewed purely
 * for historical reference isn't a coherent action here, independent of the
 * mutation question.
 */
export default function SupportIssueExtraFields({ form, setForm, selectedIssue, onRecordClientUpdate, showToast, readOnly = false }) {
  // Client message template generator (US1, 003-templates-prompt-generator).
  const [templateStage, setTemplateStage] = useState('acknowledgement')
  const [templateText, setTemplateText] = useState('')
  const [templateCopyStatus, setTemplateCopyStatus] = useState(null) // 'success' | 'error' | null
  const [templateGeneratedAt, setTemplateGeneratedAt] = useState(null)

  // Freeform client-update composer (US3). Per FR-014, `freeformText` MUST
  // NOT persist anywhere beyond this component's own state — no
  // localStorage/sessionStorage/backend draft-save.
  const [freeformText, setFreeformText] = useState('')
  const [freeformCopyStatus, setFreeformCopyStatus] = useState(null) // 'success' | 'error' | null
  const [freeformStartedAt, setFreeformStartedAt] = useState(null)

  // Client message template generator (US1). Reads selectedIssue —
  // never `form` — so generated text always reflects last-saved data,
  // matching what the generation-log endpoint's server-side audit
  // derivation independently sees (FR-016).
  const handleGenerateTemplate = () => {
    if (!selectedIssue) return

    const text = renderMessageTemplate(templateStage, {
      client_name: selectedIssue.client_name,
      name: selectedIssue.name,
    })
    setTemplateText(text)
    setTemplateCopyStatus(null)
    setTemplateGeneratedAt(new Date().toLocaleTimeString())

    if (selectedIssue.client_name?.trim()) {
      logSupportGeneration(selectedIssue.id, {
        artifact_type: 'template',
        template_stage: templateStage,
        issue_updated_at: selectedIssue.updated_at,
      }).catch((err) => console.error('Failed to log template generation:', err))
    }
  }

  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(templateText)
      setTemplateCopyStatus('success')
      showToast('Message copied to clipboard')
    } catch (err) {
      console.error('Clipboard copy failed:', err)
      setTemplateCopyStatus('error')
    }
  }

  // Freeform client-update composer (US3). Reads selectedIssue — never
  // `form` — same FR-016 discipline as the other generator. Every click
  // (first "Start" or a later "Reset") replaces the current body with a
  // fresh pre-fill, per FR-014 — there is no way to resume a previous draft.
  const handleStartFreeformDraft = () => {
    if (!selectedIssue) return

    setFreeformText(renderFreeformPrefill({
      client_name: selectedIssue.client_name,
      name: selectedIssue.name,
    }))
    setFreeformCopyStatus(null)
    setFreeformStartedAt(new Date().toLocaleTimeString())

    // Same gating rule as `template` (contracts/generation-log-api.md):
    // client name only — the freeform draft never includes tenant_name.
    if (selectedIssue.client_name?.trim()) {
      logSupportGeneration(selectedIssue.id, {
        artifact_type: 'draft',
        template_stage: null,
        issue_updated_at: selectedIssue.updated_at,
      }).catch((err) => console.error('Failed to log freeform draft start:', err))
    }
  }

  const handleCopyFreeform = async () => {
    try {
      await navigator.clipboard.writeText(freeformText)
      setFreeformCopyStatus('success')
      showToast('Draft copied to clipboard')
    } catch (err) {
      console.error('Clipboard copy failed:', err)
      setFreeformCopyStatus('error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="support-client-name" className="text-xs font-bold text-foreground">
            Client{!readOnly && !isFilled(form.client_name) && <span className="text-destructive ml-0.5">*</span>}
          </label>
          <input
            id="support-client-name"
            type="text"
            disabled={readOnly}
            value={form.client_name || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, client_name: e.target.value }))}
            className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="support-tenant-name" className="text-xs font-bold text-foreground">Tenant</label>
          <input
            id="support-tenant-name"
            type="text"
            disabled={readOnly}
            value={form.tenant_name || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, tenant_name: e.target.value }))}
            className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="support-channel" className="text-xs font-bold text-foreground">Channel</label>
          <input
            id="support-channel"
            type="text"
            disabled={readOnly}
            value={form.channel || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value }))}
            className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="support-client-priority" className="text-xs font-bold text-foreground">
            Client Priority{!readOnly && !isFilled(form.client_priority) && <span className="text-destructive ml-0.5">*</span>}
          </label>
          <select
            id="support-client-priority"
            value={form.client_priority || ''}
            disabled={readOnly}
            onChange={(e) => setForm((prev) => ({ ...prev, client_priority: e.target.value || null }))}
            className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <option value="">Not set</option>
            <option value="P1">P1 — update within 1 hour</option>
            <option value="P2">P2 — update within 4 hours</option>
            <option value="P3">P3 — update within 1 business day</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-foreground">Last client update</label>
          {!readOnly && (
            <button
              type="button"
              onClick={() => onRecordClientUpdate(form.id, setForm)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Record client update now
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {form.last_client_update_at
            ? new Date(form.last_client_update_at).toLocaleString()
            : 'No update recorded yet'}
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="support-next-action" className="text-xs font-bold text-foreground">Next Action</label>
        <textarea
          id="support-next-action"
          rows="2"
          disabled={readOnly}
          value={form.next_action || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, next_action: e.target.value }))}
          className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      {/* Copy-only generators (003-templates-prompt-generator). Always
          generated from selectedIssue (last-saved), never from `form` (this
          closure's in-progress, possibly-unsaved edits) — FR-016.
          hasUnsavedFieldChange only decides whether to show a warning hint;
          it never changes what gets generated. */}
      {!readOnly && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Support Generators
          </p>

          <GeneratorPanel
            title="Client Message Templates"
            controls={
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground" htmlFor="template-stage-select">
                    Message type
                  </label>
                  <select
                    id="template-stage-select"
                    value={templateStage}
                    onChange={(e) => setTemplateStage(e.target.value)}
                    className="text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {MESSAGE_TEMPLATE_STAGES.map((stage) => (
                      <option key={stage.key} value={stage.key}>{stage.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateTemplate}
                  className={
                    templateText
                      ? 'rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-all'
                      : 'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all'
                  }
                >
                  {templateText ? 'Regenerate' : 'Generate'}
                </button>
              </div>
            }
            hint="Generated from the last-saved issue details."
            dirtyWarning={
              hasUnsavedFieldChange(form, selectedIssue, ['client_name'])
                ? 'You have an unsaved Client edit above — save changes first to use it here.'
                : null
            }
            text={templateText}
            onTextChange={setTemplateText}
            onCopy={handleCopyTemplate}
            copyStatus={templateCopyStatus}
            generatedAt={templateGeneratedAt}
          />

          <GeneratorPanel
            title="Freeform Client Update"
            controls={
              <button
                type="button"
                onClick={handleStartFreeformDraft}
                className={
                  freeformText
                    ? 'rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-all'
                    : 'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all'
                }
              >
                {freeformText ? 'Reset draft' : 'Start freeform draft'}
              </button>
            }
            hint="Starts from the last-saved issue details — use this when none of the fixed message types fit."
            dirtyWarning={
              hasUnsavedFieldChange(form, selectedIssue, ['client_name'])
                ? 'You have an unsaved Client edit above — save changes first to use it here.'
                : null
            }
            text={freeformText}
            onTextChange={setFreeformText}
            onCopy={handleCopyFreeform}
            copyStatus={freeformCopyStatus}
            generatedAt={freeformStartedAt}
          />
        </div>
      )}
    </div>
  )
}
