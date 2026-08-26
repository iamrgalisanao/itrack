import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { useEffectiveUser } from '@/context/PreviewContext'
import AccessDenied from '@/components/AccessDenied'
import ProjectClientAccessPanel from '@/components/ProjectClientAccessPanel'
import ClientMembershipReviewQueue from '@/components/ClientMembershipReviewQueue'
import TaskboardView from '@/components/TaskboardView'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  fetchProjects,
  fetchModules,
  fetchActivities,
  fetchSubActivities,
  fetchDetailedActivities,
  updateDetailedActivity,
  createModule,
  updateModule,
  deleteModule,
  createActivity,
  updateActivity,
  deleteActivity,
  createSubActivity,
  updateSubActivity,
  deleteSubActivity,
  createDetailedActivity,
  deleteDetailedActivity,
  createProject,
  updateProject,
  deleteProject,
} from '@/lib/api'
import { formatDate, getStatusColor, getStatusLabel, getTypeColor, getTypeLabel } from '@/lib/utils'
import { GroupProgressBar, GroupSegmentBar } from '@/components/GroupSummaryBar'
import { buildSegments } from '@/lib/groupSummary'
import {
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  Edit,
  X,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Settings,
  Shield,
  GanttChart,
  FolderOpen,
  LayoutList,
  LayoutGrid,
  RefreshCw,
  SearchX,
  Layers,
  AlertTriangle,
  MoreHorizontal,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react'

// 020-list-view-groups: deterministic per-group color accent for List
// view's flattened Activity groups — same palette/shape as
// TaskboardView.jsx's GROUP_ACCENT_CLASSES (research.md D6), duplicated
// here rather than imported, matching this codebase's established
// preference for small duplication over cross-component coupling at two
// call sites. Rendered as a background-color bar, not border-l-*: a
// global index.css reset makes border-color utilities inert app-wide
// (discovered in 019-taskboard-scannability's research.md D2b).
const GROUP_ACCENT_CLASSES = [
  { bar: 'bg-emerald-500', label: 'text-emerald-700 dark:text-emerald-400' },
  { bar: 'bg-amber-500', label: 'text-amber-700 dark:text-amber-400' },
  { bar: 'bg-primary', label: 'text-primary' },
  { bar: 'bg-rose-500', label: 'text-rose-700 dark:text-rose-400' },
  { bar: 'bg-orange-500', label: 'text-orange-700 dark:text-orange-400' },
]

// List view's Activity-group summary: same fixed-order/solid-color/
// equal-share-segment pattern Taskboard and Bug Tracker use (buildSegments/
// GroupSegmentBar, imported from GroupSummaryBar.jsx), applied to this
// table's own 4-value Status set (getStatusLabel/getStatusColor only cover
// these four — there's no second fixed-value axis here like Taskboard's
// Priority, so this view gets a single Status bar).
const LIST_STATUS_ORDER = ['not_started', 'in_progress', 'completed', 'delayed']
const LIST_STATUS_SEGMENT_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  delayed: 'Delayed',
}
const LIST_STATUS_SEGMENT_CLASSES = {
  not_started: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  completed: 'bg-emerald-500',
  delayed: 'bg-red-500',
}

// Column widths (px) shared between the Activity-group header summary row
// and the task table beneath it — same table-fixed + <colgroup> alignment
// technique as TaskboardView/BugTracker.
// Percentages (must sum to 100), not px — see GroupSummaryBar.jsx's file
// comment for why px widths drift out of alignment at wider viewports.
const LIST_COLUMN_WIDTHS = { actions: '2.62%', task: '21.28%', subActivity: '11.46%', status: '10.64%', progress: '10.64%', responsible: '10.64%', planDates: '16.37%', actualDates: '16.37%' }

// Remembers the last project a user explicitly chose so returning to this
// page (a fresh mount — React Router unmounts WorkProgram on route change,
// so plain component state doesn't survive navigating away and back) shows
// that project again instead of always resetting to whichever one the API
// happens to return first. Read only on initial load; written only at
// deliberate selection points (the picker, and explicit create/edit
// selection in reloadProjects) — never from a blind effect keyed on
// selectedProject, which would fire on mount with the initial null state
// and wipe the persisted value before loadProjects() has read it back.
const SELECTED_PROJECT_STORAGE_KEY = 'itrack.workProgram.selectedProjectId'

const readPersistedProjectId = () => {
  try {
    const raw = localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY)
    return raw ? parseInt(raw, 10) : null
  } catch {
    return null
  }
}

const persistProjectId = (id) => {
  try {
    if (id) {
      localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, String(id))
    } else {
      localStorage.removeItem(SELECTED_PROJECT_STORAGE_KEY)
    }
  } catch {
    // localStorage unavailable (private browsing, disabled) — selection just won't persist
  }
}

export default function WorkProgram() {
  // 007-permission-hardening: reflects the previewed target during an
  // active preview, not the real Admin — see useEffectiveUser() in
  // context/PreviewContext.jsx.
  const user = useEffectiveUser()
  const userRole = user?.role
  const isClient = userRole === 'Client'
  const canReviewClientMemberships = ['Admin', 'Project Manager'].includes(userRole)
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  // The only place a project selection is written to storage — deliberate
  // user/app choices, not the initial-load restore (that only reads).
  const selectProject = (id) => {
    setSelectedProject(id)
    persistProjectId(id)
  }
  const [modules, setModules] = useState([])
  const [expandedModules, setExpandedModules] = useState({})
  const [expandedActivities, setExpandedActivities] = useState({})
  const [activities, setActivities] = useState({})
  const [subActivities, setSubActivities] = useState({})
  const [detailedActivities, setDetailedActivities] = useState({})
  // 020-list-view-groups: flattened, merged task list per Activity (List
  // view only — Gantt view keeps using detailedActivities/toggleSubActivity
  // directly, untouched by this feature).
  const [activityTasks, setActivityTasks] = useState({})
  const [activityTasksLoading, setActivityTasksLoading] = useState({})
  const [manageSubActivitiesFor, setManageSubActivitiesFor] = useState(null) // { moduleId, activityId, activityName }
  const [inlineAddValues, setInlineAddValues] = useState({})
  const [inlineAddErrors, setInlineAddErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [projectsError, setProjectsError] = useState(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [viewMode, setViewMode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const requested = params.get('view')
    // 018-taskboard spec FR-008: Client gets no access to Taskboard at all —
    // not even a manually-typed URL bypasses this; falls back to List.
    if (requested === 'taskboard' && !isClient) return 'taskboard'
    return requested === 'gantt' ? 'gantt' : 'list'
  }) // 'list' | 'gantt' | 'taskboard'
  const [editingCell, setEditingCell] = useState(null) // { taskId, field } — per-cell inline edit, List view only
  const [ganttDataLoading, setGanttDataLoading] = useState(false)
  const [ganttColWidth, setGanttColWidth] = useState(40)
  const [showBaseline, setShowBaseline] = useState(false)
  const [showCriticalPath, setShowCriticalPath] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [clientAccessModalOpen, setClientAccessModalOpen] = useState(false)
  const [projectEditingId, setProjectEditingId] = useState(null)
  const [projectForm, setProjectForm] = useState({ name: '', location: '', updated_date: '' })
  const [projectSaving, setProjectSaving] = useState(false)
  const selectedProjectRecord = projects.find((project) => project.id === selectedProject)
  const canManageSelectedProjectClientAccess = selectedProjectRecord?.can_manage_client_access === true

  const populateStateFromModules = (mods) => {
    const newActivities = {}
    const newSubActivities = {}
    const newDetailedActivities = {}

    mods.forEach(m => {
      const acts = m.activities || []
      newActivities[m.id] = acts

      acts.forEach(a => {
        const actKey = `${m.id}-${a.id}`
        const subs = a.sub_activities || []
        newSubActivities[actKey] = subs

        subs.forEach(sa => {
          const subKey = `${m.id}-${a.id}-${sa.id}`
          const tasks = sa.detailed_activities || []
          newDetailedActivities[subKey] = tasks
        })
      })
    })

    setActivities(newActivities)
    setSubActivities(newSubActivities)
    setDetailedActivities(newDetailedActivities)
  }

  useEffect(() => {
    if (modules.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
      populateStateFromModules(modules)
    }
  }, [modules])

  const handleZoomIn = () => setGanttColWidth(prev => Math.min(prev + 8, 64))
  const handleZoomOut = () => setGanttColWidth(prev => Math.max(prev - 6, 4))
  const handleFitGantt = (totalDays) => {
    // Estimate available width: viewport minus left panel (500px) minus padding
    const available = Math.max(500, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 560)
    setGanttColWidth(Math.max(4, Math.floor(available / totalDays)))
  }

  // Gantt Chart View Helper Functions
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null
    if (dateStr instanceof Date) return dateStr
    const parts = dateStr.substring(0, 10).split('-')
    if (parts.length !== 3) return null
    const [year, month, day] = parts.map(Number)
    return new Date(year, month - 1, day)
  }

  const isToday = (date) => {
    if (!date) return false
    const today = new Date()
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
  }

  const getRolledUpData = () => {
    const rolledUpModules = {}
    const rolledUpActivities = {}
    const rolledUpSubActivities = {}

    const getMinMaxDatesGeneric = (items, startKey, endKey) => {
      let min = null
      let max = null
      items.forEach(item => {
        const dStart = item[startKey] ? parseLocalDate(item[startKey]) : null
        const dEnd = item[endKey] ? parseLocalDate(item[endKey]) : null
        if (dStart && (!min || dStart < min)) min = dStart
        if (dEnd && (!max || dEnd > max)) max = dEnd
      })
      return { min, max }
    }

    const getRollupStatus = (statuses) => {
      if (statuses.length === 0) return 'not_started'
      if (statuses.every(s => s === 'completed')) return 'completed'
      if (statuses.every(s => s === 'not_started' || s === 'pending')) return 'pending'
      return 'in_progress'
    }

    // Timezone-safe local date serializer — avoids UTC offset shifting date by 1 day
    const toLocalDateStr = (date) => {
      if (!date) return null
      const y = date.getFullYear()
      const mo = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${mo}-${d}`
    }

    modules.forEach(m => {
      const moduleActs = activities[m.id] || []
      const actRollups = []

      moduleActs.forEach(a => {
        const key = `${m.id}-${a.id}`
        const subActs = subActivities[key] || []
        const subRollups = []

        subActs.forEach(sa => {
          const fullKey = `${m.id}-${a.id}-${sa.id}`
          const tasks = detailedActivities[fullKey] || []

          let saMinDate
          let saMaxDate
          let saActualMinDate
          let saActualMaxDate
          let saProgress = sa.progress !== undefined ? sa.progress : 0
          let saStatus = sa.status || 'not_started'

          if (tasks.length > 0) {
            // Pure children rollup: use ONLY task dates, ignore sa's own dates
            const taskPlanDates = getMinMaxDatesGeneric(tasks, 'plan_start_date', 'plan_end_date')
            saMinDate = taskPlanDates.min || (sa.plan_start_date ? parseLocalDate(sa.plan_start_date) : null)
            saMaxDate = taskPlanDates.max || (sa.plan_end_date ? parseLocalDate(sa.plan_end_date) : null)

            const taskActualDates = getMinMaxDatesGeneric(tasks, 'actual_start_date', 'actual_end_date')
            saActualMinDate = taskActualDates.min || (sa.actual_start_date ? parseLocalDate(sa.actual_start_date) : null)
            saActualMaxDate = taskActualDates.max || (sa.actual_end_date ? parseLocalDate(sa.actual_end_date) : null)

            const totalProgress = tasks.reduce((sum, t) => sum + (t.progress || 0), 0)
            saProgress = Math.round(totalProgress / tasks.length)

            const taskStatuses = tasks.map(t => t.status)
            saStatus = getRollupStatus(taskStatuses)
          } else {
            // No tasks loaded yet: fall back to sub-activity's own dates
            saMinDate = sa.plan_start_date ? parseLocalDate(sa.plan_start_date) : null
            saMaxDate = sa.plan_end_date ? parseLocalDate(sa.plan_end_date) : null
            saActualMinDate = sa.actual_start_date ? parseLocalDate(sa.actual_start_date) : null
            saActualMaxDate = sa.actual_end_date ? parseLocalDate(sa.actual_end_date) : null
          }

          rolledUpSubActivities[fullKey] = {
            plan_start_date: toLocalDateStr(saMinDate),
            plan_end_date: toLocalDateStr(saMaxDate),
            actual_start_date: toLocalDateStr(saActualMinDate),
            actual_end_date: toLocalDateStr(saActualMaxDate),
            progress: saProgress,
            status: saStatus,
          }

          subRollups.push(rolledUpSubActivities[fullKey])
        })

        let aMinDate
        let aMaxDate
        let aActualMinDate
        let aActualMaxDate
        let aProgress = a.progress !== undefined ? a.progress : 0
        let aStatus = a.status || 'not_started'

        if (subRollups.length > 0) {
          // Pure children rollup: use ONLY sub-activity rollup dates
          const subPlanDates = getMinMaxDatesGeneric(subRollups, 'plan_start_date', 'plan_end_date')
          aMinDate = subPlanDates.min || (a.plan_start_date ? parseLocalDate(a.plan_start_date) : null)
          aMaxDate = subPlanDates.max || (a.plan_end_date ? parseLocalDate(a.plan_end_date) : null)

          const subActualDates = getMinMaxDatesGeneric(subRollups, 'actual_start_date', 'actual_end_date')
          aActualMinDate = subActualDates.min || (a.actual_start_date ? parseLocalDate(a.actual_start_date) : null)
          aActualMaxDate = subActualDates.max || (a.actual_end_date ? parseLocalDate(a.actual_end_date) : null)

          const totalProgress = subRollups.reduce((sum, r) => sum + (r.progress || 0), 0)
          aProgress = Math.round(totalProgress / subRollups.length)

          const subStatuses = subRollups.map(r => r.status)
          aStatus = getRollupStatus(subStatuses)
        } else {
          // No sub-activities loaded: fall back to activity's own dates
          aMinDate = a.plan_start_date ? parseLocalDate(a.plan_start_date) : null
          aMaxDate = a.plan_end_date ? parseLocalDate(a.plan_end_date) : null
          aActualMinDate = a.actual_start_date ? parseLocalDate(a.actual_start_date) : null
          aActualMaxDate = a.actual_end_date ? parseLocalDate(a.actual_end_date) : null
        }

        rolledUpActivities[key] = {
          plan_start_date: toLocalDateStr(aMinDate),
          plan_end_date: toLocalDateStr(aMaxDate),
          actual_start_date: toLocalDateStr(aActualMinDate),
          actual_end_date: toLocalDateStr(aActualMaxDate),
          progress: aProgress,
          status: aStatus,
        }

        actRollups.push(rolledUpActivities[key])
      })

      let mMinDate
      let mMaxDate
      let mActualMinDate
      let mActualMaxDate
      let mProgress = m.progress !== undefined ? m.progress : 0
      let mStatus = m.status || 'not_started'

      if (actRollups.length > 0) {
        // Pure children rollup: use ONLY activity rollup dates
        const actPlanDates = getMinMaxDatesGeneric(actRollups, 'plan_start_date', 'plan_end_date')
        mMinDate = actPlanDates.min || (m.plan_start_date ? parseLocalDate(m.plan_start_date) : null)
        mMaxDate = actPlanDates.max || (m.plan_end_date ? parseLocalDate(m.plan_end_date) : null)

        const actActualDates = getMinMaxDatesGeneric(actRollups, 'actual_start_date', 'actual_end_date')
        mActualMinDate = actActualDates.min || (m.actual_start_date ? parseLocalDate(m.actual_start_date) : null)
        mActualMaxDate = actActualDates.max || (m.actual_end_date ? parseLocalDate(m.actual_end_date) : null)

        const totalProgress = actRollups.reduce((sum, r) => sum + (r.progress || 0), 0)
        mProgress = Math.round(totalProgress / actRollups.length)

        const actStatuses = actRollups.map(r => r.status)
        mStatus = getRollupStatus(actStatuses)
      } else {
        // No activities loaded: fall back to module's own dates
        mMinDate = m.plan_start_date ? parseLocalDate(m.plan_start_date) : null
        mMaxDate = m.plan_end_date ? parseLocalDate(m.plan_end_date) : null
        mActualMinDate = m.actual_start_date ? parseLocalDate(m.actual_start_date) : null
        mActualMaxDate = m.actual_end_date ? parseLocalDate(m.actual_end_date) : null
      }

      rolledUpModules[m.id] = {
        plan_start_date: toLocalDateStr(mMinDate),
        plan_end_date: toLocalDateStr(mMaxDate),
        actual_start_date: toLocalDateStr(mActualMinDate),
        actual_end_date: toLocalDateStr(mActualMaxDate),
        progress: mProgress,
        status: mStatus,
      }
    })

    return { rolledUpModules, rolledUpActivities, rolledUpSubActivities }
  }

  const getProjectDateRange = () => {
    let min = null
    let max = null
    
    const rolledUpData = getRolledUpData()
    
    const checkDate = (dateStr) => {
      const date = parseLocalDate(dateStr)
      if (!date) return
      if (!min || date < min) min = date
      if (!max || date > max) max = date
    }
    
    modules.forEach(m => {
      const mRollup = rolledUpData.rolledUpModules[m.id] || {}
      checkDate(mRollup.plan_start_date || m.plan_start_date)
      checkDate(mRollup.plan_end_date || m.plan_end_date)
      
      const moduleActs = activities[m.id] || []
      moduleActs.forEach(a => {
        const aKey = `${m.id}-${a.id}`
        const aRollup = rolledUpData.rolledUpActivities[aKey] || {}
        checkDate(aRollup.plan_start_date || a.plan_start_date)
        checkDate(aRollup.plan_end_date || a.plan_end_date)
        
        const subActs = subActivities[aKey] || []
        subActs.forEach(sa => {
          const saKey = `${m.id}-${a.id}-${sa.id}`
          const saRollup = rolledUpData.rolledUpSubActivities[saKey] || {}
          checkDate(saRollup.plan_start_date || sa.plan_start_date)
          checkDate(saRollup.plan_end_date || sa.plan_end_date)
          
          const tasks = detailedActivities[saKey] || []
          tasks.forEach(t => {
            checkDate(t.plan_start_date)
            checkDate(t.plan_end_date)
          })
        })
      })
    })
    
    if (!min) {
      min = new Date()
      min.setDate(min.getDate() - 7)
    }
    if (!max) {
      max = new Date()
      max.setDate(max.getDate() + 30)
    }
    
    const start = new Date(min)
    start.setDate(start.getDate() - 7)
    const end = new Date(max)
    end.setDate(end.getDate() + 14)
    
    return { start, end, actualMin: min, actualMax: max }
  }

  const isItemOnCriticalPath = (row, maxProjectEnd) => {
    if (!showCriticalPath) return false
    if (!row.plan_end_date || !maxProjectEnd) return false
    
    // A task is on the critical path if it's delayed or ends within 2 days of project completion
    if (row.status === 'delayed') return true
    
    const itemEnd = parseLocalDate(row.plan_end_date)
    if (!itemEnd) return false
    
    const diffMs = maxProjectEnd.getTime() - itemEnd.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return diffDays >= 0 && diffDays <= 2
  }

  const getTimelineDays = (start, end) => {
    const days = []
    let current = new Date(start)
    while (current <= end) {
      days.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    return days
  }

  const getTimelineMonths = (days) => {
    const months = []
    days.forEach(day => {
      const monthLabel = day.toLocaleDateString('default', { month: 'long', year: 'numeric' })
      const lastMonth = months[months.length - 1]
      if (lastMonth && lastMonth.label === monthLabel) {
        lastMonth.colspan += 1
      } else {
        months.push({ label: monthLabel, colspan: 1 })
      }
    })
    return months
  }

  const calculateBarPosition = (startDateStr, endDateStr, timelineStart, colWidth) => {
    const start = parseLocalDate(startDateStr)
    const end = parseLocalDate(endDateStr)
    
    if (!start || !end) return null
    
    const diffStartMs = start.getTime() - timelineStart.getTime()
    const offsetDays = diffStartMs / (1000 * 60 * 60 * 24)
    
    const diffDurationMs = end.getTime() - start.getTime()
    const durationDays = diffDurationMs / (1000 * 60 * 60 * 24) + 1
    
    const left = offsetDays * colWidth
    const width = Math.max(durationDays * colWidth, 12)
    
    return { left, width }
  }

  const getGanttBarStyles = (status, isCritical = false) => {
    let baseStyles
    switch (status) {
      case 'completed':
        baseStyles = {
          background: 'linear-gradient(135deg, #10b981, #059669)',
          border: '1px solid #047857',
        }
        break
      case 'in_progress':
        baseStyles = {
          background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
          border: '1px solid #1d4ed8',
        }
        break
      case 'delayed':
      case 'review':
        baseStyles = {
          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
          border: '1px solid #b45309',
        }
        break
      case 'not_started':
      case 'pending':
      default:
        baseStyles = {
          background: 'linear-gradient(135deg, #ef4444, #dc2626)',
          border: '1px solid #b91c1c',
        }
        break
    }

    if (isCritical) {
      return {
        ...baseStyles,
        boxShadow: '0 0 10px rgba(239, 68, 68, 0.85)',
        border: '2px solid #ef4444',
      }
    }
    return baseStyles
  }

  const getGanttStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
      case 'in_progress':
        return 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800'
      case 'delayed':
      case 'review':
        return 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'
      case 'not_started':
      case 'pending':
      default:
        return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800'
    }
  }

  const getGanttStatusLabel = (status) => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'in_progress':
        return 'In Progress'
      case 'delayed':
      case 'review':
        return 'Review'
      case 'not_started':
      case 'pending':
      default:
        return 'Pending'
    }
  }

  // Check if an item matches search/status filter directly
  const ganttItemMatchesDirect = (item) => {
    const matchesSearch = searchTerm === '' ||
      item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.code?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter
    return matchesSearch && matchesStatus
  }

  // Check if any descendant of a module matches the filter
  const moduleHasMatch = (moduleId) => {
    const moduleObj = modules.find(m => m.id === moduleId)
    if (moduleObj && ganttItemMatchesDirect(moduleObj)) return true
    const acts = activities[moduleId] || []
    for (const a of acts) {
      if (ganttItemMatchesDirect(a)) return true
      const subKey = `${moduleId}-${a.id}`
      const subs = subActivities[subKey] || []
      for (const sa of subs) {
        if (ganttItemMatchesDirect(sa)) return true
        const fullKey = `${moduleId}-${a.id}-${sa.id}`
        const tasks = detailedActivities[fullKey] || []
        for (const t of tasks) {
          if (ganttItemMatchesDirect(t)) return true
        }
      }
    }
    return false
  }

  // Check if any descendant of an activity matches
  const activityHasMatch = (moduleId, activityId) => {
    const acts = activities[moduleId] || []
    const a = acts.find(x => x.id === activityId)
    if (a && ganttItemMatchesDirect(a)) return true
    const subKey = `${moduleId}-${activityId}`
    const subs = subActivities[subKey] || []
    for (const sa of subs) {
      if (ganttItemMatchesDirect(sa)) return true
      const fullKey = `${moduleId}-${activityId}-${sa.id}`
      const tasks = detailedActivities[fullKey] || []
      for (const t of tasks) {
        if (ganttItemMatchesDirect(t)) return true
      }
    }
    return false
  }

  // Check if any descendant of a sub-activity matches
  const subActivityHasMatch = (moduleId, activityId, subActivityId) => {
    const subKey = `${moduleId}-${activityId}`
    const subs = subActivities[subKey] || []
    const sa = subs.find(x => x.id === subActivityId)
    if (sa && ganttItemMatchesDirect(sa)) return true
    const fullKey = `${moduleId}-${activityId}-${subActivityId}`
    const tasks = detailedActivities[fullKey] || []
    for (const t of tasks) {
      if (ganttItemMatchesDirect(t)) return true
    }
    return false
  }

  const getVisibleGanttRows = () => {
    const rows = []
    const rolledUpData = getRolledUpData()
    const hasFilter = searchTerm !== '' || statusFilter !== 'all'

    const traverseModule = (module) => {
      // In Gantt view: always show module if no filter, or if module/any descendant matches
      if (hasFilter && !moduleHasMatch(module.id)) return

      const rollup = rolledUpData.rolledUpModules[module.id] || {}
      rows.push({
        id: `module-${module.id}`,
        type: 'module',
        name: module.name,
        code: module.code,
        item: module,
        depth: 0,
        responsible: module.responsible || '-',
        status: rollup.status || module.status || 'not_started',
        progress: rollup.progress !== undefined ? rollup.progress : 0,
        plan_start_date: rollup.plan_start_date || module.plan_start_date,
        plan_end_date: rollup.plan_end_date || module.plan_end_date,
        actual_start_date: rollup.actual_start_date || module.actual_start_date,
        actual_end_date: rollup.actual_end_date || module.actual_end_date,
        duration_months: module.duration_months,
        duration_days: module.duration_days,
      })
      
      // When filtering, auto-expand; otherwise respect manual expansion
      if (hasFilter || expandedModules[module.id]) {
        const moduleActs = activities[module.id] || []
        moduleActs.forEach(activity => {
          traverseActivity(activity, module.id)
        })
      }
    }
    
    const traverseActivity = (activity, moduleId) => {
      if (hasFilter && !activityHasMatch(moduleId, activity.id)) return

      const key = `${moduleId}-${activity.id}`
      const rollup = rolledUpData.rolledUpActivities[key] || {}
      rows.push({
        id: `activity-${activity.id}`,
        type: 'activity',
        name: activity.name,
        code: activity.code,
        item: activity,
        depth: 1,
        responsible: activity.responsible || '-',
        status: rollup.status || activity.status || 'not_started',
        progress: rollup.progress !== undefined ? rollup.progress : 0,
        plan_start_date: rollup.plan_start_date || activity.plan_start_date,
        plan_end_date: rollup.plan_end_date || activity.plan_end_date,
        actual_start_date: rollup.actual_start_date || activity.actual_start_date,
        actual_end_date: rollup.actual_end_date || activity.actual_end_date,
        duration_months: activity.duration_months,
        duration_days: activity.duration_days,
      })
      
      if (hasFilter || expandedActivities[key]) {
        const subActs = subActivities[key] || []
        subActs.forEach(subAct => {
          traverseSubActivity(subAct, activity.id, moduleId)
        })
      }
    }
    
    const traverseSubActivity = (subAct, activityId, moduleId) => {
      if (hasFilter && !subActivityHasMatch(moduleId, activityId, subAct.id)) return

      const key = `${activityId}-${subAct.id}`
      const fullKey = `${moduleId}-${key}`
      const rollup = rolledUpData.rolledUpSubActivities[fullKey] || {}
      rows.push({
        id: `sub-activity-${subAct.id}`,
        type: 'sub-activity',
        name: subAct.name,
        code: subAct.code,
        item: subAct,
        depth: 2,
        responsible: subAct.responsible || '-',
        status: rollup.status || subAct.status || 'not_started',
        progress: rollup.progress !== undefined ? rollup.progress : 0,
        plan_start_date: rollup.plan_start_date || subAct.plan_start_date,
        plan_end_date: rollup.plan_end_date || subAct.plan_end_date,
        actual_start_date: rollup.actual_start_date || subAct.actual_start_date,
        actual_end_date: rollup.actual_end_date || subAct.actual_end_date,
        duration_months: subAct.duration_months,
        duration_days: subAct.duration_days,
        activityId: activityId,
        moduleId: moduleId,
      })
      
      if (hasFilter || expandedActivities[fullKey]) {
        const tasks = detailedActivities[fullKey] || []
        tasks
          .filter(t => !hasFilter || ganttItemMatchesDirect(t))
          .filter(t => userRole !== 'Client' || t.client_visible === true || t.client_visible === 1)
          .forEach(task => {
            rows.push({
              id: `task-${task.id}`,
              type: 'task',
              name: task.name,
              code: task.code,
              item: task,
              depth: 3,
              responsible: task.responsible || '-',
              status: task.status,
              progress: task.progress,
              plan_start_date: task.plan_start_date,
              plan_end_date: task.plan_end_date,
              actual_start_date: task.actual_start_date,
              actual_end_date: task.actual_end_date,
              duration_months: task.duration_months,
              duration_days: task.duration_days,
              activityId: activityId,
              moduleId: moduleId,
              subActivityId: subAct.id,
            })
          })
      }
    }
    
    modules.forEach(traverseModule)
    return rows
  }

  const handleGanttToggle = (row) => {
    if (row.type === 'module') {
      toggleModule(row.item.id)
    } else if (row.type === 'activity') {
      toggleActivity(row.item.id, row.item.module_id)
    } else if (row.type === 'sub-activity') {
      toggleSubActivity(row.item.id, row.activityId, row.moduleId)
    }
  }

  const isGanttRowExpanded = (row) => {
    if (row.type === 'module') {
      return !!expandedModules[row.item.id]
    } else if (row.type === 'activity') {
      return !!expandedActivities[`${row.item.module_id}-${row.item.id}`]
    } else if (row.type === 'sub-activity') {
      return !!expandedActivities[`${row.moduleId}-${row.activityId}-${row.item.id}`]
    }
    return false
  }

  // CRUD State
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create') // 'create' | 'edit'
  const [modalLevel, setModalLevel] = useState('module') // 'module' | 'activity' | 'sub-activity' | 'task'
  const [modalParentId, setModalParentId] = useState(null)
  const [modalTargetId, setModalTargetId] = useState(null)
  const [formValues, setFormValues] = useState({})

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // { level: 'module'|..., id: 1, context: {...} }
  const [deleteError, setDeleteError] = useState(null)

  // Reload Helpers
  const reloadModules = async () => {
    if (selectedProject) {
      try {
        const res = await fetchModules(selectedProject)
        setModules(res.data.data || res.data)
      } catch (err) {
        console.error('Failed to reload modules:', err)
      }
    }
  }

  const reloadProjects = async (newSelectedId = null) => {
    try {
      const res = await fetchProjects()
      const list = res.data.data || res.data
      setProjects(list)

      if (newSelectedId) {
        // Explicit choice (just created/edited this project) — not a default.
        selectProject(newSelectedId)
      } else if (!list.some(p => p.id === selectedProject)) {
        // The previously-selected project is gone (deleted). Clear the
        // selection instead of silently picking another one for the user.
        selectProject(null)
        setModules([])
      }
    } catch (err) {
      console.error('Failed to reload projects:', err)
    }
  }

  const handleProjectSubmit = async (e) => {
    e.preventDefault()
    if (!projectForm.name || !projectForm.name.trim()) return
    setProjectSaving(true)
    try {
      if (projectEditingId) {
        await updateProject(projectEditingId, projectForm)
        await reloadProjects(selectedProject)
        setProjectEditingId(null)
        setProjectForm({ name: '', location: '', updated_date: '' })
      } else {
        const res = await createProject(projectForm)
        const newProj = res.data.data || res.data
        await reloadProjects(newProj.id)
        setProjectForm({ name: '', location: '', updated_date: '' })
      }
    } catch (err) {
      console.error('Failed to save project:', err)
    } finally {
      setProjectSaving(false)
    }
  }

  const handleProjectDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this project? All associated modules, activities, and tasks will be permanently deleted.')) {
      return
    }
    try {
      await deleteProject(id)
      await reloadProjects()
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }


  const openFormModal = (level, mode, parentId, item = null) => {
    setModalLevel(level)
    setModalMode(mode)
    setModalParentId(parentId)
    
    if (mode === 'edit' && item) {
      setModalTargetId(item.id)
      setFormValues({
        code: item.code || '',
        name: item.name || '',
        type: item.type || '',
        description: item.description || '',
        notes: item.notes || '',
        output: item.output || '',
        responsible: item.responsible || '',
        support: item.support || '',
        duration_months: item.duration_months || 0,
        duration_days: item.duration_days || 0,
        plan_start_date: item.plan_start_date ? item.plan_start_date.substring(0, 10) : '',
        plan_end_date: item.plan_end_date ? item.plan_end_date.substring(0, 10) : '',
        actual_start_date: item.actual_start_date ? item.actual_start_date.substring(0, 10) : '',
        actual_end_date: item.actual_end_date ? item.actual_end_date.substring(0, 10) : '',
        status: item.status || 'not_started',
        progress: item.progress || 0,
        client_visible: item.client_visible !== undefined ? !!item.client_visible : false,
        // 020-list-view-groups: display-only — not among the backend's
        // validated task-update fields (research.md D4's corrected
        // decision), so it's silently dropped by the backend even though
        // it rides along in the request body; shown in the task modal so
        // Sub-Activity context isn't lost now that it's no longer a
        // nesting level.
        sub_activity_name: item.sub_activity_name || '',
      })
    } else {
      setModalTargetId(null)
      setFormValues({
        code: '',
        name: '',
        type: level === 'activity' || level === 'sub-activity' ? 'A' : '',
        description: '',
        notes: '',
        output: '',
        responsible: '',
        support: '',
        duration_months: 0,
        duration_days: 0,
        plan_start_date: '',
        plan_end_date: '',
        actual_start_date: '',
        actual_end_date: '',
        status: 'not_started',
        progress: 0,
        client_visible: false,
      })
    }
    setModalOpen(true)
  }

  // Declared above handleSubmit and the List-view handlers that call it:
  // referencing it later in source order trips react-hooks'
  // access-before-declaration rule.
  const refreshActivityTasks = async (moduleId, activityId) => {
    const key = `${moduleId}-${activityId}`
    setActivityTasksLoading(prev => ({ ...prev, [key]: true }))
    try {
      const subRes = await fetchSubActivities(activityId)
      const subActivityList = subRes.data.data || subRes.data
      setSubActivities(prev => ({ ...prev, [key]: subActivityList }))
      const taskResponses = await Promise.all(
        subActivityList.map(sa => fetchDetailedActivities(sa.id))
      )
      const merged = subActivityList.flatMap((sa, i) => {
        const tasks = taskResponses[i].data.data || taskResponses[i].data
        return tasks.map(t => ({ ...t, sub_activity_name: sa.name }))
      })
      // Explicit stable sort by id (ascending) — the backend's index()
      // endpoint has no ORDER BY, so row order isn't guaranteed, and
      // merging multiple Sub-Activities' task lists interleaves whatever
      // order each happened to come back in. Sorting by id (creation
      // order for an auto-increment PK) guarantees newly-added tasks
      // always land at the bottom instead of wherever the unordered
      // fetch/merge put them.
      merged.sort((a, b) => a.id - b.id)
      setActivityTasks(prev => ({ ...prev, [key]: merged }))
    } catch (err) {
      console.error('Failed to load activity tasks:', err)
      if (err.response?.status === 403) {
        setAccessDenied(true)
      }
    } finally {
      setActivityTasksLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (modalMode === 'create') {
        if (modalLevel === 'module') {
          await createModule(modalParentId, formValues)
        } else if (modalLevel === 'activity') {
          await createActivity(modalParentId, formValues)
        } else if (modalLevel === 'sub-activity') {
          const { activityId } = modalParentId
          await createSubActivity(activityId, formValues)
        } else if (modalLevel === 'task') {
          const { subActivityId } = modalParentId
          await createDetailedActivity(subActivityId, formValues)
        }
      } else {
        // Edit mode
        if (modalLevel === 'module') {
          await updateModule(modalTargetId, formValues)
        } else if (modalLevel === 'activity') {
          await updateActivity(modalTargetId, formValues)
        } else if (modalLevel === 'sub-activity') {
          await updateSubActivity(modalTargetId, formValues)
        } else if (modalLevel === 'task') {
          await updateDetailedActivity(modalTargetId, formValues)
        }
      }
      await reloadModules()
      // 020-list-view-groups (research.md D2): reloadModules() only
      // refetches the top-level `modules` array, not the per-Activity
      // flattened task list this feature introduces — refresh it
      // explicitly so List view's flattened groups reflect the change
      // immediately instead of only after collapse/re-expand.
      if (modalLevel === 'task' || modalLevel === 'sub-activity') {
        const { moduleId, activityId } = modalParentId || {}
        if (moduleId != null && activityId != null) {
          await refreshActivityTasks(moduleId, activityId)
        }
      }
      setModalOpen(false)
      setFormValues({})
    } catch (err) {
      console.error('Failed to save:', err)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const { level, id, context } = deleteTarget
    setDeleteError(null)
    try {
      if (level === 'module') {
        await deleteModule(id)
      } else if (level === 'activity') {
        await deleteActivity(id)
      } else if (level === 'sub-activity') {
        await deleteSubActivity(id)
      } else if (level === 'task') {
        await deleteDetailedActivity(id)
      }
      await reloadModules()
      // 020-list-view-groups (research.md D2): same explicit refresh as
      // handleSubmit above, for the same reason.
      if (level === 'task' || level === 'sub-activity') {
        const { moduleId, activityId } = context || {}
        if (moduleId != null && activityId != null) {
          await refreshActivityTasks(moduleId, activityId)
        }
      }
      setDeleteConfirmOpen(false)
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete:', err)
      // Previously silent on failure — the dialog just sat there with no
      // explanation (e.g. the backend correctly rejecting deletion of the
      // reserved "Taskboard" Activity while it still holds tasks, a
      // 409 from 018-taskboard, returned a real message that was never
      // shown). Surface it and keep the dialog open instead of pretending
      // nothing happened.
      setDeleteError(err.response?.data?.message || 'Failed to delete. Please try again.')
    }
  }

  const loadProjects = () => {
    setLoading(true)
    setProjectsError(null)
    fetchProjects()
      .then(res => {
        const list = res.data.data || res.data
        setProjects(list)
        // Restore the last project the user explicitly chose, if it still
        // exists — no fallback to list[0]. If nothing was previously chosen
        // (or it's since been deleted), selectedProject stays null and the
        // page's own "No project selected" empty state prompts the user to
        // pick one, rather than silently guessing for them.
        const persistedId = readPersistedProjectId()
        const persisted = persistedId ? list.find(p => p.id === persistedId) : null
        if (persisted) {
          setSelectedProject(persisted.id)
        }
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch projects:', err)
        setProjectsError('Failed to load projects.')
        setLoading(false)
      })
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
  useEffect(() => { loadProjects() }, [])

  useEffect(() => {
    if (selectedProject) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
      setGanttDataLoading(true)
      setAccessDenied(false)
      fetchModules(selectedProject)
        .then(res => {
          const mods = res.data.data || res.data
          setModules(mods)
          setGanttDataLoading(false)
        })
        .catch(err => {
          console.error('Failed to fetch modules:', err)
          // 007-permission-hardening (FR-010): a 403 here means the
          // selected project's assignment was revoked mid-session.
          if (err.response?.status === 403) {
            setAccessDenied(true)
          }
          setGanttDataLoading(false)
        })
    }
  }, [selectedProject])

  // List view's Activity groups start collapsed with no task data loaded
  // (tasks are otherwise fetched lazily on first manual expand, D1) — but
  // the collapsed-state Status summary bar (below) needs real counts the
  // moment a Module opens, not only after a group has been clicked at
  // least once. This mirrors expandAllGroups' existing "fetch if
  // uncached" logic, just triggered by the Module expanding rather than
  // an explicit "Expand all" click, and only for the currently active
  // List view (no reason to prefetch this while viewing Gantt/Taskboard).
  useEffect(() => {
    if (viewMode !== 'list') return
    Object.keys(expandedModules).forEach((moduleId) => {
      if (!expandedModules[moduleId]) return
      const moduleActivities = activities[moduleId] || []
      moduleActivities.forEach((a) => {
        const key = `${moduleId}-${a.id}`
        if (!activityTasks[key] && !activityTasksLoading[key]) {
          refreshActivityTasks(Number(moduleId), a.id)
        }
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, expandedModules, activities])

  const toggleModule = async (moduleId) => {
    const newExpanded = { ...expandedModules, [moduleId]: !expandedModules[moduleId] }
    setExpandedModules(newExpanded)

    if (newExpanded[moduleId] && !activities[moduleId]) {
      try {
        const res = await fetchActivities(moduleId)
        setActivities(prev => ({ ...prev, [moduleId]: res.data.data || res.data }))
      } catch (err) {
        console.error('Failed to fetch activities:', err)
        // 007-permission-hardening (FR-010): a 403 here means project
        // access was revoked mid-session — every row's data is now stale,
        // so this reuses the same page-level AccessDenied state as the
        // top-level module fetch, not a silently-stuck expanded row.
        if (err.response?.status === 403) {
          setAccessDenied(true)
        }
      }
    }
  }

  const toggleActivity = async (activityId, moduleId) => {
    const key = `${moduleId}-${activityId}`
    const newExpanded = { ...expandedActivities, [key]: !expandedActivities[key] }
    setExpandedActivities(newExpanded)

    if (newExpanded[key] && !subActivities[key]) {
      try {
        const res = await fetchSubActivities(activityId)
        setSubActivities(prev => ({ ...prev, [key]: res.data.data || res.data }))
      } catch (err) {
        console.error('Failed to fetch sub-activities:', err)
        if (err.response?.status === 403) {
          setAccessDenied(true)
        }
      }
    }
  }

  const toggleSubActivity = async (subActivityId, activityId, moduleId) => {
    const key = `${activityId}-${subActivityId}`
    const fullKey = `${moduleId}-${key}`
    const newExpanded = { ...expandedActivities, [fullKey]: !expandedActivities[fullKey] }
    setExpandedActivities(newExpanded)

    if (newExpanded[fullKey] && !detailedActivities[fullKey]) {
      try {
        const res = await fetchDetailedActivities(subActivityId)
        setDetailedActivities(prev => ({ ...prev, [fullKey]: res.data.data || res.data }))
      } catch (err) {
        console.error('Failed to fetch detailed activities:', err)
        if (err.response?.status === 403) {
          setAccessDenied(true)
        }
      }
    }
  }

  // 020-list-view-groups: fetches an Activity's Sub-Activities fresh, then
  // every Sub-Activity's tasks in parallel, merging into one flat array
  // (each task annotated with its source Sub-Activity id/name) for the
  // List view's flattened Activity-group table. Deliberately NOT a change
  // to toggleActivity above — that function is shared with Gantt view
  // (see its onClick at the Gantt row-click handler), and extending it
  // would leak this fetch into Gantt, which must stay unchanged (FR-013).
  // List view's Activity-group expand/collapse — separate from
  // toggleActivity (shared with Gantt) so Gantt's own expand behavior is
  // untouched by this feature.
  const expandActivityGroup = (activityId, moduleId) => {
    const key = `${moduleId}-${activityId}`
    const newExpanded = { ...expandedActivities, [key]: !expandedActivities[key] }
    setExpandedActivities(newExpanded)
    if (newExpanded[key] && !activityTasks[key]) {
      refreshActivityTasks(moduleId, activityId)
    }
  }

  // Module-scoped "Collapse/Expand all groups" — operates on every
  // Activity group under one Module, matching the monday.com semantic of
  // "board" = the set of groups currently in view (this file already
  // scopes everything else per-Module too).
  const collapseAllGroups = (moduleId) => {
    const groupActivities = activities[moduleId] || []
    setExpandedActivities(prev => {
      const next = { ...prev }
      groupActivities.forEach(a => { next[`${moduleId}-${a.id}`] = false })
      return next
    })
  }

  const expandAllGroups = (moduleId) => {
    const groupActivities = activities[moduleId] || []
    setExpandedActivities(prev => {
      const next = { ...prev }
      groupActivities.forEach(a => { next[`${moduleId}-${a.id}`] = true })
      return next
    })
    groupActivities.forEach(a => {
      const key = `${moduleId}-${a.id}`
      if (!activityTasks[key]) refreshActivityTasks(moduleId, a.id)
    })
  }

  // Inline "+ Add item" (research.md D5): attaches to the Activity's first
  // existing Sub-Activity, or silently provisions a default one ('General')
  // if none exists yet — no user-facing extra step either way.
  const handleInlineAddSubmit = async (moduleId, activityId) => {
    const key = `${moduleId}-${activityId}`
    const name = (inlineAddValues[key] || '').trim()
    if (!name) return
    setInlineAddErrors(prev => ({ ...prev, [key]: null }))
    try {
      const existingSubActivities = subActivities[key] || []
      let subActivityId
      if (existingSubActivities.length > 0) {
        subActivityId = existingSubActivities[0].id
      } else {
        const res = await createSubActivity(activityId, { name: 'General', type: 'A' })
        subActivityId = (res.data.data || res.data).id
      }
      await createDetailedActivity(subActivityId, { name })
      setInlineAddValues(prev => ({ ...prev, [key]: '' }))
      await refreshActivityTasks(moduleId, activityId)
    } catch (err) {
      console.error('Failed to add task inline:', err)
      // Previously silent (console-only) — a failed create looked identical
      // to a completely unresponsive button, since nothing changed on
      // screen. Surface it so a real failure is distinguishable from a UI
      // bug.
      const message = err.response?.data?.message || 'Failed to add task. Please try again.'
      setInlineAddErrors(prev => ({ ...prev, [key]: message }))
    }
  }

  // Per-cell inline edit (List view only — Gantt doesn't use this):
  // clicking a single cell edits just that field, saving immediately on
  // change/blur rather than requiring the whole row to enter edit mode
  // via a separate button. `editingCell` identifies which one cell (by
  // task id + field name) is currently active; there is deliberately no
  // draft state — editable controls read straight from the task's current
  // value (uncontrolled `defaultValue`, or a Select bound to the value
  // itself) and commit directly to the server, so there's nothing to keep
  // in sync by hand.
  const startCellEdit = (taskId, field) => setEditingCell({ taskId, field })
  const cancelCellEdit = () => setEditingCell(null)

  const saveCellField = async (taskId, payload, moduleId, activityId) => {
    try {
      await updateDetailedActivity(taskId, payload)
      await reloadModules()
      await refreshActivityTasks(moduleId, activityId)
    } catch (err) {
      console.error('Failed to update task field:', err)
    } finally {
      setEditingCell(null)
    }
  }

  // Date-pair cells (Plan Dates, Actual Dates) hold two inputs. Saving
  // independently per field on every blur — including the blur fired when
  // tabbing from the first date to the second — caused two overlapping
  // save+refresh cycles for the same row to race each other (confirmed:
  // one call's async chain never resolved, leaving the cell stuck open).
  // Instead, blur only *commits* while focus is leaving the pair entirely
  // (checked via `relatedTarget` + the `data-inline-date-group` wrapper),
  // and reads both inputs' current DOM values at that moment to send a
  // single combined save — never two saves in flight for the same cell.
  const commitDateGroup = async (event, taskId, fieldPrefix, moduleId, activityId) => {
    const group = event.currentTarget.closest('[data-inline-date-group]')
    const movingWithinGroup = event.relatedTarget && group?.contains(event.relatedTarget)
    if (movingWithinGroup) return
    const [startInput, endInput] = group.querySelectorAll('input[type="date"]')
    const payload = {
      [`${fieldPrefix}_start_date`]: startInput?.value || null,
      [`${fieldPrefix}_end_date`]: endInput?.value || null,
    }
    await saveCellField(taskId, payload, moduleId, activityId)
  }

  const filterActivities = (items) => {
    if (!items) return []
    return items.filter(item => {
      const matchesSearch = searchTerm === '' ||
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      
      // Detailed activities have sub_activity_id. Scoping client visibility if the active role is Client.
      const matchesClientVisibility = userRole !== 'Client' ||
        item.sub_activity_id === undefined ||
        item.client_visible === true ||
        item.client_visible === 1
        
      return matchesSearch && matchesStatus && matchesClientVisibility
    })
  }

  if (projectsError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-destructive font-medium">{projectsError}</p>
        <button onClick={loadProjects} className="text-sm text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
          Try again
        </button>
      </div>
    )
  }

  if (accessDenied) {
    return <AccessDenied message="You do not have access to this resource." />
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
        <RefreshCw className="h-7 w-7 animate-spin" />
        <span className="text-sm">Loading work program...</span>
      </div>
    )
  }

  const rolledUpData = getRolledUpData()

  // Derive counts for contextual subtitle
  const totalModuleCount = modules.length
  const hasActiveSearch = searchTerm !== '' || statusFilter !== 'all'

  return (
    <div className="space-y-6">
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Title + contextual subtitle */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Work Program</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {!selectedProject
              ? 'Select a project to view and manage activities'
              : ganttDataLoading
              ? 'Loading project data…'
              : totalModuleCount === 0
              ? 'Get started by adding your first module below'
              : `${totalModuleCount} module${totalModuleCount !== 1 ? 's' : ''} · ${Object.values(activities).flat().length} activit${Object.values(activities).flat().length !== 1 ? 'ies' : 'y'}`
            }
          </p>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">

          {/* View toggle — List / Gantt */}
          <div
            role="group"
            aria-label="View mode"
            className="flex items-center gap-0.5 border rounded-lg p-1 bg-muted/40"
          >
            <Button
              size="sm"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={[
                'h-8 px-3 gap-1.5 text-sm font-medium transition-all',
                viewMode === 'list'
                  ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                  : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60',
              ].join(' ')}
              variant="ghost"
              title="Switch to List view"
            >
              <LayoutList className="h-3.5 w-3.5" />
              List
            </Button>
            <Button
              size="sm"
              aria-pressed={viewMode === 'gantt'}
              onClick={() => setViewMode('gantt')}
              className={[
                'h-8 px-3 gap-1.5 text-sm font-medium transition-all',
                viewMode === 'gantt'
                  ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                  : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60',
              ].join(' ')}
              variant="ghost"
              title="Switch to Gantt view"
            >
              <GanttChart className="h-3.5 w-3.5" />
              Gantt
            </Button>
            {/* 018-taskboard spec FR-008: this pill (and the Taskboard mode
                it switches to) is entirely absent for Client, not merely
                disabled — Client's own field-visibility rules already hide
                sprint_label, which would otherwise make every task
                incorrectly appear as unscheduled Backlog. */}
            {!isClient && (
              <Button
                size="sm"
                aria-pressed={viewMode === 'taskboard'}
                onClick={() => setViewMode('taskboard')}
                className={[
                  'h-8 px-3 gap-1.5 text-sm font-medium transition-all',
                  viewMode === 'taskboard'
                    ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                    : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60',
                ].join(' ')}
                variant="ghost"
                title="Switch to Taskboard view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Taskboard
              </Button>
            )}
          </div>

          {/* Project selector with explicit label */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap hidden md:inline">Project:</span>
            <Select
              value={selectedProject?.toString() || ''}
              onValueChange={(v) => selectProject(parseInt(v))}
              aria-label="Select project"
            >
              <SelectTrigger className="w-[240px]" aria-label="Select project">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.length === 0 ? (
                  <div className="p-3 text-sm text-center text-muted-foreground italic">No projects yet</div>
                ) : (
                  projects.map(project => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setProjectModalOpen(true)
                setProjectEditingId(null)
                setProjectForm({ name: '', location: '', updated_date: '' })
              }}
              title="Manage Projects"
              aria-label="Manage Projects"
              className="h-9 w-9 shrink-0"
            >
              <Settings className="h-4 w-4" />
            </Button>
            {selectedProject && canManageSelectedProjectClientAccess && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => setClientAccessModalOpen(true)}
                title="Client Access"
                aria-label="Client Access"
                className="h-9 w-9 shrink-0"
              >
                <Shield className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Primary action */}
          {selectedProject && ['Admin', 'Project Manager'].includes(userRole) && (
            <Button
              onClick={() => openFormModal('module', 'create', selectedProject)}
              aria-label="Add new module to work program"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Add Module
            </Button>
          )}
        </div>
      </div>

      {/* ── Search & Filter bar — only shown when there is data to filter ── */}
      {selectedProject && totalModuleCount > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="activity-search"
                  aria-label="Search activities"
                  placeholder="Search activities, codes, or descriptions…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  aria-label="Filter activities by status"
                >
                  <SelectTrigger className="w-[180px]" aria-label="Filter activities by status">
                    <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Status: All</SelectItem>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                  </SelectContent>
                </Select>
                {/* Clear filters pill — appears only when a filter is active */}
                {hasActiveSearch && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => { setSearchTerm(''); setStatusFilter('all') }}
                    aria-label="Clear all filters"
                  >
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── No project selected ─────────────────────────────────────── */}
      {!selectedProject && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted py-20 text-center gap-4">
          <div className="rounded-full bg-muted/60 p-4">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">No project selected</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Choose a project from the dropdown above to view its work program, activities, and timeline.
            </p>
          </div>
          {projects.length === 0 && (
            <Button
              onClick={() => {
                setProjectModalOpen(true)
                setProjectEditingId(null)
                setProjectForm({ name: '', location: '', updated_date: '' })
              }}
              variant="outline"
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Create your first project
            </Button>
          )}
        </div>
      )}

      {/* ── Project selected but modules are loading ─────────────────── */}
      {selectedProject && ganttDataLoading && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-muted py-20 text-center gap-3">
          <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
          <p className="text-sm text-muted-foreground">Loading project activities…</p>
        </div>
      )}

      {/* ── View Mode Content ───────────────────────────────────────── */}
      {selectedProject && !ganttDataLoading && (
      <>{viewMode === 'list' ? (
        /* List View (Module Tree) */
        <div className="space-y-4">
          {/* Empty state — no modules */}
          {totalModuleCount === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted py-20 text-center gap-4">
              <div className="rounded-full bg-muted/60 p-4">
                <Layers className="h-10 w-10 text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <p className="text-lg font-semibold text-foreground">No modules yet</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Modules group related activities, milestones, and tasks within a project.
                  Start building your work program by adding the first module.
                </p>
              </div>
              {['Admin', 'Project Manager'].includes(userRole) && (
                <Button
                  onClick={() => openFormModal('module', 'create', selectedProject)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Add Module
                </Button>
              )}
            </div>
          )}
          {/* Empty state — modules exist but filter matches nothing */}
          {totalModuleCount > 0 && hasActiveSearch && modules.filter(m => filterActivities([m]).length > 0 || (activities[m.id] || []).some(a => filterActivities([a]).length > 0)).length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-muted py-16 text-center gap-4">
              <div className="rounded-full bg-muted/60 p-4">
                <SearchX className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">No activities found</p>
                <p className="text-sm text-muted-foreground">
                  {searchTerm && statusFilter !== 'all'
                    ? `No results for "${searchTerm}" with status "${statusFilter.replace('_', ' ')}"`
                    : searchTerm
                    ? `No results for "${searchTerm}"`
                    : `No activities with status "${statusFilter.replace('_', ' ')}"`
                  }
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => { setSearchTerm(''); setStatusFilter('all') }}
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </Button>
            </div>
          )}
          {modules.map(module => (
            <>
            <Card key={module.id}>
              <CardHeader
                className="cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => toggleModule(module.id)}
                role="button"
                tabIndex={0}
                aria-expanded={!!expandedModules[module.id]}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleModule(module.id)
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  {expandedModules[module.id] ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-5 w-5" />
                  )}
                  <div className="flex-1">
                    <CardTitle as="h2" className="text-lg">
                      {module.code && <span className="text-muted-foreground mr-2">{module.code}</span>}
                      {module.name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {module.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>Duration: {module.duration_months || 0}m {module.duration_days || 0}d</span>
                    <span>Plan: {(() => {
                      const rollup = rolledUpData.rolledUpModules[module.id] || {}
                      const start = rollup.plan_start_date || module.plan_start_date
                      const end = rollup.plan_end_date || module.plan_end_date
                      return `${formatDate(start)} - ${formatDate(end)}`
                    })()}</span>
                  </div>
                  {['Admin', 'Project Manager'].includes(userRole) && (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => openFormModal('module', 'edit', {}, module)}
                        aria-label={`Edit module: ${module.name}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setDeleteTarget({ level: 'module', id: module.id })
                          setDeleteError(null); setDeleteConfirmOpen(true)
                        }}
                        aria-label={`Delete module: ${module.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>

              {expandedModules[module.id] && activities[module.id] && (
                <CardContent className="border-t pt-4">
                  <div className="flex justify-between items-center mb-3 pl-8">
                    <h3 className="text-sm font-semibold text-muted-foreground">Activities</h3>
                    <div className="flex items-center gap-2">
                      {(activities[module.id] || []).length > 1 && (
                        <>
                          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => collapseAllGroups(module.id)}>
                            <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={() => expandAllGroups(module.id)}>
                            <ChevronsUpDown className="h-3.5 w-3.5" /> Expand all
                          </Button>
                        </>
                      )}
                      {['Admin', 'Project Manager'].includes(userRole) && (
                        <Button size="sm" variant="outline" onClick={() => openFormModal('activity', 'create', module.id)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add Activity
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3 pl-8">
                    {filterActivities(activities[module.id]).map((activity, activityIndex) => (
                      (() => {
                        const groupKey = `${module.id}-${activity.id}`
                        const accent = GROUP_ACCENT_CLASSES[activityIndex % GROUP_ACCENT_CLASSES.length]
                        const isExpanded = !!expandedActivities[groupKey]
                        const tasks = filterActivities(activityTasks[groupKey] || [])
                        const statusSegments = buildSegments(tasks, 'status', LIST_STATUS_ORDER, LIST_STATUS_SEGMENT_CLASSES)
                        // Computed from the same `tasks` the Status bar reads (activityTasks[groupKey]),
                        // not rolledUpData.rolledUpActivities — that rollup depends on
                        // detailedActivities[fullKey], which only the Gantt view's toggleSubActivity
                        // populates. In List view it's always empty, so the rollup silently fell back
                        // to each sub-activity's stale stored `progress` column instead of the tasks
                        // actually shown here — which could show a different number than Status.
                        // `null` (not 0) while tasks haven't loaded yet, so the bar matches Status's
                        // empty state instead of misreporting a confident "0%".
                        const groupProgressPct = tasks.length > 0
                          ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.length)
                          : null
                        return (
                          <Collapsible key={activity.id} open={isExpanded} onOpenChange={() => expandActivityGroup(activity.id, module.id)}>
                            <div className="relative rounded-xl border border-border/60 shadow-sm overflow-hidden">
                              <span className={`absolute inset-y-0 left-0 w-1 pointer-events-none ${accent.bar}`} aria-hidden="true" />
                              {/* No gap between children, and no container-level
                                  horizontal padding at all — every column here is
                                  a percentage of this container's own width (see
                                  GroupSummaryBar.jsx's file comment), and the real
                                  <table> below has zero container padding of its
                                  own. Any padding on this container would shrink
                                  its width basis relative to the table's, so every
                                  column's percentage would resolve against a
                                  slightly different pixel base. The Task label's
                                  own left inset (matching the Task cell's px-3)
                                  instead lives inside the button itself (pl-3
                                  below). The responsible-text + "..." menu block
                                  is taken out of flex flow (absolute) since it has
                                  no matching table column — right-8 (not right-4)
                                  keeps its visual distance from the card's actual
                                  border the same as before now that the
                                  container's own right padding is gone. */}
                              <div className="relative flex items-center py-3 border-b border-border/60 bg-muted/30">
                                {/* Leading spacer matches the data table's leading
                                    row-actions column so everything after it lines
                                    up with the real columns beneath. */}
                                <div className="hidden sm:block shrink-0" style={{ width: LIST_COLUMN_WIDTHS.actions }} aria-hidden="true" />
                                <CollapsibleTrigger asChild>
                                  <button
                                    type="button"
                                    className={`flex items-center gap-3 pl-3 text-sm font-semibold shrink-0 min-w-0 ${accent.label} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded`}
                                    style={{ width: LIST_COLUMN_WIDTHS.task }}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 shrink-0 transition-transform" />
                                    )}
                                    <Badge className={getTypeColor(activity.type)}>
                                      {getTypeLabel(activity.type)}
                                    </Badge>
                                    <span className="truncate">
                                      {activity.name}
                                      <span className="block text-[11px] font-normal text-muted-foreground">
                                        {tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'}
                                      </span>
                                    </span>
                                  </button>
                                </CollapsibleTrigger>

                                {/* Sub-Activity column spacer — no group-level rollup for this column */}
                                <div className="hidden sm:block shrink-0" style={{ width: LIST_COLUMN_WIDTHS.subActivity }} aria-hidden="true" />

                                {isExpanded ? (
                                  <div className="hidden sm:block shrink-0" style={{ width: LIST_COLUMN_WIDTHS.status }} aria-hidden="true" />
                                ) : (
                                  <GroupSegmentBar title="Status" segments={statusSegments} labels={LIST_STATUS_SEGMENT_LABELS} width={LIST_COLUMN_WIDTHS.status} />
                                )}

                                {isExpanded ? (
                                  <div className="hidden sm:block shrink-0" style={{ width: LIST_COLUMN_WIDTHS.progress }} aria-hidden="true" />
                                ) : (
                                  <GroupProgressBar title="Progress" pct={groupProgressPct} width={LIST_COLUMN_WIDTHS.progress} />
                                )}

                                {/* Remaining column spacers — no group-level rollup for
                                    these, but they must still be reserved so the Task
                                    label button above and the Task column in the real
                                    table below stay the same percentage width. */}
                                {!isClient && (
                                  <div className="hidden sm:block shrink-0" style={{ width: LIST_COLUMN_WIDTHS.responsible }} aria-hidden="true" />
                                )}
                                <div className="hidden sm:block shrink-0" style={{ width: LIST_COLUMN_WIDTHS.planDates }} aria-hidden="true" />
                                <div className="hidden sm:block shrink-0" style={{ width: LIST_COLUMN_WIDTHS.actualDates }} aria-hidden="true" />

                                <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-3 text-sm text-muted-foreground shrink-0">
                                  <span>{activity.responsible}</span>
                                  {['Admin', 'Project Manager'].includes(userRole) && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 w-8 p-0"
                                          aria-label={`Group actions for: ${activity.name}`}
                                        >
                                          <MoreHorizontal className="h-3.5 w-3.5" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => openFormModal('activity', 'edit', { moduleId: module.id }, activity)}>
                                          <Edit className="h-3.5 w-3.5" /> Rename Activity
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => {
                                            // Manage Sub-Activities reads live subActivities[groupKey]
                                            // state reactively — if this group was never expanded,
                                            // that key doesn't exist yet, so trigger the same fetch
                                            // expandActivityGroup would have; the dialog re-renders
                                            // once it resolves rather than showing a false "empty".
                                            if (!subActivities[groupKey]) refreshActivityTasks(module.id, activity.id)
                                            setManageSubActivitiesFor({ moduleId: module.id, activityId: activity.id, activityName: activity.name })
                                          }}
                                        >
                                          <Settings className="h-3.5 w-3.5" /> Manage Sub-Activities
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => {
                                            setDeleteTarget({ level: 'activity', id: activity.id, context: { moduleId: module.id } })
                                            setDeleteError(null); setDeleteConfirmOpen(true)
                                          }}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" /> Delete Activity
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                              </div>

                              <CollapsibleContent>
                                {/* Content stays mounted during a refresh (inline add,
                                    edit, delete) instead of being replaced by a
                                    spinner-only state — that swap was what made the
                                    group look like it was collapsing and reopening.
                                    A blurred overlay communicates "updating" without
                                    hiding what's already there. */}
                                <div className="relative">
                                  {activityTasksLoading[groupKey] && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-[2px] rounded-b-xl">
                                      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                  )}
                                  <>
                                    {['Admin', 'Project Manager'].includes(userRole) && (
                                      <div className="flex justify-end items-center gap-1 px-3 pt-2">
                                        {(subActivities[groupKey] || []).length > 0 && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 gap-1.5 text-xs text-muted-foreground"
                                            onClick={() => openFormModal('task', 'create', { moduleId: module.id, activityId: activity.id, subActivityId: subActivities[groupKey][0].id })}
                                          >
                                            <Plus className="h-3.5 w-3.5" /> Add Task (full form)
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                    {tasks.length === 0 && (
                                      <div className="py-6 px-4 text-sm text-muted-foreground text-center">
                                        No tasks yet in this activity.
                                      </div>
                                    )}
                                    {tasks.length > 0 && (
                                      <Table className="table-fixed">
                                        <colgroup>
                                          <col style={{ width: LIST_COLUMN_WIDTHS.actions }} />
                                          <col style={{ width: LIST_COLUMN_WIDTHS.task }} />
                                          <col style={{ width: LIST_COLUMN_WIDTHS.subActivity }} />
                                          <col style={{ width: LIST_COLUMN_WIDTHS.status }} />
                                          <col style={{ width: LIST_COLUMN_WIDTHS.progress }} />
                                          {!isClient && <col style={{ width: LIST_COLUMN_WIDTHS.responsible }} />}
                                          <col style={{ width: LIST_COLUMN_WIDTHS.planDates }} />
                                          <col style={{ width: LIST_COLUMN_WIDTHS.actualDates }} />
                                        </colgroup>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="h-8 py-1.5 px-1 text-xs" />
                                            <TableHead className="h-8 py-1.5 px-3 text-xs">Task</TableHead>
                                            <TableHead className="h-8 py-1.5 px-3 text-xs">Sub-Activity</TableHead>
                                            <TableHead className="h-8 py-1.5 px-3 text-xs">Status</TableHead>
                                            <TableHead className="h-8 py-1.5 px-3 text-xs">Progress</TableHead>
                                            {!isClient && <TableHead className="h-8 py-1.5 px-3 text-xs">Responsible</TableHead>}
                                            <TableHead className="h-8 py-1.5 px-3 text-xs">Plan Dates</TableHead>
                                            <TableHead className="h-8 py-1.5 px-3 text-xs">Actual Dates</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {tasks.map(detail => {
                                            const isEditableRole = userRole !== 'Client'
                                            const isEditingField = (field) => editingCell?.taskId === detail.id && editingCell.field === field
                                            const editableCellClass = isEditableRole ? 'cursor-pointer hover:bg-muted/40' : ''
                                            return (
                                              <TableRow key={detail.id} className="group">
                                                <TableCell className="py-1.5 px-1">
                                                  {isEditableRole && (
                                                    <DropdownMenu>
                                                      <DropdownMenuTrigger asChild>
                                                        <Button
                                                          size="sm"
                                                          variant="ghost"
                                                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                                                          aria-label={`Task actions: ${detail.name}`}
                                                        >
                                                          <MoreHorizontal className="h-3.5 w-3.5" />
                                                        </Button>
                                                      </DropdownMenuTrigger>
                                                      <DropdownMenuContent align="start">
                                                        <DropdownMenuItem
                                                          onClick={() => openFormModal('task', 'edit', { moduleId: module.id, activityId: activity.id, subActivityId: detail.sub_activity_id }, detail)}
                                                        >
                                                          <Edit className="h-3.5 w-3.5" /> Edit
                                                        </DropdownMenuItem>
                                                        {['Admin', 'Project Manager'].includes(userRole) && (
                                                          <DropdownMenuItem
                                                            className="text-destructive focus:text-destructive"
                                                            onClick={() => {
                                                              setDeleteTarget({
                                                                level: 'task',
                                                                id: detail.id,
                                                                context: { moduleId: module.id, activityId: activity.id, subActivityId: detail.sub_activity_id }
                                                              })
                                                              setDeleteError(null); setDeleteConfirmOpen(true)
                                                            }}
                                                          >
                                                            <Trash2 className="h-3.5 w-3.5" /> Delete
                                                          </DropdownMenuItem>
                                                        )}
                                                      </DropdownMenuContent>
                                                    </DropdownMenu>
                                                  )}
                                                </TableCell>
                                                <TableCell
                                                  className={`py-1.5 px-3 text-sm font-medium ${editableCellClass}`}
                                                  onClick={() => isEditableRole && !isEditingField('name') && startCellEdit(detail.id, 'name')}
                                                >
                                                  {isEditingField('name') ? (
                                                    <input
                                                      autoFocus
                                                      type="text"
                                                      defaultValue={detail.name}
                                                      onClick={(e) => e.stopPropagation()}
                                                      onBlur={(e) => {
                                                        const value = e.target.value.trim()
                                                        if (value && value !== detail.name) {
                                                          saveCellField(detail.id, { name: value }, module.id, activity.id)
                                                        } else {
                                                          cancelCellEdit()
                                                        }
                                                      }}
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter') e.currentTarget.blur()
                                                        if (e.key === 'Escape') cancelCellEdit()
                                                      }}
                                                      className="w-full bg-background border border-input rounded px-2 py-1 text-sm outline-none ring-2 ring-ring/40"
                                                    />
                                                  ) : (
                                                    <div className="flex items-center gap-2">
                                                      <span>{detail.name}</span>
                                                      {detail.client_visible && (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-500 bg-blue-500/5 shrink-0">
                                                          Shared with Client
                                                        </Badge>
                                                      )}
                                                    </div>
                                                  )}
                                                </TableCell>

                                                {/* Sub-Activity is intentionally read-only here — reassigning a
                                                    task's Sub-Activity isn't a field the backend accepts on update
                                                    (research.md D4); shown for context, editable only by moving
                                                    the task via the full Sub-Activity management flow. */}
                                                <TableCell className="py-1.5 px-3 text-xs text-muted-foreground whitespace-nowrap">{detail.sub_activity_name || '—'}</TableCell>

                                                <TableCell
                                                  className={`py-1.5 px-3 ${editableCellClass}`}
                                                  onClick={() => isEditableRole && !isEditingField('status') && startCellEdit(detail.id, 'status')}
                                                >
                                                  {isEditingField('status') ? (
                                                    <Select
                                                      defaultValue={detail.status}
                                                      defaultOpen
                                                      onValueChange={(v) => saveCellField(detail.id, { status: v }, module.id, activity.id)}
                                                      onOpenChange={(open) => { if (!open) cancelCellEdit() }}
                                                    >
                                                      <SelectTrigger className="w-[130px] h-8" onClick={(e) => e.stopPropagation()}>
                                                        <SelectValue />
                                                      </SelectTrigger>
                                                      <SelectContent>
                                                        <SelectItem value="not_started">Not Started</SelectItem>
                                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                                        <SelectItem value="completed">Completed</SelectItem>
                                                        <SelectItem value="delayed">Delayed</SelectItem>
                                                      </SelectContent>
                                                    </Select>
                                                  ) : (
                                                    <Badge className={getStatusColor(detail.status)}>
                                                      {getStatusLabel(detail.status)}
                                                    </Badge>
                                                  )}
                                                </TableCell>

                                                <TableCell
                                                  className={`py-1.5 px-3 ${editableCellClass}`}
                                                  onClick={() => isEditableRole && !isEditingField('progress') && startCellEdit(detail.id, 'progress')}
                                                >
                                                  {isEditingField('progress') ? (
                                                    <Input
                                                      autoFocus
                                                      type="number"
                                                      min="0"
                                                      max="100"
                                                      defaultValue={detail.progress}
                                                      onClick={(e) => e.stopPropagation()}
                                                      onBlur={(e) => {
                                                        const value = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                                                        saveCellField(detail.id, { progress: value }, module.id, activity.id)
                                                      }}
                                                      onKeyDown={(e) => {
                                                        if (e.key === 'Enter') e.currentTarget.blur()
                                                        if (e.key === 'Escape') cancelCellEdit()
                                                      }}
                                                      className="w-[80px] h-8"
                                                    />
                                                  ) : (
                                                    <div className="flex items-center gap-2">
                                                      <Progress value={detail.progress} className="w-[60px] h-2" />
                                                      <span className="text-xs">{detail.progress}%</span>
                                                    </div>
                                                  )}
                                                </TableCell>

                                                {!isClient && (
                                                  <TableCell
                                                    className={`py-1.5 px-3 text-xs text-muted-foreground ${editableCellClass}`}
                                                    onClick={() => isEditableRole && !isEditingField('responsible') && startCellEdit(detail.id, 'responsible')}
                                                  >
                                                    {isEditingField('responsible') ? (
                                                      <input
                                                        autoFocus
                                                        type="text"
                                                        defaultValue={detail.responsible || ''}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onBlur={(e) => saveCellField(detail.id, { responsible: e.target.value }, module.id, activity.id)}
                                                        onKeyDown={(e) => {
                                                          if (e.key === 'Enter') e.currentTarget.blur()
                                                          if (e.key === 'Escape') cancelCellEdit()
                                                        }}
                                                        className="w-full bg-background border border-input rounded px-2 py-1 text-xs outline-none ring-2 ring-ring/40"
                                                      />
                                                    ) : (
                                                      detail.responsible || <span className="text-muted-foreground/50">—</span>
                                                    )}
                                                  </TableCell>
                                                )}

                                                <TableCell
                                                  className={`py-1.5 px-3 text-xs ${editableCellClass}`}
                                                  onClick={() => isEditableRole && !isEditingField('plan_dates') && startCellEdit(detail.id, 'plan_dates')}
                                                >
                                                  {isEditingField('plan_dates') ? (
                                                    <div className="flex items-center gap-1" data-inline-date-group onClick={(e) => e.stopPropagation()}>
                                                      <input
                                                        type="date"
                                                        autoFocus
                                                        defaultValue={detail.plan_start_date ? detail.plan_start_date.substring(0, 10) : ''}
                                                        onBlur={(e) => commitDateGroup(e, detail.id, 'plan', module.id, activity.id)}
                                                        className="w-[130px] h-8 text-xs border border-input rounded px-1.5 bg-background"
                                                      />
                                                      <input
                                                        type="date"
                                                        defaultValue={detail.plan_end_date ? detail.plan_end_date.substring(0, 10) : ''}
                                                        onBlur={(e) => commitDateGroup(e, detail.id, 'plan', module.id, activity.id)}
                                                        className="w-[130px] h-8 text-xs border border-input rounded px-1.5 bg-background"
                                                      />
                                                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={cancelCellEdit} aria-label="Close date editor">
                                                        <X className="h-3.5 w-3.5" />
                                                      </Button>
                                                    </div>
                                                  ) : (
                                                    `${formatDate(detail.plan_start_date)} - ${formatDate(detail.plan_end_date)}`
                                                  )}
                                                </TableCell>

                                                <TableCell
                                                  className={`py-1.5 px-3 text-xs ${editableCellClass}`}
                                                  onClick={() => isEditableRole && !isEditingField('actual_dates') && startCellEdit(detail.id, 'actual_dates')}
                                                >
                                                  {isEditingField('actual_dates') ? (
                                                    <div className="flex items-center gap-1" data-inline-date-group onClick={(e) => e.stopPropagation()}>
                                                      <input
                                                        type="date"
                                                        autoFocus
                                                        defaultValue={detail.actual_start_date ? detail.actual_start_date.substring(0, 10) : ''}
                                                        onBlur={(e) => commitDateGroup(e, detail.id, 'actual', module.id, activity.id)}
                                                        className="w-[130px] h-8 text-xs border border-input rounded px-1.5 bg-background"
                                                      />
                                                      <input
                                                        type="date"
                                                        defaultValue={detail.actual_end_date ? detail.actual_end_date.substring(0, 10) : ''}
                                                        onBlur={(e) => commitDateGroup(e, detail.id, 'actual', module.id, activity.id)}
                                                        className="w-[130px] h-8 text-xs border border-input rounded px-1.5 bg-background"
                                                      />
                                                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={cancelCellEdit} aria-label="Close date editor">
                                                        <X className="h-3.5 w-3.5" />
                                                      </Button>
                                                    </div>
                                                  ) : (
                                                    <>
                                                      {detail.actual_start_date && formatDate(detail.actual_start_date)}
                                                      {detail.actual_start_date && detail.actual_end_date && ' - '}
                                                      {detail.actual_end_date && formatDate(detail.actual_end_date)}
                                                      {!detail.actual_start_date && '-'}
                                                    </>
                                                  )}
                                                </TableCell>
                                              </TableRow>
                                            )
                                          })}
                                        </TableBody>
                                      </Table>
                                    )}

                                    {userRole !== 'Client' && (
                                      <form
                                        className="px-3 py-2 border-t border-border/60"
                                        onSubmit={(e) => {
                                          e.preventDefault()
                                          handleInlineAddSubmit(module.id, activity.id)
                                        }}
                                      >
                                        {/* Wrapping icon + input in a <label> so clicking
                                            anywhere in the row (including the icon) focuses
                                            the input — a bare sibling <Plus> icon doesn't
                                            forward clicks/focus to the input on its own.
                                            Styled as a visible field (border, hover/focus
                                            states) rather than plain text, so it reads as
                                            editable rather than decorative. */}
                                        <label className="flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-1.5 cursor-text hover:border-primary/50 hover:bg-muted/30 focus-within:border-primary focus-within:border-solid focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/30 transition-colors">
                                          <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                                          <input
                                            value={inlineAddValues[groupKey] || ''}
                                            onChange={(e) => setInlineAddValues(prev => ({ ...prev, [groupKey]: e.target.value }))}
                                            placeholder="Add task…"
                                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                          />
                                        </label>
                                        {inlineAddErrors[groupKey] && (
                                          <p className="text-xs text-destructive mt-1 pl-5">{inlineAddErrors[groupKey]}</p>
                                        )}
                                      </form>
                                    )}
                                  </>
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        )
                      })()
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
            </>
          ))}
        </div>
      ) : viewMode === 'gantt' ? (
        /* Gantt View */
        <div id="gantt-chart-container" className="relative border rounded-xl bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col">
          {/* Print/Export Styles */}
          <style>{`
            @media print {
              body * {
                visibility: hidden !important;
              }
              #gantt-chart-container, #gantt-chart-container * {
                visibility: visible !important;
              }
              #gantt-chart-container {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                height: auto !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
              }
              #gantt-zoom-toolbar {
                display: none !important;
              }
              .overflow-x-auto {
                overflow-x: visible !important;
              }
            }
          `}</style>
          {/* Prefetch loading overlay */}
          {ganttDataLoading && (
            <div className="absolute inset-0 z-50 bg-card/80 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-2 bg-muted/90 border border-border rounded-lg px-4 py-2 shadow-md">
                <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                <span className="text-xs font-medium text-muted-foreground">Computing timeline bars…</span>
              </div>
            </div>
          )}
          {/* Zoom Toolbar */}
          <div id="gantt-zoom-toolbar" className="w-full flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/10 shrink-0">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Timeline View</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Baseline View Mode */}
              <Button
                size="sm"
                variant={showBaseline ? 'secondary' : 'outline'}
                className="h-7 px-2.5 text-[11px] font-medium gap-1.5"
                onClick={() => setShowBaseline(!showBaseline)}
                title="Toggle baseline snapshots (Planned vs Actual dates)"
              >
                <span className={`w-2 h-2 rounded-full ${showBaseline ? 'bg-primary' : 'bg-muted-foreground/45'}`} />
                Baseline
              </Button>

              {/* Critical Path View Mode */}
              <Button
                size="sm"
                variant={showCriticalPath ? 'secondary' : 'outline'}
                className="h-7 px-2.5 text-[11px] font-medium gap-1.5"
                onClick={() => setShowCriticalPath(!showCriticalPath)}
                title="Highlight tasks on the critical path"
              >
                <span className={`w-2 h-2 rounded-full ${showCriticalPath ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/45'}`} />
                Critical Path
              </Button>

              <div className="w-px h-4 bg-border mx-0.5" />

              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleZoomOut}
                title="Zoom Out — see more of the timeline"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[10px] text-muted-foreground/70 w-14 text-center select-none">
                {ganttColWidth}px/day
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleZoomIn}
                title="Zoom In — see daily detail"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <div className="w-px h-4 bg-border mx-0.5" />
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-3 text-[11px] font-medium gap-1.5"
                onClick={() => {
                  const dateRange = getProjectDateRange()
                  const totalDays = Math.round((dateRange.end - dateRange.start) / (1000 * 60 * 60 * 24)) + 1
                  handleFitGantt(totalDays)
                }}
                title="Fit all bars into the visible screen"
              >
                <Maximize2 className="h-3 w-3" />
                Fit All
              </Button>

              <div className="w-px h-4 bg-border mx-0.5" />

              {/* Export PDF Button */}
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-[11px] font-medium gap-1.5"
                onClick={() => window.print()}
                title="Print Gantt chart / Export as PDF"
              >
                Export PDF
              </Button>
            </div>
          </div>
          {/* Left + Right panels */}
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {/* Left Panel - Task List */}
            <div className="w-full md:w-[500px] shrink-0 border-r border-border flex flex-col bg-card">
            {/* Header */}
            <div className="h-20 bg-muted/20 border-b border-border flex items-center px-4 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
              <div className="grid grid-cols-12 w-full gap-2 items-center">
                <div className={isClient ? 'col-span-7' : 'col-span-5'}>Task Name</div>
                {!isClient && <div className="col-span-2">Contributor</div>}
                <div className="col-span-2 text-center">Status</div>
                <div className="col-span-2 text-right">Dates</div>
                <div className="col-span-1 text-right">Edit</div>
              </div>
            </div>
            {/* Rows */}
            <div className="flex-1 divide-y divide-border/60">
              {getVisibleGanttRows().map(row => (
                <div key={row.id} className="h-12 flex items-center px-4 hover:bg-muted/30 transition-colors">
                  <div className="grid grid-cols-12 w-full gap-2 items-center text-xs">
                    {/* Task name with indentation based on depth */}
                    <div className={`${isClient ? 'col-span-7' : 'col-span-5'} flex items-center gap-1`} style={{ paddingLeft: `${row.depth * 12}px` }}>
                      {row.type !== 'task' ? (
                        <button
                          onClick={() => handleGanttToggle(row)}
                          className="p-1 hover:bg-muted rounded-md transition-colors shrink-0"
                        >
                          {isGanttRowExpanded(row) ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
                      ) : (
                        <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                        </div>
                      )}
                      <span className={`truncate ${row.type === 'module' ? 'font-semibold text-foreground' : row.type === 'activity' ? 'font-medium text-foreground/80' : 'text-muted-foreground'}`}>
                        {row.code && <span className="text-muted-foreground/60 font-mono text-[10px] mr-1">{row.code}</span>}
                        {row.name}
                      </span>
                    </div>

                    {!isClient && (
                      <div className="col-span-2 truncate text-muted-foreground/80 text-[11px]">
                        {row.responsible}
                      </div>
                    )}

                    {/* Status badge */}
                    <div className="col-span-2 flex justify-center">
                      <Badge className={`text-[9px] py-0 px-1.5 h-5 font-medium border ${getGanttStatusColor(row.status)}`}>
                        {getGanttStatusLabel(row.status)}
                      </Badge>
                    </div>

                    {/* Plan dates */}
                    <div className="col-span-2 text-right text-muted-foreground/80 text-[10px]">
                      {row.plan_start_date && row.plan_end_date ? (
                        <span className="block truncate" title={`${formatDate(row.plan_start_date)} - ${formatDate(row.plan_end_date)}`}>
                          {(() => {
                            const s = parseLocalDate(row.plan_start_date)
                            const e = parseLocalDate(row.plan_end_date)
                            if (!s || !e) return '-'
                            const sMonth = s.toLocaleDateString('default', { month: 'short' })
                            const eMonth = e.toLocaleDateString('default', { month: 'short' })
                            if (s.getFullYear() !== e.getFullYear()) {
                              return `${sMonth} ${s.getDate()}, ${s.getFullYear()} - ${eMonth} ${e.getDate()}, ${e.getFullYear()}`
                            }
                            if (sMonth !== eMonth) {
                              return `${sMonth} ${s.getDate()} - ${eMonth} ${e.getDate()}`
                            }
                            if (s.getDate() === e.getDate()) {
                              return `${sMonth} ${s.getDate()}`
                            }
                            return `${sMonth} ${s.getDate()} - ${e.getDate()}`
                          })()}
                        </span>
                      ) : '-'}
                    </div>

                    {/* Action buttons */}
                    <div className="col-span-1 flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-500 hover:bg-muted"
                        onClick={() => {
                          if (row.type === 'module') {
                            openFormModal('module', 'edit', {}, row.item)
                          } else if (row.type === 'activity') {
                            openFormModal('activity', 'edit', { moduleId: row.item.module_id }, row.item)
                          } else if (row.type === 'sub-activity') {
                            openFormModal('sub-activity', 'edit', { moduleId: row.moduleId, activityId: row.activityId }, row.item)
                          } else if (row.type === 'task') {
                            openFormModal('task', 'edit', { moduleId: row.moduleId, activityId: row.activityId, subActivityId: row.subActivityId }, row.item)
                          }
                        }}
                        title="Edit Item"
                        aria-label={`Edit: ${row.item.name}`}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {getVisibleGanttRows().length === 0 && (
                <div className="h-24 flex items-center justify-center text-muted-foreground text-xs italic">
                  No tasks found matching current filters.
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Scrollable Gantt Timeline */}
          <div className="flex-1 overflow-x-auto flex flex-col bg-muted/5 relative border-t md:border-t-0">
            {(() => {
              const dateRange = getProjectDateRange()
              const timelineStart = dateRange.start
              const timelineEnd = dateRange.end
              const timelineDays = getTimelineDays(timelineStart, timelineEnd)
              const timelineMonths = getTimelineMonths(timelineDays)
              const colWidth = ganttColWidth
              
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              let todayOffset = -1
              if (today >= timelineStart && today <= timelineEnd) {
                const diffTime = today.getTime() - timelineStart.getTime()
                const diffDays = diffTime / (1000 * 60 * 60 * 24)
                todayOffset = diffDays * colWidth
              }

              const visibleRows = getVisibleGanttRows()

              return (
                <div style={{ width: `${timelineDays.length * colWidth}px` }} className="flex flex-col min-h-full">
                  {/* Timeline Header */}
                  <div className="h-20 bg-muted/20 border-b border-border flex flex-col shrink-0 sticky top-0 z-20">
                    {/* Month headers */}
                    <div className="flex h-10 border-b border-border/40">
                      {timelineMonths.map((month, idx) => (
                        <div
                          key={idx}
                          className="border-r border-border/30 flex items-center justify-center text-[11px] font-semibold text-muted-foreground bg-muted/10 shrink-0"
                          style={{ width: `${month.colspan * colWidth}px` }}
                        >
                          {month.label}
                        </div>
                      ))}
                    </div>
                    {/* Day headers */}
                    <div className="flex h-10">
                      {timelineDays.map((day, idx) => {
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6
                        const isTodayDate = isToday(day)
                        return (
                          <div
                            key={idx}
                            className={`border-r border-border/30 flex flex-col items-center justify-center text-[9px] font-medium shrink-0 ${isWeekend ? 'bg-muted/15 text-muted-foreground/60' : 'text-muted-foreground'} ${isTodayDate ? 'bg-primary/10 text-primary font-bold border-r-primary' : ''}`}
                            style={{ width: `${colWidth}px` }}
                          >
                            {colWidth >= 14 && <span>{day.getDate()}</span>}
                            {colWidth >= 20 && <span className="text-[10px] uppercase opacity-75">{day.toLocaleDateString('default', { weekday: 'narrow' })}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Grid Content with bars */}
                  <div className="relative flex-1 divide-y divide-border/60">
                    {/* Vertical grid lines overlay */}
                    <div className="absolute inset-0 pointer-events-none flex">
                      {timelineDays.map((day, idx) => {
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6
                        return (
                          <div
                            key={idx}
                            className={`border-r border-border/10 shrink-0 h-full ${isWeekend ? 'bg-muted/5' : ''}`}
                            style={{ width: `${colWidth}px` }}
                          />
                        )
                      })}
                    </div>

                    {/* Today line indicator */}
                    {todayOffset >= 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-[1.5px] bg-primary z-10 pointer-events-none"
                        style={{ left: `${todayOffset}px` }}
                      >
                        <div className="absolute top-0 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
                      </div>
                    )}

                    {/* Row Gantt Bars */}
                    {visibleRows.map(row => {
                      const actualStart = row.actual_start_date || row.plan_start_date
                      const actualEnd = row.actual_end_date || row.plan_end_date
                      const actualPos = calculateBarPosition(actualStart, actualEnd, timelineStart, colWidth)

                      const planStart = row.plan_start_date
                      const planEnd = row.plan_end_date
                      const planPos = calculateBarPosition(planStart, planEnd, timelineStart, colWidth)

                      const hasTimeline = actualPos || planPos
                      const isCritical = isItemOnCriticalPath(row, dateRange.actualMax)

                      return (
                        <div key={row.id} className="h-12 relative flex items-center hover:bg-muted/10 transition-colors">
                          {hasTimeline ? (
                            <>
                              {/* Baseline (Planned) bar */}
                              {showBaseline && planPos && (
                                <div
                                  className="absolute h-2.5 rounded-full bg-muted-foreground/35 border-none pointer-events-none"
                                  style={{
                                    left: `${planPos.left}px`,
                                    width: `${planPos.width}px`,
                                    top: '32px'
                                  }}
                                  title={`Baseline: ${formatDate(planStart)} - ${formatDate(planEnd)}`}
                                />
                              )}

                              {/* Actual/Current bar */}
                              {actualPos && (
                                <div
                                  className="absolute h-6 rounded-md shadow-sm flex items-center justify-between px-2 group cursor-pointer border hover:shadow transition-all duration-150"
                                  style={{
                                    left: `${actualPos.left}px`,
                                    width: `${actualPos.width}px`,
                                    top: showBaseline ? '8px' : '12px',
                                    ...getGanttBarStyles(row.status, isCritical)
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (row.type === 'module') {
                                      openFormModal('module', 'edit', {}, row.item)
                                    } else if (row.type === 'activity') {
                                      openFormModal('activity', 'edit', { moduleId: row.item.module_id }, row.item)
                                    } else if (row.type === 'sub-activity') {
                                      openFormModal('sub-activity', 'edit', { moduleId: row.moduleId, activityId: row.activityId }, row.item)
                                    } else if (row.type === 'task') {
                                      openFormModal('task', 'edit', { moduleId: row.moduleId, activityId: row.activityId, subActivityId: row.subActivityId }, row.item)
                                    }
                                  }}
                                >
                                  {/* Progress fill */}
                                  {row.progress > 0 && (
                                    <div
                                      className="absolute left-0 top-0 bottom-0 bg-white/20 rounded-l-[5px] transition-all duration-300 pointer-events-none"
                                      style={{ width: `${row.progress}%` }}
                                    />
                                  )}

                                  {/* Progress label (only if width is large enough and not pending/0%) */}
                                  {actualPos.width > 50 && row.status !== 'pending' && row.status !== 'not_started' && row.progress > 0 && (
                                    <span className="text-[9px] font-bold text-white z-10 truncate select-none">
                                      {row.progress !== undefined ? `${row.progress}%` : ''}
                                    </span>
                                  )}

                                  {/* Milestone diamond for 0-duration or 1-day tasks */}
                                  {actualPos.width <= 16 && (
                                    <div className="w-2.5 h-2.5 rotate-45 bg-white border border-border/30 mx-auto z-10" />
                                  )}

                                  {/* Hover popover tooltip */}
                                  <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-popover text-popover-foreground text-xs p-3 rounded-lg shadow-lg border border-border/80 z-50 w-64 transition-all duration-200">
                                    <div className="font-semibold text-foreground text-xs mb-1.5 truncate border-b pb-1">
                                      {row.code && <span className="text-muted-foreground mr-1">[{row.code}]</span>}
                                      {row.name}
                                    </div>
                                    <div className="space-y-1 text-[10px] text-muted-foreground">
                                      <div className="flex justify-between">
                                        <span>Level:</span>
                                        <span className="text-foreground capitalize">{row.type}</span>
                                      </div>
                                      {row.actual_start_date && (row.actual_start_date !== row.plan_start_date || row.actual_end_date !== row.plan_end_date) ? (
                                        <>
                                          <div className="flex justify-between">
                                            <span>Planned:</span>
                                            <span className="text-foreground">{formatDate(row.plan_start_date)} to {formatDate(row.plan_end_date)}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span>Actual:</span>
                                            <span className="text-foreground">{formatDate(row.actual_start_date)} to {formatDate(row.actual_end_date)}</span>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="flex justify-between">
                                          <span>Planned Dates:</span>
                                          <span className="text-foreground">{row.plan_start_date ? `${formatDate(row.plan_start_date)} to ${formatDate(row.plan_end_date)}` : '-'}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between">
                                        <span>Duration:</span>
                                        <span className="text-foreground">{row.duration_months || 0}m {row.duration_days || 0}d</span>
                                      </div>
                                      {row.progress !== undefined && (
                                        <div className="flex justify-between">
                                          <span>Progress:</span>
                                          <span className="text-foreground">{row.progress}%</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between">
                                        <span>Status:</span>
                                        <span className="text-foreground capitalize font-medium">{row.status}</span>
                                      </div>
                                      {!isClient && (
                                        <div className="flex justify-between">
                                          <span>Contributor:</span>
                                          <span className="text-foreground truncate max-w-[140px]">{row.responsible}</span>
                                        </div>
                                      )}
                                      <div className="text-[9px] text-muted-foreground/60 italic text-center mt-2 border-t border-border/40 pt-1.5 select-none pointer-events-none">
                                        Click timeline bar to edit
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="absolute left-4 text-[10px] text-muted-foreground/60 italic select-none">No timeline scheduled</span>
                          )}
                        </div>
                      )
                    })}
                    {visibleRows.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-center gap-4 px-6">
                        <div className="rounded-full bg-muted/60 p-3">
                          <SearchX className="h-7 w-7 text-muted-foreground" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">
                            {hasActiveSearch ? 'No matching activities' : 'No timeline data'}
                          </p>
                          <p className="text-xs text-muted-foreground max-w-xs">
                            {hasActiveSearch
                              ? 'Try adjusting your search or filter to see timeline bars.'
                              : 'Add activities with planned start and end dates to generate the Gantt timeline.'}
                          </p>
                        </div>
                        {hasActiveSearch ? (
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setSearchTerm(''); setStatusFilter('all') }}>
                            <X className="h-3.5 w-3.5" /> Clear filters
                          </Button>
                        ) : (
                          <Button size="sm" className="gap-1.5" onClick={() => openFormModal('module', 'create', selectedProject)}>
                            <Plus className="h-3.5 w-3.5" /> Add Module
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
          {/* End Left + Right panels */}
        </div>
        {/* End outer Gantt container */}
      </div>
    ) : (
      /* 018-taskboard: Client never reaches this branch — viewMode can't be
         'taskboard' for Client (see the useState initializer and the hidden
         toggle pill above). */
      <TaskboardView project={selectedProjectRecord} modules={modules} userRole={userRole} />
    )}
  </>
)}



      {/* Project Management Modal */}
      <Dialog open={projectModalOpen} onOpenChange={setProjectModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Manage Projects</DialogTitle>
            <DialogDescription>
              Create, update, or delete projects in the system.
            </DialogDescription>
          </DialogHeader>

          {/* Project Form (Create / Edit) */}
          <form onSubmit={handleProjectSubmit} className="space-y-4 border p-4 rounded-lg bg-muted/20">
            <h4 className="text-sm font-semibold text-foreground">
              {projectEditingId ? 'Edit Project' : 'Create New Project'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5 col-span-1 md:col-span-2">
                <Label htmlFor="proj_name">Project Name *</Label>
                <Input
                  id="proj_name"
                  required
                  value={projectForm.name || ''}
                  onChange={(e) => setProjectForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. PITX POS Tenant Sales Management System"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj_location">Location</Label>
                <Input
                  id="proj_location"
                  value={projectForm.location || ''}
                  onChange={(e) => setProjectForm(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="e.g. Paranaque City"
                />
              </div>
            </div>
            <div className="flex justify-between items-center gap-2">
              <div className="space-y-1.5 w-full md:w-1/3">
                <Label htmlFor="proj_updated_date">Last Update Date</Label>
                <Input
                  id="proj_updated_date"
                  type="date"
                  value={projectForm.updated_date ? projectForm.updated_date.substring(0, 10) : ''}
                  onChange={(e) => setProjectForm(prev => ({ ...prev, updated_date: e.target.value }))}
                />
              </div>
              <div className="flex gap-2 self-end mt-2">
                {projectEditingId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setProjectEditingId(null)
                      setProjectForm({ name: '', location: '', updated_date: '' })
                    }}
                  >
                    Cancel
                  </Button>
                )}
                <Button type="submit" size="sm" disabled={projectSaving}>
                  {projectSaving ? 'Saving...' : projectEditingId ? 'Update Project' : 'Create Project'}
                </Button>
              </div>
            </div>
          </form>

          {/* Projects List */}
          <div className="space-y-3 mt-4">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Existing Projects</h4>
            <div className="divide-y divide-border border rounded-lg bg-card overflow-hidden max-h-[40vh] overflow-y-auto">
              {projects.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground italic">No projects found.</div>
              ) : (
                projects.map(proj => (
                  <div key={proj.id} className="flex items-center justify-between p-3.5 hover:bg-muted/10 transition-colors">
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate">{proj.name}</span>
                        {proj.id === selectedProject && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Active</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        {proj.location && <span>📍 {proj.location}</span>}
                        {proj.updated_date && <span>📅 Last updated: {formatDate(proj.updated_date)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => {
                          setProjectEditingId(proj.id)
                          setProjectForm({
                            name: proj.name || '',
                            location: proj.location || '',
                            updated_date: proj.updated_date ? proj.updated_date.substring(0, 10) : ''
                          })
                        }}
                        title="Edit Project"
                        aria-label={`Edit project: ${proj.name}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => handleProjectDelete(proj.id)}
                        title="Delete Project"
                        aria-label={`Delete project: ${proj.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Client Access — kept out of the main workspace so Work Program stays
          focused on Project Tasks; opened via the shield icon next to the
          gear (Manage Projects) button. */}
      <Dialog open={clientAccessModalOpen} onOpenChange={setClientAccessModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Client Access</DialogTitle>
            <DialogDescription>
              Invitations, memberships, and pending client access reviews for this project.
            </DialogDescription>
          </DialogHeader>

          {selectedProject && canManageSelectedProjectClientAccess && (
            <div className="space-y-6">
              <ProjectClientAccessPanel
                projectId={selectedProject}
                clientOrganizationId={selectedProjectRecord?.client_organization_id}
              />
              {canReviewClientMemberships && <ClientMembershipReviewQueue />}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* CRUD Form Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {modalMode === 'create' ? 'Add' : 'Edit'} {modalLevel === 'sub-activity' ? 'Sub-activity' : modalLevel.charAt(0).toUpperCase() + modalLevel.slice(1)}
            </DialogTitle>
            <DialogDescription>
              Fill in the details below. Fields marked with * are required.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={formValues.code || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, code: e.target.value }))}
                  placeholder="e.g. L2, M1, etc."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  required
                  value={formValues.name || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Name or title"
                />
              </div>
            </div>

            {(modalLevel === 'activity' || modalLevel === 'sub-activity') && (
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={formValues.type || ''}
                  onValueChange={(v) => setFormValues(prev => ({ ...prev, type: v }))}
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A (Activity)</SelectItem>
                    <SelectItem value="SA">SA (Sub-Activity)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="responsible">Responsible</Label>
                <Input
                  id="responsible"
                  value={formValues.responsible || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, responsible: e.target.value }))}
                  placeholder="Responsible person/role"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="support">Support</Label>
                <Input
                  id="support"
                  value={formValues.support || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, support: e.target.value }))}
                  placeholder="Supporting persons/roles"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="plan_start_date">Planned Start Date</Label>
                <Input
                  id="plan_start_date"
                  type="date"
                  value={formValues.plan_start_date || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, plan_start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan_end_date">Planned End Date</Label>
                <Input
                  id="plan_end_date"
                  type="date"
                  value={formValues.plan_end_date || ''}
                  onChange={(e) => setFormValues(prev => ({ ...prev, plan_end_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration_months">Duration (Months)</Label>
                <Input
                  id="duration_months"
                  type="number"
                  min="0"
                  value={formValues.duration_months || 0}
                  onChange={(e) => setFormValues(prev => ({ ...prev, duration_months: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration_days">Duration (Days)</Label>
                <Input
                  id="duration_days"
                  type="number"
                  min="0"
                  value={formValues.duration_days || 0}
                  onChange={(e) => setFormValues(prev => ({ ...prev, duration_days: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formValues.description || ''}
                onChange={(e) => setFormValues(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Detailed description..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="output">Expected Output</Label>
              <Textarea
                id="output"
                value={formValues.output || ''}
                onChange={(e) => setFormValues(prev => ({ ...prev, output: e.target.value }))}
                placeholder="Expected deliverables/outcomes..."
                rows={2}
              />
            </div>

            {modalLevel === 'task' && (
              <>
                {modalMode === 'edit' && formValues.sub_activity_name && (
                  <div className="space-y-2">
                    <Label>Sub-Activity</Label>
                    <p className="text-sm text-muted-foreground rounded-md border border-input bg-muted/30 px-3 py-2">
                      {formValues.sub_activity_name}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formValues.status || 'not_started'}
                      onValueChange={(v) => setFormValues(prev => ({ ...prev, status: v }))}
                    >
                      <SelectTrigger id="status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not_started">Not Started</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="delayed">Delayed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="progress">Progress (%)</Label>
                    <Input
                      id="progress"
                      type="number"
                      min="0"
                      max="100"
                      value={formValues.progress || 0}
                      onChange={(e) => setFormValues(prev => ({ ...prev, progress: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="actual_start_date">Actual Start Date</Label>
                    <Input
                      id="actual_start_date"
                      type="date"
                      value={formValues.actual_start_date || ''}
                      onChange={(e) => setFormValues(prev => ({ ...prev, actual_start_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="actual_end_date">Actual End Date</Label>
                    <Input
                      id="actual_end_date"
                      type="date"
                      value={formValues.actual_end_date || ''}
                      onChange={(e) => setFormValues(prev => ({ ...prev, actual_end_date: e.target.value }))}
                    />
                  </div>
                </div>

                {['Admin', 'Project Manager'].includes(userRole) && (
                  <div className="flex items-center space-x-3 rounded-lg border p-3 bg-muted/20 my-2">
                    <Checkbox
                      id="client_visible"
                      checked={formValues.client_visible || false}
                      onCheckedChange={(checked) => setFormValues(prev => ({ ...prev, client_visible: !!checked }))}
                    />
                    <div className="grid gap-1 leading-none">
                      <Label
                        htmlFor="client_visible"
                        className="text-xs font-semibold cursor-pointer"
                      >
                        Share with Client
                      </Label>
                      <p className="text-[10px] text-muted-foreground">
                        When enabled, clients can view this task in the work program, timeline, and reports.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formValues.notes || ''}
                    onChange={(e) => setFormValues(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Task-specific notes..."
                    rows={2}
                  />
                </div>
              </>
            )}

            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteConfirmOpen} onOpenChange={(open) => { setDeleteConfirmOpen(open); if (!open) setDeleteError(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-destructive">Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deleteTarget?.level}? This action cannot be undone and will delete all nested child elements.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              {deleteError}
            </p>
          )}
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setDeleteError(null) }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Sub-Activities Dialog (020-list-view-groups research.md D3)
          — relocates Sub-Activity CRUD out of the main flattened flow,
          since Sub-Activity is no longer its own expandable level. */}
      <Dialog open={!!manageSubActivitiesFor} onOpenChange={(open) => !open && setManageSubActivitiesFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Sub-Activities — {manageSubActivitiesFor?.activityName}
            </DialogTitle>
            <DialogDescription>
              Manage this activity's sub-activities. Tasks are grouped under
              a sub-activity behind the scenes even though they no longer
              appear as a separate expandable level.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {(subActivities[`${manageSubActivitiesFor?.moduleId}-${manageSubActivitiesFor?.activityId}`] || []).map(subActivity => (
              <div key={subActivity.id} className="flex items-center justify-between rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{subActivity.code || 'SA'}</Badge>
                  <span className="text-sm">{subActivity.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => openFormModal('sub-activity', 'edit', { moduleId: manageSubActivitiesFor.moduleId, activityId: manageSubActivitiesFor.activityId }, subActivity)}
                    aria-label={`Edit sub-activity: ${subActivity.name}`}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      setDeleteTarget({ level: 'sub-activity', id: subActivity.id, context: { moduleId: manageSubActivitiesFor.moduleId, activityId: manageSubActivitiesFor.activityId } })
                      setDeleteError(null); setDeleteConfirmOpen(true)
                    }}
                    aria-label={`Delete sub-activity: ${subActivity.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {(subActivities[`${manageSubActivitiesFor?.moduleId}-${manageSubActivitiesFor?.activityId}`] || []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No sub-activities yet.</p>
            )}
          </div>
          <DialogFooter className="pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => openFormModal('sub-activity', 'create', { moduleId: manageSubActivitiesFor.moduleId, activityId: manageSubActivitiesFor.activityId })}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Sub-Activity
            </Button>
            <Button onClick={() => setManageSubActivitiesFor(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
