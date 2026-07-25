import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

/**
 * 007-permission-hardening (FR-010): the one access-denied experience used
 * everywhere — previously duplicated 3x across KanbanGuard/SupportOpsGuard/
 * AdminGuard in App.jsx (route-level denials), and now also used inline by
 * pages that lose access to a specific project mid-session (a project
 * assignment revoked, or a preview session ending) rather than falling
 * back to a generic toast.
 */
export default function AccessDenied({
  title = 'Access Denied',
  message = 'You do not have access to this resource.',
  showReturnLink = true,
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] border border-border/85 rounded-xl p-8 text-center bg-card shadow-sm max-w-lg mx-auto mt-12">
      <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-4">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6">{message}</p>
      {showReturnLink && (
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Return to Dashboard
        </Link>
      )}
    </div>
  )
}
