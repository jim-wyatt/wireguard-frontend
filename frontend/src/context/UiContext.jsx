import { createContext, useContext, useMemo, useState } from 'react'

const UiContext = createContext()

const MATRIX_MODE_KEY = 'uiMatrixMode'
const SIDEBAR_VISIBLE_KEY = 'uiSidebarVisible'

function readBool(key, fallback) {
  const value = window.localStorage.getItem(key)
  if (value === null) return fallback
  return value === 'true'
}

export function UiProvider({ children }) {
  const [matrixMode, setMatrixMode] = useState(() => readBool(MATRIX_MODE_KEY, false))
  const [sidebarVisible, setSidebarVisible] = useState(() => readBool(SIDEBAR_VISIBLE_KEY, true))

  const toggleMatrixMode = () => {
    setMatrixMode((prev) => {
      const next = !prev
      window.localStorage.setItem(MATRIX_MODE_KEY, String(next))
      return next
    })
  }

  const toggleSidebarVisible = () => {
    setSidebarVisible((prev) => {
      const next = !prev
      window.localStorage.setItem(SIDEBAR_VISIBLE_KEY, String(next))
      return next
    })
  }

  const value = useMemo(() => ({
    matrixMode,
    sidebarVisible,
    toggleMatrixMode,
    toggleSidebarVisible,
  }), [matrixMode, sidebarVisible])

  return (
    <UiContext.Provider value={value}>
      {children}
    </UiContext.Provider>
  )
}

export function useUi() {
  const context = useContext(UiContext)
  if (!context) {
    throw new Error('useUi must be used within UiProvider')
  }
  return context
}
