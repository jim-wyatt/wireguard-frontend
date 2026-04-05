import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box } from '@mui/material'
import { useAuth } from '../context/AuthContext'
import { DenseCards, DenseGrid, DenseMetricCard, DenseSection } from '../components/dense/CyberUi'

function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const maskedToken = token
    ? `${token.slice(0, 6)}...${token.slice(-4)}`
    : 'not set'

  const openTokenPrompt = () => {
    const entered = window.prompt('Paste API token')
    if (entered === null) return
    setToken(String(entered).trim())
    setError('')
  }

  const validateAndLogin = async () => {
    setError('')
    setLoading(true)

    try {
      if (!token.trim()) {
        setError('API token is required')
        setLoading(false)
        return
      }

      const response = await fetch('/api/clients?limit=1', {
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
        },
      })

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setError('Invalid API token')
        } else if (response.status === 429) {
          setError('Too many failed login attempts. Please wait a few minutes and try again.')
        } else {
          setError(`API Error: ${response.statusText}`)
        }
        setLoading(false)
        return
      }

      login(token.trim())
      navigate('/dashboard')
    } catch (err) {
      setError(`Connection error: ${err.message}`)
      setLoading(false)
    }
  }

  const infoCards = [
    {
      key: 'note-token',
      title: 'TOKEN SOURCE',
      value: 'OPERATOR/ANALYST',
      hint: 'use a valid administrator-issued bearer token',
      status: 'green',
      importance: 'Identity assurance starts with controlled token distribution.',
    },
    {
      key: 'note-rate-limit',
      title: 'LOGIN THROTTLE',
      value: 'ACTIVE',
      hint: 'failed attempts are rate-limited with temporary lockout',
      status: 'amber',
      importance: 'Rate controls reduce brute-force risk during credential abuse.',
    },
    {
      key: 'note-storage',
      title: 'SESSION STORAGE',
      value: 'LOCAL BROWSER',
      hint: 'token persists for authorized API requests in this client',
      status: 'amber',
      importance: 'Session persistence balances usability with endpoint hygiene needs.',
    },
    {
      key: 'note-purpose',
      title: 'MISSION CONTEXT',
      value: 'TRUSTED EXCHANGE HUB',
      hint: 'monitored, validated, and safe collaboration at connection level',
      status: 'green',
      importance: 'Operational goal is secure information exchange across teams.',
    },
  ]

  if (loading) {
    infoCards.unshift({
      key: 'auth-state-loading',
      title: 'AUTH STATE',
      value: 'VALIDATING',
      hint: 'verifying token against protected endpoint',
      status: 'amber',
      importance: 'Authentication handshake in progress.',
    })
  }

  if (error) {
    infoCards.unshift({
      key: 'auth-state-error',
      title: 'AUTH STATE',
      value: 'REJECTED',
      hint: error,
      status: 'red',
      importance: 'Credential validation failed; operator action required.',
    })
  }

  return (
    <Box sx={{ px: 1.5, pt: 1.5, pb: 3, minHeight: '100vh' }}>
      <DenseGrid>
        <DenseSection title="Credential Gate" subtitle="supply API bearer token" colSpan={2} rowSpan={3}>
          <DenseCards>
            <DenseMetricCard
              title="TOKEN SNAPSHOT"
              value={maskedToken}
              hint="token preview is masked for operator safety"
              status={token ? 'green' : 'amber'}
              importance="Confirms whether a credential is currently staged for validation."
            />
            <Box onClick={openTokenPrompt} sx={{ cursor: 'pointer' }}>
              <DenseMetricCard
                title="CONTROL :: SET TOKEN"
                value="EDIT"
                hint="click to paste or replace bearer token"
                status="amber"
                importance="Token input remains inside card interaction to preserve uniform UI language."
              />
            </Box>
            <Box onClick={() => setToken('')} sx={{ cursor: 'pointer' }}>
              <DenseMetricCard
                title="CONTROL :: CLEAR TOKEN"
                value="RESET"
                hint="click to clear staged credential"
                status={token ? 'amber' : 'green'}
                importance="Allows quick cleanup before screen-sharing or handoff."
              />
            </Box>
            <Box onClick={validateAndLogin} sx={{ cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              <DenseMetricCard
                title="CONTROL :: VALIDATE + ENTER"
                value={loading ? 'VALIDATING' : 'LOGIN'}
                hint="click to verify token against protected endpoint"
                status={loading ? 'amber' : token ? 'green' : 'amber'}
                importance="Authentication is executed as a card action to keep page structure consistent."
              />
            </Box>
          </DenseCards>
        </DenseSection>

        <DenseSection title="Operator Notes" subtitle="auth guidance as datapoint cards" colSpan={1} rowSpan={3}>
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
