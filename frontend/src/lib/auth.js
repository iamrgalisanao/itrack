import api from './api'

/**
 * POST /login  →  { email, password }
 *
 * Laravel Sanctum's stateful SPA auth requires a CSRF cookie to exist before
 * the first state-changing request in a session — otherwise this POST fails
 * with 419 (CSRF token mismatch). Fetching /sanctum/csrf-cookie first sets
 * that cookie; axios then attaches it automatically on the login POST.
 *
 * Returns the curated user object (unwraps the `{ user: {...} }` envelope).
 */
export const login = async (email, password) => {
  await api.get('/sanctum/csrf-cookie', { baseURL: '/' })
  const response = await api.post('/login', { email, password })
  return response.data.user
}

/**
 * POST /logout  →  {}
 * Destroys the Sanctum session.
 */
export const logout = async () => {
  await api.post('/logout')
}

/**
 * GET /me  →  { user: { id, name, email, role, department } }
 * Returns the currently authenticated user (requires valid session cookie).
 * Unwraps the `{ user: {...} }` envelope to match login()'s return shape.
 */
export const fetchMe = async () => {
  const response = await api.get('/me')
  return response.data.user
}
