import { useState, useEffect, useRef } from 'react'
import { fetchComments, createComment, deleteComment } from '@/lib/api'
import {
  MessageSquare,
  Lock,
  Globe,
  Trash2,
  Send,
  AlertTriangle,
  Loader2,
  User,
} from 'lucide-react'

/**
 * TaskComments — Self-contained comment panel for a Detailed Activity (task).
 *
 * Props:
 *   taskId        {number}   The detailed_activity_id to scope comments to.
 *   userRole      {string}   Current mock role (e.g. 'Project Manager', 'Client').
 *   onCountChange {function} Callback(count) invoked after comment create/delete
 *                            so the parent tab badge can update.
 */
export default function TaskComments({ taskId, userRole, onCountChange }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Form state
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState('internal') // default: Internal
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState(null)
  const [bodyError, setBodyError] = useState(null)

  // Delete feedback
  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const bottomRef = useRef(null)

  const isClient = userRole === 'Client'
  const canDelete = userRole === 'Admin' || userRole === 'Project Manager' || userRole === 'Team Member'

  // Load comments on mount or when taskId changes
  useEffect(() => {
    if (!taskId) return
    loadComments()
  }, [taskId])

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    if (!loading && comments.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [comments.length, loading])

  const loadComments = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchComments(taskId)
      const list = res.data || []
      setComments(list)
      onCountChange?.(list.length)
    } catch (err) {
      console.error('Failed to load comments:', err)
      setError('Failed to load comments. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBodyError(null)
    setPostError(null)

    const trimmed = body.trim()
    if (!trimmed) {
      setBodyError('Comment cannot be empty.')
      return
    }
    if (trimmed.length > 5000) {
      setBodyError('Comment must not exceed 5,000 characters.')
      return
    }

    setPosting(true)
    try {
      const res = await createComment(taskId, { body: trimmed, visibility })
      const newComment = res.data
      const updated = [...comments, newComment]
      setComments(updated)
      onCountChange?.(updated.length)
      setBody('')
      setVisibility('internal') // reset to safe default
    } catch (err) {
      console.error('Failed to post comment:', err)
      setPostError(err.response?.data?.message || 'Failed to post comment. Please try again.')
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (commentId) => {
    setDeletingId(commentId)
    setDeleteError(null)
    try {
      await deleteComment(commentId)
      const updated = comments.filter((c) => c.id !== commentId)
      setComments(updated)
      onCountChange?.(updated.length)
    } catch (err) {
      console.error('Failed to delete comment:', err)
      setDeleteError(err.response?.data?.message || 'Could not delete comment.')
    } finally {
      setDeletingId(null)
    }
  }

  // Helper: initials avatar from author name
  const getInitials = (name = '') =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()

  // Format timestamps
  const formatTime = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Visibility badge
  const VisibilityBadge = ({ vis }) => {
    if (vis === 'client_visible') {
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wide">
          <Globe className="h-2.5 w-2.5" />
          Client-visible
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20 uppercase tracking-wide">
        <Lock className="h-2.5 w-2.5" />
        Internal
      </span>
    )
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-xs font-medium">Loading comments...</span>
      </div>
    )
  }

  // ── Error loading ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <p className="text-sm font-semibold text-destructive">{error}</p>
        <button
          onClick={loadComments}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Comment Thread ───────────────────────────────────────────────── */}
      <div className="space-y-3 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border/60 rounded-xl text-center bg-muted/10">
            <MessageSquare className="h-7 w-7 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">
              {isClient ? 'No client-visible comments yet.' : 'No comments yet. Add the first internal note for this task.'}
            </p>
          </div>
        ) : (
          comments.map((comment) => {
            const isDeletingThis = deletingId === comment.id
            const canDeleteThis =
              (userRole === 'Admin' || userRole === 'Project Manager') ||
              (userRole === 'Team Member' && comment.author_role === userRole)

            return (
              <div
                key={comment.id}
                className={`group flex gap-3 p-3 rounded-xl border transition-colors ${
                  comment.visibility === 'internal'
                    ? 'bg-slate-500/5 border-slate-500/15 dark:bg-slate-800/20'
                    : 'bg-emerald-500/5 border-emerald-500/15 dark:bg-emerald-950/20'
                }`}
              >
                {/* Avatar */}
                <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-extrabold text-primary shrink-0 mt-0.5">
                  {getInitials(comment.author)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs font-bold text-foreground">{comment.author}</span>
                    {/* Only show Internal badge to non-client users */}
                    {!isClient && <VisibilityBadge vis={comment.visibility} />}
                    {isClient && comment.visibility === 'client_visible' && (
                      <VisibilityBadge vis={comment.visibility} />
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {formatTime(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">
                    {comment.body}
                  </p>
                </div>

                {/* Delete */}
                {canDeleteThis && !isClient && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    disabled={isDeletingThis}
                    aria-label="Delete comment"
                    title="Delete comment"
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all shrink-0 mt-0.5 disabled:opacity-40"
                  >
                    {isDeletingThis ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            )
          })
        )}
        {deleteError && (
          <p className="text-xs text-destructive text-center font-semibold">{deleteError}</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Comment Input Form (hidden for Clients) ───────────────────────── */}
      {!isClient ? (
        <form onSubmit={handleSubmit} className="border-t border-border/60 pt-4 space-y-3">
          {/* Textarea */}
          <div className="space-y-1">
            <textarea
              rows={3}
              value={body}
              onChange={(e) => {
                setBody(e.target.value)
                if (bodyError) setBodyError(null)
              }}
              placeholder="Add a comment or internal note..."
              maxLength={5000}
              className={`w-full text-sm rounded-lg border bg-background text-foreground px-3 py-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary transition-colors ${
                bodyError ? 'border-destructive focus:ring-destructive' : 'border-border'
              }`}
            />
            <div className="flex items-center justify-between">
              {bodyError ? (
                <p className="text-[10px] text-destructive font-semibold">{bodyError}</p>
              ) : (
                <span className="text-[10px] text-muted-foreground">Max 5,000 characters</span>
              )}
              <span className="text-[10px] text-muted-foreground">{body.length}/5000</span>
            </div>
          </div>

          {/* Visibility Selector + Submit */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-muted/60 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setVisibility('internal')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                  visibility === 'internal'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Lock className="h-3 w-3" />
                Internal
              </button>
              <button
                type="button"
                onClick={() => setVisibility('client_visible')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                  visibility === 'client_visible'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Globe className="h-3 w-3" />
                Client-visible
              </button>
            </div>

            <button
              type="submit"
              disabled={posting || !body.trim()}
              className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {posting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Posting...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Post
                </>
              )}
            </button>
          </div>

          {postError && (
            <p className="text-xs text-destructive font-semibold flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {postError}
            </p>
          )}
        </form>
      ) : (
        <div className="border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground text-center italic">
            Clients can view comments but cannot post. Contact your project manager for updates.
          </p>
        </div>
      )}
    </div>
  )
}
