import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchProjects,
  fetchModules,
  updateDetailedActivity,
} from '@/lib/api'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  List,
  Grid,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  Milestone,
  ArrowRight,
  X,
  MessageSquare,
  Paperclip,
} from 'lucide-react'
import { useEffectiveUser } from '@/context/PreviewContext'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import TaskComments from '@/components/TaskComments'
import TaskFiles from '@/components/TaskFiles'
import AccessDenied from '@/components/AccessDenied'

export default function Schedule() {
  // 007-permission-hardening: reflects the previewed target during an
  // active preview, not the real Admin — see useEffectiveUser() in
  // context/PreviewContext.jsx.
  const user = useEffectiveUser()
  const userRole = user?.role
  const userDept = user?.department
  
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [statusFilter] = useState('all')
  
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [projectsError, setProjectsError] = useState(null)
  const [accessDenied, setAccessDenied] = useState(false)
  
  const [viewMode, setViewMode] = useState('month') // 'month' | 'week' | 'timeline'
  const [currentDate, setCurrentDate] = useState(new Date())

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [modalTab, setModalTab] = useState('details') // 'details' | 'comments' | 'files'
  const [commentCount, setCommentCount] = useState(0)
  const [fileCount, setFileCount] = useState(0)
  // Task detail modal animation (matches TaskDetailModal.jsx's shared
  // component — this modal is a separate, not-yet-consolidated
  // implementation with the same Details/Comments/Files tab structure, so
  // it gets the same sliding tab indicator + smooth resize treatment).
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  // Found during review: a per-tab `tabRefs.current[modalTab]` map could
  // end up stale after the modal closed and reopened (the indicator got
  // stuck on whichever tab was active before close, even though "Details"
  // was correctly marked active again). Querying the tablist for
  // `[aria-selected="true"]` instead ties the measured element directly to
  // the exact same boolean that already drives each tab's active-state
  // styling — the two can never disagree, since they're the same source.
  const tabListRef = useRef(null)
  const [dialogHeight, setDialogHeight] = useState(null)
  const contentInnerRef = useRef(null)

  // Toast notifications
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Fetch projects initially
  const loadProjects = () => {
    setProjectsError(null)
    fetchProjects()
      .then((res) => {
        let list = res.data.data || res.data

        // Scope projects for Department Head
        if (userRole === 'Department Head' && userDept) {
          list = list.filter(p => p.department?.toLowerCase() === userDept.toLowerCase())
        }

        setProjects(list)
        if (list.length > 0) {
          // If department head, default to their department
          if (userRole === 'Department Head' && userDept) {
            setDepartmentFilter(userDept)
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load projects:', err)
        setProjectsError('Failed to load projects.')
      })
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- established data-load-on-mount idiom used throughout this codebase; loadProjects is recreated every render, including it would loop
  useEffect(() => { loadProjects() }, [userRole, userDept])

  // Fetch all tasks for selected projects
  const loadTasks = async () => {
    setLoading(true)
    setAccessDenied(false)
    try {
      const allTasks = []
      
      // Determine which projects to load
      let targetProjects = [...projects]
      if (selectedProjectId !== 'all') {
        targetProjects = projects.filter(p => p.id === parseInt(selectedProjectId, 10))
      }

      for (const project of targetProjects) {
        const res = await fetchModules(project.id)
        const modules = res.data.data || res.data
        
        modules.forEach((m) => {
          const acts = m.activities || []
          acts.forEach((a) => {
            const subs = a.sub_activities || []
            subs.forEach((sa) => {
              const detailed = sa.detailed_activities || []
              detailed.forEach((da) => {
                allTasks.push({
                  ...da,
                  projectId: project.id,
                  projectName: project.name,
                  projectDept: project.department,
                  moduleName: m.name,
                  activityName: a.name,
                  subActivityName: sa.name,
                })
              })
            })
          })
        })
      }
      
      setTasks(allTasks)
    } catch (err) {
      console.error('Failed to load tasks for Schedule:', err)
      // 007-permission-hardening (FR-010): a 403 here means a project
      // assignment was revoked mid-session — a genuine access-denied
      // state, not a transient failure a toast-and-retry fits.
      if (err.response?.status === 403) {
        setAccessDenied(true)
      } else {
        showToast('Error loading schedule events', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (projects.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
      loadTasks()
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadTasks is recreated every render; including it would loop
  }, [projects, selectedProjectId])

  // Handle deep linking query param ?task={id}
  useEffect(() => {
    if (loading) return // Wait until finished loading tasks
    const queryParams = new URLSearchParams(window.location.search)
    const taskIdParam = queryParams.get('task')
    if (taskIdParam) {
      const taskId = parseInt(taskIdParam, 10)
      const task = tasks.find(t => t.id === taskId)
      if (task) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the modal to a deep-linked ?task= query param, not a data load
        setSelectedTask({ ...task })
        setModalTab('details')
        setCommentCount(task.comments_count ?? 0)
        setFileCount(0)
        setIsEditModalOpen(true)
      } else {
        showToast('You no longer have access to this task or it may have been archived.', 'error')
      }
      // Clear query param after parsing
      queryParams.delete('task')
      const newSearch = queryParams.toString()
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '')
      window.history.replaceState({}, document.title, newUrl)
    }
  }, [tasks, loading])

  // Task details edit submit
  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!selectedTask) return
    setIsSaving(true)

    try {
      const res = await updateDetailedActivity(selectedTask.id, selectedTask)
      const updated = res.data.data || res.data
      
      setTasks(prev => prev.map(t => (t.id === selectedTask.id ? { ...t, ...updated } : t)))
      setIsEditModalOpen(false)
      showToast('Task details saved successfully')
    } catch (err) {
      console.error('Failed to update task:', err)
      showToast('Failed to save task details', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Sliding tab-indicator position — glides to whichever tab is active
  // instead of each tab drawing its own static underline. Measured from the
  // actual DOM nodes via ResizeObserver (not guessed from text length).
  //
  // Root cause (found during review, confirmed by reading
  // @radix-ui/react-portal's source): Radix's Dialog renders its content
  // through a Portal that starts internally "unmounted" (`useState(false)`)
  // and only flips to mounted via ITS OWN `useLayoutEffect(() => setMounted
  // (true), [])`, one render cycle later. That transition happens entirely
  // inside Portal's own subtree and does NOT trigger a re-render of this
  // component — so a `useLayoutEffect` declared here (however its
  // dependency array is set up) can run once, see `tabListRef.current` is
  // still null because Portal hasn't rendered real content yet, bail out,
  // and never get a chance to run again once Portal actually mounts. This
  // only bit on a fresh modal open (a fresh Portal instance) — clicking
  // between tabs in an already-open modal always worked, since Portal had
  // already settled by then.
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

  // Modal-resize animation: measures how tall the dialog needs to be to
  // exactly fit the active tab's content, then applies that as an explicit,
  // transitioning height on DialogContent so switching to a shorter/taller
  // tab glides instead of snapping. `contentInnerRef.offsetTop` is the
  // height used by everything above the scrollable body (header, tab bar) —
  // unaffected by how much the scrollable wrapper around it has stretched
  // via flex-1, so it stays correct across tab switches, not just the first
  // render. `contentInnerRef.scrollHeight` is that tab's own true content
  // height, likewise independent of the scrollable ancestor's current
  // (possibly stale, from the *previous* tab) size. Clamped to the same
  // ~90vh ceiling the static max-h-[90vh] used to enforce alone — beyond
  // that, the scrollable wrapper's own overflow-y-auto still takes over
  // exactly as before (see TaskDetailModal.jsx for the identical technique).
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

  // Scopes and filters
  const getFilteredTasks = () => {
    return tasks.filter(task => {
      // Scoping rules (department)
      if (userRole === 'Department Head' && userDept) {
        if (!task.projectDept || task.projectDept.toLowerCase() !== userDept.toLowerCase()) {
          return false
        }
      } else if (departmentFilter !== 'all') {
        if (!task.projectDept || task.projectDept.toLowerCase() !== departmentFilter.toLowerCase()) {
          return false
        }
      }

      // Assignee Filter
      if (assigneeFilter !== 'all' && task.responsible !== assigneeFilter) {
        return false
      }

      // Status Filter
      if (statusFilter !== 'all' && task.status !== statusFilter) {
        return false
      }

      return true
    })
  }

  const filteredTasks = getFilteredTasks()

  const isTaskOverdue = (task) => {
    if (task.status === 'completed') return false
    if (!task.plan_end_date) return false
    return new Date(task.plan_end_date) < new Date()
  }

  const isMilestone = (task) => {
    // Zero duration detailed activities represent Milestones
    return (task.duration_months === 0 && task.duration_days === 0) || task.progress === 100 && task.status === 'completed' && task.name.toLowerCase().includes('milestone')
  }

  // Unique lists for filter options
  const departments = ['all', ...new Set(projects.map(p => p.department).filter(Boolean))]
  const assignees = ['all', ...new Set(tasks.map(t => t.responsible).filter(Boolean))]

  // Date controls helper
  const prevPeriod = () => {
    const d = new Date(currentDate)
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() - 1)
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() - 7)
    }
    setCurrentDate(d)
  }

  const nextPeriod = () => {
    const d = new Date(currentDate)
    if (viewMode === 'month') {
      d.setMonth(d.getMonth() + 1)
    } else if (viewMode === 'week') {
      d.setDate(d.getDate() + 7)
    }
    setCurrentDate(d)
  }

  // RENDER MONTH VIEW
  const renderMonthView = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    const firstDayIndex = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const days = []
    // Padding for previous month days
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null)
    }
    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i))
    }

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    return (
      <div className="overflow-x-auto">
      <div className="border border-border/80 rounded-xl overflow-hidden shadow-sm bg-card min-w-175">
        {/* Days Header */}
        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/30">
          {weekdays.map(d => (
            <div key={d} className="py-2.5 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Grid Cells */}
        <div className="grid grid-cols-7 grid-rows-5 divide-x divide-y divide-border/60 border-l border-t border-border/10">
          {days.map((day, idx) => {
            if (!day) {
              return <div key={`empty-${idx}`} className="min-h-[110px] bg-muted/5 dark:bg-card/20" />
            }

            const dateStr = day.toISOString().substring(0, 10)
            const dayTasks = filteredTasks.filter(t => {
              const targetDate = t.plan_end_date ? t.plan_end_date.substring(0, 10) : ''
              return targetDate === dateStr
            })

            const isToday = new Date().toDateString() === day.toDateString()

            return (
              <div 
                key={dateStr} 
                className={`min-h-[110px] p-2 flex flex-col justify-between hover:bg-muted/10 transition-colors ${
                  isToday ? 'bg-primary/5 dark:bg-primary/10' : ''
                }`}
              >
                {/* Day indicator */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${
                    isToday 
                      ? 'h-5 w-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center' 
                      : 'text-muted-foreground'
                  }`}>
                    {day.getDate()}
                  </span>
                  {dayTasks.some(isTaskOverdue) && (
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                  )}
                </div>

                {/* Day Tasks List */}
                <div className="space-y-1 overflow-y-auto flex-1 max-h-[80px] custom-scrollbar">
                  {dayTasks.map(t => {
                    const taskOverdue = isTaskOverdue(t)
                    const isTaskMilestone = isMilestone(t)
                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          setSelectedTask({ ...t })
                          setModalTab('details')
                          setCommentCount(t.comments_count ?? 0)
                          setFileCount(0)
                          setIsEditModalOpen(true)
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelectedTask({ ...t })
                            setModalTab('details')
                            setCommentCount(t.comments_count ?? 0)
                            setFileCount(0)
                            setIsEditModalOpen(true)
                          }
                        }}
                        className={`text-[9px] px-1.5 py-0.5 rounded border leading-tight font-medium cursor-pointer truncate transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                          isTaskMilestone
                            ? 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400 font-bold'
                            : taskOverdue
                            ? 'bg-red-500/10 border-red-500/30 text-red-500 font-bold'
                            : t.status === 'completed'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 line-through'
                            : 'bg-primary/5 border-primary/10 text-foreground hover:bg-primary/10'
                        }`}
                        title={`${isTaskMilestone ? '[Milestone] ' : ''}${t.name} (Status: ${t.status.replace('_', ' ')})`}
                      >
                        {isTaskMilestone ? '◆ ' : ''}{t.name}
                      </div>
                    )}
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      </div>
    )
  }

  // RENDER WEEK VIEW
  const renderWeekView = () => {
    const days = []
    const startOfWeek = new Date(currentDate)
    const day = startOfWeek.getDay()
    // Set to Sunday of current week
    startOfWeek.setDate(startOfWeek.getDate() - day)

    for (let i = 0; i < 7; i++) {
      days.push(new Date(startOfWeek))
      startOfWeek.setDate(startOfWeek.getDate() + 1)
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {days.map((day) => {
          const dateStr = day.toISOString().substring(0, 10)
          const dayTasks = filteredTasks.filter(t => {
            const targetDate = t.plan_end_date ? t.plan_end_date.substring(0, 10) : ''
            return targetDate === dateStr
          })
          const isToday = new Date().toDateString() === day.toDateString()

          return (
            <div 
              key={dateStr}
              className={`rounded-xl border p-4 flex flex-col min-h-[300px] bg-card ${
                isToday ? 'border-primary/50 shadow-sm' : 'border-border/60'
              }`}
            >
              {/* Day Header */}
              <div className="border-b border-border/40 pb-2 mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">
                    {day.toLocaleDateString('en-US', { weekday: 'short' })}
                  </p>
                  <p className={`text-lg font-extrabold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                    {day.getDate()}
                  </p>
                </div>
                {isToday && (
                  <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                    Today
                  </span>
                )}
              </div>

              {/* Tasks List */}
              <div className="space-y-2 flex-1 overflow-y-auto max-h-[350px]">
                {dayTasks.map(t => {
                  const taskOverdue = isTaskOverdue(t)
                  const isTaskMilestone = isMilestone(t)
                  return (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTask({ ...t })
                        setModalTab('details')
                        setCommentCount(t.comments_count ?? 0)
                        setFileCount(0)
                        setIsEditModalOpen(true)
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedTask({ ...t })
                          setModalTab('details')
                          setCommentCount(t.comments_count ?? 0)
                          setFileCount(0)
                          setIsEditModalOpen(true)
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-xs leading-normal cursor-pointer transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                        isTaskMilestone
                          ? 'bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400 font-bold'
                          : taskOverdue
                          ? 'bg-red-500/10 border-red-500/30 text-red-500 font-bold'
                          : t.status === 'completed'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 line-through opacity-75'
                          : 'bg-muted/40 border-border/40 hover:bg-muted/70 text-foreground'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5 mb-1 text-[10px] text-muted-foreground font-semibold">
                        <span className="truncate max-w-[80%]">{t.moduleName}</span>
                        {isTaskMilestone && <Milestone className="h-3 w-3 text-purple-500" />}
                        {taskOverdue && <AlertTriangle className="h-3 w-3 text-destructive" />}
                      </div>
                      <p className="font-bold text-[11px] leading-snug">{t.name}</p>
                      <div className="flex items-center justify-between mt-2 text-[9px] text-muted-foreground">
                        <span className="truncate max-w-[70%]">{t.responsible || 'Unassigned'}</span>
                        <span className="capitalize">{t.status.replace('_', ' ')}</span>
                      </div>
                    </div>
                  )
                })}
                {dayTasks.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-[10px] text-muted-foreground/60 border border-dashed border-border/40 rounded-lg bg-muted/5">
                    No deliverables
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // RENDER MILESTONE TIMELINE LIST VIEW (ACCESSIBILITY FALLBACK)
  const renderTimelineView = () => {
    // Sort tasks with end dates chronologically
    const datedTasks = [...filteredTasks]
      .filter(t => t.plan_end_date)
      .sort((a, b) => new Date(a.plan_end_date) - new Date(b.plan_end_date))

    if (datedTasks.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-border/80 rounded-xl bg-card p-6 text-center text-muted-foreground">
          <List className="h-8 w-8 text-muted-foreground/60 mb-2" />
          <p className="text-sm font-semibold">No dated tasks available for this project</p>
        </div>
      )
    }

    return (
      <div className="relative border-l border-border/80 ml-4 pl-6 space-y-6">
        {datedTasks.map((t) => {
          const taskOverdue = isTaskOverdue(t)
          const isTaskMilestone = isMilestone(t)
          const dDate = new Date(t.plan_end_date)
          
          return (
            <div key={t.id} className="relative group">
              {/* Timeline marker */}
              <span className={`absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 flex items-center justify-center z-10 transition-transform group-hover:scale-110 ${
                isTaskMilestone
                  ? 'bg-purple-500 border-purple-500 text-white'
                  : taskOverdue
                  ? 'bg-destructive border-destructive text-white'
                  : t.status === 'completed'
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'bg-card border-muted-foreground'
              }`}>
                {isTaskMilestone ? (
                  <span className="text-[9px] font-black">M</span>
                ) : t.status === 'completed' ? (
                  <CheckCircle2 className="h-2 w-2 text-white" />
                ) : null}
              </span>

              {/* Card Container */}
              <div
                onClick={() => {
                  setSelectedTask({ ...t })
                  setModalTab('details')
                  setCommentCount(t.comments_count ?? 0)
                  setFileCount(0)
                  setIsEditModalOpen(true)
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedTask({ ...t })
                    setModalTab('details')
                    setCommentCount(t.comments_count ?? 0)
                    setFileCount(0)
                    setIsEditModalOpen(true)
                  }
                }}
                className={`p-4 rounded-xl border border-border/60 bg-card hover:shadow-md hover:border-border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                  taskOverdue ? 'border-l-4 border-l-destructive' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded font-bold text-muted-foreground">
                      {t.projectName}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      {t.moduleName} &gt; {t.activityName}
                    </span>
                  </div>
                  
                  {/* Date */}
                  <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Due: {dDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                      {t.name}
                      {isTaskMilestone && (
                        <span className="text-[9px] bg-purple-500/10 text-purple-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-0.5 uppercase tracking-wide">
                          Milestone
                        </span>
                      )}
                    </h4>
                    {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                  </div>
                  
                  {/* Status Badge */}
                  <span className={`px-2 py-0.5 rounded-full font-semibold text-[9px] uppercase tracking-wide shrink-0 ${
                    t.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : taskOverdue
                      ? 'bg-destructive/10 text-destructive'
                      : t.status === 'in_progress'
                      ? 'bg-blue-500/10 text-blue-600'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {t.status.replace('_', ' ')}
                  </span>
                </div>

                {/* Footer details */}
                <div className="flex items-center gap-4 mt-3 border-t border-border/40 pt-2 text-[10px] text-muted-foreground font-semibold">
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    Assignee: {t.responsible || 'Unassigned'}
                  </span>
                  {t.progress > 0 && (
                    <span>Progress: {t.progress}%</span>
                  )}
                  {taskOverdue && (
                    <span className="text-destructive font-bold flex items-center gap-0.5">
                      <AlertTriangle className="h-3 w-3" /> Overdue
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (accessDenied) {
    return <AccessDenied message="You do not have access to this resource." />
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div role="status" aria-live="polite" className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg border text-sm font-semibold transition-all duration-300 ${
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
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Schedule View</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calendar view of project activities, milestones, and operational deliverables.
          </p>
        </div>
        
        {/* Navigation to Gantt */}
        <Link
          to="/work-program?view=gantt"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-all bg-card shadow-sm"
        >
          <span>Open Gantt Chart View</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Controls: Date period, view switch, project filters */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-card p-4 rounded-xl border border-border/60 shadow-sm">
        
        {/* Left: Date Period controls (not needed for timeline view) */}
        {viewMode !== 'timeline' ? (
          <div className="flex items-center gap-3">
            <button
              onClick={prevPeriod}
              aria-label="Previous period"
              className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <h2 className="text-sm font-bold text-foreground min-w-[120px] text-center">
              {viewMode === 'month' ? (
                currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              ) : (
                `Week of ${new Date(currentDate.setDate(currentDate.getDate() - currentDate.getDay())).getDate()} ${currentDate.toLocaleDateString('en-US', { month: 'short' })}`
              )}
            </h2>

            <button
              onClick={nextPeriod}
              aria-label="Next period"
              className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-muted text-foreground transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <button
              onClick={() => setCurrentDate(new Date())}
              className="text-xs font-semibold text-primary hover:underline px-1"
            >
              Today
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-bold">
              Timeline Roadmap
            </span>
          </div>
        )}

        {/* Right: Filters & view switcher */}
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          {/* Project selector */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Project:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none"
            >
              <option value="all">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Department Filter (Hidden for Department Heads) */}
          {userRole !== 'Department Head' && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider text-[10px]">Dept:</span>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none"
              >
                <option value="all">All Depts</option>
                {departments.filter(d => d !== 'all').map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {/* Assignee Filter */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider text-[10px]">Assignee:</span>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none"
            >
              <option value="all">All Assignees</option>
              {assignees.filter(a => a !== 'all').map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* View Mode Switcher Pills */}
          <div role="group" aria-label="View mode" className="flex items-center rounded-lg bg-muted p-1">
            {[
              { id: 'month', label: 'Month', icon: Grid },
              { id: 'week', label: 'Week', icon: CalendarIcon },
              { id: 'timeline', label: 'Timeline', icon: List },
            ].map((mode) => {
              const Icon = mode.icon
              const isActive = viewMode === mode.id
              return (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id)}
                  aria-pressed={isActive}
                  className={[
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                    isActive 
                      ? 'bg-card text-foreground shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground'
                  ].join(' ')}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{mode.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main Calendar Render */}
      {projectsError ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-destructive font-medium">{projectsError}</p>
          <button onClick={loadProjects} className="text-sm text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
          <Clock className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm font-medium">Loading schedule events...</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center border-2 border-dashed border-border/80 rounded-xl p-8 bg-card shadow-sm">
          <CalendarIcon className="h-10 w-10 text-muted-foreground/60 mb-3" />
          <h3 className="text-base font-bold text-foreground">No deliverables found</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            No schedule events found matching your active filter criteria. Adjust your project or assignee filters.
          </p>
        </div>
      ) : (
        <div className="transition-all duration-300">
          {viewMode === 'month' && renderMonthView()}
          {viewMode === 'week' && renderWeekView()}
          {viewMode === 'timeline' && renderTimelineView()}
        </div>
      )}

      {/* Task Details / Editing Dialog Modal */}
      {isEditModalOpen && selectedTask && (
        <Dialog open={isEditModalOpen} onOpenChange={(open) => !open && setIsEditModalOpen(false)}>
          <DialogContent
            showCloseButton={false}
            className="sm:max-w-2xl flex flex-col p-0 gap-0 overflow-hidden transition-[height] duration-300 ease-in-out"
            style={{ height: dialogHeight ?? undefined }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-primary">Task Detail</span>
                <DialogTitle className="text-base font-bold text-foreground truncate max-w-lg mt-0.5 leading-none tracking-normal">
                  {selectedTask.name}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Edit task details, or view its comments and files.
                </DialogDescription>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs. Each tab keeps a static transparent border-b-2 for
                layout spacing; the colored indicator below is the only
                thing that moves, sliding to whichever tab is active. */}
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
                  measured position/width instead of each tab drawing its own
                  static underline. */}
              <span
                aria-hidden="true"
                className="absolute bottom-0 h-0.5 rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ left: indicatorStyle.left, width: indicatorStyle.width }}
              />
            </div>

            {/* Tab Body — one shared scroll/padding region wrapping all
                three tabs' content (rather than each tab owning its own
                overflow-y-auto + p-6) so contentInnerRef below always
                measures exactly "the active tab's content, including its
                padding," which is what the modal-resize effect above needs.
                Comments/Files stay mounted at all times instead of being
                conditionally rendered like Details — each fetches its own
                data on mount and starts at `loading = true`, so unmounting
                and remounting on every tab switch would replay a
                spinner-then-content flash every time. Toggling visibility
                with `hidden` instead means each fetches once, in the
                background, the moment this modal opens, and switching to
                the tab is then a plain CSS show/hide with nothing left to
                (re)load. `animate-in` still plays its reveal animation on
                every switch — a CSS animation restarts when its element goes
                from display:none to visible again, even for an element that
                was never unmounted (see TaskDetailModal.jsx for the
                identical set of techniques). */}
            <div className="flex-1 overflow-y-auto">
              <div ref={setContentInnerRef} className="p-6">
            {modalTab === 'details' && (
            <form onSubmit={handleEditSubmit} className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
              {/* Task Name */}
              <div className="space-y-1.5">
                <label htmlFor="task-title" className="text-xs font-bold text-foreground">Task Title</label>
                <input
                  id="task-title"
                  type="text"
                  required
                  disabled={userRole === 'Client'}
                  value={selectedTask.name}
                  onChange={(e) => setSelectedTask(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              {/* Status and Progress */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="task-status" className="text-xs font-bold text-foreground">Status</label>
                  <select
                    id="task-status"
                    disabled={userRole === 'Client'}
                    value={selectedTask.status}
                    onChange={(e) => {
                      const statusVal = e.target.value
                      const progressVal = statusVal === 'completed' ? 100 : (statusVal === 'not_started' || statusVal === 'backlog') ? 0 : selectedTask.progress
                      setSelectedTask(prev => ({ ...prev, status: statusVal, progress: progressVal }))
                    }}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-75 disabled:cursor-not-allowed"
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
                  <label htmlFor="task-progress" className="text-xs font-bold text-foreground">Progress (%)</label>
                  <input
                    id="task-progress"
                    type="number"
                    min="0"
                    max="100"
                    disabled={userRole === 'Client'}
                    value={selectedTask.progress}
                    onChange={(e) => setSelectedTask(prev => ({ ...prev, progress: parseInt(e.target.value, 10) || 0 }))}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Responsible & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="task-responsible" className="text-xs font-bold text-foreground">Assignee (Responsible)</label>
                  <input
                    id="task-responsible"
                    type="text"
                    disabled={userRole === 'Client'}
                    value={selectedTask.responsible || ''}
                    onChange={(e) => setSelectedTask(prev => ({ ...prev, responsible: e.target.value }))}
                    placeholder="Owner's name or role"
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="task-priority" className="text-xs font-bold text-foreground">Priority</label>
                  <select
                    id="task-priority"
                    disabled={userRole === 'Client'}
                    value={selectedTask.type || ''}
                    onChange={(e) => setSelectedTask(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-75 disabled:cursor-not-allowed"
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
                  <label htmlFor="task-plan-start" className="text-xs font-bold text-foreground">Planned Start Date</label>
                  <input
                    id="task-plan-start"
                    type="date"
                    disabled={userRole === 'Client'}
                    value={selectedTask.plan_start_date ? selectedTask.plan_start_date.substring(0, 10) : ''}
                    onChange={(e) => setSelectedTask(prev => ({ ...prev, plan_start_date: e.target.value || null }))}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="task-plan-end" className="text-xs font-bold text-foreground">Planned End Date</label>
                  <input
                    id="task-plan-end"
                    type="date"
                    disabled={userRole === 'Client'}
                    value={selectedTask.plan_end_date ? selectedTask.plan_end_date.substring(0, 10) : ''}
                    onChange={(e) => setSelectedTask(prev => ({ ...prev, plan_end_date: e.target.value || null }))}
                    className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-75 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label htmlFor="task-description" className="text-xs font-bold text-foreground">Description</label>
                <textarea
                  id="task-description"
                  rows="3"
                  disabled={userRole === 'Client'}
                  value={selectedTask.description || ''}
                  onChange={(e) => setSelectedTask(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label htmlFor="task-notes" className="text-xs font-bold text-foreground">Notes</label>
                <textarea
                  id="task-notes"
                  rows="2"
                  disabled={userRole === 'Client'}
                  value={selectedTask.notes || ''}
                  onChange={(e) => setSelectedTask(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted text-foreground transition-all"
                >
                  {userRole === 'Client' ? 'Close' : 'Cancel'}
                </button>
                {userRole !== 'Client' && (
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

            <div className={`animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ${modalTab === 'comments' ? '' : 'hidden'}`}>
              <TaskComments
                taskId={selectedTask.id}
                userRole={userRole}
                onCountChange={setCommentCount}
              />
            </div>
            <div className={`animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ${modalTab === 'files' ? '' : 'hidden'}`}>
              <TaskFiles
                taskId={selectedTask.id}
                userRole={userRole}
                onCountChange={setFileCount}
              />
            </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
