import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { useAuth } from '../context/AuthContext'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated } = useAuth()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const targetPath = location.state?.from || '/dashboard'

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
    } catch (err) {
      setError(`Connection error: ${err.message}`)
      setLoading(false)
    }
  }

  const infoCards = useMemo(() => [
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
          <DenseCards>
            <Box sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
              <Stack spacing={1.2}>
                <Typography variant="subtitle2" sx={{ letterSpacing: 0.6 }}>ENTER ACCESS TOKEN</Typography>
                <TextField
                  size="small"
                  fullWidth
                  type="password"
                  label="Bearer Token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !loading) {
                      e.preventDefault()
                      validateAndLogin()
                    }
                  }}
                />
                {error ? <Alert severity="error">{error}</Alert> : null}
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" onClick={validateAndLogin} disabled={loading || !token.trim()}>
                    {loading ? 'Validating...' : 'Validate And Enter'}
                  </Button>
                  <Button variant="outlined" onClick={() => setToken('')} disabled={loading || !token}>
                    Clear
                  </Button>
                </Stack>
              </Stack>
            </Box>

            <DenseMetricCard
              title="TOKEN SNAPSHOT"
              value={tokenSummary}
              hint="preview is masked for safety"
              status={token ? 'green' : 'amber'}
              importance="Quick confidence check before submitting credentials."
            />
            <DenseMetricCard
              title="ENTRY TARGET"
              value={targetPath}
              hint="redirect destination after successful auth"
              status="green"
              importance="Returns operator to the originally requested route."
            />
            <DenseMetricCard
              title="AUTH STATE"
              value={loading ? 'VALIDATING' : error ? 'REJECTED' : token ? 'READY' : 'IDLE'}
              hint={loading ? 'verifying token against protected endpoint' : error || 'provide token and submit'}
              status={loading ? 'amber' : error ? 'red' : token ? 'green' : 'amber'}
              importance="Clear state transitions for a predictable login experience."
            />
          </DenseCards>
        </DenseSection>

        <DenseSection title="Operator Notes" subtitle="login behavior and security intent" colSpan={1} rowSpan={3}>
          <DenseCards>
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
