# Contract: Authentication API (existing, unchanged by this feature)

Source of truth: `backend/routes/api.php` and
`backend/app/Http/Controllers/AuthController.php`. Documented here for
implementers wiring the frontend to it — this feature does not modify any of
these endpoints.

## `POST /api/login`

- **Auth**: public (requires CSRF cookie fetched first via Sanctum's
  standard `GET /sanctum/csrf-cookie` flow)
- **Body**: `{ "email": string, "password": string }`
- **Success (200)**: `{ "user": { id, name, email, role, department } }`,
  session cookie set
- **Failure (422)**: Laravel validation error, `{ "message": ..., "errors": { "email": ["The provided credentials are incorrect."] } }`

## `GET /api/me`

- **Auth**: `auth:sanctum` (session cookie required)
- **Success (200)**: `{ "user": { id, name, email, role, department } }`
- **Failure (401)**: unauthenticated

## `POST /api/logout`

- **Auth**: `auth:sanctum`
- **Success (204)**: no content, session invalidated

## ⚠ Known mismatch to fix as part of this feature

`frontend/src/lib/auth.js` defines:

```js
export const fetchMe = () => api.get('/user')
```

but the backend route is `GET /api/me`, not `GET /api/user` — there is no
`/api/user` route registered. This has gone unnoticed because
`AuthContext` (the only caller of `fetchMe`) is never mounted today. Fixing
this call to hit `/me` is a required task for this feature, not optional
cleanup — without it, `AuthContext`'s hydration on mount will always 404 and
every user will appear signed out.

Additionally, `lib/auth.js` also expects a top-level user object per its own
comment (`GET /user → { id, name, ... }`) but the backend wraps it in
`{ "user": {...} }` per `AuthController::curatedUser()`'s call sites
(`response()->json(['user' => ...])`). Confirm `AuthContext.jsx`'s existing
`res.data.user` usage — it should already unwrap correctly (source: `.then(res => setUser(res.data))` in `AuthContext.jsx` reads `res.data`, which after the endpoint fix will be `{ user: {...} }`, not the user object directly). **This needs correcting too**: either `fetchMe`/`login`/`logout` in `lib/auth.js` should return `response.data.user`, or `AuthContext` should read `res.data.user` instead of `res.data`. Pick one consistently — implementation detail for `tasks.md`.
