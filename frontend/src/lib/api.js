import axios from 'axios'
import { getPreviewToken } from './previewSession'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Lets AuthContext react to a session ending mid-use (expiry, invalidation,
// disabled account) the same way it reacts to explicit sign-out — any 401
// from any request clears the signed-in user, and RequireAuth takes it from
// there. Registered by AuthContext on mount via setUnauthorizedHandler.
let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

// 007-permission-hardening: lets PreviewContext react when the server
// reports an active preview token is no longer valid (expired, target
// disabled, target role changed) — reads the reason straight off the 409
// body ResolvePreviewSession returns. Registered by PreviewContext on mount.
let onPreviewEnded = null
export function setPreviewEndedHandler(fn) {
  onPreviewEnded = fn
}

// Attaches the active preview token (if any) to every outgoing request —
// the one seam that makes every read reflect the previewed user's access
// instead of the real Admin's own.
api.interceptors.request.use((config) => {
  const token = getPreviewToken()
  if (token) {
    config.headers['X-Preview-Session'] = token
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      onUnauthorized?.()
    }
    if (error.response?.headers?.['x-preview-ended']) {
      onPreviewEnded?.(error.response.data?.reason)
    }
    return Promise.reject(error)
  }
)

// Dashboard
export const fetchDashboard = () => api.get('/dashboard')

// Projects
export const fetchProjects = () => api.get('/projects')
export const fetchProject = (id) => api.get(`/projects/${id}`)
export const createProject = (data) => api.post('/projects', data)
export const updateProject = (id, data) => api.put(`/projects/${id}`, data)
export const deleteProject = (id) => api.delete(`/projects/${id}`)
export const updateProjectClientOrganization = (projectId, clientOrganizationId) =>
  api.patch(`/projects/${projectId}/client-organization`, { client_organization_id: clientOrganizationId })

// Modules
export const fetchModules = (projectId) => api.get(`/projects/${projectId}/modules`)
export const fetchModule = (id) => api.get(`/modules/${id}`)
export const createModule = (projectId, data) => api.post(`/projects/${projectId}/modules`, data)
export const updateModule = (id, data) => api.put(`/modules/${id}`, data)
export const deleteModule = (id) => api.delete(`/modules/${id}`)

// Activities
export const fetchActivities = (moduleId) => api.get(`/modules/${moduleId}/activities`)
export const fetchActivity = (id) => api.get(`/activities/${id}`)
export const createActivity = (moduleId, data) => api.post(`/modules/${moduleId}/activities`, data)
export const updateActivity = (id, data) => api.put(`/activities/${id}`, data)
export const deleteActivity = (id) => api.delete(`/activities/${id}`)

// Sub-Activities
export const fetchSubActivities = (activityId) => api.get(`/activities/${activityId}/sub-activities`)
export const fetchSubActivity = (id) => api.get(`/sub-activities/${id}`)
export const createSubActivity = (activityId, data) => api.post(`/activities/${activityId}/sub-activities`, data)
export const updateSubActivity = (id, data) => api.put(`/sub-activities/${id}`, data)
export const deleteSubActivity = (id) => api.delete(`/sub-activities/${id}`)

// Detailed Activities
export const fetchDetailedActivities = (subActivityId) => api.get(`/sub-activities/${subActivityId}/detailed-activities`)
export const fetchDetailedActivity = (id) => api.get(`/detailed-activities/${id}`)
export const createDetailedActivity = (subActivityId, data) => api.post(`/sub-activities/${subActivityId}/detailed-activities`, data)
export const updateDetailedActivity = (id, data) => api.put(`/detailed-activities/${id}`, data)
export const deleteDetailedActivity = (id) => api.delete(`/detailed-activities/${id}`)

// Team Members
export const fetchTeamMembers = () => api.get('/team-members')
export const fetchTeamMember = (id) => api.get(`/team-members/${id}`)
export const createTeamMember = (data) => api.post('/team-members', data)
export const updateTeamMember = (id, data) => api.put(`/team-members/${id}`, data)
export const deleteTeamMember = (id) => api.delete(`/team-members/${id}`)

// Glossary Terms
export const fetchGlossaryTerms = () => api.get('/glossary-terms')
export const fetchGlossaryTerm = (id) => api.get(`/glossary-terms/${id}`)
export const createGlossaryTerm = (data) => api.post('/glossary-terms', data)
export const updateGlossaryTerm = (id, data) => api.put(`/glossary-terms/${id}`, data)
export const deleteGlossaryTerm = (id) => api.delete(`/glossary-terms/${id}`)

// Attachments (nested under detailed-activities)
export const fetchAttachments  = (detailedActivityId) =>
  api.get(`/detailed-activities/${detailedActivityId}/attachments`)

// Note: do NOT set Content-Type manually — Axios sets it with the correct multipart boundary
export const uploadAttachment  = (detailedActivityId, formData, onUploadProgress) =>
  api.post(`/detailed-activities/${detailedActivityId}/attachments`, formData, { onUploadProgress })

export const deleteAttachment  = (id) => api.delete(`/attachments/${id}`)

/**
 * Download a protected attachment via Axios (preserves session cookie auth).
 * Using <a href> would bypass auth and fail access control.
 */
export const downloadAttachment = async (id, filename) => {
  const response = await api.get(`/attachments/${id}/download`, { responseType: 'blob' })
  const url  = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href  = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

// Comments (nested under detailed-activities)
export const fetchComments = (detailedActivityId) => api.get(`/detailed-activities/${detailedActivityId}/comments`)
export const createComment = (detailedActivityId, data) => api.post(`/detailed-activities/${detailedActivityId}/comments`, data)
export const deleteComment = (commentId) => api.delete(`/comments/${commentId}`)

// Notifications
export const fetchNotifications = () => api.get('/notifications')
export const markNotificationRead = (id) => api.put(`/notifications/${id}/read`)
export const markAllNotificationsRead = () => api.post('/notifications/read-all')

// Reports and Project Health
export const updateProjectHealth = (projectId, data) => api.patch(`/projects/${projectId}/health`, data)
export const fetchReports = (params) => api.get('/reports', { params })
export const downloadReportCsv = async (params) => {
  const response = await api.get('/reports/export-csv', { params, responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'project-report.csv')
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

// Audit Logs & Department Grants (Admin only)
export const fetchAuditLogs = (params) => api.get('/audit-logs', { params })
export const fetchDepartmentGrants = () => api.get('/department-grants')
export const createDepartmentGrant = (data) => api.post('/department-grants', data)
export const deleteDepartmentGrant = (id) => api.delete(`/department-grants/${id}`)

// Client Access Control (011-project-client-access-control)
export const fetchClientOrganizations = (params) => api.get('/client-organizations', { params })
export const createClientOrganization = (data) => api.post('/client-organizations', data)
export const updateTrustedDomainPolicy = (clientOrganizationId, trustedDomainPolicy) =>
  api.patch(`/client-organizations/${clientOrganizationId}/trusted-domain-policy`, {
    trusted_domain_policy: trustedDomainPolicy,
  })
export const fetchClientDomains = (clientOrganizationId) =>
  api.get(`/client-organizations/${clientOrganizationId}/domains`)
export const createClientDomain = (clientOrganizationId, data) =>
  api.post(`/client-organizations/${clientOrganizationId}/domains`, data)
export const deleteClientDomain = (clientDomainId) => api.delete(`/client-domains/${clientDomainId}`)
export const fetchClientMembershipReview = (params) => api.get('/client-membership-review', { params })
export const fetchProjectInvitations = (projectId, params) =>
  api.get(`/projects/${projectId}/invitations`, { params })
export const createProjectInvitation = (projectId, data) => api.post(`/projects/${projectId}/invitations`, data)
export const acceptProjectInvitation = (token) => api.post('/project-invitations/accept', { token })
export const fetchProjectMemberships = (projectId, params) =>
  api.get(`/projects/${projectId}/memberships`, { params })
export const approveProjectMembership = (projectMembershipId) =>
  api.post(`/project-memberships/${projectMembershipId}/approve`)
export const rejectProjectMembership = (projectMembershipId, data) =>
  api.post(`/project-memberships/${projectMembershipId}/reject`, data)
export const suspendProjectMembership = (projectMembershipId) =>
  api.post(`/project-memberships/${projectMembershipId}/suspend`)
export const restoreProjectMembership = (projectMembershipId) =>
  api.post(`/project-memberships/${projectMembershipId}/restore`)
export const removeProjectMembership = (projectMembershipId) =>
  api.post(`/project-memberships/${projectMembershipId}/remove`)
export const expireProjectMembership = (projectMembershipId) =>
  api.post(`/project-memberships/${projectMembershipId}/expire`)

// User Accounts (006-real-user-management, Admin only) — real, sign-in-capable
// accounts. Distinct from Team Members above, which is a non-authenticating
// job-title roster.
export const fetchUsers = (params) => api.get('/users', { params })
export const createUser = (data) => api.post('/users', data)
export const updateUser = (id, data) => api.patch(`/users/${id}`, data)
export const disableUser = (id) => api.post(`/users/${id}/disable`)
export const reactivateUser = (id) => api.post(`/users/${id}/reactivate`)
export const resetUserPassword = (id, data) => api.post(`/users/${id}/reset-password`, data)

// Project Assignments (007-permission-hardening, Admin/PM only) — scopes a
// Team Member/Client's visibility to specific projects instead of their
// whole department.
export const fetchProjectAssignments = (params) => api.get('/project-assignments', { params })
export const createProjectAssignment = (data) => api.post('/project-assignments', data)
export const deleteProjectAssignment = (id) => api.delete(`/project-assignments/${id}`)

// Project Ownership (008-project-ownership, Admin only) — the real,
// user-linked relationship that scopes a Project Manager's authority to
// assign/remove Team Member/Client access to only the projects they own.
export const fetchProjectOwnerships = (params) => api.get('/project-ownerships', { params })
export const createProjectOwnership = (data) => api.post('/project-ownerships', data)
export const deleteProjectOwnership = (id) => api.delete(`/project-ownerships/${id}`)
export const transferProjectOwnership = (id, newOwnerUserId) =>
  api.post(`/project-ownerships/${id}/transfer`, { new_owner_user_id: newOwnerUserId })

// Support Ops Knowledge Base (009-support-ops-knowledge-base) — a read-only
// search/browse view over resolved Support Ops issues that already have a
// root cause and resolution recorded. Thin passthrough, not a per-field
// whitelist, so it already accepts every filter param (project_id/
// client_name/tenant_name/client_priority) alongside q/page/per_page.
export const fetchSupportOpsKnowledgeBase = (params) => api.get('/support-ops/knowledge-base', { params })

// Preview Sessions (007-permission-hardening, Admin only) — read-only
// "preview as user" mode. startPreview's response includes `token` exactly
// once; the caller is responsible for persisting it (see PreviewContext).
export const startPreview = (targetUserId) => api.post('/preview-sessions', { target_user_id: targetUserId })
export const endPreview = () => api.delete('/preview-sessions/current')

// Support Ops
export const fetchSupportIssues = (projectId, workTypes = 'support') =>
  api.get('/support-ops', { params: { project_id: projectId, work_types: workTypes } })
export const createSupportIssue = (data) => api.post('/support-ops', data)
export const logSupportGeneration = (issueId, { artifact_type, template_stage, issue_updated_at }) =>
  api.post(`/support-ops/${issueId}/generation-log`, { artifact_type, template_stage, issue_updated_at })
export const fetchTodayDashboard = () => api.get('/support-ops/today')

export default api
