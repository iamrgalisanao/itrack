import { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, logout as apiLogout, fetchMe } from '@/lib/auth'
import { setUnauthorizedHandler } from '@/lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Any 401 from any request (session expired/invalidated mid-use) ends the
  // session the same way explicit sign-out does; RequireAuth redirects once
  // `user` is null.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  // Hydrate from session on mount
  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const loggedInUser = await apiLogin(email, password)
    setUser(loggedInUser)
  }

  const logout = async () => {
    await apiLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its AuthProvider, standard React context convention
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}