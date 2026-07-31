# Constitution Check: Project Client Access Control

**Feature Branch**: `011-project-client-access-control`
**Source Constitution**: `.specify/memory/constitution.md` version 1.0.0
**Checked**: 2026-07-31

## Core Principle Alignment

| Principle | Applies? | Assessment |
|---|---:|---|
| I. Fail-Closed Access Control | Yes | PASS. All new privileged checks must be represented in policy/service methods that compose the existing `HasRole` predicates with project membership state. Unknown roles, missing membership, suspended membership, and removed membership all deny by default. |
| II. Consistent API Contracts | Yes | PASS. New endpoints use Laravel API Resources or curated response arrays. Invitation tokens, approval notes marked internal, and audit metadata not intended for clients are never serialized by raw model return. |
| III. Test Coverage Grows With the Feature | Yes | PASS. This feature adds backend endpoints, relationships, and authorization rules; each user story includes feature tests for happy paths, denied paths, isolation, state transitions, and audit entries. |
| IV. Audit Sensitive Mutations | Yes | PASS. Invitations, approvals, rejections, suspensions, removals, trusted-domain policy changes, and permission denials are sensitive membership mutations and must use `App\Services\AuditLogger`. |
| V. Small, Additive, Reversible Migrations | Yes | PASS. New schema is additive: client organizations, domains, invitations, memberships, trusted-domain policies, and audit-context columns if needed. Existing project assignment and ownership rows are not destructively changed. |
| VI. Real Auth Is the Only Forward Path | Yes | PASS. The design uses real Sanctum-authenticated `User` accounts and current `user.role`. No mock role switcher behavior is extended. |

## Delivery Constraints

- Public provider addresses such as Gmail, Yahoo, and Outlook must never be treated as automatically trusted corporate domains.
- Project access must be granted only by approved project membership, existing Admin/Project Manager authority, or existing project ownership/assignment rules where explicitly bridged.
- Multi-client isolation must be proven at the query layer and in tests, not left to frontend filtering.
- Preview sessions remain read-scoped only; write attempts during preview continue to be blocked by the existing middleware.

## Result

No constitution exception is required.
