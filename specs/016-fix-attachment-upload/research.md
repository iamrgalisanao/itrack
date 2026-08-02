# Phase 0 Research: Fix Work Program Attachment Upload

No `[NEEDS CLARIFICATION]` markers were left in spec.md or plan.md's
Technical Context — this is a narrow, already-diagnosed defect fix. This
document records the one real decision (how to fix it) and the test
implications, rather than open unknowns.

## D1: Fix approach — per-request header override vs. other options

**Decision**: Change `uploadAttachment` in `frontend/src/lib/api.js` to pass
`headers: { 'Content-Type': undefined }` on the `api.post(...)` call, exactly
matching the fix already applied to `uploadRetroEntryAttachment` in the same
file (015-retro-entry-context).

**Rationale**: The shared `api` axios instance is created with a default
`Content-Type: application/json` header. Axios's default-merge behavior does
not clear an explicitly-set default header just because the request body is
a `FormData` instance — it only auto-sets the multipart boundary when no
conflicting `Content-Type` is already present. Setting the header to
`undefined` on the individual request removes the default for that call,
letting axios (and the underlying browser `fetch`/`XHR`) set the correct
`multipart/form-data; boundary=...` value. This is proven to work: it is the
identical fix already shipped and verified end-to-end (via Playwright) for
`uploadRetroEntryAttachment` in 015.

**Alternatives considered**:
- **Create a separate axios instance for uploads, with no default
  Content-Type.** Rejected — larger surface change than necessary
  (introduces a second client instance, a second place to keep
  `withCredentials`/interceptors/auth-handling in sync), where the codebase
  already has a proven, smaller fix for the identical problem one file away.
- **Manually set `Content-Type: 'multipart/form-data'` without a boundary.**
  Rejected — this is the actual anti-pattern that causes the bug in similar
  reports elsewhere: setting the header without a boundary still breaks
  parsing, because the browser needs to generate and append the boundary
  string itself when serializing the `FormData` body.
- **Switch `uploadAttachment` to use `fetch` instead of the shared `api`
  axios instance.** Rejected — inconsistent with every other API call in
  `api.js`, loses the shared `withCredentials`, auth-expiry
  (`onUnauthorized`), and preview-token interceptor behavior for no benefit.

## D2: Test strategy

**Decision**: No new backend test is needed — `AttachmentController` and its
validation are unchanged, and existing coverage in
`backend/tests/Feature/AttachmentTest.php` already exercises the endpoint
this fix targets. Verification is a manual/browser-driven pass (per this
project's established frontend-testing practice, since no `vitest`/`jest`
framework is configured) confirming: (1) a valid file now uploads
successfully where it previously failed with a 422, and (2) the existing
MIME-whitelist rejection, oversized-file rejection, download, and delete
behaviors are all unchanged.

**Rationale**: Constitution Principle III requires tests for *behavior
changes*; this fix changes transport-layer request construction, not
business logic, and the business logic's test coverage (`AttachmentTest.php`)
already exists and is unaffected. Constitution Principle VIII's
Definition-of-Done Gate is satisfied by re-running that existing suite (to
confirm no regression) plus the manual upload verification described in
quickstart.md.

**Alternatives considered**:
- **Add a frontend unit test asserting the header override.** Rejected —
  no frontend test framework exists in this repo; introducing one for a
  single-line fix is disproportionate scope creep (code-slop:
  over-engineering) and is exactly the class of premature-infrastructure
  choice the project's coding-standard skills warn against for a two-file
  change.
