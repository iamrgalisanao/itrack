import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
  Columns3,
  BookOpen,
  Users,
  Settings,
  HelpCircle,
  ChevronRight,
  Menu,
  X,
  TrendingUp,
  Sun,
  Moon,
  Calendar,
  BarChart3,
  ShieldCheck,
  LogOut,
  MessagesSquare,
  Sunrise,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import { fetchDashboard } from '@/lib/api'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import Dashboard from './pages/Dashboard'
import WorkProgram from './pages/WorkProgram'
import ProjectAccess from './pages/ProjectAccess'
import Glossary from './pages/Glossary'
import Team from './pages/Team'
import Kanban from './pages/Kanban'
import Schedule from './pages/Schedule'
import Reports from './pages/Reports'
import Admin from './pages/Admin'
import SupportOps from './pages/SupportOps'
import TodayDashboard from './pages/TodayDashboard'
import SupportOpsKnowledgeBase from './pages/SupportOpsKnowledgeBase'
import Login from './pages/Login'
import HelpCenter from './pages/HelpCenter'
import NotificationBell from './components/NotificationBell'
import RequireAuth from './components/RequireAuth'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PreviewProvider, useEffectiveUser } from './context/PreviewContext'
import PreviewBanner from './components/PreviewBanner'
import AccessDenied from './components/AccessDenied'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    const root = window.document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'))
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its ThemeProvider, matches this codebase's context convention
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

/* ─── Nav items shared by sidebar + mobile drawer ─────────────────────────────
   Grouped by task frequency/audience, not alphabetically or by add-order:
   - Workspace: the daily task-flow loop, visible to everyone.
   - Team Ops: internal execution views — invisible to Clients entirely, so
     the whole group disappears rather than leaving a partially-filtered list.
     "Today" and "Knowledge Base" are nested sub-views of Support Ops
     (subItems, not flat peers), rendered indented beneath it.
   - Insights: read-heavy reference/reporting material, checked not worked in.
   - People & Admin: lowest-frequency, roster/account administration. */
const NAV_GROUPS = [
  {
    label: 'Workspace',
    items: [
      { path: '/',             label: 'Dashboard',     icon: LayoutDashboard },
      { path: '/work-program', label: 'Work Program',  icon: FolderKanban },
      { path: '/schedule',     label: 'Schedule View', icon: Calendar },
    ],
  },
  {
    label: 'Team Ops',
    items: [
      { path: '/kanban',      label: 'Kanban Board', icon: Columns3, internalOnly: true },
      {
        path: '/support-ops', label: 'Support Ops', icon: MessagesSquare, internalOnly: true,
        subItems: [
          { path: '/support-ops/today', label: 'Today', icon: Sunrise },
          { path: '/support-ops/knowledge-base', label: 'Knowledge Base', icon: Library },
        ],
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      { path: '/reports',  label: 'Reports & Health', icon: BarChart3 },
      { path: '/glossary', label: 'Glossary',         icon: BookOpen },
    ],
  },
  {
    label: 'People & Admin',
    items: [
      { path: '/team',  label: 'Team',        icon: Users },
      { path: '/admin', label: 'Admin Panel', icon: ShieldCheck, adminOnly: true },
    ],
  },
]

function isNavItemVisible(item, userRole) {
  if (item.internalOnly && userRole === 'Client') return false
  if (item.adminOnly && userRole !== 'Admin') return false
  return true
}

/* ─── Overall-progress mini-card (sidebar) ─────────────────────────────────── */
function ProgressSnapshot() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetchDashboard()
      .then(res => setStats(res.data?.stats || {}))
      .catch(() => {})
  }, [])

  const pct       = Math.round(stats?.overall_progress || 0)
  const total     = (stats?.completed || 0) + (stats?.in_progress || 0) + (stats?.not_started || 0) + (stats?.delayed || 0)
  const completed = stats?.completed || 0

  // Color ramp: green ≥70%, amber ≥30%, red <30%
  const barColor  = pct >= 70 ? 'bg-emerald-500' : pct >= 30 ? 'bg-amber-500' : 'bg-primary'

  return (
    <div className="mx-3 mb-2 rounded-xl border border-border/60 bg-muted/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="rounded-md bg-primary/10 p-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-xs font-semibold text-foreground">Overall Progress</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold leading-none">{pct}%</span>
        <span className="text-[10px] text-muted-foreground">{completed} / {total} tasks</span>
      </div>
      {/* Custom colored progress track */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ─── A single nav row, optionally tooltip-wrapped when the rail is collapsed ─
   Tooltips only exist in collapsed mode — the label is already on-screen in
   expanded mode, so a duplicate hover tooltip there would just be noise. */
function SidebarNavLink({ path, label, icon: Icon, groupLabel, collapsed, indent = false }) {
  const location = useLocation()
  const isActive = location.pathname === path

  const link = (
    <Link
      to={path}
      className={[
        'relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium',
        'transition-all duration-150 group',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
        collapsed ? 'justify-center px-0' : indent ? 'pl-8 pr-3' : 'px-3',
      ].join(' ')}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
      )}
      <Icon className={['h-4 w-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'].join(' ')} />
      {!collapsed && <span>{label}</span>}
      {!collapsed && isActive && (
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-primary/60" />
      )}
    </Link>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {groupLabel}
        </span>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/* ─── Grouped nav shared by the desktop sidebar (collapsible) and the mobile
   drawer (always expanded) ─────────────────────────────────────────────── */
function SidebarNavGroups({ collapsed, userRole }) {
  return (
    <>
      {NAV_GROUPS.map((group, groupIndex) => {
        const items = group.items.filter(item => isNavItemVisible(item, userRole))
        if (!items.length) return null
        return (
          <div
            key={group.label}
            className={collapsed && groupIndex > 0 ? 'mt-3 pt-3 border-t border-border/60' : 'mt-0.5'}
          >
            {!collapsed && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-3 mb-1.5">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map(item => (
                <div key={item.path}>
                  <SidebarNavLink {...item} groupLabel={group.label} collapsed={collapsed} />
                  {item.subItems && isNavItemVisible(item, userRole) && item.subItems.map((subItem) => (
                    <SidebarNavLink key={subItem.path} {...subItem} groupLabel={item.label} collapsed={collapsed} indent />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

/* ─── Sidebar (desktop persistent + icon-only rail) ────────────────────────── */
function Sidebar({ collapsed, onToggleCollapsed }) {
  const { theme, setTheme, toggleTheme } = useTheme()
  // 007-permission-hardening: two distinct identities are needed here on
  // purpose — do not collapse them. authUser is the real signed-in Admin,
  // used ONLY for "Signed in as" + Sign Out, and must never reflect the
  // previewed target. effectiveUser is the previewed target while
  // previewing (else authUser) — drives nav visibility so it matches what
  // KanbanGuard/AdminGuard/SupportOpsGuard actually allow. See
  // useEffectiveUser() in context/PreviewContext.jsx.
  const { user: authUser, logout } = useAuth()
  const effectiveUser = useEffectiveUser()
  const userRole = effectiveUser?.role

  return (
    <aside
      className={[
        'hidden md:flex flex-col h-screen sticky top-0 border-r border-border bg-card',
        'transition-all duration-300 ease-in-out shrink-0',
        collapsed ? 'w-[72px]' : 'w-[260px]',
      ].join(' ')}
    >
      {/* Brand + collapse toggle */}
      <div className={['border-b border-border/60 px-4 py-4', collapsed ? 'px-2' : ''].join(' ')}>
        <div className={['flex items-center gap-3', collapsed ? 'flex-col gap-2' : 'justify-between'].join(' ')}>
          <div className={['flex items-center gap-3 overflow-hidden', collapsed ? 'justify-center' : ''].join(' ')}>
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary shrink-0">
              <span className="text-sm font-black text-primary-foreground">i</span>
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <p className="text-base font-bold leading-none tracking-tight">Track</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Project Workspace</p>
              </div>
            )}
          </div>
          <button
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        <SidebarNavGroups collapsed={collapsed} userRole={userRole} />
      </nav>

      {/* Progress snapshot — only in full sidebar */}
      {!collapsed && (
        <div className="border-t border-border/60 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-5 mb-2">
            Project Status
          </p>
          <ProgressSnapshot />
        </div>
      )}

      {/* Account */}
      {!collapsed && authUser && (
        <div className="border-t border-border/60 py-3 px-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Signed in as
          </p>
          <p className="text-xs font-medium text-foreground truncate">{authUser.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{authUser.role}</p>
        </div>
      )}

      {/* Footer links */}
      <div className={['border-t border-border/60 py-3 px-2 space-y-0.5', collapsed ? '' : ''].join(' ')}>
        {/* 012-help-center: "Help Center" is the only entry here with a real
            destination — it navigates to /help. "Settings" has no route yet
            and stays an inert stub, unchanged. */}
        {[{ icon: Settings, label: 'Settings' }, { icon: HelpCircle, label: 'Help Center', path: '/help' }].map(({ icon: Icon, label, path }) => {
          const className = [
            'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground',
            'hover:text-foreground hover:bg-muted/60 transition-colors',
            collapsed ? 'justify-center px-0' : '',
          ].join(' ')
          const content = (
            <>
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </>
          )
          const button = path ? (
            <Link to={path} className={className}>{content}</Link>
          ) : (
            <button className={className}>{content}</button>
          )
          if (!collapsed) return <div key={label}>{button}</div>
          return (
            <Tooltip key={label}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>{label}</TooltipContent>
            </Tooltip>
          )
        })}
        {(() => {
          const signOutButton = (
            <button
              onClick={logout}
              className={[
                'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground',
                'hover:text-destructive hover:bg-destructive/10 transition-colors',
                collapsed ? 'justify-center px-0' : '',
              ].join(' ')}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Sign Out</span>}
            </button>
          )
          if (!collapsed) return signOutButton
          return (
            <Tooltip>
              <TooltipTrigger asChild>{signOutButton}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>Sign Out</TooltipContent>
            </Tooltip>
          )
        })()}
      </div>

      {/* Theme Toggle */}
      {!collapsed ? (
        <div className="border-t border-border/60 py-3 px-3">
          <div className="flex items-center justify-between rounded-lg bg-muted/60 p-1">
            <button
              onClick={() => setTheme('light')}
              className={[
                'flex-1 flex items-center justify-center gap-2 rounded-md py-1.5 text-[11px] font-medium transition-all duration-200',
                theme === 'light'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              ].join(' ')}
            >
              <Sun className="h-3.5 w-3.5" />
              <span>Light</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={[
                'flex-1 flex items-center justify-center gap-2 rounded-md py-1.5 text-[11px] font-medium transition-all duration-200',
                theme === 'dark'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              ].join(' ')}
            >
              <Moon className="h-3.5 w-3.5" />
              <span>Dark</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border/60 py-3 px-2 flex justify-center">
          <button
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            className="flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
      )}
    </aside>
  )
}

/* ─── Mobile top bar + slide-in drawer ─────────────────────────────────────── */
function MobileBar() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  // 007-permission-hardening: same split as Sidebar above — authUser is
  // the real signed-in Admin (ONLY for "Signed in as" + Sign Out);
  // effectiveUser drives nav visibility during preview.
  const { user: authUser, logout } = useAuth()
  const effectiveUser = useEffectiveUser()
  const userRole = effectiveUser?.role

  // Close drawer on route change
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs local UI state to router location, not a data load
  useEffect(() => { setOpen(false) }, [location.pathname])

  return (
    <>
      {/* Sticky top bar (mobile only) */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 h-14">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary">
              <span className="text-xs font-black text-primary-foreground">i</span>
            </div>
            <span className="font-bold text-base tracking-tight">Track</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell userRole={userRole} />
        </div>
      </header>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-50 w-[280px] flex flex-col bg-card border-r border-border shadow-xl md:hidden',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary">
              <span className="text-sm font-black text-primary-foreground">i</span>
            </div>
            <div>
              <p className="text-base font-bold leading-none">Track</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Project Workspace</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer nav — grouped, always expanded (the drawer has room for labels) */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          <SidebarNavGroups collapsed={false} userRole={userRole} />
        </nav>

        {/* Progress in drawer */}
        <div className="border-t border-border/60 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-5 mb-2">
            Project Status
          </p>
          <ProgressSnapshot />
        </div>

        {/* Drawer footer */}
        <div className="border-t border-border/60 py-3 px-3 space-y-3">
          {authUser && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Signed in as
              </p>
              <p className="text-xs font-medium text-foreground truncate">{authUser.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{authUser.role}</p>
            </div>
          )}

          <div className="space-y-0.5">
            {/* 012-help-center: "Help Center" navigates to /help; "Settings"
                has no route yet and stays an inert stub, unchanged. */}
            {[{ icon: Settings, label: 'Settings' }, { icon: HelpCircle, label: 'Help Center', path: '/help' }].map(({ icon: Icon, label, path }) => {
              const className = 'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors'
              const content = (
                <>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </>
              )
              return path ? (
                <Link key={label} to={path} className={className}>{content}</Link>
              ) : (
                <button key={label} className={className}>{content}</button>
              )
            })}
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Sign Out</span>
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/60 p-1">
            <button
              onClick={() => setTheme('light')}
              className={[
                'flex-1 flex items-center justify-center gap-2 rounded-md py-1.5 text-[11px] font-medium transition-all duration-200',
                theme === 'light'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              ].join(' ')}
            >
              <Sun className="h-3.5 w-3.5" />
              <span>Light</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={[
                'flex-1 flex items-center justify-center gap-2 rounded-md py-1.5 text-[11px] font-medium transition-all duration-200',
                theme === 'dark'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              ].join(' ')}
            >
              <Moon className="h-3.5 w-3.5" />
              <span>Dark</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ─── Kanban Guard for Role-based Access ─── */
// Fail closed: grant access only to recognized internal roles. Do not invert
// this to a deny-list (e.g. "block only if Client") — that would silently
// grant access to any null/unrecognized role, which `users.role` permits.
const KANBAN_INTERNAL_ROLES = ['Admin', 'Project Manager', 'Department Head', 'Team Member']

function KanbanGuard({ children }) {
  const user = useEffectiveUser()

  if (!KANBAN_INTERNAL_ROLES.includes(user?.role)) {
    return (
      <AccessDenied message="The Kanban Board is restricted to internal team members. Client accounts do not have access to view internal operational task flows." />
    )
  }

  return children
}

/* ─── Admin Guard for Role-based Access ─── */
function AdminGuard({ children }) {
  const user = useEffectiveUser()

  if (user?.role !== 'Admin') {
    return <AccessDenied message="The Admin Panel is restricted to administrators only." />
  }

  return children
}

/* ─── Support Ops Guard for Role-based Access ─── */
/* Same internal-only audience as the Kanban Board — inclusion-based, fail
   closed for Client and any null/unrecognized role. Write access (creating
   or editing an issue) is further restricted to canWrite() roles server-side;
   this guard only covers whether the board is reachable at all. */
function SupportOpsGuard({ children }) {
  const user = useEffectiveUser()

  if (!KANBAN_INTERNAL_ROLES.includes(user?.role)) {
    return (
      <AccessDenied message="Support Ops is restricted to internal team members. Client accounts do not have access to view internal support and troubleshooting work." />
    )
  }

  return children
}

/* ─── Root App ──────────────────────────────────────────────────────────────── */
function AppShell() {
  // 007-permission-hardening: NotificationBell's polling should restart
  // against the previewed target, matching the sidebar's nav visibility.
  const userRole = useEffectiveUser()?.role
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true')

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed))
  }, [collapsed])

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed(c => !c)} />

      {/* Right side: header + scrollable content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <PreviewBanner />
        {/* Desktop Header */}
        <header className="hidden md:flex items-center justify-between border-b border-border bg-card px-6 h-14 shrink-0">
          <div className="text-sm font-bold text-foreground">
            Workspace Dashboard
          </div>
          <div className="flex items-center gap-4">
            <NotificationBell userRole={userRole} />
          </div>
        </header>

        <MobileBar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <Routes>
              <Route path="/"             element={<Dashboard />} />
              <Route path="/work-program" element={<WorkProgram />} />
              <Route path="/work-program/access" element={<ProjectAccess />} />
              <Route path="/kanban"       element={<KanbanGuard><Kanban /></KanbanGuard>} />
              <Route path="/support-ops"  element={<SupportOpsGuard><SupportOps /></SupportOpsGuard>} />
              <Route path="/support-ops/today" element={<SupportOpsGuard><TodayDashboard /></SupportOpsGuard>} />
              <Route path="/support-ops/knowledge-base" element={<SupportOpsGuard><SupportOpsKnowledgeBase /></SupportOpsGuard>} />
              <Route path="/schedule"     element={<Schedule />} />
              <Route path="/reports"      element={<Reports />} />
              <Route path="/glossary"     element={<Glossary />} />
              <Route path="/help"         element={<HelpCenter />} />
              <Route path="/team"         element={<Team />} />
              <Route path="/admin"        element={<AdminGuard><Admin /></AdminGuard>} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
    </TooltipProvider>
  )
}

/* ─── Protected zone: requires a signed-in session, then renders the shell ─── */
function ProtectedShell() {
  return (
    <RequireAuth>
      <PreviewProvider>
        <AppShell />
      </PreviewProvider>
    </RequireAuth>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<ProtectedShell />} />
          </Routes>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
