<?php

namespace App\Services;

class ClientDomainPolicy
{
    private const PUBLIC_PROVIDERS = [
        'gmail.com',
        'googlemail.com',
        'yahoo.com',
        'ymail.com',
        'rocketmail.com',
        'outlook.com',
        'hotmail.com',
        'live.com',
        'msn.com',
    ];

    public function normalizeEmail(string $email): string
    {
        return mb_strtolower(trim($email));
    }

    public function normalizeDomain(string $domain): string
    {
        $domain = mb_strtolower(trim($domain));
        $domain = preg_replace('/^@+/', '', $domain) ?? $domain;

        return rtrim($domain, '.');
    }

    public function domainFromEmail(string $email): string
    {
        $normalized = $this->normalizeEmail($email);
        $domain = substr(strrchr($normalized, '@') ?: '', 1);

        return $this->normalizeDomain($domain);
    }

    public function isPublicProvider(string $domain): bool
    {
        return in_array($this->normalizeDomain($domain), self::PUBLIC_PROVIDERS, true);
    }
}
