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
  approveProjectMembership,
  expireProjectMembership,
  fetchClientMembershipReview,
  rejectProjectMembership,
  removeProjectMembership,
  restoreProjectMembership,
  suspendProjectMembership,
} from '@/lib/api'
import { Filter, RefreshCw } from 'lucide-react'

const REVIEW_STATES = ['pending', 'approved', 'rejected', 'expired', 'suspended', 'removed']
const DOMAIN_TYPES = [
  ['verified_corporate', 'Verified corporate'],
  ['public_provider', 'Public provider'],
  ['unverified', 'Unverified'],
]

function stateVariant(state) {
  if (state === 'pending') return 'secondary'
  if (state === 'suspended') return 'warning'
  return 'destructive'
}

export default function ClientMembershipReviewQueue() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    state: 'pending',
    domain_type: 'public_provider',
    older_than_days: '',
  })

  const loadQueue = (filtersToUse = filters) => {
    setLoading(true)
    const params = {}
    Object.entries(filtersToUse).forEach(([key, value]) => {
      if (value !== '' && value !== 'all') params[key] = value
    })
    fetchClientMembershipReview(params)
      .then((res) => {
        setRows(res.data.data || res.data || [])
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load client membership review queue:', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    loadQueue()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial queue load only
  }, [])

  const handleFilterChange = (key, value) => {
    const updated = { ...filters, [key]: value }
    setFilters(updated)
    loadQueue(updated)
  }

  const handleClearFilters = () => {
    const reset = { state: 'all', domain_type: 'all', older_than_days: '' }
    setFilters(reset)
    loadQueue(reset)
  }

  const handleTransition = async (membership, action, run) => {
    try {
      await run(membership.id)
      loadQueue()
    } catch (err) {
      console.error(`Failed to ${action} membership:`, err)
      alert(err.response?.data?.message || `Failed to ${action} membership.`)
    }
  }

  const transitionActions = (membership) => {
    if (membership.state === 'pending') {
      return [
        ['Approve', 'success', approveProjectMembership],
        ['Reject', 'destructive', rejectProjectMembership],
        ['Expire', 'outline', expireProjectMembership],
      ]
    }
    if (membership.state === 'approved') {
      return [
        ['Suspend', 'warning', suspendProjectMembership],
        ['Remove', 'destructive', removeProjectMembership],
      ]
    }
    if (membership.state === 'suspended') {
      return [
        ['Restore', 'success', restoreProjectMembership],
        ['Remove', 'destructive', removeProjectMembership],
      ]
    }
    return []
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Client Membership Review</CardTitle>
          <CardDescription>Pending and exceptional client access awaiting review</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => loadQueue()} className="h-8">
          <RefreshCw className="h-3.5 w-3.5 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
          <Select value={filters.state} onValueChange={(value) => handleFilterChange('state', value)}>
            <SelectTrigger aria-label="Review state">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All review states</SelectItem>
              {REVIEW_STATES.map((state) => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.domain_type} onValueChange={(value) => handleFilterChange('domain_type', value)}>
            <SelectTrigger aria-label="Domain type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All domain types</SelectItem>
              {DOMAIN_TYPES.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            min="0"
            type="number"
            value={filters.older_than_days}
            onChange={(e) => handleFilterChange('older_than_days', e.target.value)}
            placeholder="Older than days"
            aria-label="Older than days"
          />
          <Button
            type="button"
            variant="ghost"
            onClick={handleClearFilters}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            Clear
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading review queue...
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Membership</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      No memberships match the current review filters.
                    </TableCell>
                  </TableRow>
                ) : rows.map((membership) => (
                  <TableRow key={membership.id}>
                    <TableCell>
                      <div className="font-medium">User #{membership.user_id}</div>
                      <div className="text-xs text-muted-foreground">Client org #{membership.client_organization_id}</div>
                    </TableCell>
                    <TableCell className="text-xs">{membership.role}</TableCell>
                    <TableCell>
                      <Badge variant={stateVariant(membership.state)}>{membership.state}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">Project #{membership.project_id}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {transitionActions(membership).map(([label, variant, run]) => (
                          <Button
                            key={label}
                            size="sm"
                            variant={variant}
                            className="h-7 px-2 text-xs"
                            onClick={() => handleTransition(membership, label.toLowerCase(), run)}
                          >
                            {label}
                          </Button>
                        ))}
                        {transitionActions(membership).length === 0 && (
                          <span className="text-xs text-muted-foreground">No actions</span>
                        )}
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
  )
}
