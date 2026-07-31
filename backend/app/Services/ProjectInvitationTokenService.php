<?php

namespace App\Services;

use App\Models\ProjectInvitation;
use Illuminate\Support\Str;

class ProjectInvitationTokenService
{
    public function generatePlaintextToken(): string
    {
        return Str::random(64);
    }

    public function hashToken(string $plaintextToken): string
    {
        return hash_hmac('sha256', $plaintextToken, (string) config('app.key'));
    }

    public function issueAttributes(int $expiresInDays = 7): array
    {
        $plaintextToken = $this->generatePlaintextToken();

        return [
            'plaintext_token' => $plaintextToken,
            'token_hash' => $this->hashToken($plaintextToken),
            'expires_at' => now()->addDays($expiresInDays),
        ];
    }

    public function findValidInvitation(string $plaintextToken): ?ProjectInvitation
    {
        $invitation = $this->findInvitation($plaintextToken);

        if (!$invitation) {
            return null;
        }

        if ($invitation->state !== ProjectInvitation::STATE_PENDING) {
            return null;
        }

        if ($invitation->expires_at->isPast()) {
            return null;
        }

        return $invitation;
    }

    public function findInvitation(string $plaintextToken): ?ProjectInvitation
    {
        return ProjectInvitation::query()
            ->where('token_hash', $this->hashToken($plaintextToken))
            ->first();
    }
}
