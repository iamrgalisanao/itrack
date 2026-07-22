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
import { fetchGlossaryTerms, createGlossaryTerm, updateGlossaryTerm, deleteGlossaryTerm } from '@/lib/api'
import { Search, Plus, Edit, Trash2, BookOpen } from 'lucide-react'

export default function Glossary() {
  const [terms, setTerms] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingTerm, setEditingTerm] = useState(null)
  const [formData, setFormData] = useState({
    term: '',
    definition: '',
    category: '',
  })

  const fetchTerms = () => {
    setLoading(true)
    fetchGlossaryTerms()
      .then(res => {
        setTerms(res.data.data || res.data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to fetch glossary terms:', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    fetchTerms()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
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

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this term?')) {
      try {
        await deleteGlossaryTerm(id)
        fetchTerms()
      } catch (err) {
        console.error('Failed to delete term:', err)
      }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading glossary...</div>
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
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => {
                  setIsAddOpen(false)
                  setEditingTerm(null)
                  setFormData({ term: '', definition: '', category: '' })
                }}>
                  Cancel
                </Button>
                <Button type="submit">{editingTerm ? 'Update' : 'Create'}</Button>
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
                <CardTitle className="flex items-center gap-2">
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
                            <Button size="sm" variant="ghost" onClick={() => handleEdit(term)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(term.id)}>
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