import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  fetchProjects,
  fetchSupportIssues,
  createSupportIssue,
  updateDetailedActivity,
  logSupportGeneration,
} from '@/lib/api'
import {
  MESSAGE_TEMPLATE_STAGES,
  renderMessageTemplate,
  renderFreeformPrefill,
  renderTroubleshootingPacket,
} from '@/lib/supportTemplates'
import TaskDetailModal from '@/components/TaskDetailModal'
import {
  MessagesSquare,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Plus,
  X,
  ShieldAlert,
  Copy,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const EMPTY_INTAKE_FORM = {
  name: '',
  client_name: '',
  client_priority: '',
  tenant_name: '',
  channel: '',
  timestamp: '',
  affected_area: '',
  expected_behavior: '',
  actual_behavior: '',
  evidence: '',
  next_action: '',
}

// Support Ops columns map onto the same status values the general Kanban
// Board reads and writes — moving a card here updates the same underlying
// task record. "Needs Info" covers both `blocked` and `delayed`, matching
// Kanban.jsx's existing equivalence for those two statuses; writes from
// this board always use `blocked` (not `delayed`), same as Kanban does.
const COLUMNS = [
  { id: 'backlog', label: 'Intake', color: 'border-t-slate-400 dark:border-t-slate-600 bg-slate-500/5' },
  { id: 'blocked', label: 'Needs Info', color: 'border-t-destructive/60 bg-destructive/5' },
  { id: 'not_started', label: 'Needs Investigation', color: 'border-t-primary/60 bg-primary/5' },
  { id: 'in_progress', label: 'Investigating', color: 'border-t-blue-500 bg-blue-500/5' },
  { id: 'for_review', label: 'Client Update Due', color: 'border-t-amber-500 bg-amber-500/5' },
  { id: 'completed', label: 'Resolved', color: 'border-t-emerald-500 bg-emerald-500/5' },
]

// P1/P2 thresholds are wall-clock; P3 is "1 business day" — advance one
// calendar day, then skip forward over a weekend if the advance lands on
// one. Public holidays are not accounted for in this Phase 1 pass.
const STALE_THRESHOLD_MS = { P1: 60 * 60 * 1000, P2: 4 * 60 * 60 * 1000 }

function addOneBusinessDay(date) {
  const result = new Date(date)
  result.setDate(result.getDate() + 1)
  while (result.getDay() === 0 || result.getDay() === 6) {
    result.setDate(result.getDate() + 1)
  }
  return result
}

// Returns 'stale' | 'fresh' | 'no-priority' | null. `null` means "don't show
// any staleness state at all" — used for Resolved issues, which are never
// flagged regardless of how old last_client_update_at is (spec US3 Scenario 3).
function getStalenessState(issue, now = new Date()) {
  if (issue.status === 'completed') return null
  if (!issue.client_priority || !STALE_THRESHOLD_MS[issue.client_priority] && issue.client_priority !== 'P3') {
    return 'no-priority'
  }

  // No explicit client update recorded yet — the clock starts from when the
  // issue was first logged, since that's the last known point of contact.
  const referenceTime = issue.last_client_update_at || issue.created_at
  if (!referenceTime) return 'no-priority'

  const reference = new Date(referenceTime)

  if (issue.client_priority === 'P3') {
    return now >= addOneBusinessDay(reference) ? 'stale' : 'fresh'
  }

  return now.getTime() - reference.getTime() >= STALE_THRESHOLD_MS[issue.client_priority] ? 'stale' : 'fresh'
}

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
          <label className="text-[11px] font-semibold text-muted-foreground">
            Generated message — editable before copying
          </label>
          <textarea
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

export default function SupportOps() {
  const { user } = useAuth()
  const userRole = user?.role

  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [draggedOverColumn, setDraggedOverColumn] = useState(null)
  const [toast, setToast] = useState(null)

  // Quick intake — no project picker of its own; it always attaches to
  // whichever project is currently selected on the board above.
  const [isIntakeOpen, setIsIntakeOpen] = useState(false)
  const [intakeForm, setIntakeForm] = useState(EMPTY_INTAKE_FORM)
  const [intakeErrors, setIntakeErrors] = useState({})
  const [isSubmittingIntake, setIsSubmittingIntake] = useState(false)

  // Issue detail view — shared TaskDetailModal, see its extraFields usage below.
  const [selectedIssue, setSelectedIssue] = useState(null)

  // Client message template generator (US1, 003-templates-prompt-generator).
  // Lives here (not inside the extraFields render-prop closure) because it's
  // React state — extraFields is called during TaskDetailModal's render, not
  // itself a component. Generation always reads selectedIssue (last-saved),
  // never TaskDetailModal's local `form` (FR-016) — see openIssueDetail/
  // closeIssueDetail below, which reset this alongside the issue selection.
  const [templateStage, setTemplateStage] = useState('acknowledgement')
  const [templateText, setTemplateText] = useState('')
  const [templateCopyStatus, setTemplateCopyStatus] = useState(null) // 'success' | 'error' | null
  const [templateGeneratedAt, setTemplateGeneratedAt] = useState(null)

  // Troubleshooting packet generator (US2). Same FR-016 discipline as the
  // template generator above — reads selectedIssue, never `form`.
  const [packetText, setPacketText] = useState('')
  const [packetCopyStatus, setPacketCopyStatus] = useState(null) // 'success' | 'error' | null
  const [packetGeneratedAt, setPacketGeneratedAt] = useState(null)

  // Freeform client-update composer (US3). Same FR-016 discipline. Per
  // FR-014, `freeformText` MUST NOT persist anywhere beyond this component's
  // own state — no localStorage/sessionStorage/backend draft-save — so
  // resetting it in openIssueDetail/closeIssueDetail (and on every fresh
  // "Start freeform draft" click) is the entire persistence story.
  const [freeformText, setFreeformText] = useState('')
  const [freeformCopyStatus, setFreeformCopyStatus] = useState(null) // 'success' | 'error' | null
  const [freeformStartedAt, setFreeformStartedAt] = useState(null)

  const openIssueDetail = (issue) => {
    setSelectedIssue({ ...issue })
    setTemplateStage('acknowledgement')
    setTemplateText('')
    setTemplateCopyStatus(null)
    setTemplateGeneratedAt(null)
    setPacketText('')
    setPacketCopyStatus(null)
    setPacketGeneratedAt(null)
    setFreeformText('')
    setFreeformCopyStatus(null)
    setFreeformStartedAt(null)
  }

  const closeIssueDetail = () => {
    setSelectedIssue(null)
    setTemplateStage('acknowledgement')
    setTemplateText('')
    setTemplateCopyStatus(null)
    setTemplateGeneratedAt(null)
    setPacketText('')
    setPacketCopyStatus(null)
    setPacketGeneratedAt(null)
    setFreeformText('')
    setFreeformCopyStatus(null)
    setFreeformStartedAt(null)
  }

  // Board filters (US5) — client-side, applied over whatever's currently
  // fetched. `includeLearning` is different: it controls the server fetch
  // scope itself (FR-012 — learning entries are never fetched by default).
  const [filters, setFilters] = useState({ client: 'all', tenant: 'all', priority: 'all', needsUpdateOnly: false })
  const [includeLearning, setIncludeLearning] = useState(false)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Load projects initially
  useEffect(() => {
    fetchProjects()
      .then((res) => {
        const list = res.data.data || res.data
        setProjects(list)
        if (list.length > 0) {
          setSelectedProjectId(list[0].id)
        } else {
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('Failed to fetch projects:', err)
        setLoading(false)
      })
  }, [])

  // Load support issues for the selected project. `learning` controls the
  // server-side fetch scope (FR-012) — separate from the client-side
  // `filters` state, which only narrows what's already been fetched.
  const loadIssues = async (projectId, learning = includeLearning) => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await fetchSupportIssues(projectId, learning ? 'support,learning' : 'support')
      setIssues(res.data.data || res.data)
    } catch (err) {
      console.error('Failed to load Support Ops issues:', err)
      showToast('Failed to load support issues', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedProjectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
      loadIssues(selectedProjectId, includeLearning)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadIssues is recreated every render; including it would loop
  }, [selectedProjectId, includeLearning])

  const toggleLearning = () => setIncludeLearning((prev) => !prev)

  // Client-side filters (US5) — applied over whatever's currently fetched,
  // before grouping into columns. `needsUpdateOnly` reuses the same
  // staleness computation from US3 rather than a second source of truth.
  const uniqueValues = (field) => ['all', ...new Set(issues.map((i) => i[field]).filter(Boolean))]
  const uniqueClients = uniqueValues('client_name')
  const uniqueTenants = uniqueValues('tenant_name')

  const visibleIssues = issues.filter((issue) => {
    if (filters.client !== 'all' && issue.client_name !== filters.client) return false
    if (filters.tenant !== 'all' && issue.tenant_name !== filters.tenant) return false
    if (filters.priority === 'none' && issue.client_priority) return false
    if (filters.priority !== 'all' && filters.priority !== 'none' && issue.client_priority !== filters.priority) return false
    if (filters.needsUpdateOnly && getStalenessState(issue) !== 'stale') return false
    return true
  })

  // Group issues by column — Needs Info covers both blocked and delayed,
  // matching Kanban.jsx's existing equivalence for those two statuses.
  const getIssuesByColumn = (colId) => {
    return visibleIssues.filter((issue) => {
      if (colId === 'blocked') {
        return issue.status === 'blocked' || issue.status === 'delayed'
      }
      return issue.status === colId
    })
  }

  // Moving a card writes the same `status` field the Kanban Board already
  // reads/writes on this task record.
  const updateIssueStatus = async (issueId, newStatus) => {
    const issue = issues.find((i) => i.id === issueId)
    if (!issue) return
    const originalStatus = issue.status

    setIssues((prev) =>
      prev.map((i) => (i.id === issueId ? { ...i, status: newStatus } : i))
    )

    try {
      await updateDetailedActivity(issueId, { status: newStatus })
      showToast(`Issue moved to ${COLUMNS.find((c) => c.id === newStatus)?.label}`)
    } catch (err) {
      console.error('Failed to update issue status:', err)
      showToast('Failed to move issue', 'error')
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, status: originalStatus } : i))
      )
    }
  }

  const handleDragStart = (e, issueId) => {
    e.dataTransfer.setData('text/plain', issueId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, colId) => {
    e.preventDefault()
    if (draggedOverColumn !== colId) {
      setDraggedOverColumn(colId)
    }
  }

  const handleDragLeave = () => {
    setDraggedOverColumn(null)
  }

  const handleDrop = async (e, targetColumnId) => {
    e.preventDefault()
    setDraggedOverColumn(null)
    const issueIdStr = e.dataTransfer.getData('text/plain')
    const issueId = parseInt(issueIdStr, 10)
    if (!issueId) return
    await updateIssueStatus(issueId, targetColumnId)
  }

  // Passed to TaskDetailModal as `onSave` for the issue detail view — saves
  // both the base task fields and the support-specific extraFields together
  // in one request, since they're all just fields on the same DetailedActivity.
  const handleIssueSave = async (formData) => {
    try {
      const res = await updateDetailedActivity(formData.id, formData)
      const updated = res.data?.data ?? res.data
      setIssues((prev) => prev.map((i) => (i.id === formData.id ? { ...i, ...updated } : i)))
      showToast('Issue updated')
    } catch (err) {
      console.error('Failed to update issue:', err)
      showToast('Failed to save issue', 'error')
      return false
    }
  }

  // Quick action distinct from the general Save button — records that the
  // client was just updated, clearing any stale flag immediately without
  // requiring the user to open and submit the full edit form.
  const recordClientUpdate = async (issueId, setForm) => {
    const now = new Date().toISOString()
    try {
      const res = await updateDetailedActivity(issueId, { last_client_update_at: now })
      const updated = res.data?.data ?? res.data
      setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, ...updated } : i)))
      setForm((prev) => ({ ...prev, last_client_update_at: updated?.last_client_update_at ?? now }))
      showToast('Client update recorded')
    } catch (err) {
      console.error('Failed to record client update:', err)
      showToast('Failed to record client update', 'error')
    }
  }

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

  const openIntake = () => {
    if (!selectedProjectId) {
      showToast('Select a project before creating an issue.', 'error')
      return
    }

    setIntakeForm({ ...EMPTY_INTAKE_FORM })
    setIntakeErrors({})
    setIsIntakeOpen(true)
  }

  const updateIntakeField = (field, value) => {
    setIntakeForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleIntakeSubmit = async (e) => {
    e.preventDefault()

    if (isSubmittingIntake) return

    if (!selectedProjectId) {
      setIntakeErrors({
        project_id: 'Select a project before creating an issue.',
      })
      return
    }

    const normalized = Object.fromEntries(
      Object.entries(intakeForm).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.trim() : value,
      ])
    )

    const errors = {}

    if (!normalized.name) {
      errors.name = 'Issue title is required.'
    }

    if (!normalized.client_name) {
      errors.client_name = 'Client is required.'
    }

    if (!normalized.client_priority) {
      errors.client_priority = 'Priority is required.'
    }

    if (Object.keys(errors).length > 0) {
      setIntakeErrors(errors)
      return
    }

    setIntakeErrors({})
    setIsSubmittingIntake(true)

    try {
      const res = await createSupportIssue({
        ...normalized,
        project_id: selectedProjectId,
      })

      const created = res?.data?.data ?? res?.data

      if (created?.id == null) {
        throw new Error('Unexpected response shape from server')
      }

      setIssues((prev) => [created, ...prev])
      setIntakeForm({ ...EMPTY_INTAKE_FORM })
      setIntakeErrors({})
      setIsIntakeOpen(false)

      showToast('Support issue created')
    } catch (err) {
      console.error('Failed to create support issue:', err)

      const status = err.response?.status
      const backendErrors = err.response?.data?.errors

      if (status === 422 && backendErrors) {
        setIntakeErrors(
          Object.fromEntries(
            Object.entries(backendErrors).map(([field, messages]) => [
              field,
              Array.isArray(messages) ? messages[0] : String(messages),
            ])
          )
        )
      }

      const message =
        status === 422
          ? err.response?.data?.message ||
            'Please correct the highlighted fields.'
          : 'Unable to create the support issue. Please try again.'

      showToast(message, 'error')
    } finally {
      setIsSubmittingIntake(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg border text-sm font-semibold transition-all duration-300 ${
          toast.type === 'error'
            ? 'bg-destructive/15 border-destructive text-destructive'
            : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
        }`}>
          {toast.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <MessagesSquare className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Support Ops</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Client support, troubleshooting, and issue triage — separate from general project work.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Project Selector */}
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project:</span>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded-lg border border-border bg-card text-sm font-medium px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-sm min-w-60"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <Button type="button" onClick={openIntake} disabled={!selectedProjectId}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Issue
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-card p-3 rounded-xl border border-border/60 shadow-sm">
        <select
          value={filters.client}
          onChange={(e) => setFilters((prev) => ({ ...prev, client: e.target.value }))}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none"
        >
          <option value="all">All Clients</option>
          {uniqueClients.filter((c) => c !== 'all').map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filters.tenant}
          onChange={(e) => setFilters((prev) => ({ ...prev, tenant: e.target.value }))}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none"
        >
          <option value="all">All Tenants</option>
          {uniqueTenants.filter((t) => t !== 'all').map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={filters.priority}
          onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none"
        >
          <option value="all">All Priorities</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
          <option value="none">No priority set</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={filters.needsUpdateOnly}
            onChange={(e) => setFilters((prev) => ({ ...prev, needsUpdateOnly: e.target.checked }))}
            className="rounded border-border"
          />
          Needs update only
        </label>

        <label className="flex items-center gap-1.5 text-xs font-medium text-foreground cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={includeLearning}
            onChange={toggleLearning}
            className="rounded border-border"
          />
          Show Learning entries
        </label>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-100 gap-3 text-muted-foreground">
          <Clock className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm font-medium">Loading support issues...</span>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 items-start select-none">
          {COLUMNS.map((column) => {
            const columnIssues = getIssuesByColumn(column.id)
            const isDraggedOver = draggedOverColumn === column.id
            return (
              <div
                key={column.id}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.id)}
                className={[
                  'flex-1 min-w-70 max-w-80 rounded-xl border border-border/60 bg-muted/20 flex flex-col max-h-[70vh] transition-colors',
                  isDraggedOver ? 'bg-primary/5 border-primary/40' : '',
                ].join(' ')}
              >
                <div className={`p-3 border-t-4 ${column.color} rounded-t-xl flex items-center justify-between border-b border-border/40 bg-card`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">{column.label}</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-bold">
                      {columnIssues.length}
                    </span>
                  </div>
                </div>

                <div className="p-2 space-y-2 overflow-y-auto flex-1 min-h-37.5">
                  {columnIssues.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No issues</p>
                  ) : (
                    columnIssues.map((issue) => {
                      const staleness = getStalenessState(issue)
                      return (
                        <div
                          key={issue.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, issue.id)}
                          onClick={() => openIssueDetail(issue)}
                          className={[
                            'p-3 rounded-lg border bg-card text-foreground cursor-grab active:cursor-grabbing hover:shadow-md transition-all duration-150',
                            staleness === 'stale'
                              ? 'border-destructive/60 border-l-4'
                              : 'border-border/60 hover:border-border/80',
                          ].join(' ')}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              {issue.client_priority && (
                                <Badge variant="outline" className="text-[10px]">{issue.client_priority}</Badge>
                              )}
                              {staleness === 'no-priority' && (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">
                                  No priority set
                                </Badge>
                              )}
                              {staleness === 'stale' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive">
                                  <AlertTriangle className="h-3 w-3" />
                                  Needs update
                                </span>
                              )}
                            </div>
                            {issue.client_name && (
                              <span className="text-[10px] text-muted-foreground truncate">{issue.client_name}</span>
                            )}
                          </div>
                          <p className="text-sm font-semibold leading-snug">{issue.name}</p>
                          {issue.next_action && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              Next: {issue.next_action}
                            </p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Quick Intake Modal — same chrome/field styling as TaskDetailModal
          (Kanban's Task Detail view), per explicit design-consistency request. */}
      {isIntakeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-primary">New Support Issue</span>
                <h3 className="text-base font-bold text-foreground truncate max-w-lg mt-0.5">
                  {projects.find((p) => p.id === Number(selectedProjectId))?.name}
                </h3>
              </div>
              <button
                onClick={() => setIsIntakeOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleIntakeSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Issue title *</label>
                <input
                  type="text"
                  value={intakeForm.name}
                  onChange={(e) => updateIntakeField('name', e.target.value)}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {intakeErrors.name && <p className="text-xs text-destructive">{intakeErrors.name}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Client *</label>
                  <input
                    type="text"
                    value={intakeForm.client_name}
                    onChange={(e) => updateIntakeField('client_name', e.target.value)}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {intakeErrors.client_name && <p className="text-xs text-destructive">{intakeErrors.client_name}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Tenant</label>
                  <input
                    type="text"
                    value={intakeForm.tenant_name}
                    onChange={(e) => updateIntakeField('tenant_name', e.target.value)}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Channel</label>
                  <input
                    type="text"
                    placeholder="e.g. Viber — Ops group"
                    value={intakeForm.channel}
                    onChange={(e) => updateIntakeField('channel', e.target.value)}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Priority *</label>
                  <select
                    value={intakeForm.client_priority}
                    onChange={(e) => updateIntakeField('client_priority', e.target.value)}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">Select priority</option>
                    <option value="P1">P1 — update within 1 hour</option>
                    <option value="P2">P2 — update within 4 hours</option>
                    <option value="P3">P3 — update within 1 business day</option>
                  </select>
                  {intakeErrors.client_priority && <p className="text-xs text-destructive">{intakeErrors.client_priority}</p>}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Timestamp</label>
                  <input
                    type="date"
                    value={intakeForm.timestamp}
                    onChange={(e) => updateIntakeField('timestamp', e.target.value)}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Area or workflow affected</label>
                <input
                  type="text"
                  placeholder="e.g. Checkout screen, onboarding process, invoice printing"
                  value={intakeForm.affected_area}
                  onChange={(e) => updateIntakeField('affected_area', e.target.value)}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Expected behavior</label>
                <textarea
                  rows="2"
                  value={intakeForm.expected_behavior}
                  onChange={(e) => updateIntakeField('expected_behavior', e.target.value)}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Actual behavior</label>
                <textarea
                  rows="2"
                  value={intakeForm.actual_behavior}
                  onChange={(e) => updateIntakeField('actual_behavior', e.target.value)}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Evidence</label>
                <textarea
                  rows="2"
                  placeholder="Timestamp, payload, screenshot summary, log reference"
                  value={intakeForm.evidence}
                  onChange={(e) => updateIntakeField('evidence', e.target.value)}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Next action</label>
                <textarea
                  rows="2"
                  value={intakeForm.next_action}
                  onChange={(e) => updateIntakeField('next_action', e.target.value)}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setIsIntakeOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted text-foreground transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingIntake}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all disabled:opacity-50"
                >
                  {isSubmittingIntake ? 'Creating...' : 'Create Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Detail Modal — shared with Kanban, see TaskDetailModal.jsx */}
      {selectedIssue && (
        <TaskDetailModal
          task={selectedIssue}
          onClose={closeIssueDetail}
          onSave={handleIssueSave}
          userRole={userRole}
          eyebrowLabel="Issue Detail"
          extraFields={(form, setForm) => (
            <div className="space-y-4 border-t border-border/60 pt-4">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Support Details
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Client</label>
                  <input
                    type="text"
                    value={form.client_name || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, client_name: e.target.value }))}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Tenant</label>
                  <input
                    type="text"
                    value={form.tenant_name || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, tenant_name: e.target.value }))}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Channel</label>
                  <input
                    type="text"
                    value={form.channel || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value }))}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Client Priority</label>
                  <select
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
                    onClick={() => recordClientUpdate(form.id, setForm)}
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
                <label className="text-xs font-bold text-foreground">Next Action</label>
                <textarea
                  rows="2"
                  value={form.next_action || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, next_action: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Evidence</label>
                <textarea
                  rows="2"
                  value={form.evidence || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, evidence: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Root Cause</label>
                <textarea
                  rows="2"
                  value={form.root_cause || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, root_cause: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Resolution</label>
                <textarea
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
          )}
        />
      )}
    </div>
  )
}
