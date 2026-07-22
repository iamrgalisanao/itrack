import { useState, useEffect, useRef } from 'react'
import { fetchAttachments, uploadAttachment, deleteAttachment, downloadAttachment } from '@/lib/api'
import {
  Paperclip,
  Upload,
  Trash2,
  Download,
  Lock,
  Globe,
  AlertTriangle,
  Loader2,
  FileText,
  FileImage,
  FileArchive,
  FileSpreadsheet,
  File,
  X,
} from 'lucide-react'

// File-type icon by MIME
const FileIcon = ({ mimeType, className = 'h-5 w-5' }) => {
  if (mimeType?.startsWith('image/'))                        return <FileImage className={className} />
  if (mimeType === 'application/pdf')                        return <FileText className={className} />
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('xlsx')) return <FileSpreadsheet className={className} />
  if (mimeType?.includes('zip'))                             return <FileArchive className={className} />
  return <File className={className} />
}

/**
 * TaskFiles — Self-contained file attachment panel for a Detailed Activity (task).
 *
 * Props:
 *   taskId        {number}    The detailed_activity_id to scope attachments to.
 *   userRole      {string}    Current mock role (e.g. 'Project Manager', 'Client').
 *   onCountChange {function}  Callback(count) invoked after load/upload/delete.
 */
export default function TaskFiles({ taskId, userRole, onCountChange }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Upload state
  const [selectedFile, setSelectedFile] = useState(null)
  const [visibility, setVisibility] = useState('internal')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)

  // Download / delete state
  const [downloadingId, setDownloadingId] = useState(null)
  const [downloadError, setDownloadError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState(null)

  const fileInputRef = useRef(null)

  const isClient = userRole === 'Client'

  const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.png', '.jpg', '.jpeg', '.zip']
  const ALLOWED_MIME_TYPES  = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'application/zip',
    'application/x-zip-compressed',
  ]
  const MAX_SIZE_BYTES = 100 * 1024 * 1024 // 100 MB

  const loadFiles = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchAttachments(taskId)
      const list = res.data || []
      setFiles(list)
      onCountChange?.(list.length)
    } catch (err) {
      console.error('Failed to load attachments:', err)
      setError('Failed to load files. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!taskId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- established data-load-on-mount idiom used throughout this codebase
    loadFiles()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadFiles is recreated every render; including it would loop
  }, [taskId])

  // ── File validation ────────────────────────────────────────────────────────
  const validateFile = (file) => {
    if (!file) return null
    if (file.size > MAX_SIZE_BYTES) {
      return `File is too large. Maximum size is 100 MB (this file is ${formatBytes(file.size)}).`
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return `File type not allowed. Accepted types: PDF, DOCX, XLSX, PNG, JPG, ZIP.`
    }
    return null
  }

  const handleFileSelect = (file) => {
    setFileError(null)
    setUploadError(null)
    const err = validateFile(file)
    if (err) {
      setFileError(err)
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
  }

  const handleInputChange = (e) => {
    handleFileSelect(e.target.files[0] || null)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files[0] || null)
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploadError(null)
    setUploading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('visibility', visibility)

    try {
      const res = await uploadAttachment(taskId, formData, (progressEvent) => {
        const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        setUploadProgress(pct)
      })
      const uploaded = res.data
      const updated = [...files, uploaded]
      setFiles(updated)
      onCountChange?.(updated.length)
      setSelectedFile(null)
      setVisibility('internal')
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      console.error('Upload failed:', err)
      const msg = err.response?.data?.message
        || err.response?.data?.errors?.file?.[0]
        || 'Upload failed. Please try again.'
      setUploadError(msg)
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (file) => {
    setDownloadingId(file.id)
    setDownloadError(null)
    try {
      await downloadAttachment(file.id, file.original_name)
    } catch (err) {
      console.error('Download failed:', err)
      setDownloadError(`Could not download "${file.original_name}". ${
        err.response?.status === 403 ? 'Access denied.' : 'Please try again.'
      }`)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDelete = async (fileId) => {
    setDeletingId(fileId)
    setDeleteError(null)
    try {
      await deleteAttachment(fileId)
      const updated = files.filter((f) => f.id !== fileId)
      setFiles(updated)
      onCountChange?.(updated.length)
    } catch (err) {
      console.error('Delete failed:', err)
      setDeleteError(err.response?.data?.message || 'Could not delete file.')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatBytes = (bytes) => {
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
    if (bytes >= 1_024)     return `${Math.round(bytes / 1_024)} KB`
    return `${bytes} B`
  }

  const formatTime = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  // File type colour accent
  const fileAccent = (mimeType) => {
    if (mimeType?.startsWith('image/'))         return 'text-purple-500'
    if (mimeType === 'application/pdf')         return 'text-red-500'
    if (mimeType?.includes('spreadsheet'))      return 'text-emerald-500'
    if (mimeType?.includes('zip'))              return 'text-amber-500'
    return 'text-blue-500'
  }

  const canDeleteFile = (file) => {
    if (isClient || userRole === 'Department Head') return false
    if (userRole === 'Admin' || userRole === 'Project Manager') return true
    if (userRole === 'Team Member') return file.uploader_role === userRole
    return false
  }

  const VisibilityBadge = ({ vis }) =>
    vis === 'client_visible' ? (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wide">
        <Globe className="h-2.5 w-2.5" />Client-visible
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20 uppercase tracking-wide">
        <Lock className="h-2.5 w-2.5" />Internal
      </span>
    )

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-xs font-medium">Loading files...</span>
      </div>
    )
  }

  // ── Error loading ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <p className="text-sm font-semibold text-destructive">{error}</p>
        <button onClick={loadFiles} className="text-xs font-semibold text-primary hover:underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── File List ──────────────────────────────────────────────────────── */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border/60 rounded-xl text-center bg-muted/10">
            <Paperclip className="h-7 w-7 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">
              {isClient
                ? 'No client-visible files available.'
                : 'No files attached yet. Upload the first document for this task.'}
            </p>
          </div>
        ) : (
          files.map((file) => {
            const isDeletingThis  = deletingId === file.id
            const isDownloading   = downloadingId === file.id

            return (
              <div
                key={file.id}
                className={`group flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  file.visibility === 'internal'
                    ? 'bg-slate-500/5 border-slate-500/15 dark:bg-slate-800/20'
                    : 'bg-emerald-500/5 border-emerald-500/15 dark:bg-emerald-950/20'
                }`}
              >
                {/* File icon */}
                <div className={`shrink-0 ${fileAccent(file.mime_type)}`}>
                  <FileIcon mimeType={file.mime_type} />
                </div>

                {/* Metadata */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{file.original_name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{file.human_size}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{file.uploader}</span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{formatTime(file.created_at)}</span>
                    {!isClient && <VisibilityBadge vis={file.visibility} />}
                    {isClient && file.visibility === 'client_visible' && <VisibilityBadge vis={file.visibility} />}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Download */}
                  <button
                    onClick={() => handleDownload(file)}
                    disabled={isDownloading}
                    aria-label={`Download ${file.original_name}`}
                    title="Download"
                    className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-40"
                  >
                    {isDownloading
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Download className="h-3.5 w-3.5" />}
                  </button>

                  {/* Delete (hover reveal) */}
                  {canDeleteFile(file) && (
                    <button
                      onClick={() => handleDelete(file.id)}
                      disabled={isDeletingThis}
                      aria-label={`Delete ${file.original_name}`}
                      title="Delete"
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-40"
                    >
                      {isDeletingThis
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}

        {downloadError && (
          <p className="text-xs text-destructive font-semibold flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />{downloadError}
          </p>
        )}
        {deleteError && (
          <p className="text-xs text-destructive text-center font-semibold">{deleteError}</p>
        )}
      </div>

      {/* ── Upload Form (hidden for Clients) ───────────────────────────────── */}
      {!isClient ? (
        <div className="border-t border-border/60 pt-4 space-y-3">

          {/* Drag-and-drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border/60 hover:border-primary/50 hover:bg-muted/20'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS.join(',')}
              onChange={handleInputChange}
              className="hidden"
            />

            {selectedFile ? (
              /* Selected file preview */
              <div className="flex items-center gap-3">
                <div className={`shrink-0 ${fileAccent(selectedFile.type)}`}>
                  <FileIcon mimeType={selectedFile.type} className="h-6 w-6" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{selectedFile.name}</p>
                  <p className="text-[10px] text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setFileError(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              /* Empty zone */
              <div className="flex flex-col items-center gap-1.5 py-2">
                <Upload className="h-6 w-6 text-muted-foreground/50" />
                <p className="text-xs font-semibold text-muted-foreground">
                  Drop a file here or <span className="text-primary">browse</span>
                </p>
                <p className="text-[10px] text-muted-foreground">PDF, DOCX, XLSX, PNG, JPG, ZIP · Max 100 MB</p>
              </div>
            )}
          </div>

          {fileError && (
            <p className="text-xs text-destructive font-semibold flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />{fileError}
            </p>
          )}

          {/* Upload progress bar */}
          {uploading && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Visibility selector + Upload button */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-muted/60 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setVisibility('internal')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                  visibility === 'internal'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Lock className="h-3 w-3" />Internal
              </button>
              <button
                type="button"
                onClick={() => setVisibility('client_visible')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                  visibility === 'client_visible'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Globe className="h-3 w-3" />Client-visible
              </button>
            </div>

            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || uploading || !!fileError}
              className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading...</>
              ) : (
                <><Upload className="h-3.5 w-3.5" />Upload</>
              )}
            </button>
          </div>

          {uploadError && (
            <p className="text-xs text-destructive font-semibold flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />{uploadError}
            </p>
          )}
        </div>
      ) : (
        <div className="border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground text-center italic">
            Clients can view and download files but cannot upload. Contact your project manager to add files.
          </p>
        </div>
      )}
    </div>
  )
}
