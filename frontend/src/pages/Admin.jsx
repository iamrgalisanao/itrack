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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  fetchProjects,
  fetchProjectAssignments,
  createProjectAssignment,
  deleteProjectAssignment,
  fetchProjectOwnerships,
  createProjectOwnership,
  deleteProjectOwnership,
  transferProjectOwnership,
  fetchClientOrganizations,
  createClientOrganization,
  updateTrustedDomainPolicy,
  updateProjectClientOrganization,
  fetchClientDomains,
  createClientDomain,
  deleteClientDomain,
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
  FolderKanban,
  Eye,
  Crown,
  Building2,
  Globe2,
  Link2,
  X,
  Info,
} from 'lucide-react'
import { usePreview } from '@/context/PreviewContext'

// Mirrors User::validRoles() and UserManagementController::DEPARTMENT_REQUIRED_ROLES.
const USER_ROLES = ['Admin', 'Project Manager', 'Department Head', 'Team Member', 'Client']
const DEPARTMENT_REQUIRED_ROLES = ['Team Member', 'Department Head', 'Client']
const DEPARTMENTS = ['IT', 'Engineering', 'Marketing', 'Finance']
const TRUSTED_DOMAIN_POLICIES = [
  ['manual_approval', 'Manual approval'],
  ['domain_auto_approve', 'Verified domains auto-approve'],
  ['invitation_only', 'Invitation only'],
]

export default function Admin() {
  const { startPreview } = usePreview()
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

  // --- Project Assignments State (007-permission-hardening) ---
  const [assignments, setAssignments] = useState([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignableProjects, setAssignableProjects] = useState([])
  const [assignableUsers, setAssignableUsers] = useState([])
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false)
  const [assignmentForm, setAssignmentForm] = useState({ user_id: '', project_id: '' })
  const [assignmentError, setAssignmentError] = useState('')

  // --- Project Ownership State (008-project-ownership) ---
  const [ownerships, setOwnerships] = useState([])
  const [ownershipsLoading, setOwnershipsLoading] = useState(false)
  const [ownableProjects, setOwnableProjects] = useState([])
  const [ownablePms, setOwnablePms] = useState([])
  const [isOwnershipDialogOpen, setIsOwnershipDialogOpen] = useState(false)
  const [ownershipForm, setOwnershipForm] = useState({ user_id: '', project_id: '' })
  const [ownershipError, setOwnershipError] = useState('')
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false)
  const [transferTarget, setTransferTarget] = useState(null)
  const [transferForm, setTransferForm] = useState({ new_owner_user_id: '' })
  const [transferError, setTransferError] = useState('')

  // --- Client Organizations State (011-project-client-access-control) ---
  const [clientOrganizations, setClientOrganizations] = useState([])
  const [clientProjects, setClientProjects] = useState([])
  const [clientDomainsByOrg, setClientDomainsByOrg] = useState({})
  const [clientsLoading, setClientsLoading] = useState(false)
  const [clientOrgForm, setClientOrgForm] = useState({
    name: '',
    trusted_domain_policy: 'manual_approval',
  })
  const [clientOrgError, setClientOrgError] = useState('')
  const [projectClientForm, setProjectClientForm] = useState({ project_id: '', client_organization_id: '' })
  const [projectClientError, setProjectClientError] = useState('')
  const [domainForms, setDomainForms] = useState({})
  const [domainErrors, setDomainErrors] = useState({})
  const selectedClientProject = clientProjects.find(
    (project) => String(project.id) === String(projectClientForm.project_id)
  )
  const selectedClientOrganization = clientOrganizations.find(
    (organization) => String(organization.id) === String(selectedClientProject?.client_organization_id)
  )

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

  const loadAssignments = () => {
    setAssignmentsLoading(true)
    fetchProjectAssignments()
      .then((res) => {
        setAssignments(res.data.data || res.data || [])
        setAssignmentsLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load project assignments:', err)
        setAssignmentsLoading(false)
      })
    fetchProjects()
      .then((res) => setAssignableProjects(res.data || []))
      .catch((err) => console.error('Failed to load projects:', err))
    fetchUsers({ per_page: 100 })
      .then((res) => {
        const rows = res.data.data || res.data || []
        setAssignableUsers(rows.filter((u) => ['Team Member', 'Client'].includes(u.role) && u.is_active))
      })
      .catch((err) => console.error('Failed to load users:', err))
  }

  const loadOwnerships = () => {
    setOwnershipsLoading(true)
    fetchProjectOwnerships()
      .then((res) => {
        setOwnerships(res.data.data || res.data || [])
        setOwnershipsLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load project ownerships:', err)
        setOwnershipsLoading(false)
      })
    fetchProjects()
      .then((res) => setOwnableProjects(res.data || []))
      .catch((err) => console.error('Failed to load projects:', err))
    fetchUsers({ role: 'Project Manager', status: 'active', per_page: 100 })
      .then((res) => {
        const rows = res.data.data || res.data || []
        setOwnablePms(rows)
      })
      .catch((err) => console.error('Failed to load users:', err))
  }

  const loadClients = () => {
    setClientsLoading(true)
    Promise.all([fetchClientOrganizations(), fetchProjects()])
      .then(async ([orgRes, projectRes]) => {
        const orgs = orgRes.data.data || orgRes.data || []
        setClientOrganizations(orgs)
        setClientProjects(projectRes.data || [])
        const domainPairs = await Promise.all(
          orgs.map((org) =>
            fetchClientDomains(org.id)
              .then((res) => [org.id, res.data.data || res.data || []])
              .catch((err) => {
                console.error(`Failed to load domains for client organization ${org.id}:`, err)
                return [org.id, []]
              })
          )
        )
        setClientDomainsByOrg(Object.fromEntries(domainPairs))
        setClientsLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load client access controls:', err)
        setClientsLoading(false)
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
    else if (activeTab === 'project-assignments') loadAssignments()
    else if (activeTab === 'project-ownership') loadOwnerships()
    else if (activeTab === 'clients') loadClients()
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

  const handlePreview = async (user) => {
    try {
      await startPreview(user)
    } catch (err) {
      console.error('Failed to start preview:', err)
      alert(err.response?.data?.message || 'Failed to start preview session.')
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

  // --- Project Assignment Actions (007-permission-hardening) ---
  const handleOpenAssignmentAdd = () => {
    setAssignmentForm({ user_id: '', project_id: '' })
    setAssignmentError('')
    setIsAssignmentDialogOpen(true)
  }

  const handleAssignmentSubmit = async (e) => {
    e.preventDefault()
    setAssignmentError('')
    try {
      await createProjectAssignment(assignmentForm)
      setIsAssignmentDialogOpen(false)
      loadAssignments()
    } catch (err) {
      console.error('Failed to create project assignment:', err)
      setAssignmentError(err.response?.data?.message || 'Failed to assign user to project.')
    }
  }

  const handleAssignmentDelete = async (id) => {
    if (confirm('Remove this project assignment?')) {
      try {
        await deleteProjectAssignment(id)
        loadAssignments()
      } catch (err) {
        console.error('Failed to remove project assignment:', err)
      }
    }
  }

  // --- Project Ownership Actions (008-project-ownership) ---
  const handleOpenOwnershipAdd = () => {
    setOwnershipForm({ user_id: '', project_id: '' })
    setOwnershipError('')
    setIsOwnershipDialogOpen(true)
  }

  const handleOwnershipSubmit = async (e) => {
    e.preventDefault()
    setOwnershipError('')
    try {
      await createProjectOwnership(ownershipForm)
      setIsOwnershipDialogOpen(false)
      loadOwnerships()
    } catch (err) {
      console.error('Failed to create project ownership:', err)
      setOwnershipError(err.response?.data?.message || 'Failed to assign owner to project.')
    }
  }

  const handleOwnershipDelete = async (id) => {
    if (confirm('Remove this project owner?')) {
      try {
        await deleteProjectOwnership(id)
        loadOwnerships()
      } catch (err) {
        console.error('Failed to remove project ownership:', err)
      }
    }
  }

  const handleOpenTransfer = (ownership) => {
    setTransferTarget(ownership)
    setTransferForm({ new_owner_user_id: '' })
    setTransferError('')
    setIsTransferDialogOpen(true)
  }

  const handleTransferSubmit = async (e) => {
    e.preventDefault()
    setTransferError('')
    try {
      await transferProjectOwnership(transferTarget.id, transferForm.new_owner_user_id)
      setIsTransferDialogOpen(false)
      setTransferTarget(null)
      loadOwnerships()
    } catch (err) {
      console.error('Failed to transfer project ownership:', err)
      setTransferError(err.response?.data?.message || 'Failed to transfer ownership.')
    }
  }

  // --- Client Organization Actions (011-project-client-access-control) ---
  const handleClientOrgSubmit = async (e) => {
    e.preventDefault()
    setClientOrgError('')
    try {
      await createClientOrganization(clientOrgForm)
      setClientOrgForm({ name: '', trusted_domain_policy: 'manual_approval' })
      loadClients()
    } catch (err) {
      console.error('Failed to create client organization:', err)
      setClientOrgError(err.response?.data?.message || 'Failed to create client organization.')
    }
  }

  const handlePolicyChange = async (organization, trustedDomainPolicy) => {
    try {
      await updateTrustedDomainPolicy(organization.id, trustedDomainPolicy)
      loadClients()
    } catch (err) {
      console.error('Failed to update trusted-domain policy:', err)
      alert(err.response?.data?.message || 'Failed to update trusted-domain policy.')
    }
  }

  const handleProjectClientSubmit = async (e) => {
    e.preventDefault()
    setProjectClientError('')
    try {
      await updateProjectClientOrganization(
        projectClientForm.project_id,
        projectClientForm.client_organization_id ? Number(projectClientForm.client_organization_id) : null
      )
      setProjectClientForm({ project_id: '', client_organization_id: '' })
      loadClients()
    } catch (err) {
      console.error('Failed to update project client organization:', err)
      setProjectClientError(err.response?.data?.message || 'Failed to update project client organization.')
    }
  }

  const handleProjectClientProjectChange = (projectId) => {
    const project = clientProjects.find((item) => String(item.id) === String(projectId))
    setProjectClientForm({
      project_id: projectId,
      client_organization_id: project?.client_organization_id
        ? String(project.client_organization_id)
        : '',
    })
  }

  const handleDomainSubmit = async (e, organization) => {
    e.preventDefault()
    const domain = domainForms[organization.id] || ''
    setDomainErrors({ ...domainErrors, [organization.id]: '' })
    try {
      await createClientDomain(organization.id, { domain })
      setDomainForms({ ...domainForms, [organization.id]: '' })
      loadClients()
    } catch (err) {
      console.error('Failed to verify client domain:', err)
      setDomainErrors({
        ...domainErrors,
        [organization.id]: err.response?.data?.message || 'Failed to verify domain.',
      })
    }
  }

  const handleDomainDelete = async (domain) => {
    if (!confirm(`Remove verified domain "${domain.domain}"?`)) {
      return
    }
    try {
      await deleteClientDomain(domain.id)
      loadClients()
    } catch (err) {
      console.error('Failed to remove client domain:', err)
      alert(err.response?.data?.message || 'Failed to remove domain.')
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
        <TabsList className="grid w-full grid-cols-7 max-w-274">
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
          <TabsTrigger value="project-assignments" className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4" />
            Project Assignments
          </TabsTrigger>
          <TabsTrigger value="project-ownership" className="flex items-center gap-2">
            <Crown className="h-4 w-4" />
            Project Ownership
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Clients
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
                    <Select
                      value={memberForm.side}
                      onValueChange={(v) => setMemberForm({ ...memberForm, side: v })}
                    >
                      <SelectTrigger id="member-side">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Vendor">Vendor</SelectItem>
                        <SelectItem value="Client">Client</SelectItem>
                      </SelectContent>
                    </Select>
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
                  <Select
                    value={userFilters.role || 'all'}
                    onValueChange={(v) => handleUserFilterChange('role', v === 'all' ? '' : v)}
                  >
                    <SelectTrigger id="user-filter-role" className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      {USER_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="user-filter-department" className="font-semibold">Department</label>
                  <Select
                    value={userFilters.department || 'all'}
                    onValueChange={(v) => handleUserFilterChange('department', v === 'all' ? '' : v)}
                  >
                    <SelectTrigger id="user-filter-department" className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Depts</SelectItem>
                      {DEPARTMENTS.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="user-filter-status" className="font-semibold">Status</label>
                  <Select
                    value={userFilters.status || 'all'}
                    onValueChange={(v) => handleUserFilterChange('status', v === 'all' ? '' : v)}
                  >
                    <SelectTrigger id="user-filter-status" className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
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
                                {u.is_active && u.role !== 'Admin' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handlePreview(u)}
                                    title="Preview as this user"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
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
                    <Select
                      value={userForm.role}
                      onValueChange={(v) => setUserForm({ ...userForm, role: v })}
                    >
                      <SelectTrigger id="user-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {USER_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="user-department" className="text-xs font-semibold">
                      Department{DEPARTMENT_REQUIRED_ROLES.includes(userForm.role) ? '' : ' (optional)'}
                    </label>
                    <Select
                      value={userForm.department}
                      onValueChange={(v) => setUserForm({ ...userForm, department: v })}
                    >
                      <SelectTrigger id="user-department">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <p className="text-xs border-t pt-2 border-border/80 flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Perfect for testing and prototyping role configurations before introducing production directory integrations (e.g. Active Directory/Okta).
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
                  <Select
                    value={grantForm.grantee_role}
                    onValueChange={(v) => setGrantForm({ ...grantForm, grantee_role: v })}
                  >
                    <SelectTrigger id="grant-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Department Head">Department Head</SelectItem>
                      <SelectItem value="Project Manager">Project Manager</SelectItem>
                      <SelectItem value="Team Member">Team Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="grant-grantee-department" className="text-xs font-semibold">Who is requestor (Grantee Department)</label>
                  <Select
                    value={grantForm.grantee_department}
                    onValueChange={(v) => setGrantForm({ ...grantForm, grantee_department: v })}
                  >
                    <SelectTrigger id="grant-grantee-department">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Engineering">Engineering</SelectItem>
                      <SelectItem value="IT">IT</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 font-bold text-center py-1">
                  <ArrowRight className="h-5 w-5 mx-auto rotate-90 text-muted-foreground" />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="grant-granted-department" className="text-xs font-semibold">Target Department to Reveal</label>
                  <Select
                    value={grantForm.granted_department}
                    onValueChange={(v) => setGrantForm({ ...grantForm, granted_department: v })}
                  >
                    <SelectTrigger id="grant-granted-department">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IT">IT</SelectItem>
                      <SelectItem value="Engineering">Engineering</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                    </SelectContent>
                  </Select>
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

        {/* ────────────────── PROJECT ASSIGNMENTS PANEL ────────────────── */}
        <TabsContent value="project-assignments" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Project Assignments</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Assign Team Members and Clients to the specific projects they may access
              </p>
            </div>
            <Button onClick={handleOpenAssignmentAdd}>
              <Plus className="h-4 w-4 mr-2" />
              New Assignment
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Active Project Assignments</CardTitle>
              <CardDescription>
                Every explicit grant of a Team Member or Client to a specific project
              </CardDescription>
            </CardHeader>
            <CardContent>
              {assignmentsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading assignments...
                </div>
              ) : assignments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No project assignments have been created yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Assigned By</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell className="font-medium">{assignment.user.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{assignment.user.role}</Badge>
                        </TableCell>
                        <TableCell>{assignment.project.name}</TableCell>
                        <TableCell className="text-muted-foreground">{assignment.assigned_by.name}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleAssignmentDelete(assignment.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Project Assignment Dialog */}
          <Dialog open={isAssignmentDialogOpen} onOpenChange={setIsAssignmentDialogOpen}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>Assign User to Project</DialogTitle>
                <DialogDescription>
                  Grant a Team Member or Client access to exactly one project.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAssignmentSubmit} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="assignment-user" className="text-xs font-semibold">User</label>
                  <Select
                    required
                    value={assignmentForm.user_id ? String(assignmentForm.user_id) : ''}
                    onValueChange={(v) => setAssignmentForm({ ...assignmentForm, user_id: v })}
                  >
                    <SelectTrigger id="assignment-user">
                      <SelectValue placeholder="Select a Team Member or Client" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableUsers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="assignment-project" className="text-xs font-semibold">Project</label>
                  <Select
                    required
                    value={assignmentForm.project_id ? String(assignmentForm.project_id) : ''}
                    onValueChange={(v) => setAssignmentForm({ ...assignmentForm, project_id: v })}
                  >
                    <SelectTrigger id="assignment-project">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableProjects.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {assignmentError && (
                  <p className="text-xs text-destructive">{assignmentError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsAssignmentDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Assign</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ────────────────── PROJECT OWNERSHIP PANEL ────────────────── */}
        <TabsContent value="project-ownership" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Project Ownership</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Designate the Project Manager(s) who administer each project's Team Member/Client access
              </p>
            </div>
            <Button onClick={handleOpenOwnershipAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Assign Owner
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Project Owners</CardTitle>
              <CardDescription>
                A project with no owner listed here remains unrestricted for any Project Manager (rollout default)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ownershipsLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                  Loading ownerships...
                </div>
              ) : ownerships.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No project owners have been assigned yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Owner</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Assigned By</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ownerships.map((ownership) => (
                      <TableRow key={ownership.id}>
                        <TableCell className="font-medium">{ownership.user.name}</TableCell>
                        <TableCell>{ownership.project.name}</TableCell>
                        <TableCell className="text-muted-foreground">{ownership.assigned_by.name}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenTransfer(ownership)}
                          >
                            <ArrowRight className="h-4 w-4 mr-1" />
                            Transfer
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOwnershipDelete(ownership.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Assign Owner Dialog */}
          <Dialog open={isOwnershipDialogOpen} onOpenChange={setIsOwnershipDialogOpen}>
            <DialogContent className="sm:max-w-100">
              <DialogHeader>
                <DialogTitle>Assign Project Owner</DialogTitle>
                <DialogDescription>
                  Designate an active Project Manager as an owner of a project. A project may have more than one owner.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleOwnershipSubmit} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="ownership-user" className="text-xs font-semibold">Project Manager</label>
                  <Select
                    required
                    value={ownershipForm.user_id ? String(ownershipForm.user_id) : ''}
                    onValueChange={(v) => setOwnershipForm({ ...ownershipForm, user_id: v })}
                  >
                    <SelectTrigger id="ownership-user">
                      <SelectValue placeholder="Select a Project Manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {ownablePms.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="ownership-project" className="text-xs font-semibold">Project</label>
                  <Select
                    required
                    value={ownershipForm.project_id ? String(ownershipForm.project_id) : ''}
                    onValueChange={(v) => setOwnershipForm({ ...ownershipForm, project_id: v })}
                  >
                    <SelectTrigger id="ownership-project">
                      <SelectValue placeholder="Select a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {ownableProjects.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {ownershipError && (
                  <p className="text-xs text-destructive">{ownershipError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsOwnershipDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Assign</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {/* Transfer Ownership Dialog */}
          <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
            <DialogContent className="sm:max-w-100">
              <DialogHeader>
                <DialogTitle>Transfer Ownership</DialogTitle>
                <DialogDescription>
                  {transferTarget && (
                    <>Move {transferTarget.project.name}'s ownership from {transferTarget.user.name} to a different Project Manager.</>
                  )}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleTransferSubmit} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="transfer-new-owner" className="text-xs font-semibold">New Owner</label>
                  <Select
                    required
                    value={transferForm.new_owner_user_id ? String(transferForm.new_owner_user_id) : ''}
                    onValueChange={(v) => setTransferForm({ ...transferForm, new_owner_user_id: v })}
                  >
                    <SelectTrigger id="transfer-new-owner">
                      <SelectValue placeholder="Select a Project Manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {ownablePms
                        .filter((u) => u.id !== transferTarget?.user.id)
                        .map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {transferError && (
                  <p className="text-xs text-destructive">{transferError}</p>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsTransferDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Transfer</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ────────────────── CLIENTS PANEL ────────────────── */}
        <TabsContent value="clients" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Client Organizations</CardTitle>
                  <CardDescription>
                    Manage client records, trusted-domain policies, and verified corporate domains
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={loadClients} className="h-8">
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {clientsLoading ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                    Loading clients...
                  </div>
                ) : clientOrganizations.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    No client organizations have been created yet.
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Client</TableHead>
                          <TableHead>Policy</TableHead>
                          <TableHead>Projects</TableHead>
                          <TableHead>Domains</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientOrganizations.map((organization) => {
                          const domains = clientDomainsByOrg[organization.id] || []
                          const verifiedDomains = domains.filter((domain) => domain.status === 'verified')
                          const associatedProjects = clientProjects.filter(
                            (project) => String(project.client_organization_id) === String(organization.id)
                          )
                          return (
                            <TableRow key={organization.id}>
                              <TableCell>
                                <div className="font-medium">{organization.name}</div>
                                <div className="text-xs text-muted-foreground">{organization.slug}</div>
                              </TableCell>
                              <TableCell className="min-w-52">
                                <Select
                                  value={organization.trusted_domain_policy}
                                  onValueChange={(v) => handlePolicyChange(organization, v)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TRUSTED_DOMAIN_POLICIES.map(([value, label]) => (
                                      <SelectItem key={value} value={value}>{label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="min-w-56">
                                <div className="flex flex-wrap gap-1.5">
                                  {associatedProjects.map((project) => (
                                    <Badge key={project.id} variant="outline" className="gap-1">
                                      <FolderKanban className="h-3 w-3" />
                                      {project.name}
                                    </Badge>
                                  ))}
                                  {associatedProjects.length === 0 && (
                                    <span className="text-xs text-muted-foreground">No linked projects</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1.5">
                                  {verifiedDomains.map((domain) => (
                                    <Badge key={domain.id} variant="secondary" className="gap-1">
                                      <Globe2 className="h-3 w-3" />
                                      {domain.domain}
                                      <button
                                        type="button"
                                        onClick={() => handleDomainDelete(domain)}
                                        className="ml-1 rounded-sm hover:text-destructive"
                                        title="Remove domain"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </Badge>
                                  ))}
                                  {verifiedDomains.length === 0 && (
                                    <span className="text-xs text-muted-foreground">No verified domains</span>
                                  )}
                                </div>
                                <form onSubmit={(e) => handleDomainSubmit(e, organization)} className="mt-2 flex gap-2">
                                  <Input
                                    value={domainForms[organization.id] || ''}
                                    onChange={(e) => setDomainForms({ ...domainForms, [organization.id]: e.target.value })}
                                    placeholder="client.example"
                                    className="h-8 text-xs"
                                  />
                                  <Button size="sm" variant="outline" className="h-8" type="submit">
                                    <Plus className="h-3.5 w-3.5" />
                                    Verify
                                  </Button>
                                </form>
                                {domainErrors[organization.id] && (
                                  <p className="mt-1 text-xs text-destructive">{domainErrors[organization.id]}</p>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Create Client</CardTitle>
                  <CardDescription>Add a client organization with its initial trusted-domain policy</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleClientOrgSubmit} className="space-y-3">
                    <div className="space-y-1.5">
                      <label htmlFor="client-org-name" className="text-xs font-semibold">Name</label>
                      <Input
                        id="client-org-name"
                        required
                        value={clientOrgForm.name}
                        onChange={(e) => setClientOrgForm({ ...clientOrgForm, name: e.target.value })}
                        placeholder="Acme Corporation"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="client-org-policy" className="text-xs font-semibold">Trusted-Domain Policy</label>
                      <Select
                        value={clientOrgForm.trusted_domain_policy}
                        onValueChange={(v) => setClientOrgForm({ ...clientOrgForm, trusted_domain_policy: v })}
                      >
                        <SelectTrigger id="client-org-policy">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRUSTED_DOMAIN_POLICIES.map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {clientOrgError && <p className="text-xs text-destructive">{clientOrgError}</p>}
                    <Button type="submit" className="w-full">
                      <Plus className="h-4 w-4" />
                      Create Client
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Project Client</CardTitle>
                  <CardDescription>Associate a project with a client organization or clear the association</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleProjectClientSubmit} className="space-y-3">
                    <div className="space-y-1.5">
                      <label htmlFor="project-client-project" className="text-xs font-semibold">Project</label>
                      <Select
                        required
                        value={projectClientForm.project_id ? String(projectClientForm.project_id) : ''}
                        onValueChange={handleProjectClientProjectChange}
                      >
                        <SelectTrigger id="project-client-project">
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                        <SelectContent>
                          {clientProjects.map((project) => (
                            <SelectItem key={project.id} value={String(project.id)}>
                              {project.name}
                              {project.client_organization_id ? ' - linked' : ' - no client'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {projectClientForm.project_id && (
                        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-semibold">{selectedClientProject?.name}</span>
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            Current client:{' '}
                            <span className="font-medium text-foreground">
                              {selectedClientOrganization?.name || 'No client organization'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="project-client-organization" className="text-xs font-semibold">Client Organization</label>
                      <Select
                        value={projectClientForm.client_organization_id ? String(projectClientForm.client_organization_id) : 'none'}
                        onValueChange={(v) =>
                          setProjectClientForm({
                            ...projectClientForm,
                            client_organization_id: v === 'none' ? '' : v,
                          })
                        }
                      >
                        <SelectTrigger id="project-client-organization">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No client organization</SelectItem>
                          {clientOrganizations.map((organization) => (
                            <SelectItem key={organization.id} value={String(organization.id)}>{organization.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {projectClientError && <p className="text-xs text-destructive">{projectClientError}</p>}
                    <Button type="submit" className="w-full">
                      <Link2 className="h-4 w-4" />
                      Save Association
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
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
                  <Select
                    value={logFilters.action || 'all'}
                    onValueChange={(v) => handleLogFilterChange('action', v === 'all' ? '' : v)}
                  >
                    <SelectTrigger id="log-filter-action" className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      <SelectItem value="project.created">Project Created</SelectItem>
                      <SelectItem value="project.updated">Project Updated</SelectItem>
                      <SelectItem value="project.deleted">Project Deleted</SelectItem>
                      <SelectItem value="project.health_updated">Health Updated</SelectItem>
                      <SelectItem value="task.created">Task Created</SelectItem>
                      <SelectItem value="task.updated">Task Updated</SelectItem>
                      <SelectItem value="task.deleted">Task Deleted</SelectItem>
                      <SelectItem value="task.status_changed">Status Changed</SelectItem>
                      <SelectItem value="member.created">Member Created</SelectItem>
                      <SelectItem value="member.updated">Member Updated</SelectItem>
                      <SelectItem value="member.deleted">Member Deleted</SelectItem>
                      <SelectItem value="department_grant.created">Grant Created</SelectItem>
                      <SelectItem value="department_grant.deleted">Grant Deleted</SelectItem>
                      <SelectItem value="project_assignment.created">Assignment Created</SelectItem>
                      <SelectItem value="project_assignment.deleted">Assignment Deleted</SelectItem>
                      <SelectItem value="project_ownership.created">Owner Assigned</SelectItem>
                      <SelectItem value="project_ownership.deleted">Owner Removed</SelectItem>
                      <SelectItem value="project_ownership.transferred">Ownership Transferred</SelectItem>
                      <SelectItem value="permission.denied">Access Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="log-filter-entity-type" className="font-semibold">Entity Type</label>
                  <Select
                    value={logFilters.entity_type || 'all'}
                    onValueChange={(v) => handleLogFilterChange('entity_type', v === 'all' ? '' : v)}
                  >
                    <SelectTrigger id="log-filter-entity-type" className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="detailed_activity">Task</SelectItem>
                      <SelectItem value="team_member">Team Member</SelectItem>
                      <SelectItem value="department_grant">Dept Grant</SelectItem>
                      <SelectItem value="project_assignment">Project Assignment</SelectItem>
                      <SelectItem value="project_ownership">Project Ownership</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="log-filter-actor-role" className="font-semibold">Actor Role</label>
                  <Select
                    value={logFilters.actor_role || 'all'}
                    onValueChange={(v) => handleLogFilterChange('actor_role', v === 'all' ? '' : v)}
                  >
                    <SelectTrigger id="log-filter-actor-role" className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Project Manager">Project Manager</SelectItem>
                      <SelectItem value="Team Member">Team Member</SelectItem>
                      <SelectItem value="Department Head">Department Head</SelectItem>
                      <SelectItem value="Client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="log-filter-actor-dept" className="font-semibold">Actor Dept</label>
                  <Select
                    value={logFilters.actor_dept || 'all'}
                    onValueChange={(v) => handleLogFilterChange('actor_dept', v === 'all' ? '' : v)}
                  >
                    <SelectTrigger id="log-filter-actor-dept" className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Depts</SelectItem>
                      <SelectItem value="IT">IT</SelectItem>
                      <SelectItem value="Engineering">Engineering</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                    </SelectContent>
                  </Select>
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
                          const isDenied = log.action === 'permission.denied'
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
