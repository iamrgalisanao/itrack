import { useState, useEffect, useRef } from 'react'
import {
  fetchProjects,
  fetchModules,
  updateDetailedActivity,
} from '@/lib/api'
import {
  FolderKanban,
  Search,
  Filter,
  Plus,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  MoreVertical,
  ChevronRight,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/context/AuthContext'
import TaskDetailModal from '@/components/TaskDetailModal'

const COLUMNS = [
  { id: 'backlog', label: 'Backlog', color: 'border-t-slate-400 dark:border-t-slate-600 bg-slate-500/5' },
  { id: 'not_started', label: 'To Do', color: 'border-t-primary/60 bg-primary/5' },
  { id: 'in_progress', label: 'In Progress', color: 'border-t-blue-500 bg-blue-500/5' },
  { id: 'for_review', label: 'For Review', color: 'border-t-amber-500 bg-amber-500/5' },
  { id: 'blocked', label: 'Blocked / Delayed', color: 'border-t-destructive/60 bg-destructive/5' },
  { id: 'completed', label: 'Done', color: 'border-t-emerald-500 bg-emerald-500/5' },
]

export default function Kanban() {
  const { user } = useAuth()
  const userRole = user?.role
  
  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [draggedOverColumn, setDraggedOverColumn] = useState(null)
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  
  // Accessibility menu state
  const [activeMenuId, setActiveMenuId] = useState(null)
  const menuRef = useRef(null)

  // Edit Modal State — TaskDetailModal owns tab/comment-count/file-count/
  // saving state internally; this page just tracks which task is open.
  const [selectedTask, setSelectedTask] = useState(null)
  
  // Toast notifications
  const [toast, setToast] = useState(null)

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

  // Load modules (tasks) for selected project
  const loadTasks = async (projectId) => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await fetchModules(projectId)
      const modules = res.data.data || res.data
      
      // Extract detailed activities (tasks) from modules -> activities -> subactivities
      const allTasks = []
      modules.forEach((m) => {
        const acts = m.activities || []
        acts.forEach((a) => {
          const subs = a.sub_activities || []
          subs.forEach((sa) => {
            const detailed = sa.detailed_activities || []
            detailed.forEach((da) => {
              allTasks.push({
                ...da,
                moduleName: m.name,
                activityName: a.name,
                subActivityName: sa.name,
              })
            })
          })
        })
      })
      
      setTasks(allTasks)
    } catch (err) {
      console.error('Failed to load Kanban tasks:', err)
      showToast('Failed to load tasks', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedProjectId) {
      loadTasks(selectedProjectId)
    }
  }, [selectedProjectId])

  // Handle deep linking query param ?task={id}
  useEffect(() => {
    if (loading) return // Wait until finished loading tasks
    const queryParams = new URLSearchParams(window.location.search)
    const taskIdParam = queryParams.get('task')
    if (taskIdParam) {
      const taskId = parseInt(taskIdParam, 10)
      const task = tasks.find(t => t.id === taskId)
      if (task) {
        setSelectedTask({ ...task })
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

  // Close menus on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Drag and Drop
  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('text/plain', taskId)
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

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault()
    setDraggedOverColumn(null)
    const taskIdStr = e.dataTransfer.getData('text/plain')
    const taskId = parseInt(taskIdStr, 10)
    if (!taskId) return

    await updateTaskStatus(taskId, targetStatus)
  }

  // Common status update logic
  const updateTaskStatus = async (taskId, newStatus) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    // Store original status for rollbacks
    const originalStatus = task.status

    // If targetStatus is 'blocked', set to 'blocked'
    // If targetStatus is 'completed', set to 'completed'
    // If targetStatus is 'in_progress', set to 'in_progress'
    // If targetStatus is 'not_started', set to 'not_started'
    // If targetStatus is 'for_review', set to 'for_review'
    // If targetStatus is 'backlog', set to 'backlog'

    let apiStatus = newStatus
    // If column is blocked, choose backend 'blocked' status (or 'delayed')
    if (newStatus === 'blocked') {
      apiStatus = 'blocked'
    }

    // Optimistic frontend update
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        // Also auto-update progress if done
        const progress = apiStatus === 'completed' ? 100 : (apiStatus === 'not_started' || apiStatus === 'backlog') ? 0 : t.progress
        return { ...t, status: apiStatus, progress }
      }
      return t
    }))

    try {
      await updateDetailedActivity(taskId, { status: apiStatus })
      showToast(`Task status updated to ${newStatus.replace('_', ' ')}`)
    } catch (err) {
      console.error('Failed to update task status:', err)
      showToast('Failed to update status', 'error')
      // Rollback
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return { ...t, status: originalStatus }
        }
        return t
      }))
    }
  }

  // Get unique assignees for filtering
  const assignees = ['all', ...new Set(tasks.map(t => t.responsible).filter(Boolean))]

  // Check if task is overdue
  const isOverdue = (task) => {
    if (task.status === 'completed') return false
    if (!task.plan_end_date) return false
    return new Date(task.plan_end_date) < new Date()
  }

  // Filters application
  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.code && task.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (task.description && task.description.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesAssignee = assigneeFilter === 'all' || task.responsible === assigneeFilter

    const matchesPriority = priorityFilter === 'all' || 
      (priorityFilter === 'high_critical' && (task.type === 'Critical' || task.type === 'High')) ||
      (priorityFilter === 'low_medium' && (task.type === 'Medium' || task.type === 'Low' || !task.type))

    return matchesSearch && matchesAssignee && matchesPriority
  })

  // Group tasks by column
  const getTasksByColumn = (colId) => {
    return filteredTasks.filter(task => {
      if (colId === 'blocked') {
        return task.status === 'blocked' || task.status === 'delayed'
      }
      return task.status === colId
    })
  }

  // Task detail save — passed to TaskDetailModal as `onSave`. Returning
  // `false` keeps the modal open; anything else (including undefined) closes it.
  const handleTaskSave = async (formData) => {
    try {
      const res = await updateDetailedActivity(formData.id, formData)
      const updated = res.data.data || res.data

      setTasks(prev => prev.map(t => (t.id === formData.id ? { ...t, ...updated } : t)))
      showToast('Task details saved successfully')
    } catch (err) {
      console.error('Failed to update task:', err)
      showToast('Failed to save task details', 'error')
      return false
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
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Kanban Board</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visual task board and pipeline for project activities.
          </p>
        </div>
        
        {/* Project Selector */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project:</span>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded-lg border border-border bg-card text-sm font-medium px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-sm min-w-[240px]"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Toolbar / Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-card p-4 rounded-xl border border-border/60 shadow-sm">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Assignee Filter */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5" />
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

          {/* Priority Filter */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none"
            >
              <option value="all">All Priorities</option>
              <option value="high_critical">High / Critical</option>
              <option value="low_medium">Low / Medium</option>
            </select>
          </div>
        </div>
      </div>

      {/* Kanban Board Container */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
          <Clock className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm font-medium">Loading board data...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center border-2 border-dashed border-border/80 rounded-xl p-8 bg-card shadow-sm">
          <FolderKanban className="h-10 w-10 text-muted-foreground/60 mb-3" />
          <h3 className="text-base font-bold text-foreground">No Tasks Available</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            This project has no tasks or activities added yet. Go to the Work Program view to populate tasks.
          </p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 items-start select-none">
          {COLUMNS.map((column) => {
            const columnTasks = getTasksByColumn(column.id)
            const isDraggedOver = draggedOverColumn === column.id
            return (
              <div
                key={column.id}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.id)}
                className={[
                  'flex-1 min-w-[280px] max-w-[320px] rounded-xl border border-border/60 bg-muted/20 flex flex-col max-h-[70vh] transition-colors',
                  isDraggedOver ? 'bg-primary/5 border-primary/40' : '',
                ].join(' ')}
              >
                {/* Column Header */}
                <div className={`p-3 border-t-4 ${column.color} rounded-t-xl flex items-center justify-between border-b border-border/40 bg-card`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">{column.label}</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-bold">
                      {columnTasks.length}
                    </span>
                  </div>
                </div>

                {/* Column Body (Scrollable task cards list) */}
                <div className="p-2 space-y-2 overflow-y-auto flex-1 min-h-[150px]">
                  {columnTasks.map((task) => {
                    const taskOverdue = isOverdue(task)
                    const isDelayed = task.status === 'delayed'
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onClick={() => setSelectedTask({ ...task })}
                        className={[
                          'p-3 rounded-lg border border-border/60 bg-card text-foreground cursor-grab active:cursor-grabbing hover:shadow-md hover:border-border/80 transition-all duration-150 relative group',
                          taskOverdue ? 'border-l-4 border-l-destructive' : '',
                        ].join(' ')}
                      >
                        {/* Task Header */}
                        <div className="flex items-start justify-between gap-1 mb-1.5">
                          {/* Code or path */}
                          <span className="text-[10px] text-muted-foreground truncate max-w-[85%] font-medium">
                            {task.moduleName}
                          </span>
                          
                          {/* Accessibility Option Trigger Button */}
                          <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setActiveMenuId(prev => prev === task.id ? null : task.id)}
                              aria-haspopup="true"
                              aria-expanded={activeMenuId === task.id}
                              aria-label="Move task status"
                              className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>

                            {/* Dropdown status menu */}
                            {activeMenuId === task.id && (
                              <div className="absolute right-0 top-7 z-30 w-44 bg-card border border-border rounded-lg shadow-lg py-1 text-xs">
                                <p className="px-3 py-1 font-semibold text-muted-foreground border-b border-border/60">Move to...</p>
                                {COLUMNS.filter(c => c.id !== task.status && !(c.id === 'blocked' && isDelayed)).map(col => (
                                  <button
                                    key={col.id}
                                    onClick={() => {
                                      updateTaskStatus(task.id, col.id)
                                      setActiveMenuId(null)
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-muted font-medium transition-colors"
                                  >
                                    {col.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Title */}
                        <h4 className="text-xs font-bold leading-normal text-foreground group-hover:text-primary transition-colors pr-4 mb-2">
                          {task.name}
                        </h4>

                        {/* Middle metadata: Dates, Overdue indicator */}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {task.plan_end_date && (
                            <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              taskOverdue 
                                ? 'bg-destructive/10 text-destructive' 
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              <Calendar className="h-3 w-3" />
                              <span>{task.plan_end_date.substring(5)}</span>
                            </div>
                          )}
                          
                          {/* Overdue/Blocked labels */}
                          {taskOverdue && (
                            <span className="text-[9px] font-bold text-destructive uppercase tracking-wide">
                              Overdue
                            </span>
                          )}
                          {isDelayed && (
                            <span className="text-[9px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                              Delayed
                            </span>
                          )}
                          {task.status === 'blocked' && (
                            <span className="text-[9px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                              Blocked
                            </span>
                          )}
                        </div>

                        {/* Card Footer: Assignee & Priority */}
                        <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[10px]">
                          {/* Assignee */}
                          <div className="flex items-center gap-1 text-muted-foreground truncate max-w-[60%]">
                            <div className="h-4 w-4 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-bold text-primary border border-primary/20 shrink-0">
                              {task.responsible ? task.responsible.substring(0, 2).toUpperCase() : <User className="h-2.5 w-2.5" />}
                            </div>
                            <span className="truncate">{task.responsible || 'Unassigned'}</span>
                          </div>

                          {/* Priority */}
                          {task.type && (
                            <span className={`px-1.5 py-0.5 rounded font-semibold text-[9px] ${
                              task.type === 'Critical' 
                                ? 'bg-red-500/10 text-red-500 dark:bg-red-500/20' 
                                : task.type === 'High'
                                ? 'bg-orange-500/10 text-orange-500 dark:bg-orange-500/20'
                                : task.type === 'Medium'
                                ? 'bg-blue-500/10 text-blue-500 dark:bg-blue-500/20'
                                : 'bg-slate-500/10 text-slate-500'
                            }`}>
                              {task.type}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {columnTasks.length === 0 && (
                    <div className="text-center py-6 text-[10px] text-muted-foreground/60 border border-dashed border-border/40 rounded-lg">
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Task Details / Editing Dialog Modal — shared with Support Ops, see TaskDetailModal.jsx */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={handleTaskSave}
          userRole={userRole}
        />
      )}
    </div>
  )
}
