# Phase 0 Research: In-App Help Center

## Decision 1: Where the canonical guide content lives

**Decision**: Relocate the seven markdown files and their `images/` folder from `docs/user-guides/` into `frontend/src/content/help-guides/`, and treat that new location as the single source of truth going forward. `docs/user-guides/` is removed once the move ships (a short-lived redirect note is not needed — the guides are only ever read by developers/tech writers via the repo, not linked externally).

**Rationale**: The content needs to be bundled into the built frontend so it renders without a network round trip to a file server and without inventing a new backend "serve me a markdown file" endpoint. Vite only bundles assets it can see from within the project root it's configured against (`frontend/`); reaching outside that root (`../../docs/user-guides/`) to import raw markdown works technically but requires loosening Vite's dev-server filesystem allow-list and is a recurring source of confusing build/dev inconsistencies. Moving the files in is simpler and matches how every other piece of frontend-owned static content in this repo already lives under `frontend/src` or `frontend/public`.

**Alternatives considered**:
- *Keep `docs/user-guides/` as the source and add a Vite `server.fs.allow` + build-time copy step*: rejected — adds a build step to maintain for no real benefit, and creates two possible places a future editor might update (the copy vs. the original).
- *Serve guides from the backend as raw files/an API response*: rejected — introduces a new read endpoint, new caching/versioning questions, and couples static documentation to the API server's deploy lifecycle for content that never needs to be dynamic.
- *Duplicate files in both locations*: rejected outright — guaranteed drift the first time someone edits one copy and not the other.

## Decision 2: Markdown rendering approach

**Decision**: Add `react-markdown` (with the `remark-gfm` plugin for tables/task-list syntax already used in the guides' Markdown) as a new frontend dependency, and render each guide's raw text through it inside `HelpCenter.jsx`. Images referenced with relative paths (`images/foo.png`) are resolved to Vite-processed asset URLs via a small path-rewrite step at render time (Vite doesn't rewrite relative image paths inside markdown strings automatically the way it does for `<img src>` in JSX).

**Rationale**: `react-markdown` is the de facto standard for this in the React ecosystem — no raw HTML injection (avoids introducing an XSS surface, notable since this codebase has no prior markdown-rendering precedent to follow), actively maintained, and small enough not to be a meaningful bundle-size concern for a docs page that isn't on the app's critical path. This is a content-rendering utility, not a framework or state-management choice, so it doesn't trigger the constitution's "stack is fixed" clause (that clause targets Laravel/React/Tailwind/Sanctum-level decisions).

**Alternatives considered**:
- *Pre-render markdown to static HTML at build time (e.g., a Vite plugin or a small Node build script)*: viable and slightly faster at runtime, but adds a build-pipeline step for a marginal gain on 7 short documents; deferred as a possible later optimization, not needed for Phase 1.
- *`dangerouslySetInnerHTML` with a manual markdown-to-HTML function*: rejected — reintroduces exactly the injection risk `react-markdown`'s AST-based rendering avoids, for content that (today) is developer-authored but there's no reason to accept that risk for zero benefit.

## Decision 3: Resolving a Client user's own membership role

**Decision**: Add one method, `ProjectClientAccess::highestClientRole(User $user): ?string`, that looks up the user's approved `ProjectMembership` rows and returns the highest-access role among `client_admin`, `client_contributor`, `client_viewer` (in that priority order), or `null` if the user has no approved membership. Expose the result as a new `client_role` field on the existing `AuthController::curatedUser()` payload (i.e., on `GET /api/me`) — present (a role string) for Client-role users with an approved membership, `null` otherwise. The frontend already fetches `/api/me` on every session load, so this adds zero new network requests.

**Rationale**: The obvious alternative — reusing `ProjectMembershipController::index()` — is gated by `canManageMemberships()`, which an ordinary `client_viewer` or `client_contributor` does not satisfy by design (that endpoint is for people managing *other* members, not reading their own role). Building this feature on top of it would require either loosening that endpoint's access rule (a real, unrelated permission change this feature has no business making) or having the frontend infer the role by fetching all memberships and filtering client-side (impossible without the very access the user doesn't have). A narrow, purpose-built read is the smaller, more defensible change, and mirrors Constitution Principle II's existing pattern of curated, purpose-fit resource payloads rather than one over-broad endpoint reused everywhere.

**Alternatives considered**:
- *New dedicated endpoint, e.g. `GET /api/me/client-role`*: functionally equivalent, rejected only in favor of the simpler enrichment because the frontend already calls `/api/me` on load — a second endpoint would be an extra request for information that's already colocated with "who am I."
- *Loosen `ProjectMembershipController::canManageMemberships()` to allow self-reads*: rejected — conflates "can see my own membership state" with "can manage everyone's," which is a real access-control boundary this feature must not blur (see spec Assumption on Preview-mode/effective-role consistency, and Constitution Principle I).
- *Compute the role client-side from data already on the page*: rejected — no existing frontend call gives an ordinary Client user visibility into their own membership row today; there's nothing to compute from without a server change.

## Open Questions Resolved

None remain — the spec shipped with zero `[NEEDS CLARIFICATION]` markers, and the three decisions above cover every technical unknown identified while filling in the plan's Technical Context.
