import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { useAuth } from '../context/AuthContext'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'
import type { RagStatus } from '../components/dense/CyberUi'

interface CardItem {
  key: string
  title: string
  value: string
  hint: string
  status: RagStatus
  importance: string
}

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated } = useAuth()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const targetPath = (location.state as { from?: string })?.from || '/dashboard'

  useEffect(() => {
    if (isAuthenticated) {
      navigate(targetPath, { replace: true })
    }
  }, [isAuthenticated, navigate, targetPath])

  const validateAndLogin = async () => {
    setError('')
    setLoading(true)

    try {
      if (!token.trim()) {
        setError('API token is required')
        setLoading(false)
        return
      }

      const response = await fetch('/api/nodes?limit=1', {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
        },
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('Invalid API token')
        } else if (response.status === 429) {
          setError('Too many failed login attempts. Please wait a few minutes and try again.')
        } else {
          setError(`API error: ${response.status} ${response.statusText}`)
        }
        setLoading(false)
        return
      }

      login(token.trim())
      navigate(targetPath, { replace: true })
    } catch (err: unknown) {
      const e = err as { message?: string }
      setError(`Connection error: ${e.message}`)
      setLoading(false)
    }
  }

  const infoCards = useMemo<CardItem[]>(() => [
    {
      key: 'auth-model',
      title: 'ACCESS MODEL',
      value: 'BEARER TOKEN',
      hint: 'paste token issued by platform operators',
      status: 'green',
      importance: 'This hub requires token auth for protected routes and APIs.',
    },
    {
      key: 'auth-check',
      title: 'VALIDATION',
      value: 'LIVE API CHECK',
      hint: 'token is verified against /api/nodes before session starts',
      status: 'amber',
      importance: 'Prevents saving unusable credentials in browser state.',
    },
    {
      key: 'auth-scope',
      title: 'SESSION SCOPE',
      value: 'LOCAL BROWSER',
      hint: 'token persists until logout',
      status: 'amber',
      importance: 'Use Logout after operations to clear local session context.',
    },
    {
      key: 'auth-purpose',
      title: 'MISSION',
      value: 'TRUSTED EXCHANGE HUB',
      hint: 'controlled access to nodes, logs, trust and operations telemetry',
      status: 'green',
      importance: 'Authentication keeps the operator HUD trustworthy and auditable.',
    },
  ], [])

  const tokenSummary = token ? `${token.slice(0, 8)}...${token.slice(-4)}` : 'No token entered'

  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 3, minHeight: '100vh' }}>
      <DenseGrid>
        <DenseSection title="Credential Gate" subtitle="authenticate to enter NEXUS operator console" colSpan={2} rowSpan={3}>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="API Token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && validateAndLogin()}
              fullWidth
              autoFocus
              size="small"
            />
            <Typography variant="caption" color="text.secondary">
              preview: {tokenSummary}
            </Typography>
            <Button
              variant="contained"
              onClick={validateAndLogin}
              disabled={loading || !token.trim()}
              fullWidth
            >
              {loading ? 'Verifying...' : 'Authenticate'}
            </Button>
          </Stack>
        </DenseSection>

        <DenseSection title="Auth Context" subtitle="session model and scope" colSpan={1} rowSpan={3}>
          <DenseCards cols={1}>
            {infoCards.map((card) => (
              <DenseMetricCard
                key={card.key}
                title={card.title}
                value={card.value}
                hint={card.hint}
                status={card.status}
                importance={card.importance}
              />
            ))}
          </DenseCards>
        </DenseSection>
      </DenseGrid>
    </Box>
  )
}

export default Login
