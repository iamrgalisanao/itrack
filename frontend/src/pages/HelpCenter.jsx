import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertTriangle } from 'lucide-react'
import { useEffectiveUser } from '@/context/PreviewContext'
import { resolveGuideKey } from '@/lib/helpGuides'

import adminGuide from '@/content/help-guides/admin.md?raw'
import projectManagerGuide from '@/content/help-guides/project-manager.md?raw'
import departmentHeadGuide from '@/content/help-guides/department-head.md?raw'
import teamMemberGuide from '@/content/help-guides/team-member.md?raw'
import clientViewerGuide from '@/content/help-guides/client-viewer.md?raw'
import clientContributorGuide from '@/content/help-guides/client-contributor.md?raw'
import clientAdminGuide from '@/content/help-guides/client-admin.md?raw'

// 012-help-center — one bundled markdown string per guide key (see
// lib/helpGuides.js's GUIDE_KEYS). Vite's `?raw` import inlines the file's
// text content at build time; nothing here is fetched over the network.
const GUIDES = {
  admin: adminGuide,
  'project-manager': projectManagerGuide,
  'department-head': departmentHeadGuide,
  'team-member': teamMemberGuide,
  'client-viewer': clientViewerGuide,
  'client-contributor': clientContributorGuide,
  'client-admin': clientAdminGuide,
}

// US3/FR-005: every guide's markdown references its screenshots as
// `images/foo.png` — a path that's meaningful next to the source .md file,
// but not a real URL once the text is inlined as a raw string. Vite's
// import.meta.glob gives us the real, hashed, Vite-processed URL for every
// screenshot up front; filenames are unique across all seven guides (no
// two guides share an images/ subfolder), so a flat basename lookup is
// enough — no per-guide namespacing needed.
const IMAGE_URLS = Object.fromEntries(
  Object.entries(import.meta.glob('@/content/help-guides/images/*.png', { eager: true, import: 'default' }))
    .map(([path, url]) => [path.split('/').pop(), url])
)

function resolveImageSrc(src) {
  if (!src) return src
  const basename = src.split('/').pop()
  return IMAGE_URLS[basename] ?? src
}

const MARKDOWN_COMPONENTS = {
  h1: ({ children }) => <h1 className="text-2xl font-bold tracking-tight mb-2">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold mt-8 mb-3 pb-2 border-b border-border">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-semibold mt-6 mb-2">{children}</h3>,
  p: ({ children }) => <p className="text-sm leading-relaxed mb-4 text-foreground">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1.5 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1.5 text-sm">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children, ...props }) => (
    <a href={href} className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity" {...props}>
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  code: ({ children }) => <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{children}</code>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-4">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4 rounded-md border border-border">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="bg-muted px-3 py-2 text-left font-medium border-b border-border">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border-b border-border">{children}</td>,
  img: ({ src, alt }) => (
    <img src={resolveImageSrc(src)} alt={alt} className="rounded-lg border border-border shadow-sm my-4 max-w-full h-auto" />
  ),
  hr: () => <hr className="my-8 border-border" />,
}

/**
 * FR-010: resolveGuideKey() and the GUIDES lookup both run directly in the
 * render path on every render — no memoization, no cached state — so a
 * role or membership change is picked up the next time this page opens.
 */
export default function HelpCenter() {
  const effectiveUser = useEffectiveUser()
  const guideKey = resolveGuideKey(effectiveUser ?? {})
  const markdown = guideKey ? GUIDES[guideKey] : null

  if (!markdown) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">Help Center is unavailable</h1>
        <p className="text-sm text-muted-foreground max-w-md text-center">
          We couldn't determine which guide to show for your account. Try signing out and back in, or contact your administrator if this continues.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Help Center</h1>
        <p className="text-muted-foreground mt-1">Documentation for your role in iTrack</p>
      </div>
      <div className="max-w-3xl">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  )
}
