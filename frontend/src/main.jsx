import React, { useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { UiProvider, useUi } from './context/UiContext'

function buildTheme(matrixMode) {
  if (!matrixMode) {
    return createTheme({
      palette: {
        mode: 'light',
        primary: {
          main: '#1976d2',
        },
        secondary: {
          main: '#dc004e',
        },
      },
    })
  }

  return createTheme({
    palette: {
      mode: 'dark',
      primary: {
        main: '#00ff66',
      },
      secondary: {
        main: '#00cc52',
      },
      background: {
        default: '#020402',
        paper: '#081208',
      },
      text: {
        primary: '#b8ffca',
        secondary: '#6ebd84',
      },
    },
    typography: {
      fontFamily: '"Fira Code", "JetBrains Mono", "Source Code Pro", monospace',
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundImage: 'radial-gradient(circle at 20% 10%, rgba(0,255,102,0.10), transparent 30%), radial-gradient(circle at 80% 90%, rgba(0,255,102,0.08), transparent 30%)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            border: '1px solid rgba(0, 255, 102, 0.15)',
            boxShadow: '0 0 18px rgba(0, 255, 102, 0.08)',
          },
        },
      },
    },
  })
}

function ThemedApp() {
  const { matrixMode } = useUi()
  const theme = useMemo(() => buildTheme(matrixMode), [matrixMode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <UiProvider>
        <ThemedApp />
      </UiProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
