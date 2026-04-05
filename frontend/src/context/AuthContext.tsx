import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface AuthContextValue {
  token: string | null
  isAuthenticated: boolean
  login: (newToken: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return window.localStorage.getItem('apiToken') || null
  })

  const login = useCallback((newToken: string) => {
    window.localStorage.setItem('apiToken', newToken)
    setToken(newToken)
  }, [])

  const logout = useCallback(() => {
    window.localStorage.removeItem('apiToken')
    setToken(null)
  }, [])

  const isAuthenticated = !!token

  return (
    <AuthContext.Provider value={{ token, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
