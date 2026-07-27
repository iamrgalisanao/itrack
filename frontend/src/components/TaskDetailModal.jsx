import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { X, MessageSquare, Paperclip } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import TaskComments from '@/components/TaskComments'
import TaskFiles from '@/components/TaskFiles'
import { getSupportCompletion, getResolutionCompletion, computeMissing } from '@/lib/supportTemplates'

const SUPPORT_WORK_TYPES = ['support', 'learning']

/**
 * Shared task detail modal — extracted from Kanban.jsx so Kanban and
 * Support Ops (and any future task-driven view) reuse the same
 * Details/Comments/Files chrome instead of duplicating it. Kanban's own
 * behavior/fields are unchanged after this extraction.
 *
 * `onSave(formData)` must return `false` on failure (the modal then stays
 * open) — any other return value (including `undefined`) is treated as
 * success and closes the modal. The caller owns the actual API call, its own
 * list state, and toast/error messaging; this component owns only the form
 * UI and the Comments/Files tabs.
 *
 * `readOnly` (009-support-ops-knowledge-base) — additive, defaults to
 * `false` so every existing caller is unaffected. When `true`: Details tab
 * fields render disabled and "Save Changes" is not rendered (only "Close"
 * remains); the Support/Resolution render props are invoked with a third
 * `readOnly` argument; `TaskComments`/`TaskFiles` also receive `readOnly` to
 * suppress their own add/upload/delete affordances. `handleSubmit` itself is
 * guarded too, so the component never calls `onSave` in read-only mode even
 * if a future edit misses disabling one field or a caller omits `onSave`
 * entirely.
 *
 * `supportFields`/`resolutionFields` (010-task-detail-tabs) — replace the
 * former single `extraFields` render prop. Both are optional
 * `(form, setForm, readOnly) => JSX` functions. The modal shows five tabs
 * (Details, Support, Resolution, Comments, Files) only when the task being
 * shown is a Support Ops issue (`task.work_type` of `support`/`learning`)
 * AND both render props are supplied — otherwise it shows exactly today's
 * three tabs (Details, Comments, Files), unchanged. This is a task-content
 * decision, not a caller decision: a Kanban board task is never eligible
 * (its `work_type` is never a Support Ops value), so its detail view is
 * unaffected automatically, with no defensive check needed on Kanban's side.
 */
export default function TaskDetailModal({
  task,
  onClose,
  onSave,
  userRole,
  eyebrowLabel = 'Task Detail',
  supportFields,
  resolutionFields,
  readOnly = false,
}) {
  const [form, setForm] = useState(task)
  const [modalTab, setModalTab] = useState('details')
  const [commentCount, setCommentCount] = useState(task?.comments_count ?? 0)
  const [fileCount, setFileCount] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  // Whether to show the save-time missing-fields banner. The banner's actual
  // content is recomputed live from `form` on every render (below), not
  // frozen at save time — otherwise fixing a field after seeing the banner
  // would leave it reporting a field as missing after the tab-label pill
  // already shows it complete (found during review).
  const [showMissingSummary, setShowMissingSummary] = useState(false)
  // Sliding tab-indicator position — a small bar under the tab bar that
  // glides to whichever tab is active, instead of each tab drawing its own
  // static underline. Measured from the actual DOM nodes (below), not
  // guessed from text length, so it stays correct for any tab label/pill.
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  // Found during review: a per-tab `tabRefs.current[modalTab]` map could
  // end up stale after the modal closed and reopened (the indicator got
  // stuck on whichever tab was active before close, even though the
  // "Details" tab was correctly marked active again). Querying the tablist
  // for `[aria-selected="true"]` instead ties the measured element directly
  // to the exact same boolean that already drives each tab's active-state
  // styling — the two can never disagree, since they're the same source.
  const tabListRef = useRef(null)
  // Modal-resize animation: the whole dialog's height is driven by this
  // state (a real px number, not "auto") so switching to a shorter/taller
  // tab transitions smoothly instead of snapping — see the measuring
  // useLayoutEffect below for how it's computed.
  const [dialogHeight, setDialogHeight] = useState(null)
  const contentInnerRef = useRef(null)

  // Reset local edit state whenever a different task is opened.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local edit form to the selected task, not a data load
    setForm(task)
    setModalTab('details')
    setCommentCount(task?.comments_count ?? 0)
    setFileCount(0)
    setShowMissingSummary(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on task.id only, not the whole task object
  }, [task?.id])

  // 010-task-detail-tabs: a task-content decision, not a caller decision —
  // see this component's doc comment above. Computed before the early return
  // below (and the dev-diagnostic effect depends on it) to keep every hook
  // call unconditional, per the Rules of Hooks.
  const showSupportResolutionTabs =
    !!task &&
    SUPPORT_WORK_TYPES.includes(task.work_type) &&
    typeof supportFields === 'function' &&
    typeof resolutionFields === 'function'

  // Dev-only diagnostic, moved into an effect (found during review) so a
  // mismatched task logs once per actual change instead of on every render.
  useEffect(() => {
    if (import.meta.env.DEV && task && SUPPORT_WORK_TYPES.includes(task.work_type) && !showSupportResolutionTabs) {
      console.warn(
        `TaskDetailModal: task #${task.id} has work_type "${task.work_type}" but is missing ` +
        `${typeof supportFields !== 'function' ? '`supportFields`' : ''}` +
        `${typeof supportFields !== 'function' && typeof resolutionFields !== 'function' ? ' and ' : ''}` +
        `${typeof resolutionFields !== 'function' ? '`resolutionFields`' : ''} — falling back to the 3-tab layout.`
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- supportFields/resolutionFields are stable render-prop closures per render, not tracked identity
  }, [task?.id, task?.work_type, showSupportResolutionTabs])

  // Sliding tab-indicator position. Root cause of an earlier reopen-stuck
  // bug (found during review, confirmed by reading @radix-ui/react-portal's
  // source): Radix's Dialog renders its content through a Portal that
  // starts internally "unmounted" (`useState(false)`) and only flips to
  // mounted via ITS OWN `useLayoutEffect(() => setMounted(true), [])`, one
  // render cycle later. That transition happens entirely inside Portal's
  // own subtree and does NOT trigger a re-render of this component — so a
  // `useLayoutEffect` declared here (however its dependency array is set
  // up) can run once, see `tabListRef.current` is still null because
  // Portal hasn't rendered real content yet, bail out, and never get a
  // chance to run again once Portal actually mounts. This only bit on a
  // fresh modal open (a fresh Portal instance) — clicking between tabs in
  // an already-open modal always worked, since Portal had already settled
  // by then.
  //
  // Measuring directly from a CALLBACK ref sidesteps this entirely: a
  // callback ref fires exactly when its DOM node attaches, regardless of
  // which component's render caused that attachment — including Portal's
  // own delayed internal one.
  const measureIndicator = useCallback(() => {
    const container = tabListRef.current
    if (!container) return
    const activeEl = container.querySelector('[aria-selected="true"]')
    if (!activeEl) return
    const left = activeEl.offsetLeft
    const width = activeEl.offsetWidth
    setIndicatorStyle((prev) => (prev.left === left && prev.width === width ? prev : { left, width }))
  }, [])

  const setTabListRef = useCallback((el) => {
    tabListRef.current = el
    if (el) measureIndicator()
  }, [measureIndicator])

  // Still keyed on nothing (runs every render) as a second line of defense
  // for in-modal tab switches and any layout drift — the callback ref above
  // is what specifically fixes the reopen case.
  useLayoutEffect(() => {
    const container = tabListRef.current
    if (!container) return

    measureIndicator()
    const raf = requestAnimationFrame(measureIndicator)

    const observer = new ResizeObserver(measureIndicator)
    observer.observe(container)
    const activeEl = container.querySelector('[aria-selected="true"]')
    if (activeEl) observer.observe(activeEl)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  })

  // Modal-resize animation: measures how tall the dialog would need to be
  // to exactly fit the *active* tab's content, then sets that as an
  // explicit height on DialogContent (see the transition-[height] class
  // below) so switching to a shorter/taller tab glides instead of snapping.
  //
  // `contentInnerRef.offsetTop` is the height used by everything above the
  // scrollable body (header, the missing-fields banner when shown, the tab
  // bar) — it's unaffected by how much the scrollable wrapper around it has
  // stretched via flex-1, so it stays correct across tab switches, not just
  // the very first render. `contentInnerRef.scrollHeight` is that tab's own
  // true content height, likewise independent of the scrollable ancestor's
  // current (possibly stale, from the *previous* tab) size. Summing the two
  // gives "how tall the dialog needs to be right now," clamped to the same
  // ~90vh ceiling the static max-h-[90vh] used to enforce alone — beyond
  // that, the scrollable wrapper's own overflow-y-auto still takes over
  // exactly as before.
  //
  // Measured from a callback ref (same reasoning as measureIndicator
  // above): Radix's Portal delays actually rendering the dialog's content
  // by one internal render cycle on every fresh open, and that transition
  // doesn't trigger a re-render of this component — a `useLayoutEffect`
  // alone could run once, find `contentInnerRef.current` still null, and
  // never get a chance to re-measure once Portal actually mounts.
  const measureDialogHeight = useCallback(() => {
    const contentEl = contentInnerRef.current
    if (!contentEl) return
    const natural = contentEl.offsetTop + contentEl.scrollHeight
    setDialogHeight(Math.min(natural, window.innerHeight * 0.9))
  }, [])

  const setContentInnerRef = useCallback((el) => {
    contentInnerRef.current = el
    if (el) measureDialogHeight()
  }, [measureDialogHeight])

  useLayoutEffect(() => {
    const contentEl = contentInnerRef.current
    if (!contentEl) return

    measureDialogHeight()

    const observer = new ResizeObserver(measureDialogHeight)
    observer.observe(contentEl)
    window.addEventListener('resize', measureDialogHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measureDialogHeight)
    }
  })

  if (!task || !form) return null

  const missingSummary = showMissingSummary && showSupportResolutionTabs ? computeMissing(form) : null

  const isFormTab = modalTab === 'details' || modalTab === 'support' || modalTab === 'resolution'

  // 010-task-detail-tabs (FR-008): pure functions of the current `form`
  // state this component already holds — recomputed on every render, no
  // count-lifting mechanism needed (unlike Comments/Files' onCountChange,
  // which exists only because that data comes from a separate fetch).
  const supportCompletion = showSupportResolutionTabs ? getSupportCompletion(form) : null
  const resolutionCompletion = showSupportResolutionTabs ? getResolutionCompletion(form) : null

  // Dismisses any save-time missing-fields summary along with closing —
  // there's no separate dismiss control for the banner (T017/data-model.md),
  // it rides along with the modal's existing Close/X controls.
  const handleClose = () => {
    setShowMissingSummary(false)
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (readOnly) return
    setIsSaving(true)
    try {
      const result = await onSave(form)
      if (result !== false) {
        const missing = showSupportResolutionTabs ? computeMissing(form) : null
        if (missing) {
          setShowMissingSummary(true)
        } else {
          onClose()
        }
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-2xl flex flex-col p-0 gap-0 overflow-hidden transition-[height] duration-300 ease-in-out"
        style={{ height: dialogHeight ?? undefined }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-primary">{eyebrowLabel}</span>
            <DialogTitle className="text-base font-bold text-foreground truncate max-w-lg mt-0.5 leading-none tracking-normal">
              {form.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Edit task details, or view its comments and files.
            </DialogDescription>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Save-time missing-fields summary (US3, FR-012/FR-014): a save
            already succeeded — this never blocks or re-opens a confirmation,
            it just names what's still blank, grouped by tab. Dismissed via
            the modal's existing Close/X controls (handleClose), not a
            control of its own. Never shown in readOnly mode (FR-014) —
            structurally redundant with that guard anyway, since handleSubmit
            never sets it when readOnly is true. */}
        {missingSummary && !readOnly && (
          <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
            <div className="space-y-1">
              <p className="font-semibold">Saved — some information is still missing</p>
              {missingSummary.support && (
                <p>Support is missing: {missingSummary.support.join(', ')}</p>
              )}
              {missingSummary.resolution && (
                <p>Resolution is missing: {missingSummary.resolution.join(', ')}</p>
              )}
            </div>
          </div>
        )}

        {/* Tabs: Details | [Support | Resolution] | Comments | Files.
            Each tab keeps a static transparent border-b-2 for layout
            spacing; the colored indicator below is the only thing that
            moves, sliding to whichever tab is active. */}
        <div ref={setTabListRef} role="tablist" aria-label="Task detail sections" className="relative flex border-b border-border/60 px-6">
          <button
            role="tab"
            aria-selected={modalTab === 'details'}
            onClick={() => setModalTab('details')}
            className={`flex items-center gap-2 px-1 py-3 text-sm font-semibold border-b-2 border-transparent transition-colors mr-6 ${
              modalTab === 'details' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Details
          </button>
          {showSupportResolutionTabs && (
            <>
              <button
                role="tab"
                aria-selected={modalTab === 'support'}
                onClick={() => setModalTab('support')}
                className={`flex items-center gap-2 px-1 py-3 text-sm font-semibold border-b-2 border-transparent transition-colors mr-6 ${
                  modalTab === 'support' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Support
                {/* Completion indicator, always an x/y fraction — never a bare
                    count — so it cannot be mistaken for an activity-count
                    badge like Comments/Files' below (FR-009). */}
                <span className="ml-1 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold">
                  {supportCompletion.complete}/{supportCompletion.total}
                </span>
              </button>
              <button
                role="tab"
                aria-selected={modalTab === 'resolution'}
                onClick={() => setModalTab('resolution')}
                className={`flex items-center gap-2 px-1 py-3 text-sm font-semibold border-b-2 border-transparent transition-colors mr-6 ${
                  modalTab === 'resolution' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Resolution
                <span className="ml-1 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold">
                  {resolutionCompletion.complete}/{resolutionCompletion.total}
                </span>
              </button>
            </>
          )}
          <button
            role="tab"
            aria-selected={modalTab === 'comments'}
            onClick={() => setModalTab('comments')}
            className={`flex items-center gap-2 px-1 py-3 text-sm font-semibold border-b-2 border-transparent transition-colors mr-6 ${
              modalTab === 'comments' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
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
            role="tab"
            aria-selected={modalTab === 'files'}
            onClick={() => setModalTab('files')}
            className={`flex items-center gap-2 px-1 py-3 text-sm font-semibold border-b-2 border-transparent transition-colors ${
              modalTab === 'files' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
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

          {/* Sliding active-tab indicator — glides to the active tab's
              measured position/width (see the useLayoutEffect above) instead
              of each tab drawing its own static underline. */}
          <span
            aria-hidden="true"
            className="absolute bottom-0 h-0.5 rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
          />
        </div>

        {/* Tab Body — one shared scroll/padding region wrapping all five
            tabs' content (rather than each tab owning its own overflow-y-auto
            + p-6) so contentInnerRef below always measures exactly "the
            active tab's content, including its padding," which is what the
            modal-resize effect above needs. */}
        <div className="flex-1 overflow-y-auto">
          <div ref={setContentInnerRef} className="p-6">
            {isFormTab && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {modalTab === 'details' && (
                  // Fresh mount every time this tab becomes active (this
                  // block only exists in the tree while modalTab === 'details')
                  // — animate-in plays its reveal animation on each switch,
                  // unlike the <form> itself, which stays mounted across
                  // Details/Support/Resolution and would only animate once.
                  <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                    {/* Task Name */}
                    <div className="space-y-1.5">
                  <label htmlFor="modal-task-title" className="text-xs font-bold text-foreground">Task Title</label>
                  <input
                    id="modal-task-title"
                    type="text"
                    required
                    disabled={readOnly}
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Status and Progress */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="modal-task-status" className="text-xs font-bold text-foreground">Status</label>
                    <select
                      id="modal-task-status"
                      value={form.status}
                      disabled={readOnly}
                      onChange={(e) => {
                        const statusVal = e.target.value
                        const progressVal = statusVal === 'completed' ? 100 : (statusVal === 'not_started' || statusVal === 'backlog') ? 0 : form.progress
                        setForm((prev) => ({ ...prev, status: statusVal, progress: progressVal }))
                      }}
                      className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
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
                    <label htmlFor="modal-task-progress" className="text-xs font-bold text-foreground">Progress (%)</label>
                    <input
                      id="modal-task-progress"
                      type="number"
                      min="0"
                      max="100"
                      disabled={readOnly}
                      value={form.progress}
                      onChange={(e) => setForm((prev) => ({ ...prev, progress: parseInt(e.target.value, 10) || 0 }))}
                      className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Responsible & Priority */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="modal-task-responsible" className="text-xs font-bold text-foreground">Assignee (Responsible)</label>
                    <input
                      id="modal-task-responsible"
                      type="text"
                      disabled={readOnly}
                      value={form.responsible || ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, responsible: e.target.value }))}
                      placeholder="Owner's name or role"
                      className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="modal-task-priority" className="text-xs font-bold text-foreground">Priority</label>
                    <select
                      id="modal-task-priority"
                      value={form.type || ''}
                      disabled={readOnly}
                      onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                      className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
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
                    <label htmlFor="modal-task-plan-start" className="text-xs font-bold text-foreground">Planned Start Date</label>
                    <input
                      id="modal-task-plan-start"
                      type="date"
                      disabled={readOnly}
                      value={form.plan_start_date ? form.plan_start_date.substring(0, 10) : ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, plan_start_date: e.target.value || null }))}
                      className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="modal-task-plan-end" className="text-xs font-bold text-foreground">Planned End Date</label>
                    <input
                      id="modal-task-plan-end"
                      type="date"
                      disabled={readOnly}
                      value={form.plan_end_date ? form.plan_end_date.substring(0, 10) : ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, plan_end_date: e.target.value || null }))}
                      className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label htmlFor="modal-task-description" className="text-xs font-bold text-foreground">Description</label>
                  <textarea
                    id="modal-task-description"
                    rows="3"
                    disabled={readOnly}
                    value={form.description || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label htmlFor="modal-task-notes" className="text-xs font-bold text-foreground">Notes</label>
                  <textarea
                    id="modal-task-notes"
                    rows="2"
                    disabled={readOnly}
                    value={form.notes || ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
                  </div>
                )}

                {modalTab === 'support' && showSupportResolutionTabs && (
                  <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                    {supportFields(form, setForm, readOnly)}
                  </div>
                )}
                {modalTab === 'resolution' && showSupportResolutionTabs && (
                  <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                    {resolutionFields(form, setForm, readOnly)}
                  </div>
                )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted text-foreground transition-all"
              >
                {readOnly ? 'Close' : 'Cancel'}
              </button>
              {!readOnly && (
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </form>
            )}

            {/* Comments/Files stay mounted at all times (found during review:
                a flicker was reported switching to these tabs) instead of
                being conditionally rendered like the form tabs above — each
                fetches its own data on mount and started at `loading = true`,
                so unmounting and remounting on every tab switch replayed a
                spinner-then-content flash every single time. Toggling
                visibility with `hidden` instead means each fetches once, in
                the background, the moment this modal opens, and switching to
                the tab is then a plain CSS show/hide with nothing left to
                (re)load. `animate-in` still plays its reveal animation on
                every switch back to one of these tabs — a CSS animation
                restarts when its element goes from display:none to visible
                again, even though the element itself was never unmounted. */}
            <div className={`animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ${modalTab === 'comments' ? '' : 'hidden'}`}>
              <TaskComments
                taskId={task.id}
                userRole={userRole}
                onCountChange={setCommentCount}
                readOnly={readOnly}
              />
            </div>
            <div className={`animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ${modalTab === 'files' ? '' : 'hidden'}`}>
              <TaskFiles
                taskId={task.id}
                userRole={userRole}
                onCountChange={setFileCount}
                readOnly={readOnly}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
