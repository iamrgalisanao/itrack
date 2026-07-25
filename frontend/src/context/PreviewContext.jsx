import { createContext, useContext, useState, useEffect } from 'react'
import { startPreview as apiStartPreview, endPreview as apiEndPreview, setPreviewEndedHandler } from '@/lib/api'
import { getPreviewSession, setPreviewSession, clearPreviewSession } from '@/lib/previewSession'

const PreviewContext = createContext(null)

const ENDED_REASON_LABELS = {
  expired: 'expired',
  target_disabled: "the previewed user's account was disabled",
  target_role_changed: "the previewed user's role changed",
  not_found: 'ended',
}

export function PreviewProvider({ children }) {
  const [session, setSession] = useState(() => getPreviewSession())
  const [endedReason, setEndedReason] = useState(null)

  // A 409 from any request means the server has already ended this preview
  // (research.md — validated server-side before any controller runs, never
  // trusted from stale client state). Clear local state and surface why.
  useEffect(() => {
    setPreviewEndedHandler((reason) => {
      clearPreviewSession()
      setSession(null)
      setEndedReason(ENDED_REASON_LABELS[reason] ?? 'ended')
    })
    return () => setPreviewEndedHandler(null)
  }, [])

  const startPreview = async (targetUser) => {
    const res = await apiStartPreview(targetUser.id)
    const data = res.data.data || res.data
    const next = { token: data.token, target: data.target, expiresAt: data.expires_at }
    setPreviewSession(next)
    setSession(next)
    setEndedReason(null)
  }

  const endPreview = async () => {
    try {
      await apiEndPreview()
    } finally {
      clearPreviewSession()
      setSession(null)
    }
  }

  const dismissEndedNotice = () => setEndedReason(null)

  return (
    <PreviewContext.Provider
      value={{
        isPreviewing: !!session,
        target: session?.target ?? null,
        endedReason,
        startPreview,
        endPreview,
        dismissEndedNotice,
      }}
    >
      {children}
    </PreviewContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its PreviewProvider, standard React context convention
export function usePreview() {
  const ctx = useContext(PreviewContext)
  if (!ctx) throw new Error('usePreview must be used within PreviewProvider')
  return ctx
}
