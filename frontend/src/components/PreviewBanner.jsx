import { usePreview } from '@/context/PreviewContext'
import { Button } from '@/components/ui/button'
import { Eye, X } from 'lucide-react'

/**
 * 007-permission-hardening: a persistent, always-visible bar while an Admin
 * is previewing as another user — and a brief dismissible notice when the
 * server has ended that preview out from under them (target disabled,
 * role-changed, or expired), so it's never silently confusing.
 */
export default function PreviewBanner() {
  const { isPreviewing, target, endedReason, endPreview, dismissEndedNotice } = usePreview()

  if (endedReason) {
    return (
      <div className="flex items-center justify-between gap-3 bg-destructive/15 text-destructive border-b border-destructive/30 px-4 py-2 text-sm">
        <span>Preview session ended — {endedReason}.</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={dismissEndedNotice}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  if (!isPreviewing) {
    return null
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-primary/10 text-primary border-b border-primary/30 px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        <span>
          Previewing as <strong>{target?.name}</strong> ({target?.role}) — read-only, all writes are disabled.
        </span>
      </div>
      <Button variant="outline" size="sm" onClick={endPreview}>
        End Preview
      </Button>
    </div>
  )
}
