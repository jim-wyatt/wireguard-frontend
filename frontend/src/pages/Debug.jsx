import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { Alert, Box, Button, LinearProgress, Paper, Typography } from '@mui/material'
import { clientsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import '@xterm/xterm/css/xterm.css'

function Debug() {
  const { isAuthenticated } = useAuth()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const terminalHostRef = useRef(null)
  const terminalRef = useRef(null)
  const fitAddonRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }
    let active = true

    const load = async () => {
      setError('')
      setLoading(true)
      try {
        const response = await clientsApi.getBtopSnapshot()
        if (active) setPayload(response.data)
      } catch (err) {
        if (active) setError(err?.response?.data?.detail || err?.message || 'Failed to fetch snapshot')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    const timer = setInterval(load, 5000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [isAuthenticated])

  const ansiText = payload?.ansi_text || ''
  const captureLabel = payload?.captured_at ? new Date(payload.captured_at).toLocaleString() : '-'
  const viewport = payload?.viewport || { columns: '-', rows: '-' }

  useEffect(() => {
    if (!isAuthenticated || !terminalHostRef.current || terminalRef.current) return

    const term = new Terminal({
      disableStdin: true,
      cursorBlink: false,
      convertEol: false,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 11,
      rows: Number(viewport?.rows) || 52,
      cols: Number(viewport?.columns) || 214,
      theme: {
        background: '#030704',
        foreground: '#b8ffca',
        cursor: '#b8ffca',
      },
      allowProposedApi: false,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalHostRef.current)
    fitAddon.fit()

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    const onResize = () => {
      fitAddon.fit()
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [isAuthenticated, viewport?.columns, viewport?.rows])

  useEffect(() => {
    const term = terminalRef.current
    if (!term) return

    term.reset()
    term.clear()
    if (ansiText) {
      term.write(ansiText)
    } else if (loading) {
      term.writeln('Loading btop snapshot...')
    } else {
      term.writeln('No snapshot data received.')
    }
  }, [ansiText, loading])

  if (!isAuthenticated) {
    return (
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>SYSTEM CONSOLE</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Authentication required to access the debug console.</Typography>
        <Button variant="outlined" href="/login">Authenticate</Button>
      </Box>
    )
  }

  return (
    <Box>
      {loading && <LinearProgress sx={{ mb: 1 }} />}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      <Paper
        sx={{
          p: 1,
          borderRadius: 1,
          overflow: 'hidden',
          width: '100%',
          maxWidth: '100%',
        }}
      >
        <Typography variant="caption" sx={{ display: 'block', mb: 0.75, fontFamily: 'monospace' }}>
          SYSTEM CONSOLE // btop snapshot | {viewport.columns}×{viewport.rows} | {captureLabel} | refresh 5s
        </Typography>

        <Box
          sx={{
            bgcolor: '#030704',
            border: '1px solid rgba(49, 242, 125, 0.24)',
            borderRadius: 1,
            p: 0.5,
            overflow: 'auto',
            maxHeight: 'calc(100vh - 185px)',
          }}
        >
          <Box
            ref={terminalHostRef}
            sx={{
              width: '100%',
              minWidth: 'max-content',
              '.xterm': { padding: 0, margin: 0 },
              '.xterm-viewport': { overflowY: 'hidden !important' },
              '.xterm-screen canvas': { imageRendering: 'pixelated' },
            }}
          />
        </Box>
      </Paper>
    </Box>
  )
}

export default Debug
