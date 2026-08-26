import { useState, useEffect } from 'react'
import { useEffectiveUser } from '@/context/PreviewContext'
import { fetchProjects, fetchBugs, createBug, updateBug, deleteBug } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Bug as BugIcon, Plus, Pencil, Trash2, AlertTriangle, Clock, ChevronDown } from 'lucide-react'
import { GROUP_ACCENT_CLASSES, buildSegments, GroupSegmentBar } from '@/components/GroupSummaryBar'

const STATUSES = ['Awaiting Review', 'Ready for Dev', 'Fixing', 'Fixed']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']
const GROUPS = ['Incoming', 'Development Work', 'Resolved']

const PRIORITY_BADGE_CLASSES = {
  Critical: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
  High: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  Medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  Low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
}

// Taskboard-style group-header summary: same fixed-order + solid-color
// pattern as TaskboardView's Status/Priority bars (GroupSummaryBar.jsx),
// applied to this page's own Status/Priority value sets.
const PRIORITY_ORDER = PRIORITIES
const PRIORITY_SEGMENT_LABELS = { Critical: 'Critical', High: 'High', Medium: 'Medium', Low: 'Low' }
const PRIORITY_SEGMENT_CLASSES = {
  Critical: 'bg-red-500',
  High: 'bg-orange-500',
  Medium: 'bg-amber-500',
  Low: 'bg-emerald-500',
}

const STATUS_ORDER = STATUSES
const STATUS_SEGMENT_LABELS = { 'Awaiting Review': 'Awaiting Review', 'Ready for Dev': 'Ready for Dev', Fixing: 'Fixing', Fixed: 'Fixed' }
const STATUS_SEGMENT_CLASSES = {
  'Awaiting Review': 'bg-slate-400',
  'Ready for Dev': 'bg-blue-500',
  Fixing: 'bg-amber-500',
  Fixed: 'bg-emerald-500',
}

// Column widths (percentages, must sum to 100) shared between the
// group-header summary row and the bug table beneath it — same alignment
// technique as TaskboardView (table-fixed + matching <colgroup>).
// Percentages, not px — see GroupSummaryBar.jsx's file comment for why px
// widths drift out of alignment at wider viewports.
const COLUMN_WIDTHS = { title: '31.57%', reporter: '12.82%', priority: '9.86%', status: '12.82%', owner: '12.82%', due: '13.81%', actions: '6.31%' }

const EMPTY_FORM = {
  title: '',
  description: '',
  priority: 'Medium',
  owner_id: '',
  sprint_label: '',
  due_date: '',
  visibility: 'internal',
}

// research.md D5: the due date is the only server-authoritative fact — the
// countdown itself is computed and re-rendered client-side.
function DueCountdown({ dueDate, isOverdue }) {
  const [, forceTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!dueDate) return <span className="text-xs text-muted-foreground">—</span>

  const due = new Date(dueDate)
  const now = new Date()
  const diffMs = due - now
  const diffHours = Math.round(Math.abs(diffMs) / 3_600_000)
  const diffDays = Math.floor(diffHours / 24)
  const label = diffDays > 0 ? `${diffDays}d ${diffHours % 24}h` : `${diffHours}h`

  if (isOverdue) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-600 whitespace-nowrap">
        <AlertTriangle className="h-3 w-3" /> Overdue by {label}
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
      <Clock className="h-3 w-3" /> {label} left
    </span>
  )
}

export default function BugTracker() {
  const user = useEffectiveUser()
  const canManage = ['Admin', 'Project Manager', 'Team Member', 'Department Head'].includes(user?.role)
  const isClient = user?.role === 'Client'

  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [bugs, setBugs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)

  const [editingBug, setEditingBug] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  // Groups start expanded; the Status/Priority summary bars only render for
  // groups in this set — matches TaskboardView's collapsed-only behavior.
  const [closedGroups, setClosedGroups] = useState(() => new Set())

  // No canWrite()-accessible "list this project's internal users" endpoint
  // exists today (matches Retrospectives' owner-assignment shortlist
  // rationale) — Owner candidates are this project's existing bug
  // reporters plus the signed-in user. The backend independently validates
  // the chosen owner is actually an internal user (BugController).
  const ownerCandidates = [...bugs.map((b) => ({ id: b.reporter_id, name: b.reporter })), { id: user?.id, name: `${user?.name} (you)` }]
    .filter((u, idx, arr) => u.id && arr.findIndex((x) => x.id === u.id) === idx)

  useEffect(() => {
    fetchProjects()
      .then((res) => {
        const list = res.data.data || res.data
        setProjects(list)
        if (list.length > 0) setSelectedProjectId(list[0].id)
        else setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to fetch projects:', err)
        setError('Failed to load projects.')
        setLoading(false)
      })
  }, [])

  const loadBugs = (projectId) => {
    if (!projectId) return
    setLoading(true)
    fetchBugs(projectId)
      .then((res) => setBugs(res.data.data || res.data))
      .catch((err) => {
        console.error('Failed to load bugs:', err)
        setError('Failed to load bugs.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    if (selectedProjectId) loadBugs(selectedProjectId)
  }, [selectedProjectId])

  // ─── Deep link ?bug={id} — matches ?session=/?task= precedent (T030) ────
  useEffect(() => {
    if (loading || bugs.length === 0) return
    const queryParams = new URLSearchParams(window.location.search)
    const bugIdParam = queryParams.get('bug')
    if (bugIdParam) {
      const bugId = parseInt(bugIdParam, 10)
      const match = bugs.find((b) => b.id === bugId)
      if (match) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs to a deep-linked ?bug= query param, not a data load
        openEdit(match)
      }
      queryParams.delete('bug')
      const newSearch = queryParams.toString()
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '')
      window.history.replaceState({}, document.title, newUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bugs, loading])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!createForm.title.trim() || !selectedProjectId) return
    try {
      await createBug(selectedProjectId, {
        ...createForm,
        owner_id: createForm.owner_id || null,
        due_date: createForm.due_date || null,
      })
      setCreateForm(EMPTY_FORM)
      setIsCreateOpen(false)
      loadBugs(selectedProjectId)
    } catch (err) {
      console.error('Failed to create bug:', err)
      setError('Failed to create bug.')
    }
  }

  const openEdit = (bug) => {
    setEditingBug(bug)
    setEditForm({
      title: bug.title,
      description: bug.description || '',
      priority: bug.priority,
      status: bug.status,
      owner_id: bug.owner_id || '',
      sprint_label: bug.sprint_label || '',
      due_date: bug.due_date || '',
      visibility: bug.visibility,
    })
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editingBug) return
    try {
      await updateBug(editingBug.id, {
        ...editForm,
        owner_id: editForm.owner_id || null,
        due_date: editForm.due_date || null,
      })
      setEditingBug(null)
      loadBugs(selectedProjectId)
    } catch (err) {
      console.error('Failed to update bug:', err)
      setError('Failed to update bug.')
    }
  }

  const handleStatusChange = async (bug, status) => {
    try {
      await updateBug(bug.id, { status })
      loadBugs(selectedProjectId)
    } catch (err) {
      console.error('Failed to update bug status:', err)
      setError('Failed to update bug status.')
    }
  }

  const handleDelete = async (bugId) => {
    try {
      await deleteBug(bugId)
      loadBugs(selectedProjectId)
    } catch (err) {
      console.error('Failed to delete bug:', err)
      setError('Failed to delete bug.')
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-destructive font-medium">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <BugIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Bug Tracker</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Report, triage, and resolve defects — separate from Work Program.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
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
          {canManage && (
            <Button type="button" onClick={() => setIsCreateOpen(true)} disabled={!selectedProjectId}>
              <Plus className="h-4 w-4 mr-1.5" />
              Report Bug
            </Button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center min-h-[200px] text-sm text-muted-foreground">
          Loading...
        </div>
      )}

      {!loading && bugs.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 border border-dashed border-border rounded-xl">
          <BugIcon className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isClient ? 'No bugs have been shared with you on this project yet.' : 'No bugs reported yet for this project.'}
          </p>
          {canManage && (
            <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Report the first bug
            </Button>
          )}
        </div>
      )}

      {!loading && bugs.length > 0 && GROUPS.map((group, index) => {
        const groupBugs = bugs.filter((b) => b.group === group)
        if (groupBugs.length === 0) return null
        const accent = GROUP_ACCENT_CLASSES[index % GROUP_ACCENT_CLASSES.length]
        const isOpen = !closedGroups.has(group)
        const statusSegments = buildSegments(groupBugs, 'status', STATUS_ORDER, STATUS_SEGMENT_CLASSES)
        const prioritySegments = buildSegments(groupBugs, 'priority', PRIORITY_ORDER, PRIORITY_SEGMENT_CLASSES)
        return (
          <Collapsible
            key={group}
            open={isOpen}
            onOpenChange={(open) => {
              setClosedGroups((prev) => {
                const next = new Set(prev)
                if (open) next.delete(group)
                else next.add(group)
                return next
              })
            }}
          >
            <div className="relative rounded-xl border border-border/60 shadow-sm overflow-hidden">
              <span className={`absolute inset-y-0 left-0 w-1 pointer-events-none ${accent.bar}`} aria-hidden="true" />
              {/* No gap between children, and no container-level horizontal
                  padding at all — every column here is a percentage of this
                  container's own width (see GroupSummaryBar.jsx's file
                  comment), and the real <table> below has zero container
                  padding of its own. Any padding on THIS container — even
                  one-sided — would shrink its width basis relative to the
                  table's, so every column's percentage would resolve against
                  a slightly different pixel base. The label's own left inset
                  (matching this table's default shadcn px-4/p-4 cell
                  padding — unlike Taskboard, this table doesn't override
                  cell padding to px-3) instead lives inside the button
                  itself (pl-4 below), which doesn't touch the container's
                  width basis. Each spacer/bar below is a sibling of the
                  trigger button, not a child of it, so only the label area
                  toggles the group. */}
              <div className="relative flex items-center py-3 border-b border-border/60 bg-muted/30">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className={`flex items-center gap-2 pl-4 text-sm font-semibold shrink-0 min-w-0 text-left ${accent.label} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded`}
                    style={{ width: COLUMN_WIDTHS.title }}
                  >
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    <span className="truncate">
                      {group}
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {groupBugs.length} {groupBugs.length === 1 ? 'Bug' : 'Bugs'}
                      </span>
                    </span>
                  </button>
                </CollapsibleTrigger>

                {/* Reporter column spacer — no group-level rollup for this column */}
                <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.reporter }} aria-hidden="true" />

                {isOpen ? (
                  <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.priority }} aria-hidden="true" />
                ) : (
                  <GroupSegmentBar title="Priority" segments={prioritySegments} labels={PRIORITY_SEGMENT_LABELS} width={COLUMN_WIDTHS.priority} />
                )}

                {!isClient && (
                  isOpen ? (
                    <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.status }} aria-hidden="true" />
                  ) : (
                    <GroupSegmentBar title="Status" segments={statusSegments} labels={STATUS_SEGMENT_LABELS} width={COLUMN_WIDTHS.status} />
                  )
                )}

                <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.owner }} aria-hidden="true" />
                <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.due }} aria-hidden="true" />
                {canManage && <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.actions }} aria-hidden="true" />}
              </div>
              <CollapsibleContent>
                <Table className="table-fixed">
                  <colgroup>
                    <col style={{ width: COLUMN_WIDTHS.title }} />
                    <col style={{ width: COLUMN_WIDTHS.reporter }} />
                    <col style={{ width: COLUMN_WIDTHS.priority }} />
                    {!isClient && <col style={{ width: COLUMN_WIDTHS.status }} />}
                    <col style={{ width: COLUMN_WIDTHS.owner }} />
                    <col style={{ width: COLUMN_WIDTHS.due }} />
                    {canManage && <col style={{ width: COLUMN_WIDTHS.actions }} />}
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bug</TableHead>
                      <TableHead>Reporter</TableHead>
                      <TableHead>Priority</TableHead>
                      {!isClient && <TableHead>Status</TableHead>}
                      <TableHead>Owner</TableHead>
                      <TableHead>Due</TableHead>
                      {canManage && <TableHead />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupBugs.map((bug) => (
                      <TableRow key={bug.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs font-mono text-muted-foreground">{bug.bug_id}</span>
                            <span className="text-sm font-medium">{bug.title}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{bug.reporter}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={PRIORITY_BADGE_CLASSES[bug.priority]}>
                            {bug.priority}
                          </Badge>
                        </TableCell>
                        {!isClient && (
                          <TableCell>
                            {canManage ? (
                              <select
                                value={bug.status}
                                onChange={(e) => handleStatusChange(bug, e.target.value)}
                                className="text-xs rounded-md border border-border bg-background px-1.5 py-1 focus:outline-none"
                              >
                                {STATUSES.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-muted-foreground">{bug.status}</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{bug.owner || '—'}</TableCell>
                        <TableCell>
                          <DueCountdown dueDate={bug.due_date} isOverdue={bug.is_overdue} />
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <span className="flex items-center gap-1 justify-end">
                              <button type="button" onClick={() => openEdit(bug)} className="text-muted-foreground hover:text-foreground" aria-label="Edit bug">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => handleDelete(bug.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete bug">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )
      })}

      {/* Report Bug dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogTitle>Report a Bug</DialogTitle>
          <DialogDescription>Describe the defect — it starts in Incoming, awaiting review.</DialogDescription>
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              autoFocus
              value={createForm.title}
              onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Title"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What's happening?"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Priority
                <select
                  value={createForm.priority}
                  onChange={(e) => setCreateForm((f) => ({ ...f, priority: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Due date
                <input
                  type="date"
                  value={createForm.due_date}
                  onChange={(e) => setCreateForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Owner
                <select
                  value={createForm.owner_id}
                  onChange={(e) => setCreateForm((f) => ({ ...f, owner_id: e.target.value ? Number(e.target.value) : '' }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">No owner</option>
                  {ownerCandidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Sprint / Milestone
                <input
                  value={createForm.sprint_label}
                  onChange={(e) => setCreateForm((f) => ({ ...f, sprint_label: e.target.value }))}
                  placeholder="e.g. Sprint 3"
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Visibility
                <select
                  value={createForm.visibility}
                  onChange={(e) => setCreateForm((f) => ({ ...f, visibility: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="internal">Internal</option>
                  <option value="client_visible">Client-visible</option>
                </select>
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Report Bug</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Bug dialog */}
      <Dialog open={!!editingBug} onOpenChange={(open) => !open && setEditingBug(null)}>
        <DialogContent>
          <DialogTitle>Edit Bug {editingBug?.bug_id}</DialogTitle>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <input
              value={editForm.title}
              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Priority
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Status
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Due date
                <input
                  type="date"
                  value={editForm.due_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Owner
                <select
                  value={editForm.owner_id}
                  onChange={(e) => setEditForm((f) => ({ ...f, owner_id: e.target.value ? Number(e.target.value) : '' }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">No owner</option>
                  {ownerCandidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Sprint / Milestone
                <input
                  value={editForm.sprint_label}
                  onChange={(e) => setEditForm((f) => ({ ...f, sprint_label: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground space-y-1 col-span-2">
                Visibility
                <select
                  value={editForm.visibility}
                  onChange={(e) => setEditForm((f) => ({ ...f, visibility: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="internal">Internal</option>
                  <option value="client_visible">Client-visible</option>
                </select>
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingBug(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
