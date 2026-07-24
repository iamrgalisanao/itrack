import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  fetchTeamMembers,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  fetchDepartmentGrants,
  createDepartmentGrant,
  deleteDepartmentGrant,
  fetchAuditLogs,
  fetchUsers,
  createUser,
  updateUser,
  disableUser,
  reactivateUser,
  resetUserPassword,
} from '@/lib/api'
import {
  ShieldCheck,
  Users,
  Share2,
  FileText,
  Plus,
  Trash2,
  Edit,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  UserCog,
  Ban,
  UserCheck,
  KeyRound,
} from 'lucide-react'

// Mirrors User::validRoles() and UserManagementController::DEPARTMENT_REQUIRED_ROLES.
const USER_ROLES = ['Admin', 'Project Manager', 'Department Head', 'Team Member', 'Client']
const DEPARTMENT_REQUIRED_ROLES = ['Team Member', 'Department Head', 'Client']
const DEPARTMENTS = ['IT', 'Engineering', 'Marketing', 'Finance']

export default function Admin() {
  const [activeTab, setActiveTab] = useState('members')

  // --- User Accounts State (006-real-user-management) — real, login-capable
  // User accounts. Deliberately named "User Accounts" (not "Users") and
  // uses a distinct icon (UserCog) from the "Members" tab above, which
  // manages the separate, non-authenticating job-title roster
  // (TeamMember) used for task assignment — never the same thing.
  const [userAccountsLoading, setUserAccountsLoading] = useState(false)
  const [users, setUsers] = useState([])
  const [userMeta, setUserMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [userFilters, setUserFilters] = useState({
    search: '',
    role: '',
    department: '',
    status: '',
    page: 1,
  })
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
    role: 'Team Member',
    department: 'IT',
  })
  const [userFormError, setUserFormError] = useState('')
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false)
  const [resetPasswordTarget, setResetPasswordTarget] = useState(null)
  const [resetPasswordForm, setResetPasswordForm] = useState({
    password: '',
    password_confirmation: '',
  })
  const [resetPasswordError, setResetPasswordError] = useState('')

  // --- Members State ---
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [isMemberDialogOpen, setIsMemberDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  const [memberForm, setMemberForm] = useState({
    role: '',
    side: 'Vendor',
    description: '',
    abbreviation: '',
  })

  // --- Department Grants State ---
  const [grants, setGrants] = useState([])
  const [grantsLoading, setGrantsLoading] = useState(false)
  const [isGrantDialogOpen, setIsGrantDialogOpen] = useState(false)
  const [grantForm, setGrantForm] = useState({
    grantee_role: 'Department Head',
    grantee_department: 'Engineering',
    granted_department: 'IT',
  })

  // --- Audit Logs State ---
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logMeta, setLogMeta] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [logFilters, setLogFilters] = useState({
    action: '',
    entity_type: '',
    actor_role: '',
    actor_dept: '',
    date_from: '',
    date_to: '',
    page: 1,
  })

  // --- Fetching Logic ---
  const loadMembers = () => {
    setMembersLoading(true)
    fetchTeamMembers()
      .then((res) => {
        setMembers(res.data.data || res.data || [])
        setMembersLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load team members:', err)
        setMembersLoading(false)
      })
  }

  const loadGrants = () => {
    setGrantsLoading(true)
    fetchDepartmentGrants()
      .then((res) => {
        setGrants(res.data || [])
        setGrantsLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load department grants:', err)
        setGrantsLoading(false)
      })
  }

  const loadLogs = (filtersToUse = logFilters) => {
    setLogsLoading(true)
    // Clean empty filters before sending
    const cleaned = {}
    Object.entries(filtersToUse).forEach(([key, val]) => {
      if (val) cleaned[key] = val
    })

    fetchAuditLogs(cleaned)
      .then((res) => {
        setLogs(res.data.data || [])
        setLogMeta({
          current_page: res.data.current_page || 1,
          last_page: res.data.last_page || 1,
          total: res.data.total || 0,
        })
        setLogsLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load audit logs:', err)
        setLogsLoading(false)
      })
  }

  const loadUserAccounts = (filtersToUse = userFilters) => {
    setUserAccountsLoading(true)
    const cleaned = {}
    Object.entries(filtersToUse).forEach(([key, val]) => {
      if (val) cleaned[key] = val
    })

    fetchUsers(cleaned)
      .then((res) => {
        setUsers(res.data.data || [])
        setUserMeta({
          current_page: res.data.meta?.current_page || 1,
          last_page: res.data.meta?.last_page || 1,
          total: res.data.meta?.total || 0,
        })
        setUserAccountsLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load user accounts:', err)
        setUserAccountsLoading(false)
      })
  }

  // Load appropriate data on active tab changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    if (activeTab === 'members') loadMembers()
    else if (activeTab === 'user-accounts') loadUserAccounts()
    else if (activeTab === 'grants') loadGrants()
    else if (activeTab === 'logs') loadLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load* functions are recreated every render; including them would loop
  }, [activeTab])

  // --- Member Actions ---
  const handleOpenMemberAdd = () => {
    setEditingMember(null)
    setMemberForm({
      role: '',
      side: 'Vendor',
      description: '',
      abbreviation: '',
    })
    setIsMemberDialogOpen(true)
  }

  const handleOpenMemberEdit = (member) => {
    setEditingMember(member)
    setMemberForm({
      role: member.role || '',
      side: member.side || 'Vendor',
      description: member.description || '',
      abbreviation: member.abbreviation || '',
    })
    setIsMemberDialogOpen(true)
  }

  const handleMemberSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingMember) {
        await updateTeamMember(editingMember.id, memberForm)
      } else {
        await createTeamMember(memberForm)
      }
      setIsMemberDialogOpen(false)
      loadMembers()
    } catch (err) {
      console.error('Failed to save team member:', err)
    }
  }

  const handleMemberDelete = async (id) => {
    if (confirm('Are you sure you want to delete this member?')) {
      try {
        await deleteTeamMember(id)
        loadMembers()
      } catch (err) {
        console.error('Failed to delete member:', err)
      }
    }
  }

  // --- User Account Actions ---
  const handleUserFilterChange = (key, value) => {
    const updated = { ...userFilters, [key]: value, page: 1 }
    setUserFilters(updated)
    loadUserAccounts(updated)
  }

  const handleUserPageChange = (newPage) => {
    const updated = { ...userFilters, page: newPage }
    setUserFilters(updated)
    loadUserAccounts(updated)
  }

  const handleOpenUserAdd = () => {
    setEditingUser(null)
    setUserForm({
      name: '',
      email: '',
      password: '',
      password_confirmation: '',
      role: 'Team Member',
      department: 'IT',
    })
    setUserFormError('')
    setIsUserDialogOpen(true)
  }

  const handleOpenUserEdit = (user) => {
    setEditingUser(user)
    setUserForm({
      name: user.name,
      email: user.email,
      password: '',
      password_confirmation: '',
      role: user.role,
      department: user.department || DEPARTMENTS[0],
    })
    setUserFormError('')
    setIsUserDialogOpen(true)
  }

  const handleUserSubmit = async (e) => {
    e.preventDefault()
    setUserFormError('')
    const needsDepartment = DEPARTMENT_REQUIRED_ROLES.includes(userForm.role)
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          department: needsDepartment ? userForm.department : null,
        })
      } else {
        await createUser({
          ...userForm,
          department: needsDepartment ? userForm.department : null,
        })
      }
      setIsUserDialogOpen(false)
      loadUserAccounts()
    } catch (err) {
      console.error('Failed to save user:', err)
      const errors = err.response?.data?.errors
      const firstError = errors ? Object.values(errors)[0]?.[0] : null
      setUserFormError(firstError || err.response?.data?.message || 'Failed to save user.')
    }
  }

  const handleUserDisable = async (user) => {
    if (!confirm(`Disable "${user.name}"? They will be signed out and unable to sign in until reactivated.`)) {
      return
    }
    try {
      await disableUser(user.id)
      loadUserAccounts()
    } catch (err) {
      console.error('Failed to disable user:', err)
      alert(err.response?.data?.message || 'Failed to disable user.')
    }
  }

  const handleUserReactivate = async (user) => {
    if (!confirm(`Reactivate "${user.name}"? They will be able to sign in again immediately.`)) {
      return
    }
    try {
      await reactivateUser(user.id)
      loadUserAccounts()
    } catch (err) {
      console.error('Failed to reactivate user:', err)
      alert(err.response?.data?.message || 'Failed to reactivate user.')
    }
  }

  const handleOpenResetPassword = (user) => {
    setResetPasswordTarget(user)
    setResetPasswordForm({ password: '', password_confirmation: '' })
    setResetPasswordError('')
    setIsResetPasswordDialogOpen(true)
  }

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault()
    setResetPasswordError('')
    try {
      await resetUserPassword(resetPasswordTarget.id, resetPasswordForm)
      setIsResetPasswordDialogOpen(false)
    } catch (err) {
      console.error('Failed to reset password:', err)
      const errors = err.response?.data?.errors
      const firstError = errors ? Object.values(errors)[0]?.[0] : null
      setResetPasswordError(firstError || err.response?.data?.message || 'Failed to reset password.')
    }
  }

  // --- Grant Actions ---
  const handleOpenGrantAdd = () => {
    setGrantForm({
      grantee_role: 'Department Head',
      grantee_department: 'Engineering',
      granted_department: 'IT',
    })
    setIsGrantDialogOpen(true)
  }

  const handleGrantSubmit = async (e) => {
    e.preventDefault()
    try {
      await createDepartmentGrant(grantForm)
      setIsGrantDialogOpen(false)
      loadGrants()
    } catch (err) {
      console.error('Failed to create department grant:', err)
      alert(err.response?.data?.message || 'Failed to create grant. Ensure it is not a duplicate.')
    }
  }

  const handleGrantDelete = async (id) => {
    if (confirm('Are you sure you want to revoke this cross-department grant?')) {
      try {
        await deleteDepartmentGrant(id)
        loadGrants()
      } catch (err) {
        console.error('Failed to revoke grant:', err)
      }
    }
  }

  // --- Audit Log Filters & Pagination ---
  const handleLogFilterChange = (key, value) => {
    const updated = { ...logFilters, [key]: value, page: 1 }
    setLogFilters(updated)
    loadLogs(updated)
  }

  const handleLogPageChange = (newPage) => {
    const updated = { ...logFilters, page: newPage }
    setLogFilters(updated)
    loadLogs(updated)
  }

  const handleResetFilters = () => {
    const reset = {
      action: '',
      entity_type: '',
      actor_role: '',
      actor_dept: '',
      date_from: '',
      date_to: '',
      page: 1,
    }
    setLogFilters(reset)
    loadLogs(reset)
  }

  // --- Filters for Members ---
  const filteredMembers = members.filter((m) => {
    const query = memberSearch.toLowerCase()
    return (
      (m.role || '').toLowerCase().includes(query) ||
      (m.side || '').toLowerCase().includes(query) ||
      (m.description || '').toLowerCase().includes(query) ||
      (m.abbreviation || '').toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Control Center</h1>
          <p className="text-muted-foreground mt-1">
            Manage system roles, department grants, and view system-wide audit logs
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 max-w-155">
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="user-accounts" className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            User Accounts
          </TabsTrigger>
          <TabsTrigger value="grants" className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Department Grants
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Audit Logs
          </TabsTrigger>
        </TabsList>

        {/* ────────────────── MEMBERS PANEL ────────────────── */}
        <TabsContent value="members" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search member roles..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={handleOpenMemberAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Add Member Role
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Member Roles</CardTitle>
              <CardDescription>
                Define operational roles that can be assigned to tasks and milestones
              </CardDescription>
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading members...
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">No members found.</div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Abbreviation</TableHead>
                        <TableHead className="w-[200px]">Role Title</TableHead>
                        <TableHead className="w-[120px]">Stakeholder Side</TableHead>
                        <TableHead>Responsibility Description</TableHead>
                        <TableHead className="w-[100px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMembers.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-semibold">{member.abbreviation || '-'}</TableCell>
                          <TableCell>{member.role}</TableCell>
                          <TableCell>
                            <Badge variant={member.side === 'Client' ? 'warning' : 'info'}>
                              {member.side}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-md truncate">
                            {member.description || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenMemberEdit(member)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleMemberDelete(member.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Member Add/Edit Dialog */}
          <Dialog open={isMemberDialogOpen} onOpenChange={setIsMemberDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{editingMember ? 'Edit Member Role' : 'Add Member Role'}</DialogTitle>
                <DialogDescription>
                  Configure operational stakeholder/team members.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleMemberSubmit} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="member-role" className="text-xs font-semibold">Role Title</label>
                  <Input
                    id="member-role"
                    placeholder="e.g. Lead System Engineer"
                    value={memberForm.role}
                    onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="member-side" className="text-xs font-semibold">Side</label>
                    <select
                      id="member-side"
                      value={memberForm.side}
                      onChange={(e) => setMemberForm({ ...memberForm, side: e.target.value })}
                      className="w-full text-sm rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="Vendor">Vendor</option>
                      <option value="Client">Client</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="member-abbreviation" className="text-xs font-semibold">Abbreviation</label>
                    <Input
                      id="member-abbreviation"
                      placeholder="e.g. LSE"
                      value={memberForm.abbreviation}
                      onChange={(e) => setMemberForm({ ...memberForm, abbreviation: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="member-description" className="text-xs font-semibold">Responsibility Description</label>
                  <textarea
                    id="member-description"
                    placeholder="Describe their primary tasks..."
                    value={memberForm.description}
                    onChange={(e) => setMemberForm({ ...memberForm, description: e.target.value })}
                    className="w-full min-h-[80px] text-sm rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsMemberDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingMember ? 'Save Changes' : 'Add Role'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ────────────────── USER ACCOUNTS PANEL ──────────────────
            Real, login-capable User accounts (006-real-user-management) —
            distinct from the "Members" tab above, which is a separate,
            non-authenticating job-title roster used only for task
            assignment. */}
        <TabsContent value="user-accounts" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">User Accounts</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage real, sign-in-capable accounts — name, email, system role, department, and status.
                Separate from the "Members" tab, which only defines job-title roles for task assignment.
              </p>
            </div>
            <Button onClick={handleOpenUserAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>Search, filter, and manage real user accounts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4 items-end bg-muted/20 p-3 rounded-lg border border-border/80 text-xs">
                <div className="space-y-1 md:col-span-2">
                  <label htmlFor="user-search" className="font-semibold">Search</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      id="user-search"
                      placeholder="Name or email..."
                      value={userFilters.search}
                      onChange={(e) => handleUserFilterChange('search', e.target.value)}
                      className="h-7 text-xs pl-7"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="user-filter-role" className="font-semibold">Role</label>
                  <select
                    id="user-filter-role"
                    value={userFilters.role}
                    onChange={(e) => handleUserFilterChange('role', e.target.value)}
                    className="w-full text-xs rounded-md border border-border bg-card px-2 py-1 text-foreground focus:outline-none"
                  >
                    <option value="">All Roles</option>
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="user-filter-department" className="font-semibold">Department</label>
                  <select
                    id="user-filter-department"
                    value={userFilters.department}
                    onChange={(e) => handleUserFilterChange('department', e.target.value)}
                    className="w-full text-xs rounded-md border border-border bg-card px-2 py-1 text-foreground focus:outline-none"
                  >
                    <option value="">All Depts</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="user-filter-status" className="font-semibold">Status</label>
                  <select
                    id="user-filter-status"
                    value={userFilters.status}
                    onChange={(e) => handleUserFilterChange('status', e.target.value)}
                    className="w-full text-xs rounded-md border border-border bg-card px-2 py-1 text-foreground focus:outline-none"
                  >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>

              {userAccountsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading user accounts...
                </div>
              ) : users.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">No user accounts found.</div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="w-35">Role</TableHead>
                          <TableHead className="w-30">Department</TableHead>
                          <TableHead className="w-25">Status</TableHead>
                          <TableHead className="w-25 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-semibold">{u.name}</TableCell>
                            <TableCell className="text-muted-foreground">{u.email}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{u.role}</Badge>
                            </TableCell>
                            <TableCell>{u.department || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={u.is_active ? 'success' : 'destructive'}>
                                {u.is_active ? 'Active' : 'Disabled'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenUserEdit(u)}
                                  title="Edit"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {u.is_active ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleUserDisable(u)}
                                    title="Disable"
                                  >
                                    <Ban className="h-4 w-4 text-destructive" />
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleUserReactivate(u)}
                                    title="Reactivate"
                                  >
                                    <UserCheck className="h-4 w-4 text-success" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenResetPassword(u)}
                                  title="Reset Password"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div>
                      Showing {users.length} of {userMeta.total} accounts
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={userFilters.page <= 1}
                        onClick={() => handleUserPageChange(userFilters.page - 1)}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span>
                        Page {userMeta.current_page} of {userMeta.last_page}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={userFilters.page >= userMeta.last_page}
                        onClick={() => handleUserPageChange(userFilters.page + 1)}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* User Add Dialog */}
          <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{editingUser ? 'Edit User' : 'Add User'}</DialogTitle>
                <DialogDescription>
                  {editingUser
                    ? 'Changes take effect on this user\'s very next request — no re-login needed.'
                    : 'Create a real, sign-in-capable account.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUserSubmit} className="space-y-4 pt-2">
                {userFormError && (
                  <div className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
                    {userFormError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label htmlFor="user-name" className="text-xs font-semibold">Name</label>
                  <Input
                    id="user-name"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="user-email" className="text-xs font-semibold">Email</label>
                  <Input
                    id="user-email"
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    required
                  />
                </div>
                {!editingUser && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="user-password" className="text-xs font-semibold">Password</label>
                      <Input
                        id="user-password"
                        type="password"
                        value={userForm.password}
                        onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                        minLength={8}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="user-password-confirmation" className="text-xs font-semibold">Confirm Password</label>
                      <Input
                        id="user-password-confirmation"
                        type="password"
                        value={userForm.password_confirmation}
                        onChange={(e) => setUserForm({ ...userForm, password_confirmation: e.target.value })}
                        minLength={8}
                        required
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="user-role" className="text-xs font-semibold">Role</label>
                    <select
                      id="user-role"
                      value={userForm.role}
                      onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                      className="w-full text-sm rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {USER_ROLES.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="user-department" className="text-xs font-semibold">
                      Department{DEPARTMENT_REQUIRED_ROLES.includes(userForm.role) ? '' : ' (optional)'}
                    </label>
                    <select
                      id="user-department"
                      value={userForm.department}
                      onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}
                      className="w-full text-sm rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsUserDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingUser ? 'Save Changes' : 'Add User'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Reset Password Dialog */}
          <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
            <DialogContent className="sm:max-w-106">
              <DialogHeader>
                <DialogTitle>Reset Password</DialogTitle>
                <DialogDescription>
                  Set a new password for "{resetPasswordTarget?.name}". They will sign in with this new
                  password — the old one stops working immediately.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4 pt-2">
                {resetPasswordError && (
                  <div className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
                    {resetPasswordError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label htmlFor="reset-password" className="text-xs font-semibold">New Password</label>
                  <Input
                    id="reset-password"
                    type="password"
                    value={resetPasswordForm.password}
                    onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, password: e.target.value })}
                    minLength={8}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="reset-password-confirmation" className="text-xs font-semibold">Confirm New Password</label>
                  <Input
                    id="reset-password-confirmation"
                    type="password"
                    value={resetPasswordForm.password_confirmation}
                    onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, password_confirmation: e.target.value })}
                    minLength={8}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsResetPasswordDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    Reset Password
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ────────────────── DEPARTMENT GRANTS PANEL ────────────────── */}
        <TabsContent value="grants" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Cross-Department Access</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Enable specific personas in one department to view another department's projects
              </p>
            </div>
            <Button onClick={handleOpenGrantAdd}>
              <Plus className="h-4 w-4 mr-2" />
              New Access Grant
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Active Access Grants</CardTitle>
                  <CardDescription>
                    All current active cross-department visibility rules
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {grantsLoading ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                      Loading grants...
                    </div>
                  ) : grants.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                      No cross-department access grants have been defined.
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Grantee Persona (Role)</TableHead>
                            <TableHead>Grantee Department</TableHead>
                            <TableHead className="w-[80px] text-center"></TableHead>
                            <TableHead>Visible Department</TableHead>
                            <TableHead className="w-[120px] text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grants.map((grant) => (
                            <TableRow key={grant.id}>
                              <TableCell className="font-semibold">{grant.grantee_role}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{grant.grantee_department}</Badge>
                              </TableCell>
                              <TableCell className="text-center text-muted-foreground">
                                <ArrowRight className="h-4 w-4 inline" />
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{grant.granted_department}</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleGrantDelete(grant.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Mock Limitation Note</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-3 leading-relaxed">
                  <p>
                    Because this project operates in <strong>Mock Auth Mode</strong>, grants map roles to departments rather than individuals.
                  </p>
                  <p>
                    For example, granting <strong>Department Head</strong> of <strong>Engineering</strong> visibility to <strong>IT</strong> projects will let ANY user switched to "Department Head" with department "Engineering" view both Engineering and IT projects.
                  </p>
                  <p className="text-xs border-t pt-2 border-border/80">
                    💡 Perfect for testing and prototyping role configurations before introducing production directory integrations (e.g. Active Directory/Okta).
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Department Grant Dialog */}
          <Dialog open={isGrantDialogOpen} onOpenChange={setIsGrantDialogOpen}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Grant Department Access</DialogTitle>
                <DialogDescription>
                  Authorize a role in one department to see another department's projects.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleGrantSubmit} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="grant-role" className="text-xs font-semibold">Grantee Persona Role</label>
                  <select
                    id="grant-role"
                    value={grantForm.grantee_role}
                    onChange={(e) => setGrantForm({ ...grantForm, grantee_role: e.target.value })}
                    className="w-full text-sm rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Department Head">Department Head</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Team Member">Team Member</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="grant-grantee-department" className="text-xs font-semibold">Who is requestor (Grantee Department)</label>
                  <select
                    id="grant-grantee-department"
                    value={grantForm.grantee_department}
                    onChange={(e) => setGrantForm({ ...grantForm, grantee_department: e.target.value })}
                    className="w-full text-sm rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="IT">IT</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Finance">Finance</option>
                  </select>
                </div>

                <div className="space-y-1.5 font-bold text-center py-1">
                  <ArrowRight className="h-5 w-5 mx-auto rotate-90 text-muted-foreground" />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="grant-granted-department" className="text-xs font-semibold">Target Department to Reveal</label>
                  <select
                    id="grant-granted-department"
                    value={grantForm.granted_department}
                    onChange={(e) => setGrantForm({ ...grantForm, granted_department: e.target.value })}
                    className="w-full text-sm rounded-md border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="IT">IT</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Finance">Finance</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsGrantDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    Create Grant
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ────────────────── AUDIT LOGS PANEL ────────────────── */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Audit Logs</CardTitle>
                <CardDescription>
                  Immutable audit records of permission-sensitive workspace actions
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => loadLogs()} className="h-8">
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filter Row */}
              <div className="grid gap-3 grid-cols-2 md:grid-cols-6 items-end bg-muted/20 p-3 rounded-lg border border-border/80 text-xs">
                <div className="space-y-1">
                  <label htmlFor="log-filter-action" className="font-semibold">Action</label>
                  <select
                    id="log-filter-action"
                    value={logFilters.action}
                    onChange={(e) => handleLogFilterChange('action', e.target.value)}
                    className="w-full text-xs rounded-md border border-border bg-card px-2 py-1 text-foreground focus:outline-none"
                  >
                    <option value="">All Actions</option>
                    <option value="project.created">Project Created</option>
                    <option value="project.updated">Project Updated</option>
                    <option value="project.deleted">Project Deleted</option>
                    <option value="project.health_updated">Health Updated</option>
                    <option value="task.created">Task Created</option>
                    <option value="task.updated">Task Updated</option>
                    <option value="task.deleted">Task Deleted</option>
                    <option value="task.status_changed">Status Changed</option>
                    <option value="member.created">Member Created</option>
                    <option value="member.updated">Member Updated</option>
                    <option value="member.deleted">Member Deleted</option>
                    <option value="department_grant.created">Grant Created</option>
                    <option value="department_grant.deleted">Grant Deleted</option>
                    <option value="unauthorized_access">Access Blocked</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="log-filter-entity-type" className="font-semibold">Entity Type</label>
                  <select
                    id="log-filter-entity-type"
                    value={logFilters.entity_type}
                    onChange={(e) => handleLogFilterChange('entity_type', e.target.value)}
                    className="w-full text-xs rounded-md border border-border bg-card px-2 py-1 text-foreground focus:outline-none"
                  >
                    <option value="">All Types</option>
                    <option value="project">Project</option>
                    <option value="detailed_activity">Task</option>
                    <option value="team_member">Team Member</option>
                    <option value="department_grant">Dept Grant</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="log-filter-actor-role" className="font-semibold">Actor Role</label>
                  <select
                    id="log-filter-actor-role"
                    value={logFilters.actor_role}
                    onChange={(e) => handleLogFilterChange('actor_role', e.target.value)}
                    className="w-full text-xs rounded-md border border-border bg-card px-2 py-1 text-foreground focus:outline-none"
                  >
                    <option value="">All Roles</option>
                    <option value="Admin">Admin</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Team Member">Team Member</option>
                    <option value="Department Head">Department Head</option>
                    <option value="Client">Client</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="log-filter-actor-dept" className="font-semibold">Actor Dept</label>
                  <select
                    id="log-filter-actor-dept"
                    value={logFilters.actor_dept}
                    onChange={(e) => handleLogFilterChange('actor_dept', e.target.value)}
                    className="w-full text-xs rounded-md border border-border bg-card px-2 py-1 text-foreground focus:outline-none"
                  >
                    <option value="">All Depts</option>
                    <option value="IT">IT</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Finance">Finance</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="log-filter-date-from" className="font-semibold">From Date</label>
                  <Input
                    id="log-filter-date-from"
                    type="date"
                    value={logFilters.date_from}
                    onChange={(e) => handleLogFilterChange('date_from', e.target.value)}
                    className="h-7 text-xs px-2 py-0"
                  />
                </div>

                <div className="space-y-1 flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label htmlFor="log-filter-date-to" className="font-semibold">To Date</label>
                    <Input
                      id="log-filter-date-to"
                      type="date"
                      value={logFilters.date_to}
                      onChange={(e) => handleLogFilterChange('date_to', e.target.value)}
                      className="h-7 text-xs px-2 py-0"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleResetFilters}
                    className="h-7 px-2 self-end text-muted-foreground hover:text-foreground"
                    title="Reset filters"
                  >
                    Reset
                  </Button>
                </div>
              </div>

              {logsLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading logs...
                </div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No matching audit logs found.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">Date / Time</TableHead>
                          <TableHead className="w-[160px]">Action</TableHead>
                          <TableHead className="w-[120px]">Actor</TableHead>
                          <TableHead className="w-[120px]">Entity</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.map((log) => {
                          const dateStr = new Date(log.created_at).toLocaleString()
                          const isDenied = log.action === 'unauthorized_access'
                          return (
                            <TableRow key={log.id} className={isDenied ? 'bg-destructive/5' : ''}>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {dateStr}
                              </TableCell>
                              <TableCell>
                                <Badge variant={isDenied ? 'destructive' : 'secondary'} className="text-[10px] py-0">
                                  {log.action}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                <span className="font-semibold">{log.actor_role}</span>
                                {log.actor_dept && (
                                  <span className="text-muted-foreground block text-[10px]">
                                    ({log.actor_dept})
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {log.entity_type} {log.entity_id ? `#${log.entity_id}` : ''}
                              </TableCell>
                              <TableCell className="text-xs leading-relaxed">
                                {log.description}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination Footer */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div>
                      Showing {logs.length} of {logMeta.total} entries
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={logFilters.page <= 1}
                        onClick={() => handleLogPageChange(logFilters.page - 1)}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span>
                        Page {logMeta.current_page} of {logMeta.last_page}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={logFilters.page >= logMeta.last_page}
                        onClick={() => handleLogPageChange(logFilters.page + 1)}
                        className="h-8 w-8 p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
