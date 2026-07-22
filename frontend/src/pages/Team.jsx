import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
} from '@/lib/api'
import { Search, Plus, Edit, Trash2, Users, Mail, Phone } from 'lucide-react'

export default function Team() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    organization: '',
    email: '',
    phone: '',
  })

  const fetchMembers = () => {
    setLoading(true)
    fetchTeamMembers()
      .then(res => {
        setMembers(res.data.data || res.data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch team members:', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    fetchMembers()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingMember) {
        await updateTeamMember(editingMember.id, formData)
      } else {
        await createTeamMember(formData)
      }
      setFormData({ name: '', role: '', organization: '', email: '', phone: '' })
      setEditingMember(null)
      setIsAddOpen(false)
      fetchMembers()
    } catch (err) {
      console.error('Failed to save member:', err)
    }
  }

  const handleEdit = (member) => {
    setEditingMember(member)
    setFormData({
      name: member.name,
      role: member.role,
      organization: member.organization || '',
      email: member.email || '',
      phone: member.phone || '',
    })
    setIsAddOpen(true)
  }

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this team member?')) {
      try {
        await deleteTeamMember(id)
        fetchMembers()
      } catch (err) {
        console.error('Failed to delete member:', err)
      }
    }
  }

  const filteredMembers = members.filter(member => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      member.name?.toLowerCase().includes(search) ||
      member.role?.toLowerCase().includes(search) ||
      member.organization?.toLowerCase().includes(search)
    const matchesRole = roleFilter === 'all' || member.role === roleFilter
    return matchesSearch && matchesRole
  })

  const groupedMembers = filteredMembers.reduce((acc, member) => {
    const role = member.role || 'Other'
    if (!acc[role]) {
      acc[role] = []
    }
    acc[role].push(member)
    return acc
  }, {})

  const getRoleBadgeVariant = (role) => {
    const roleLower = role?.toLowerCase() || ''
    if (roleLower.includes('vendor')) return 'info'
    if (roleLower.includes('client')) return 'warning'
    if (roleLower.includes('lead') || roleLower.includes('manager')) return 'success'
    return 'secondary'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading team members...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team</h1>
          <p className="text-muted-foreground mt-1">
            Project team members and stakeholders
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingMember ? 'Edit Member' : 'Add New Member'}</DialogTitle>
              <DialogDescription>
                {editingMember ? 'Update the team member details.' : 'Add a new member to the team.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">Name</label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter name"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="role" className="text-sm font-medium">Role</label>
                <Select value={formData.role} onValueChange={(v) => setFormData(prev => ({ ...prev, role: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Vendor Project Manager">Vendor Project Manager</SelectItem>
                    <SelectItem value="Vendor Lead">Vendor Lead</SelectItem>
                    <SelectItem value="Vendor Team Member">Vendor Team Member</SelectItem>
                    <SelectItem value="Client Project Manager">Client Project Manager</SelectItem>
                    <SelectItem value="Client Lead">Client Lead</SelectItem>
                    <SelectItem value="Client Team Member">Client Team Member</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label htmlFor="organization" className="text-sm font-medium">Organization</label>
                <Input
                  id="organization"
                  value={formData.organization}
                  onChange={(e) => setFormData(prev => ({ ...prev, organization: e.target.value }))}
                  placeholder="Enter organization"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">Email</label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Enter email"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm font-medium">Phone</label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Enter phone"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => {
                  setIsAddOpen(false)
                  setEditingMember(null)
                  setFormData({ name: '', role: '', organization: '', email: '', phone: '' })
                }}>
                  Cancel
                </Button>
                <Button type="submit">{editingMember ? 'Update' : 'Create'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendor</CardTitle>
            <Users className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {members.filter(m => m.role?.toLowerCase().includes('vendor')).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Client</CardTitle>
            <Users className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {members.filter(m => m.role?.toLowerCase().includes('client')).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="Vendor Project Manager">Vendor Project Manager</SelectItem>
                <SelectItem value="Vendor Lead">Vendor Lead</SelectItem>
                <SelectItem value="Vendor Team Member">Vendor Team Member</SelectItem>
                <SelectItem value="Client Project Manager">Client Project Manager</SelectItem>
                <SelectItem value="Client Lead">Client Lead</SelectItem>
                <SelectItem value="Client Team Member">Client Team Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Members List */}
      {Object.keys(groupedMembers).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No team members found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedMembers).map(([role, roleMembers]) => (
            <Card key={role}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant={getRoleBadgeVariant(role)}>{role}</Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    {roleMembers.length} member{roleMembers.length !== 1 ? 's' : ''}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">Name</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roleMembers.map(member => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell>{member.organization || '-'}</TableCell>
                        <TableCell>
                          {member.email ? (
                            <a href={`mailto:${member.email}`} className="text-primary hover:underline flex items-center gap-1">
                              <Mail className="h-4 w-4" />
                              {member.email}
                            </a>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {member.phone ? (
                            <span className="flex items-center gap-1">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              {member.phone}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => handleEdit(member)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(member.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}