<x-mail::message>
# You're invited to {{ $projectName }}

{{ $inviterName }} invited you to join **{{ $projectName }}** on iTrack as **{{ $roleLabel }}**.

<x-mail::button :url="$acceptUrl">
Accept invitation
</x-mail::button>

Sign in with this email address to accept. The link expires on {{ $expiresAt }} and works once.

If you weren't expecting this, you can ignore this email.

If the button doesn't work, copy this link into your browser:
{{ $acceptUrl }}
</x-mail::message>
