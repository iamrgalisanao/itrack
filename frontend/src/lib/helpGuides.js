// 012-help-center — maps the current effective user (system role, and for
// Client-role users their highest-access approved membership tier) to
// exactly one of the seven bundled guide keys. Pure function, no caching or
// memoization of any kind: FR-010 requires this to be safe to call fresh on
// every render, so a role or membership change is reflected the next time
// Help Center is opened. See specs/012-help-center/data-model.md's
// "User Guide" resolution table for the canonical mapping this implements.

export const GUIDE_KEYS = [
  'admin',
  'project-manager',
  'department-head',
  'team-member',
  'client-viewer',
  'client-contributor',
  'client-admin',
]

const SYSTEM_ROLE_GUIDES = {
  Admin: 'admin',
  'Project Manager': 'project-manager',
  'Department Head': 'department-head',
  'Team Member': 'team-member',
}

const CLIENT_TIER_GUIDES = {
  client_admin: 'client-admin',
  client_contributor: 'client-contributor',
  client_viewer: 'client-viewer',
}

/**
 * FR-002/FR-003/FR-004: system roles map one-to-one to a guide; a Client
 * role resolves by `client_role` (already the highest-access tier across
 * all approved memberships — see backend `ProjectClientAccess::highestClientRole()`),
 * defaulting to `client-viewer` when `client_role` is null/unrecognized.
 * Returns `null` when `role` itself can't be resolved at all (spec.md's
 * defensive edge case) — callers show a fallback message for that case,
 * never a blank page or a crash.
 */
export function resolveGuideKey({ role, client_role } = {}) {
  if (role in SYSTEM_ROLE_GUIDES) {
    return SYSTEM_ROLE_GUIDES[role]
  }

  if (role === 'Client') {
    return CLIENT_TIER_GUIDES[client_role] ?? 'client-viewer'
  }

  return null
}
