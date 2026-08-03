import { useState, useEffect } from 'react'
import { useEffectiveUser } from '@/context/PreviewContext'
import {
  fetchProjects,
  fetchRetroSessions,
  createRetroSession,
  updateRetroSession,
  fetchRetroSession,
  createRetroEntry,
  updateRetroEntry,
  deleteRetroEntry,
  toggleRetroVote,
  fetchRetroEntryComments,
  createRetroEntryComment,
  fetchRetroEntryAttachments,
  uploadRetroEntryAttachment,
  deleteRetroEntryAttachment,
  downloadRetroEntryAttachment,
} from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  MessageSquareQuote,
  MessageSquareText,
  Plus,
  ThumbsUp,
  Pencil,
  Trash2,
  UserCog,
  AlertTriangle,
  ChevronDown,
  Repeat,
  Paperclip,
  Download,
  Send,
} from 'lucide-react'
import { GROUP_ACCENT_CLASSES } from '@/components/GroupSummaryBar'

const SENTIMENTS = [
  { id: 'keep', label: 'Keep', color: 'border-t-emerald-500 bg-emerald-500/5' },
  { id: 'improve', label: 'Improve', color: 'border-t-amber-500 bg-amber-500/5' },
  { id: 'discuss', label: 'Discuss', color: 'border-t-primary/60 bg-primary/5' },
]

// 014-retro-table-view Phase 7/FR-002: Type is a per-row column, not a
// grouping axis — this looks up the Type badge's color per entry.sentiment.
const SENTIMENT_BADGE_CLASSES = {
  keep: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  improve: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  discuss: 'border-primary/40 bg-primary/10 text-primary',
}

export default function Retrospectives() {
  // FR-006/US4: reads the effective (previewed, when applicable) user, same
  // as every other internal-only page — see App.jsx's route wiring pattern.
  const user = useEffectiveUser()
  const canWrite = user?.role === 'Admin' || user?.role === 'Project Manager' || user?.role === 'Team Member'
  const canModerateAny = user?.role === 'Admin' || user?.role === 'Project Manager'

  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [sessions, setSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState(null)
  const [sessionDetail, setSessionDetail] = useState(null) // { session, entries }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [isNewEntryOpen, setIsNewEntryOpen] = useState(false)
  const [newEntryBody, setNewEntryBody] = useState('')

  const [editingEntry, setEditingEntry] = useState(null)
  const [editBody, setEditBody] = useState('')

  // 014-retro-table-view Phase 7/FR-001,FR-003: the session is the only
  // group — one collapsible table, not one per sentiment. Starts expanded.
  const [isTableOpen, setIsTableOpen] = useState(true)

  // 014-retro-table-view Phase 8/FR-016,FR-017: inline session rename —
  // "New Session" creates instantly (research.md D9), name is edited here.
  const [isEditingSessionLabel, setIsEditingSessionLabel] = useState(false)
  const [sessionLabelDraft, setSessionLabelDraft] = useState('')

  // 015-retro-entry-context: per-entry detail (Comments/Files tabs + Decision)
  const [viewingEntry, setViewingEntry] = useState(null)
  const [entryComments, setEntryComments] = useState([])
  const [entryAttachments, setEntryAttachments] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [newCommentBody, setNewCommentBody] = useState('')
  const [isEditingDecision, setIsEditingDecision] = useState(false)
  const [decisionDraft, setDecisionDraft] = useState('')
  const [uploading, setUploading] = useState(false)

  // 015-retro-entry-context/T018: the page's shared `loading` flag briefly
  // flips to `false` on mount (loadSessionDetail(null) fires before any
  // real data has loaded, since selectedSessionId starts null) — the
  // deep-link effect needs its own "sessions actually fetched" signal
  // instead of reusing that flag, or it clears the ?session= param during
  // that spurious early window before sessions ever populate.
  const [sessionsLoaded, setSessionsLoaded] = useState(false)

  // ─── Load projects ───────────────────────────────────────────────────────

  useEffect(() => {
    fetchProjects()
      .then((res) => {
        const list = res.data.data || res.data
        setProjects(list)
        if (list.length > 0) setSelectedProjectId(list[0].id)
        else setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to fetch projects:', err)
        setError('Failed to load projects.')
        setLoading(false)
      })
  }, [])

  // ─── Load sessions for the selected project (US1, US5) ──────────────────

  const loadSessions = (projectId) => {
    if (!projectId) return
    setLoading(true)
    fetchRetroSessions(projectId)
      .then((res) => {
        const list = res.data.data || res.data
        setSessions(list)
        setSelectedSessionId(list.length > 0 ? list[0].id : null)
        if (list.length === 0) setLoading(false)
        setSessionsLoaded(true)
      })
      .catch((err) => {
        console.error('Failed to load retro sessions:', err)
        setError('Failed to load retro sessions.')
        setLoading(false)
        setSessionsLoaded(true)
      })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    if (selectedProjectId) loadSessions(selectedProjectId)
  }, [selectedProjectId])

  // ─── Deep link ?session={id} (015-retro-entry-context, US1/T018) ────────
  // Mirrors Kanban.jsx's existing ?task={id} handling — a mention
  // notification links here; without this, the link lands on the page but
  // never selects the mentioned session (speckit-analyze finding I1).
  useEffect(() => {
    if (!sessionsLoaded) return
    const queryParams = new URLSearchParams(window.location.search)
    const sessionIdParam = queryParams.get('session')
    if (sessionIdParam) {
      const sessionId = parseInt(sessionIdParam, 10)
      if (sessions.some((s) => s.id === sessionId)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the selected session to a deep-linked ?session= query param, not a data load
        setSelectedSessionId(sessionId)
      }
      queryParams.delete('session')
      const newSearch = queryParams.toString()
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '')
      window.history.replaceState({}, document.title, newUrl)
    }
  }, [sessions, sessionsLoaded])

  // ─── Load the active session's entries (US1) ─────────────────────────────

  const loadSessionDetail = (sessionId) => {
    if (!sessionId) {
      setSessionDetail(null)
      setLoading(false)
      return
    }
    setLoading(true)
    fetchRetroSession(sessionId)
      .then((res) => setSessionDetail(res.data))
      .catch((err) => {
        console.error('Failed to load retro session:', err)
        setError('Failed to load this retro session.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    loadSessionDetail(selectedSessionId)
  }, [selectedSessionId])

  // ─── Create session (US1, US4) ──────────────────────────────────────────
  // 014-retro-table-view Phase 8/FR-015: no label prompt — creates
  // immediately with a fixed default name (research.md D9), renamed inline.

  const handleCreateSession = async () => {
    if (!selectedProjectId) return
    try {
      const res = await createRetroSession(selectedProjectId, 'New Session')
      const created = res.data.data || res.data
      loadSessions(selectedProjectId)
      setSelectedSessionId(created.id)
    } catch (err) {
      console.error('Failed to create retro session:', err)
      setError('Failed to create retro session.')
    }
  }

  // ─── Rename session (US4) ────────────────────────────────────────────────

  const startEditingSessionLabel = () => {
    setSessionLabelDraft(sessionDetail.session.label)
    setIsEditingSessionLabel(true)
  }

  const handleRenameSession = async () => {
    const trimmed = sessionLabelDraft.trim()
    if (!trimmed || trimmed === sessionDetail.session.label) {
      setIsEditingSessionLabel(false)
      return
    }
    try {
      await updateRetroSession(sessionDetail.session.id, trimmed)
      setIsEditingSessionLabel(false)
      loadSessions(selectedProjectId)
      loadSessionDetail(selectedSessionId)
    } catch (err) {
      console.error('Failed to rename retro session:', err)
      setError('Failed to rename session.')
    }
  }

  // ─── Add entry (US1, US2, US5) ───────────────────────────────────────────
  // 014-retro-table-view Phase 8/FR-018: no Type picker — entries start
  // with no Type; Type is assigned afterward from the table (US5).

  const handleAddEntry = async (e) => {
    e.preventDefault()
    if (!newEntryBody.trim() || !selectedSessionId) return
    try {
      await createRetroEntry(selectedSessionId, newEntryBody.trim())
      setNewEntryBody('')
      setIsNewEntryOpen(false)
      loadSessionDetail(selectedSessionId)
    } catch (err) {
      console.error('Failed to add retro entry:', err)
      setError('Failed to add entry.')
    }
  }

  // ─── Set Type from the table (US5) ───────────────────────────────────────
  // Same permission surface as body edits (canModerateEntry) — the Type
  // <select> is only rendered for permitted users in the first place.

  const handleSetSentiment = async (entryId, sentiment) => {
    try {
      await updateRetroEntry(entryId, { sentiment })
      loadSessionDetail(selectedSessionId)
    } catch (err) {
      console.error('Failed to set entry type:', err)
      setError('Failed to update the entry type.')
    }
  }

  // ─── Vote (US3) ────────────────────────────────────────────────────────────

  const handleVote = async (entryId) => {
    try {
      await toggleRetroVote(entryId)
      loadSessionDetail(selectedSessionId)
    } catch (err) {
      console.error('Failed to toggle vote:', err)
    }
  }

  // ─── Repeating flag (014-retro-table-view/US2) ──────────────────────────────
  // Uses the same author-or-Admin/PM permission surface as body/sentiment
  // edits (canModerateEntry, defined below) — never the broader
  // owner-assignment permission. See contracts/retrospectives-table-view-api.md.

  const handleToggleRepeating = async (entry) => {
    try {
      await updateRetroEntry(entry.id, { is_repeating: !entry.is_repeating })
      loadSessionDetail(selectedSessionId)
    } catch (err) {
      console.error('Failed to toggle repeating flag:', err)
      setError('Failed to update the repeating flag.')
    }
  }

  // ─── Owner assignment (US4) ────────────────────────────────────────────────

  const handleAssignOwner = async (entryId, ownerId) => {
    try {
      await updateRetroEntry(entryId, { owner_user_id: ownerId })
      loadSessionDetail(selectedSessionId)
    } catch (err) {
      console.error('Failed to assign owner:', err)
      setError('Failed to assign owner.')
    }
  }

  // ─── Edit / delete (FR-007) ─────────────────────────────────────────────────

  const openEdit = (entry) => {
    setEditingEntry(entry)
    setEditBody(entry.body)
  }

  // 014-retro-table-view Phase 8: sentiment/Type is no longer edited here —
  // only from the table's Type cell (US5), so this dialog only sends body.
  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editingEntry) return
    try {
      await updateRetroEntry(editingEntry.id, { body: editBody })
      setEditingEntry(null)
      loadSessionDetail(selectedSessionId)
    } catch (err) {
      console.error('Failed to update entry:', err)
      setError('Failed to update entry.')
    }
  }

  const handleDeleteEntry = async (entryId) => {
    try {
      await deleteRetroEntry(entryId)
      loadSessionDetail(selectedSessionId)
    } catch (err) {
      console.error('Failed to delete entry:', err)
      setError('Failed to delete entry.')
    }
  }

  const canModerateEntry = (entry) => canModerateAny || entry.author_id === user?.id

  // ─── Entry detail: Comments, Files, Decision (015-retro-entry-context) ──

  const openEntryDetail = (entry) => {
    setViewingEntry(entry)
    setIsEditingDecision(false)
    setDetailLoading(true)
    Promise.all([fetchRetroEntryComments(entry.id), fetchRetroEntryAttachments(entry.id)])
      .then(([commentsRes, attachmentsRes]) => {
        setEntryComments(commentsRes.data.data || commentsRes.data)
        setEntryAttachments(attachmentsRes.data.data || attachmentsRes.data)
      })
      .catch((err) => {
        console.error('Failed to load entry detail:', err)
        setError('Failed to load entry detail.')
      })
      .finally(() => setDetailLoading(false))
  }

  const closeEntryDetail = () => {
    setViewingEntry(null)
    setEntryComments([])
    setEntryAttachments([])
    setNewCommentBody('')
  }

  const handlePostComment = async (e) => {
    e.preventDefault()
    if (!newCommentBody.trim() || !viewingEntry) return
    try {
      const res = await createRetroEntryComment(viewingEntry.id, newCommentBody.trim())
      const created = res.data.data || res.data
      setEntryComments((prev) => [...prev, created])
      setNewCommentBody('')
    } catch (err) {
      console.error('Failed to post comment:', err)
      setError('Failed to post comment.')
    }
  }

  const handleUploadAttachment = async (file) => {
    if (!file || !viewingEntry) return
    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    try {
      const res = await uploadRetroEntryAttachment(viewingEntry.id, formData)
      const created = res.data.data || res.data
      setEntryAttachments((prev) => [...prev, created])
    } catch (err) {
      console.error('Failed to upload attachment:', err)
      setError('Failed to upload attachment — check the file type and size.')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAttachment = async (attachmentId) => {
    try {
      await deleteRetroEntryAttachment(attachmentId)
      setEntryAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
    } catch (err) {
      console.error('Failed to delete attachment:', err)
      setError('Failed to delete attachment.')
    }
  }

  const canDeleteAttachment = (attachment) => canModerateAny || attachment.uploader_id === user?.id

  // 015-retro-entry-context/US3, FR-013: same author-or-Admin/PM permission
  // surface as body/sentiment edits — reuses canModerateEntry.
  const handleSaveDecision = async () => {
    if (!viewingEntry) return
    try {
      const res = await updateRetroEntry(viewingEntry.id, { decision: decisionDraft })
      const updated = res.data.data || res.data
      setViewingEntry((prev) => ({ ...prev, decision: updated.decision }))
      setIsEditingDecision(false)
      loadSessionDetail(selectedSessionId)
    } catch (err) {
      console.error('Failed to save decision:', err)
      setError('Failed to save decision.')
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  // Taskboard-style accent color, cycling by the selected session's position
  // in the list — restyle-only per product decision (Retrospectives shows
  // one session at a time via the pill selector above, not stacked groups
  // like Taskboard/Bug Tracker, so there's no per-group segmented summary
  // bar here, just the shared accent-bar/chevron visual language).
  const sessionIndex = Math.max(0, sessions.findIndex((s) => s.id === selectedSessionId))
  const sessionAccent = GROUP_ACCENT_CLASSES[sessionIndex % GROUP_ACCENT_CLASSES.length]

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-destructive font-medium">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
            <MessageSquareQuote className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Retrospectives</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Continuous team feedback, organized by session — separate from Work Program.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project:</span>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="rounded-lg border border-border bg-card text-sm font-medium px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-sm min-w-60"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {canWrite && (
            <Button type="button" onClick={handleCreateSession} disabled={!selectedProjectId}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Session
            </Button>
          )}
        </div>
      </div>

      {/* Session list (US5) */}
      {sessions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSessionId(s.id)}
              className={[
                'rounded-full px-4 py-1.5 text-sm font-medium border transition-colors',
                s.id === selectedSessionId
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground',
              ].join(' ')}
            >
              {s.label}
              <span className="ml-1.5 opacity-70">({s.entry_count})</span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center min-h-[200px] text-sm text-muted-foreground">
          Loading...
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 border border-dashed border-border rounded-xl">
          <MessageSquareQuote className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No retro sessions yet for this project.</p>
          {canWrite && (
            <Button type="button" size="sm" onClick={handleCreateSession}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create the first session
            </Button>
          )}
        </div>
      )}

      {!loading && sessionDetail && (
        <>
          <div className="flex items-center justify-end">
            {canWrite && (
              <Button type="button" size="sm" variant="outline" onClick={() => setIsNewEntryOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Entry
              </Button>
            )}
          </div>

          {/* 014-retro-table-view Phase 7/FR-001–FR-003: the session itself
              is the group — one collapsible table holding every entry
              regardless of sentiment, with Type as a per-row column.
              Replaces the prior side-by-side Kanban lane layout and the
              since-superseded three-sentiment-groups layout. */}
          <Collapsible open={isTableOpen} onOpenChange={setIsTableOpen}>
            <div className="relative rounded-xl border border-border/60 shadow-sm overflow-hidden">
              <span className={`absolute inset-y-0 left-0 w-1 pointer-events-none ${sessionAccent.bar}`} aria-hidden="true" />
              {/* CollapsibleTrigger wraps only the chevron — the label and
                  its rename button are siblings, not nested, since a
                  <button> cannot validly contain another <button>. */}
              <div className="flex w-full items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30">
                <div className={`flex items-center gap-2 text-sm font-semibold ${sessionAccent.label}`}>
                  <CollapsibleTrigger asChild>
                    <button type="button" aria-label={isTableOpen ? 'Collapse session' : 'Expand session'}>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isTableOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </CollapsibleTrigger>
                  {isEditingSessionLabel ? (
                    // 014-retro-table-view Phase 8/FR-016,FR-017: inline rename
                    <input
                      autoFocus
                      value={sessionLabelDraft}
                      onChange={(e) => setSessionLabelDraft(e.target.value)}
                      onBlur={handleRenameSession}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleRenameSession() }
                        if (e.key === 'Escape') setIsEditingSessionLabel(false)
                      }}
                      className="rounded border border-primary bg-background px-1.5 py-0.5 text-sm font-semibold focus:outline-none"
                    />
                  ) : canWrite ? (
                    <button
                      type="button"
                      onClick={startEditingSessionLabel}
                      className="text-left hover:underline decoration-dotted underline-offset-4"
                    >
                      {sessionDetail.session.label}
                    </button>
                  ) : (
                    <span>{sessionDetail.session.label}</span>
                  )}
                </div>
                <Badge variant="secondary">{sessionDetail.entries.length}</Badge>
              </div>
              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feedback</TableHead>
                      <TableHead>Submitter</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Repeating?</TableHead>
                      <TableHead>Vote</TableHead>
                      <TableHead>Owner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessionDetail.entries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                          No entries yet
                        </TableCell>
                      </TableRow>
                    )}
                    {sessionDetail.entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <span className="text-sm">{entry.body}</span>
                            <span className="flex items-center gap-1 shrink-0 ml-auto pl-2">
                              {/* 015-retro-entry-context: opens Comments/Files/Decision detail — visible to every viewer, not just moderators */}
                              <button type="button" onClick={() => openEntryDetail(entry)} className="text-muted-foreground hover:text-foreground" aria-label="View comments and files">
                                <MessageSquareText className="h-3.5 w-3.5" />
                              </button>
                              {canModerateEntry(entry) && (
                                <>
                                  <button type="button" onClick={() => openEdit(entry)} className="text-muted-foreground hover:text-foreground" aria-label="Edit entry">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" onClick={() => handleDeleteEntry(entry.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete entry">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{entry.author}</TableCell>
                        <TableCell>
                          {canModerateEntry(entry) ? (
                            // 014-retro-table-view Phase 8/US5/FR-019: Type
                            // is set/changed here, from the table — never in
                            // the Add Entry or Edit Entry forms. A blank
                            // (null) sentiment shows as a disabled placeholder
                            // that can be selected away from but not back to,
                            // matching the backend's one-directional rule
                            // (research.md D7 — never re-cleared via update).
                            <select
                              value={entry.sentiment || ''}
                              onChange={(e) => handleSetSentiment(entry.id, e.target.value)}
                              className={`text-xs rounded-md border px-1.5 py-1 focus:outline-none ${entry.sentiment ? SENTIMENT_BADGE_CLASSES[entry.sentiment] : 'border-border bg-background text-muted-foreground'}`}
                            >
                              {!entry.sentiment && <option value="" disabled>Select type…</option>}
                              {SENTIMENTS.map((s) => (
                                <option key={s.id} value={s.id}>{s.label}</option>
                              ))}
                            </select>
                          ) : entry.sentiment ? (
                            <Badge variant="outline" className={SENTIMENT_BADGE_CLASSES[entry.sentiment]}>
                              {SENTIMENTS.find((s) => s.id === entry.sentiment)?.label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {canModerateEntry(entry) ? (
                            // 014-retro-table-view/US2, FR-007: toggle is only
                            // rendered for the same author-or-Admin/PM set
                            // gating body/sentiment edits (canModerateEntry) —
                            // never for a plain canWrite() Team Member.
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap">
                              <Checkbox
                                checked={entry.is_repeating}
                                onCheckedChange={() => handleToggleRepeating(entry)}
                                aria-label="Toggle repeating"
                              />
                              {entry.is_repeating && (
                                <span className="flex items-center gap-1 text-amber-600">
                                  <Repeat className="h-3.5 w-3.5" /> Repeating
                                </span>
                              )}
                            </label>
                          ) : entry.is_repeating ? (
                            <span className="flex items-center gap-1 text-xs text-amber-600 whitespace-nowrap">
                              <Repeat className="h-3.5 w-3.5" /> Repeating
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {canWrite ? (
                            <button
                              type="button"
                              onClick={() => handleVote(entry.id)}
                              className={[
                                'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium border transition-colors',
                                entry.voted_by_me
                                  ? 'bg-primary/10 text-primary border-primary/40'
                                  : 'text-muted-foreground border-border hover:text-foreground',
                              ].join(' ')}
                            >
                              <ThumbsUp className="h-3 w-3" /> {entry.vote_count}
                            </button>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <ThumbsUp className="h-3 w-3" /> {entry.vote_count}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {canWrite ? (
                            // Owner candidates are the session's own entry authors
                            // plus the signed-in user — there's no canWrite()-
                            // accessible "list this project's internal users"
                            // endpoint today (GET /project-assignments is
                            // Admin/PM-only). The backend independently validates
                            // the chosen owner actually has project access
                            // (FR-006), so this list is a convenience shortlist,
                            // not the source of truth for who's assignable.
                            <select
                              value={entry.owner_id || ''}
                              onChange={(e) => handleAssignOwner(entry.id, e.target.value ? Number(e.target.value) : null)}
                              className="text-xs rounded-md border border-border bg-background px-1.5 py-1 text-muted-foreground focus:outline-none"
                            >
                              <option value="">No owner</option>
                              {[...(sessionDetail.entries || []).map((e) => ({ id: e.author_id, name: e.author })), { id: user?.id, name: `${user?.name} (you)` }]
                                .filter((u, idx, arr) => u.id && arr.findIndex((x) => x.id === u.id) === idx)
                                .map((u) => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                              {entry.owner ? (<><UserCog className="h-3 w-3" /> {entry.owner}</>) : '—'}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </div>
          </Collapsible>

          {/* 014-retro-table-view/US3, FR-009/FR-011/FR-014: read-only,
              visible to every role that can view the session (including
              Department Head, who has no other interactive control here).
              Repeating tally is computed client-side (research.md D6) —
              no backend field, since sessionDetail.entries is already
              fully loaded. */}
          {sessionDetail.vote_summary && (
            <div className="flex items-center gap-6 rounded-lg border border-border/60 bg-card px-4 py-2.5 text-xs font-medium text-muted-foreground">
              <span>Total votes: {sessionDetail.vote_summary.total_votes}</span>
              <span>Total voters: {sessionDetail.vote_summary.total_voters}</span>
              <span>
                Repeating: {sessionDetail.entries.filter((e) => e.is_repeating).length}/{sessionDetail.entries.length}
              </span>
            </div>
          )}
        </>
      )}

      {/* New Entry dialog — 014-retro-table-view Phase 8/FR-018: no Type
          picker; Type is assigned afterward from the table (US5). */}
      <Dialog open={isNewEntryOpen} onOpenChange={setIsNewEntryOpen}>
        <DialogContent>
          <DialogTitle>Add Insight</DialogTitle>
          <DialogDescription>Record something worth discussing — any time, not just during the retro meeting.</DialogDescription>
          <form onSubmit={handleAddEntry} className="space-y-4">
            <textarea
              autoFocus
              value={newEntryBody}
              onChange={(e) => setNewEntryBody(e.target.value)}
              placeholder="What happened?"
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsNewEntryOpen(false)}>Cancel</Button>
              <Button type="submit">Add Entry</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Entry Detail dialog — Decision, Comments, Files (015-retro-entry-context) */}
      <Dialog open={!!viewingEntry} onOpenChange={(open) => !open && closeEntryDetail()}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Entry Detail</DialogTitle>
          <DialogDescription className="text-sm text-foreground">{viewingEntry?.body}</DialogDescription>

          {/* Decision — visually separate from the Feedback text above (FR-012) */}
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Decision</span>
            {isEditingDecision ? (
              <div className="space-y-2">
                <textarea
                  autoFocus
                  value={decisionDraft}
                  onChange={(e) => setDecisionDraft(e.target.value)}
                  className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="What did the team decide?"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={handleSaveDecision}>Save</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setIsEditingDecision(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                {viewingEntry?.decision ? (
                  <p className="text-sm">{viewingEntry.decision}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No decision recorded yet</p>
                )}
                {viewingEntry && canModerateEntry(viewingEntry) && (
                  <button
                    type="button"
                    onClick={() => { setDecisionDraft(viewingEntry.decision || ''); setIsEditingDecision(true) }}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label="Edit decision"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <Tabs defaultValue="comments">
            <TabsList>
              <TabsTrigger value="comments">Comments ({entryComments.length})</TabsTrigger>
              <TabsTrigger value="files">Files ({entryAttachments.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="comments" className="space-y-3">
              {detailLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
              <div className="max-h-64 overflow-y-auto space-y-2">
                {!detailLoading && entryComments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No comments yet</p>
                )}
                {entryComments.map((comment) => (
                  <div key={comment.id} className="rounded-md border border-border/60 bg-card p-2.5 text-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span className="font-medium text-foreground">{comment.author}</span>
                    </div>
                    {comment.body}
                  </div>
                ))}
              </div>
              {canWrite && (
                <form onSubmit={handlePostComment} className="flex gap-2">
                  <input
                    value={newCommentBody}
                    onChange={(e) => setNewCommentBody(e.target.value)}
                    placeholder="Add a comment… (mention a role with @Project Manager, @Team Member, etc.)"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <Button type="submit" size="sm"><Send className="h-3.5 w-3.5" /></Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="files" className="space-y-3">
              {detailLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
              <div className="max-h-64 overflow-y-auto space-y-2">
                {!detailLoading && entryAttachments.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No files yet</p>
                )}
                {entryAttachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-center justify-between rounded-md border border-border/60 bg-card p-2.5 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{attachment.original_name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">({attachment.human_size})</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => downloadRetroEntryAttachment(attachment.id, attachment.original_name)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Download file"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      {canDeleteAttachment(attachment) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(attachment.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Delete file"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {canWrite && (
                <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground cursor-pointer hover:border-primary hover:text-foreground">
                  <Paperclip className="h-3.5 w-3.5" />
                  {uploading ? 'Uploading…' : 'Attach a file'}
                  <input
                    type="file"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      handleUploadAttachment(file)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEntryDetail}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entry dialog — body only; Type is edited from the table (US5) */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent>
          <DialogTitle>Edit Entry</DialogTitle>
          <DialogDescription>Only the author or an Admin/Project Manager can edit or delete an entry.</DialogDescription>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <textarea
              autoFocus
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingEntry(null)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
