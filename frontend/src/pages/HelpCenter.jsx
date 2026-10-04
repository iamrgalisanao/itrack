import { useState } from 'react'
import { LifeBuoy, Search, UserPlus } from 'lucide-react'
import InviteClientGuide from '@/components/help/InviteClientGuide'

const ARTICLES = [
  {
    id: 'invite-client-users',
    title: 'Invite client users to a project',
    summary: 'Give a client contact access to one project, from invitation to approval.',
    keywords: 'client invitation access membership viewer contributor client admin approve',
    icon: UserPlus,
    Body: InviteClientGuide,
    notes: [
      'Who can invite: Admins, Project Managers who own (or share) the project, and Client Admins already approved on it.',
      'Roles: Viewer reads, Contributor can also work on items the project allows, Client Admin can also invite and manage other client users.',
      'Invitation states you may see: pending, approved, rejected, expired, suspended, removed.',
    ],
  },
]

export default function HelpCenter() {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(ARTICLES[0].id)
  const q = query.trim().toLowerCase()
  const shown = ARTICLES.filter((a) => !q || `${a.title} ${a.summary} ${a.keywords}`.toLowerCase().includes(q))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-border pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <LifeBuoy aria-hidden="true" className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Help Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">Step-by-step guides for working in iTrack.</p>
        </div>
      </div>

      <div role="search" className="relative max-w-lg">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guides..."
          aria-label="Search guides"
          className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <p role="status" className={shown.length === 0 ? 'py-12 text-center text-sm text-muted-foreground' : 'sr-only'}>
        {shown.length === 0 ? 'No guides match your search.' : `${shown.length} ${shown.length === 1 ? 'guide' : 'guides'} found`}
      </p>
      {shown.map(({ id, title, summary, icon: Icon, Body, notes }) => (
        <article key={id} className="space-y-4">
          <h2>
            <button
              type="button"
              onClick={() => setOpenId(openId === id ? null : id)}
              aria-expanded={openId === id}
              aria-controls={`help-panel-${id}`}
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-xs font-normal text-muted-foreground">{summary}</span>
              </span>
            </button>
          </h2>
          {openId === id && (
            <div id={`help-panel-${id}`} className="space-y-4">
              <Body />
              <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
                {notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
