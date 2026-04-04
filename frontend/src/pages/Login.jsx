import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Container,
  Paper,
  TextField,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material'
import VpnKeyIcon from '@mui/icons-material/VpnKey'
import { useAuth } from '../context/AuthContext'

function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Validate token is not empty
      if (!token.trim()) {
        setError('API token is required')
        setLoading(false)
        return
      }

      // Validate token against a protected endpoint
      const response = await fetch('/api/clients?limit=1', {
        headers: {
          'Authorization': `Bearer ${token.trim()}`
        }
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

      // Token is valid, save it and navigate
      login(token.trim())
      navigate('/dashboard')
    } catch (err) {
      setError(`Connection error: ${err.message}`)
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: '#f5f5f5',
      }}
    >
      <Container maxWidth="sm">
        <Paper sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, justifyContent: 'center' }}>
            <VpnKeyIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
            <Typography variant="h5" component="h1">
              WireGuard Manager
            </Typography>
          </Box>

          <Typography color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
            Enter your API token to access the dashboard
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="API Token"
              type="password"
              fullWidth
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your API token"
              disabled={loading}
              autoFocus
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Login'}
            </Button>
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 3, display: 'block', textAlign: 'center' }}>
            Ask your administrator for your API token
          </Typography>
        </Paper>
      </Container>
    </Box>
  )
}

export default Login
