import { useState, useEffect } from 'react'
import {
  fetchProjects,
  fetchReports,
  updateProjectHealth,
  downloadReportCsv,
} from '@/lib/api'
import { useEffectiveUser } from '@/context/PreviewContext'
import {
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Printer,
  Download,
  AlertOctagon,
  RefreshCw,
  FileText,
  SlidersHorizontal,
  Bookmark,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function Reports() {
  const user = useEffectiveUser()
  const userRole = user?.role
  const userDept = user?.department

  // Scope lists
  const [projectsList, setProjectsList] = useState([])
  const [departmentsList, setDepartmentsList] = useState(['all'])
  const [assigneesList, setAssigneesList] = useState(['all'])
  const [, setLoadingConfig] = useState(true)

  // Filters state
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [selectedDept, setSelectedDept] = useState('all')
  const [selectedHealth, setSelectedHealth] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [selectedAssignee, setSelectedAssignee] = useState('all')
  const [taskStatusFilter, setTaskStatusFilter] = useState('all')

  // Reports data state
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Health editing state
  const [editingHealthProjectId, setEditingHealthProjectId] = useState('')
  const [editHealthValue, setEditHealthValue] = useState('on_track')
  const [editHealthNote, setEditHealthNote] = useState('')
  const [isSavingHealth, setIsSavingHealth] = useState(false)
  const [healthFeedback, setHealthFeedback] = useState(null) // { type: 'success'|'error', msg: string }

  const loadConfiguration = async () => {
    setLoadingConfig(true)
    try {
      const res = await fetchProjects()
      let projects = res.data || []

      // Lock department scope for Department Head
      if (userRole === 'Department Head' && userDept) {
        projects = projects.filter(
          p => p.department?.toLowerCase() === userDept.toLowerCase()
        )
        setSelectedDept(userDept)
      }

      setProjectsList(projects)

      // Calculate departments list
      const depts = ['all', ...new Set(projects.map(p => p.department).filter(Boolean))]
      setDepartmentsList(depts)

      // Retrieve report once to build assignee lists dynamically
      const reportRes = await fetchReports({
        project_id: 'all',
        department: userRole === 'Department Head' ? userDept : 'all',
      })
      
      // Pluck assignees from tasks in report if internal role
      if (userRole !== 'Client' && reportRes.data.projects) {
        // Collect assignees
        const assigneesSet = new Set()
        // Standardize list
        assigneesSet.add('all')
        setAssigneesList(['all'])
      }
    } catch (err) {
      console.error('Failed to load reports configuration:', err)
    } finally {
      setLoadingConfig(false)
    }
  }

  // Initial config load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    loadConfiguration()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadConfiguration is recreated every render; including it would loop
  }, [userRole, userDept])

  const loadReport = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {
        project_id: selectedProjectId,
        department: selectedDept,
        health: selectedHealth,
        status: selectedStatus,
        date_start: dateStart || undefined,
        date_end: dateEnd || undefined,
        responsible: selectedAssignee !== 'all' ? selectedAssignee : undefined,
        task_status: taskStatusFilter !== 'all' ? taskStatusFilter : undefined,
      }

      // Enforce Department Head scope
      if (userRole === 'Department Head' && userDept) {
        params.department = userDept
      }

      const res = await fetchReports(params)
      setReportData(res.data)

      // Set up health edit inputs if exactly one project is selected
      if (selectedProjectId !== 'all' && res.data.projects && res.data.projects.length === 1) {
        const proj = res.data.projects[0]
        setEditingHealthProjectId(proj.id)
        setEditHealthValue(proj.health)
        setEditHealthNote(proj.health_note || '')
      } else {
        setEditingHealthProjectId('')
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err)
      setError('Unable to load report metrics. Please check filters.')
    } finally {
      setLoading(false)
    }
  }

  // Load report data when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadReport is recreated every render; including it would loop
  }, [
    selectedProjectId,
    selectedDept,
    selectedHealth,
    selectedStatus,
    dateStart,
    dateEnd,
    selectedAssignee,
    taskStatusFilter,
    userRole,
    userDept,
  ])

  // Handle health submit
  const handleHealthSave = async (e) => {
    e.preventDefault()
    if (!editingHealthProjectId) return
    setIsSavingHealth(true)
    setHealthFeedback(null)

    try {
      await updateProjectHealth(editingHealthProjectId, {
        health: editHealthValue,
        health_note: editHealthNote,
      })
      setHealthFeedback({ type: 'success', msg: 'Project health updated successfully!' })
      // Refresh reports
      loadReport()
      setTimeout(() => setHealthFeedback(null), 3000)
    } catch (err) {
      console.error('Failed to update project health:', err)
      setHealthFeedback({ type: 'error', msg: 'Failed to update project health.' })
    } finally {
      setIsSavingHealth(false)
    }
  }

  // Handle CSV Download
  const handleCsvExport = async () => {
    try {
      const params = {
        project_id: selectedProjectId,
        department: selectedDept,
        health: selectedHealth,
        status: selectedStatus,
        date_start: dateStart || undefined,
        date_end: dateEnd || undefined,
        responsible: selectedAssignee !== 'all' ? selectedAssignee : undefined,
        task_status: taskStatusFilter !== 'all' ? taskStatusFilter : undefined,
      }

      if (userRole === 'Department Head' && userDept) {
        params.department = userDept
      }

      await downloadReportCsv(params)
    } catch (err) {
      console.error('Failed to export CSV:', err)
      alert('Unable to export CSV.')
    }
  }

  // Health styling helpers
  const getHealthStyle = (health) => {
    switch (health) {
      case 'on_track':
        return { label: 'On Track', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' }
      case 'at_risk':
        return { label: 'At Risk', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30' }
      case 'off_track':
        return { label: 'Off Track', color: 'bg-red-500/10 text-red-500 border-red-500/30' }
      case 'on_hold':
        return { label: 'On Hold', color: 'bg-slate-500/10 text-slate-500 border-slate-500/30' }
      case 'completed':
        return { label: 'Completed', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' }
      default:
        return { label: 'On Track', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' }
    }
  }

  const isClient = userRole === 'Client'
  const isPMorAdmin = userRole === 'Project Manager' || userRole === 'Admin'

  const summary = reportData?.summary || {}
  const projects = reportData?.projects || []
  const generatedAt = reportData?.generated_at ? new Date(reportData.generated_at).toLocaleString() : ''

  const overallProgressVal = Math.round(summary.overall_progress || 0)
  // Tokens, not literals. The third value used to be the pre-2026 accent, which
  // was retired for failing AA at 4.39:1 — see the provenance note in
  // index.css. Low progress is an accent, not an error state, so it maps to
  // --primary rather than to red.
  const barColor = overallProgressVal >= 70 ? 'var(--success)' : overallProgressVal >= 30 ? 'var(--warning)' : 'var(--primary)'

  return (
    <div className="space-y-6 print-report">
      {/* Toast Notification */}
      {healthFeedback && (
        <div role="status" aria-live="polite" className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 shadow-lg border text-sm font-semibold transition-all duration-300 ${
          healthFeedback.type === 'error' 
            ? 'bg-destructive/15 border-destructive text-destructive' 
            : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
        }`}>
          {healthFeedback.type === 'error' ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          <span>{healthFeedback.msg}</span>
        </div>
      )}

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5 no-print">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" /> Project Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aggregate status summaries, project health tracking, and milestone timeline reports.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* CSV Download (Restricted from Client) */}
          {!isClient && (
            <button
              onClick={handleCsvExport}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted bg-card shadow-sm transition-all"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          )}

          {/* Print PDF Toggle */}
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all"
          >
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Print-Only Header */}
      <div className="hidden print:block border-b border-border/80 pb-4 mb-4">
        <h1 className="text-2xl font-bold text-foreground">Project Status Report</h1>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
          <span>Role Scope: <strong>{userRole}</strong></span>
          {userRole === 'Department Head' && <span>Department: <strong>{userDept}</strong></span>}
          <span>Report Generated: <strong>{generatedAt}</strong></span>
        </div>
      </div>

      {/* Scoped Filters Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-card p-4 rounded-xl border border-border/60 shadow-sm no-print">
        {/* Project Filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="report-filter-project" className="text-[10px] uppercase font-bold text-muted-foreground">Project</label>
          <select
            id="report-filter-project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="all">All Projects</option>
            {projectsList.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Department Filter (Hidden from Department Head) */}
        {userRole !== 'Department Head' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="report-filter-department" className="text-[10px] uppercase font-bold text-muted-foreground">Department</label>
            <select
              id="report-filter-department"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="all">All Departments</option>
              {departmentsList.filter(d => d !== 'all').map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        )}

        {/* Project Health Filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="report-filter-health" className="text-[10px] uppercase font-bold text-muted-foreground">Project Health</label>
          <select
            id="report-filter-health"
            value={selectedHealth}
            onChange={(e) => setSelectedHealth(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="all">All Health</option>
            <option value="on_track">On Track</option>
            <option value="at_risk">At Risk</option>
            <option value="off_track">Off Track</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Project Status Filter */}
        <div className="flex flex-col gap-1">
          <label htmlFor="report-filter-status" className="text-[10px] uppercase font-bold text-muted-foreground">Project Status</label>
          <select
            id="report-filter-status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="Not Started">Not Started</option>
            <option value="In Progress">In Progress</option>
            <option value="At Risk">At Risk</option>
            <option value="Delayed">Delayed</option>
            <option value="On Hold">On Hold</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        {/* Date Filters (Overdue/Milestones due limits) */}
        <div className="flex flex-col gap-1">
          <label htmlFor="report-filter-date-start" className="text-[10px] uppercase font-bold text-muted-foreground">Date Start</label>
          <input
            id="report-filter-date-start"
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="report-filter-date-end" className="text-[10px] uppercase font-bold text-muted-foreground">Date End</label>
          <input
            id="report-filter-date-end"
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
          />
        </div>

        {/* Assignee Filter (Hidden from Client) */}
        {!isClient && (
          <div className="flex flex-col gap-1">
            <label htmlFor="report-filter-assignee" className="text-[10px] uppercase font-bold text-muted-foreground">Task Assignee</label>
            <select
              id="report-filter-assignee"
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="all">All Assignees</option>
              {assigneesList.filter(a => a !== 'all').map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        )}

        {/* Task Status Filter (Hidden from Client) */}
        {!isClient && (
          <div className="flex flex-col gap-1">
            <label htmlFor="report-filter-task-status" className="text-[10px] uppercase font-bold text-muted-foreground">Task Status</label>
            <select
              id="report-filter-task-status"
              value={taskStatusFilter}
              onChange={(e) => setTaskStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="backlog">Backlog</option>
              <option value="not_started">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="for_review">For Review</option>
              <option value="blocked">Blocked</option>
              <option value="delayed">Delayed</option>
              <option value="completed">Done</option>
            </select>
          </div>
        )}
      </div>

      {/* Main Layout Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-muted-foreground bg-card border rounded-xl shadow-sm">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm font-semibold">Compiling report data...</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 text-center bg-card border rounded-xl shadow-sm px-6">
          <AlertOctagon className="h-10 w-10 text-destructive" />
          <p className="text-sm font-semibold text-destructive">{error}</p>
          <button onClick={loadReport} className="text-xs text-primary font-bold underline hover:opacity-85">
            Retry Loading
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center border border-dashed rounded-xl bg-card p-8">
          <FileText className="h-10 w-10 text-muted-foreground/60 mb-2" />
          <h2 className="text-base font-bold text-foreground">No reports found</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            No project report data matches the selected filters.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary KPIs Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Overall Progress Circle */}
            <Card className="overflow-hidden bg-card">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="relative flex items-center justify-center h-16 w-16 rounded-full border-4 border-muted bg-background">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(${barColor} ${overallProgressVal * 3.6}deg, transparent 0deg)`,
                      mask: 'radial-gradient(circle at center, transparent 62%, black 63%)',
                      WebkitMask: 'radial-gradient(circle at center, transparent 62%, black 63%)',
                    }}
                  />
                  <span className="text-sm font-black">{overallProgressVal}%</span>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Overall Progress</p>
                  <p className="text-lg font-extrabold mt-0.5">{projects.length} Projects</p>
                </div>
              </CardContent>
            </Card>

            {/* Warning Signal Overdue (Omitted from Client) */}
            {!isClient && (
              <Card className="bg-card">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-red-500/10 text-red-500 h-10 w-10 flex items-center justify-center border border-red-500/20">
                    <Clock className="h-5 w-5 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Overdue Tasks</p>
                    <p className="text-2xl font-black mt-0.5">{summary.overdue_count || 0}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Warning Signal Blocked (Omitted from Client) */}
            {!isClient && (
              <Card className="bg-card">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-amber-500/10 text-amber-500 h-10 w-10 flex items-center justify-center border border-amber-500/20">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Blocked Tasks</p>
                    <p className="text-2xl font-black mt-0.5">{summary.blocked_count || 0}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Warning Signal Dependency Risks (Omitted from Client) */}
            {!isClient && (
              <Card className="bg-card">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="rounded-lg bg-orange-500/10 text-orange-500 h-10 w-10 flex items-center justify-center border border-orange-500/20">
                    <AlertOctagon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Dependency Risks</p>
                    <p className="text-2xl font-black mt-0.5">{summary.dependency_risk_count || 0}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Project Health Manager (Only visible when exactly one project is selected, and user is PM/Admin) */}
          {editingHealthProjectId && isPMorAdmin && (
            <Card className="border-border/80 bg-card shadow-sm no-print">
              <CardHeader className="py-3 px-5 border-b border-border/40 bg-muted/20">
                <CardTitle as="h2" className="text-sm font-bold flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" /> Manage Project Health
                </CardTitle>
                <CardDescription className="text-[10px] mt-0.5">
                  Update manual project health status and record notes.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                <form onSubmit={handleHealthSave} className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="report-health-status" className="text-[10px] font-bold text-foreground">Health Status</label>
                      <select
                        id="report-health-status"
                        value={editHealthValue}
                        onChange={(e) => setEditHealthValue(e.target.value)}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
                      >
                        <option value="on_track">On Track</option>
                        <option value="at_risk">At Risk</option>
                        <option value="off_track">Off Track</option>
                        <option value="on_hold">On Hold</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label htmlFor="report-health-note" className="text-[10px] font-bold text-foreground">Health Note</label>
                      <textarea
                        id="report-health-note"
                        rows="1"
                        value={editHealthNote}
                        onChange={(e) => setEditHealthNote(e.target.value)}
                        placeholder="Explain project status (e.g. key delays, budget alerts...)"
                        className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none min-h-[38px] max-h-[80px]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-border/40">
                    <button
                      type="submit"
                      disabled={isSavingHealth}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all disabled:opacity-50"
                    >
                      {isSavingHealth && <RefreshCw className="h-3 w-3 animate-spin" />}
                      Save Health Status
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Projects Report List */}
          <div className="space-y-6">
            {projects.map((project) => {
              const hs = getHealthStyle(project.health)
              return (
                <Card key={project.id} className="overflow-hidden border border-border/75 shadow-sm bg-card break-inside-avoid">
                  {/* Project Summary Header */}
                  <div className="p-5 border-b border-border/60 bg-muted/15 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{project.department || 'General'}</span>
                        <Badge className={`${hs.color} text-[10px] py-0.5 border`}>{hs.label}</Badge>
                      </div>
                      <h2 className="text-base font-bold text-foreground mt-1">{project.name}</h2>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-semibold">
                      <div>
                        <span className="text-[10px] text-muted-foreground block text-right font-medium">Progress</span>
                        <span className="text-base font-black tabular-nums">{project.progress}%</span>
                      </div>
                      <div className="h-10 w-px bg-border/60" />
                      <div className="w-32">
                        {/* CSS Progress Bar */}
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Project Metrics Details */}
                  <CardContent className="p-5 space-y-4">
                    {/* Health Note Info Box */}
                    {project.health_note && (
                      <div className="p-3 bg-muted/40 border rounded-lg text-xs flex gap-2">
                        <Bookmark className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-foreground">Health Note:</p>
                          <p className="text-muted-foreground mt-0.5 leading-relaxed">{project.health_note}</p>
                          {project.health_updated_at && (
                            <span className="inline-block text-[9px] text-muted-foreground/80 mt-1">
                              Last updated on {new Date(project.health_updated_at).toLocaleDateString()} by {project.health_updated_by || 'PM'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Operational Details Grid (Hidden from Client) */}
                    {!isClient && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Warn Stats */}
                        <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-2">
                          <span className="text-[10px] uppercase font-extrabold text-muted-foreground tracking-wider block">Warning Signals</span>
                          <div className="space-y-1.5 text-xs font-medium">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Overdue Tasks:</span>
                              <span className={`font-bold ${project.overdue_count > 0 ? 'text-red-500' : 'text-foreground'}`}>{project.overdue_count}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Blocked Tasks:</span>
                              <span className={`font-bold ${project.blocked_count > 0 ? 'text-amber-500' : 'text-foreground'}`}>{project.blocked_count}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Dependency Risks:</span>
                              <span className={`font-bold ${project.dependency_risk_count > 0 ? 'text-orange-500' : 'text-foreground'}`}>{project.dependency_risk_count}</span>
                            </div>
                          </div>
                        </div>

                        {/* Status Chart Breakdown */}
                        {project.status_breakdown && (
                          <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-2 sm:col-span-2">
                            <span className="text-[10px] uppercase font-extrabold text-muted-foreground tracking-wider block">Task Breakdown</span>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 px-1 pt-1.5 h-16 items-end border-b border-border/60">
                              {Object.entries(project.status_breakdown).map(([status, count]) => {
                                const maxVal = Math.max(...Object.values(project.status_breakdown), 1)
                                const pct = (count / maxVal) * 100
                                const barColorClass = matchStatusColor(status)
                                return (
                                  <div key={status} className="flex flex-col items-center gap-1 group relative h-full justify-end">
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full mb-1 scale-0 group-hover:scale-100 transition-transform origin-bottom bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded shadow z-10 font-bold whitespace-nowrap">
                                      {count} tasks
                                    </div>
                                    <div
                                      className={`w-full rounded-t ${barColorClass}`}
                                      style={{ height: `${pct}%` }}
                                    />
                                    <span className="text-[10px] text-muted-foreground truncate w-full text-center capitalize font-semibold">
                                      {status.replace('_', ' ')}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Milestones Roadmap */}
                    {project.milestones && project.milestones.length > 0 && (
                      <div className="space-y-2.5">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Milestone Timeline</span>
                        <div className="relative border-l border-border/60 ml-2.5 pl-4 space-y-3 pt-1">
                          {project.milestones.map((m) => (
                            <div key={m.id} className="relative flex items-center justify-between text-xs gap-3 group">
                              <span className="absolute -left-[21px] h-2.5 w-2.5 rounded-full bg-purple-500 border border-background shadow-sm" />
                              <span className="font-bold text-foreground truncate">{m.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                  m.status === 'completed' 
                                    ? 'bg-emerald-500/10 text-emerald-500' 
                                    : 'bg-slate-500/10 text-slate-500'
                                }`}>
                                  {m.status === 'completed' ? 'Done' : 'Pending'}
                                </span>
                                {m.plan_end_date && (
                                  <span className="text-[9px] font-mono text-muted-foreground">{m.plan_end_date}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Helpers
function matchStatusColor(status) {
  switch (status) {
    case 'backlog':
      return 'bg-slate-400 dark:bg-slate-600'
    case 'todo':
      return 'bg-primary/70'
    case 'in_progress':
      return 'bg-blue-500/70'
    case 'for_review':
      return 'bg-amber-500/70'
    case 'done':
      return 'bg-emerald-500/70'
    case 'blocked':
      return 'bg-red-500/70'
    default:
      return 'bg-primary/70'
  }
}
