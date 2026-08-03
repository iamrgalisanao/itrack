import { useState, useEffect, useMemo } from 'react'
import { fetchTaskboardTasks, createTaskboardTask, updateDetailedActivity } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { LayoutGrid, Plus, ChevronDown, RefreshCw } from 'lucide-react'
import TaskDetailModal from '@/components/TaskDetailModal'

const PRIORITY_BADGE_CLASSES = {
  Critical: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
  High: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  Medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  Low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
}

// 019-taskboard-scannability: deterministic per-group color accent, drawn
// from the same color families as PRIORITY_BADGE_CLASSES/SENTIMENT_BADGE_CLASSES
// (research.md D2) — assigned by group index, cycling when groups > entries.
// Rendered as an absolutely-positioned background bar (not a border-left
// utility): index.css defines a global, unlayered `* { border-color: ... }`
// reset that always outranks any Tailwind border-*-color utility regardless
// of specificity (unlayered CSS beats all `@layer`-declared utilities per
// the CSS Cascade Layers spec), so border-l-{color} utilities render inert
// app-wide. A background-color bar sidesteps that constraint entirely.
const GROUP_ACCENT_CLASSES = [
  { bar: 'bg-emerald-500', label: 'text-emerald-700 dark:text-emerald-400' },
  { bar: 'bg-amber-500', label: 'text-amber-700 dark:text-amber-400' },
  { bar: 'bg-primary', label: 'text-primary' },
  { bar: 'bg-rose-500', label: 'text-rose-700 dark:text-rose-400' },
  { bar: 'bg-orange-500', label: 'text-orange-700 dark:text-orange-400' },
]

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
    return ordered.map((label, index) => ({
      label,
      tasks: byLabel.get(label),
      pointSum: byLabel.get(label).reduce((sum, t) => sum + (t.estimated_story_points || 0), 0),
      accent: GROUP_ACCENT_CLASSES[index % GROUP_ACCENT_CLASSES.length],
    }))
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

      {!loading && groups.map((group) => (
        <Collapsible key={group.label} defaultOpen>
          <div className="relative rounded-xl border border-border/60 shadow-sm overflow-hidden">
            <span className={`absolute inset-y-0 left-0 w-1 pointer-events-none ${group.accent.bar}`} aria-hidden="true" />
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30 text-left">
                <span className={`flex items-center gap-2 text-sm font-semibold ${group.accent.label}`}>
                  <ChevronDown className="h-4 w-4 transition-transform" />
                  {group.label}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{group.tasks.length}</Badge>
                  <span className="text-xs text-muted-foreground">{group.pointSum} points</span>
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Table>
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
                      <TableCell className="py-1.5 px-3 text-sm font-medium">{task.name}</TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-muted-foreground whitespace-nowrap">{task.module?.name || '—'}</TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-muted-foreground capitalize">{task.status}</TableCell>
                      <TableCell className="py-1.5 px-3">
                        {task.priority ? (
                          <Badge variant="outline" className={PRIORITY_BADGE_CLASSES[task.priority]}>{task.priority}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-muted-foreground">{task.estimated_story_points ?? '—'}</TableCell>
                      <TableCell className="py-1.5 px-3 text-xs text-muted-foreground whitespace-nowrap">{task.assignee?.name || 'Unassigned'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}

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
