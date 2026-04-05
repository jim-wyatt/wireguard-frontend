import { createContext, useContext, useMemo, useState, ReactNode } from 'react'

interface UiContextValue {
  matrixMode: boolean
  sidebarVisible: boolean
  toggleMatrixMode: () => void
  toggleSidebarVisible: () => void
}

const UiContext = createContext<UiContextValue | undefined>(undefined)

const MATRIX_MODE_KEY = 'uiMatrixMode'
const SIDEBAR_VISIBLE_KEY = 'uiSidebarVisible'

function readBool(key: string, fallback: boolean): boolean {
  const value = window.localStorage.getItem(key)
  if (value === null) return fallback
  return value === 'true'
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [matrixMode, setMatrixMode] = useState<boolean>(() => readBool(MATRIX_MODE_KEY, true))
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(() => readBool(SIDEBAR_VISIBLE_KEY, true))

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

  const value = useMemo<UiContextValue>(() => ({
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

export function useUi(): UiContextValue {
  const context = useContext(UiContext)
  if (!context) {
    throw new Error('useUi must be used within UiProvider')
  }
  return context
}
