import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react'
import { useEffectiveUser } from '@/context/PreviewContext'
import AccessDenied from '@/components/AccessDenied'
import ProjectClientAccessPanel from '@/components/ProjectClientAccessPanel'
import ClientMembershipReviewQueue from '@/components/ClientMembershipReviewQueue'
import { fetchProject } from '@/lib/api'

/**
 * Client Access + Membership Review used to render inline on the Work
 * Program page, above the module tree, at full weight — always mounted
 * whenever the acting user had permission, whether or not there was
 * anything to review. That buried the page's actual content (the module
 * tree) below two admin panels that are touched occasionally, not every
 * visit. This is its own destination instead: reached via the Access
 * icon-button next to "Manage Projects" on Work Program, not a primary
 * sidebar nav item, since it's a secondary function of a specific project
 * rather than a top-level workspace area.
 *
 * Note the two sections have different scope: ProjectClientAccessPanel is
 * scoped to the `project` query param; ClientMembershipReviewQueue is a
 * global cross-project moderation queue (it takes no projectId — see its
 * own fetchClientMembershipReview() call) and is shown here because
 * reviewing access is the same task as managing it, not because the data
 * is specific to this project.
 */
export default function ProjectAccess() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('project') ? Number(searchParams.get('project')) : null

  const user = useEffectiveUser()
  const userRole = user?.role
  const canReviewClientMemberships = ['Admin', 'Project Manager'].includes(userRole)

  const [project, setProject] = useState(null)
  // Only start in a loading state if there's actually a project to fetch —
  // otherwise the "no project selected" branch below never has anything to
  // resolve, and would need a setState-in-effect just to turn loading back off.
  const [loading, setLoading] = useState(!!projectId)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!projectId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    setLoading(true)
    setError(null)
    fetchProject(projectId)
      .then((res) => setProject(res.data.data || res.data))
      .catch((err) => {
        console.error('Failed to fetch project:', err)
        setError(err.response?.status === 403 ? 'access-denied' : 'error')
      })
      .finally(() => setLoading(false))
  }, [projectId])

  if (!projectId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground max-w-sm">
          No project selected. Go back to Work Program and pick a project first.
        </p>
        <Link to="/work-program" className="text-sm text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
          Back to Work Program
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
        <RefreshCw className="h-7 w-7 animate-spin" />
        <span className="text-sm">Loading project access…</span>
      </div>
    )
  }

  if (error === 'access-denied') {
    return <AccessDenied message="You do not have access to this resource." />
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-destructive font-medium">Failed to load project.</p>
      </div>
    )
  }

  const canManageClientAccess = project?.can_manage_client_access === true

  if (!canManageClientAccess && !canReviewClientMemberships) {
    return <AccessDenied message="You do not have permission to manage client access for this project." />
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/work-program?project=${projectId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Work Program
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Client Access</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {project?.name ? `Governance and access for ${project.name}` : 'Project access governance'}
        </p>
      </div>

      {canManageClientAccess && (
        <ProjectClientAccessPanel
          projectId={projectId}
          clientOrganizationId={project?.client_organization_id}
        />
      )}

      {canReviewClientMemberships && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Org-wide review queue — not limited to this project
          </p>
          <ClientMembershipReviewQueue />
        </div>
      )}
    </div>
  )
}
