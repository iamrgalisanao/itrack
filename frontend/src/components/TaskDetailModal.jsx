import { useState, useEffect } from 'react'
import { X, MessageSquare, Paperclip } from 'lucide-react'
import TaskComments from '@/components/TaskComments'
import TaskFiles from '@/components/TaskFiles'

/**
 * Shared task detail modal — extracted from Kanban.jsx so Kanban and
 * Support Ops (and any future task-driven view) reuse the same
 * Details/Comments/Files chrome instead of duplicating it. Kanban's own
 * behavior/fields are unchanged after this extraction; `extraFields` is how
 * a calling page adds fields beyond the base set without forking the modal.
 *
 * `onSave(formData)` must return `false` on failure (the modal then stays
 * open) — any other return value (including `undefined`) is treated as
 * success and closes the modal. The caller owns the actual API call, its own
 * list state, and toast/error messaging; this component owns only the form
 * UI and the Comments/Files tabs.
 */
export default function TaskDetailModal({
  task,
  onClose,
  onSave,
  userRole,
  eyebrowLabel = 'Task Detail',
  extraFields,
}) {
  const [form, setForm] = useState(task)
  const [modalTab, setModalTab] = useState('details')
  const [commentCount, setCommentCount] = useState(task?.comments_count ?? 0)
  const [fileCount, setFileCount] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  // Reset local edit state whenever a different task is opened.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local edit form to the selected task, not a data load
    setForm(task)
    setModalTab('details')
    setCommentCount(task?.comments_count ?? 0)
    setFileCount(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on task.id only, not the whole task object
  }, [task?.id])

  if (!task || !form) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      const result = await onSave(form)
      if (result !== false) {
        onClose()
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-primary">{eyebrowLabel}</span>
            <h3 className="text-base font-bold text-foreground truncate max-w-lg mt-0.5">{form.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs: Details | Comments | Files */}
        <div className="flex border-b border-border/60 px-6">
          <button
            onClick={() => setModalTab('details')}
            className={`flex items-center gap-2 px-1 py-3 text-sm font-semibold border-b-2 transition-colors mr-6 ${
              modalTab === 'details'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setModalTab('comments')}
            className={`flex items-center gap-2 px-1 py-3 text-sm font-semibold border-b-2 transition-colors mr-6 ${
              modalTab === 'comments'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Comments
            {commentCount > 0 && (
              <span className="ml-1 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold">
                {commentCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setModalTab('files')}
            className={`flex items-center gap-2 px-1 py-3 text-sm font-semibold border-b-2 transition-colors ${
              modalTab === 'files'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Paperclip className="h-4 w-4" />
            Files
            {fileCount > 0 && (
              <span className="ml-1 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold">
                {fileCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab Body */}
        {modalTab === 'details' ? (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Task Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Task Title</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Status and Progress */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => {
                    const statusVal = e.target.value
                    const progressVal = statusVal === 'completed' ? 100 : (statusVal === 'not_started' || statusVal === 'backlog') ? 0 : form.progress
                    setForm((prev) => ({ ...prev, status: statusVal, progress: progressVal }))
                  }}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="backlog">Backlog</option>
                  <option value="not_started">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="for_review">For Review</option>
                  <option value="blocked">Blocked</option>
                  <option value="delayed">Delayed</option>
                  <option value="completed">Done</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Progress (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.progress}
                  onChange={(e) => setForm((prev) => ({ ...prev, progress: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Responsible & Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Assignee (Responsible)</label>
                <input
                  type="text"
                  value={form.responsible || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, responsible: e.target.value }))}
                  placeholder="Owner's name or role"
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Priority</label>
                <select
                  value={form.type || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">None</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>

            {/* Planned Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Planned Start Date</label>
                <input
                  type="date"
                  value={form.plan_start_date ? form.plan_start_date.substring(0, 10) : ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, plan_start_date: e.target.value || null }))}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Planned End Date</label>
                <input
                  type="date"
                  value={form.plan_end_date ? form.plan_end_date.substring(0, 10) : ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, plan_end_date: e.target.value || null }))}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Description</label>
              <textarea
                rows="3"
                value={form.description || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Notes</label>
              <textarea
                rows="2"
                value={form.notes || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Caller-specific fields (e.g. Support Ops' client/priority/investigation fields) */}
            {typeof extraFields === 'function' ? extraFields(form, setForm) : extraFields}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted text-foreground transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        ) : modalTab === 'comments' ? (
          <div className="flex-1 overflow-y-auto p-6">
            <TaskComments
              taskId={task.id}
              userRole={userRole}
              onCountChange={setCommentCount}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <TaskFiles
              taskId={task.id}
              userRole={userRole}
              onCountChange={setFileCount}
            />
          </div>
        )}
      </div>
    </div>
  )
}
