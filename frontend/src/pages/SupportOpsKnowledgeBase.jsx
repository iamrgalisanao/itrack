import { useState, useEffect } from 'react'
import { useEffectiveUser } from '@/context/PreviewContext'
import { fetchSupportOpsKnowledgeBase, fetchProjects } from '@/lib/api'
import TaskDetailModal from '@/components/TaskDetailModal'
import SupportIssueExtraFields from '@/components/SupportIssueExtraFields'
import ResolutionExtraFields from '@/components/ResolutionExtraFields'
import {
  BookOpen,
  Search,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const EMPTY_FILTERS = { project_id: '', client_name: '', tenant_name: '', client_priority: '' }
const EMPTY_META = { current_page: 1, last_page: 1, total: 0 }

export default function SupportOpsKnowledgeBase() {
  // 007-permission-hardening: reflects the previewed target during an
  // active preview, not the real Admin — see useEffectiveUser() in
  // context/PreviewContext.jsx.
  const user = useEffectiveUser()
  const userRole = user?.role

  const [results, setResults] = useState([])
  const [meta, setMeta] = useState(EMPTY_META)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [projects, setProjects] = useState([])
  const [selectedIssue, setSelectedIssue] = useState(null)

  const load = async (params = {}) => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetchSupportOpsKnowledgeBase(params)
      setResults(res.data.data ?? [])
      setMeta({
        current_page: res.data.meta?.current_page || 1,
        last_page: res.data.meta?.last_page || 1,
        total: res.data.meta?.total || 0,
      })
    } catch (err) {
      console.error('Failed to load Support Ops knowledge base:', err)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const currentParams = (overrides = {}) => {
    const merged = { q: query, ...filters, page, ...overrides }
    const cleaned = {}
    Object.entries(merged).forEach(([key, val]) => {
      if (val) cleaned[key] = val
    })
    return cleaned
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    load()
    fetchProjects()
      .then((res) => setProjects(res.data || []))
      .catch((err) => console.error('Failed to load projects:', err))
  }, [])

  // A new search or filter change starts back at page 1 — the previous
  // page number may no longer even exist in the narrower result set.
  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    load(currentParams({ page: 1 }))
  }

  const handleFilterChange = (key, value) => {
    const updated = { ...filters, [key]: value }
    setFilters(updated)
    setPage(1)
    load(currentParams({ ...updated, page: 1 }))
  }

  const handlePageChange = (newPage) => {
    setPage(newPage)
    load(currentParams({ page: newPage }))
  }

  // US3 (FR-009/FR-009a): reuse the same issue detail view already used
  // elsewhere in the app, opened read-only — this feature never mutates the
  // historical record it searches (FR-010). See TaskDetailModal's readOnly
  // prop and research.md's corrected "full original context" decision.
  const openIssueDetail = (issue) => {
    setSelectedIssue({ ...issue })
  }

  const closeIssueDetail = () => {
    setSelectedIssue(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/60 pb-5">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search previously resolved Support Ops issues to find how a similar problem was solved before.
          </p>
        </div>
      </div>

      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by client, tenant, symptom, root cause, or resolution..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/95 transition-all"
        >
          Search
        </button>
      </form>

      {/* Filters — each narrows independently of a keyword, and combines with
          it as AND, never widening the result set (FR-006/FR-006a) */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 items-end bg-muted/20 p-3 rounded-lg border border-border/80 text-xs">
        <div className="space-y-1">
          <label htmlFor="kb-filter-project" className="font-semibold">Project</label>
          <select
            id="kb-filter-project"
            value={filters.project_id}
            onChange={(e) => handleFilterChange('project_id', e.target.value)}
            className="w-full text-xs rounded-md border border-border bg-card px-2 py-1 text-foreground focus:outline-none"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="kb-filter-client" className="font-semibold">Client</label>
          <input
            id="kb-filter-client"
            type="text"
            value={filters.client_name}
            onChange={(e) => handleFilterChange('client_name', e.target.value)}
            placeholder="Exact client name"
            className="w-full text-xs rounded-md border border-border bg-card px-2 py-1 text-foreground focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="kb-filter-tenant" className="font-semibold">Tenant</label>
          <input
            id="kb-filter-tenant"
            type="text"
            value={filters.tenant_name}
            onChange={(e) => handleFilterChange('tenant_name', e.target.value)}
            placeholder="Exact tenant name"
            className="w-full text-xs rounded-md border border-border bg-card px-2 py-1 text-foreground focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="kb-filter-priority" className="font-semibold">Priority</label>
          <select
            id="kb-filter-priority"
            value={filters.client_priority}
            onChange={(e) => handleFilterChange('client_priority', e.target.value)}
            className="w-full text-xs rounded-md border border-border bg-card px-2 py-1 text-foreground focus:outline-none"
          >
            <option value="">All Priorities</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-100 gap-3 text-muted-foreground">
          <Clock className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm font-medium">Loading knowledge base...</span>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center min-h-100 gap-3 text-center border border-destructive/40 rounded-xl bg-destructive/5 p-8">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-semibold text-destructive">Couldn't load the knowledge base.</p>
          <button
            type="button"
            onClick={() => load(currentParams())}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted text-foreground transition-all"
          >
            Try again
          </button>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No matching resolved issues found.
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((issue) => (
            <div
              key={issue.id}
              onClick={() => openIssueDetail(issue)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openIssueDetail(issue)
                }
              }}
              aria-label={`Open full context for: ${issue.name}`}
              className="p-4 rounded-lg border border-border/60 bg-card text-foreground cursor-pointer hover:shadow-md hover:border-border/80 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  {issue.client_priority && (
                    <Badge variant="outline" className="text-[10px]">{issue.client_priority}</Badge>
                  )}
                  <p className="text-sm font-semibold leading-snug">{issue.name}</p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  Resolved {new Date(issue.updated_at).toLocaleDateString()}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {issue.client_name}
                {issue.tenant_name ? ` · ${issue.tenant_name}` : ''}
                {issue.project?.name ? ` · ${issue.project.name}` : ''}
              </p>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-0.5">Root Cause</p>
                  <p className="line-clamp-3">{issue.root_cause}</p>
                </div>
                <div>
                  <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] mb-0.5">Resolution</p>
                  <p className="line-clamp-3">{issue.resolution}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !loadError && results.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Showing {results.length} of {meta.total} matching issues
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={meta.current_page <= 1}
              onClick={() => handlePageChange(meta.current_page - 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>
              Page {meta.current_page} of {meta.last_page}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={meta.current_page >= meta.last_page}
              onClick={() => handlePageChange(meta.current_page + 1)}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Full original context (FR-009/FR-009a) — the same modal used
          elsewhere in the app, opened read-only (FR-010): no save, no
          comment/upload/delete affordance anywhere in it. See
          TaskDetailModal's readOnly prop. */}
      {selectedIssue && (
        <TaskDetailModal
          task={selectedIssue}
          onClose={closeIssueDetail}
          userRole={userRole}
          eyebrowLabel="Issue Detail"
          readOnly
          supportFields={(form, setForm, readOnly) => (
            <SupportIssueExtraFields
              key={selectedIssue.id}
              form={form}
              setForm={setForm}
              selectedIssue={selectedIssue}
              onRecordClientUpdate={() => {}}
              showToast={() => {}}
              readOnly={readOnly}
            />
          )}
          resolutionFields={(form, setForm, readOnly) => (
            <ResolutionExtraFields
              key={selectedIssue.id}
              form={form}
              setForm={setForm}
              selectedIssue={selectedIssue}
              showToast={() => {}}
              readOnly={readOnly}
            />
          )}
        />
      )}
    </div>
  )
}
