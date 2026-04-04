import { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    return window.localStorage.getItem('apiToken') || null
  })

  const login = useCallback((newToken) => {
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

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
