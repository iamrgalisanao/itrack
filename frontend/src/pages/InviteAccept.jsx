import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { acceptProjectInvitation } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Clock, MailCheck, XCircle } from 'lucide-react'

export default function InviteAccept() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')
  const { user } = useAuth()
  const [state, setState] = useState({ status: 'idle' })
  const headingRef = useRef(null)

  // The panel is swapped on success, which would otherwise drop focus and
  // say nothing; moving focus to the new heading announces the outcome.
  useEffect(() => {
    if (state.status === 'done' || state.status === 'error') headingRef.current?.focus()
  }, [state.status])

  // Accepting is an explicit click, not on page load, so a link previewer or
  // a refresh can't consume the single-use token by accident.
  const accept = async () => {
    if (state.status === 'submitting') return
    setState({ status: 'submitting' })
    try {
      const res = await acceptProjectInvitation(token)
      const membership = res.data?.data ?? res.data
      setState({ status: 'done', membershipState: membership?.state })
      // The token is spent; drop it from the address bar and history entry so
      // it can't be copied, bookmarked or read back from history.
      navigate('/invitations/accept', { replace: true })
    } catch (err) {
      setState({
        status: 'error',
        message: err.response?.data?.message || 'Something went wrong. Please try again.',
      })
    }
  }

  let content
  if (state.status !== 'done' && !token) {
    content = (
      <Panel headingRef={headingRef} icon={XCircle} tone="text-destructive" title="Invitation link is incomplete">
        <p className="text-sm text-muted-foreground">This link has no invitation token. Ask the person who invited you to send it again.</p>
      </Panel>
    )
  } else if (state.status === 'done') {
    const approved = state.membershipState === 'approved'
    content = (
      <Panel
        icon={approved ? CheckCircle2 : Clock}
        tone={approved ? 'text-primary' : 'text-muted-foreground'}
        title={approved ? 'You now have access' : 'Invitation accepted, awaiting approval'}
      >
        <p className="text-sm text-muted-foreground">
          {approved
            ? 'The project is available in your workspace.'
            : 'An Admin or Project Manager needs to approve your access before the project appears.'}
        </p>
        <Button asChild className="mt-4"><Link to="/work-program">Go to Work Program</Link></Button>
      </Panel>
    )
  } else {
    content = (
      <Panel headingRef={headingRef} icon={MailCheck} tone="text-primary" title="Accept project invitation">
        <p className="text-sm text-muted-foreground">
          You are signed in as <strong className="text-foreground">{user?.email}</strong>. The invitation only works for the
          email address it was sent to.
        </p>
        {state.status === 'error' && <p role="alert" className="mt-3 text-sm text-destructive">{state.message}</p>}
        <Button className="mt-4" onClick={accept} aria-disabled={state.status === 'submitting'}>
          {state.status === 'submitting' ? 'Accepting...' : 'Accept invitation'}
        </Button>
      </Panel>
    )
  }

  return <div className="mx-auto max-w-md pt-10">{content}</div>
}

function Panel({ headingRef, icon: Icon, tone, title, children }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <Icon className={`h-8 w-8 ${tone}`} aria-hidden="true" />
      <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-xl font-bold focus:outline-none">{title}</h1>
      <div className="mt-2">{children}</div>
    </div>
  )
}
