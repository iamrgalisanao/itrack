<?php

namespace App\Http\Controllers;

use App\Http\Resources\AttachmentResource;
use App\Models\Attachment;
use App\Models\DetailedActivity;
use App\Models\Project;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\AccessContext;
use App\Support\ProjectClientAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AttachmentController extends Controller
{
    /**
     * Allowed MIME types — validated backend-side (do not rely on frontend only).
     */
    private const ALLOWED_MIME_TYPES = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
        'image/png',
        'image/jpeg',
        'application/zip',
        'application/x-zip-compressed',
    ];

    /**
     * Sanitize a filename to prevent path traversal and unsafe characters.
     * Keeps the extension and readable name; strips dangerous patterns.
     */
    private function sanitizeFilename(string $filename): string
    {
        // Strip directory separators and null bytes
        $filename = str_replace(['/', '\\', "\0"], '', $filename);
        // Remove leading dots (hidden files)
        $filename = ltrim($filename, '.');
        // Replace any non-alphanumeric/dot/dash/underscore with underscore
        $filename = preg_replace('/[^\w.\-]/', '_', $filename);
        // Collapse multiple consecutive underscores/dots
        $filename = preg_replace('/\.{2,}/', '.', $filename);
        // Truncate to 200 characters max (leave room for UUID prefix)
        return substr($filename, 0, 200) ?: 'file';
    }

    /**
     * GET /detailed-activities/{detailedActivity}/attachments
     *
     * Returns attachment metadata (never raw path) scoped by role:
     *   - Client → only client_visible
     *   - All other roles → all attachments
     */
    public function index(Request $request, DetailedActivity $detailedActivity)
    {
        $user = $this->user($request);

        if (!($detailedActivity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $query = $detailedActivity->attachments()->orderBy('created_at', 'asc');

        if ($user->isClient()) {
            $query->where('visibility', Attachment::VISIBILITY_CLIENT_VISIBLE);
        }

        // path is hidden via $hidden on the model — no manual exclusion needed
        return response()->json(
            $query->get()
                ->map(fn (Attachment $attachment) => AttachmentResource::make($attachment)->resolve($request))
                ->values()
        );
    }

    /**
     * POST /detailed-activities/{detailedActivity}/attachments
     *
     * Uploads a file and creates an attachment record.
     * Blocked for Client users (403).
     */
    public function store(Request $request, DetailedActivity $detailedActivity)
    {
        $user = $this->user($request);

        if (!($detailedActivity->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        $request->validate([
            'file' => [
                'required',
                'file',
                'max:102400', // 100 MB in kilobytes
                'mimetypes:' . implode(',', self::ALLOWED_MIME_TYPES),
            ],
            'visibility' => ['required', 'string', 'in:internal,client_visible'],
        ]);

        $visibility = $request->input('visibility');

        if ($user->isClient()) {
            $project = Project::find($detailedActivity->resolveProjectId());

            if (!$project || !$detailedActivity->client_visible || !app(ProjectClientAccess::class)->canContribute($user, $project)) {
                AuditLogger::denied($request, 'attachment.create_client_contribution', 'detailed_activity', $detailedActivity->id);
                return response()->json(['message' => 'Clients are not permitted to upload files for this task.'], 403);
            }

            $visibility = Attachment::VISIBILITY_CLIENT_VISIBLE;
        }

        $uploadedFile = $request->file('file');
        $originalName = $uploadedFile->getClientOriginalName();
        $safeOriginal = $this->sanitizeFilename($originalName);
        $uuid         = (string) Str::uuid();
        $storedName   = $uuid . '_' . $safeOriginal;
        $storagePath  = "attachments/{$detailedActivity->id}/{$storedName}";

        // Store to private disk (not public)
        Storage::disk('local')->put(
            $storagePath,
            file_get_contents($uploadedFile->getRealPath())
        );

        $attachment = $detailedActivity->attachments()->create([
            'uploader'            => $user->name ?? $user->role,
            'uploader_role'       => $user->role,
            'uploaded_by_user_id' => $user->id,
            'original_name'       => $originalName,
            'stored_name'         => $storedName,
            'disk'                => 'local',
            'path'                => $storagePath, // stored but hidden from API response
            'mime_type'           => $uploadedFile->getMimeType(),
            'size_bytes'          => $uploadedFile->getSize(),
            'visibility'          => $visibility,
        ]);

        return response()->json(AttachmentResource::make($attachment)->resolve($request), 201);
    }

    /**
     * GET /attachments/{attachment}/download
     *
     * Serves a gated file download:
     *   1. Verify visibility access for role
     *   2. Verify file exists on disk
     *   3. Stream as download (never expose raw path)
     */
    public function download(Request $request, Attachment $attachment)
    {
        $user = $this->user($request);

        if (!($attachment->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        // Client can only download client_visible files
        if ($user->isClient() && $attachment->visibility !== Attachment::VISIBILITY_CLIENT_VISIBLE) {
            return response()->json(['message' => 'Access denied.'], 403);
        }

        // Check file physically exists on disk
        if (! Storage::disk($attachment->disk)->exists($attachment->path)) {
            abort(404, 'File not found.');
        }

        return Storage::disk($attachment->disk)
            ->download($attachment->path, $attachment->original_name);
    }

    /**
     * DELETE /attachments/{attachment}
     *
     * Role-based delete (now using real user identity):
     *   - Admin: can delete any file
     *   - Project Manager: can delete any file
     *   - Team Member: only if uploaded_by_user_id matches their own user id
     *   - Department Head: denied (403)
     *   - Client: denied (403)
     */
    public function destroy(Request $request, Attachment $attachment)
    {
        $user = $this->user($request);

        if (!($attachment->isAccessibleTo($user))) {
            return response()->json(['message' => 'You do not have access to this resource.'], 403);
        }

        if ($user->isClient() || $user->isDepartmentHead()) {
            return response()->json(['message' => 'You are not permitted to delete files.'], 403);
        }

        // Team Member may only delete their own uploads (real user check)
        if ($user->isTeamMember() && $attachment->uploaded_by_user_id !== $user->id) {
            return response()->json(['message' => 'Team Members may only delete their own uploaded files.'], 403);
        }

        // Delete physical file first; swallow missing-file errors gracefully
        Storage::disk($attachment->disk)->delete($attachment->path);

        $attachment->delete();

        return response()->noContent();
    }

    private function user(Request $request): User
    {
        return AccessContext::user($request);
    }
}
