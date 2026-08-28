<?php

namespace App\Http\Controllers;

use App\Support\AccessContext;
use App\Http\Resources\RetroEntryAttachmentResource;
use App\Http\Resources\RetroEntryCommentResource;
use App\Http\Resources\RetroEntryResource;
use App\Http\Resources\RetroSessionResource;
use App\Models\Notification;
use App\Models\Project;
use App\Models\RetroEntry;
use App\Models\RetroEntryAttachment;
use App\Models\RetroEntryComment;
use App\Models\RetroEntryVote;
use App\Models\RetroSession;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class RetrospectiveController extends Controller
{
    /**
     * 015-retro-entry-context/research.md D5: copied from
     * AttachmentController::ALLOWED_MIME_TYPES, not shared — a third
     * attachment system appearing would be the trigger to extract a
     * common service.
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
     * Copied from AttachmentController::sanitizeFilename() (research.md D5).
     */
    private function sanitizeFilename(string $filename): string
    {
        $filename = str_replace(['/', '\\', "\0"], '', $filename);
        $filename = ltrim($filename, '.');
        $filename = preg_replace('/[^\w.\-]/', '_', $filename);
        $filename = preg_replace('/\.{2,}/', '.', $filename);
        return substr($filename, 0, 200) ?: 'file';
    }

    // ─── Role Helpers ────────────────────────────────────────────────────────
    // Inclusion-based, mirroring SupportOpsController::canView() exactly —
    // never a deny-list. canWrite() is the existing User::canWrite() trait
    // method (Admin, Project Manager, Team Member — excludes Department Head).

    private function canView(User $user): bool
    {
        return $user->isAdmin()
            || $user->isProjectManager()
            || $user->isTeamMember()
            || $user->isDepartmentHead();
    }

    private function deny(Request $request, string $action, string $entityType, ?int $entityId = null)
    {
        AuditLogger::denied($request, $action, $entityType, $entityId);

        return response()->json(['message' => 'Unauthorized: Retrospectives are restricted to internal team members.'], 403);
    }

    /**
     * 013-sprint-retrospectives, contracts/retrospectives-api.md: project-level
     * scoping is required on every endpoint, not just role checks — role alone
     * lets a Team Member reach a project they aren't assigned to.
     */
    private function hasProjectAccess(User $user, int $projectId): bool
    {
        return Project::query()->accessibleTo($user)->whereKey($projectId)->exists();
    }

    // ─── GET /retro-sessions ─────────────────────────────────────────────────

    public function indexSessions(Request $request)
    {
        $user = AccessContext::user($request);

        if (!$this->canView($user)) {
            return $this->deny($request, 'retro_session.list', 'retro_session');
        }

        $validated = $request->validate([
            'project_id' => 'required|integer',
        ]);

        if (!$this->hasProjectAccess($user, (int) $validated['project_id'])) {
            return $this->deny($request, 'retro_session.list', 'project', (int) $validated['project_id']);
        }

        $sessions = RetroSession::query()
            ->where('project_id', $validated['project_id'])
            ->latest()
            ->get();

        return RetroSessionResource::collection($sessions);
    }

    // ─── POST /retro-sessions ────────────────────────────────────────────────

    public function storeSession(Request $request)
    {
        $user = AccessContext::user($request);

        if (!$user->canWrite()) {
            return $this->deny($request, 'retro_session.create', 'retro_session');
        }

        $validated = $request->validate([
            'project_id' => 'required|integer',
            'label' => 'required|string|max:255',
        ]);

        if (!$this->hasProjectAccess($user, (int) $validated['project_id'])) {
            return $this->deny($request, 'retro_session.create', 'project', (int) $validated['project_id']);
        }

        $session = RetroSession::create([
            'project_id' => $validated['project_id'],
            'label' => $validated['label'],
            'created_by_user_id' => $user->id,
        ]);

        return (new RetroSessionResource($session))->response()->setStatusCode(201);
    }

    // ─── PATCH /retro-sessions/{id} ──────────────────────────────────────────

    public function updateSession(Request $request, RetroSession $retroSession)
    {
        $user = AccessContext::user($request);

        // 014-retro-table-view Phase 8/FR-016, research.md D8: identical
        // gate to storeSession() — renaming is session-level metadata
        // management, not restricted to created_by_user_id.
        if (!$user->canWrite()) {
            return $this->deny($request, 'retro_session.update', 'retro_session', $retroSession->id);
        }

        if (!$this->hasProjectAccess($user, $retroSession->project_id)) {
            return $this->deny($request, 'retro_session.update', 'retro_session', $retroSession->id);
        }

        $validated = $request->validate([
            'label' => 'required|string|max:255',
        ]);

        $retroSession->update(['label' => $validated['label']]);

        return new RetroSessionResource($retroSession->fresh());
    }

    // ─── GET /retro-sessions/{id} ────────────────────────────────────────────

    public function showSession(Request $request, RetroSession $retroSession)
    {
        $user = AccessContext::user($request);

        if (!$this->canView($user)) {
            return $this->deny($request, 'retro_session.show', 'retro_session', $retroSession->id);
        }

        if (!$this->hasProjectAccess($user, $retroSession->project_id)) {
            return $this->deny($request, 'retro_session.show', 'retro_session', $retroSession->id);
        }

        $entries = $retroSession->entries()->latest()->get();

        // 014-retro-table-view/FR-009,FR-010: computed at read time from the
        // existing vote rows, two aggregate queries scoped to this session's
        // entries — not per-entry, and not a stored counter (research.md D4).
        $entryIds = $entries->pluck('id');
        $voteSummary = [
            'total_votes' => RetroEntryVote::whereIn('retro_entry_id', $entryIds)->count(),
            'total_voters' => RetroEntryVote::whereIn('retro_entry_id', $entryIds)->distinct('user_id')->count('user_id'),
        ];

        return response()->json([
            'session' => new RetroSessionResource($retroSession),
            'entries' => RetroEntryResource::collection($entries),
            'vote_summary' => $voteSummary,
        ]);
    }

    // ─── POST /retro-sessions/{id}/entries ───────────────────────────────────

    public function storeEntry(Request $request, RetroSession $retroSession)
    {
        $user = AccessContext::user($request);

        if (!$user->canWrite()) {
            return $this->deny($request, 'retro_entry.create', 'retro_session', $retroSession->id);
        }

        if (!$this->hasProjectAccess($user, $retroSession->project_id)) {
            return $this->deny($request, 'retro_entry.create', 'retro_session', $retroSession->id);
        }

        $validated = $request->validate([
            'body' => 'required|string',
            // 014-retro-table-view Phase 8/FR-018: Type is assigned later
            // from the table, not required at creation.
            'sentiment' => ['nullable', 'string', Rule::in(RetroEntry::SENTIMENTS)],
        ]);

        $entry = RetroEntry::create([
            'retro_session_id' => $retroSession->id,
            'author_user_id' => $user->id,
            'body' => $validated['body'],
            'sentiment' => $validated['sentiment'] ?? null,
        ]);

        return (new RetroEntryResource($entry))->response()->setStatusCode(201);
    }

    // ─── GET /retro-entries/{id}/comments (015-retro-entry-context) ─────────

    public function indexComments(Request $request, RetroEntry $retroEntry)
    {
        $user = AccessContext::user($request);

        if (!$this->canView($user)) {
            return $this->deny($request, 'retro_entry_comment.list', 'retro_entry', $retroEntry->id);
        }

        if (!$this->hasProjectAccess($user, $retroEntry->session->project_id)) {
            return $this->deny($request, 'retro_entry_comment.list', 'retro_entry', $retroEntry->id);
        }

        return RetroEntryCommentResource::collection(
            $retroEntry->comments()->orderBy('created_at')->get()
        );
    }

    // ─── POST /retro-entries/{id}/comments ───────────────────────────────────

    public function storeComment(Request $request, RetroEntry $retroEntry)
    {
        $user = AccessContext::user($request);

        // FR-003: not restricted to the entry's author — any canWrite()
        // user with project access may post.
        if (!$user->canWrite()) {
            return $this->deny($request, 'retro_entry_comment.create', 'retro_entry', $retroEntry->id);
        }

        if (!$this->hasProjectAccess($user, $retroEntry->session->project_id)) {
            return $this->deny($request, 'retro_entry_comment.create', 'retro_entry', $retroEntry->id);
        }

        $validated = $request->validate([
            'body' => 'required|string|min:1|max:5000',
        ]);

        $comment = $retroEntry->comments()->create([
            'author_user_id' => $user->id,
            'body' => $validated['body'],
        ]);

        Notification::parseAndSendRetroMentions($validated['body'], $comment, $retroEntry);

        return (new RetroEntryCommentResource($comment))->response()->setStatusCode(201);
    }

    // ─── GET /retro-entries/{id}/attachments ─────────────────────────────────

    public function indexAttachments(Request $request, RetroEntry $retroEntry)
    {
        $user = AccessContext::user($request);

        if (!$this->canView($user)) {
            return $this->deny($request, 'retro_entry_attachment.list', 'retro_entry', $retroEntry->id);
        }

        if (!$this->hasProjectAccess($user, $retroEntry->session->project_id)) {
            return $this->deny($request, 'retro_entry_attachment.list', 'retro_entry', $retroEntry->id);
        }

        return RetroEntryAttachmentResource::collection(
            $retroEntry->attachments()->orderBy('created_at')->get()
        );
    }

    // ─── POST /retro-entries/{id}/attachments ────────────────────────────────

    public function storeAttachment(Request $request, RetroEntry $retroEntry)
    {
        $user = AccessContext::user($request);

        if (!$user->canWrite()) {
            return $this->deny($request, 'retro_entry_attachment.create', 'retro_entry', $retroEntry->id);
        }

        if (!$this->hasProjectAccess($user, $retroEntry->session->project_id)) {
            return $this->deny($request, 'retro_entry_attachment.create', 'retro_entry', $retroEntry->id);
        }

        $request->validate([
            'file' => [
                'required',
                'file',
                'max:102400', // 100 MB in kilobytes
                'mimetypes:' . implode(',', self::ALLOWED_MIME_TYPES),
            ],
        ]);

        $uploadedFile = $request->file('file');
        $originalName = $uploadedFile->getClientOriginalName();
        $safeOriginal = $this->sanitizeFilename($originalName);
        $uuid = (string) Str::uuid();
        $storedName = $uuid . '_' . $safeOriginal;
        $storagePath = "retro-entry-attachments/{$retroEntry->id}/{$storedName}";

        Storage::disk('local')->put(
            $storagePath,
            file_get_contents($uploadedFile->getRealPath())
        );

        $attachment = $retroEntry->attachments()->create([
            'uploaded_by_user_id' => $user->id,
            'original_name' => $originalName,
            'stored_name' => $storedName,
            'disk' => 'local',
            'path' => $storagePath,
            'mime_type' => $uploadedFile->getMimeType(),
            'size_bytes' => $uploadedFile->getSize(),
        ]);

        return (new RetroEntryAttachmentResource($attachment))->response()->setStatusCode(201);
    }

    // ─── GET /retro-entry-attachments/{id}/download ──────────────────────────

    public function downloadAttachment(Request $request, RetroEntryAttachment $retroEntryAttachment)
    {
        $user = AccessContext::user($request);

        // OWASP A01 (plan.md Coding-Standard Constraints): re-checked on
        // every request, never inferred from the URL alone.
        if (!$this->canView($user)) {
            return $this->deny($request, 'retro_entry_attachment.download', 'retro_entry_attachment', $retroEntryAttachment->id);
        }

        if (!$this->hasProjectAccess($user, $retroEntryAttachment->entry->session->project_id)) {
            return $this->deny($request, 'retro_entry_attachment.download', 'retro_entry_attachment', $retroEntryAttachment->id);
        }

        if (!Storage::disk($retroEntryAttachment->disk)->exists($retroEntryAttachment->path)) {
            abort(404, 'File not found.');
        }

        return Storage::disk($retroEntryAttachment->disk)
            ->download($retroEntryAttachment->path, $retroEntryAttachment->original_name);
    }

    // ─── DELETE /retro-entry-attachments/{id} ────────────────────────────────

    public function destroyAttachment(Request $request, RetroEntryAttachment $retroEntryAttachment)
    {
        $user = AccessContext::user($request);
        $projectId = $retroEntryAttachment->entry->session->project_id;

        if (!$user->canWrite() || !$this->hasProjectAccess($user, $projectId)) {
            return $this->deny($request, 'retro_entry_attachment.delete', 'retro_entry_attachment', $retroEntryAttachment->id);
        }

        // Evaluated against the attachment's uploader, not the entry's
        // author — uploading and authoring the entry are independent
        // identities (contracts/retro-entry-context-api.md).
        $isUploaderOrModerator = $user->id === $retroEntryAttachment->uploaded_by_user_id
            || $user->isAdmin()
            || $user->isProjectManager();

        if (!$isUploaderOrModerator) {
            return $this->deny($request, 'retro_entry_attachment.delete', 'retro_entry_attachment', $retroEntryAttachment->id);
        }

        Storage::disk($retroEntryAttachment->disk)->delete($retroEntryAttachment->path);

        $retroEntryAttachment->delete();

        return response()->noContent();
    }

    // ─── POST /retro-entries/{id}/vote ───────────────────────────────────────

    public function toggleVote(Request $request, RetroEntry $retroEntry)
    {
        $user = AccessContext::user($request);

        if (!$user->canWrite()) {
            return $this->deny($request, 'retro_entry.vote', 'retro_entry', $retroEntry->id);
        }

        if (!$this->hasProjectAccess($user, $retroEntry->session->project_id)) {
            return $this->deny($request, 'retro_entry.vote', 'retro_entry', $retroEntry->id);
        }

        $existing = $retroEntry->votes()->where('user_id', $user->id)->first();

        if ($existing) {
            $existing->delete();
            $voted = false;
        } else {
            $retroEntry->votes()->create(['user_id' => $user->id]);
            $voted = true;
        }

        return response()->json([
            'voted' => $voted,
            'vote_count' => $retroEntry->votes()->count(),
        ]);
    }

    // ─── PATCH /retro-entries/{id} ────────────────────────────────────────────

    public function updateEntry(Request $request, RetroEntry $retroEntry)
    {
        $user = AccessContext::user($request);
        $projectId = $retroEntry->session->project_id;

        // FR-007/contracts.md: project-access re-check applies to every
        // request here, independent of the author/Admin/PM check below — a
        // former author who has lost project access is denied even though
        // author_user_id still matches them.
        if (!$user->canWrite() || !$this->hasProjectAccess($user, $projectId)) {
            return $this->deny($request, 'retro_entry.update', 'retro_entry', $retroEntry->id);
        }

        $validated = $request->validate([
            'body' => 'sometimes|string',
            'sentiment' => ['sometimes', 'string', Rule::in(RetroEntry::SENTIMENTS)],
            'is_repeating' => 'sometimes|boolean',
            'decision' => 'sometimes|nullable|string',
            'owner_user_id' => 'sometimes|nullable|integer',
        ]);

        $isAuthorOrModerator = $user->id === $retroEntry->author_user_id || $user->isAdmin() || $user->isProjectManager();

        // 014/015: is_repeating and decision are content characterizations
        // of the entry, gated the same as body/sentiment — never the
        // broader owner_user_id path any canWrite() user may use.
        if (
            (array_key_exists('body', $validated) || array_key_exists('sentiment', $validated) || array_key_exists('is_repeating', $validated) || array_key_exists('decision', $validated))
            && !$isAuthorOrModerator
        ) {
            return $this->deny($request, 'retro_entry.update', 'retro_entry', $retroEntry->id);
        }

        if (array_key_exists('owner_user_id', $validated) && $validated['owner_user_id'] !== null) {
            $owner = User::find($validated['owner_user_id']);

            // FR-006: ownership is a claim about who's actually positioned to
            // follow up — the target must have current project access, not
            // merely exist as a user record.
            if (!$owner || !$this->hasProjectAccess($owner, $projectId)) {
                return response()->json(['message' => 'The selected owner does not have access to this project.'], 422);
            }
        }

        $attributes = array_intersect_key($validated, array_flip(['body', 'sentiment', 'is_repeating', 'decision', 'owner_user_id']));
        $retroEntry->update($attributes);

        if (array_key_exists('owner_user_id', $validated)) {
            AuditLogger::record(
                $request,
                'retro_entry.owner_changed',
                'retro_entry',
                $retroEntry->id,
                'Retro entry owner changed.',
                ['owner_user_id' => $validated['owner_user_id']]
            );
        }

        return new RetroEntryResource($retroEntry->fresh());
    }

    // ─── DELETE /retro-entries/{id} ───────────────────────────────────────────

    public function destroyEntry(Request $request, RetroEntry $retroEntry)
    {
        $user = AccessContext::user($request);
        $projectId = $retroEntry->session->project_id;

        // Same project-access re-check as updateEntry() — a former author who
        // has lost project access cannot delete their own old entry either.
        if (!$user->canWrite() || !$this->hasProjectAccess($user, $projectId)) {
            return $this->deny($request, 'retro_entry.delete', 'retro_entry', $retroEntry->id);
        }

        $isAuthorOrModerator = $user->id === $retroEntry->author_user_id || $user->isAdmin() || $user->isProjectManager();

        if (!$isAuthorOrModerator) {
            return $this->deny($request, 'retro_entry.delete', 'retro_entry', $retroEntry->id);
        }

        AuditLogger::record($request, 'retro_entry.delete', 'retro_entry', $retroEntry->id, 'Retro entry deleted.');

        // 015-retro-entry-context/FR-015: the DB-level cascadeOnDelete()
        // FK removes retro_entry_comments/retro_entry_attachments rows
        // automatically, but that's a raw SQL cascade — it never runs
        // Eloquent model events, so physical attachment files would be
        // orphaned on disk without this explicit cleanup first.
        foreach ($retroEntry->attachments as $attachment) {
            Storage::disk($attachment->disk)->delete($attachment->path);
        }

        $retroEntry->delete();

        return response()->noContent();
    }
}
