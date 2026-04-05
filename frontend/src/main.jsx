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
        mode: 'dark',
        primary: {
          main: '#31f27d',
        },
        secondary: {
          main: '#19c7ff',
        },
        background: {
          default: '#070b0d',
          paper: '#0d1518',
        },
        text: {
          primary: '#ddffe9',
          secondary: '#8fb7a0',
        },
      },
      shape: {
        borderRadius: 4,
      },
      typography: {
        fontFamily: '"VT323", "Share Tech Mono", "JetBrains Mono", monospace',
        h4: {
          letterSpacing: 1.2,
        },
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            html: {
              width: '100%',
              maxWidth: '100%',
              overflowX: 'clip',
            },
            body: {
              width: '100%',
              maxWidth: '100%',
              overflowX: 'clip',
              backgroundImage: [
                'linear-gradient(rgba(49,242,125,0.035) 1px, transparent 1px)',
                'linear-gradient(90deg, rgba(49,242,125,0.03) 1px, transparent 1px)',
                'radial-gradient(circle at 15% 20%, rgba(25,199,255,0.08), transparent 30%)',
              ].join(','),
              backgroundSize: '24px 24px, 24px 24px, 100% 100%',
            },
            '#root': {
              width: '100%',
              maxWidth: '100%',
              overflowX: 'clip',
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              border: '1px solid rgba(49, 242, 125, 0.22)',
              boxShadow: 'inset 0 0 0 1px rgba(25,199,255,0.08), 0 0 12px rgba(49,242,125,0.06)',
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              letterSpacing: 0.4,
            },
          },
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
    shape: {
      borderRadius: 4,
    },
    typography: {
      fontFamily: '"VT323", "Share Tech Mono", "Fira Code", "JetBrains Mono", monospace',
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: {
            width: '100%',
            maxWidth: '100%',
            overflowX: 'clip',
          },
          body: {
            width: '100%',
            maxWidth: '100%',
            overflowX: 'clip',
            backgroundImage: [
              'linear-gradient(rgba(0,255,102,0.045) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(0,255,102,0.03) 1px, transparent 1px)',
              'radial-gradient(circle at 20% 10%, rgba(0,255,102,0.10), transparent 30%)',
              'radial-gradient(circle at 80% 90%, rgba(0,255,102,0.08), transparent 30%)',
            ].join(','),
            backgroundSize: '24px 24px, 24px 24px, 100% 100%, 100% 100%',
          },
          '#root': {
            width: '100%',
            maxWidth: '100%',
            overflowX: 'clip',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            border: '1px solid rgba(0, 255, 102, 0.2)',
            boxShadow: 'inset 0 0 0 1px rgba(0,255,102,0.08), 0 0 18px rgba(0, 255, 102, 0.08)',
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
