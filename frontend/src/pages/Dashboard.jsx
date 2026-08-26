import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { fetchDashboard } from '@/lib/api'
import { getStatusColor, getStatusLabel } from '@/lib/utils'
import AccessDenied from '@/components/AccessDenied'
import MyWorkPanel from '@/components/MyWorkPanel'
import {
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  Zap,
  Circle,
  RefreshCw,
  Info,
  ChevronRight,
  TrendingUp,
} from 'lucide-react'

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

/**
 * Metric card. The colored icon container carries the semantic colour — there
 * is deliberately no left accent stripe: border-l-{color} utilities are inert
 * under index.css's unlayered border reset, so the stripe only ever rendered
 * as a flat grey bar carrying no information.
 */
function StatCard({ title, value, description, icon: Icon, iconBg, iconColor }) {
  return (
    <Card className="relative overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 px-5">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${iconBg}`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent className="pb-4 px-5">
        <div className="text-3xl font-bold leading-none mt-1">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1.5">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

/** Status filter tabs for Recent Activities */
const STATUS_TABS = [
  { key: 'all',         label: 'All' },
  { key: 'completed',   label: 'Completed' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'not_started', label: 'Not Started' },
  { key: 'delayed',     label: 'Delayed' },
]

/* ─── Heatmap column config ─────────────────────────────────────────────────── */
const HEATMAP_COLS = [
  {
    key: 'completed',
    label: 'Completed',
    /* Tailwind bg classes by intensity bucket: [0, low, mid, high, max] */
    intensities: [
      'bg-emerald-50  text-emerald-300 dark:bg-emerald-950/10 dark:text-emerald-600',
      'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400',
      'bg-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      'bg-emerald-400 text-emerald-900 dark:bg-emerald-800/40 dark:text-emerald-200',
      'bg-emerald-600 text-white      dark:bg-emerald-600   dark:text-white',
    ],
    headerColor: 'text-emerald-700 dark:text-emerald-400',
    headerBg: 'bg-emerald-50 dark:bg-emerald-950/20',
  },
  {
    key: 'in_progress',
    label: 'In Progress',
    intensities: [
      'bg-blue-50  text-blue-300 dark:bg-blue-950/10 dark:text-blue-600',
      'bg-blue-100 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400',
      'bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      'bg-blue-400 text-blue-900 dark:bg-blue-800/40 dark:text-blue-200',
      'bg-blue-600 text-white    dark:bg-blue-600   dark:text-white',
    ],
    headerColor: 'text-blue-700 dark:text-blue-400',
    headerBg: 'bg-blue-50 dark:bg-blue-950/20',
  },
  {
    key: 'not_started',
    label: 'Not Started',
    intensities: [
      'bg-slate-50  text-slate-300 dark:bg-slate-900/10 dark:text-slate-600',
      'bg-slate-100 text-slate-500 dark:bg-slate-900/20 dark:text-slate-400',
      'bg-slate-200 text-slate-600 dark:bg-slate-800/30 dark:text-slate-300',
      'bg-slate-400 text-slate-800 dark:bg-slate-700/40 dark:text-slate-200',
      'bg-slate-500 text-white      dark:bg-slate-600   dark:text-white',
    ],
    headerColor: 'text-slate-600 dark:text-slate-400',
    headerBg: 'bg-slate-50 dark:bg-slate-900/20',
  },
  {
    key: 'delayed',
    label: 'Delayed',
    intensities: [
      'bg-slate-50  text-slate-300 dark:bg-slate-900/10 dark:text-slate-600',   // 0 tasks — neutral, no alarm
      'bg-red-100   text-red-600   dark:bg-red-950/20   dark:text-red-400',
      'bg-red-200   text-red-700   dark:bg-red-900/30   dark:text-red-300',
      'bg-red-400   text-red-900   dark:bg-red-800/40   dark:text-red-200',
      'bg-red-600   text-white     dark:bg-red-600     dark:text-white',
    ],
    headerColor: 'text-red-600 dark:text-red-400',
    headerBg: 'bg-red-50 dark:bg-red-950/20',
  },
]

/**
 * Map a raw count to a 0–4 intensity bucket given the per-column max.
 * Bucket 0 = zero tasks, 1–4 = linear quartile.
 */
function intensityBucket(count, colMax) {
  if (count === 0 || colMax === 0) return 0
  const frac = count / colMax
  if (frac <= 0.25) return 1
  if (frac <= 0.50) return 2
  if (frac <= 0.75) return 3
  return 4
}

/* ─── HeatmapCell ───────────────────────────────────────────────────────────── */
function HeatmapCell({ count, col, colMax, moduleId, moduleName, onDrillDown }) {
  const bucket  = intensityBucket(count, colMax)
  const classes = col.intensities[bucket]
  const isEmpty = count === 0

  return (
    <td className="p-1.5">
      <button
        onClick={() => !isEmpty && onDrillDown({ moduleId, moduleName, status: col.key })}
        disabled={isEmpty}
        title={
          isEmpty
            ? `No ${col.label.toLowerCase()} tasks in ${moduleName}`
            : `${count} ${col.label.toLowerCase()} task${count !== 1 ? 's' : ''} in ${moduleName} — click to drill down`
        }
        className={[
          'w-full rounded-lg h-14 flex flex-col items-center justify-center gap-0.5 transition-all duration-150',
          classes,
          isEmpty
            ? 'cursor-default opacity-40'
            : 'cursor-pointer hover:scale-[1.04] hover:shadow-md active:scale-[0.98] ring-0 hover:ring-2 hover:ring-offset-1 hover:ring-current',
        ].join(' ')}
        aria-label={`${count} ${col.label} tasks in ${moduleName}`}
      >
        <span className="text-lg font-bold leading-none tabular-nums">{count}</span>
        {!isEmpty && (
          <span className="text-[10px] font-medium opacity-70 leading-none">tasks</span>
        )}
      </button>
    </td>
  )
}

/* ─── HeatmapDrilldown panel ────────────────────────────────────────────────── */
function DrilldownBanner({ selection, heatmapData, onClose }) {
  if (!selection) return null
  const row = heatmapData.find(r => r.module_id === selection.moduleId)
  const count = row?.[selection.status] || 0
  const col   = HEATMAP_COLS.find(c => c.key === selection.status)

  return (
    <div className={`rounded-xl border p-4 flex items-start gap-4 ${col.headerBg} border-current/20`}>
      <div className={`rounded-lg p-2 bg-white/60 dark:bg-black/30 shrink-0`}>
        <Info className={`h-4 w-4 ${col.headerColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${col.headerColor}`}>
          {count} {col.label} task{count !== 1 ? 's' : ''} · {selection.moduleName}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Open Work Program to view and manage these tasks in detail.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/work-program"
          className={`flex items-center gap-1 text-xs font-semibold ${col.headerColor} hover:opacity-80 transition-opacity`}
        >
          Open Work Program <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xs transition-colors ml-2"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

/* ─── TaskHeatmap ────────────────────────────────────────────────────────────── */
function TaskHeatmap({ data }) {
  const [drilldown, setDrilldown] = useState(null)

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
        <Layers className="h-9 w-9 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No module data yet. Add modules in Work Program to see the heatmap.</p>
        <Link to="/work-program" className="text-xs font-medium text-primary flex items-center gap-1 hover:opacity-80">
          Go to Work Program <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    )
  }

  // Per-column max (for intensity normalization)
  const colMaxes = {}
  HEATMAP_COLS.forEach(col => {
    colMaxes[col.key] = Math.max(...data.map(r => r[col.key] || 0), 1)
  })

  // Identify the hottest module (highest not_started + delayed = biggest risk)
  const hottestModuleId = data.reduce((best, row) => {
    const risk = (row.not_started || 0) + (row.delayed || 0)
    const bestRisk = (best.not_started || 0) + (best.delayed || 0)
    return risk > bestRisk ? row : best
  }, data[0])?.module_id

  return (
    <div className="space-y-3">
      {/* Drill-down banner */}
      {drilldown && (
        <DrilldownBanner
          selection={drilldown}
          heatmapData={data}
          onClose={() => setDrilldown(null)}
        />
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="font-medium">Color intensity:</span>
        {['Fewer tasks', '', '', 'More tasks'].map((label, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-5 h-4 rounded ${['bg-slate-100 dark:bg-slate-900', 'bg-slate-200 dark:bg-slate-800', 'bg-slate-400 dark:bg-slate-700', 'bg-slate-600 dark:bg-slate-600'].at(i)}`} />
            {label && <span>{label}</span>}
          </div>
        ))}
        <span className="ml-auto text-[11px] italic">Click any cell to drill down</span>
      </div>

      {/* Heatmap table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {/* Row label header */}
              <th className="px-4 py-3 text-left">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Module</span>
              </th>
              {HEATMAP_COLS.map(col => (
                <th key={col.key} className="px-2 py-3 text-center min-w-[110px]">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${col.headerColor}`}>
                    {col.label}
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {data.map((row, idx) => {
              const isHottest = row.module_id === hottestModuleId && (row.not_started > 0 || row.delayed > 0)
              return (
                <tr
                  key={row.module_id}
                  className={[
                    'transition-colors',
                    idx % 2 === 0 ? 'bg-background' : 'bg-muted/20',
                    isHottest ? 'ring-1 ring-inset ring-amber-300/60' : '',
                  ].join(' ')}
                >
                  {/* Module name cell */}
                  <td className="px-4 py-2 min-w-[180px] max-w-[260px]">
                    <div className="flex items-center gap-2">
                      {isHottest && (
                        <span title="Highest risk module" className="shrink-0">
                          <Zap className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                      )}
                      <div className="min-w-0">
                        {row.module_code && (
                          <p className="text-[10px] font-mono text-muted-foreground leading-none mb-0.5">{row.module_code}</p>
                        )}
                        <p className="text-sm font-medium text-foreground leading-tight truncate">{row.module_name}</p>
                      </div>
                    </div>
                  </td>

                  {/* Status cells */}
                  {HEATMAP_COLS.map(col => (
                    <HeatmapCell
                      key={col.key}
                      count={row[col.key] || 0}
                      col={col}
                      colMax={colMaxes[col.key]}
                      moduleId={row.module_id}
                      moduleName={row.module_name}
                      onDrillDown={setDrilldown}
                    />
                  ))}

                  {/* Row total */}
                  <td className="px-4 py-2 text-center">
                    <span className="text-sm font-bold text-muted-foreground tabular-nums">{row.total}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/* No column-totals footer: In Progress and Delayed totals already
              live in the summary row at the top of the page, and repeating a
              count in two places is what this layout exists to avoid. */}
        </table>
      </div>
    </div>
  )
}

/* ─── Dashboard page ─────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [activityTab, setActivityTab] = useState('all')

  // `silent` keeps the already-rendered dashboard on screen while refetching.
  // My Work calls this after every inline status change; showing the
  // full-page spinner there would make a two-click status change look like a
  // page reload.
  const fetchInto = (silent) => {
    if (!silent) setLoading(true)
    setError(null)
    setAccessDenied(false)
    return fetchDashboard()
      .then(res => { setData(res.data); setLoading(false) })
      .catch((err) => {
        // 007-permission-hardening (FR-010): a 403 mid-session (an
        // assignment revoked, or a preview session ending) is a genuine
        // access-denied state, not a transient failure — show the same
        // AccessDenied experience every other entry point uses, not a
        // generic "try again" error (retrying wouldn't help).
        if (err.response?.status === 403) {
          setAccessDenied(true)
        } else {
          setError('Failed to load dashboard data')
        }
        setLoading(false)
      })
  }

  const load = () => fetchInto(false)
  const refresh = () => fetchInto(true)

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- established data-load-on-mount idiom used throughout this codebase
  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] gap-3 text-muted-foreground">
        <RefreshCw className="h-7 w-7 animate-spin" />
        <p className="text-sm">Loading dashboard…</p>
      </div>
    )
  }

  if (accessDenied) {
    return <AccessDenied message="You do not have access to this resource." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-destructive font-medium">{error}</p>
        <button onClick={load} className="text-sm text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
          Try again
        </button>
      </div>
    )
  }

  const stats            = data?.stats          || {}
  const recentActivities = data?.recent_activities || []
  const moduleHeatmap    = data?.module_heatmap    || []

  const pct             = Math.round(stats.overall_progress || 0)
  const completed       = stats.completed        || 0
  const completedRecent = stats.completed_recent || 0
  const inProgress      = stats.in_progress      || 0
  const delayed         = stats.delayed          || 0
  // The real total, not completed+in_progress+not_started+delayed — that sum
  // silently drops backlog, for_review and blocked tasks, and would disagree
  // with the count in the structure strip at the foot of the page.
  const total           = stats.detailed_activities || 0
  const remaining       = Math.max(total - completed, 0)

  const filteredActivities = activityTab === 'all'
    ? recentActivities
    : recentActivities.filter(a => a.status === activityTab)

  return (
    <div className="space-y-7">

      {/* ── 1. Page title ── */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Overview of your project progress · {total} total tasks tracked
        </p>
      </div>

      {/* ── Summary — four metrics, accomplishment first. Every status
             count on this page appears here and nowhere else. ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Completed"
          value={completedRecent}
          description="In the last 7 days"
          icon={CheckCircle2}
          iconBg="bg-emerald-100 dark:bg-emerald-950/40"
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          title="Overall Progress"
          value={`${pct}%`}
          description={`${remaining} of ${total} tasks remaining`}
          icon={TrendingUp}
          iconBg="bg-violet-100 dark:bg-violet-950/40"
          iconColor="text-violet-600 dark:text-violet-400"
        />
        <StatCard
          title="In Progress"
          value={inProgress}
          description="Currently active"
          icon={Clock}
          iconBg="bg-blue-100 dark:bg-blue-950/40"
          iconColor="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          title="Delayed"
          value={delayed}
          description={delayed === 0 ? 'On track — no delays' : 'Needs immediate attention'}
          icon={AlertCircle}
          iconBg={delayed > 0 ? 'bg-red-100 dark:bg-red-950/40' : 'bg-slate-100 dark:bg-slate-800'}
          iconColor={delayed > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}
        />
      </div>


      {/* ── My Work — the page's only actionable panel, above the heatmap so
             an overdue task is visible without scrolling (SC-003). ── */}
      <MyWorkPanel onTaskMutated={refresh} />

      {/* ── 6. Task Status by Module Heatmap ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Task Status by Module
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  Heatmap
                </span>
              </CardTitle>
              <CardDescription className="mt-1">
                Where should you focus next? Darker cells = more tasks. Click any cell to drill down.
              </CardDescription>
            </div>
            <Link
              to="/work-program"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition-opacity mt-1 shrink-0"
            >
              Open Work Program <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <TaskHeatmap data={moduleHeatmap} />
        </CardContent>
      </Card>

      {/* ── 7. Recent Activities ── */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">Recent Activities</CardTitle>
              <CardDescription className="mt-0.5">Latest task updates across all modules</CardDescription>
            </div>
            <Link to="/work-program" className="flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80 transition-opacity mt-1">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* Status filter tabs */}
          <div role="tablist" aria-label="Filter by status" className="flex items-center gap-1 mt-4 overflow-x-auto pb-1">
            {STATUS_TABS.map(tab => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activityTab === tab.key}
                onClick={() => setActivityTab(tab.key)}
                className={[
                  'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all',
                  activityTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {filteredActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <Circle className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {activityTab === 'all' ? 'No recent activities yet' : `No ${activityTab.replace('_', ' ')} tasks`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filteredActivities.map((activity) => (
                <Link
                  key={activity.id}
                  to="/work-program"
                  className="flex items-center justify-between py-3.5 gap-4 hover:bg-muted/40 rounded-lg px-2 -mx-2 transition-colors group"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {activity.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {activity.module_name}
                      {activity.activity_name && (
                        <> <span className="opacity-50">·</span> {activity.activity_name}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge className={`${getStatusColor(activity.status)} text-xs py-0.5`}>
                      {getStatusLabel(activity.status)}
                    </Badge>
                    <div className="flex items-center gap-2 w-24">
                      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all duration-500"
                          style={{ width: `${activity.progress || 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-7 text-right tabular-nums">
                        {activity.progress || 0}%
                      </span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Structure counts — reference figures, not daily decisions, so one
          quiet line rather than six cards competing with the panels above. */}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{stats.projects || 0} projects</span>
        <span>·</span>
        <span>{stats.modules || 0} modules</span>
        <span>·</span>
        <span>{stats.activities || 0} activities</span>
        <span>·</span>
        <span>{stats.detailed_activities || 0} tasks</span>
        <span>·</span>
        <span>{stats.team_members || 0} team members</span>
        <span>·</span>
        <span>{stats.glossary_terms || 0} glossary terms</span>
      </p>

    </div>
  )
}