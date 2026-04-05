import AnsiToHtml from 'ansi-to-html'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, LinearProgress, Paper, Typography } from '@mui/material'
import { clientsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

const converter = new AnsiToHtml({
  fg: '#b8ffca',
  bg: '#030704',
  newline: true,
  escapeXML: true,
  stream: false,
})

function Debug() {
  const { isAuthenticated } = useAuth()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const ansiHtml = useMemo(() => {
    if (!ansiText) return ''
    try {
      return converter.toHtml(ansiText)
    } catch {
      return ansiText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  }, [ansiText])

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
            p: 1,
            overflow: 'auto',
            maxHeight: 'calc(100vh - 185px)',
          }}
        >
          {ansiHtml ? (
            <Box
              component="div"
              dangerouslySetInnerHTML={{ __html: ansiHtml }}
              sx={{
                m: 0,
                fontFamily: 'monospace',
                fontSize: { xs: '0.6rem', sm: '0.68rem' },
                lineHeight: 1.12,
                whiteSpace: 'pre',
                minWidth: 'max-content',
                '& span': { fontFamily: 'inherit' },
              }}
            />
          ) : (
            <Typography
              component="pre"
              sx={{
                m: 0,
                fontFamily: 'monospace',
                fontSize: { xs: '0.65rem', sm: '0.72rem' },
                lineHeight: 1.15,
                color: '#b8ffca',
                whiteSpace: 'pre',
                minWidth: 'max-content',
              }}
            >
              {loading ? 'Loading btop snapshot...' : 'No snapshot data received.'}
            </Typography>
          )}
        </Box>
      </Paper>
    </Box>
  )
}

export default Debug
