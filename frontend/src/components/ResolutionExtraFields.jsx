import { useState } from 'react'
import {
  logSupportGeneration,
} from '@/lib/api'
import {
  renderTroubleshootingPacket,
  hasUnsavedFieldChange,
  isFilled,
} from '@/lib/supportTemplates'
import { GeneratorPanel } from '@/components/SupportGeneratorPanel'

/**
 * 010-task-detail-tabs: the Resolution tab's fields — Evidence, Root Cause,
 * Resolution, and the Troubleshooting Packet generator — split out of
 * SupportIssueExtraFields.jsx (which keeps the Support tab's fields) so each
 * tab renders only its own content instead of one long combined form.
 * Structured identically to SupportIssueExtraFields.jsx: rendered via
 * TaskDetailModal's `resolutionFields` render prop, with
 * `key={\`${selectedIssue.id}-${savedVersion}\`}` from the caller so
 * switching issues — or a save while this modal stays open (US3) — remounts
 * it, resetting the Troubleshooting Packet generator state below (see
 * SupportIssueExtraFields.jsx's doc comment for why a caller-side
 * `savedVersion` counter is in the key, not just `id`).
 *
 * `readOnly` — when `true`, every field renders disabled and the
 * Troubleshooting Packet generator is not rendered at all, matching
 * SupportIssueExtraFields.jsx's own readOnly behavior (009-support-ops-
 * knowledge-base).
 */
export default function ResolutionExtraFields({ form, setForm, selectedIssue, showToast, readOnly = false }) {
  // Troubleshooting packet generator. Reads selectedIssue, never `form` —
  // FR-016: generated text always reflects last-saved data, matching what
  // the generation-log endpoint's server-side audit derivation independently
  // sees.
  const [packetText, setPacketText] = useState('')
  const [packetCopyStatus, setPacketCopyStatus] = useState(null) // 'success' | 'error' | null
  const [packetGeneratedAt, setPacketGeneratedAt] = useState(null)

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

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="support-evidence" className="text-xs font-bold text-foreground">Evidence</label>
        <textarea
          id="support-evidence"
          rows="2"
          disabled={readOnly}
          value={form.evidence || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, evidence: e.target.value }))}
          className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="support-root-cause" className="text-xs font-bold text-foreground">
          Root Cause{!readOnly && !isFilled(form.root_cause) && <span className="text-destructive ml-0.5">*</span>}
        </label>
        <textarea
          id="support-root-cause"
          rows="2"
          disabled={readOnly}
          value={form.root_cause || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, root_cause: e.target.value }))}
          className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="support-resolution" className="text-xs font-bold text-foreground">
          Resolution{!readOnly && !isFilled(form.resolution) && <span className="text-destructive ml-0.5">*</span>}
        </label>
        <textarea
          id="support-resolution"
          rows="2"
          disabled={readOnly}
          value={form.resolution || ''}
          onChange={(e) => setForm((prev) => ({ ...prev, resolution: e.target.value }))}
          className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>

      {/* Placed after Evidence/Root Cause/Resolution above, since the
          packet reads all three — fill those in first, then generate. */}
      {!readOnly && (
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
      )}
    </div>
  )
}
