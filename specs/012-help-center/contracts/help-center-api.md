# Contract: In-App Help Center

Source of truth once implemented: `backend/app/Http/Controllers/AuthController.php` (modified — `curatedUser()` only), `backend/app/Http/Resources/PreviewSessionResource.php` (modified — `target` array gains one key), `backend/app/Support/ProjectClientAccess.php` (modified — new `highestClientRole()` method only). No new route is added.

## `GET /api/me` and `POST /api/login` — `curatedUser()` gains one field

Both endpoints already exist and already return `{ "user": { ...curatedUser() } }`. This feature adds exactly one key to that object:

```json
{
  "user": {
    "id": 5,
    "name": "Client",
    "email": "client@itrack.test",
    "role": "Client",
    "department": null,
    "client_role": "client_admin"
  }
}
```

- **`client_role`**: `string | null`. Present in every response (never omitted). `null` for any user whose `role` is not `Client`, and for a `Client`-role user with no approved `ProjectMembership` (FR-004's default case — the frontend treats `null` the same as `client_viewer` for guide selection, per `data-model.md`). One of `client_admin` / `client_contributor` / `client_viewer` otherwise, computed by `ProjectClientAccess::highestClientRole($user)` (FR-003's tiebreak: highest access wins across multiple approved memberships).
- **No new auth gate**: this field rides on the same `auth:sanctum`-protected responses these two endpoints already return. It requires no new middleware and changes no existing field's shape or presence.
- **No mutation**: computing `client_role` is a read of existing `project_memberships` rows — no `AuditLogger` call is warranted (Constitution Principle IV doesn't apply; nothing sensitive is being changed).

## `POST /api/preview-sessions` — `PreviewSessionResource`'s `target` also gains the field

**This is a second, separate change — not automatic from the `/api/me` change above.** `useEffectiveUser()` does not read `curatedUser()`'s payload while a Preview session is active; it reads the `target` object this endpoint returns instead (captured once into `sessionStorage` at preview start, per `PreviewSessionResource`'s existing docblock). Verified against the current implementation: `target` only carries `id`/`name`/`role`/`department` today, so without this second change `client_role` would be `undefined` for the entire duration of a Preview session, and Help Center would silently default to the Client Viewer guide any time an Admin previews a Client-role user — regardless of that user's real membership tier.

```json
{
  "token": "…",
  "target": {
    "id": 5,
    "name": "Client",
    "role": "Client",
    "department": null,
    "client_role": "client_admin"
  },
  "expires_at": "…"
}
```

- **`client_role`**: same type, same values, same computation as `curatedUser()`'s field above — `ProjectClientAccess::highestClientRole($target)`, called with the previewed user, not the previewing Admin.
- **No new auth gate**: rides on this endpoint's existing Admin-only `store` authorization; unchanged.
- **No mutation**: same as above — a read, not a write.

## Preview mode (FR-006), corrected

`useEffectiveUser()` switches between two different backend-sourced objects depending on whether a Preview session is active — the real user from `curatedUser()`, or the previewed `target` from `PreviewSessionResource`. Both MUST carry `client_role` for FR-006 to hold for every role, including Client. Once both changes above ship, `HelpCenter.jsx` needs no Preview-specific branching of its own: it always reads `{ role, client_role }` off whichever object `useEffectiveUser()` currently returns.

## No new backend route for guide content

Guide markdown and images are static frontend assets (see `research.md` Decision 1) — the backend has no route, controller, or resource for "fetch a guide." `GET /api/me`'s enriched response is the *only* backend contract this feature touches.

## Frontend call sites

`frontend/src/context/AuthContext.jsx` (or wherever the existing `/api/me` response is already consumed into the app's user state — no new fetch call is added) gains `client_role` on its user object, read the same way `role`/`department` already are.

`frontend/src/pages/HelpCenter.jsx` (new) contains the resolution table from `data-model.md` as a pure function — e.g. `resolveGuide(effectiveUser)` — taking `{ role, client_role }` from `useEffectiveUser()` and returning which of the seven bundled markdown modules to render. No network call beyond the `/api/me` the app already makes on load.
