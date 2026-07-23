import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { fetchTodayDashboard, updateDetailedActivity } from '@/lib/api'
import TaskDetailModal from '@/components/TaskDetailModal'
import SupportIssueExtraFields from '@/components/SupportIssueExtraFields'
import {
  Sunrise,
  AlertTriangle,
  Clock,
  MessagesSquare,
  BookOpen,
  CheckCircle2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// One entry per response bucket (contracts/today-dashboard-api.md). Order
// here is also display order — Stale first (most urgent), Learning last
// (least time-sensitive — spec.md's Assumptions).
const SECTIONS = [
  {
    key: 'stale',
    title: 'Stale',
    description: 'Past their update threshold — respond to these first.',
    icon: AlertTriangle,
    accent: 'border-t-destructive/60 bg-destructive/5',
    emptyHint: 'Nothing stale right now.',
  },
  {
    key: 'watch_closely',
    title: 'P1 — Watch Closely',
    description: 'P1 issues not yet stale — one delay away from breaching.',
    icon: Clock,
    accent: 'border-t-amber-500 bg-amber-500/5',
    emptyHint: 'No P1 issues approaching their threshold.',
  },
  {
    key: 'waiting_for_client',
    title: 'Waiting for Client',
    description: "Blocked or delayed on the client's side.",
    icon: MessagesSquare,
    accent: 'border-t-blue-500 bg-blue-500/5',
    emptyHint: 'Nothing waiting on a client right now.',
  },
  {
    key: 'learning_priorities',
    title: 'Learning Priorities',
    description: 'Open upskilling entries, alongside today’s support triage.',
    icon: BookOpen,
    accent: 'border-t-emerald-500 bg-emerald-500/5',
    emptyHint: 'No open learning priorities.',
  },
]

export default function TodayDashboard() {
  const { user } = useAuth()
  const userRole = user?.role

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [toast, setToast] = useState(null)
  const [selectedIssue, setSelectedIssue] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // FR-010: a dashboard-level load failure is shown as one error, never as
  // four empty-looking sections that could be mistaken for "nothing's
  // urgent today."
  const loadDashboard = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetchTodayDashboard()
      setData(res.data)
    } catch (err) {
      console.error('Failed to load Today dashboard:', err)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    loadDashboard()
  }, [])

  const openIssueDetail = (issue) => {
    setSelectedIssue({ ...issue })
  }

  const closeIssueDetail = () => {
    setSelectedIssue(null)
  }

  // Unlike SupportOps.jsx's single flat list, an edit here can move an issue
  // into a different section entirely (e.g. status -> blocked moves it into
  // Waiting for Client) — classification is server-side only (FR-003), so
  // the correct move is to re-fetch and re-classify, never to patch the
  // bucket arrays in place client-side.
  const handleIssueSave = async (formData) => {
    try {
      await updateDetailedActivity(formData.id, formData)
      showToast('Issue updated')
      await loadDashboard()
    } catch (err) {
      console.error('Failed to save issue:', err)
      showToast('Failed to save issue', 'error')
      return false
    }
  }

  const recordClientUpdate = async (issueId, setForm) => {
    const now = new Date().toISOString()
    try {
      const res = await updateDetailedActivity(issueId, { last_client_update_at: now })
      const updated = res.data?.data ?? res.data
      setForm((prev) => ({ ...prev, last_client_update_at: updated?.last_client_update_at ?? now }))
      showToast('Client update recorded')
      loadDashboard()
    } catch (err) {
      console.error('Failed to record client update:', err)
      showToast('Failed to record client update', 'error')
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
      <div className="flex items-center gap-3 border-b border-border/60 pb-5">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
          <Sunrise className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Today</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Urgent support triage and learning priorities, aggregated across every project you can access.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-100 gap-3 text-muted-foreground">
          <Clock className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm font-medium">Loading today's priorities...</span>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center min-h-100 gap-3 text-center border border-destructive/40 rounded-xl bg-destructive/5 p-8">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-semibold text-destructive">Couldn't load today's dashboard.</p>
          <button
            type="button"
            onClick={loadDashboard}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted text-foreground transition-all"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map((section) => {
            const items = data?.[section.key] ?? []
            const Icon = section.icon
            return (
              <div key={section.key} className={`rounded-xl border border-border/60 border-t-4 ${section.accent} bg-card shadow-sm`}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-foreground" />
                    <span className="font-bold text-sm text-foreground">{section.title}</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-bold">
                      {items.length}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:inline">{section.description}</span>
                </div>

                <div className="p-3">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">{section.emptyHint}</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {items.map((issue) => (
                        <div
                          key={issue.id}
                          onClick={() => openIssueDetail(issue)}
                          className="p-3 rounded-lg border border-border/60 bg-background text-foreground cursor-pointer hover:shadow-md hover:border-border/80 transition-all duration-150"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              {issue.client_priority && (
                                <Badge variant="outline" className="text-[10px]">{issue.client_priority}</Badge>
                              )}
                            </div>
                            {issue.client_name && (
                              <span className="text-[10px] text-muted-foreground truncate">{issue.client_name}</span>
                            )}
                          </div>
                          <p className="text-sm font-semibold leading-snug">{issue.name}</p>
                          <p className="text-[11px] text-muted-foreground mt-1 truncate">{issue.project?.name}</p>
                          {section.key === 'stale' && issue.overdue_since && (
                            <p className="text-[11px] font-semibold text-destructive mt-1">
                              Overdue since {new Date(issue.overdue_since).toLocaleString()}
                            </p>
                          )}
                          {issue.next_action && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              Next: {issue.next_action}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Issue Detail Modal — shared with Kanban/Support Ops, see
          TaskDetailModal.jsx. Read-only for edit fields where the user's
          role already restricts it everywhere else (FR-008) — this page
          itself has no inline editing controls of its own (FR-012). */}
      {selectedIssue && (
        <TaskDetailModal
          task={selectedIssue}
          onClose={closeIssueDetail}
          onSave={handleIssueSave}
          userRole={userRole}
          eyebrowLabel="Issue Detail"
          extraFields={(form, setForm) => (
            <SupportIssueExtraFields
              key={selectedIssue.id}
              form={form}
              setForm={setForm}
              selectedIssue={selectedIssue}
              onRecordClientUpdate={recordClientUpdate}
              showToast={showToast}
            />
          )}
        />
      )}
    </div>
  )
}
