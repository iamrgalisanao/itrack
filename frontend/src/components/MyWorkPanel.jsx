import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GroupSegmentBar } from '@/components/GroupSummaryBar'
import { buildSegments } from '@/lib/groupSummary'
import { STATUS_ORDER, STATUS_SEGMENT_CLASSES, STATUS_SEGMENT_LABELS, STATUS_BADGE_CLASSES } from '@/lib/taskStatus'
import TaskDetailModal from '@/components/TaskDetailModal'
import { fetchMyWork, fetchDetailedActivity, updateDetailedActivity, createMyWorkTask, fetchProjects, fetchModules } from '@/lib/api'
import { useEffectiveUser } from '@/context/PreviewContext'
import { formatDate } from '@/lib/utils'
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, Plus, RefreshCw } from 'lucide-react'

// Bucket accents are fixed and semantic, not the index-rotation the sibling
// grouped views use: those group by arbitrary keys (epic, project) where any
// colour will do, but "Overdue" must always read as urgent. Deliberately not
// drawn from GROUP_ACCENT_CLASSES — that array is consumed positionally
// elsewhere, so borrowing an index here would couple this panel's meaning to
// an unrelated array's order. Bars are background spans because border-l-*
// utilities are inert app-wide (see GroupSummaryBar.jsx).
const BUCKETS = [
  { key: 'overdue', label: 'Overdue', bar: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400', canQuickAdd: false },
  { key: 'this_week', label: 'This Week', bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', canQuickAdd: true },
  { key: 'later', label: 'Later', bar: 'bg-primary', text: 'text-primary', canQuickAdd: true },
  { key: 'no_due_date', label: 'No due date', bar: 'bg-slate-400', text: 'text-slate-600 dark:text-slate-400', canQuickAdd: true },
]

// Percentages, summing to 100 — shared by the header row's flex children and
// the table's colgroup so both resolve against the same width basis and stay
// aligned at every viewport (GroupSummaryBar.jsx explains why px drifts).
const COLUMN_WIDTHS = {
  task: '46%',
  context: '24%',
  due: '14%',
  status: '16%',
}

/** Local-midnight "today" and the Sunday that ends this week, as Y-m-d. */
function localAnchors() {
  const now = new Date()
  const toYmd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const weekEnd = new Date(now)
  // getDay(): 0 = Sunday. On Sunday itself the week ends today.
  weekEnd.setDate(now.getDate() + ((7 - now.getDay()) % 7))
  return { today: toYmd(now), week_end: toYmd(weekEnd) }
}

function BucketRows({ bucket, tasks, canWrite, savingId, onStatusChange, onOpenTask, rowError }) {
  return (
    <Table className="table-fixed">
      {/* Below sm the context and due columns collapse into the task cell,
          leaving the title and the status control — otherwise the fixed
          percentages squeeze the select to ~45px on a 360px screen. */}
      <colgroup>
        <col className="w-[60%] sm:w-[46%]" />
        <col className="hidden sm:table-column sm:w-[24%]" />
        <col className="hidden sm:table-column sm:w-[14%]" />
        <col className="w-[40%] sm:w-[16%]" />
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead className="h-8 py-1.5 px-3 text-xs">Task</TableHead>
          <TableHead className="hidden sm:table-cell h-8 py-1.5 px-3 text-xs">Where</TableHead>
          <TableHead className="hidden sm:table-cell h-8 py-1.5 px-3 text-xs">Due</TableHead>
          <TableHead className="h-8 py-1.5 px-3 text-xs">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell className="py-1.5 px-3">
              {/* A real button, not a click handler on the row: the row must be
                  reachable by keyboard, and Radix's dialog returns focus here
                  on close only if the opener was focusable. */}
              <button
                type="button"
                onClick={(e) => onOpenTask(task, e.currentTarget)}
                className="text-sm font-medium text-left truncate w-full rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:text-primary transition-colors"
                title={task.name}
              >
                {task.name}
              </button>
              <p className="sm:hidden text-[11px] text-muted-foreground truncate mt-0.5">
                {task.project?.name}
                {task.plan_end_date && <span className={bucket.key === 'overdue' ? 'text-destructive dark:text-red-400' : ''}> · {formatDate(task.plan_end_date)}</span>}
              </p>
              {rowError?.id === task.id && (
                <p id={`row-error-${task.id}`} role="alert" className="text-[11px] text-destructive dark:text-red-400 mt-0.5">
                  {rowError.message}
                </p>
              )}
            </TableCell>
            <TableCell className="hidden sm:table-cell py-1.5 px-3 text-xs text-muted-foreground truncate"
                       title={[task.project?.name, task.module?.name].filter(Boolean).join(' · ')}>
              {task.project?.name || '—'}
              {task.module?.name && <span className="text-muted-foreground/70"> · {task.module.name}</span>}
            </TableCell>
            <TableCell className={`hidden sm:table-cell py-1.5 px-3 text-xs tabular-nums ${bucket.key === 'overdue' ? 'text-destructive dark:text-red-400 font-medium' : 'text-muted-foreground'}`}>
              {task.plan_end_date ? formatDate(task.plan_end_date) : 'No due date'}
            </TableCell>
            <TableCell className="py-1.5 px-3">
              {canWrite ? (
                <select
                  value={task.status}
                  disabled={savingId === task.id}
                  aria-label={`Change status of ${task.name}`}
                  aria-describedby={rowError?.id === task.id ? `row-error-${task.id}` : undefined}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onStatusChange(task, e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>{STATUS_SEGMENT_LABELS[status]}</option>
                  ))}
                </select>
              ) : (
                <Badge variant="outline" className={STATUS_BADGE_CLASSES[task.status]}>
                  {STATUS_SEGMENT_LABELS[task.status] || task.status}
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/**
 * Title plus a placement, and nothing else — the due date comes from whichever
 * bucket you opened this in, so adding a task never stops to ask when it's due.
 */
function QuickAddForm({ bucket, buckets, onBucketChange, projects, modules, placement, onPlacementChange, onSubmit, onCancel, busy, error }) {
  const [title, setTitle] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = (e) => {
    e.preventDefault()
    if (!title.trim() || !placement.moduleId) return
    onSubmit(title.trim(), () => setTitle(''))
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      className="flex flex-wrap items-start gap-2 px-3 py-2.5 border-t border-border/60 bg-muted/20"
    >
      <div className="flex-1 min-w-[200px]">
        <label className="sr-only" htmlFor={`qa-title-${bucket.key}`}>
          Task title
        </label>
        <input
          id={`qa-title-${bucket.key}`}
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          aria-describedby={error ? `qa-error-${bucket.key}` : undefined}
          aria-invalid={error ? 'true' : undefined}
          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error && (
          <p id={`qa-error-${bucket.key}`} role="alert" className="text-[11px] text-destructive dark:text-red-400 mt-1">{error}</p>
        )}
      </div>

      <label className="sr-only" htmlFor={`qa-bucket-${bucket.key}`}>Due</label>
      <select
        id={`qa-bucket-${bucket.key}`}
        value={bucket.key}
        onChange={(e) => onBucketChange(buckets.find((b) => b.key === e.target.value))}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {buckets.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
      </select>

      <label className="sr-only" htmlFor={`qa-project-${bucket.key}`}>Project</label>
      <select
        id={`qa-project-${bucket.key}`}
        value={placement.projectId || ''}
        onChange={(e) => onPlacementChange({ projectId: e.target.value, moduleId: '' })}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs max-w-[180px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Project…</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <label className="sr-only" htmlFor={`qa-module-${bucket.key}`}>Module</label>
      <select
        id={`qa-module-${bucket.key}`}
        value={placement.moduleId || ''}
        disabled={!placement.projectId || !modules.length}
        onChange={(e) => onPlacementChange({ ...placement, moduleId: e.target.value })}
        className="rounded-md border border-input bg-background px-2 py-1.5 text-xs max-w-[180px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Module…</option>
        {modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>

      <button
        type="submit"
        disabled={busy || !title.trim() || !placement.moduleId}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        Add
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Cancel
      </button>
    </form>
  )
}

const PLACEMENT_KEY = 'itrack.myWork.lastPlacement'

const readPlacement = () => {
  try {
    return JSON.parse(localStorage.getItem(PLACEMENT_KEY)) || { projectId: '', moduleId: '' }
  } catch {
    return { projectId: '', moduleId: '' }
  }
}

export default function MyWorkPanel({ onTaskMutated }) {
  const user = useEffectiveUser()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [closedBuckets, setClosedBuckets] = useState(() => new Set())
  // Which bucket is mid-expansion. Not a set of "already expanded" keys:
  // once the rows arrive, hidden drops to 0 and the button removes itself,
  // so remembering past expansions only risked leaving a stale spinner.
  const [expandingBucket, setExpandingBucket] = useState(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [openingTaskId, setOpeningTaskId] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [rowError, setRowError] = useState(null)
  const triggerRef = useRef(null)
  const addTriggerRef = useRef(null)
  const quickAddTriggerRef = useRef(null)
  const [quickAddBucket, setQuickAddBucket] = useState(null)
  const [quickAddBusy, setQuickAddBusy] = useState(false)
  const [quickAddError, setQuickAddError] = useState(null)
  const [placement, setPlacement] = useState(readPlacement)
  const [projects, setProjects] = useState([])
  const [modules, setModules] = useState([])

  const anchors = useMemo(() => localAnchors(), [])

  const load = useCallback(async ({ silent = false, expandBucket = null } = {}) => {
    if (!silent) setLoading(true)
    try {
      const params = { ...anchors }
      if (expandBucket) {
        params.bucket = expandBucket
        params.all = 1
      }
      const res = await fetchMyWork(params)
      setData(res.data)
      setError(null)
    } catch (err) {
      console.error('Failed to load My Work:', err)
      setError('Could not load your work right now.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [anchors])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
  useEffect(() => { load() }, [load])

  const canWrite = data?.meta?.can_write ?? false
  const canQuickAdd = data?.meta?.can_quick_add ?? false
  const totalOpen = data ? BUCKETS.reduce((sum, b) => sum + (data.buckets[b.key]?.count || 0), 0) : 0

  const handleStatusChange = async (task, status) => {
    setSavingId(task.id)
    setRowError(null)

    // Optimistic: buckets key on due date, so a status change never moves a
    // row between them — only completion removes it from the open list.
    setData((prev) => {
      if (!prev) return prev
      const buckets = { ...prev.buckets }
      for (const { key } of BUCKETS) {
        const bucket = buckets[key]
        if (!bucket?.tasks.some((t) => t.id === task.id)) continue
        buckets[key] = status === 'completed'
          ? { count: bucket.count - 1, tasks: bucket.tasks.filter((t) => t.id !== task.id) }
          : { ...bucket, tasks: bucket.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)) }
      }
      return { ...prev, buckets }
    })

    try {
      const progress = status === 'completed' ? 100 : (status === 'not_started' || status === 'backlog') ? 0 : undefined
      await updateDetailedActivity(task.id, progress === undefined ? { status } : { status, progress })
      onTaskMutated?.()
    } catch (err) {
      console.error('Failed to update task status:', err)
      setRowError({ id: task.id, message: 'Could not save that change — refreshing.' })
      // The row may be stale (deleted, or access revoked mid-session), so
      // rebuild from the server rather than trusting the optimistic patch.
      await load({ silent: true })
    } finally {
      setSavingId(null)
    }
  }

  const handleOpenTask = async (task, trigger) => {
    // Radix restores focus to whatever was focused when the dialog mounted,
    // but the modal only mounts after the fetch below resolves — by then its
    // heuristic has lost the row. Hold the element and restore focus by hand.
    triggerRef.current = trigger ?? null
    setOpeningTaskId(task.id)
    try {
      // The list row is a lean projection; the modal needs the full task.
      const res = await fetchDetailedActivity(task.id)
      setSelectedTask(res.data.data || res.data)
    } catch (err) {
      console.error('Failed to open task:', err)
      setRowError({ id: task.id, message: 'Could not open that task.' })
    } finally {
      setOpeningTaskId(null)
    }
  }

  // Project and module lists load once, the first time quick-add is opened —
  // nobody pays for them just by viewing the dashboard.
  const openQuickAdd = async (bucket, trigger) => {
    quickAddTriggerRef.current = trigger ?? addTriggerRef.current
    setQuickAddBucket(bucket)
    setQuickAddError(null)
    try {
      if (!projects.length) {
        const res = await fetchProjects()
        setProjects(res.data.data || res.data || [])
      }
      // Populate modules for a remembered project so the saved placement is
      // usable straight away instead of only after re-picking the project.
      if (placement.projectId && !modules.length) {
        const res = await fetchModules(placement.projectId)
        setModules(res.data.data || res.data || [])
      }
    } catch (err) {
      console.error('Failed to load quick-add options:', err)
      setQuickAddError('Could not load projects.')
    }
  }

  const changePlacement = async (next) => {
    setPlacement(next)
    if (!next.projectId) { setModules([]); return }
    try {
      const res = await fetchModules(next.projectId)
      setModules(res.data.data || res.data || [])
    } catch (err) {
      console.error('Failed to load modules for quick-add:', err)
      setModules([])
    }
  }

  const cancelQuickAdd = () => {
    const trigger = quickAddTriggerRef.current
    quickAddTriggerRef.current = null
    setQuickAddBucket(null)
    setQuickAddError(null)
    if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus())
  }

  const submitQuickAdd = async (title, clearTitle) => {
    setQuickAddBusy(true)
    setQuickAddError(null)
    try {
      await createMyWorkTask({
        name: title,
        module_id: Number(placement.moduleId),
        // This Week pre-fills the end of the week; Later and No due date
        // deliberately leave it unset rather than inventing a date.
        plan_end_date: quickAddBucket.key === 'this_week' ? anchors.week_end : null,
      })
      try { localStorage.setItem(PLACEMENT_KEY, JSON.stringify(placement)) } catch { /* private mode */ }
      clearTitle()
      await load({ silent: true })
      onTaskMutated?.()
    } catch (err) {
      const field = err.response?.data?.errors
      setQuickAddError(field ? Object.values(field)[0][0] : 'Could not add that task.')
    } finally {
      setQuickAddBusy(false)
    }
  }

  const closeTask = () => {
    setSelectedTask(null)
    const trigger = triggerRef.current
    triggerRef.current = null
    // After Radix has finished unmounting and released the focus trap.
    if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus())
  }

  const handleTaskSave = async (form) => {
    try {
      await updateDetailedActivity(form.id, form)
      closeTask()
      // A due-date edit re-buckets the row, so refetch rather than merge.
      await load({ silent: true })
      onTaskMutated?.()
      return true
    } catch (err) {
      console.error('Failed to save task:', err)
      return false
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">My Work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="h-10 rounded-md bg-muted animate-pulse" />
          {[0, 1, 2].map((i) => <div key={i} className="h-7 rounded-md bg-muted/70 animate-pulse" />)}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">My Work</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-muted-foreground flex-1">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">My Work</CardTitle>
              <CardDescription className="mt-0.5">
                {totalOpen > 0
                  ? `${totalOpen} open ${totalOpen === 1 ? 'task' : 'tasks'} assigned to you`
                  : 'Tasks assigned to you across every project you can see'}
              </CardDescription>
            </div>
            {/* The per-bucket control is unreachable when a bucket is empty
                (empty buckets aren't rendered), so adding into one needs an
                entry point that lives outside them. */}
            {canQuickAdd && !quickAddBucket && (
              <button
                type="button"
                ref={addTriggerRef}
                onClick={() => openQuickAdd(BUCKETS[1])}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="h-3.5 w-3.5" /> Add task
              </button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {quickAddBucket && canQuickAdd && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <QuickAddForm
                bucket={quickAddBucket}
                buckets={BUCKETS.filter((b) => b.canQuickAdd)}
                onBucketChange={setQuickAddBucket}
                projects={projects}
                modules={modules}
                placement={placement}
                onPlacementChange={changePlacement}
                onSubmit={submitQuickAdd}
                onCancel={cancelQuickAdd}
                busy={quickAddBusy}
                error={quickAddError}
              />
            </div>
          )}

          {totalOpen === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <CheckCircle2 className="h-9 w-9 text-success" />
              <p className="text-sm font-medium">You&rsquo;re all caught up</p>
              <p className="text-xs text-muted-foreground">
                Nothing open is assigned to you right now.{' '}
                <Link to="/work-program" className="text-primary hover:opacity-80">Browse the Work Program</Link>
              </p>
            </div>
          ) : (
            BUCKETS.map((bucket) => {
              const group = data.buckets[bucket.key]
              // Empty buckets are omitted rather than rendered as empty groups.
              if (!group || group.count === 0) return null

              const isOpen = !closedBuckets.has(bucket.key)
              const hidden = group.count - group.tasks.length

              return (
                <Collapsible
                  key={bucket.key}
                  open={isOpen}
                  onOpenChange={() => {
                    setClosedBuckets((prev) => {
                      const next = new Set(prev)
                      next.has(bucket.key) ? next.delete(bucket.key) : next.add(bucket.key)
                      return next
                    })
                  }}
                >
                  <div className="relative rounded-xl border border-border/60 shadow-sm overflow-hidden">
                    <span className={`absolute inset-y-0 left-0 w-1 pointer-events-none ${bucket.bar}`} aria-hidden="true" />
                    <div className="relative flex items-center py-3 border-b border-border/60 bg-muted/30">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className={`flex items-center gap-2 pl-3 text-sm font-semibold shrink-0 min-w-0 text-left ${bucket.text} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded`}
                          style={{ width: COLUMN_WIDTHS.task }}
                        >
                          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          <span className="truncate">
                            {bucket.label}
                            <span className="block text-[11px] font-normal text-muted-foreground">
                              {group.count} {group.count === 1 ? 'task' : 'tasks'}
                            </span>
                          </span>
                        </button>
                      </CollapsibleTrigger>

                      <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.context }} aria-hidden="true" />
                      <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.due }} aria-hidden="true" />

                      {isOpen ? (
                        <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.status }} aria-hidden="true" />
                      ) : (
                        <GroupSegmentBar
                          title="Status"
                          segments={buildSegments(group.tasks, 'status', STATUS_ORDER, STATUS_SEGMENT_CLASSES)}
                          labels={STATUS_SEGMENT_LABELS}
                          width={COLUMN_WIDTHS.status}
                        />
                      )}
                    </div>

                    <CollapsibleContent>
                      <BucketRows
                        bucket={bucket}
                        tasks={group.tasks}
                        canWrite={canWrite}
                        savingId={savingId ?? openingTaskId}
                        onStatusChange={handleStatusChange}
                        onOpenTask={handleOpenTask}
                        rowError={rowError}
                      />
                      {canQuickAdd && bucket.canQuickAdd && quickAddBucket?.key !== bucket.key && (
                        <div className="px-3 py-2 border-t border-border/60">
                          <button
                            type="button"
                            onClick={(e) => openQuickAdd(bucket, e.currentTarget)}
                            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add a task
                          </button>
                        </div>
                      )}
                      {hidden > 0 && (
                        <div className="px-3 py-2 border-t border-border/60">
                          <button
                            type="button"
                            onClick={async () => {
                              setExpandingBucket(bucket.key)
                              try {
                                await load({ silent: true, expandBucket: bucket.key })
                              } finally {
                                setExpandingBucket(null)
                              }
                            }}
                            disabled={expandingBucket === bucket.key}
                            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80 disabled:opacity-60 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {expandingBucket === bucket.key && <Loader2 className="h-3 w-3 animate-spin" />}
                            Show all {group.count} {bucket.label.toLowerCase()} tasks
                          </button>
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )
            })
          )}
        </CardContent>
      </Card>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={closeTask}
          onSave={handleTaskSave}
          userRole={user?.role}
          eyebrowLabel="My Work"
          projectId={selectedTask.project_id || selectedTask.project?.id}
        />
      )}
    </>
  )
}
