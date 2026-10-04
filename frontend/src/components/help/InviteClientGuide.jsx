import { useEffect, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward, MousePointer2, Shield, Settings, MailPlus, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const STEP_MS = 6500

/* Each scene mimics the real screen (labels match ProjectClientAccessPanel,
   WorkProgram and ClientMembershipReviewQueue) so the guide stays honest. */

function Cursor({ from, to, delay = 0.4 }) {
  return (
    <MousePointer2
      aria-hidden="true"
      className="help-cursor absolute h-5 w-5 fill-foreground text-background drop-shadow z-10"
      style={{
        '--from-x': `${from[0]}px`, '--from-y': `${from[1]}px`,
        '--to-x': `${to[0]}px`, '--to-y': `${to[1]}px`,
        top: 0, left: 0, animationDelay: `${delay}s`,
      }}
    />
  )
}

function SceneOpen() {
  return (
    <div className="relative h-full">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
        <div className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm">Acme Rollout Program</div>
        <div className="grid h-9 w-9 place-items-center rounded-md border border-border"><Settings className="h-4 w-4" /></div>
        <div className="help-ring grid h-9 w-9 place-items-center rounded-md border border-primary bg-primary/10" style={{ animationDelay: '1.4s' }}>
          <Shield className="h-4 w-4 text-primary" />
        </div>
      </div>
      <div className="help-fade-up mt-4 rounded-lg border border-border bg-card p-4 shadow-lg" style={{ animationDelay: '1.6s' }}>
        <p className="font-bold">Client Access</p>
        <p className="text-xs text-muted-foreground">Invitations, memberships, and pending client access reviews for this project.</p>
      </div>
      <Cursor from={[40, 110]} to={[372, 12]} />
    </div>
  )
}

function SceneForm() {
  return (
    <div className="relative h-full">
      <div className="rounded-lg border border-border bg-card p-4 shadow-lg">
        <p className="mb-3 font-bold">Client Access</p>
        <div className="grid grid-cols-[1.4fr_1fr_auto] gap-2 text-sm">
          <div className="rounded-md border border-input px-3 py-2">
            <span className="help-type" style={{ animationDelay: '0.4s' }}>lena@acme-client.com</span>
          </div>
          <div className="help-fade-up rounded-md border border-input px-3 py-2" style={{ animationDelay: '2s' }}>Contributor</div>
          <div className="help-press inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-semibold text-primary-foreground" style={{ animationDelay: '3.2s' }}>
            <MailPlus className="h-4 w-4" />Invite
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Roles: Viewer · Contributor · Client Admin</p>
      </div>
      <Cursor from={[20, 120]} to={[400, 62]} delay={2.6} />
    </div>
  )
}

function SceneSent() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="mb-2 grid grid-cols-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Invitation</span><span>Role</span><span>State</span><span>Expires</span>
      </div>
      <div className="help-fade-up grid grid-cols-4 items-center border-t border-border pt-3 text-sm" style={{ animationDelay: '0.3s' }}>
        <div><p className="font-medium">lena@acme-client.com</p><p className="text-xs text-muted-foreground">acme-client.com</p></div>
        <span className="text-xs">client_contributor</span>
        <span><Badge variant="secondary">pending</Badge></span>
        <span className="text-xs text-muted-foreground">in 7 days</span>
      </div>
      <p className="help-fade-up mt-4 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground" style={{ animationDelay: '1.2s' }}>
        Inviting the same email again replaces the earlier link; only the newest one works.
      </p>
    </div>
  )
}

function SceneAccept() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-lg">
      <p className="font-bold">Accept project invitation</p>
      <div className="help-fade-up mt-3 rounded-md border border-input px-3 py-2 text-sm" style={{ animationDelay: '0.3s' }}>lena@acme-client.com</div>
      <div className="help-fade-up mt-3 flex items-center gap-2 text-sm" style={{ animationDelay: '1.6s' }}>
        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>
        Email matches, so the invitation is accepted
      </div>
      <p className="help-fade-up mt-3 text-xs text-muted-foreground" style={{ animationDelay: '2.6s' }}>
        A different email address is refused, even with a valid link.
      </p>
    </div>
  )
}

function SceneApprove() {
  return (
    <div className="relative h-full">
      <div className="rounded-lg border border-border bg-card p-4 shadow-lg">
        <p className="mb-3 font-bold">Pending review</p>
        <div className="flex items-center justify-between gap-3 text-sm">
          <div><p className="font-medium">Lena · Contributor</p><p className="text-xs text-muted-foreground">Acme Rollout Program</p></div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="help-fade-up" style={{ animationDelay: '0s' }}>pending</Badge>
            <span className="help-press rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground" style={{ animationDelay: '2s' }}>Approve</span>
            <span className="rounded-md border border-border px-3 py-1 text-xs font-semibold">Reject</span>
          </div>
        </div>
        <div className="help-fade-up mt-4 flex items-center gap-2 text-sm" style={{ animationDelay: '2.6s' }}>
          <Badge variant="success">approved</Badge> Lena can now open the project.
        </div>
      </div>
      <Cursor from={[120, 120]} to={[320, 52]} delay={1.2} />
    </div>
  )
}

const STEPS = [
  { title: 'Open Client Access', Scene: SceneOpen,
    body: 'In Work Program, pick the project, then click the shield icon next to the gear. The icon only appears if you can manage client access on that project, and the project must be linked to a client organization.' },
  { title: 'Enter the email and role', Scene: SceneForm,
    body: 'Type the client user’s email, choose Viewer, Contributor or Client Admin, and click Invite.' },
  { title: 'Track the invitation', Scene: SceneSent,
    body: 'After you click Invite, copy the invitation link and send it to the client. It is shown only once. The invitation is pending in the Invitations table and expires after 7 days. Re-inviting the same email revokes the old link.' },
  { title: 'The client accepts', Scene: SceneAccept,
    body: 'The client opens the link, signs in with the same email address you invited (they need an iTrack account), and clicks Accept invitation. Any other account is refused.' },
  { title: 'Approve the membership', Scene: SceneApprove,
    body: 'If the organization auto-approves a verified email domain, access is granted immediately. Otherwise the membership waits as pending until an Admin or Project Manager approves it.' },
]

export default function InviteClientGuide() {
  const [step, setStep] = useState(0)
  const [reduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [playing, setPlaying] = useState(!reduced)

  useEffect(() => {
    if (!playing) return undefined
    const id = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS)
    return () => clearTimeout(id)
  }, [playing, step])

  const { Scene, title, body } = STEPS[step]
  const go = (n) => setStep((n + STEPS.length) % STEPS.length)

  return (
    <section aria-label="Animated guide: invite a client user" className="rounded-xl border border-border bg-muted/20 p-4 md:p-6">
      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div aria-hidden="true" className="min-h-64 rounded-lg bg-background p-4 overflow-hidden">
          <Scene key={step} />
        </div>
        <div className="flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
          <h3 className="mt-1 text-xl font-bold">{title}</h3>
          <p className="mt-2 text-sm leading-relaxed" aria-live="polite">{body}</p>
          <ol className="mt-4 space-y-1">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={`w-full rounded-md px-2 py-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${i === step ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {i + 1}. {s.title}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button size="icon" variant="outline" onClick={() => go(step - 1)} aria-label="Previous step"><SkipBack className="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause animation' : 'Play animation'}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button size="icon" variant="outline" onClick={() => go(step + 1)} aria-label="Next step"><SkipForward className="h-4 w-4" /></Button>
        <div className="ml-2 flex flex-1 gap-1" aria-hidden="true">
          {STEPS.map((s, i) => <span key={s.title} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-border'}`} />)}
        </div>
      </div>
    </section>
  )
}
