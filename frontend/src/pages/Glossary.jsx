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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { fetchGlossaryTerms, createGlossaryTerm, updateGlossaryTerm, deleteGlossaryTerm } from '@/lib/api'
import { Search, Plus, Edit, Trash2, BookOpen, AlertTriangle, RefreshCw } from 'lucide-react'

export default function Glossary() {
  const [terms, setTerms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingTerm, setEditingTerm] = useState(null)
  const [formData, setFormData] = useState({
    term: '',
    definition: '',
    category: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const fetchTerms = () => {
    setLoading(true)
    setError(null)
    fetchGlossaryTerms()
      .then(res => {
        setTerms(res.data.data || res.data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch glossary terms:', err)
        setError('Failed to load glossary terms.')
        setLoading(false)
      })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    fetchTerms()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      if (editingTerm) {
        await updateGlossaryTerm(editingTerm.id, formData)
      } else {
        await createGlossaryTerm(formData)
      }
      setFormData({ term: '', definition: '', category: '' })
      setEditingTerm(null)
      setIsAddOpen(false)
      fetchTerms()
    } catch (err) {
      console.error('Failed to save term:', err)
      setFormError(err.response?.data?.message || 'Failed to save term.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (term) => {
    setEditingTerm(term)
    setFormData({
      term: term.term,
      definition: term.definition,
      category: term.category || '',
    })
    setIsAddOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteGlossaryTerm(deleteTarget.id)
      setDeleteTarget(null)
      fetchTerms()
    } catch (err) {
      console.error('Failed to delete term:', err)
      setDeleteError('Failed to delete term.')
    }
  }

  const filteredTerms = terms.filter(term => {
    const search = searchTerm.toLowerCase()
    return (
      term.term?.toLowerCase().includes(search) ||
      term.definition?.toLowerCase().includes(search) ||
      term.category?.toLowerCase().includes(search)
    )
  })

  const groupedTerms = filteredTerms.reduce((acc, term) => {
    const category = term.category || 'Uncategorized'
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(term)
    return acc
  }, {})

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-destructive font-medium">{error}</p>
        <button onClick={fetchTerms} className="text-sm text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
          Try again
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
        <RefreshCw className="h-7 w-7 animate-spin" />
        <span className="text-sm">Loading glossary...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Glossary</h1>
          <p className="text-muted-foreground mt-1">
            Project terminology and definitions
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Term
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTerm ? 'Edit Term' : 'Add New Term'}</DialogTitle>
              <DialogDescription>
                {editingTerm ? 'Update the glossary term details.' : 'Add a new term to the glossary.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="term" className="text-sm font-medium">Term</label>
                <Input
                  id="term"
                  value={formData.term}
                  onChange={(e) => setFormData(prev => ({ ...prev, term: e.target.value }))}
                  placeholder="Enter term"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="definition" className="text-sm font-medium">Definition</label>
                <textarea
                  id="definition"
                  value={formData.definition}
                  onChange={(e) => setFormData(prev => ({ ...prev, definition: e.target.value }))}
                  placeholder="Enter definition"
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="category" className="text-sm font-medium">Category</label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="Enter category (optional)"
                />
              </div>
              {formError && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {formError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => {
                  setIsAddOpen(false)
                  setEditingTerm(null)
                  setFormData({ term: '', definition: '', category: '' })
                  setFormError(null)
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : editingTerm ? 'Update' : 'Create'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search terms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Terms List */}
      {Object.keys(groupedTerms).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No terms found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedTerms).map(([category, categoryTerms]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle as="h2" className="flex items-center gap-2">
                  <Badge variant="secondary">{category}</Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    {categoryTerms.length} term{categoryTerms.length !== 1 ? 's' : ''}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Term</TableHead>
                      <TableHead>Definition</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryTerms.map(term => (
                      <TableRow key={term.id}>
                        <TableCell className="font-medium">{term.term}</TableCell>
                        <TableCell className="text-muted-foreground">{term.definition}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" onClick={() => handleEdit(term)} aria-label={`Edit ${term.term}`}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setDeleteTarget(term); setDeleteError(null) }} aria-label={`Delete ${term.term}`}>
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

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-destructive">Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.term}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              {deleteError}
            </div>
          )}
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}