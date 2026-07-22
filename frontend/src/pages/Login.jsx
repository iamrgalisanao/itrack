import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Already logged in → bounce back to wherever they were headed
  if (user) return <Navigate to={location.state?.from?.pathname ?? '/'} replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate(location.state?.from?.pathname ?? '/', { replace: true })
    } catch (err) {
      if (!err.response) {
        // No response at all: network failure or the backend is unreachable,
        // not a credentials problem — don't tell the user their password is wrong.
        setError('Unable to reach the server — check your connection and try again.')
      } else if (err.response.status >= 500) {
        // A response came back, but it's a server-side failure (e.g. the
        // database is unreachable) rather than a rejected credential check —
        // still not a "wrong password" situation.
        setError('Something went wrong on the server — please try again shortly.')
      } else {
        setError(err.response.data?.errors?.email?.[0] || err.response.data?.message || 'Invalid credentials')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-sm p-8 space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary">
            <span className="text-base font-black text-primary-foreground">i</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">iTrack</h1>
          <p className="text-sm text-muted-foreground">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium text-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}