import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
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
  ShieldAlert,
  BarChart3,
  ShieldCheck,
  LogOut,
  MessagesSquare,
} from 'lucide-react'
import { fetchDashboard } from '@/lib/api'
import Dashboard from './pages/Dashboard'
import WorkProgram from './pages/WorkProgram'
import Glossary from './pages/Glossary'
import Team from './pages/Team'
import Kanban from './pages/Kanban'
import Schedule from './pages/Schedule'
import Reports from './pages/Reports'
import Admin from './pages/Admin'
import SupportOps from './pages/SupportOps'
import Login from './pages/Login'
import NotificationBell from './components/NotificationBell'
import RequireAuth from './components/RequireAuth'
import { AuthProvider, useAuth } from './context/AuthContext'

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

/* ─── Nav items shared by sidebar + mobile drawer ─────────────────────────── */
const NAV_ITEMS = [
  { path: '/',             label: 'Dashboard',     icon: LayoutDashboard },
  { path: '/work-program', label: 'Work Program',  icon: FolderKanban },
  { path: '/kanban',       label: 'Kanban Board',  icon: FolderKanban, internalOnly: true },
  { path: '/support-ops',  label: 'Support Ops',   icon: MessagesSquare, internalOnly: true },
  { path: '/schedule',     label: 'Schedule View', icon: Calendar },
  { path: '/reports',      label: 'Reports & Health', icon: BarChart3 },
  { path: '/glossary',     label: 'Glossary',      icon: BookOpen },
  { path: '/team',         label: 'Team',          icon: Users },
  { path: '/admin',        label: 'Admin Panel',   icon: ShieldCheck, adminOnly: true },
]

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

/* ─── Sidebar (desktop persistent + icon-only rail) ────────────────────────── */
/* ─── Sidebar (desktop persistent + icon-only rail) ────────────────────────── */
function Sidebar({ collapsed = false }) {
  const location = useLocation()
  const { theme, setTheme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const userRole = user?.role

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.internalOnly && userRole === 'Client') return false
    if (item.adminOnly && userRole !== 'Admin') return false
    return true
  })

  return (
    <aside
      className={[
        'hidden md:flex flex-col h-screen sticky top-0 border-r border-border bg-card',
        'transition-all duration-300 ease-in-out shrink-0',
        collapsed ? 'w-[72px]' : 'w-[260px]',
      ].join(' ')}
    >
      {/* Brand */}
      <div className={['flex items-center gap-3 px-4 py-5 border-b border-border/60', collapsed ? 'justify-center px-0' : ''].join(' ')}>
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

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 mb-2">
            Navigation
          </p>
        )}
        {visibleItems.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path
          return (
            <Link
              key={path}
              to={path}
              title={collapsed ? label : undefined}
              className={[
                'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                'transition-all duration-150 group',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                collapsed ? 'justify-center px-0' : '',
              ].join(' ')}
            >
              {/* Left accent bar */}
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
        })}
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
      {!collapsed && user && (
        <div className="border-t border-border/60 py-3 px-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Signed in as
          </p>
          <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{user.role}</p>
        </div>
      )}

      {/* Footer links */}
      <div className={['border-t border-border/60 py-3 px-2 space-y-0.5', collapsed ? '' : ''].join(' ')}>
        {[{ icon: Settings, label: 'Settings' }, { icon: HelpCircle, label: 'Help Center' }].map(({ icon: Icon, label }) => (
          <button
            key={label}
            title={collapsed ? label : undefined}
            className={[
              'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground',
              'hover:text-foreground hover:bg-muted/60 transition-colors',
              collapsed ? 'justify-center px-0' : '',
            ].join(' ')}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
        <button
          onClick={logout}
          title={collapsed ? 'Sign Out' : undefined}
          className={[
            'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground',
            'hover:text-destructive hover:bg-destructive/10 transition-colors',
            collapsed ? 'justify-center px-0' : '',
          ].join(' ')}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
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
  const { user, logout } = useAuth()
  const userRole = user?.role

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.internalOnly && userRole === 'Client') return false
    if (item.adminOnly && userRole !== 'Admin') return false
    return true
  })

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

        {/* Drawer nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {visibleItems.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path
            return (
              <Link
                key={path}
                to={path}
                className={[
                  'relative flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                ].join(' ')}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-primary" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
                {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5 text-primary/60" />}
              </Link>
            )
          })}
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
          {user && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Signed in as
              </p>
              <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.role}</p>
            </div>
          )}

          <div className="space-y-0.5">
            {[{ icon: Settings, label: 'Settings' }, { icon: HelpCircle, label: 'Help Center' }].map(({ icon: Icon, label }) => (
              <button
                key={label}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
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
  const { user } = useAuth()

  if (!KANBAN_INTERNAL_ROLES.includes(user?.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] border border-border/85 rounded-xl p-8 text-center bg-card shadow-sm max-w-lg mx-auto mt-12">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-4">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">Access Denied</h3>
        <p className="text-sm text-muted-foreground mb-6">
          The Kanban Board is restricted to internal team members. Client accounts do not have access to view internal operational task flows.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    )
  }

  return children
}

/* ─── Admin Guard for Role-based Access ─── */
function AdminGuard({ children }) {
  const { user } = useAuth()

  if (user?.role !== 'Admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] border border-border/85 rounded-xl p-8 text-center bg-card shadow-sm max-w-lg mx-auto mt-12">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-4">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">Access Denied</h3>
        <p className="text-sm text-muted-foreground mb-6">
          The Admin Panel is restricted to administrators only.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    )
  }

  return children
}

/* ─── Support Ops Guard for Role-based Access ─── */
/* Same internal-only audience as the Kanban Board — inclusion-based, fail
   closed for Client and any null/unrecognized role. Write access (creating
   or editing an issue) is further restricted to canWrite() roles server-side;
   this guard only covers whether the board is reachable at all. */
function SupportOpsGuard({ children }) {
  const { user } = useAuth()

  if (!KANBAN_INTERNAL_ROLES.includes(user?.role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] border border-border/85 rounded-xl p-8 text-center bg-card shadow-sm max-w-lg mx-auto mt-12">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-4">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-foreground mb-2">Access Denied</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Support Ops is restricted to internal team members. Client accounts do not have access to view internal support and troubleshooting work.
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    )
  }

  return children
}

/* ─── Root App ──────────────────────────────────────────────────────────────── */
function AppShell() {
  const { user } = useAuth()
  const userRole = user?.role
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <Sidebar collapsed={false} />

      {/* Right side: header + scrollable content */}
      <div className="flex flex-col flex-1 overflow-hidden">
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
              <Route path="/kanban"       element={<KanbanGuard><Kanban /></KanbanGuard>} />
              <Route path="/support-ops"  element={<SupportOpsGuard><SupportOps /></SupportOpsGuard>} />
              <Route path="/schedule"     element={<Schedule />} />
              <Route path="/reports"      element={<Reports />} />
              <Route path="/glossary"     element={<Glossary />} />
              <Route path="/team"         element={<Team />} />
              <Route path="/admin"        element={<AdminGuard><Admin /></AdminGuard>} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  )
}

/* ─── Protected zone: requires a signed-in session, then renders the shell ─── */
function ProtectedShell() {
  return (
    <RequireAuth>
      <AppShell />
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
