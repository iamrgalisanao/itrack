<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    // Notification Types
    public const TYPE_ASSIGNMENT = 'assignment';
    public const TYPE_MENTION    = 'mention';
    public const TYPE_OVERDUE    = 'overdue';
    public const TYPE_BLOCKED    = 'blocked';
    public const TYPE_DUE_SOON   = 'due_soon';

    // Severities
    public const SEVERITY_INFO     = 'info';
    public const SEVERITY_WARNING  = 'warning';
    public const SEVERITY_CRITICAL = 'critical';

    protected $fillable = [
        'user_role',
        'recipient_user_id',
        'type',
        'severity',
        'title',
        'message',
        'detailed_activity_id',
        'link_url',
        'event_key',
        'event_date',
        'metadata',
        'is_read',
        'read_at',
    ];

    protected $casts = [
        'is_read'    => 'boolean',
        'read_at'    => 'datetime',
        'event_date' => 'date',
        'metadata'   => 'array',
    ];

    public function detailedActivity()
    {
        return $this->belongsTo(DetailedActivity::class);
    }

    /**
     * Resolve mock role from a responsibility string / code (e.g. "PPM", "PFC", etc.)
     */
    public static function resolveRoleFromResponsible(?string $responsible): ?string
    {
        if (empty($responsible)) {
            return null;
        }

        // Split by comma in case of multiple assignees (e.g. "PPM,PFC")
        $tokens = array_map('trim', explode(',', $responsible));
        foreach ($tokens as $token) {
            $mapped = match (strtoupper($token)) {
                'PPM', 'PM', 'PROJECT MANAGER', 'PROJECT_MANAGER' => 'Project Manager',
                'PFC', 'PTS', 'TM', 'TEAM MEMBER', 'TEAM_MEMBER'  => 'Team Member',
                'ADMIN'                                           => 'Admin',
                'CLIENT'                                          => 'Client',
                'DH', 'DEPARTMENT HEAD', 'DEPARTMENT_HEAD'        => 'Department Head',
                default                                           => null,
            };
            if ($mapped) {
                return $mapped;
            }
        }

        return null;
    }

    /**
     * Create a notification and log a mock email.
     */
    public static function sendNotification(
        string $userRole,
        string $type,
        string $severity,
        string $title,
        string $message,
        ?int $activityId = null,
        ?string $linkUrl = null,
        ?string $eventKey = null,
        ?string $eventDate = null,
        ?array $metadata = null
    ): ?self {
        // Enforce deduplication unique composite key rule:
        if ($eventKey) {
            $existing = self::where('user_role', $userRole)
                ->where('type', $type)
                ->where('detailed_activity_id', $activityId)
                ->where('event_key', $eventKey)
                ->first();
            if ($existing) {
                return $existing;
            }
        }

        // Create the notification
        $notification = self::create([
            'user_role'            => $userRole,
            'type'                 => $type,
            'severity'             => $severity,
            'title'                => $title,
            'message'              => $message,
            'detailed_activity_id' => $activityId,
            'link_url'             => $linkUrl ?: ($activityId ? "/kanban?task={$activityId}" : null),
            'event_key'            => $eventKey,
            'event_date'           => $eventDate,
            'metadata'             => $metadata,
            'is_read'              => false,
        ]);

        // Send mock email (written to laravel.log via Log facade)
        $highSignalTypes = [
            self::TYPE_ASSIGNMENT,
            self::TYPE_MENTION,
            self::TYPE_OVERDUE,
            self::TYPE_BLOCKED,
            self::TYPE_DUE_SOON
        ];

        if (in_array($type, $highSignalTypes)) {
            $email = str_replace(' ', '.', strtolower($userRole)) . '@itrack.test';
            \Illuminate\Support\Facades\Log::info(sprintf(
                "[MOCK EMAIL] Sent to %s (email: %s)\nSubject: %s\nBody: %s\nLink: %s\n",
                $userRole,
                $email,
                $title,
                $message,
                $notification->link_url ? url($notification->link_url) : 'N/A'
            ));
        }

        return $notification;
    }

    /**
     * Parse mentions from comment body and notify each matched role.
     */
    public static function parseAndSendMentions(string $commentBody, Comment $comment, DetailedActivity $task): void
    {
        // Match @ followed by letters, spaces or abbreviations
        preg_match_all('/@([a-zA-Z\s]+)/', $commentBody, $matches);
        
        if (empty($matches[1])) {
            return;
        }

        $notifiedRoles = [];
        $commentAuthorRole = $comment->author_role;

        foreach ($matches[1] as $mentionText) {
            $mentionText = trim($mentionText);
            $targetRole = null;
            
            $lower = strtolower($mentionText);
            if (str_starts_with($lower, 'admin')) {
                $targetRole = 'Admin';
            } elseif (str_starts_with($lower, 'project manager') || str_starts_with($lower, 'projectmanager') || str_starts_with($lower, 'pm') || str_starts_with($lower, 'ppm')) {
                $targetRole = 'Project Manager';
            } elseif (str_starts_with($lower, 'team member') || str_starts_with($lower, 'teammember') || str_starts_with($lower, 'tm') || str_starts_with($lower, 'pfc') || str_starts_with($lower, 'pts')) {
                $targetRole = 'Team Member';
            } elseif (str_starts_with($lower, 'department head') || str_starts_with($lower, 'departmenthead') || str_starts_with($lower, 'dh')) {
                $targetRole = 'Department Head';
            } elseif (str_starts_with($lower, 'client')) {
                $targetRole = 'Client';
            }

            if ($targetRole) {
                // Deduplicate within the same comment
                if (in_array($targetRole, $notifiedRoles)) {
                    continue;
                }
                
                // Do not notify the author's own role
                if ($targetRole === $commentAuthorRole) {
                    continue;
                }

                // If Client mentioned but comment visibility is internal, Client cannot see it
                if ($targetRole === 'Client' && $comment->visibility !== Comment::VISIBILITY_CLIENT_VISIBLE) {
                    continue;
                }

                $notifiedRoles[] = $targetRole;

                $eventKey = "mention:comment:{$comment->id}:{$targetRole}";
                self::sendNotification(
                    $targetRole,
                    self::TYPE_MENTION,
                    self::SEVERITY_INFO,
                    "Mention in Comment",
                    "{$comment->author} mentioned you in a comment on task: \"{$task->name}\"",
                    $task->id,
                    "/kanban?task={$task->id}",
                    $eventKey,
                    null,
                    [
                        'comment_id' => $comment->id,
                        'author' => $comment->author,
                        'comment_body' => substr($comment->body, 0, 100),
                    ]
                );
            }
        }
    }
}
