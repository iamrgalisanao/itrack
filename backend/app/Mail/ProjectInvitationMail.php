<?php

namespace App\Mail;

use App\Models\ProjectInvitation;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Deliberately not ShouldQueue: the plaintext token is only available at
 * creation, and queueing would write it into the jobs table.
 */
class ProjectInvitationMail extends Mailable
{
    public function __construct(
        public readonly ProjectInvitation $invitation,
        public readonly string $inviterName,
        public readonly string $acceptUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "You're invited to {$this->invitation->project->name} on iTrack",
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.project-invitation',
            with: [
                'projectName' => $this->invitation->project->name,
                'inviterName' => $this->inviterName,
                'roleLabel' => $this->roleLabel(),
                'expiresAt' => $this->invitation->expires_at->toFormattedDayDateString(),
                'acceptUrl' => $this->acceptUrl,
            ],
        );
    }

    private function roleLabel(): string
    {
        return match ($this->invitation->role) {
            'client_admin' => 'Client Admin',
            'client_contributor' => 'Contributor',
            default => 'Viewer',
        };
    }
}
