// 007-permission-hardening: sessionStorage-backed preview-session state.
// sessionStorage (not localStorage) deliberately — preview is a transient,
// read-only verification tool; a closed tab should leave no lingering
// client-side preview flag (research.md). The server-side expiry
// (preview_sessions.expires_at) is always the real enforcement; this is
// only what lets the banner survive a page reload within the same tab.

const STORAGE_KEY = 'itrack.previewSession'

export function getPreviewSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setPreviewSession({ token, target, expiresAt }) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, target, expiresAt }))
}

export function clearPreviewSession() {
  sessionStorage.removeItem(STORAGE_KEY)
}

export function getPreviewToken() {
  return getPreviewSession()?.token ?? null
}
