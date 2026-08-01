import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  createProjectInvitation,
  fetchProjectInvitations,
  fetchProjectMemberships,
} from '@/lib/api'
import { MailPlus, RefreshCw, ShieldCheck } from 'lucide-react'

const CLIENT_ROLES = [
  ['client_viewer', 'Viewer'],
  ['client_contributor', 'Contributor'],
  ['client_admin', 'Client Admin'],
]

function stateVariant(state) {
  if (state === 'approved') return 'success'
  if (['rejected', 'removed', 'expired'].includes(state)) return 'destructive'
  if (state === 'suspended') return 'warning'
  return 'secondary'
}

export default function ProjectClientAccessPanel({ projectId, clientOrganizationId }) {
  const [invitations, setInvitations] = useState([])
  const [memberships, setMemberships] = useState([])
  const [loading, setLoading] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'client_viewer',
  })
  const [inviteError, setInviteError] = useState('')

  const loadAccess = () => {
    if (!projectId) return
    setLoading(true)
    Promise.all([fetchProjectInvitations(projectId), fetchProjectMemberships(projectId)])
      .then(([invitationRes, membershipRes]) => {
        setInvitations(invitationRes.data.data || invitationRes.data || [])
        setMemberships(membershipRes.data.data || membershipRes.data || [])
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load project client access:', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    loadAccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectId is the only reload boundary for this panel
  }, [projectId])

  const handleInviteSubmit = async (e) => {
    e.preventDefault()
    setInviteError('')
    try {
      await createProjectInvitation(projectId, {
        ...inviteForm,
        client_organization_id: Number(clientOrganizationId),
      })
      setInviteForm({ email: '', role: 'client_viewer' })
      loadAccess()
    } catch (err) {
      console.error('Failed to create project invitation:', err)
      const errors = err.response?.data?.errors
      const firstError = errors ? Object.values(errors)[0]?.[0] : null
      setInviteError(firstError || err.response?.data?.message || 'Failed to create invitation.')
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Client Access</CardTitle>
          <CardDescription>Project invitations and client memberships for this project</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={loadAccess} className="h-8">
          <RefreshCw className="h-3.5 w-3.5 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleInviteSubmit} className="grid gap-3 md:grid-cols-[1.4fr_1fr_auto]">
          <Input
            required
            type="email"
            value={inviteForm.email}
            onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
            placeholder="client@example.com"
            aria-label="Invite email"
          />
          <Select
            value={inviteForm.role}
            onValueChange={(value) => setInviteForm({ ...inviteForm, role: value })}
          >
            <SelectTrigger aria-label="Project client role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIENT_ROLES.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={!clientOrganizationId}>
            <MailPlus className="h-4 w-4" />
            Invite
          </Button>
        </form>
        {!clientOrganizationId && (
          <p className="text-xs text-muted-foreground">
            Associate this project with a client organization before sending invitations.
          </p>
        )}
        {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading client access...
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invitation</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                        No invitations for this project.
                      </TableCell>
                    </TableRow>
                  ) : invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell>
                        <div className="font-medium">{invitation.email}</div>
                        <div className="text-xs text-muted-foreground">{invitation.email_domain}</div>
                      </TableCell>
                      <TableCell className="text-xs">{invitation.role}</TableCell>
                      <TableCell>
                        <Badge variant={stateVariant(invitation.state)}>{invitation.state}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {invitation.expires_at ? new Date(invitation.expires_at).toLocaleDateString() : 'No expiry'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memberships.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                        No client memberships for this project.
                      </TableCell>
                    </TableRow>
                  ) : memberships.map((membership) => (
                    <TableRow key={membership.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          User #{membership.user_id}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Client org #{membership.client_organization_id}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{membership.role}</TableCell>
                      <TableCell>
                        <Badge variant={stateVariant(membership.state)}>{membership.state}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
