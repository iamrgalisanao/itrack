import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/api'
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  AlertTriangle,
  Loader2,
  Info,
  Calendar,
  MessageSquare,
  UserPlus,
  OctagonAlert,
} from 'lucide-react'

export default function NotificationBell({ userRole }) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  const loadNotifications = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchNotifications()
      setUnreadCount(res.data.unread_count || 0)
      setNotifications(res.data.notifications || [])
    } catch (err) {
      console.error('Failed to load notifications:', err)
      setError('Unable to load notifications.')
    } finally {
      setLoading(false)
    }
  }

  const refreshNotifications = async () => {
    try {
      const res = await fetchNotifications()
      setUnreadCount(res.data.unread_count || 0)
      setNotifications(res.data.notifications || [])
    } catch (err) {
      console.error('Silent notification refresh failed:', err)
    }
  }

  // Load notifications initially and whenever role changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    loadNotifications()
  }, [userRole])

  // Polling loop (pauses when browser tab is hidden to save resources)
  useEffect(() => {
    let intervalId

    const startPolling = () => {
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          // Silent refresh (don't show full loading spinner)
          refreshNotifications()
        }
      }, 30000) // Poll every 30 seconds
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!intervalId) startPolling()
      } else {
        if (intervalId) {
          clearInterval(intervalId)
          intervalId = null;
        }
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (intervalId) clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [userRole])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMarkAsRead = async (e, notification) => {
    e.stopPropagation() // Prevent triggering click on the notification card itself
    if (notification.is_read) return

    try {
      const res = await markNotificationRead(notification.id)
      setUnreadCount(res.data.unread_count)
      setNotifications(prev =>
        prev.map(n => (n.id === notification.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      )
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return
    try {
      const res = await markAllNotificationsRead()
      setUnreadCount(res.data.unread_count)
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })))
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err)
    }
  }

  const handleNotificationClick = async (notification) => {
    setIsOpen(false)
    
    // Mark as read immediately if not already read
    if (!notification.is_read) {
      try {
        const res = await markNotificationRead(notification.id)
        setUnreadCount(res.data.unread_count)
        setNotifications(prev =>
          prev.map(n => (n.id === notification.id ? { ...n, is_read: true } : n))
        )
      } catch (err) {
        console.error('Failed to mark notification read on click:', err)
      }
    }

    // Redirect to target link_url if provided
    if (notification.link_url) {
      navigate(notification.link_url)
    }
  }

  const formatRelativeTime = (iso) => {
    if (!iso) return ''
    const diff = new Date() - new Date(iso)
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  // Get icon by notification type
  const getNotificationIcon = (type, severity) => {
    const iconClass = severity === 'critical' 
      ? 'text-red-500 bg-red-500/10' 
      : severity === 'warning'
      ? 'text-amber-500 bg-amber-500/10'
      : 'text-blue-500 bg-blue-500/10'

    switch (type) {
      case 'assignment':
        return <UserPlus className={`h-4 w-4 p-0.5 rounded ${iconClass}`} />
      case 'mention':
        return <MessageSquare className={`h-4 w-4 p-0.5 rounded ${iconClass}`} />
      case 'overdue':
        return <OctagonAlert className={`h-4 w-4 p-0.5 rounded ${iconClass}`} />
      case 'blocked':
        return <AlertTriangle className={`h-4 w-4 p-0.5 rounded ${iconClass}`} />
      case 'due_soon':
        return <Calendar className={`h-4 w-4 p-0.5 rounded ${iconClass}`} />
      default:
        return <Info className={`h-4 w-4 p-0.5 rounded ${iconClass}`} />
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications, ${unreadCount} unread`}
        title="Notifications"
        className="relative h-9 w-9 rounded-lg border border-border flex items-center justify-center bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 shadow-sm"
      >
        {unreadCount > 0 ? (
          <>
            <BellRing className="h-4 w-4 text-primary animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground leading-none border border-background">
              {unreadCount}
            </span>
          </>
        ) : (
          <Bell className="h-4 w-4" />
        )}
      </button>

      {/* Notifications Dropdown Card (Glassmorphism & premium UI styling) */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 z-50 w-80 rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-xl overflow-hidden animate-in fade-in-50 slide-in-from-top-1">
          {/* Dropdown Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/40">
            <span className="text-xs font-bold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-[10px] font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                <CheckCheck className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>

          {/* Notifications List Container */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/60 custom-scrollbar">
            {loading && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground bg-card">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-[11px] font-medium">Loading alerts...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4 bg-card">
                <AlertTriangle className="h-5 w-5 text-destructive mb-1" />
                <p className="text-[10px] font-semibold text-destructive">{error}</p>
                <button
                  onClick={loadNotifications}
                  className="text-[10px] font-bold text-primary mt-2 hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground bg-card">
                <Bell className="h-7 w-7 text-muted-foreground/35 mb-2" />
                <p className="text-xs font-bold">No notifications yet.</p>
                <p className="text-[10px] text-muted-foreground/80 mt-0.5 px-6">
                  We'll notify you here about assignments, comment mentions, and project updates.
                </p>
              </div>
            ) : (
              // Display only the latest 5 notifications as per criteria
              notifications.slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`flex items-start gap-3 p-3.5 hover:bg-muted/40 cursor-pointer transition-colors ${
                    !n.is_read 
                      ? 'bg-primary/[0.02] dark:bg-primary/[0.04]' 
                      : 'opacity-85'
                  }`}
                >
                  {/* Status Indicator */}
                  {!n.is_read && (
                    <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-primary mt-1.5" />
                  )}

                  {/* Icon */}
                  <div className="shrink-0 mt-0.5">
                    {getNotificationIcon(n.type, n.severity)}
                  </div>

                  {/* Body Text */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-xs font-bold text-foreground leading-snug truncate pr-2">
                      {n.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-normal font-medium">
                      {n.message}
                    </p>
                    <span className="inline-block text-[9px] text-muted-foreground/75 font-semibold">
                      {formatRelativeTime(n.created_at)}
                    </span>
                  </div>

                  {/* Mark Read Individual Check button */}
                  {!n.is_read && (
                    <button
                      onClick={(e) => handleMarkAsRead(e, n)}
                      title="Mark as read"
                      className="shrink-0 h-5 w-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground/50 hover:text-foreground transition-all"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
