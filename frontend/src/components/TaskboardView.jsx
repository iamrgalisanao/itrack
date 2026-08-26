import { useState, useEffect, useMemo } from 'react'
import { fetchTaskboardTasks, createTaskboardTask, updateDetailedActivity } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { LayoutGrid, Plus, ChevronDown, RefreshCw } from 'lucide-react'
import TaskDetailModal from '@/components/TaskDetailModal'
import { GROUP_ACCENT_CLASSES, buildSegments, GroupSegmentBar } from '@/components/GroupSummaryBar'

const PRIORITY_BADGE_CLASSES = {
  Critical: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
  High: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  Medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  Low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
}

// Group-header visual summary: fixed status/type order + solid segment
// colors so the collapsed group row still communicates its status/type mix
// (matches the monday.com reference: a segmented bar per column, not a list).
const STATUS_ORDER = ['backlog', 'not_started', 'in_progress', 'for_review', 'blocked', 'delayed', 'completed']
const STATUS_SEGMENT_LABELS = {
  backlog: 'Backlog',
  not_started: 'Not Started',
  in_progress: 'In Progress',
  for_review: 'For Review',
  blocked: 'Blocked',
  delayed: 'Delayed',
  completed: 'Done',
}
const STATUS_SEGMENT_CLASSES = {
  backlog: 'bg-slate-400',
  not_started: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  for_review: 'bg-purple-500',
  blocked: 'bg-red-500',
  delayed: 'bg-red-600',
  completed: 'bg-emerald-500',
}
// Status column badge — same color families as STATUS_SEGMENT_CLASSES, in
// the outline-badge style PRIORITY_BADGE_CLASSES already uses.
const STATUS_BADGE_CLASSES = {
  backlog: 'border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300',
  not_started: 'border-slate-400/40 bg-slate-400/10 text-slate-700 dark:text-slate-300',
  in_progress: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  for_review: 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400',
  blocked: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
  delayed: 'border-red-600/40 bg-red-600/10 text-red-800 dark:text-red-400',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
}

const PRIORITY_ORDER = ['Critical', 'High', 'Medium', 'Low', 'unset']
const PRIORITY_SEGMENT_LABELS = { Critical: 'Critical', High: 'High', Medium: 'Medium', Low: 'Low', unset: 'Unset' }
const PRIORITY_SEGMENT_CLASSES = {
  Critical: 'bg-red-500',
  High: 'bg-orange-500',
  Medium: 'bg-amber-500',
  Low: 'bg-emerald-500',
  unset: 'bg-muted-foreground/30',
}

// Column widths (percentages, must sum to 100) shared between the
// group-header summary row and the task table beneath it, so the
// Status/Priority/Points summaries line up with their matching data
// columns. The task table uses `table-fixed` with a <colgroup> using these
// same values, so they're authoritative for both, not just a visual
// approximation. Percentages, not px — see GroupSummaryBar.jsx's file
// comment for why px widths drift out of alignment at wider viewports.
const COLUMN_WIDTHS = { task: '30.77%', epic: '17.58%', status: '14.29%', priority: '12.09%', points: '8.79%', assignee: '16.48%' }

const EMPTY_FORM = {
  module_id: '',
  name: '',
  priority: '',
  estimated_story_points: '',
  sprint_label: '',
}

/**
 * 018-taskboard: a flat, project-wide grouped view of DetailedActivity
 * ("Task") rows, grouped client-side by sprint_label (Backlog bucket for
 * unset labels, remaining labels alpha-sorted — research.md D6). Reuses
 * TaskDetailModal for row-click editing rather than a new detail component.
 */
export default function TaskboardView({ project, modules = [], userRole }) {
  const canManageTaskboardFields = userRole === 'Admin' || userRole === 'Project Manager'
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [selectedTask, setSelectedTask] = useState(null)
  // Groups start expanded (matching prior defaultOpen behavior); the
  // Status/Priority summary bars only render for groups in this set,
  // since they'd otherwise duplicate the per-row data already visible below.
  const [closedGroups, setClosedGroups] = useState(() => new Set())

  const loadTasks = () => {
    if (!project?.id) return
    setLoading(true)
    fetchTaskboardTasks(project.id)
      .then((res) => setTasks(res.data.data || res.data))
      .catch((err) => {
        console.error('Failed to load Taskboard tasks:', err)
        setError('Failed to load Taskboard tasks.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    loadTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  // research.md D6: Backlog first, then remaining sprint labels alpha-sorted
  // — no real ordering metadata exists for free-text labels.
  const groups = useMemo(() => {
    const byLabel = new Map()
    for (const task of tasks) {
      const key = task.sprint_label || 'Backlog'
      if (!byLabel.has(key)) byLabel.set(key, [])
      byLabel.get(key).push(task)
    }
    const labels = [...byLabel.keys()].filter((l) => l !== 'Backlog').sort()
    const ordered = byLabel.has('Backlog') ? ['Backlog', ...labels] : labels
    return ordered.map((label, index) => {
      const groupTasks = byLabel.get(label)
      return {
        label,
        tasks: groupTasks,
        pointSum: groupTasks.reduce((sum, t) => sum + (t.estimated_story_points || 0), 0),
        accent: GROUP_ACCENT_CLASSES[index % GROUP_ACCENT_CLASSES.length],
        statusSegments: buildSegments(groupTasks, 'status', STATUS_ORDER, STATUS_SEGMENT_CLASSES),
        prioritySegments: buildSegments(groupTasks, 'priority', PRIORITY_ORDER, PRIORITY_SEGMENT_CLASSES),
      }
    })
  }, [tasks])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!createForm.module_id || !createForm.name.trim()) return
    try {
      await createTaskboardTask(project.id, {
        module_id: Number(createForm.module_id),
        name: createForm.name.trim(),
        priority: createForm.priority || null,
        estimated_story_points: createForm.estimated_story_points === '' ? null : Number(createForm.estimated_story_points),
        sprint_label: createForm.sprint_label || null,
      })
      setCreateForm(EMPTY_FORM)
      setIsCreateOpen(false)
      loadTasks()
    } catch (err) {
      console.error('Failed to create Taskboard task:', err)
      setError('Failed to create task.')
    }
  }

  const handleSaveTask = async (form) => {
    try {
      await updateDetailedActivity(selectedTask.id, form)
      loadTasks()
    } catch (err) {
      console.error('Failed to update task:', err)
      setError('Failed to update task.')
      return false
    }
  }

  if (error) {
    return <div className="text-sm text-destructive px-1">{error}</div>
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted py-20 text-center gap-3">
        <LayoutGrid className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Select a project to view its Taskboard.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canManageTaskboardFields && (
          <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Task
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center min-h-[160px] text-sm text-muted-foreground gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading Taskboard…
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted py-20 text-center gap-3">
          <LayoutGrid className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No Taskboard tasks yet for this project.</p>
          {canManageTaskboardFields && (
            <Button type="button" size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create the first task
            </Button>
          )}
        </div>
      )}

      {!loading && groups.map((group) => {
        const isOpen = !closedGroups.has(group.label)
        return (
        <Collapsible
          key={group.label}
          open={isOpen}
          onOpenChange={(open) => {
            setClosedGroups((prev) => {
              const next = new Set(prev)
              if (open) next.delete(group.label)
              else next.add(group.label)
              return next
            })
          }}
        >
          <div className="relative rounded-xl border border-border/60 shadow-sm overflow-hidden">
            <span className={`absolute inset-y-0 left-0 w-1 pointer-events-none ${group.accent.bar}`} aria-hidden="true" />
            {/* No gap between children, and no container-level horizontal
                padding at all (not even on one side) — every column here is a
                percentage of this container's own width (see
                GroupSummaryBar.jsx's file comment), and the real <table>
                below has zero container padding of its own (only per-cell
                px-3). Any padding on THIS container — even asymmetric,
                one-sided padding — would shrink the container's width basis
                relative to the table's, so every column's percentage would
                resolve against a slightly different pixel base and drift by a
                few px. The label's own px-3-equivalent left inset instead
                lives inside the button itself (pl-3 below), which doesn't
                touch the container's width basis, matching how a table
                cell's own px-3 lives inside its <td> without affecting the
                colgroup's column width. Each spacer/bar below is a sibling of
                the trigger button, not a child of it, so only the label area
                toggles the group open/closed. */}
            <div className="relative flex items-center py-3 border-b border-border/60 bg-muted/30">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className={`flex items-center gap-2 pl-3 text-sm font-semibold shrink-0 min-w-0 text-left ${group.accent.label} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded`}
                  style={{ width: COLUMN_WIDTHS.task }}
                >
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  <span className="truncate">
                    {group.label}
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {group.tasks.length} {group.tasks.length === 1 ? 'Task' : 'Tasks'}
                    </span>
                  </span>
                </button>
              </CollapsibleTrigger>

              {/* Epic column spacer — no group-level rollup for this column */}
              <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.epic }} aria-hidden="true" />

              {isOpen ? (
                <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.status }} aria-hidden="true" />
              ) : (
                <GroupSegmentBar title="Status" segments={group.statusSegments} labels={STATUS_SEGMENT_LABELS} width={COLUMN_WIDTHS.status} />
              )}

              {isOpen ? (
                <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.priority }} aria-hidden="true" />
              ) : (
                <GroupSegmentBar title="Priority" segments={group.prioritySegments} labels={PRIORITY_SEGMENT_LABELS} width={COLUMN_WIDTHS.priority} />
              )}

              {/* Left-aligned with a px-3-equivalent left inset, matching the
                  real Points column: header + cell values are both left-aligned
                  with px-3 cell padding, not right-aligned/flush. */}
              <div className="shrink-0 pl-3" style={{ width: COLUMN_WIDTHS.points }}>
                {!isOpen && (
                  <>
                    <div className="text-xs font-semibold text-foreground">{group.pointSum} SP</div>
                    <div className="text-[10px] text-muted-foreground">sum</div>
                  </>
                )}
              </div>

              <div className="hidden sm:block shrink-0" style={{ width: COLUMN_WIDTHS.assignee }} aria-hidden="true" />
            </div>
            <CollapsibleContent>
              <Table className="table-fixed">
                <colgroup>
                  <col style={{ width: COLUMN_WIDTHS.task }} />
                  <col style={{ width: COLUMN_WIDTHS.epic }} />
                  <col style={{ width: COLUMN_WIDTHS.status }} />
                  <col style={{ width: COLUMN_WIDTHS.priority }} />
                  <col style={{ width: COLUMN_WIDTHS.points }} />
                  <col style={{ width: COLUMN_WIDTHS.assignee }} />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 py-1.5 px-3 text-xs">Task</TableHead>
                    <TableHead className="h-8 py-1.5 px-3 text-xs">Epic</TableHead>
                    <TableHead className="h-8 py-1.5 px-3 text-xs">Status</TableHead>
                    <TableHead className="h-8 py-1.5 px-3 text-xs">Priority</TableHead>
                    <TableHead className="h-8 py-1.5 px-3 text-xs">Points</TableHead>
                    <TableHead className="h-8 py-1.5 px-3 text-xs">Assignee</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.tasks.map((task) => (
                    <TableRow key={task.id} className="cursor-pointer" onClick={() => setSelectedTask(task)}>
                      <TableCell className="py-1.5 px-3 text-sm font-medium truncate" title={task.name}>{task.name}</TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-muted-foreground truncate" title={task.module?.name || undefined}>{task.module?.name || '—'}</TableCell>
                      <TableCell className="py-1.5 px-3">
                        <Badge variant="outline" className={STATUS_BADGE_CLASSES[task.status]}>
                          {STATUS_SEGMENT_LABELS[task.status] || task.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-1.5 px-3">
                        {task.priority ? (
                          <Badge variant="outline" className={PRIORITY_BADGE_CLASSES[task.priority]}>{task.priority}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">{task.estimated_story_points ?? '—'}</TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-muted-foreground truncate" title={task.assignee?.name || 'Unassigned'}>{task.assignee?.name || 'Unassigned'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CollapsibleContent>
          </div>
        </Collapsible>
        )
      })}

      {/* New Task dialog — Epic (Module) picker + simplified fields only;
          the reserved Activity/SubActivity chain is resolved server-side. */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogTitle>New Task</DialogTitle>
          <DialogDescription>Pick the Epic — everything else is optional.</DialogDescription>
          <form onSubmit={handleCreate} className="space-y-4">
            <label className="text-xs font-medium text-muted-foreground space-y-1 block">
              Epic
              <select
                required
                value={createForm.module_id}
                onChange={(e) => setCreateForm((f) => ({ ...f, module_id: e.target.value }))}
                className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              >
                <option value="" disabled>Select an Epic…</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            <input
              autoFocus
              required
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Task title"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Priority
                <select
                  value={createForm.priority}
                  onChange={(e) => setCreateForm((f) => ({ ...f, priority: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="">None</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </label>
              <label className="text-xs font-medium text-muted-foreground space-y-1">
                Story Points
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={createForm.estimated_story_points}
                  onChange={(e) => setCreateForm((f) => ({ ...f, estimated_story_points: e.target.value }))}
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground space-y-1 col-span-2">
                Sprint Label
                <input
                  value={createForm.sprint_label}
                  onChange={(e) => setCreateForm((f) => ({ ...f, sprint_label: e.target.value }))}
                  placeholder="e.g. Sprint 1 (leave blank for Backlog)"
                  className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Create Task</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={handleSaveTask}
          userRole={userRole}
          eyebrowLabel="Taskboard Task"
          projectId={project.id}
        />
      )}
    </div>
  )
}
