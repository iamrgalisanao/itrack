import { useState } from 'react'
import { AlertTriangle, ShieldAlert, Copy } from 'lucide-react'
import {
  logSupportGeneration,
} from '@/lib/api'
import {
  MESSAGE_TEMPLATE_STAGES,
  renderMessageTemplate,
  renderFreeformPrefill,
  renderTroubleshootingPacket,
} from '@/lib/supportTemplates'

// True if any of `fields` differs between the modal's in-progress `form`
// and the last-saved `issue` — used only to show a "you have unsaved
// edits" hint (FR-016's read source itself is always `selectedIssue`,
// never `form`; this check never changes what gets generated, only whether
// a warning is shown before the user clicks Generate).
function hasUnsavedFieldChange(form, issue, fields) {
  if (!form || !issue) return false
  return fields.some((field) => (form[field] || '') !== (issue[field] || ''))
}

/**
 * Shared chrome for all three copy-only generators (client message
 * templates, freeform draft, troubleshooting packet — 003-templates-
 * prompt-generator). Visually distinct from the surrounding editable issue
 * fields so it reads as a separate "generate → review → copy" tool, not
 * another form section that gets saved with the issue.
 */
function GeneratorPanel({ title, controls, hint, dirtyWarning, text, onTextChange, onCopy, copyStatus, monospace, textareaRows = 4, generatedAt }) {
  // Derived from `title` (always unique per generator instance) rather than a
  // new required prop, so this stays a drop-in id/htmlFor pair without
  // changing the component's API.
  const textareaId = `generator-text-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/3 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-foreground">{title}</p>

      {controls}

      <p className="flex items-start gap-1.5 text-[11px]">
        {dirtyWarning ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" />
            <span className="font-semibold text-warning">{dirtyWarning}</span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {hint}
            {text && generatedAt ? ` Generated at ${generatedAt}.` : ''}
          </span>
        )}
      </p>

      {text && (
        <div className="space-y-2">
          <label htmlFor={textareaId} className="text-[11px] font-semibold text-muted-foreground">
            Generated message — editable before copying
          </label>
          <textarea
            id={textareaId}
            rows={textareaRows}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            className={`w-full rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary ${monospace ? 'font-mono text-xs' : 'text-sm'}`}
          />
          <button
            type="button"
            onClick={onCopy}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all"
          >
            <Copy className="h-3.5 w-3.5" />
            {copyStatus === 'success' ? 'Copied!' : 'Copy to clipboard'}
          </button>
          {copyStatus === 'error' && (
            <p className="text-xs text-destructive">
              Couldn't copy automatically — select the text above and copy manually.
            </p>
          )}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/80 border-t border-primary/10 pt-2">
        <ShieldAlert className="h-3 w-3 mt-0.5 shrink-0 text-primary/70" />
        <span>May contain personal information — handle per the Data Privacy Act of 2012 (RA 10173) before sharing outside this system.</span>
      </p>
    </div>
  )
}

/**
 * Support-Ops-specific fields injected into the shared TaskDetailModal via
 * its `extraFields` render prop (see TaskDetailModal.jsx). Originally lived
 * inline in SupportOps.jsx; extracted so 004-daily-operating-dashboard's
 * TodayDashboard.jsx can open the same modal with the same support fields
 * and the same 003-templates-prompt-generator generators (FR-008), without
 * duplicating this ~250-line block a second time.
 *
 * Render this with `key={selectedIssue.id}` from the caller so switching
 * between issues remounts it — that's what resets the generator state below
 * (template/packet/freeform text, copy status, generated-at timestamps)
 * between issues, replacing what used to be a manual multi-field reset in
 * SupportOps.jsx's openIssueDetail/closeIssueDetail.
 *
 * `onRecordClientUpdate(issueId, setForm)` is caller-supplied because each
 * page's "update my own local list of issues" logic differs (SupportOps.jsx
 * patches one flat list; TodayDashboard.jsx must instead re-fetch and
 * re-classify, since which section an issue belongs to can change).
 */
export default function SupportIssueExtraFields({ form, setForm, selectedIssue, onRecordClientUpdate, showToast }) {
  // Client message template generator (US1, 003-templates-prompt-generator).
  const [templateStage, setTemplateStage] = useState('acknowledgement')
  const [templateText, setTemplateText] = useState('')
  const [templateCopyStatus, setTemplateCopyStatus] = useState(null) // 'success' | 'error' | null
  const [templateGeneratedAt, setTemplateGeneratedAt] = useState(null)

  // Troubleshooting packet generator (US2). Same FR-016 discipline as the
  // template generator above — reads selectedIssue, never `form`.
  const [packetText, setPacketText] = useState('')
  const [packetCopyStatus, setPacketCopyStatus] = useState(null) // 'success' | 'error' | null
  const [packetGeneratedAt, setPacketGeneratedAt] = useState(null)

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

  // Troubleshooting packet generator (US2). Reads selectedIssue — never
  // `form` — same FR-016 discipline as handleGenerateTemplate above.
  const handleGeneratePacket = () => {
    if (!selectedIssue) return

    const text = renderTroubleshootingPacket({
      client_name: selectedIssue.client_name,
      tenant_name: selectedIssue.tenant_name,
      name: selectedIssue.name,
      description: selectedIssue.description,
      evidence: selectedIssue.evidence,
      root_cause: selectedIssue.root_cause,
      created_at: selectedIssue.created_at,
    })
    setPacketText(text)
    setPacketCopyStatus(null)
    setPacketGeneratedAt(new Date().toLocaleTimeString())

    // Packet-specific gating (contracts/generation-log-api.md): either
    // client_name OR tenant_name non-empty triggers logging — the packet is
    // the only artifact type where tenant_name matters for this decision.
    if (selectedIssue.client_name?.trim() || selectedIssue.tenant_name?.trim()) {
      logSupportGeneration(selectedIssue.id, {
        artifact_type: 'packet',
        template_stage: null,
        issue_updated_at: selectedIssue.updated_at,
      }).catch((err) => console.error('Failed to log packet generation:', err))
    }
  }

  const handleCopyPacket = async () => {
    try {
      await navigator.clipboard.writeText(packetText)
      setPacketCopyStatus('success')
      showToast('Packet copied to clipboard')
    } catch (err) {
      console.error('Clipboard copy failed:', err)
      setPacketCopyStatus('error')
    }
  }

  // Freeform client-update composer (US3). Reads selectedIssue — never
  // `form` — same FR-016 discipline as the other two generators. Every
  // click (first "Start" or a later "Reset") replaces the current body with
  // a fresh pre-fill, per FR-014 — there is no way to resume a previous draft.
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
    <div className="space-y-4 border-t border-border/60 pt-4">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Support Details
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="support-client-name" className="text-xs font-bold text-foreground">Client</label>
          <input
            id="support-client-name"
            type="text"
            value={form.client_name || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, client_name: e.target.value }))}
            className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="support-tenant-name" className="text-xs font-bold text-foreground">Tenant</label>
          <input
            id="support-tenant-name"
            type="text"
            value={form.tenant_name || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, tenant_name: e.target.value }))}
            className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="support-channel" className="text-xs font-bold text-foreground">Channel</label>
          <input
            id="support-channel"
            type="text"
            value={form.channel || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value }))}
            className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="support-client-priority" className="text-xs font-bold text-foreground">Client Priority</label>
          <select
            id="support-client-priority"
            value={form.client_priority || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, client_priority: e.target.value || null }))}
            className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
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
          <button
            type="button"
            onClick={() => onRecordClientUpdate(form.id, setForm)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Record client update now
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {form.last_client_update_at
            ? new Date(form.last_client_update_at).toLocaleString()
            : 'No update recorded yet'}
        </p>
      </div>

      {/* Copy-only generators (003-templates-prompt-generator).
          Client Message Templates is kept right below the core
          Client/Tenant/Priority fields (the only data it needs,
          already visible above) since it's the primary workflow for
          most visits to this modal. The Troubleshooting Packet
          needs Evidence/Root Cause too, so it's placed after those
          fields below instead — see the second panel further down.
          Always generated from selectedIssue (last-saved), never
          from `form` (this closure's in-progress, possibly-unsaved
          edits) — FR-016. hasUnsavedFieldChange only decides
          whether to show a warning hint; it never changes what
          gets generated. */}
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

      <div className="space-y-1.5">
        <label htmlFor="support-next-action" className="text-xs font-bold text-foreground">Next Action</label>
        <textarea
          id="support-next-action"
          rows="2"
          value={form.next_action || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, next_action: e.target.value }))}
          className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="support-evidence" className="text-xs font-bold text-foreground">Evidence</label>
        <textarea
          id="support-evidence"
          rows="2"
          value={form.evidence || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, evidence: e.target.value }))}
          className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="support-root-cause" className="text-xs font-bold text-foreground">Root Cause</label>
        <textarea
          id="support-root-cause"
          rows="2"
          value={form.root_cause || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, root_cause: e.target.value }))}
          className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="support-resolution" className="text-xs font-bold text-foreground">Resolution</label>
        <textarea
          id="support-resolution"
          rows="2"
          value={form.resolution || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, resolution: e.target.value }))}
          className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Placed after Evidence/Root Cause/Resolution above, since the
          packet reads all three — fill those in first, then generate. */}
      <GeneratorPanel
        title="Troubleshooting Packet"
        controls={
          <button
            type="button"
            onClick={handleGeneratePacket}
            className={
              packetText
                ? 'rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-all'
                : 'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all'
            }
          >
            {packetText ? 'Regenerate troubleshooting packet' : 'Generate troubleshooting packet'}
          </button>
        }
        hint="Generated from the last-saved issue details."
        dirtyWarning={
          hasUnsavedFieldChange(form, selectedIssue, ['client_name', 'tenant_name', 'evidence', 'root_cause'])
            ? 'You have unsaved edits above — save changes first to use them here.'
            : null
        }
        text={packetText}
        onTextChange={setPacketText}
        onCopy={handleCopyPacket}
        copyStatus={packetCopyStatus}
        monospace
        textareaRows={10}
        generatedAt={packetGeneratedAt}
      />
    </div>
  )
}
